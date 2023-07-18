// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/BaseMath.sol";
import "../Dependencies/SafeMath.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/console.sol";
import "../Interfaces/IOPLToken.sol";
import "../Interfaces/IOPLStaking.sol";
import "../Dependencies/LiquityMath.sol";
import "../Interfaces/IONEUToken.sol";

contract OPLStaking is IOPLStaking, Ownable, CheckContract, BaseMath {
    using SafeMath for uint;

    // --- Data ---
    string public constant NAME = "OPLStaking";

    mapping(address => uint) public stakes;
    uint public totalOPLStaked;

    uint public F_AUT; // Running sum of AUT fees per-OPL-staked
    uint public F_ONEU; // Running sum of OPL fees per-OPL-staked

    // User snapshots of F_AUT and F_ONEU, taken at the point at which their latest deposit was made
    mapping(address => Snapshot) public snapshots;

    struct Snapshot {
        uint F_AUT_Snapshot;
        uint F_ONEU_Snapshot;
    }

    IOPLToken public oplToken;
    IONEUToken public oneuToken;

    address public troveManagerAddress;
    address public borrowerOperationsAddress;
    address public activePoolAddress;

    // --- Events ---

    event OPLTokenAddressSet(address _oplTokenAddress);
    event ONEUTokenAddressSet(address _oneuTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint ONEUGain, uint AUTGain);
    event F_AUTUpdated(uint _F_AUT);
    event F_ONEUUpdated(uint _F_ONEU);
    event TotalOPLStakedUpdated(uint _totalOPLStaked);
    event EtherSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_AUT, uint _F_ONEU);

    // --- Functions ---

    function setAddresses(
        address _oplTokenAddress,
        address _oneuTokenAddress,
        address _troveManagerAddress,
        address _borrowerOperationsAddress,
        address _activePoolAddress
    ) external override onlyOwner {
        checkContract(_oplTokenAddress);
        checkContract(_oneuTokenAddress);
        checkContract(_troveManagerAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);

        oplToken = IOPLToken(_oplTokenAddress);
        oneuToken = IONEUToken(_oneuTokenAddress);
        troveManagerAddress = _troveManagerAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePoolAddress = _activePoolAddress;

        emit OPLTokenAddressSet(_oplTokenAddress);
        emit OPLTokenAddressSet(_oneuTokenAddress);
        emit TroveManagerAddressSet(_troveManagerAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperationsAddress);
        emit ActivePoolAddressSet(_activePoolAddress);

        _renounceOwnership();
    }

    // If caller has a pre-existing stake, send any accumulated AUT and ONEU gains to them.
    function stake(uint _OPLamount) external override {
        _requireNonZeroAmount(_OPLamount);

        uint currentStake = stakes[msg.sender];

        uint AUTGain;
        uint ONEUGain;
        // Grab any accumulated AUT and ONEU gains from the current stake
        if (currentStake != 0) {
            AUTGain = _getPendingAUTGain(msg.sender);
            ONEUGain = _getPendingONEUGain(msg.sender);
        }

        _updateUserSnapshots(msg.sender);

        uint newStake = currentStake.add(_OPLamount);

        // Increase user’s stake and total OPL staked
        stakes[msg.sender] = newStake;
        totalOPLStaked = totalOPLStaked.add(_OPLamount);
        emit TotalOPLStakedUpdated(totalOPLStaked);

        // Transfer OPL from caller to this contract
        oplToken.sendToOPLStaking(msg.sender, _OPLamount);

        emit StakeChanged(msg.sender, newStake);
        emit StakingGainsWithdrawn(msg.sender, ONEUGain, AUTGain);

        // Send accumulated ONEU and AUT gains to the caller
        if (currentStake != 0) {
            oneuToken.transfer(msg.sender, ONEUGain);
            _sendAUTGainToUser(AUTGain);
        }
    }

    // Unstake the OPL and send the it back to the caller, along with their accumulated ONEU & AUT gains.
    // If requested amount > stake, send their entire stake.
    function unstake(uint _OPLamount) external override {
        uint currentStake = stakes[msg.sender];
        _requireUserHasStake(currentStake);

        // Grab any accumulated AUT and ONEU gains from the current stake
        uint AUTGain = _getPendingAUTGain(msg.sender);
        uint ONEUGain = _getPendingONEUGain(msg.sender);

        _updateUserSnapshots(msg.sender);

        if (_OPLamount > 0) {
            uint OPLToWithdraw = LiquityMath._min(_OPLamount, currentStake);

            uint newStake = currentStake.sub(OPLToWithdraw);

            // Decrease user's stake and total OPL staked
            stakes[msg.sender] = newStake;
            totalOPLStaked = totalOPLStaked.sub(OPLToWithdraw);
            emit TotalOPLStakedUpdated(totalOPLStaked);

            // Transfer unstaked OPL to user
            oplToken.transfer(msg.sender, OPLToWithdraw);

            emit StakeChanged(msg.sender, newStake);
        }

        emit StakingGainsWithdrawn(msg.sender, ONEUGain, AUTGain);

        // Send accumulated ONEU and AUT gains to the caller
        oneuToken.transfer(msg.sender, ONEUGain);
        _sendAUTGainToUser(AUTGain);
    }

    // --- Reward-per-unit-staked increase functions. Called by Liquity core contracts ---

    function increaseF_AUT(uint _AUTFee) external override {
        _requireCallerIsTroveManager();
        uint AUTFeePerOPLStaked;

        if (totalOPLStaked > 0) {
            AUTFeePerOPLStaked = _AUTFee.mul(DECIMAL_PRECISION).div(totalOPLStaked);
        }

        F_AUT = F_AUT.add(AUTFeePerOPLStaked);
        emit F_AUTUpdated(F_AUT);
    }

    function increaseF_ONEU(uint _ONEUFee) external override {
        _requireCallerIsBorrowerOperations();
        uint ONEUFeePerOPLStaked;

        if (totalOPLStaked > 0) {
            ONEUFeePerOPLStaked = _ONEUFee.mul(DECIMAL_PRECISION).div(totalOPLStaked);
        }

        F_ONEU = F_ONEU.add(ONEUFeePerOPLStaked);
        emit F_ONEUUpdated(F_ONEU);
    }

    // --- Pending reward functions ---

    function getPendingAUTGain(address _user) external view override returns (uint) {
        return _getPendingAUTGain(_user);
    }

    function _getPendingAUTGain(address _user) internal view returns (uint) {
        uint F_AUT_Snapshot = snapshots[_user].F_AUT_Snapshot;
        uint AUTGain = stakes[_user].mul(F_AUT.sub(F_AUT_Snapshot)).div(DECIMAL_PRECISION);
        return AUTGain;
    }

    function getPendingONEUGain(address _user) external view override returns (uint) {
        return _getPendingONEUGain(_user);
    }

    function _getPendingONEUGain(address _user) internal view returns (uint) {
        uint F_ONEU_Snapshot = snapshots[_user].F_ONEU_Snapshot;
        uint ONEUGain = stakes[_user].mul(F_ONEU.sub(F_ONEU_Snapshot)).div(DECIMAL_PRECISION);
        return ONEUGain;
    }

    // --- Internal helper functions ---

    function _updateUserSnapshots(address _user) internal {
        snapshots[_user].F_AUT_Snapshot = F_AUT;
        snapshots[_user].F_ONEU_Snapshot = F_ONEU;
        emit StakerSnapshotsUpdated(_user, F_AUT, F_ONEU);
    }

    function _sendAUTGainToUser(uint AUTGain) internal {
        emit EtherSent(msg.sender, AUTGain);
        (bool success, ) = msg.sender.call{value: AUTGain}("");
        require(success, "OPLStaking: Failed to send accumulated AUTGain");
    }

    // --- 'require' functions ---

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "OPLStaking: caller is not TroveM");
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(msg.sender == borrowerOperationsAddress, "OPLStaking: caller is not BorrowerOps");
    }

    function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "OPLStaking: caller is not ActivePool");
    }

    function _requireUserHasStake(uint currentStake) internal pure {
        require(currentStake > 0, "OPLStaking: User must have a non-zero stake");
    }

    function _requireNonZeroAmount(uint _amount) internal pure {
        require(_amount > 0, "OPLStaking: Amount must be non-zero");
    }

    receive() external payable {
        _requireCallerIsActivePool();
    }
}
