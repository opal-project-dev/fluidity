const { ChainlinkAggregatorV3Interface } = require("./ABIs/ChainlinkAggregatorV3Interface.js");
const { TestHelper: th, TimeValues: timeVals } = require("../utils/testHelpers.js");
const { dec } = th;
const MainnetDeploymentHelper = require("../utils/mainnetDeploymentHelpers.js");
const toBigNum = ethers.BigNumber.from;

async function mainnetDeploy(configParams) {
  const date = new Date();
  console.log(date.toUTCString());
  const deployerWallet = (await ethers.getSigners())[0];
  // const account2Wallet = (await ethers.getSigners())[1]
  const mainnetDeploymentHelper = new MainnetDeploymentHelper(configParams, deployerWallet);

  const deploymentState = mainnetDeploymentHelper.loadPreviousDeployment();

  console.log(`deployer address: ${deployerWallet.address}`);
  assert.equal(deployerWallet.address, configParams.opalAddrs.DEPLOYER);

  let deployerAUTBalance = await ethers.provider.getBalance(deployerWallet.address);
  console.log(`deployerAUTBalance before: ${deployerAUTBalance}`);

  deployerAUTBalance = await ethers.provider.getBalance(deployerWallet.address);
  console.log(`deployer's AUT balance before deployments: ${deployerAUTBalance}`);

  // Deploy core logic contracts
  const opalCore = await mainnetDeploymentHelper.deployOpalCoreMainnet(deploymentState);
  await mainnetDeploymentHelper.logContractObjects(opalCore);

  // TODO
  // Deploy OPL Contracts
  const OPLContracts = await mainnetDeploymentHelper.deployOPLContractsMainnet(
    configParams.opalAddrs.GENERAL_SAFE, // bounty address
    configParams.opalAddrs.OPL_SAFE, // multisig OPL endowment address
    deploymentState
  );

  // Connect all core contracts up
  await mainnetDeploymentHelper.connectCoreContractsMainnet(
    opalCore,
    OPLContracts,
    configParams.externalAddrs.CHAINLINK_AUTUSD_PROXY
  );
  await mainnetDeploymentHelper.connectOPLContractsMainnet(OPLContracts);
  await mainnetDeploymentHelper.connectOPLContractsToCoreMainnet(OPLContracts, opalCore);

  // Deploy and log a read-only multi-trove getter
  const multiTroveGetter = await mainnetDeploymentHelper.deployMultiTroveGetterMainnet(opalCore, deploymentState);
  console.log(`Multi trove getter address: ${multiTroveGetter.address}`);

  // Log OPL addresses
  await mainnetDeploymentHelper.logContractObjects(OPLContracts);

  // let latestBlock = await ethers.provider.getBlockNumber()
  let deploymentStartTime = await OPLContracts.oplToken.getDeploymentStartTime();

  console.log(`deployment start time: ${deploymentStartTime}`);
  const oneYearFromDeployment = (
    Number(deploymentStartTime) + timeVals.SECONDS_IN_ONE_YEAR
  ).toString();
  console.log(`time oneYearFromDeployment: ${oneYearFromDeployment}`);

  // Deploy LockupContracts - one for each beneficiary
  const lockupContracts = {};

  for (const [investor, investorAddr] of Object.entries(configParams.beneficiaries)) {
    const lockupContractEthersFactory = await ethers.getContractFactory(
      "LockupContract",
      deployerWallet
    );
    if (deploymentState[investor] && deploymentState[investor].address && false) {
      console.log(
        `Using previously deployed ${investor} lockup contract at address ${deploymentState[investor].address}`
      );
      lockupContracts[investor] = new ethers.Contract(
        deploymentState[investor].address,
        lockupContractEthersFactory.interface,
        deployerWallet
      );
    } else {
      const txReceipt = await mainnetDeploymentHelper.sendAndWaitForTransaction(
        OPLContracts.lockupContractFactory.deployLockupContract(investorAddr, oneYearFromDeployment)
      );

      const address = await txReceipt.logs[0].address; // The deployment event emitted from the LC itself is is the first of two events, so this is its address
      lockupContracts[investor] = new ethers.Contract(
        address,
        lockupContractEthersFactory.interface,
        deployerWallet
      );

      deploymentState[investor] = {
        address: address,
        txHash: txReceipt.transactionHash
      };

      mainnetDeploymentHelper.saveDeployment(deploymentState);
    }

    const oplTokenAddr = OPLContracts.oplToken.address;
    // verify
    if (configParams.AUTERSCAN_BASE_URL) {
      await mainnetDeploymentHelper.verifyContract(investor, deploymentState, [
        oplTokenAddr,
        investorAddr,
        oneYearFromDeployment
      ]);
    }
  }

  // // --- TESTS AND CHECKS  ---

  // Deployer repay ONEU
  // console.log(`deployer trove debt before repaying: ${await opalCore.troveManager.getTroveDebt(deployerWallet.address)}`)
  // await mainnetDeploymentHelper.sendAndWaitForTransaction(opalCore.borrowerOperations.repayONEU(dec(800, 18), th.ZERO_ADDRESS, th.ZERO_ADDRESS, {gasPrice, gasLimit: 1000000}))
  // console.log(`deployer trove debt after repaying: ${await opalCore.troveManager.getTroveDebt(deployerWallet.address)}`)

  // Deployer add coll
  // console.log(`deployer trove coll before adding coll: ${await opalCore.troveManager.getTroveColl(deployerWallet.address)}`)
  // await mainnetDeploymentHelper.sendAndWaitForTransaction(opalCore.borrowerOperations.addColl(th.ZERO_ADDRESS, th.ZERO_ADDRESS, {value: dec(2, 'ether'), gasPrice, gasLimit: 1000000}))
  // console.log(`deployer trove coll after addingColl: ${await opalCore.troveManager.getTroveColl(deployerWallet.address)}`)

  // Check chainlink proxy price ---

  const chainlinkProxy = new ethers.Contract(
    configParams.externalAddrs.CHAINLINK_AUTUSD_PROXY,
    ChainlinkAggregatorV3Interface,
    deployerWallet
  );

  // Get latest price
  let chainlinkPrice = await chainlinkProxy.latestAnswer();
  console.log(`current Chainlink price: ${chainlinkPrice}`);

  // // --- Lockup Contracts ---
  console.log("LOCKUP CONTRACT CHECKS");
  // Check lockup contracts exist for each beneficiary with correct unlock time
  for (investor of Object.keys(lockupContracts)) {
    const lockupContract = lockupContracts[investor];
    // check LC references correct OPLToken
    const storedOPLTokenAddr = await lockupContract.oplToken();
    assert.equal(OPLContracts.oplToken.address, storedOPLTokenAddr);
    // Check contract has stored correct beneficary
    const onChainBeneficiary = await lockupContract.beneficiary();
    assert.equal(
      configParams.beneficiaries[investor].toLowerCase(),
      onChainBeneficiary.toLowerCase()
    );
    // Check correct unlock time (1 yr from deployment)
    const unlockTime = await lockupContract.unlockTime();
    assert.equal(oneYearFromDeployment, unlockTime);

    console.log(
      `lockupContract addr: ${lockupContract.address},
            stored OPLToken addr: ${storedOPLTokenAddr}
            beneficiary: ${investor},
            beneficiary addr: ${configParams.beneficiaries[investor]},
            on-chain beneficiary addr: ${onChainBeneficiary},
            unlockTime: ${unlockTime}
            `
    );
  }

  // // --- System stats  ---

  // Number of troves
  const numTroves = await opalCore.troveManager.getTroveOwnersCount();
  console.log(`number of troves: ${numTroves} `);

  // Sorted list size
  const listSize = await opalCore.sortedTroves.getSize();
  console.log(`Trove list size: ${listSize} `);

  // Total system debt and coll
  const entireSystemDebt = await opalCore.troveManager.getEntireSystemDebt();
  const entireSystemColl = await opalCore.troveManager.getEntireSystemColl();
  th.logBN("Entire system debt", entireSystemDebt);
  th.logBN("Entire system coll", entireSystemColl);

  // TCR
  const TCR = await opalCore.troveManager.getTCR(chainlinkPrice);
  console.log(`TCR: ${TCR}`);

  // current borrowing rate
  const baseRate = await opalCore.troveManager.baseRate();
  const currentBorrowingRate = await opalCore.troveManager.getBorrowingRateWithDecay();
  th.logBN("Base rate", baseRate);
  th.logBN("Current borrowing rate", currentBorrowingRate);

  // total SP deposits
  const totalSPDeposits = await opalCore.stabilityPool.getTotalONEUDeposits();
  th.logBN("Total ONEU SP deposits", totalSPDeposits);

  // total OPL Staked in OPLStaking
  const totalOPLStaked = await OPLContracts.oplStaking.totalOPLStaked();
  th.logBN("Total OPL staked", totalOPLStaked);

  // --- State variables ---

  // TroveManager
  console.log("TroveManager state variables:");
  const totalStakes = await opalCore.troveManager.totalStakes();
  const totalStakesSnapshot = await opalCore.troveManager.totalStakesSnapshot();
  const totalCollateralSnapshot = await opalCore.troveManager.totalCollateralSnapshot();
  th.logBN("Total trove stakes", totalStakes);
  th.logBN("Snapshot of total trove stakes before last liq. ", totalStakesSnapshot);
  th.logBN("Snapshot of total trove collateral before last liq. ", totalCollateralSnapshot);

  const L_AUT = await opalCore.troveManager.L_AUT();
  const L_ONEUDebt = await opalCore.troveManager.L_ONEUDebt();
  th.logBN("L_AUT", L_AUT);
  th.logBN("L_ONEUDebt", L_ONEUDebt);

  // StabilityPool
  console.log("StabilityPool state variables:");
  const P = await opalCore.stabilityPool.P();
  const currentScale = await opalCore.stabilityPool.currentScale();
  const currentEpoch = await opalCore.stabilityPool.currentEpoch();
  const S = await opalCore.stabilityPool.epochToScaleToSum(currentEpoch, currentScale);
  const G = await opalCore.stabilityPool.epochToScaleToG(currentEpoch, currentScale);
  th.logBN("Product P", P);
  th.logBN("Current epoch", currentEpoch);
  th.logBN("Current scale", currentScale);
  th.logBN("Sum S, at current epoch and scale", S);
  th.logBN("Sum G, at current epoch and scale", G);

  // OPLStaking
  console.log("OPLStaking state variables:");
  const F_ONEU = await OPLContracts.oplStaking.F_ONEU();
  const F_AUT = await OPLContracts.oplStaking.F_AUT();
  th.logBN("F_ONEU", F_ONEU);
  th.logBN("F_AUT", F_AUT);

  // CommunityIssuance
  console.log("CommunityIssuance state variables:");
  const totalOPLIssued = await OPLContracts.communityIssuance.totalOPLIssued();
  th.logBN("Total OPL issued to depositors / front ends", totalOPLIssued);
}

module.exports = {
  mainnetDeploy
};
