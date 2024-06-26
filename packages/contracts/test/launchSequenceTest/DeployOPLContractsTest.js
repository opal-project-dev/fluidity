const deploymentHelper = require("../../utils/deploymentHelpers.js");
const testHelpers = require("../../utils/testHelpers.js");
const CommunityIssuance = artifacts.require("./CommunityIssuance.sol");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const assertRevert = th.assertRevert;
const toBN = th.toBN;
const dec = th.dec;

contract("Deploying the OPL contracts: LCF, CI, OPLStaking, and OPLToken ", async accounts => {
  const [liquityAG, A, B] = accounts;
  const [bountyAddress, multisig] = accounts.slice(997, 1000);

  let OPLContracts;

  const oneMillion = toBN(1000000);
  const digits = toBN(1e18);
  const thirtyTwo = toBN(32);
  const expectedCISupplyCap = thirtyTwo.mul(oneMillion).mul(digits);

  beforeEach(async () => {
    // Deploy all contracts from the first account
    OPLContracts = await deploymentHelper.deployOPLContracts(
      bountyAddress,

      multisig
    );
    await deploymentHelper.connectOPLContracts(OPLContracts);

    oplStaking = OPLContracts.oplStaking;
    oplToken = OPLContracts.oplToken;
    communityIssuance = OPLContracts.communityIssuance;
    lockupContractFactory = OPLContracts.lockupContractFactory;

    //OPL Staking and CommunityIssuance have not yet had their setters called, so are not yet
    // connected to the rest of the system
  });

  describe("CommunityIssuance deployment", async accounts => {
    it("Stores the deployer's address", async () => {
      const storedDeployerAddress = await communityIssuance.owner();

      assert.equal(liquityAG, storedDeployerAddress);
    });
  });

  describe("OPLStaking deployment", async accounts => {
    it("Stores the deployer's address", async () => {
      const storedDeployerAddress = await oplStaking.owner();

      assert.equal(liquityAG, storedDeployerAddress);
    });
  });

  describe("OPLToken deployment", async accounts => {
    it("Stores the multisig's address", async () => {
      const storedMultisigAddress = await oplToken.multisigAddress();

      assert.equal(multisig, storedMultisigAddress);
    });

    it("Stores the CommunityIssuance address", async () => {
      const storedCIAddress = await oplToken.communityIssuanceAddress();

      assert.equal(communityIssuance.address, storedCIAddress);
    });

    it("Stores the LockupContractFactory address", async () => {
      const storedLCFAddress = await oplToken.lockupContractFactory();

      assert.equal(lockupContractFactory.address, storedLCFAddress);
    });

    it("Mints the correct OPL amount to the multisig's address: (64 million)", async () => {
      const multisigOPLEntitlement = await oplToken.balanceOf(multisig);

      const sixtysixMillion = dec(66, 24);
      assert.equal(multisigOPLEntitlement.toString(), sixtysixMillion);
    });

    it("Mints the correct OPL amount to the CommunityIssuance contract address: 32 million", async () => {
      const communityOPLEntitlement = await oplToken.balanceOf(communityIssuance.address);
      // 32 million as 18-digit decimal
      const _32Million = dec(32, 24);

      assert.equal(communityOPLEntitlement, _32Million);
    });

    it("Mints the correct OPL amount to the bountyAddress EOA: 2 million", async () => {
      const bountyAddressBal = await oplToken.balanceOf(bountyAddress);
      // 2 million as 18-digit decimal
      const _2Million = dec(2, 24);

      assert.equal(bountyAddressBal, _2Million);
    });
  });

  describe("Community Issuance deployment", async accounts => {
    it("Stores the deployer's address", async () => {
      const storedDeployerAddress = await communityIssuance.owner();

      assert.equal(storedDeployerAddress, liquityAG);
    });

    it("Has a supply cap of 32 million", async () => {
      const supplyCap = await communityIssuance.OPLSupplyCap();

      assert.isTrue(expectedCISupplyCap.eq(supplyCap));
    });

    it("Liquity AG can set addresses if CI's OPL balance is equal or greater than 32 million ", async () => {
      const OPLBalance = await oplToken.balanceOf(communityIssuance.address);
      assert.isTrue(OPLBalance.eq(expectedCISupplyCap));

      // Deploy core contracts, just to get the Stability Pool address
      const coreContracts = await deploymentHelper.deployLiquityCore();

      const tx = await communityIssuance.setAddresses(
        oplToken.address,
        coreContracts.stabilityPool.address,
        { from: liquityAG }
      );
      assert.isTrue(tx.receipt.status);
    });

    it("Liquity AG can't set addresses if CI's OPL balance is < 32 million ", async () => {
      const newCI = await CommunityIssuance.new();

      const OPLBalance = await oplToken.balanceOf(newCI.address);
      assert.equal(OPLBalance, "0");

      // Deploy core contracts, just to get the Stability Pool address
      const coreContracts = await deploymentHelper.deployLiquityCore();

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);
      await oplToken.transfer(newCI.address, "31999999999999999999999999", { from: multisig }); // 1e-18 less than CI expects (32 million)

      try {
        const tx = await newCI.setAddresses(oplToken.address, coreContracts.stabilityPool.address, {
          from: liquityAG
        });

        // Check it gives the expected error message for a failed Solidity 'assert'
      } catch (err) {
        assert.include(err.message, "invalid opcode");
      }
    });
  });

  describe("Connecting OPLToken to LCF, CI and OPLStaking", async accounts => {
    it("sets the correct OPLToken address in OPLStaking", async () => {
      // Deploy core contracts and set the OPLToken address in the CI and OPLStaking
      const coreContracts = await deploymentHelper.deployLiquityCore();
      await deploymentHelper.connectOPLContractsToCore(OPLContracts, coreContracts);

      const oplTokenAddress = oplToken.address;

      const recordedOPLTokenAddress = await oplStaking.oplToken();
      assert.equal(oplTokenAddress, recordedOPLTokenAddress);
    });

    it("sets the correct OPLToken address in LockupContractFactory", async () => {
      const oplTokenAddress = oplToken.address;

      const recordedOPLTokenAddress = await lockupContractFactory.oplTokenAddress();
      assert.equal(oplTokenAddress, recordedOPLTokenAddress);
    });

    it("sets the correct OPLToken address in CommunityIssuance", async () => {
      // Deploy core contracts and set the OPLToken address in the CI and OPLStaking
      const coreContracts = await deploymentHelper.deployLiquityCore();
      await deploymentHelper.connectOPLContractsToCore(OPLContracts, coreContracts);

      const oplTokenAddress = oplToken.address;

      const recordedOPLTokenAddress = await communityIssuance.oplToken();
      assert.equal(oplTokenAddress, recordedOPLTokenAddress);
    });
  });
});
