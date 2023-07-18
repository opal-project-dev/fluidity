const Decimal = require("decimal.js");
const deploymentHelper = require("../utils/deploymentHelpers.js");
const { BNConverter } = require("../utils/BNConverter.js");
const testHelpers = require("../utils/testHelpers.js");

const LQTYStakingTester = artifacts.require("LQTYStakingTester");
const TroveManagerTester = artifacts.require("TroveManagerTester");
const NonPayable = artifacts.require("./NonPayable.sol");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const dec = th.dec;
const assertRevert = th.assertRevert;

const toBN = th.toBN;
const ZERO = th.toBN("0");

const GAS_PRICE = 10000000;

/* NOTE: These tests do not test for specific AUT and LUSD gain values. They only test that the
 * gains are non-zero, occur when they should, and are in correct proportion to the user's stake.
 *
 * Specific AUT/LUSD gain values will depend on the final fee schedule used, and the final choices for
 * parameters BETA and MINUTE_DECAY_FACTOR in the TroveManager, which are still TBD based on economic
 * modelling.
 *
 */

contract("LQTYStaking revenue share tests", async accounts => {
  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

  const [owner, A, B, C, D, E, F, G, whale] = accounts;

  let priceFeed;
  let lusdToken;
  let sortedTroves;
  let troveManager;
  let activePool;
  let stabilityPool;
  let defaultPool;
  let borrowerOperations;
  let lqtyStaking;
  let lqtyToken;

  let contracts;

  const openTrove = async params => th.openTrove(contracts, params);

  beforeEach(async () => {
    contracts = await deploymentHelper.deployLiquityCore();
    contracts.troveManager = await TroveManagerTester.new();
    contracts = await deploymentHelper.deployLUSDTokenTester(contracts);
    const LQTYContracts = await deploymentHelper.deployLQTYTesterContractsHardhat(
      bountyAddress,
      lpRewardsAddress,
      multisig
    );

    await deploymentHelper.connectLQTYContracts(LQTYContracts);
    await deploymentHelper.connectCoreContracts(contracts, LQTYContracts);
    await deploymentHelper.connectLQTYContractsToCore(LQTYContracts, contracts);

    nonPayable = await NonPayable.new();
    priceFeed = contracts.priceFeedTestnet;
    lusdToken = contracts.lusdToken;
    sortedTroves = contracts.sortedTroves;
    troveManager = contracts.troveManager;
    activePool = contracts.activePool;
    stabilityPool = contracts.stabilityPool;
    defaultPool = contracts.defaultPool;
    borrowerOperations = contracts.borrowerOperations;
    hintHelpers = contracts.hintHelpers;

    lqtyToken = LQTYContracts.lqtyToken;
    lqtyStaking = LQTYContracts.lqtyStaking;
  });

  it("stake(): reverts if amount is zero", async () => {
    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), { from: multisig });

    // console.log(`A lqty bal: ${await lqtyToken.balanceOf(A)}`)

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), { from: A });
    await assertRevert(lqtyStaking.stake(0, { from: A }), "LQTYStaking: Amount must be non-zero");
  });

  it("AUT fee per LQTY staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({
      extraLUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), { from: multisig, gasPrice: GAS_PRICE });

    // console.log(`A lqty bal: ${await lqtyToken.balanceOf(A)}`)

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), { from: A });
    await lqtyStaking.stake(dec(100, 18), { from: A });

    // Check AUT fee per unit staked is zero
    const F_AUT_Before = await lqtyStaking.F_AUT();
    assert.equal(F_AUT_Before, "0");

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      GAS_PRICE
    );

    const B_BalAfterRedemption = await lusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee emitted in event is non-zero
    const emittedAUTFee = toBN((await th.getEmittedRedemptionValues(redemptionTx))[3]);
    assert.isTrue(emittedAUTFee.gt(toBN("0")));

    // Check AUT fee per unit staked has increased by correct amount
    const F_AUT_After = await lqtyStaking.F_AUT();

    // Expect fee per unit staked = fee/100, since there is 100 LUSD totalStaked
    const expected_F_AUT_After = emittedAUTFee.div(toBN("100"));

    assert.isTrue(expected_F_AUT_After.eq(F_AUT_After));
  });

  it("AUT fee per LQTY staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraLUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), { from: multisig, gasPrice: GAS_PRICE });

    // Check AUT fee per unit staked is zero
    const F_AUT_Before = await lqtyStaking.F_AUT();
    assert.equal(F_AUT_Before, "0");

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      GAS_PRICE
    );

    const B_BalAfterRedemption = await lusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee emitted in event is non-zero
    const emittedAUTFee = toBN((await th.getEmittedRedemptionValues(redemptionTx))[3]);
    assert.isTrue(emittedAUTFee.gt(toBN("0")));

    // Check AUT fee per unit staked has not increased
    const F_AUT_After = await lqtyStaking.F_AUT();
    assert.equal(F_AUT_After, "0");
  });

  it("LUSD fee per LQTY staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({
      extraLUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), { from: A });
    await lqtyStaking.stake(dec(100, 18), { from: A });

    // Check LUSD fee per unit staked is zero
    const F_LUSD_Before = await lqtyStaking.F_AUT();
    assert.equal(F_LUSD_Before, "0");

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await lusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate();
    assert.isTrue(baseRate.gt(toBN("0")));

    // D draws debt
    const tx = await borrowerOperations.withdrawLUSD(th._100pct, dec(27, 18), D, D, { from: D });

    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(tx));
    assert.isTrue(emittedLUSDFee.gt(toBN("0")));

    // Check LUSD fee per unit staked has increased by correct amount
    const F_LUSD_After = await lqtyStaking.F_LUSD();

    // Expect fee per unit staked = fee/100, since there is 100 LUSD totalStaked
    const expected_F_LUSD_After = emittedLUSDFee.div(toBN("100"));

    assert.isTrue(expected_F_LUSD_After.eq(F_LUSD_After));
  });

  it("LUSD fee per LQTY staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraLUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), { from: multisig });

    // Check LUSD fee per unit staked is zero
    const F_LUSD_Before = await lqtyStaking.F_AUT();
    assert.equal(F_LUSD_Before, "0");

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await lusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate();
    assert.isTrue(baseRate.gt(toBN("0")));

    // D draws debt
    const tx = await borrowerOperations.withdrawLUSD(th._100pct, dec(27, 18), D, D, { from: D });

    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(tx));
    assert.isTrue(emittedLUSDFee.gt(toBN("0")));

    // Check LUSD fee per unit staked did not increase, is still zero
    const F_LUSD_After = await lqtyStaking.F_LUSD();
    assert.equal(F_LUSD_After, "0");
  });

  it("LQTY Staking: A single staker earns all AUT and LQTY fees that occur", async () => {
    await openTrove({
      extraLUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), { from: A });
    await lqtyStaking.stake(dec(100, 18), { from: A });

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await lusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee 1 emitted in event is non-zero
    const emittedAUTFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedAUTFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await lusdToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await lusdToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check AUT fee 2 emitted in event is non-zero
    const emittedAUTFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedAUTFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawLUSD(th._100pct, dec(104, 18), D, D, {
      from: D
    });

    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_1 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedLUSDFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawLUSD(th._100pct, dec(17, 18), B, B, {
      from: B
    });

    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_2 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedLUSDFee_2.gt(toBN("0")));

    const expectedTotalAUTGain = emittedAUTFee_1.add(emittedAUTFee_2);
    const expectedTotalLUSDGain = emittedLUSDFee_1.add(emittedLUSDFee_2);

    const A_AUTBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_LUSDBalance_Before = toBN(await lusdToken.balanceOf(A));

    // A un-stakes
    const GAS_Used = th.gasUsed(
      await lqtyStaking.unstake(dec(100, 18), { from: A, gasPrice: GAS_PRICE })
    );

    const A_AUTBalance_After = toBN(await web3.eth.getBalance(A));
    const A_LUSDBalance_After = toBN(await lusdToken.balanceOf(A));

    const A_AUTGain = A_AUTBalance_After.sub(A_AUTBalance_Before).add(toBN(GAS_Used * GAS_PRICE));
    const A_LUSDGain = A_LUSDBalance_After.sub(A_LUSDBalance_Before);

    assert.isAtMost(th.getDifference(expectedTotalAUTGain, A_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedTotalLUSDGain, A_LUSDGain), 1000);
  });

  it("stake(): Top-up sends out all accumulated AUT and LUSD gains to the staker", async () => {
    await openTrove({
      extraLUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), { from: A });
    await lqtyStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await lusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee 1 emitted in event is non-zero
    const emittedAUTFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedAUTFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await lusdToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await lusdToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check AUT fee 2 emitted in event is non-zero
    const emittedAUTFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedAUTFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawLUSD(th._100pct, dec(104, 18), D, D, {
      from: D
    });

    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_1 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedLUSDFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawLUSD(th._100pct, dec(17, 18), B, B, {
      from: B
    });

    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_2 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedLUSDFee_2.gt(toBN("0")));

    const expectedTotalAUTGain = emittedAUTFee_1.add(emittedAUTFee_2);
    const expectedTotalLUSDGain = emittedLUSDFee_1.add(emittedLUSDFee_2);

    const A_AUTBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_LUSDBalance_Before = toBN(await lusdToken.balanceOf(A));

    // A tops up
    const GAS_Used = th.gasUsed(
      await lqtyStaking.stake(dec(50, 18), { from: A, gasPrice: GAS_PRICE })
    );

    const A_AUTBalance_After = toBN(await web3.eth.getBalance(A));
    const A_LUSDBalance_After = toBN(await lusdToken.balanceOf(A));

    const A_AUTGain = A_AUTBalance_After.sub(A_AUTBalance_Before).add(toBN(GAS_Used * GAS_PRICE));
    const A_LUSDGain = A_LUSDBalance_After.sub(A_LUSDBalance_Before);

    assert.isAtMost(th.getDifference(expectedTotalAUTGain, A_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedTotalLUSDGain, A_LUSDGain), 1000);
  });

  it("getPendingAUTGain(): Returns the staker's correct pending AUT gain", async () => {
    await openTrove({
      extraLUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), { from: A });
    await lqtyStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await lusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee 1 emitted in event is non-zero
    const emittedAUTFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedAUTFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await lusdToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await lusdToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check AUT fee 2 emitted in event is non-zero
    const emittedAUTFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedAUTFee_2.gt(toBN("0")));

    const expectedTotalAUTGain = emittedAUTFee_1.add(emittedAUTFee_2);

    const A_AUTGain = await lqtyStaking.getPendingAUTGain(A);

    assert.isAtMost(th.getDifference(expectedTotalAUTGain, A_AUTGain), 1000);
  });

  it("getPendingLUSDGain(): Returns the staker's correct pending LUSD gain", async () => {
    await openTrove({
      extraLUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), { from: A });
    await lqtyStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await lusdToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee 1 emitted in event is non-zero
    const emittedAUTFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedAUTFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await lusdToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await lusdToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check AUT fee 2 emitted in event is non-zero
    const emittedAUTFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedAUTFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawLUSD(th._100pct, dec(104, 18), D, D, {
      from: D
    });

    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_1 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedLUSDFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawLUSD(th._100pct, dec(17, 18), B, B, {
      from: B
    });

    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_2 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedLUSDFee_2.gt(toBN("0")));

    const expectedTotalLUSDGain = emittedLUSDFee_1.add(emittedLUSDFee_2);
    const A_LUSDGain = await lqtyStaking.getPendingLUSDGain(A);

    assert.isAtMost(th.getDifference(expectedTotalLUSDGain, A_LUSDGain), 1000);
  });

  // - multi depositors, several rewards
  it("LQTY Staking: Multiple stakers earn the correct share of all AUT and LQTY fees, based on their stake size", async () => {
    await openTrove({
      extraLUSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: E }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: F }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: G }
    });

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers LQTY to staker A, B, C
    await lqtyToken.transfer(A, dec(100, 18), { from: multisig });
    await lqtyToken.transfer(B, dec(200, 18), { from: multisig });
    await lqtyToken.transfer(C, dec(300, 18), { from: multisig });

    // A, B, C make stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), { from: A });
    await lqtyToken.approve(lqtyStaking.address, dec(200, 18), { from: B });
    await lqtyToken.approve(lqtyStaking.address, dec(300, 18), { from: C });
    await lqtyStaking.stake(dec(100, 18), { from: A });
    await lqtyStaking.stake(dec(200, 18), { from: B });
    await lqtyStaking.stake(dec(300, 18), { from: C });

    // Confirm staking contract holds 600 LQTY
    // console.log(`lqty staking LQTY bal: ${await lqtyToken.balanceOf(lqtyStaking.address)}`)
    assert.equal(await lqtyToken.balanceOf(lqtyStaking.address), dec(600, 18));
    assert.equal(await lqtyStaking.totalLQTYStaked(), dec(600, 18));

    // F redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      F,
      contracts,
      dec(45, 18),
      (gasPrice = GAS_PRICE)
    );
    const emittedAUTFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedAUTFee_1.gt(toBN("0")));

    // G redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      G,
      contracts,
      dec(197, 18),
      (gasPrice = GAS_PRICE)
    );
    const emittedAUTFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedAUTFee_2.gt(toBN("0")));

    // F draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawLUSD(th._100pct, dec(104, 18), F, F, {
      from: F
    });
    const emittedLUSDFee_1 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedLUSDFee_1.gt(toBN("0")));

    // G draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawLUSD(th._100pct, dec(17, 18), G, G, {
      from: G
    });
    const emittedLUSDFee_2 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedLUSDFee_2.gt(toBN("0")));

    // D obtains LQTY from owner and makes a stake
    await lqtyToken.transfer(D, dec(50, 18), { from: multisig });
    await lqtyToken.approve(lqtyStaking.address, dec(50, 18), { from: D });
    await lqtyStaking.stake(dec(50, 18), { from: D });

    // Confirm staking contract holds 650 LQTY
    assert.equal(await lqtyToken.balanceOf(lqtyStaking.address), dec(650, 18));
    assert.equal(await lqtyStaking.totalLQTYStaked(), dec(650, 18));

    // G redeems
    const redemptionTx_3 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(197, 18),
      (gasPrice = GAS_PRICE)
    );
    const emittedAUTFee_3 = toBN((await th.getEmittedRedemptionValues(redemptionTx_3))[3]);
    assert.isTrue(emittedAUTFee_3.gt(toBN("0")));

    // G draws debt
    const borrowingTx_3 = await borrowerOperations.withdrawLUSD(th._100pct, dec(17, 18), G, G, {
      from: G
    });
    const emittedLUSDFee_3 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_3));
    assert.isTrue(emittedLUSDFee_3.gt(toBN("0")));

    /*  
    Expected rewards:

    A_AUT: (100* AUTFee_1)/600 + (100* AUTFee_2)/600 + (100*AUT_Fee_3)/650
    B_AUT: (200* AUTFee_1)/600 + (200* AUTFee_2)/600 + (200*AUT_Fee_3)/650
    C_AUT: (300* AUTFee_1)/600 + (300* AUTFee_2)/600 + (300*AUT_Fee_3)/650
    D_AUT:                                             (100*AUT_Fee_3)/650

    A_LUSD: (100*LUSDFee_1 )/600 + (100* LUSDFee_2)/600 + (100*LUSDFee_3)/650
    B_LUSD: (200* LUSDFee_1)/600 + (200* LUSDFee_2)/600 + (200*LUSDFee_3)/650
    C_LUSD: (300* LUSDFee_1)/600 + (300* LUSDFee_2)/600 + (300*LUSDFee_3)/650
    D_LUSD:                                               (100*LUSDFee_3)/650
    */

    // Expected AUT gains
    const expectedAUTGain_A = toBN("100")
      .mul(emittedAUTFee_1)
      .div(toBN("600"))
      .add(toBN("100").mul(emittedAUTFee_2).div(toBN("600")))
      .add(toBN("100").mul(emittedAUTFee_3).div(toBN("650")));

    const expectedAUTGain_B = toBN("200")
      .mul(emittedAUTFee_1)
      .div(toBN("600"))
      .add(toBN("200").mul(emittedAUTFee_2).div(toBN("600")))
      .add(toBN("200").mul(emittedAUTFee_3).div(toBN("650")));

    const expectedAUTGain_C = toBN("300")
      .mul(emittedAUTFee_1)
      .div(toBN("600"))
      .add(toBN("300").mul(emittedAUTFee_2).div(toBN("600")))
      .add(toBN("300").mul(emittedAUTFee_3).div(toBN("650")));

    const expectedAUTGain_D = toBN("50").mul(emittedAUTFee_3).div(toBN("650"));

    // Expected LUSD gains:
    const expectedLUSDGain_A = toBN("100")
      .mul(emittedLUSDFee_1)
      .div(toBN("600"))
      .add(toBN("100").mul(emittedLUSDFee_2).div(toBN("600")))
      .add(toBN("100").mul(emittedLUSDFee_3).div(toBN("650")));

    const expectedLUSDGain_B = toBN("200")
      .mul(emittedLUSDFee_1)
      .div(toBN("600"))
      .add(toBN("200").mul(emittedLUSDFee_2).div(toBN("600")))
      .add(toBN("200").mul(emittedLUSDFee_3).div(toBN("650")));

    const expectedLUSDGain_C = toBN("300")
      .mul(emittedLUSDFee_1)
      .div(toBN("600"))
      .add(toBN("300").mul(emittedLUSDFee_2).div(toBN("600")))
      .add(toBN("300").mul(emittedLUSDFee_3).div(toBN("650")));

    const expectedLUSDGain_D = toBN("50").mul(emittedLUSDFee_3).div(toBN("650"));

    const A_AUTBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_LUSDBalance_Before = toBN(await lusdToken.balanceOf(A));
    const B_AUTBalance_Before = toBN(await web3.eth.getBalance(B));
    const B_LUSDBalance_Before = toBN(await lusdToken.balanceOf(B));
    const C_AUTBalance_Before = toBN(await web3.eth.getBalance(C));
    const C_LUSDBalance_Before = toBN(await lusdToken.balanceOf(C));
    const D_AUTBalance_Before = toBN(await web3.eth.getBalance(D));
    const D_LUSDBalance_Before = toBN(await lusdToken.balanceOf(D));

    // A-D un-stake
    const A_GAS_Used = th.gasUsed(
      await lqtyStaking.unstake(dec(100, 18), { from: A, gasPrice: GAS_PRICE })
    );
    const B_GAS_Used = th.gasUsed(
      await lqtyStaking.unstake(dec(200, 18), { from: B, gasPrice: GAS_PRICE })
    );
    const C_GAS_Used = th.gasUsed(
      await lqtyStaking.unstake(dec(400, 18), { from: C, gasPrice: GAS_PRICE })
    );
    const D_GAS_Used = th.gasUsed(
      await lqtyStaking.unstake(dec(50, 18), { from: D, gasPrice: GAS_PRICE })
    );

    // Confirm all depositors could withdraw

    //Confirm pool Size is now 0
    assert.equal(await lqtyToken.balanceOf(lqtyStaking.address), "0");
    assert.equal(await lqtyStaking.totalLQTYStaked(), "0");

    // Get A-D AUT and LUSD balances
    const A_AUTBalance_After = toBN(await web3.eth.getBalance(A));
    const A_LUSDBalance_After = toBN(await lusdToken.balanceOf(A));
    const B_AUTBalance_After = toBN(await web3.eth.getBalance(B));
    const B_LUSDBalance_After = toBN(await lusdToken.balanceOf(B));
    const C_AUTBalance_After = toBN(await web3.eth.getBalance(C));
    const C_LUSDBalance_After = toBN(await lusdToken.balanceOf(C));
    const D_AUTBalance_After = toBN(await web3.eth.getBalance(D));
    const D_LUSDBalance_After = toBN(await lusdToken.balanceOf(D));

    // Get AUT and LUSD gains
    const A_AUTGain = A_AUTBalance_After.sub(A_AUTBalance_Before).add(toBN(A_GAS_Used * GAS_PRICE));
    const A_LUSDGain = A_LUSDBalance_After.sub(A_LUSDBalance_Before);
    const B_AUTGain = B_AUTBalance_After.sub(B_AUTBalance_Before).add(toBN(B_GAS_Used * GAS_PRICE));
    const B_LUSDGain = B_LUSDBalance_After.sub(B_LUSDBalance_Before);
    const C_AUTGain = C_AUTBalance_After.sub(C_AUTBalance_Before).add(toBN(C_GAS_Used * GAS_PRICE));
    const C_LUSDGain = C_LUSDBalance_After.sub(C_LUSDBalance_Before);
    const D_AUTGain = D_AUTBalance_After.sub(D_AUTBalance_Before).add(toBN(D_GAS_Used * GAS_PRICE));
    const D_LUSDGain = D_LUSDBalance_After.sub(D_LUSDBalance_Before);

    // Check gains match expected amounts
    assert.isAtMost(th.getDifference(expectedAUTGain_A, A_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedLUSDGain_A, A_LUSDGain), 1000);
    assert.isAtMost(th.getDifference(expectedAUTGain_B, B_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedLUSDGain_B, B_LUSDGain), 1000);
    assert.isAtMost(th.getDifference(expectedAUTGain_C, C_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedLUSDGain_C, C_LUSDGain), 1000);
    assert.isAtMost(th.getDifference(expectedAUTGain_D, D_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedLUSDGain_D, D_LUSDGain), 1000);
  });

  it("unstake(): reverts if caller has AUT gains and can't receive AUT", async () => {
    await openTrove({
      extraLUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraLUSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers LQTY to staker A and the non-payable proxy
    await lqtyToken.transfer(A, dec(100, 18), { from: multisig });
    await lqtyToken.transfer(nonPayable.address, dec(100, 18), { from: multisig });

    //  A makes stake
    const A_stakeTx = await lqtyStaking.stake(dec(100, 18), { from: A });
    assert.isTrue(A_stakeTx.receipt.status);

    //  A tells proxy to make a stake
    const proxystakeTxData = await th.getTransactionData("stake(uint256)", ["0x56bc75e2d63100000"]); // proxy stakes 100 LQTY
    await nonPayable.forward(lqtyStaking.address, proxystakeTxData, { from: A });

    // B makes a redemption, creating AUT gain for proxy
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(45, 18),
      (gasPrice = GAS_PRICE)
    );

    const proxy_AUTGain = await lqtyStaking.getPendingAUTGain(nonPayable.address);
    assert.isTrue(proxy_AUTGain.gt(toBN("0")));

    // Expect this tx to revert: stake() tries to send nonPayable proxy's accumulated AUT gain (albeit 0),
    //  A tells proxy to unstake
    const proxyUnStakeTxData = await th.getTransactionData("unstake(uint256)", [
      "0x56bc75e2d63100000"
    ]); // proxy stakes 100 LQTY
    const proxyUnstakeTxPromise = nonPayable.forward(lqtyStaking.address, proxyUnStakeTxData, {
      from: A
    });

    // but nonPayable proxy can not accept AUT - therefore stake() reverts.
    await assertRevert(proxyUnstakeTxPromise);
  });

  it("receive(): reverts when it receives AUT from an address that is not the Active Pool", async () => {
    const ethSendTxPromise1 = web3.eth.sendTransaction({
      to: lqtyStaking.address,
      from: A,
      value: dec(1, "ether")
    });
    const ethSendTxPromise2 = web3.eth.sendTransaction({
      to: lqtyStaking.address,
      from: owner,
      value: dec(1, "ether")
    });

    await assertRevert(ethSendTxPromise1);
    await assertRevert(ethSendTxPromise2);
  });

  it("unstake(): reverts if user has no stake", async () => {
    const unstakeTxPromise1 = lqtyStaking.unstake(1, { from: A });
    const unstakeTxPromise2 = lqtyStaking.unstake(1, { from: owner });

    await assertRevert(unstakeTxPromise1);
    await assertRevert(unstakeTxPromise2);
  });

  it("Test requireCallerIsTroveManager", async () => {
    const lqtyStakingTester = await LQTYStakingTester.new();
    await assertRevert(
      lqtyStakingTester.requireCallerIsTroveManager(),
      "LQTYStaking: caller is not TroveM"
    );
  });
});
