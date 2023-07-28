// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/SafeMath.sol";
import "../Dependencies/LiquityMath.sol";
import "../Dependencies/IERC20.sol";
import "../Interfaces/IBorrowerOperations.sol";
import "../Interfaces/ITroveManager.sol";
import "../Interfaces/IStabilityPool.sol";
import "../Interfaces/IPriceFeed.sol";
import "../Interfaces/IOPLStaking.sol";
import "./BorrowerOperationsScript.sol";
import "./AUTTransferScript.sol";
import "./OPLStakingScript.sol";
import "../Dependencies/console.sol";

contract BorrowerWrappersScript is BorrowerOperationsScript, AUTTransferScript, OPLStakingScript {
    using SafeMath for uint;

    string public constant NAME = "BorrowerWrappersScript";

    ITroveManager immutable troveManager;
    IStabilityPool immutable stabilityPool;
    IPriceFeed immutable priceFeed;
    IERC20 immutable oneuToken;
    IERC20 immutable oplToken;
    IOPLStaking immutable oplStaking;

    constructor(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _oplStakingAddress
    )
        public
        BorrowerOperationsScript(IBorrowerOperations(_borrowerOperationsAddress))
        OPLStakingScript(_oplStakingAddress)
    {
        checkContract(_troveManagerAddress);
        ITroveManager troveManagerCached = ITroveManager(_troveManagerAddress);
        troveManager = troveManagerCached;

        IStabilityPool stabilityPoolCached = troveManagerCached.stabilityPool();
        checkContract(address(stabilityPoolCached));
        stabilityPool = stabilityPoolCached;

        IPriceFeed priceFeedCached = troveManagerCached.priceFeed();
        checkContract(address(priceFeedCached));
        priceFeed = priceFeedCached;

        address oneuTokenCached = address(troveManagerCached.oneuToken());
        checkContract(oneuTokenCached);
        oneuToken = IERC20(oneuTokenCached);

        address oplTokenCached = address(troveManagerCached.oplToken());
        checkContract(oplTokenCached);
        oplToken = IERC20(oplTokenCached);

        IOPLStaking oplStakingCached = troveManagerCached.oplStaking();
        require(
            _oplStakingAddress == address(oplStakingCached),
            "BorrowerWrappersScript: Wrong OPLStaking address"
        );
        oplStaking = oplStakingCached;
    }

    function claimCollateralAndOpenTrove(
        uint _maxFee,
        uint _ONEUAmount,
        address _upperHint,
        address _lowerHint
    ) external payable {
        uint balanceBefore = address(this).balance;

        // Claim collateral
        borrowerOperations.claimCollateral();

        uint balanceAfter = address(this).balance;

        // already checked in CollSurplusPool
        assert(balanceAfter > balanceBefore);

        uint totalCollateral = balanceAfter.sub(balanceBefore).add(msg.value);

        // Open trove with obtained collateral, plus collateral sent by user
        borrowerOperations.openTrove{value: totalCollateral}(
            _maxFee,
            _ONEUAmount,
            _upperHint,
            _lowerHint
        );
    }

    function claimSPRewardsAndRecycle(
        uint _maxFee,
        address _upperHint,
        address _lowerHint
    ) external {
        uint collBalanceBefore = address(this).balance;
        uint oplBalanceBefore = oplToken.balanceOf(address(this));

        // Claim rewards
        stabilityPool.withdrawFromSP(0);

        uint collBalanceAfter = address(this).balance;
        uint oplBalanceAfter = oplToken.balanceOf(address(this));
        uint claimedCollateral = collBalanceAfter.sub(collBalanceBefore);

        // Add claimed AUT to trove, get more ONEU and stake it into the Stability Pool
        if (claimedCollateral > 0) {
            _requireUserHasTrove(address(this));
            uint ONEUAmount = _getNetONEUAmount(claimedCollateral);
            borrowerOperations.adjustTrove{value: claimedCollateral}(
                _maxFee,
                0,
                ONEUAmount,
                true,
                _upperHint,
                _lowerHint
            );
            // Provide withdrawn ONEU to Stability Pool
            if (ONEUAmount > 0) {
                stabilityPool.provideToSP(ONEUAmount, address(0));
            }
        }

        // Stake claimed OPL
        uint claimedOPL = oplBalanceAfter.sub(oplBalanceBefore);
        if (claimedOPL > 0) {
            oplStaking.stake(claimedOPL);
        }
    }

    function claimStakingGainsAndRecycle(
        uint _maxFee,
        address _upperHint,
        address _lowerHint
    ) external {
        uint collBalanceBefore = address(this).balance;
        uint oneuBalanceBefore = oneuToken.balanceOf(address(this));
        uint oplBalanceBefore = oplToken.balanceOf(address(this));

        // Claim gains
        oplStaking.unstake(0);

        uint gainedCollateral = address(this).balance.sub(collBalanceBefore); // stack too deep issues :'(
        uint gainedONEU = oneuToken.balanceOf(address(this)).sub(oneuBalanceBefore);

        uint netONEUAmount;
        // Top up trove and get more ONEU, keeping ICR constant
        if (gainedCollateral > 0) {
            _requireUserHasTrove(address(this));
            netONEUAmount = _getNetONEUAmount(gainedCollateral);
            borrowerOperations.adjustTrove{value: gainedCollateral}(
                _maxFee,
                0,
                netONEUAmount,
                true,
                _upperHint,
                _lowerHint
            );
        }

        uint totalONEU = gainedONEU.add(netONEUAmount);
        if (totalONEU > 0) {
            stabilityPool.provideToSP(totalONEU, address(0));

            // Providing to Stability Pool also triggers OPL claim, so stake it if any
            uint oplBalanceAfter = oplToken.balanceOf(address(this));
            uint claimedOPL = oplBalanceAfter.sub(oplBalanceBefore);
            if (claimedOPL > 0) {
                oplStaking.stake(claimedOPL);
            }
        }
    }

    function _getNetONEUAmount(uint _collateral) internal returns (uint) {
        uint price = priceFeed.fetchPrice();
        uint ICR = troveManager.getCurrentICR(address(this), price);

        uint ONEUAmount = _collateral.mul(price).div(ICR);
        uint borrowingRate = troveManager.getBorrowingRateWithDecay();
        uint netDebt = ONEUAmount.mul(LiquityMath.DECIMAL_PRECISION).div(
            LiquityMath.DECIMAL_PRECISION.add(borrowingRate)
        );

        return netDebt;
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(
            troveManager.getTroveStatus(_depositor) == 1,
            "BorrowerWrappersScript: caller must have an active trove"
        );
    }
}
