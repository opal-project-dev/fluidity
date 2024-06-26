// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface IOPLStaking {
    // --- Events --

    event OPLTokenAddressSet(address _oplTokenAddress);
    event ONEUTokenAddressSet(address _oneuTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint ONEUGain, uint AUTGain);
    event F_AUTUpdated(uint _F_AUT);
    event F_ONEUUpdated(uint _F_ONEU);
    event TotalOPLStakedUpdated(uint _totalOPLStaked);
    event EtherSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_AUT, uint _F_ONEU);

    // --- Functions ---

    function setAddresses(
        address _oplTokenAddress,
        address _oneuTokenAddress,
        address _troveManagerAddress,
        address _borrowerOperationsAddress,
        address _activePoolAddress
    ) external;

    function stake(uint _OPLamount) external;

    function unstake(uint _OPLamount) external;

    function increaseF_AUT(uint _AUTFee) external;

    function increaseF_ONEU(uint _OPLFee) external;

    function getPendingAUTGain(address _user) external view returns (uint);

    function getPendingONEUGain(address _user) external view returns (uint);
}
