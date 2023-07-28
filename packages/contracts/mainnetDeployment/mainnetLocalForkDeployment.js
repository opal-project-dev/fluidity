const { mainnetDeploy } = require("./mainnetDeployment.js");
const configParams = require("./deploymentParams.localFork.js");

const AUT_WHALE = "0x53d284357ec70ce289d6d64134dfac8e511c8a3d";
//const TEST_DEPLOYER_PRIVATEKEY = '0xbbfbee4961061d506ffbb11dfea64eba16355cbf1d9c29613126ba7fec0aed5d'

async function main() {
  //const deployerWallet = new ethers.Wallet(TEST_DEPLOYER_PRIVATEKEY, ethers.provider)
  const deployerWallet = (await ethers.getSigners())[0];

  // Impersonate the whale (artificially assume control of its pk)
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [AUT_WHALE]
  });
  console.log(`whale address from import: ${AUT_WHALE}`);

  // Get the AUT whale signer
  const whale = await ethers.provider.getSigner(AUT_WHALE);
  console.log(`whale addr : ${await whale.getAddress()}`);

  await network.provider.send("hardhat_setBalance", [AUT_WHALE, "0xC9F2C9CD04674EDEA40000000"]);

  console.log(`whale AUT balance: ${await ethers.provider.getBalance(whale.getAddress())}`);

  // Send AUT to the deployer's address
  await whale.sendTransaction({
    to: deployerWallet.address,
    value: ethers.utils.parseEther("20.0")
  });

  // Stop impersonating whale
  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [AUT_WHALE]
  });

  await mainnetDeploy(configParams);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
