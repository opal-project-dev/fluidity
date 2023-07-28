// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./IPool.sol";

interface IActivePool is IPool {
    // --- Events ---
    event BorrowerOperationsAddressChanged(address _newBorrowerOperationsAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolONEUDebtUpdated(uint _ONEUDebt);
    event ActivePoolAUTBalanceUpdated(uint _AUT);

    // --- Functions ---
    function sendAUT(address _account, uint _amount) external;
}
