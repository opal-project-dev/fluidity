const deploymentHelper = require("../../utils/deploymentHelpers.js");
const testHelpers = require("../../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const { dec, toBN, assertRevert } = th;

contract("After the initial lockup period has passed", async accounts => {
  const [
    liquityAG,
    teamMember_1,
    teamMember_2,
    teamMember_3,
    investor_1,
    investor_2,
    investor_3,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K
  ] = accounts;

  const [bountyAddress, multisig] = accounts.slice(997, 1000);

  const SECONDS_IN_ONE_DAY = timeValues.SECONDS_IN_ONE_DAY;
  const SECONDS_IN_ONE_MONTH = timeValues.SECONDS_IN_ONE_MONTH;
  const SECONDS_IN_ONE_YEAR = timeValues.SECONDS_IN_ONE_YEAR;
  const maxBytes32 = th.maxBytes32;

  let OPLContracts;
  let coreContracts;

  // LCs for team members on vesting schedules
  let LC_T1;
  let LC_T2;
  let LC_T3;

  // LCs for investors
  let LC_I1;
  let LC_I2;
  let LC_I3;

  // 1e24 = 1 million tokens with 18 decimal digits
  const teamMemberInitialEntitlement_1 = dec(1, 24);
  const teamMemberInitialEntitlement_2 = dec(2, 24);
  const teamMemberInitialEntitlement_3 = dec(3, 24);

  const investorInitialEntitlement_1 = dec(4, 24);
  const investorInitialEntitlement_2 = dec(5, 24);
  const investorInitialEntitlement_3 = dec(6, 24);

  const teamMemberMonthlyVesting_1 = dec(1, 23);
  const teamMemberMonthlyVesting_2 = dec(2, 23);
  const teamMemberMonthlyVesting_3 = dec(3, 23);

  const OPLEntitlement_A = dec(1, 24);
  const OPLEntitlement_B = dec(2, 24);
  const OPLEntitlement_C = dec(3, 24);
  const OPLEntitlement_D = dec(4, 24);
  const OPLEntitlement_E = dec(5, 24);

  let oneYearFromSystemDeployment;
  let twoYearsFromSystemDeployment;
  let justOverOneYearFromSystemDeployment;
  let _18monthsFromSystemDeployment;

  beforeEach(async () => {
    // Deploy all contracts from the first account
    OPLContracts = await deploymentHelper.deployOPLTesterContractsHardhat(
      bountyAddress,

      multisig
    );
    coreContracts = await deploymentHelper.deployLiquityCore();

    oplStaking = OPLContracts.oplStaking;
    oplToken = OPLContracts.oplToken;
    communityIssuance = OPLContracts.communityIssuance;
    lockupContractFactory = OPLContracts.lockupContractFactory;

    await deploymentHelper.connectOPLContracts(OPLContracts);
    await deploymentHelper.connectCoreContracts(coreContracts, OPLContracts);
    await deploymentHelper.connectOPLContractsToCore(OPLContracts, coreContracts);

    oneYearFromSystemDeployment = await th.getTimeFromSystemDeployment(
      oplToken,
      web3,
      timeValues.SECONDS_IN_ONE_YEAR
    );
    justOverOneYearFromSystemDeployment = oneYearFromSystemDeployment.add(toBN("1"));

    const secondsInTwoYears = toBN(timeValues.SECONDS_IN_ONE_YEAR).mul(toBN("2"));
    const secondsIn18Months = toBN(timeValues.SECONDS_IN_ONE_MONTH).mul(toBN("18"));
    twoYearsFromSystemDeployment = await th.getTimeFromSystemDeployment(
      oplToken,
      web3,
      secondsInTwoYears
    );
    _18monthsFromSystemDeployment = await th.getTimeFromSystemDeployment(
      oplToken,
      web3,
      secondsIn18Months
    );

    // Deploy 3 LCs for team members on vesting schedules
    const deployedLCtx_T1 = await lockupContractFactory.deployLockupContract(
      teamMember_1,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_T2 = await lockupContractFactory.deployLockupContract(
      teamMember_2,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_T3 = await lockupContractFactory.deployLockupContract(
      teamMember_3,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );

    const deployedLCtx_I1 = await lockupContractFactory.deployLockupContract(
      investor_1,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_I2 = await lockupContractFactory.deployLockupContract(
      investor_2,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_I3 = await lockupContractFactory.deployLockupContract(
      investor_3,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );

    // LCs for team members on vesting schedules
    LC_T1 = await th.getLCFromDeploymentTx(deployedLCtx_T1);
    LC_T2 = await th.getLCFromDeploymentTx(deployedLCtx_T2);
    LC_T3 = await th.getLCFromDeploymentTx(deployedLCtx_T3);

    // LCs for investors
    LC_I1 = await th.getLCFromDeploymentTx(deployedLCtx_I1);
    LC_I2 = await th.getLCFromDeploymentTx(deployedLCtx_I2);
    LC_I3 = await th.getLCFromDeploymentTx(deployedLCtx_I3);

    // Multisig transfers initial OPL entitlements to LCs
    await oplToken.transfer(LC_T1.address, teamMemberInitialEntitlement_1, { from: multisig });
    await oplToken.transfer(LC_T2.address, teamMemberInitialEntitlement_2, { from: multisig });
    await oplToken.transfer(LC_T3.address, teamMemberInitialEntitlement_3, { from: multisig });

    await oplToken.transfer(LC_I1.address, investorInitialEntitlement_1, { from: multisig });
    await oplToken.transfer(LC_I2.address, investorInitialEntitlement_2, { from: multisig });
    await oplToken.transfer(LC_I3.address, investorInitialEntitlement_3, { from: multisig });

    const systemDeploymentTime = await oplToken.getDeploymentStartTime();

    // Every thirty days, mutlsig transfers vesting amounts to team members
    for (i = 0; i < 12; i++) {
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      await oplToken.transfer(LC_T1.address, teamMemberMonthlyVesting_1, { from: multisig });
      await oplToken.transfer(LC_T2.address, teamMemberMonthlyVesting_2, { from: multisig });
      await oplToken.transfer(LC_T3.address, teamMemberMonthlyVesting_3, { from: multisig });
    }

    // After Since only 360 days have passed, fast forward 5 more days, until LCs unlock
    await th.fastForwardTime(SECONDS_IN_ONE_DAY * 5, web3.currentProvider);

    const endTime = toBN(await th.getLatestBlockTimestamp(web3));

    const timePassed = endTime.sub(systemDeploymentTime);
    // Confirm that just over one year has passed -  not more than 1000 seconds
    assert.isTrue(timePassed.sub(toBN(SECONDS_IN_ONE_YEAR)).lt(toBN("1000")));
    assert.isTrue(timePassed.sub(toBN(SECONDS_IN_ONE_YEAR)).gt(toBN("0")));
  });

  describe("Deploying new LCs", async accounts => {
    it("OPL Deployer can deploy new LCs", async () => {
      // OPL deployer deploys LCs
      const LCDeploymentTx_A = await lockupContractFactory.deployLockupContract(
        A,
        justOverOneYearFromSystemDeployment,
        { from: liquityAG }
      );
      const LCDeploymentTx_B = await lockupContractFactory.deployLockupContract(
        B,
        oneYearFromSystemDeployment,
        { from: liquityAG }
      );
      const LCDeploymentTx_C = await lockupContractFactory.deployLockupContract(
        C,
        "9595995999999900000023423234",
        { from: liquityAG }
      );

      assert.isTrue(LCDeploymentTx_A.receipt.status);
      assert.isTrue(LCDeploymentTx_B.receipt.status);
      assert.isTrue(LCDeploymentTx_C.receipt.status);
    });

    it("Anyone can deploy new LCs", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(
        A,
        justOverOneYearFromSystemDeployment,
        { from: teamMember_1 }
      );
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(
        C,
        oneYearFromSystemDeployment,
        { from: investor_2 }
      );
      const LCDeploymentTx_3 = await lockupContractFactory.deployLockupContract(
        liquityAG,
        "9595995999999900000023423234",
        { from: A }
      );

      assert.isTrue(LCDeploymentTx_1.receipt.status);
      assert.isTrue(LCDeploymentTx_2.receipt.status);
      assert.isTrue(LCDeploymentTx_3.receipt.status);
    });

    it("Anyone can deploy new LCs with unlockTime in the past", async () => {
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(
        A,
        justOverOneYearFromSystemDeployment,
        { from: teamMember_1 }
      );
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(
        B,
        oneYearFromSystemDeployment,
        { from: E }
      );
      const LCDeploymentTx_3 = await lockupContractFactory.deployLockupContract(
        C,
        _18monthsFromSystemDeployment,
        { from: multisig }
      );

      const LC_1 = await th.getLCFromDeploymentTx(LCDeploymentTx_1);
      const LC_2 = await th.getLCFromDeploymentTx(LCDeploymentTx_2);
      const LC_3 = await th.getLCFromDeploymentTx(LCDeploymentTx_3);

      // Check deployments succeeded
      assert.isTrue(LCDeploymentTx_1.receipt.status);
      assert.isTrue(LCDeploymentTx_2.receipt.status);
      assert.isTrue(LCDeploymentTx_3.receipt.status);

      // Check LCs have unlockTimes in the past
      unlockTime_1 = await LC_1.unlockTime();
      unlockTime_2 = await LC_2.unlockTime();
      unlockTime_3 = await LC_3.unlockTime();

      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      assert.isTrue(unlockTime_1.lt(currentTime));
      assert.isTrue(unlockTime_2.lt(currentTime));
      assert.isTrue(unlockTime_3.lt(currentTime));
    });

    it("Anyone can deploy new LCs with unlockTime in the future", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(
        A,
        twoYearsFromSystemDeployment,
        { from: teamMember_1 }
      );
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: E }
      );

      const LC_1 = await th.getLCFromDeploymentTx(LCDeploymentTx_1);
      const LC_2 = await th.getLCFromDeploymentTx(LCDeploymentTx_2);

      // Check deployments succeeded
      assert.isTrue(LCDeploymentTx_1.receipt.status);
      assert.isTrue(LCDeploymentTx_2.receipt.status);

      // Check LCs have unlockTimes in the future
      unlockTime_1 = await LC_1.unlockTime();
      unlockTime_2 = await LC_2.unlockTime();

      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      assert.isTrue(unlockTime_1.gt(currentTime));
      assert.isTrue(unlockTime_2.gt(currentTime));
    });
  });

  describe("Beneficiary withdrawal from initial LC", async accounts => {
    it("A beneficiary can withdraw their full entitlement from their LC", async () => {
      // Check OPL balances of investors' LCs are equal to their initial entitlements
      assert.equal(await oplToken.balanceOf(LC_I1.address), investorInitialEntitlement_1);
      assert.equal(await oplToken.balanceOf(LC_I2.address), investorInitialEntitlement_2);
      assert.equal(await oplToken.balanceOf(LC_I3.address), investorInitialEntitlement_3);

      // Check OPL balances of investors are 0
      assert.equal(await oplToken.balanceOf(investor_1), "0");
      assert.equal(await oplToken.balanceOf(investor_2), "0");
      assert.equal(await oplToken.balanceOf(investor_3), "0");

      // All investors withdraw from their respective LCs
      await LC_I1.withdrawOPL({ from: investor_1 });
      await LC_I2.withdrawOPL({ from: investor_2 });
      await LC_I3.withdrawOPL({ from: investor_3 });

      // Check OPL balances of investors now equal their entitlements
      assert.equal(await oplToken.balanceOf(investor_1), investorInitialEntitlement_1);
      assert.equal(await oplToken.balanceOf(investor_2), investorInitialEntitlement_2);
      assert.equal(await oplToken.balanceOf(investor_3), investorInitialEntitlement_3);

      // Check OPL balances of investors' LCs are now 0
      assert.equal(await oplToken.balanceOf(LC_I1.address), "0");
      assert.equal(await oplToken.balanceOf(LC_I2.address), "0");
      assert.equal(await oplToken.balanceOf(LC_I3.address), "0");
    });

    it("A beneficiary on a vesting schedule can withdraw their total vested amount from their LC", async () => {
      // Get OPL balances of LCs for beneficiaries (team members) on vesting schedules
      const OPLBalanceOfLC_T1_Before = await oplToken.balanceOf(LC_T1.address);
      const OPLBalanceOfLC_T2_Before = await oplToken.balanceOf(LC_T2.address);
      const OPLBalanceOfLC_T3_Before = await oplToken.balanceOf(LC_T3.address);

      // Check OPL balances of vesting beneficiaries' LCs are greater than their initial entitlements
      assert.isTrue(OPLBalanceOfLC_T1_Before.gt(th.toBN(teamMemberInitialEntitlement_1)));
      assert.isTrue(OPLBalanceOfLC_T2_Before.gt(th.toBN(teamMemberInitialEntitlement_2)));
      assert.isTrue(OPLBalanceOfLC_T3_Before.gt(th.toBN(teamMemberInitialEntitlement_3)));

      // Check OPL balances of beneficiaries are 0
      assert.equal(await oplToken.balanceOf(teamMember_1), "0");
      assert.equal(await oplToken.balanceOf(teamMember_2), "0");
      assert.equal(await oplToken.balanceOf(teamMember_3), "0");

      // All beneficiaries withdraw from their respective LCs
      await LC_T1.withdrawOPL({ from: teamMember_1 });
      await LC_T2.withdrawOPL({ from: teamMember_2 });
      await LC_T3.withdrawOPL({ from: teamMember_3 });

      // Check beneficiaries' OPL balances now equal their accumulated vested entitlements
      assert.isTrue((await oplToken.balanceOf(teamMember_1)).eq(OPLBalanceOfLC_T1_Before));
      assert.isTrue((await oplToken.balanceOf(teamMember_2)).eq(OPLBalanceOfLC_T2_Before));
      assert.isTrue((await oplToken.balanceOf(teamMember_3)).eq(OPLBalanceOfLC_T3_Before));

      // Check OPL balances of beneficiaries' LCs are now 0
      assert.equal(await oplToken.balanceOf(LC_T1.address), "0");
      assert.equal(await oplToken.balanceOf(LC_T2.address), "0");
      assert.equal(await oplToken.balanceOf(LC_T3.address), "0");
    });

    it("Beneficiaries can withraw full OPL balance of LC if it has increased since lockup period ended", async () => {
      // Check OPL balances of investors' LCs are equal to their initial entitlements
      assert.equal(await oplToken.balanceOf(LC_I1.address), investorInitialEntitlement_1);
      assert.equal(await oplToken.balanceOf(LC_I2.address), investorInitialEntitlement_2);
      assert.equal(await oplToken.balanceOf(LC_I3.address), investorInitialEntitlement_3);

      // Check OPL balances of investors are 0
      assert.equal(await oplToken.balanceOf(investor_1), "0");
      assert.equal(await oplToken.balanceOf(investor_2), "0");
      assert.equal(await oplToken.balanceOf(investor_3), "0");

      // OPL multisig sends extra OPL to investor LCs
      await oplToken.transfer(LC_I1.address, dec(1, 24), { from: multisig });
      await oplToken.transfer(LC_I2.address, dec(1, 24), { from: multisig });
      await oplToken.transfer(LC_I3.address, dec(1, 24), { from: multisig });

      // 1 month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // OPL multisig again sends extra OPL to investor LCs
      await oplToken.transfer(LC_I1.address, dec(1, 24), { from: multisig });
      await oplToken.transfer(LC_I2.address, dec(1, 24), { from: multisig });
      await oplToken.transfer(LC_I3.address, dec(1, 24), { from: multisig });

      // Get OPL balances of LCs for investors
      const OPLBalanceOfLC_I1_Before = await oplToken.balanceOf(LC_I1.address);
      const OPLBalanceOfLC_I2_Before = await oplToken.balanceOf(LC_I2.address);
      const OPLBalanceOfLC_I3_Before = await oplToken.balanceOf(LC_I3.address);

      // Check OPL balances of investors' LCs are greater than their initial entitlements
      assert.isTrue(OPLBalanceOfLC_I1_Before.gt(th.toBN(investorInitialEntitlement_1)));
      assert.isTrue(OPLBalanceOfLC_I2_Before.gt(th.toBN(investorInitialEntitlement_2)));
      assert.isTrue(OPLBalanceOfLC_I3_Before.gt(th.toBN(investorInitialEntitlement_3)));

      // All investors withdraw from their respective LCs
      await LC_I1.withdrawOPL({ from: investor_1 });
      await LC_I2.withdrawOPL({ from: investor_2 });
      await LC_I3.withdrawOPL({ from: investor_3 });

      // Check OPL balances of investors now equal their LC balances prior to withdrawal
      assert.isTrue((await oplToken.balanceOf(investor_1)).eq(OPLBalanceOfLC_I1_Before));
      assert.isTrue((await oplToken.balanceOf(investor_2)).eq(OPLBalanceOfLC_I2_Before));
      assert.isTrue((await oplToken.balanceOf(investor_3)).eq(OPLBalanceOfLC_I3_Before));

      // Check OPL balances of investors' LCs are now 0
      assert.equal(await oplToken.balanceOf(LC_I1.address), "0");
      assert.equal(await oplToken.balanceOf(LC_I2.address), "0");
      assert.equal(await oplToken.balanceOf(LC_I3.address), "0");
    });
  });

  describe("Withdrawal attempts from LCs by non-beneficiaries", async accounts => {
    it("OPL Multisig can't withdraw from a LC they deployed through the Factory", async () => {
      try {
        const withdrawalAttempt = await LC_T1.withdrawOPL({ from: multisig });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("OPL Multisig can't withdraw from a LC that someone else deployed", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        oneYearFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //OPL multisig fund the newly deployed LCs
      await oplToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // OPL multisig attempts withdrawal from LC
      try {
        const withdrawalAttempt_B = await LC_B.withdrawOPL({ from: multisig });
        assert.isFalse(withdrawalAttempt_B.receipt.status);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("Non-beneficiaries cannot withdraw from a LC", async () => {
      const variousEOAs = [
        teamMember_1,
        teamMember_3,
        liquityAG,
        investor_1,
        investor_2,
        investor_3,
        A,
        B,
        C,
        D,
        E
      ];

      // Several EOAs attempt to withdraw from the LC that has teamMember_2 as beneficiary
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_T2.withdrawOPL({ from: account });
          assert.isFalse(withdrawalAttempt.receipt.status);
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary");
        }
      }
    });
  });

  describe("Transferring OPL", async accounts => {
    it("OPL multisig can transfer OPL to LCs they deployed", async () => {
      const initialOPLBalanceOfLC_T1 = await oplToken.balanceOf(LC_T1.address);
      const initialOPLBalanceOfLC_T2 = await oplToken.balanceOf(LC_T2.address);
      const initialOPLBalanceOfLC_T3 = await oplToken.balanceOf(LC_T3.address);

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // OPL multisig transfers vesting amount
      await oplToken.transfer(LC_T1.address, dec(1, 24), { from: multisig });
      await oplToken.transfer(LC_T2.address, dec(1, 24), { from: multisig });
      await oplToken.transfer(LC_T3.address, dec(1, 24), { from: multisig });

      // Get new LC OPL balances
      const OPLBalanceOfLC_T1_1 = await oplToken.balanceOf(LC_T1.address);
      const OPLBalanceOfLC_T2_1 = await oplToken.balanceOf(LC_T2.address);
      const OPLBalanceOfLC_T3_1 = await oplToken.balanceOf(LC_T3.address);

      // // Check team member LC balances have increased
      assert.isTrue(
        OPLBalanceOfLC_T1_1.eq(th.toBN(initialOPLBalanceOfLC_T1).add(th.toBN(dec(1, 24))))
      );
      assert.isTrue(
        OPLBalanceOfLC_T2_1.eq(th.toBN(initialOPLBalanceOfLC_T2).add(th.toBN(dec(1, 24))))
      );
      assert.isTrue(
        OPLBalanceOfLC_T3_1.eq(th.toBN(initialOPLBalanceOfLC_T3).add(th.toBN(dec(1, 24))))
      );

      // Another month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // OPL multisig transfers vesting amount
      await oplToken.transfer(LC_T1.address, dec(1, 24), { from: multisig });
      await oplToken.transfer(LC_T2.address, dec(1, 24), { from: multisig });
      await oplToken.transfer(LC_T3.address, dec(1, 24), { from: multisig });

      // Get new LC OPL balances
      const OPLBalanceOfLC_T1_2 = await oplToken.balanceOf(LC_T1.address);
      const OPLBalanceOfLC_T2_2 = await oplToken.balanceOf(LC_T2.address);
      const OPLBalanceOfLC_T3_2 = await oplToken.balanceOf(LC_T3.address);

      // Check team member LC balances have increased again
      assert.isTrue(OPLBalanceOfLC_T1_2.eq(OPLBalanceOfLC_T1_1.add(th.toBN(dec(1, 24)))));
      assert.isTrue(OPLBalanceOfLC_T2_2.eq(OPLBalanceOfLC_T2_1.add(th.toBN(dec(1, 24)))));
      assert.isTrue(OPLBalanceOfLC_T3_2.eq(OPLBalanceOfLC_T3_1.add(th.toBN(dec(1, 24)))));
    });

    it("OPL multisig can transfer tokens to LCs deployed by anyone", async () => {
      // A, B, C each deploy a lockup contract ith themself as beneficiary
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: A }
      );
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        justOverOneYearFromSystemDeployment,
        { from: B }
      );
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        { from: C }
      );

      const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);
      const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C);

      // Check balances of LCs are 0
      assert.equal(await oplToken.balanceOf(LC_A.address), "0");
      assert.equal(await oplToken.balanceOf(LC_B.address), "0");
      assert.equal(await oplToken.balanceOf(LC_C.address), "0");

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // OPL multisig transfers OPL to LCs deployed by other accounts
      await oplToken.transfer(LC_A.address, dec(1, 24), { from: multisig });
      await oplToken.transfer(LC_B.address, dec(2, 24), { from: multisig });
      await oplToken.transfer(LC_C.address, dec(3, 24), { from: multisig });

      // Check balances of LCs have increased
      assert.equal(await oplToken.balanceOf(LC_A.address), dec(1, 24));
      assert.equal(await oplToken.balanceOf(LC_B.address), dec(2, 24));
      assert.equal(await oplToken.balanceOf(LC_C.address), dec(3, 24));
    });

    it("OPL multisig can transfer OPL directly to any externally owned account", async () => {
      // Check OPL balances of EOAs
      assert.equal(await oplToken.balanceOf(A), "0");
      assert.equal(await oplToken.balanceOf(B), "0");
      assert.equal(await oplToken.balanceOf(C), "0");

      // OPL multisig transfers OPL to EOAs
      const txA = await oplToken.transfer(A, dec(1, 24), { from: multisig });
      const txB = await oplToken.transfer(B, dec(2, 24), { from: multisig });
      const txC = await oplToken.transfer(C, dec(3, 24), { from: multisig });

      // Check new balances have increased by correct amount
      assert.equal(await oplToken.balanceOf(A), dec(1, 24));
      assert.equal(await oplToken.balanceOf(B), dec(2, 24));
      assert.equal(await oplToken.balanceOf(C), dec(3, 24));
    });

    it("Anyone can transfer OPL to LCs deployed by anyone", async () => {
      // Start D, E, F with some OPL
      await oplToken.transfer(D, dec(1, 24), { from: multisig });
      await oplToken.transfer(E, dec(2, 24), { from: multisig });
      await oplToken.transfer(F, dec(3, 24), { from: multisig });

      // H, I, J deploy lockup contracts with A, B, C as beneficiaries, respectively
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: H }
      );
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        justOverOneYearFromSystemDeployment,
        { from: I }
      );
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        { from: J }
      );

      // Grab contract addresses from deployment tx events
      const LCAddress_A = await th.getLCAddressFromDeploymentTx(deployedLCtx_A);
      const LCAddress_B = await th.getLCAddressFromDeploymentTx(deployedLCtx_B);
      const LCAddress_C = await th.getLCAddressFromDeploymentTx(deployedLCtx_C);

      // Check balances of LCs are 0
      assert.equal(await oplToken.balanceOf(LCAddress_A), "0");
      assert.equal(await oplToken.balanceOf(LCAddress_B), "0");
      assert.equal(await oplToken.balanceOf(LCAddress_C), "0");

      // D, E, F transfer OPL to LCs
      await oplToken.transfer(LCAddress_A, dec(1, 24), { from: D });
      await oplToken.transfer(LCAddress_B, dec(2, 24), { from: E });
      await oplToken.transfer(LCAddress_C, dec(3, 24), { from: F });

      // Check balances of LCs has increased
      assert.equal(await oplToken.balanceOf(LCAddress_A), dec(1, 24));
      assert.equal(await oplToken.balanceOf(LCAddress_B), dec(2, 24));
      assert.equal(await oplToken.balanceOf(LCAddress_C), dec(3, 24));
    });

    it("Anyone can transfer to an EOA", async () => {
      // Start D, E, liquityAG with some OPL
      await oplToken.unprotectedMint(D, dec(1, 24));
      await oplToken.unprotectedMint(E, dec(2, 24));
      await oplToken.unprotectedMint(liquityAG, dec(3, 24));
      await oplToken.unprotectedMint(multisig, dec(4, 24));

      // OPL holders transfer to other EOAs
      const OPLtransferTx_1 = await oplToken.transfer(A, dec(1, 18), { from: D });
      const OPLtransferTx_2 = await oplToken.transfer(liquityAG, dec(1, 18), { from: E });
      const OPLtransferTx_3 = await oplToken.transfer(F, dec(1, 18), { from: liquityAG });
      const OPLtransferTx_4 = await oplToken.transfer(G, dec(1, 18), { from: multisig });

      assert.isTrue(OPLtransferTx_1.receipt.status);
      assert.isTrue(OPLtransferTx_2.receipt.status);
      assert.isTrue(OPLtransferTx_3.receipt.status);
      assert.isTrue(OPLtransferTx_4.receipt.status);
    });

    it("Anyone can approve any EOA to spend their OPL", async () => {
      // EOAs approve EOAs to spend OPL
      const OPLapproveTx_1 = await oplToken.approve(A, dec(1, 18), { from: multisig });
      const OPLapproveTx_2 = await oplToken.approve(B, dec(1, 18), { from: G });
      const OPLapproveTx_3 = await oplToken.approve(liquityAG, dec(1, 18), { from: F });
      await assert.isTrue(OPLapproveTx_1.receipt.status);
      await assert.isTrue(OPLapproveTx_2.receipt.status);
      await assert.isTrue(OPLapproveTx_3.receipt.status);
    });

    it("Anyone can increaseAllowance for any EOA or Liquity contract", async () => {
      // Anyone can increaseAllowance of EOAs to spend OPL
      const OPLIncreaseAllowanceTx_1 = await oplToken.increaseAllowance(A, dec(1, 18), {
        from: multisig
      });
      const OPLIncreaseAllowanceTx_2 = await oplToken.increaseAllowance(B, dec(1, 18), { from: G });
      const OPLIncreaseAllowanceTx_3 = await oplToken.increaseAllowance(multisig, dec(1, 18), {
        from: F
      });
      await assert.isTrue(OPLIncreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(OPLIncreaseAllowanceTx_2.receipt.status);
      await assert.isTrue(OPLIncreaseAllowanceTx_3.receipt.status);

      // Increase allowance of Liquity contracts from F
      for (const contract of Object.keys(coreContracts)) {
        const OPLIncreaseAllowanceTx = await oplToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(OPLIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of Liquity contracts from multisig
      for (const contract of Object.keys(coreContracts)) {
        const OPLIncreaseAllowanceTx = await oplToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(OPLIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of OPL contracts from F
      for (const contract of Object.keys(OPLContracts)) {
        const OPLIncreaseAllowanceTx = await oplToken.increaseAllowance(
          OPLContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(OPLIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of LQT contracts from multisig
      for (const contract of Object.keys(OPLContracts)) {
        const OPLIncreaseAllowanceTx = await oplToken.increaseAllowance(
          OPLContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(OPLIncreaseAllowanceTx.receipt.status);
      }
    });

    it("Anyone can decreaseAllowance for any EOA or Liquity contract", async () => {
      //First, increase allowance of A, B LiqAG and core contracts
      const OPLapproveTx_1 = await oplToken.approve(A, dec(1, 18), { from: multisig });
      const OPLapproveTx_2 = await oplToken.approve(B, dec(1, 18), { from: G });
      const OPLapproveTx_3 = await oplToken.approve(multisig, dec(1, 18), { from: F });
      await assert.isTrue(OPLapproveTx_1.receipt.status);
      await assert.isTrue(OPLapproveTx_2.receipt.status);
      await assert.isTrue(OPLapproveTx_3.receipt.status);

      // --- SETUP ---

      // IncreaseAllowance of core contracts, from F
      for (const contract of Object.keys(coreContracts)) {
        const OPLtransferTx = await oplToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(OPLtransferTx.receipt.status);
      }

      // IncreaseAllowance of core contracts, from multisig
      for (const contract of Object.keys(coreContracts)) {
        const OPLtransferTx = await oplToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(OPLtransferTx.receipt.status);
      }

      // Increase allowance of OPL contracts from F
      for (const contract of Object.keys(OPLContracts)) {
        const OPLIncreaseAllowanceTx = await oplToken.increaseAllowance(
          OPLContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(OPLIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of LQTT contracts from multisig
      for (const contract of Object.keys(OPLContracts)) {
        const OPLIncreaseAllowanceTx = await oplToken.increaseAllowance(
          OPLContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(OPLIncreaseAllowanceTx.receipt.status);
      }

      // --- TEST ---

      // Decrease allowance of A, B, multisig
      const OPLDecreaseAllowanceTx_1 = await oplToken.decreaseAllowance(A, dec(1, 18), {
        from: multisig
      });
      const OPLDecreaseAllowanceTx_2 = await oplToken.decreaseAllowance(B, dec(1, 18), { from: G });
      const OPLDecreaseAllowanceTx_3 = await oplToken.decreaseAllowance(multisig, dec(1, 18), {
        from: F
      });
      await assert.isTrue(OPLDecreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(OPLDecreaseAllowanceTx_2.receipt.status);
      await assert.isTrue(OPLDecreaseAllowanceTx_3.receipt.status);

      // Decrease allowance of core contracts, from F
      for (const contract of Object.keys(coreContracts)) {
        const OPLDecreaseAllowanceTx = await oplToken.decreaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(OPLDecreaseAllowanceTx.receipt.status);
      }

      // Decrease allowance of core contracts from multisig
      for (const contract of Object.keys(coreContracts)) {
        const OPLDecreaseAllowanceTx = await oplToken.decreaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(OPLDecreaseAllowanceTx.receipt.status);
      }

      // Decrease allowance of OPL contracts from F
      for (const contract of Object.keys(OPLContracts)) {
        const OPLIncreaseAllowanceTx = await oplToken.decreaseAllowance(
          OPLContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(OPLIncreaseAllowanceTx.receipt.status);
      }

      // Decrease allowance of OPL contracts from multisig
      for (const contract of Object.keys(OPLContracts)) {
        const OPLIncreaseAllowanceTx = await oplToken.decreaseAllowance(
          OPLContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(OPLIncreaseAllowanceTx.receipt.status);
      }
    });

    it("Anyone can be the sender in a transferFrom() call", async () => {
      // Fund B, C
      await oplToken.unprotectedMint(B, dec(1, 18));
      await oplToken.unprotectedMint(C, dec(1, 18));

      // LiqAG, B, C approve F, G, multisig respectively
      await oplToken.approve(F, dec(1, 18), { from: multisig });
      await oplToken.approve(G, dec(1, 18), { from: B });
      await oplToken.approve(multisig, dec(1, 18), { from: C });

      // Approved addresses transfer from the address they're approved for
      const OPLtransferFromTx_1 = await oplToken.transferFrom(multisig, F, dec(1, 18), { from: F });
      const OPLtransferFromTx_2 = await oplToken.transferFrom(B, multisig, dec(1, 18), { from: G });
      const OPLtransferFromTx_3 = await oplToken.transferFrom(C, A, dec(1, 18), { from: multisig });
      await assert.isTrue(OPLtransferFromTx_1.receipt.status);
      await assert.isTrue(OPLtransferFromTx_2.receipt.status);
      await assert.isTrue(OPLtransferFromTx_3.receipt.status);
    });

    it("Anyone can stake their OPL in the staking contract", async () => {
      // Fund F
      await oplToken.unprotectedMint(F, dec(1, 18));

      const OPLStakingTx_1 = await oplStaking.stake(dec(1, 18), { from: F });
      const OPLStakingTx_2 = await oplStaking.stake(dec(1, 18), { from: multisig });
      await assert.isTrue(OPLStakingTx_1.receipt.status);
      await assert.isTrue(OPLStakingTx_2.receipt.status);
    });
  });

  describe("Withdrawal Attempts on new LCs before unlockTime has passed", async accounts => {
    it("OPL Deployer can't withdraw from a funded LC they deployed for another beneficiary through the Factory, before the unlockTime", async () => {
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      // OPL multisig attempts withdrawal from LC they deployed through the Factory
      try {
        const withdrawalAttempt = await LC_B.withdrawOPL({ from: multisig });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("OPL Deployer can't withdraw from a funded LC that someone else deployed, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //OPL multisig fund the newly deployed LCs
      await oplToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      // OPL multisig attempts withdrawal from LCs
      try {
        const withdrawalAttempt_B = await LC_B.withdrawOPL({ from: multisig });
        assert.isFalse(withdrawalAttempt_B.receipt.status);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("Beneficiary can't withdraw from their funded LC, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // OPL multisig funds contracts
      await oplToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      try {
        const beneficiary = await LC_B.beneficiary();
        const withdrawalAttempt = await LC_B.withdrawOPL({ from: beneficiary });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(error.message, "LockupContract: The lockup duration must have passed");
      }
    });

    it("No one can withdraw from a beneficiary's funded LC, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // OPL multisig funds contracts
      await oplToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      const variousEOAs = [teamMember_2, multisig, investor_1, A, C, D, E];

      // Several EOAs attempt to withdraw from LC deployed by D
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_B.withdrawOPL({ from: account });
          assert.isFalse(withdrawalAttempt.receipt.status);
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary");
        }
      }
    });
  });

  describe("Withdrawals from new LCs after unlockTime has passed", async accounts => {
    it("OPL Deployer can't withdraw from a funded LC they deployed for another beneficiary through the Factory, after the unlockTime", async () => {
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      // OPL multisig attempts withdrawal from LC they deployed through the Factory
      try {
        const withdrawalAttempt = await LC_B.withdrawOPL({ from: multisig });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("OPL multisig can't withdraw from a funded LC when they are not the beneficiary, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //OPL multisig fund the newly deployed LC
      await oplToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      // OPL multisig attempts withdrawal from LCs
      try {
        const withdrawalAttempt_B = await LC_B.withdrawOPL({ from: multisig });
        assert.isFalse(withdrawalAttempt_B.receipt.status);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("Beneficiary can withdraw from their funded LC, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // OPL multisig funds contract
      await oplToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      const beneficiary = await LC_B.beneficiary();
      assert.equal(beneficiary, B);

      // Get B's balance before
      const B_balanceBefore = await oplToken.balanceOf(B);
      assert.equal(B_balanceBefore, "0");

      const withdrawalAttempt = await LC_B.withdrawOPL({ from: B });
      assert.isTrue(withdrawalAttempt.receipt.status);

      // Get B's balance after
      const B_balanceAfter = await oplToken.balanceOf(B);
      assert.equal(B_balanceAfter, dec(2, 18));
    });

    it("Non-beneficiaries can't withdraw from a beneficiary's funded LC, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // OPL multisig funds contracts
      await oplToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      const variousEOAs = [teamMember_2, liquityAG, investor_1, A, C, D, E];

      // Several EOAs attempt to withdraw from LC deployed by D
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_B.withdrawOPL({ from: account });
          assert.isFalse(withdrawalAttempt.receipt.status);
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary");
        }
      }
    });
  });
});
