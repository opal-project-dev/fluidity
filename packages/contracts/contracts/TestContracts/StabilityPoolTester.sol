// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../StabilityPool.sol";

contract StabilityPoolTester is StabilityPool {
    function unprotectedPayable() external payable {
        AUT = AUT.add(msg.value);
    }

    function setCurrentScale(uint128 _currentScale) external {
        currentScale = _currentScale;
    }

    function setTotalDeposits(uint _totalONEUDeposits) external {
        totalONEUDeposits = _totalONEUDeposits;
    }
}
