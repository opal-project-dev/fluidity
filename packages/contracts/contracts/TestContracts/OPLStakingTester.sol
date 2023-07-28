// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../OPL/OPLStaking.sol";

contract OPLStakingTester is OPLStaking {
    function requireCallerIsTroveManager() external view {
        _requireCallerIsTroveManager();
    }
}
