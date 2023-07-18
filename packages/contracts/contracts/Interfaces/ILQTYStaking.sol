// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface ILQTYStaking {
    // --- Events --

    event LQTYTokenAddressSet(address _lqtyTokenAddress);
    event ONEUTokenAddressSet(address _lusdTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint ONEUGain, uint AUTGain);
    event F_AUTUpdated(uint _F_AUT);
    event F_ONEUUpdated(uint _F_ONEU);
    event TotalLQTYStakedUpdated(uint _totalLQTYStaked);
    event EtherSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_AUT, uint _F_ONEU);

    // --- Functions ---

    function setAddresses(
        address _lqtyTokenAddress,
        address _lusdTokenAddress,
        address _troveManagerAddress,
        address _borrowerOperationsAddress,
        address _activePoolAddress
    ) external;

    function stake(uint _LQTYamount) external;

    function unstake(uint _LQTYamount) external;

    function increaseF_AUT(uint _AUTFee) external;

    function increaseF_ONEU(uint _LQTYFee) external;

    function getPendingAUTGain(address _user) external view returns (uint);

    function getPendingONEUGain(address _user) external view returns (uint);
}
