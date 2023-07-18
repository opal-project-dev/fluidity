// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

// Common interface for the Pools.
interface IPool {
    // --- Events ---

    event AUTBalanceUpdated(uint _newBalance);
    event ONEUBalanceUpdated(uint _newBalance);
    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);
    event EtherSent(address _to, uint _amount);

    // --- Functions ---

    function getAUT() external view returns (uint);

    function getONEUDebt() external view returns (uint);

    function increaseONEUDebt(uint _amount) external;

    function decreaseONEUDebt(uint _amount) external;
}
