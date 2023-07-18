const SortedTroves = artifacts.require("./SortedTroves.sol");
const TroveManager = artifacts.require("./TroveManager.sol");
const PriceFeedTestnet = artifacts.require("./PriceFeedTestnet.sol");
const ONEUToken = artifacts.require("./ONEUToken.sol");
const ActivePool = artifacts.require("./ActivePool.sol");
const DefaultPool = artifacts.require("./DefaultPool.sol");
const StabilityPool = artifacts.require("./StabilityPool.sol");
const GasPool = artifacts.require("./GasPool.sol");
const CollSurplusPool = artifacts.require("./CollSurplusPool.sol");
const FunctionCaller = artifacts.require("./TestContracts/FunctionCaller.sol");
const BorrowerOperations = artifacts.require("./BorrowerOperations.sol");
const HintHelpers = artifacts.require("./HintHelpers.sol");

const OPLStaking = artifacts.require("./OPLStaking.sol");
const OPLToken = artifacts.require("./OPLToken.sol");
const LockupContractFactory = artifacts.require("./LockupContractFactory.sol");
const CommunityIssuance = artifacts.require("./CommunityIssuance.sol");

const Unipool = artifacts.require("./Unipool.sol");

const OPLTokenTester = artifacts.require("./OPLTokenTester.sol");
const CommunityIssuanceTester = artifacts.require("./CommunityIssuanceTester.sol");
const StabilityPoolTester = artifacts.require("./StabilityPoolTester.sol");
const ActivePoolTester = artifacts.require("./ActivePoolTester.sol");
const DefaultPoolTester = artifacts.require("./DefaultPoolTester.sol");
const LiquityMathTester = artifacts.require("./LiquityMathTester.sol");
const BorrowerOperationsTester = artifacts.require("./BorrowerOperationsTester.sol");
const TroveManagerTester = artifacts.require("./TroveManagerTester.sol");
const ONEUTokenTester = artifacts.require("./ONEUTokenTester.sol");

// Proxy scripts
const BorrowerOperationsScript = artifacts.require("BorrowerOperationsScript");
const BorrowerWrappersScript = artifacts.require("BorrowerWrappersScript");
const TroveManagerScript = artifacts.require("TroveManagerScript");
const StabilityPoolScript = artifacts.require("StabilityPoolScript");
const TokenScript = artifacts.require("TokenScript");
const OPLStakingScript = artifacts.require("OPLStakingScript");
const {
  buildUserProxies,
  BorrowerOperationsProxy,
  BorrowerWrappersProxy,
  TroveManagerProxy,
  StabilityPoolProxy,
  SortedTrovesProxy,
  TokenProxy,
  OPLStakingProxy
} = require("../utils/proxyHelpers.js");

/* "Liquity core" consists of all contracts in the core Liquity system.

OPL contracts consist of only those contracts related to the OPL Token:

-the OPL token
-the Lockup factory and lockup contracts
-the OPLStaking contract
-the CommunityIssuance contract 
*/

const ZERO_ADDRESS = "0x" + "0".repeat(40);
const maxBytes32 = "0x" + "f".repeat(64);

class DeploymentHelper {
  static async deployLiquityCore() {
    const cmdLineArgs = process.argv;
    const frameworkPath = cmdLineArgs[1];
    // console.log(`Framework used:  ${frameworkPath}`)

    if (frameworkPath.includes("hardhat")) {
      return this.deployLiquityCoreHardhat();
    } else if (frameworkPath.includes("truffle")) {
      return this.deployLiquityCoreTruffle();
    }
  }

  static async deployOPLContracts(bountyAddress, lpRewardsAddress, multisigAddress) {
    const cmdLineArgs = process.argv;
    const frameworkPath = cmdLineArgs[1];
    // console.log(`Framework used:  ${frameworkPath}`)

    if (frameworkPath.includes("hardhat")) {
      return this.deployOPLContractsHardhat(bountyAddress, lpRewardsAddress, multisigAddress);
    } else if (frameworkPath.includes("truffle")) {
      return this.deployOPLContractsTruffle(bountyAddress, lpRewardsAddress, multisigAddress);
    }
  }

  static async deployLiquityCoreHardhat() {
    const priceFeedTestnet = await PriceFeedTestnet.new();
    const sortedTroves = await SortedTroves.new();
    const troveManager = await TroveManager.new();
    const activePool = await ActivePool.new();
    const stabilityPool = await StabilityPool.new();
    const gasPool = await GasPool.new();
    const defaultPool = await DefaultPool.new();
    const collSurplusPool = await CollSurplusPool.new();
    const functionCaller = await FunctionCaller.new();
    const borrowerOperations = await BorrowerOperations.new();
    const hintHelpers = await HintHelpers.new();
    const oneuToken = await ONEUToken.new(
      troveManager.address,
      stabilityPool.address,
      borrowerOperations.address
    );
    ONEUToken.setAsDeployed(oneuToken);
    DefaultPool.setAsDeployed(defaultPool);
    PriceFeedTestnet.setAsDeployed(priceFeedTestnet);
    SortedTroves.setAsDeployed(sortedTroves);
    TroveManager.setAsDeployed(troveManager);
    ActivePool.setAsDeployed(activePool);
    StabilityPool.setAsDeployed(stabilityPool);
    GasPool.setAsDeployed(gasPool);
    CollSurplusPool.setAsDeployed(collSurplusPool);
    FunctionCaller.setAsDeployed(functionCaller);
    BorrowerOperations.setAsDeployed(borrowerOperations);
    HintHelpers.setAsDeployed(hintHelpers);

    const coreContracts = {
      priceFeedTestnet,
      oneuToken,
      sortedTroves,
      troveManager,
      activePool,
      stabilityPool,
      gasPool,
      defaultPool,
      collSurplusPool,
      functionCaller,
      borrowerOperations,
      hintHelpers
    };
    return coreContracts;
  }

  static async deployTesterContractsHardhat() {
    const testerContracts = {};

    // Contract without testers (yet)
    testerContracts.priceFeedTestnet = await PriceFeedTestnet.new();
    testerContracts.sortedTroves = await SortedTroves.new();
    // Actual tester contracts
    testerContracts.communityIssuance = await CommunityIssuanceTester.new();
    testerContracts.activePool = await ActivePoolTester.new();
    testerContracts.defaultPool = await DefaultPoolTester.new();
    testerContracts.stabilityPool = await StabilityPoolTester.new();
    testerContracts.gasPool = await GasPool.new();
    testerContracts.collSurplusPool = await CollSurplusPool.new();
    testerContracts.math = await LiquityMathTester.new();
    testerContracts.borrowerOperations = await BorrowerOperationsTester.new();
    testerContracts.troveManager = await TroveManagerTester.new();
    testerContracts.functionCaller = await FunctionCaller.new();
    testerContracts.hintHelpers = await HintHelpers.new();
    testerContracts.oneuToken = await ONEUTokenTester.new(
      testerContracts.troveManager.address,
      testerContracts.stabilityPool.address,
      testerContracts.borrowerOperations.address
    );
    return testerContracts;
  }

  static async deployOPLContractsHardhat(bountyAddress, lpRewardsAddress, multisigAddress) {
    const lqtyStaking = await OPLStaking.new();
    const lockupContractFactory = await LockupContractFactory.new();
    const communityIssuance = await CommunityIssuance.new();

    OPLStaking.setAsDeployed(lqtyStaking);
    LockupContractFactory.setAsDeployed(lockupContractFactory);
    CommunityIssuance.setAsDeployed(communityIssuance);

    // Deploy OPL Token, passing Community Issuance and Factory addresses to the constructor
    const lqtyToken = await OPLToken.new(
      communityIssuance.address,
      lqtyStaking.address,
      lockupContractFactory.address,
      bountyAddress,
      lpRewardsAddress,
      multisigAddress
    );
    OPLToken.setAsDeployed(lqtyToken);

    const OPLContracts = {
      lqtyStaking,
      lockupContractFactory,
      communityIssuance,
      lqtyToken
    };
    return OPLContracts;
  }

  static async deployOPLTesterContractsHardhat(bountyAddress, lpRewardsAddress, multisigAddress) {
    const lqtyStaking = await OPLStaking.new();
    const lockupContractFactory = await LockupContractFactory.new();
    const communityIssuance = await CommunityIssuanceTester.new();

    OPLStaking.setAsDeployed(lqtyStaking);
    LockupContractFactory.setAsDeployed(lockupContractFactory);
    CommunityIssuanceTester.setAsDeployed(communityIssuance);

    // Deploy OPL Token, passing Community Issuance and Factory addresses to the constructor
    const lqtyToken = await OPLTokenTester.new(
      communityIssuance.address,
      lqtyStaking.address,
      lockupContractFactory.address,
      bountyAddress,
      lpRewardsAddress,
      multisigAddress
    );
    OPLTokenTester.setAsDeployed(lqtyToken);

    const OPLContracts = {
      lqtyStaking,
      lockupContractFactory,
      communityIssuance,
      lqtyToken
    };
    return OPLContracts;
  }

  static async deployLiquityCoreTruffle() {
    const priceFeedTestnet = await PriceFeedTestnet.new();
    const sortedTroves = await SortedTroves.new();
    const troveManager = await TroveManager.new();
    const activePool = await ActivePool.new();
    const stabilityPool = await StabilityPool.new();
    const gasPool = await GasPool.new();
    const defaultPool = await DefaultPool.new();
    const collSurplusPool = await CollSurplusPool.new();
    const functionCaller = await FunctionCaller.new();
    const borrowerOperations = await BorrowerOperations.new();
    const hintHelpers = await HintHelpers.new();
    const oneuToken = await ONEUToken.new(
      troveManager.address,
      stabilityPool.address,
      borrowerOperations.address
    );
    const coreContracts = {
      priceFeedTestnet,
      oneuToken,
      sortedTroves,
      troveManager,
      activePool,
      stabilityPool,
      gasPool,
      defaultPool,
      collSurplusPool,
      functionCaller,
      borrowerOperations,
      hintHelpers
    };
    return coreContracts;
  }

  static async deployOPLContractsTruffle(bountyAddress, lpRewardsAddress, multisigAddress) {
    const lqtyStaking = await lqtyStaking.new();
    const lockupContractFactory = await LockupContractFactory.new();
    const communityIssuance = await CommunityIssuance.new();

    /* Deploy OPL Token, passing Community Issuance,  OPLStaking, and Factory addresses 
    to the constructor  */
    const lqtyToken = await OPLToken.new(
      communityIssuance.address,
      lqtyStaking.address,
      lockupContractFactory.address,
      bountyAddress,
      lpRewardsAddress,
      multisigAddress
    );

    const OPLContracts = {
      lqtyStaking,
      lockupContractFactory,
      communityIssuance,
      lqtyToken
    };
    return OPLContracts;
  }

  static async deployONEUToken(contracts) {
    contracts.oneuToken = await ONEUToken.new(
      contracts.troveManager.address,
      contracts.stabilityPool.address,
      contracts.borrowerOperations.address
    );
    return contracts;
  }

  static async deployONEUTokenTester(contracts) {
    contracts.oneuToken = await ONEUTokenTester.new(
      contracts.troveManager.address,
      contracts.stabilityPool.address,
      contracts.borrowerOperations.address
    );
    return contracts;
  }

  static async deployProxyScripts(contracts, OPLContracts, owner, users) {
    const proxies = await buildUserProxies(users);

    const borrowerWrappersScript = await BorrowerWrappersScript.new(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      OPLContracts.lqtyStaking.address
    );
    contracts.borrowerWrappers = new BorrowerWrappersProxy(
      owner,
      proxies,
      borrowerWrappersScript.address
    );

    const borrowerOperationsScript = await BorrowerOperationsScript.new(
      contracts.borrowerOperations.address
    );
    contracts.borrowerOperations = new BorrowerOperationsProxy(
      owner,
      proxies,
      borrowerOperationsScript.address,
      contracts.borrowerOperations
    );

    const troveManagerScript = await TroveManagerScript.new(contracts.troveManager.address);
    contracts.troveManager = new TroveManagerProxy(
      owner,
      proxies,
      troveManagerScript.address,
      contracts.troveManager
    );

    const stabilityPoolScript = await StabilityPoolScript.new(contracts.stabilityPool.address);
    contracts.stabilityPool = new StabilityPoolProxy(
      owner,
      proxies,
      stabilityPoolScript.address,
      contracts.stabilityPool
    );

    contracts.sortedTroves = new SortedTrovesProxy(owner, proxies, contracts.sortedTroves);

    const oneuTokenScript = await TokenScript.new(contracts.oneuToken.address);
    contracts.oneuToken = new TokenProxy(
      owner,
      proxies,
      oneuTokenScript.address,
      contracts.oneuToken
    );

    const lqtyTokenScript = await TokenScript.new(OPLContracts.lqtyToken.address);
    OPLContracts.lqtyToken = new TokenProxy(
      owner,
      proxies,
      lqtyTokenScript.address,
      OPLContracts.lqtyToken
    );

    const lqtyStakingScript = await OPLStakingScript.new(OPLContracts.lqtyStaking.address);
    OPLContracts.lqtyStaking = new OPLStakingProxy(
      owner,
      proxies,
      lqtyStakingScript.address,
      OPLContracts.lqtyStaking
    );
  }

  // Connect contracts to their dependencies
  static async connectCoreContracts(contracts, OPLContracts) {
    // set TroveManager addr in SortedTroves
    await contracts.sortedTroves.setParams(
      maxBytes32,
      contracts.troveManager.address,
      contracts.borrowerOperations.address
    );

    // set contract addresses in the FunctionCaller
    await contracts.functionCaller.setTroveManagerAddress(contracts.troveManager.address);
    await contracts.functionCaller.setSortedTrovesAddress(contracts.sortedTroves.address);

    // set contracts in the Trove Manager
    await contracts.troveManager.setAddresses(
      contracts.borrowerOperations.address,
      contracts.activePool.address,
      contracts.defaultPool.address,
      contracts.stabilityPool.address,
      contracts.gasPool.address,
      contracts.collSurplusPool.address,
      contracts.priceFeedTestnet.address,
      contracts.oneuToken.address,
      contracts.sortedTroves.address,
      OPLContracts.lqtyToken.address,
      OPLContracts.lqtyStaking.address
    );

    // set contracts in BorrowerOperations
    await contracts.borrowerOperations.setAddresses(
      contracts.troveManager.address,
      contracts.activePool.address,
      contracts.defaultPool.address,
      contracts.stabilityPool.address,
      contracts.gasPool.address,
      contracts.collSurplusPool.address,
      contracts.priceFeedTestnet.address,
      contracts.sortedTroves.address,
      contracts.oneuToken.address,
      OPLContracts.lqtyStaking.address
    );

    // set contracts in the Pools
    await contracts.stabilityPool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.activePool.address,
      contracts.oneuToken.address,
      contracts.sortedTroves.address,
      contracts.priceFeedTestnet.address,
      OPLContracts.communityIssuance.address
    );

    await contracts.activePool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.stabilityPool.address,
      contracts.defaultPool.address
    );

    await contracts.defaultPool.setAddresses(
      contracts.troveManager.address,
      contracts.activePool.address
    );

    await contracts.collSurplusPool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.activePool.address
    );

    // set contracts in HintHelpers
    await contracts.hintHelpers.setAddresses(
      contracts.sortedTroves.address,
      contracts.troveManager.address
    );
  }

  static async connectOPLContracts(OPLContracts) {
    // Set OPLToken address in LCF
    await OPLContracts.lockupContractFactory.setOPLTokenAddress(OPLContracts.lqtyToken.address);
  }

  static async connectOPLContractsToCore(OPLContracts, coreContracts) {
    await OPLContracts.lqtyStaking.setAddresses(
      OPLContracts.lqtyToken.address,
      coreContracts.oneuToken.address,
      coreContracts.troveManager.address,
      coreContracts.borrowerOperations.address,
      coreContracts.activePool.address
    );

    await OPLContracts.communityIssuance.setAddresses(
      OPLContracts.lqtyToken.address,
      coreContracts.stabilityPool.address
    );
  }

  static async connectUnipool(uniPool, OPLContracts, uniswapPairAddr, duration) {
    await uniPool.setParams(OPLContracts.lqtyToken.address, uniswapPairAddr, duration);
  }
}
module.exports = DeploymentHelper;
