const externalAddrs = {
  CHAINLINK_AUTUSD_PROXY: "0xce40AF5bFeDa2ECAc145C0185B43a1b6b202F73E"
};

const opalAddrs = {
  GENERAL_SAFE: "0x8be7e24263c199ebfcfd6aebca83f8d7ed85a5dd", // Hardhat dev address
  OPL_SAFE: "0x20c81d658aae3a8580d990e441a9ef2c9809be74", //  Hardhat dev address
  DEPLOYER: "0x31c57298578f7508B5982062cfEc5ec8BD346247" // hardhat first account
};

const beneficiaries = {
  TEST_INVESTOR_A: "0xdad05aa3bd5a4904eb2a9482757be5da8d554b3d",
  TEST_INVESTOR_B: "0x625b473f33b37058bf8b9d4c3d3f9ab5b896996a",
  TEST_INVESTOR_C: "0x9ea530178b9660d0fae34a41a02ec949e209142e",
  TEST_INVESTOR_D: "0xffbb4f4b113b05597298b9d8a7d79e6629e726e8",
  TEST_INVESTOR_E: "0x89ff871dbcd0a456fe92db98d190c38bc10d1cc1"
};

const OUTPUT_FILE = "./mainnetDeployment/localForkDeploymentOutput.json";

const waitFunction = async () => {
  // Fast forward time 1000s (local mainnet fork only)
  ethers.provider.send("evm_increaseTime", [1000]);
  ethers.provider.send("evm_mine");
};

const GAS_PRICE = 1000;
const TX_CONFIRMATIONS = 1; // for local fork test

module.exports = {
  externalAddrs,
  opalAddrs,
  beneficiaries,
  OUTPUT_FILE,
  waitFunction,
  GAS_PRICE,
  TX_CONFIRMATIONS
};
