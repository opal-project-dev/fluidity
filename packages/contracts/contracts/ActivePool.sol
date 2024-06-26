// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./Interfaces/IActivePool.sol";
import "./Dependencies/SafeMath.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/console.sol";

/*
 * The Active Pool holds the AUT collateral and ONEU debt (but not ONEU tokens) for all active troves.
 *
 * When a trove is liquidated, it's AUT and ONEU debt are transferred from the Active Pool, to either the
 * Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 *
 */
contract ActivePool is Ownable, CheckContract, IActivePool {
    using SafeMath for uint256;

    string public constant NAME = "ActivePool";

    address public borrowerOperationsAddress;
    address public troveManagerAddress;
    address public stabilityPoolAddress;
    address public defaultPoolAddress;
    uint256 internal AUT; // deposited aut tracker
    uint256 internal ONEUDebt;

    // --- Events ---

    event BorrowerOperationsAddressChanged(address _newBorrowerOperationsAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolONEUDebtUpdated(uint _ONEUDebt);
    event ActivePoolAUTBalanceUpdated(uint _AUT);

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _defaultPoolAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_defaultPoolAddress);

        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        stabilityPoolAddress = _stabilityPoolAddress;
        defaultPoolAddress = _defaultPoolAddress;

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);

        _renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
     * Returns the AUT state variable.
     *
     *Not necessarily equal to the the contract's raw AUT balance - aut can be forcibly sent to contracts.
     */
    function getAUT() external view override returns (uint) {
        return AUT;
    }

    function getONEUDebt() external view override returns (uint) {
        return ONEUDebt;
    }

    // --- Pool functionality ---

    function sendAUT(address _account, uint _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        AUT = AUT.sub(_amount);
        emit ActivePoolAUTBalanceUpdated(AUT);
        emit EtherSent(_account, _amount);

        (bool success, ) = _account.call{value: _amount}("");
        require(success, "ActivePool: sending AUT failed");
    }

    function increaseONEUDebt(uint _amount) external override {
        _requireCallerIsBOorTroveM();
        ONEUDebt = ONEUDebt.add(_amount);
        ActivePoolONEUDebtUpdated(ONEUDebt);
    }

    function decreaseONEUDebt(uint _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        ONEUDebt = ONEUDebt.sub(_amount);
        ActivePoolONEUDebtUpdated(ONEUDebt);
    }

    // --- 'require' functions ---

    function _requireCallerIsBorrowerOperationsOrDefaultPool() internal view {
        require(
            msg.sender == borrowerOperationsAddress || msg.sender == defaultPoolAddress,
            "ActivePool: Caller is neither BO nor Default Pool"
        );
    }

    function _requireCallerIsBOorTroveMorSP() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress ||
                msg.sender == stabilityPoolAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool"
        );
    }

    function _requireCallerIsBOorTroveM() internal view {
        require(
            msg.sender == borrowerOperationsAddress || msg.sender == troveManagerAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager"
        );
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsBorrowerOperationsOrDefaultPool();
        AUT = AUT.add(msg.value);
        emit ActivePoolAUTBalanceUpdated(AUT);
    }
}
