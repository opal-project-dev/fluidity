// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/CheckContract.sol";
import "../Interfaces/IOPLStaking.sol";

contract OPLStakingScript is CheckContract {
    IOPLStaking immutable OPLStaking;

    constructor(address _lqtyStakingAddress) public {
        checkContract(_lqtyStakingAddress);
        OPLStaking = IOPLStaking(_lqtyStakingAddress);
    }

    function stake(uint _OPLamount) external {
        OPLStaking.stake(_OPLamount);
    }
}
