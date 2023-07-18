// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface ICommunityIssuance {
    // --- Events ---

    event OPLTokenAddressSet(address _oplTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalOPLIssuedUpdated(uint _totalOPLIssued);

    // --- Functions ---

    function setAddresses(address _oplTokenAddress, address _stabilityPoolAddress) external;

    function issueOPL() external returns (uint);

    function sendOPL(address _account, uint _OPLamount) external;
}
