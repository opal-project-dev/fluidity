const Decimal = require("decimal.js");
const deploymentHelper = require("../utils/deploymentHelpers.js");
const { BNConverter } = require("../utils/BNConverter.js");
const testHelpers = require("../utils/testHelpers.js");

const OPLStakingTester = artifacts.require("OPLStakingTester");
const TroveManagerTester = artifacts.require("TroveManagerTester");
const NonPayable = artifacts.require("./NonPayable.sol");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const dec = th.dec;
const assertRevert = th.assertRevert;

const toBN = th.toBN;
const ZERO = th.toBN("0");

const GAS_PRICE = 10000000;

/* NOTE: These tests do not test for specific AUT and ONEU gain values. They only test that the
 * gains are non-zero, occur when they should, and are in correct proportion to the user's stake.
 *
 * Specific AUT/ONEU gain values will depend on the final fee schedule used, and the final choices for
 * parameters BETA and MINUTE_DECAY_FACTOR in the TroveManager, which are still TBD based on economic
 * modelling.
 *
 */

contract("OPLStaking revenue share tests", async accounts => {
  const [bountyAddress, multisig] = accounts.slice(997, 1000);

  const [owner, A, B, C, D, E, F, G, whale] = accounts;

  let priceFeed;
  let oneuToken;
  let sortedTroves;
  let troveManager;
  let activePool;
  let stabilityPool;
  let defaultPool;
  let borrowerOperations;
  let oplStaking;
  let oplToken;

  let contracts;

  const openTrove = async params => th.openTrove(contracts, params);

  beforeEach(async () => {
    contracts = await deploymentHelper.deployLiquityCore();
    contracts.troveManager = await TroveManagerTester.new();
    contracts = await deploymentHelper.deployONEUTokenTester(contracts);
    const OPLContracts = await deploymentHelper.deployOPLTesterContractsHardhat(
      bountyAddress,

      multisig
    );

    await deploymentHelper.connectOPLContracts(OPLContracts);
    await deploymentHelper.connectCoreContracts(contracts, OPLContracts);
    await deploymentHelper.connectOPLContractsToCore(OPLContracts, contracts);

    nonPayable = await NonPayable.new();
    priceFeed = contracts.priceFeedTestnet;
    oneuToken = contracts.oneuToken;
    sortedTroves = contracts.sortedTroves;
    troveManager = contracts.troveManager;
    activePool = contracts.activePool;
    stabilityPool = contracts.stabilityPool;
    defaultPool = contracts.defaultPool;
    borrowerOperations = contracts.borrowerOperations;
    hintHelpers = contracts.hintHelpers;

    oplToken = OPLContracts.oplToken;
    oplStaking = OPLContracts.oplStaking;
  });

  it("stake(): reverts if amount is zero", async () => {
    // FF time one year so owner can transfer OPL
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers OPL to staker A
    await oplToken.transfer(A, dec(100, 18), { from: multisig });

    // console.log(`A opl bal: ${await oplToken.balanceOf(A)}`)

    // A makes stake
    await oplToken.approve(oplStaking.address, dec(100, 18), { from: A });
    await assertRevert(oplStaking.stake(0, { from: A }), "OPLStaking: Amount must be non-zero");
  });

  it("AUT fee per OPL staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({
      extraONEUAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });

    // FF time one year so owner can transfer OPL
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers OPL to staker A
    await oplToken.transfer(A, dec(100, 18), { from: multisig, gasPrice: GAS_PRICE });

    // console.log(`A opl bal: ${await oplToken.balanceOf(A)}`)

    // A makes stake
    await oplToken.approve(oplStaking.address, dec(100, 18), { from: A });
    await oplStaking.stake(dec(100, 18), { from: A });

    // Check AUT fee per unit staked is zero
    const F_AUT_Before = await oplStaking.F_AUT();
    assert.equal(F_AUT_Before, "0");

    const B_BalBeforeREdemption = await oneuToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      GAS_PRICE
    );

    const B_BalAfterRedemption = await oneuToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee emitted in event is non-zero
    const emittedAUTFee = toBN((await th.getEmittedRedemptionValues(redemptionTx))[3]);
    assert.isTrue(emittedAUTFee.gt(toBN("0")));

    // Check AUT fee per unit staked has increased by correct amount
    const F_AUT_After = await oplStaking.F_AUT();

    // Expect fee per unit staked = fee/100, since there is 100 ONEU totalStaked
    const expected_F_AUT_After = emittedAUTFee.div(toBN("100"));

    assert.isTrue(expected_F_AUT_After.eq(F_AUT_After));
  });

  it("AUT fee per OPL staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraONEUAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer OPL
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers OPL to staker A
    await oplToken.transfer(A, dec(100, 18), { from: multisig, gasPrice: GAS_PRICE });

    // Check AUT fee per unit staked is zero
    const F_AUT_Before = await oplStaking.F_AUT();
    assert.equal(F_AUT_Before, "0");

    const B_BalBeforeREdemption = await oneuToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      GAS_PRICE
    );

    const B_BalAfterRedemption = await oneuToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee emitted in event is non-zero
    const emittedAUTFee = toBN((await th.getEmittedRedemptionValues(redemptionTx))[3]);
    assert.isTrue(emittedAUTFee.gt(toBN("0")));

    // Check AUT fee per unit staked has not increased
    const F_AUT_After = await oplStaking.F_AUT();
    assert.equal(F_AUT_After, "0");
  });

  it("ONEU fee per OPL staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({
      extraONEUAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer OPL
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers OPL to staker A
    await oplToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await oplToken.approve(oplStaking.address, dec(100, 18), { from: A });
    await oplStaking.stake(dec(100, 18), { from: A });

    // Check ONEU fee per unit staked is zero
    const F_ONEU_Before = await oplStaking.F_AUT();
    assert.equal(F_ONEU_Before, "0");

    const B_BalBeforeREdemption = await oneuToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await oneuToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate();
    assert.isTrue(baseRate.gt(toBN("0")));

    // D draws debt
    const tx = await borrowerOperations.withdrawONEU(th._100pct, dec(27, 18), D, D, { from: D });

    // Check ONEU fee value in event is non-zero
    const emittedONEUFee = toBN(th.getONEUFeeFromONEUBorrowingEvent(tx));
    assert.isTrue(emittedONEUFee.gt(toBN("0")));

    // Check ONEU fee per unit staked has increased by correct amount
    const F_ONEU_After = await oplStaking.F_ONEU();

    // Expect fee per unit staked = fee/100, since there is 100 ONEU totalStaked
    const expected_F_ONEU_After = emittedONEUFee.div(toBN("100"));

    assert.isTrue(expected_F_ONEU_After.eq(F_ONEU_After));
  });

  it("ONEU fee per OPL staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraONEUAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer OPL
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers OPL to staker A
    await oplToken.transfer(A, dec(100, 18), { from: multisig });

    // Check ONEU fee per unit staked is zero
    const F_ONEU_Before = await oplStaking.F_AUT();
    assert.equal(F_ONEU_Before, "0");

    const B_BalBeforeREdemption = await oneuToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await oneuToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate();
    assert.isTrue(baseRate.gt(toBN("0")));

    // D draws debt
    const tx = await borrowerOperations.withdrawONEU(th._100pct, dec(27, 18), D, D, { from: D });

    // Check ONEU fee value in event is non-zero
    const emittedONEUFee = toBN(th.getONEUFeeFromONEUBorrowingEvent(tx));
    assert.isTrue(emittedONEUFee.gt(toBN("0")));

    // Check ONEU fee per unit staked did not increase, is still zero
    const F_ONEU_After = await oplStaking.F_ONEU();
    assert.equal(F_ONEU_After, "0");
  });

  it("OPL Staking: A single staker earns all AUT and OPL fees that occur", async () => {
    await openTrove({
      extraONEUAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer OPL
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers OPL to staker A
    await oplToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await oplToken.approve(oplStaking.address, dec(100, 18), { from: A });
    await oplStaking.stake(dec(100, 18), { from: A });

    const B_BalBeforeREdemption = await oneuToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await oneuToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee 1 emitted in event is non-zero
    const emittedAUTFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedAUTFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await oneuToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await oneuToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check AUT fee 2 emitted in event is non-zero
    const emittedAUTFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedAUTFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawONEU(th._100pct, dec(104, 18), D, D, {
      from: D
    });

    // Check ONEU fee value in event is non-zero
    const emittedONEUFee_1 = toBN(th.getONEUFeeFromONEUBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedONEUFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawONEU(th._100pct, dec(17, 18), B, B, {
      from: B
    });

    // Check ONEU fee value in event is non-zero
    const emittedONEUFee_2 = toBN(th.getONEUFeeFromONEUBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedONEUFee_2.gt(toBN("0")));

    const expectedTotalAUTGain = emittedAUTFee_1.add(emittedAUTFee_2);
    const expectedTotalONEUGain = emittedONEUFee_1.add(emittedONEUFee_2);

    const A_AUTBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_ONEUBalance_Before = toBN(await oneuToken.balanceOf(A));

    // A un-stakes
    const GAS_Used = th.gasUsed(
      await oplStaking.unstake(dec(100, 18), { from: A, gasPrice: GAS_PRICE })
    );

    const A_AUTBalance_After = toBN(await web3.eth.getBalance(A));
    const A_ONEUBalance_After = toBN(await oneuToken.balanceOf(A));

    const A_AUTGain = A_AUTBalance_After.sub(A_AUTBalance_Before).add(toBN(GAS_Used * GAS_PRICE));
    const A_ONEUGain = A_ONEUBalance_After.sub(A_ONEUBalance_Before);

    assert.isAtMost(th.getDifference(expectedTotalAUTGain, A_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedTotalONEUGain, A_ONEUGain), 1000);
  });

  it("stake(): Top-up sends out all accumulated AUT and ONEU gains to the staker", async () => {
    await openTrove({
      extraONEUAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer OPL
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers OPL to staker A
    await oplToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await oplToken.approve(oplStaking.address, dec(100, 18), { from: A });
    await oplStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await oneuToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await oneuToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee 1 emitted in event is non-zero
    const emittedAUTFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedAUTFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await oneuToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await oneuToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check AUT fee 2 emitted in event is non-zero
    const emittedAUTFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedAUTFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawONEU(th._100pct, dec(104, 18), D, D, {
      from: D
    });

    // Check ONEU fee value in event is non-zero
    const emittedONEUFee_1 = toBN(th.getONEUFeeFromONEUBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedONEUFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawONEU(th._100pct, dec(17, 18), B, B, {
      from: B
    });

    // Check ONEU fee value in event is non-zero
    const emittedONEUFee_2 = toBN(th.getONEUFeeFromONEUBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedONEUFee_2.gt(toBN("0")));

    const expectedTotalAUTGain = emittedAUTFee_1.add(emittedAUTFee_2);
    const expectedTotalONEUGain = emittedONEUFee_1.add(emittedONEUFee_2);

    const A_AUTBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_ONEUBalance_Before = toBN(await oneuToken.balanceOf(A));

    // A tops up
    const GAS_Used = th.gasUsed(
      await oplStaking.stake(dec(50, 18), { from: A, gasPrice: GAS_PRICE })
    );

    const A_AUTBalance_After = toBN(await web3.eth.getBalance(A));
    const A_ONEUBalance_After = toBN(await oneuToken.balanceOf(A));

    const A_AUTGain = A_AUTBalance_After.sub(A_AUTBalance_Before).add(toBN(GAS_Used * GAS_PRICE));
    const A_ONEUGain = A_ONEUBalance_After.sub(A_ONEUBalance_Before);

    assert.isAtMost(th.getDifference(expectedTotalAUTGain, A_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedTotalONEUGain, A_ONEUGain), 1000);
  });

  it("getPendingAUTGain(): Returns the staker's correct pending AUT gain", async () => {
    await openTrove({
      extraONEUAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer OPL
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers OPL to staker A
    await oplToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await oplToken.approve(oplStaking.address, dec(100, 18), { from: A });
    await oplStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await oneuToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await oneuToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee 1 emitted in event is non-zero
    const emittedAUTFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedAUTFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await oneuToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await oneuToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check AUT fee 2 emitted in event is non-zero
    const emittedAUTFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedAUTFee_2.gt(toBN("0")));

    const expectedTotalAUTGain = emittedAUTFee_1.add(emittedAUTFee_2);

    const A_AUTGain = await oplStaking.getPendingAUTGain(A);

    assert.isAtMost(th.getDifference(expectedTotalAUTGain, A_AUTGain), 1000);
  });

  it("getPendingONEUGain(): Returns the staker's correct pending ONEU gain", async () => {
    await openTrove({
      extraONEUAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    // FF time one year so owner can transfer OPL
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers OPL to staker A
    await oplToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await oplToken.approve(oplStaking.address, dec(100, 18), { from: A });
    await oplStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await oneuToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await oneuToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check AUT fee 1 emitted in event is non-zero
    const emittedAUTFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedAUTFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await oneuToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await oneuToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check AUT fee 2 emitted in event is non-zero
    const emittedAUTFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedAUTFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawONEU(th._100pct, dec(104, 18), D, D, {
      from: D
    });

    // Check ONEU fee value in event is non-zero
    const emittedONEUFee_1 = toBN(th.getONEUFeeFromONEUBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedONEUFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawONEU(th._100pct, dec(17, 18), B, B, {
      from: B
    });

    // Check ONEU fee value in event is non-zero
    const emittedONEUFee_2 = toBN(th.getONEUFeeFromONEUBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedONEUFee_2.gt(toBN("0")));

    const expectedTotalONEUGain = emittedONEUFee_1.add(emittedONEUFee_2);
    const A_ONEUGain = await oplStaking.getPendingONEUGain(A);

    assert.isAtMost(th.getDifference(expectedTotalONEUGain, A_ONEUGain), 1000);
  });

  // - multi depositors, several rewards
  it("OPL Staking: Multiple stakers earn the correct share of all AUT and OPL fees, based on their stake size", async () => {
    await openTrove({
      extraONEUAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: E }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: F }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: G }
    });

    // FF time one year so owner can transfer OPL
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers OPL to staker A, B, C
    await oplToken.transfer(A, dec(100, 18), { from: multisig });
    await oplToken.transfer(B, dec(200, 18), { from: multisig });
    await oplToken.transfer(C, dec(300, 18), { from: multisig });

    // A, B, C make stake
    await oplToken.approve(oplStaking.address, dec(100, 18), { from: A });
    await oplToken.approve(oplStaking.address, dec(200, 18), { from: B });
    await oplToken.approve(oplStaking.address, dec(300, 18), { from: C });
    await oplStaking.stake(dec(100, 18), { from: A });
    await oplStaking.stake(dec(200, 18), { from: B });
    await oplStaking.stake(dec(300, 18), { from: C });

    // Confirm staking contract holds 600 OPL
    // console.log(`opl staking OPL bal: ${await oplToken.balanceOf(oplStaking.address)}`)
    assert.equal(await oplToken.balanceOf(oplStaking.address), dec(600, 18));
    assert.equal(await oplStaking.totalOPLStaked(), dec(600, 18));

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
    const borrowingTx_1 = await borrowerOperations.withdrawONEU(th._100pct, dec(104, 18), F, F, {
      from: F
    });
    const emittedONEUFee_1 = toBN(th.getONEUFeeFromONEUBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedONEUFee_1.gt(toBN("0")));

    // G draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawONEU(th._100pct, dec(17, 18), G, G, {
      from: G
    });
    const emittedONEUFee_2 = toBN(th.getONEUFeeFromONEUBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedONEUFee_2.gt(toBN("0")));

    // D obtains OPL from owner and makes a stake
    await oplToken.transfer(D, dec(50, 18), { from: multisig });
    await oplToken.approve(oplStaking.address, dec(50, 18), { from: D });
    await oplStaking.stake(dec(50, 18), { from: D });

    // Confirm staking contract holds 650 OPL
    assert.equal(await oplToken.balanceOf(oplStaking.address), dec(650, 18));
    assert.equal(await oplStaking.totalOPLStaked(), dec(650, 18));

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
    const borrowingTx_3 = await borrowerOperations.withdrawONEU(th._100pct, dec(17, 18), G, G, {
      from: G
    });
    const emittedONEUFee_3 = toBN(th.getONEUFeeFromONEUBorrowingEvent(borrowingTx_3));
    assert.isTrue(emittedONEUFee_3.gt(toBN("0")));

    /*  
    Expected rewards:

    A_AUT: (100* AUTFee_1)/600 + (100* AUTFee_2)/600 + (100*AUT_Fee_3)/650
    B_AUT: (200* AUTFee_1)/600 + (200* AUTFee_2)/600 + (200*AUT_Fee_3)/650
    C_AUT: (300* AUTFee_1)/600 + (300* AUTFee_2)/600 + (300*AUT_Fee_3)/650
    D_AUT:                                             (100*AUT_Fee_3)/650

    A_ONEU: (100*ONEUFee_1 )/600 + (100* ONEUFee_2)/600 + (100*ONEUFee_3)/650
    B_ONEU: (200* ONEUFee_1)/600 + (200* ONEUFee_2)/600 + (200*ONEUFee_3)/650
    C_ONEU: (300* ONEUFee_1)/600 + (300* ONEUFee_2)/600 + (300*ONEUFee_3)/650
    D_ONEU:                                               (100*ONEUFee_3)/650
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

    // Expected ONEU gains:
    const expectedONEUGain_A = toBN("100")
      .mul(emittedONEUFee_1)
      .div(toBN("600"))
      .add(toBN("100").mul(emittedONEUFee_2).div(toBN("600")))
      .add(toBN("100").mul(emittedONEUFee_3).div(toBN("650")));

    const expectedONEUGain_B = toBN("200")
      .mul(emittedONEUFee_1)
      .div(toBN("600"))
      .add(toBN("200").mul(emittedONEUFee_2).div(toBN("600")))
      .add(toBN("200").mul(emittedONEUFee_3).div(toBN("650")));

    const expectedONEUGain_C = toBN("300")
      .mul(emittedONEUFee_1)
      .div(toBN("600"))
      .add(toBN("300").mul(emittedONEUFee_2).div(toBN("600")))
      .add(toBN("300").mul(emittedONEUFee_3).div(toBN("650")));

    const expectedONEUGain_D = toBN("50").mul(emittedONEUFee_3).div(toBN("650"));

    const A_AUTBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_ONEUBalance_Before = toBN(await oneuToken.balanceOf(A));
    const B_AUTBalance_Before = toBN(await web3.eth.getBalance(B));
    const B_ONEUBalance_Before = toBN(await oneuToken.balanceOf(B));
    const C_AUTBalance_Before = toBN(await web3.eth.getBalance(C));
    const C_ONEUBalance_Before = toBN(await oneuToken.balanceOf(C));
    const D_AUTBalance_Before = toBN(await web3.eth.getBalance(D));
    const D_ONEUBalance_Before = toBN(await oneuToken.balanceOf(D));

    // A-D un-stake
    const A_GAS_Used = th.gasUsed(
      await oplStaking.unstake(dec(100, 18), { from: A, gasPrice: GAS_PRICE })
    );
    const B_GAS_Used = th.gasUsed(
      await oplStaking.unstake(dec(200, 18), { from: B, gasPrice: GAS_PRICE })
    );
    const C_GAS_Used = th.gasUsed(
      await oplStaking.unstake(dec(400, 18), { from: C, gasPrice: GAS_PRICE })
    );
    const D_GAS_Used = th.gasUsed(
      await oplStaking.unstake(dec(50, 18), { from: D, gasPrice: GAS_PRICE })
    );

    // Confirm all depositors could withdraw

    //Confirm pool Size is now 0
    assert.equal(await oplToken.balanceOf(oplStaking.address), "0");
    assert.equal(await oplStaking.totalOPLStaked(), "0");

    // Get A-D AUT and ONEU balances
    const A_AUTBalance_After = toBN(await web3.eth.getBalance(A));
    const A_ONEUBalance_After = toBN(await oneuToken.balanceOf(A));
    const B_AUTBalance_After = toBN(await web3.eth.getBalance(B));
    const B_ONEUBalance_After = toBN(await oneuToken.balanceOf(B));
    const C_AUTBalance_After = toBN(await web3.eth.getBalance(C));
    const C_ONEUBalance_After = toBN(await oneuToken.balanceOf(C));
    const D_AUTBalance_After = toBN(await web3.eth.getBalance(D));
    const D_ONEUBalance_After = toBN(await oneuToken.balanceOf(D));

    // Get AUT and ONEU gains
    const A_AUTGain = A_AUTBalance_After.sub(A_AUTBalance_Before).add(toBN(A_GAS_Used * GAS_PRICE));
    const A_ONEUGain = A_ONEUBalance_After.sub(A_ONEUBalance_Before);
    const B_AUTGain = B_AUTBalance_After.sub(B_AUTBalance_Before).add(toBN(B_GAS_Used * GAS_PRICE));
    const B_ONEUGain = B_ONEUBalance_After.sub(B_ONEUBalance_Before);
    const C_AUTGain = C_AUTBalance_After.sub(C_AUTBalance_Before).add(toBN(C_GAS_Used * GAS_PRICE));
    const C_ONEUGain = C_ONEUBalance_After.sub(C_ONEUBalance_Before);
    const D_AUTGain = D_AUTBalance_After.sub(D_AUTBalance_Before).add(toBN(D_GAS_Used * GAS_PRICE));
    const D_ONEUGain = D_ONEUBalance_After.sub(D_ONEUBalance_Before);

    // Check gains match expected amounts
    assert.isAtMost(th.getDifference(expectedAUTGain_A, A_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedONEUGain_A, A_ONEUGain), 1000);
    assert.isAtMost(th.getDifference(expectedAUTGain_B, B_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedONEUGain_B, B_ONEUGain), 1000);
    assert.isAtMost(th.getDifference(expectedAUTGain_C, C_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedONEUGain_C, C_ONEUGain), 1000);
    assert.isAtMost(th.getDifference(expectedAUTGain_D, D_AUTGain), 1000);
    assert.isAtMost(th.getDifference(expectedONEUGain_D, D_ONEUGain), 1000);
  });

  it("unstake(): reverts if caller has AUT gains and can't receive AUT", async () => {
    await openTrove({
      extraONEUAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C }
    });
    await openTrove({
      extraONEUAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D }
    });

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers OPL to staker A and the non-payable proxy
    await oplToken.transfer(A, dec(100, 18), { from: multisig });
    await oplToken.transfer(nonPayable.address, dec(100, 18), { from: multisig });

    //  A makes stake
    const A_stakeTx = await oplStaking.stake(dec(100, 18), { from: A });
    assert.isTrue(A_stakeTx.receipt.status);

    //  A tells proxy to make a stake
    const proxystakeTxData = await th.getTransactionData("stake(uint256)", ["0x56bc75e2d63100000"]); // proxy stakes 100 OPL
    await nonPayable.forward(oplStaking.address, proxystakeTxData, { from: A });

    // B makes a redemption, creating AUT gain for proxy
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(45, 18),
      (gasPrice = GAS_PRICE)
    );

    const proxy_AUTGain = await oplStaking.getPendingAUTGain(nonPayable.address);
    assert.isTrue(proxy_AUTGain.gt(toBN("0")));

    // Expect this tx to revert: stake() tries to send nonPayable proxy's accumulated AUT gain (albeit 0),
    //  A tells proxy to unstake
    const proxyUnStakeTxData = await th.getTransactionData("unstake(uint256)", [
      "0x56bc75e2d63100000"
    ]); // proxy stakes 100 OPL
    const proxyUnstakeTxPromise = nonPayable.forward(oplStaking.address, proxyUnStakeTxData, {
      from: A
    });

    // but nonPayable proxy can not accept AUT - therefore stake() reverts.
    await assertRevert(proxyUnstakeTxPromise);
  });

  it("receive(): reverts when it receives AUT from an address that is not the Active Pool", async () => {
    const ethSendTxPromise1 = web3.eth.sendTransaction({
      to: oplStaking.address,
      from: A,
      value: dec(1, "ether")
    });
    const ethSendTxPromise2 = web3.eth.sendTransaction({
      to: oplStaking.address,
      from: owner,
      value: dec(1, "ether")
    });

    await assertRevert(ethSendTxPromise1);
    await assertRevert(ethSendTxPromise2);
  });

  it("unstake(): reverts if user has no stake", async () => {
    const unstakeTxPromise1 = oplStaking.unstake(1, { from: A });
    const unstakeTxPromise2 = oplStaking.unstake(1, { from: owner });

    await assertRevert(unstakeTxPromise1);
    await assertRevert(unstakeTxPromise2);
  });

  it("Test requireCallerIsTroveManager", async () => {
    const oplStakingTester = await OPLStakingTester.new();
    await assertRevert(
      oplStakingTester.requireCallerIsTroveManager(),
      "OPLStaking: caller is not TroveM"
    );
  });
});
