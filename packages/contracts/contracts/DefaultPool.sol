// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./Interfaces/IDefaultPool.sol";
import "./Dependencies/SafeMath.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/console.sol";

/*
 * The Default Pool holds the AUT and LUSD debt (but not LUSD tokens) from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending AUT and LUSD debt, its pending AUT and LUSD debt is moved
 * from the Default Pool to the Active Pool.
 */
contract DefaultPool is Ownable, CheckContract, IDefaultPool {
    using SafeMath for uint256;

    string public constant NAME = "DefaultPool";

    address public troveManagerAddress;
    address public activePoolAddress;
    uint256 internal AUT; // deposited AUT tracker
    uint256 internal LUSDDebt; // debt

    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolLUSDDebtUpdated(uint _LUSDDebt);
    event DefaultPoolAUTBalanceUpdated(uint _AUT);

    // --- Dependency setters ---

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress
    ) external onlyOwner {
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);

        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

        _renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
     * Returns the AUT state variable.
     *
     * Not necessarily equal to the the contract's raw AUT balance - aut can be forcibly sent to contracts.
     */
    function getAUT() external view override returns (uint) {
        return AUT;
    }

    function getLUSDDebt() external view override returns (uint) {
        return LUSDDebt;
    }

    // --- Pool functionality ---

    function sendAUTToActivePool(uint _amount) external override {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        AUT = AUT.sub(_amount);
        emit DefaultPoolAUTBalanceUpdated(AUT);
        emit EtherSent(activePool, _amount);

        (bool success, ) = activePool.call{value: _amount}("");
        require(success, "DefaultPool: sending AUT failed");
    }

    function increaseLUSDDebt(uint _amount) external override {
        _requireCallerIsTroveManager();
        LUSDDebt = LUSDDebt.add(_amount);
        emit DefaultPoolLUSDDebtUpdated(LUSDDebt);
    }

    function decreaseLUSDDebt(uint _amount) external override {
        _requireCallerIsTroveManager();
        LUSDDebt = LUSDDebt.sub(_amount);
        emit DefaultPoolLUSDDebtUpdated(LUSDDebt);
    }

    // --- 'require' functions ---

    function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "DefaultPool: Caller is not the ActivePool");
    }

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "DefaultPool: Caller is not the TroveManager");
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsActivePool();
        AUT = AUT.add(msg.value);
        emit DefaultPoolAUTBalanceUpdated(AUT);
    }
}
