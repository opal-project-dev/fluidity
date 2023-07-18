// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/BaseMath.sol";
import "../Dependencies/SafeMath.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/console.sol";
import "../Interfaces/ILQTYToken.sol";
import "../Interfaces/ILQTYStaking.sol";
import "../Dependencies/LiquityMath.sol";
import "../Interfaces/ILUSDToken.sol";

contract LQTYStaking is ILQTYStaking, Ownable, CheckContract, BaseMath {
    using SafeMath for uint;

    // --- Data ---
    string public constant NAME = "LQTYStaking";

    mapping(address => uint) public stakes;
    uint public totalLQTYStaked;

    uint public F_AUT; // Running sum of AUT fees per-LQTY-staked
    uint public F_LUSD; // Running sum of LQTY fees per-LQTY-staked

    // User snapshots of F_AUT and F_LUSD, taken at the point at which their latest deposit was made
    mapping(address => Snapshot) public snapshots;

    struct Snapshot {
        uint F_AUT_Snapshot;
        uint F_LUSD_Snapshot;
    }

    ILQTYToken public lqtyToken;
    ILUSDToken public lusdToken;

    address public troveManagerAddress;
    address public borrowerOperationsAddress;
    address public activePoolAddress;

    // --- Events ---

    event LQTYTokenAddressSet(address _lqtyTokenAddress);
    event LUSDTokenAddressSet(address _lusdTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint LUSDGain, uint AUTGain);
    event F_AUTUpdated(uint _F_AUT);
    event F_LUSDUpdated(uint _F_LUSD);
    event TotalLQTYStakedUpdated(uint _totalLQTYStaked);
    event EtherSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_AUT, uint _F_LUSD);

    // --- Functions ---

    function setAddresses(
        address _lqtyTokenAddress,
        address _lusdTokenAddress,
        address _troveManagerAddress,
        address _borrowerOperationsAddress,
        address _activePoolAddress
    ) external override onlyOwner {
        checkContract(_lqtyTokenAddress);
        checkContract(_lusdTokenAddress);
        checkContract(_troveManagerAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);

        lqtyToken = ILQTYToken(_lqtyTokenAddress);
        lusdToken = ILUSDToken(_lusdTokenAddress);
        troveManagerAddress = _troveManagerAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePoolAddress = _activePoolAddress;

        emit LQTYTokenAddressSet(_lqtyTokenAddress);
        emit LQTYTokenAddressSet(_lusdTokenAddress);
        emit TroveManagerAddressSet(_troveManagerAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperationsAddress);
        emit ActivePoolAddressSet(_activePoolAddress);

        _renounceOwnership();
    }

    // If caller has a pre-existing stake, send any accumulated AUT and LUSD gains to them.
    function stake(uint _LQTYamount) external override {
        _requireNonZeroAmount(_LQTYamount);

        uint currentStake = stakes[msg.sender];

        uint AUTGain;
        uint LUSDGain;
        // Grab any accumulated AUT and LUSD gains from the current stake
        if (currentStake != 0) {
            AUTGain = _getPendingAUTGain(msg.sender);
            LUSDGain = _getPendingLUSDGain(msg.sender);
        }

        _updateUserSnapshots(msg.sender);

        uint newStake = currentStake.add(_LQTYamount);

        // Increase user’s stake and total LQTY staked
        stakes[msg.sender] = newStake;
        totalLQTYStaked = totalLQTYStaked.add(_LQTYamount);
        emit TotalLQTYStakedUpdated(totalLQTYStaked);

        // Transfer LQTY from caller to this contract
        lqtyToken.sendToLQTYStaking(msg.sender, _LQTYamount);

        emit StakeChanged(msg.sender, newStake);
        emit StakingGainsWithdrawn(msg.sender, LUSDGain, AUTGain);

        // Send accumulated LUSD and AUT gains to the caller
        if (currentStake != 0) {
            lusdToken.transfer(msg.sender, LUSDGain);
            _sendAUTGainToUser(AUTGain);
        }
    }

    // Unstake the LQTY and send the it back to the caller, along with their accumulated LUSD & AUT gains.
    // If requested amount > stake, send their entire stake.
    function unstake(uint _LQTYamount) external override {
        uint currentStake = stakes[msg.sender];
        _requireUserHasStake(currentStake);

        // Grab any accumulated AUT and LUSD gains from the current stake
        uint AUTGain = _getPendingAUTGain(msg.sender);
        uint LUSDGain = _getPendingLUSDGain(msg.sender);

        _updateUserSnapshots(msg.sender);

        if (_LQTYamount > 0) {
            uint LQTYToWithdraw = LiquityMath._min(_LQTYamount, currentStake);

            uint newStake = currentStake.sub(LQTYToWithdraw);

            // Decrease user's stake and total LQTY staked
            stakes[msg.sender] = newStake;
            totalLQTYStaked = totalLQTYStaked.sub(LQTYToWithdraw);
            emit TotalLQTYStakedUpdated(totalLQTYStaked);

            // Transfer unstaked LQTY to user
            lqtyToken.transfer(msg.sender, LQTYToWithdraw);

            emit StakeChanged(msg.sender, newStake);
        }

        emit StakingGainsWithdrawn(msg.sender, LUSDGain, AUTGain);

        // Send accumulated LUSD and AUT gains to the caller
        lusdToken.transfer(msg.sender, LUSDGain);
        _sendAUTGainToUser(AUTGain);
    }

    // --- Reward-per-unit-staked increase functions. Called by Liquity core contracts ---

    function increaseF_AUT(uint _AUTFee) external override {
        _requireCallerIsTroveManager();
        uint AUTFeePerLQTYStaked;

        if (totalLQTYStaked > 0) {
            AUTFeePerLQTYStaked = _AUTFee.mul(DECIMAL_PRECISION).div(totalLQTYStaked);
        }

        F_AUT = F_AUT.add(AUTFeePerLQTYStaked);
        emit F_AUTUpdated(F_AUT);
    }

    function increaseF_LUSD(uint _LUSDFee) external override {
        _requireCallerIsBorrowerOperations();
        uint LUSDFeePerLQTYStaked;

        if (totalLQTYStaked > 0) {
            LUSDFeePerLQTYStaked = _LUSDFee.mul(DECIMAL_PRECISION).div(totalLQTYStaked);
        }

        F_LUSD = F_LUSD.add(LUSDFeePerLQTYStaked);
        emit F_LUSDUpdated(F_LUSD);
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

    function getPendingLUSDGain(address _user) external view override returns (uint) {
        return _getPendingLUSDGain(_user);
    }

    function _getPendingLUSDGain(address _user) internal view returns (uint) {
        uint F_LUSD_Snapshot = snapshots[_user].F_LUSD_Snapshot;
        uint LUSDGain = stakes[_user].mul(F_LUSD.sub(F_LUSD_Snapshot)).div(DECIMAL_PRECISION);
        return LUSDGain;
    }

    // --- Internal helper functions ---

    function _updateUserSnapshots(address _user) internal {
        snapshots[_user].F_AUT_Snapshot = F_AUT;
        snapshots[_user].F_LUSD_Snapshot = F_LUSD;
        emit StakerSnapshotsUpdated(_user, F_AUT, F_LUSD);
    }

    function _sendAUTGainToUser(uint AUTGain) internal {
        emit EtherSent(msg.sender, AUTGain);
        (bool success, ) = msg.sender.call{value: AUTGain}("");
        require(success, "LQTYStaking: Failed to send accumulated AUTGain");
    }

    // --- 'require' functions ---

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "LQTYStaking: caller is not TroveM");
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(msg.sender == borrowerOperationsAddress, "LQTYStaking: caller is not BorrowerOps");
    }

    function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "LQTYStaking: caller is not ActivePool");
    }

    function _requireUserHasStake(uint currentStake) internal pure {
        require(currentStake > 0, "LQTYStaking: User must have a non-zero stake");
    }

    function _requireNonZeroAmount(uint _amount) internal pure {
        require(_amount > 0, "LQTYStaking: Amount must be non-zero");
    }

    receive() external payable {
        _requireCallerIsActivePool();
    }
}
