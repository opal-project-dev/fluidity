// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/CheckContract.sol";
import "../Dependencies/SafeMath.sol";
import "../Dependencies/Ownable.sol";
import "../Interfaces/ILockupContractFactory.sol";
import "./LockupContract.sol";
import "../Dependencies/console.sol";

/*
 * The LockupContractFactory deploys LockupContracts - its main purpose is to keep a registry of valid deployed
 * LockupContracts.
 *
 * This registry is checked by OPLToken when the Liquity deployer attempts to transfer OPL tokens. During the first year
 * since system deployment, the Liquity deployer is only allowed to transfer OPL to valid LockupContracts that have been
 * deployed by and recorded in the LockupContractFactory. This ensures the deployer's OPL can't be traded or staked in the
 * first year, and can only be sent to a verified LockupContract which unlocks at least one year after system deployment.
 *
 * LockupContracts can of course be deployed directly, but only those deployed through and recorded in the LockupContractFactory
 * will be considered "valid" by OPLToken. This is a convenient way to verify that the target address is a genuine
 * LockupContract.
 */

contract LockupContractFactory is ILockupContractFactory, Ownable, CheckContract {
    using SafeMath for uint;

    // --- Data ---
    string public constant NAME = "LockupContractFactory";

    uint public constant SECONDS_IN_ONE_YEAR = 31536000;

    address public oplTokenAddress;

    mapping(address => address) public lockupContractToDeployer;

    // --- Events ---

    event OPLTokenAddressSet(address _oplTokenAddress);
    event LockupContractDeployedThroughFactory(
        address _lockupContractAddress,
        address _beneficiary,
        uint _unlockTime,
        address _deployer
    );

    // --- Functions ---

    function setOPLTokenAddress(address _oplTokenAddress) external override onlyOwner {
        checkContract(_oplTokenAddress);

        oplTokenAddress = _oplTokenAddress;
        emit OPLTokenAddressSet(_oplTokenAddress);

        _renounceOwnership();
    }

    function deployLockupContract(address _beneficiary, uint _unlockTime) external override {
        address oplTokenAddressCached = oplTokenAddress;
        _requireOPLAddressIsSet(oplTokenAddressCached);
        LockupContract lockupContract = new LockupContract(
            oplTokenAddressCached,
            _beneficiary,
            _unlockTime
        );

        lockupContractToDeployer[address(lockupContract)] = msg.sender;
        emit LockupContractDeployedThroughFactory(
            address(lockupContract),
            _beneficiary,
            _unlockTime,
            msg.sender
        );
    }

    function isRegisteredLockup(address _contractAddress) public view override returns (bool) {
        return lockupContractToDeployer[_contractAddress] != address(0);
    }

    // --- 'require'  functions ---
    function _requireOPLAddressIsSet(address _oplTokenAddress) internal pure {
        require(_oplTokenAddress != address(0), "LCF: OPL Address is not set");
    }
}
