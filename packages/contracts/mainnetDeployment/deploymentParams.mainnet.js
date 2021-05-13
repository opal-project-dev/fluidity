const externalAddrs  = {
  // https://data.chain.link/eth-usd
  CHAINLINK_ETHUSD_PROXY: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", 
  // https://docs.tellor.io/tellor/integration/reference-page
  TELLOR_MASTER:"0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0",
  // https://uniswap.org/docs/v2/smart-contracts/factory/
  UNISWAP_V2_FACTORY: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  UNISWAP_V2_ROUTER02: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  // https://etherscan.io/token/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
  WETH_ERC20: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
}

const liquityAddrs = {
  GENERAL_SAFE:"0xF06016D822943C42e3Cb7FC3a6A3B1889C1045f8", // to be passed to LQTYToken as the bounties/hackathons address
  LQTY_SAFE:"0xb8a9faDA75c6d891fB77a7988Ff9BaD9e485Ca1C", // to be passed to LQTYToken as the LQTY multisig address
  DEPLOYER: "0xa850535D3628CD4dFEB528dC85cfA93051Ff2984" // Mainnet REAL deployment address
}

// Beneficiaries for lockup contracts. 
const beneficiaries = {
  ACCOUNT_1: "0xBBdc88676759D09617C288E29f2Eb7Ce94592f25",  
  ACCOUNT_2: "0x77616b3a57C9ACf018E87c92ae187C8Cc0B112D6",
  ACCOUNT_3: "0x32c761138aD9Ff95D8595aa9A79208F19b01d8E7",
  ACCOUNT_4: "0x0eBBC1c8B634b775D14b24E6428C9386A1B6C74D",
  ACCOUNT_5: "0xf7d74a3E2295A860CDD88b901940B367737E8A8F",
  ACCOUNT_6: "0xb2bc4E23225433A2Bc3b671445eAD111044C6054",
  ACCOUNT_7: "0xdca192b98bb4ea03076b3b52845519c30d68524d",
  ACCOUNT_8: "0x6cb0c6FAe64085D5F0E42a30e5788c2c048AaEb2",
  ACCOUNT_9: "0x67E3ea119E141406c37e2CA783b749Fe1437673f",
  ACCOUNT_10: "0x3e8c0CBd2a59D2d4b7d8396aCc04aB349a169286",
  ACCOUNT_11: "0x1277934A71b9D61611dA7BF657A6c814abEA9F03",
  ACCOUNT_12: "0x280ebd63C05776BA19a6a0f6497D5237635065Fb",
  ACCOUNT_13: "0x6b7Ac46d09d2ADF4CeBe2995EbF9d97E13E9E257",
  ACCOUNT_14: "0x2d2d2a1f9bfda0d2364b4d517f862e52fefc2703",
  ACCOUNT_15: "0x46EEA8D5b37D2Db51f35c1bC8C50CBf80fb0fFE5",
  ACCOUNT_16: "0xe5D0Ef77AED07C302634dC370537126A2CD26590",
  ACCOUNT_17: "0xdd488450758D7934F5160eb17d388a4Be0161D1c",
  ACCOUNT_18: "0xF9fe05eA33742FA32caFb347920b7d53277A73DD",
  ACCOUNT_19: "0xC263894D648c3b56d690C7f8e55908e22e526e78",
  ACCOUNT_20: "0xffd57a89B2bDeC0AA7e29add0C977c2e72ba3d7c",
  ACCOUNT_21: "0x59D62467DaADCf8f9a56CFb33095cff72999b4b6",
  ACCOUNT_22: "0x5a57dD9C623e1403AF1D810673183D89724a4e0c",
  ACCOUNT_23: "0x6be85603322df6DC66163eF5f82A9c6ffBC5e894",
  ACCOUNT_24: "0xD45b8EC05dD7620eeceed3D3aCABC95957622bB7",
  ACCOUNT_25: "0x2fcfCAbCBb314A82f70415113169dE0C1D781250",
  ACCOUNT_26: "0x491C730298C9EBDA7B0dEC8aE1f973e34874059c",
  ACCOUNT_27: "0x8b5195876c95E65dBD6948092a610Ee8D7b721aA",
  ACCOUNT_28: "0x4962caC8B4E22c3DA9e4AD9f3515Ad7c186E451c",
  ACCOUNT_29: "0x1824ffB249cD510573840155b3DefBbdb4ABB916",
  ACCOUNT_30: "0x4CA75a1B3ABFb97Cee6C87BB15eF5b5609eCAad3",
  ACCOUNT_31: "0x994668f7B05B30996BB7F2B87140D0A761D9f292",
}

const OUTPUT_FILE = './mainnetDeployment/mainnetDeploymentOutput.json'

const delay = ms => new Promise(res => setTimeout(res, ms));
const waitFunction = async () => {
  return delay(90000) // wait 90s
}

const GAS_PRICE = 200000000000
const TX_CONFIRMATIONS = 3 // for mainnet

const ETHERSCAN_BASE_URL = 'https://etherscan.io/address'

module.exports = {
  externalAddrs,
  liquityAddrs,
  beneficiaries,
  OUTPUT_FILE,
  waitFunction,
  GAS_PRICE,
  TX_CONFIRMATIONS,
  ETHERSCAN_BASE_URL,
};