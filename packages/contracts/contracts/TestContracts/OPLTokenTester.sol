// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../OPL/OPLToken.sol";

contract OPLTokenTester is OPLToken {
    constructor(
        address _communityIssuanceAddress,
        address _oplStakingAddress,
        address _lockupFactoryAddress,
        address _bountyAddress,
        address _multisigAddress
    )
        public
        OPLToken(
            _communityIssuanceAddress,
            _oplStakingAddress,
            _lockupFactoryAddress,
            _bountyAddress,
            _multisigAddress
        )
    {}

    function unprotectedMint(address account, uint256 amount) external {
        // No check for the caller here

        _mint(account, amount);
    }

    function unprotectedSendToOPLStaking(address _sender, uint256 _amount) external {
        // No check for the caller here

        if (_isFirstYear()) {
            _requireSenderIsNotMultisig(_sender);
        }
        _transfer(_sender, oplStakingAddress, _amount);
    }

    function callInternalApprove(
        address owner,
        address spender,
        uint256 amount
    ) external returns (bool) {
        _approve(owner, spender, amount);
    }

    function callInternalTransfer(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool) {
        _transfer(sender, recipient, amount);
    }

    function getChainId() external pure returns (uint256 chainID) {
        //return _chainID(); // it’s private
        assembly {
            chainID := chainid()
        }
    }
}
