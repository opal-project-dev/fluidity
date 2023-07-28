// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/CheckContract.sol";
import "../Interfaces/IOPLStaking.sol";

contract OPLStakingScript is CheckContract {
    IOPLStaking immutable OPLStaking;

    constructor(address _oplStakingAddress) public {
        checkContract(_oplStakingAddress);
        OPLStaking = IOPLStaking(_oplStakingAddress);
    }

    function stake(uint _OPLamount) external {
        OPLStaking.stake(_OPLamount);
    }
}
