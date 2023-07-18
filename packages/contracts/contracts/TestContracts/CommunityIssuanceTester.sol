// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../OPL/CommunityIssuance.sol";

contract CommunityIssuanceTester is CommunityIssuance {
    function obtainOPL(uint _amount) external {
        oplToken.transfer(msg.sender, _amount);
    }

    function getCumulativeIssuanceFraction() external view returns (uint) {
        return _getCumulativeIssuanceFraction();
    }

    function unprotectedIssueOPL() external returns (uint) {
        // No checks on caller address

        uint latestTotalOPLIssued = OPLSupplyCap.mul(_getCumulativeIssuanceFraction()).div(
            DECIMAL_PRECISION
        );
        uint issuance = latestTotalOPLIssued.sub(totalOPLIssued);

        totalOPLIssued = latestTotalOPLIssued;
        return issuance;
    }
}
