// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./IPool.sol";

interface IDefaultPool is IPool {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolLUSDDebtUpdated(uint _LUSDDebt);
    event DefaultPoolAUTBalanceUpdated(uint _AUT);

    // --- Functions ---
    function sendAUTToActivePool(uint _amount) external;
}
