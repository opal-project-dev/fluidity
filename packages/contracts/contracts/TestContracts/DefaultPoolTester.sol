// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../DefaultPool.sol";

contract DefaultPoolTester is DefaultPool {
    function unprotectedIncreaseONEUDebt(uint _amount) external {
        ONEUDebt = ONEUDebt.add(_amount);
    }

    function unprotectedPayable() external payable {
        AUT = AUT.add(msg.value);
    }
}
