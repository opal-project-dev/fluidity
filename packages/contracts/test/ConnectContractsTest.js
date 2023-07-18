const deploymentHelper = require("../utils/deploymentHelpers.js");

contract(
  "Deployment script - Sets correct contract addresses dependencies after deployment",
  async accounts => {
    const [owner] = accounts;

    const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

    let priceFeed;
    let oneuToken;
    let sortedTroves;
    let troveManager;
    let activePool;
    let stabilityPool;
    let defaultPool;
    let functionCaller;
    let borrowerOperations;
    let lqtyStaking;
    let lqtyToken;
    let communityIssuance;
    let lockupContractFactory;

    before(async () => {
      const coreContracts = await deploymentHelper.deployLiquityCore();
      const OPLContracts = await deploymentHelper.deployOPLContracts(
        bountyAddress,
        lpRewardsAddress,
        multisig
      );

      priceFeed = coreContracts.priceFeedTestnet;
      oneuToken = coreContracts.oneuToken;
      sortedTroves = coreContracts.sortedTroves;
      troveManager = coreContracts.troveManager;
      activePool = coreContracts.activePool;
      stabilityPool = coreContracts.stabilityPool;
      defaultPool = coreContracts.defaultPool;
      functionCaller = coreContracts.functionCaller;
      borrowerOperations = coreContracts.borrowerOperations;

      lqtyStaking = OPLContracts.lqtyStaking;
      lqtyToken = OPLContracts.lqtyToken;
      communityIssuance = OPLContracts.communityIssuance;
      lockupContractFactory = OPLContracts.lockupContractFactory;

      await deploymentHelper.connectOPLContracts(OPLContracts);
      await deploymentHelper.connectCoreContracts(coreContracts, OPLContracts);
      await deploymentHelper.connectOPLContractsToCore(OPLContracts, coreContracts);
    });

    it("Sets the correct PriceFeed address in TroveManager", async () => {
      const priceFeedAddress = priceFeed.address;

      const recordedPriceFeedAddress = await troveManager.priceFeed();

      assert.equal(priceFeedAddress, recordedPriceFeedAddress);
    });

    it("Sets the correct ONEUToken address in TroveManager", async () => {
      const oneuTokenAddress = oneuToken.address;

      const recordedClvTokenAddress = await troveManager.oneuToken();

      assert.equal(oneuTokenAddress, recordedClvTokenAddress);
    });

    it("Sets the correct SortedTroves address in TroveManager", async () => {
      const sortedTrovesAddress = sortedTroves.address;

      const recordedSortedTrovesAddress = await troveManager.sortedTroves();

      assert.equal(sortedTrovesAddress, recordedSortedTrovesAddress);
    });

    it("Sets the correct BorrowerOperations address in TroveManager", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress = await troveManager.borrowerOperationsAddress();

      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress);
    });

    // ActivePool in TroveM
    it("Sets the correct ActivePool address in TroveManager", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddresss = await troveManager.activePool();

      assert.equal(activePoolAddress, recordedActivePoolAddresss);
    });

    // DefaultPool in TroveM
    it("Sets the correct DefaultPool address in TroveManager", async () => {
      const defaultPoolAddress = defaultPool.address;

      const recordedDefaultPoolAddresss = await troveManager.defaultPool();

      assert.equal(defaultPoolAddress, recordedDefaultPoolAddresss);
    });

    // StabilityPool in TroveM
    it("Sets the correct StabilityPool address in TroveManager", async () => {
      const stabilityPoolAddress = stabilityPool.address;

      const recordedStabilityPoolAddresss = await troveManager.stabilityPool();

      assert.equal(stabilityPoolAddress, recordedStabilityPoolAddresss);
    });

    // OPL Staking in TroveM
    it("Sets the correct OPLStaking address in TroveManager", async () => {
      const lqtyStakingAddress = lqtyStaking.address;

      const recordedOPLStakingAddress = await troveManager.lqtyStaking();
      assert.equal(lqtyStakingAddress, recordedOPLStakingAddress);
    });

    // Active Pool

    it("Sets the correct StabilityPool address in ActivePool", async () => {
      const stabilityPoolAddress = stabilityPool.address;

      const recordedStabilityPoolAddress = await activePool.stabilityPoolAddress();

      assert.equal(stabilityPoolAddress, recordedStabilityPoolAddress);
    });

    it("Sets the correct DefaultPool address in ActivePool", async () => {
      const defaultPoolAddress = defaultPool.address;

      const recordedDefaultPoolAddress = await activePool.defaultPoolAddress();

      assert.equal(defaultPoolAddress, recordedDefaultPoolAddress);
    });

    it("Sets the correct BorrowerOperations address in ActivePool", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress = await activePool.borrowerOperationsAddress();

      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress);
    });

    it("Sets the correct TroveManager address in ActivePool", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await activePool.troveManagerAddress();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // Stability Pool

    it("Sets the correct ActivePool address in StabilityPool", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await stabilityPool.activePool();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    it("Sets the correct BorrowerOperations address in StabilityPool", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress = await stabilityPool.borrowerOperations();

      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress);
    });

    it("Sets the correct ONEUToken address in StabilityPool", async () => {
      const oneuTokenAddress = oneuToken.address;

      const recordedClvTokenAddress = await stabilityPool.oneuToken();

      assert.equal(oneuTokenAddress, recordedClvTokenAddress);
    });

    it("Sets the correct TroveManager address in StabilityPool", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await stabilityPool.troveManager();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // Default Pool

    it("Sets the correct TroveManager address in DefaultPool", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await defaultPool.troveManagerAddress();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    it("Sets the correct ActivePool address in DefaultPool", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await defaultPool.activePoolAddress();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    it("Sets the correct TroveManager address in SortedTroves", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress = await sortedTroves.borrowerOperationsAddress();
      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress);
    });

    it("Sets the correct BorrowerOperations address in SortedTroves", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await sortedTroves.troveManager();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    //--- BorrowerOperations ---

    // TroveManager in BO
    it("Sets the correct TroveManager address in BorrowerOperations", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await borrowerOperations.troveManager();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // setPriceFeed in BO
    it("Sets the correct PriceFeed address in BorrowerOperations", async () => {
      const priceFeedAddress = priceFeed.address;

      const recordedPriceFeedAddress = await borrowerOperations.priceFeed();
      assert.equal(priceFeedAddress, recordedPriceFeedAddress);
    });

    // setSortedTroves in BO
    it("Sets the correct SortedTroves address in BorrowerOperations", async () => {
      const sortedTrovesAddress = sortedTroves.address;

      const recordedSortedTrovesAddress = await borrowerOperations.sortedTroves();
      assert.equal(sortedTrovesAddress, recordedSortedTrovesAddress);
    });

    // setActivePool in BO
    it("Sets the correct ActivePool address in BorrowerOperations", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await borrowerOperations.activePool();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    // setDefaultPool in BO
    it("Sets the correct DefaultPool address in BorrowerOperations", async () => {
      const defaultPoolAddress = defaultPool.address;

      const recordedDefaultPoolAddress = await borrowerOperations.defaultPool();
      assert.equal(defaultPoolAddress, recordedDefaultPoolAddress);
    });

    // OPL Staking in BO
    it("Sets the correct OPLStaking address in BorrowerOperations", async () => {
      const lqtyStakingAddress = lqtyStaking.address;

      const recordedOPLStakingAddress = await borrowerOperations.lqtyStakingAddress();
      assert.equal(lqtyStakingAddress, recordedOPLStakingAddress);
    });

    // --- OPL Staking ---

    // Sets OPLToken in OPLStaking
    it("Sets the correct OPLToken address in OPLStaking", async () => {
      const lqtyTokenAddress = lqtyToken.address;

      const recordedOPLTokenAddress = await lqtyStaking.lqtyToken();
      assert.equal(lqtyTokenAddress, recordedOPLTokenAddress);
    });

    // Sets ActivePool in OPLStaking
    it("Sets the correct ActivePool address in OPLStaking", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await lqtyStaking.activePoolAddress();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    // Sets ONEUToken in OPLStaking
    it("Sets the correct ActivePool address in OPLStaking", async () => {
      const oneuTokenAddress = oneuToken.address;

      const recordedONEUTokenAddress = await lqtyStaking.oneuToken();
      assert.equal(oneuTokenAddress, recordedONEUTokenAddress);
    });

    // Sets TroveManager in OPLStaking
    it("Sets the correct ActivePool address in OPLStaking", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await lqtyStaking.troveManagerAddress();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // Sets BorrowerOperations in OPLStaking
    it("Sets the correct BorrowerOperations address in OPLStaking", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress = await lqtyStaking.borrowerOperationsAddress();
      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress);
    });

    // ---  OPLToken ---

    // Sets CI in OPLToken
    it("Sets the correct CommunityIssuance address in OPLToken", async () => {
      const communityIssuanceAddress = communityIssuance.address;

      const recordedcommunityIssuanceAddress = await lqtyToken.communityIssuanceAddress();
      assert.equal(communityIssuanceAddress, recordedcommunityIssuanceAddress);
    });

    // Sets OPLStaking in OPLToken
    it("Sets the correct OPLStaking address in OPLToken", async () => {
      const lqtyStakingAddress = lqtyStaking.address;

      const recordedOPLStakingAddress = await lqtyToken.lqtyStakingAddress();
      assert.equal(lqtyStakingAddress, recordedOPLStakingAddress);
    });

    // Sets LCF in OPLToken
    it("Sets the correct LockupContractFactory address in OPLToken", async () => {
      const LCFAddress = lockupContractFactory.address;

      const recordedLCFAddress = await lqtyToken.lockupContractFactory();
      assert.equal(LCFAddress, recordedLCFAddress);
    });

    // --- LCF  ---

    // Sets OPLToken in LockupContractFactory
    it("Sets the correct OPLToken address in LockupContractFactory", async () => {
      const lqtyTokenAddress = lqtyToken.address;

      const recordedOPLTokenAddress = await lockupContractFactory.lqtyTokenAddress();
      assert.equal(lqtyTokenAddress, recordedOPLTokenAddress);
    });

    // --- CI ---

    // Sets OPLToken in CommunityIssuance
    it("Sets the correct OPLToken address in CommunityIssuance", async () => {
      const lqtyTokenAddress = lqtyToken.address;

      const recordedOPLTokenAddress = await communityIssuance.lqtyToken();
      assert.equal(lqtyTokenAddress, recordedOPLTokenAddress);
    });

    it("Sets the correct StabilityPool address in CommunityIssuance", async () => {
      const stabilityPoolAddress = stabilityPool.address;

      const recordedStabilityPoolAddress = await communityIssuance.stabilityPoolAddress();
      assert.equal(stabilityPoolAddress, recordedStabilityPoolAddress);
    });
  }
);
