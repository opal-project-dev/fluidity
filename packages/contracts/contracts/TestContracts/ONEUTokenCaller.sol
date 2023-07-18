// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Interfaces/IONEUToken.sol";

contract ONEUTokenCaller {
    IONEUToken ONEU;

    function setONEU(IONEUToken _ONEU) external {
        ONEU = _ONEU;
    }

    function oneuMint(address _account, uint _amount) external {
        ONEU.mint(_account, _amount);
    }

    function oneuBurn(address _account, uint _amount) external {
        ONEU.burn(_account, _amount);
    }

    function oneuSendToPool(address _sender, address _poolAddress, uint256 _amount) external {
        ONEU.sendToPool(_sender, _poolAddress, _amount);
    }

    function oneuReturnFromPool(address _poolAddress, address _receiver, uint256 _amount) external {
        ONEU.returnFromPool(_poolAddress, _receiver, _amount);
    }
}
