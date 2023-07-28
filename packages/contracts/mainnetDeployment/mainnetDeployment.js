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
  const mdh = new MainnetDeploymentHelper(configParams, deployerWallet);
  const gasPrice = configParams.GAS_PRICE;

  const deploymentState = mdh.loadPreviousDeployment();

  console.log(`deployer address: ${deployerWallet.address}`);
  assert.equal(deployerWallet.address, configParams.opalAddrs.DEPLOYER);
  // assert.equal(account2Wallet.address, configParams.beneficiaries.ACCOUNT_2)
  let deployerAUTBalance = await ethers.provider.getBalance(deployerWallet.address);
  console.log(`deployerAUTBalance before: ${deployerAUTBalance}`);

  deployerAUTBalance = await ethers.provider.getBalance(deployerWallet.address);
  console.log(`deployer's AUT balance before deployments: ${deployerAUTBalance}`);

  // Deploy core logic contracts
  const opalCore = await mdh.deployOpalCoreMainnet(deploymentState);
  await mdh.logContractObjects(opalCore);

  // TODO
  // Deploy OPL Contracts
  const OPLContracts = await mdh.deployOPLContractsMainnet(
    configParams.opalAddrs.GENERAL_SAFE, // bounty address
    configParams.opalAddrs.OPL_SAFE, // multisig OPL endowment address
    deploymentState
  );

  // Connect all core contracts up
  await mdh.connectCoreContractsMainnet(
    opalCore,
    OPLContracts,
    configParams.externalAddrs.CHAINLINK_AUTUSD_PROXY
  );
  await mdh.connectOPLContractsMainnet(OPLContracts);
  await mdh.connectOPLContractsToCoreMainnet(OPLContracts, opalCore);

  // Deploy and log a read-only multi-trove getter
  const multiTroveGetter = await mdh.deployMultiTroveGetterMainnet(opalCore, deploymentState);
  console.log(`Multi trove getter address: ${multiTroveGetter.address}`);

  // Log OPL addresses
  await mdh.logContractObjects(OPLContracts);

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
      const txReceipt = await mdh.sendAndWaitForTransaction(
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

      mdh.saveDeployment(deploymentState);
    }

    const oplTokenAddr = OPLContracts.oplToken.address;
    // verify
    if (configParams.AUTERSCAN_BASE_URL) {
      await mdh.verifyContract(investor, deploymentState, [
        oplTokenAddr,
        investorAddr,
        oneYearFromDeployment
      ]);
    }
  }

  // // --- TESTS AND CHECKS  ---

  // Deployer repay ONEU
  // console.log(`deployer trove debt before repaying: ${await opalCore.troveManager.getTroveDebt(deployerWallet.address)}`)
  // await mdh.sendAndWaitForTransaction(opalCore.borrowerOperations.repayONEU(dec(800, 18), th.ZERO_ADDRESS, th.ZERO_ADDRESS, {gasPrice, gasLimit: 1000000}))
  // console.log(`deployer trove debt after repaying: ${await opalCore.troveManager.getTroveDebt(deployerWallet.address)}`)

  // Deployer add coll
  // console.log(`deployer trove coll before adding coll: ${await opalCore.troveManager.getTroveColl(deployerWallet.address)}`)
  // await mdh.sendAndWaitForTransaction(opalCore.borrowerOperations.addColl(th.ZERO_ADDRESS, th.ZERO_ADDRESS, {value: dec(2, 'ether'), gasPrice, gasLimit: 1000000}))
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

  // // --- Check correct addresses set in OPLToken
  // console.log("STORED ADDRESSES IN OPL TOKEN")
  // const storedMultisigAddress = await OPLContracts.oplToken.multisigAddress()
  // assert.equal(configParams.opalAddrs.OPL_SAFE.toLowerCase(), storedMultisigAddress.toLowerCase())
  // console.log(`multi-sig address stored in OPLToken : ${th.squeezeAddr(storedMultisigAddress)}`)
  // console.log(`OPL Safe address: ${th.squeezeAddr(configParams.opalAddrs.OPL_SAFE)}`)

  // // --- OPL allowances of different addresses ---
  // console.log("INITIAL OPL BALANCES")
  // // Unipool
  // const unipoolOPLBal = await OPLContracts.oplToken.balanceOf(unipool.address)
  // // assert.equal(unipoolOPLBal.toString(), '1333333333333333333333333')
  // th.logBN('Unipool OPL balance       ', unipoolOPLBal)

  // // OPL Safe
  // const oplSafeBal = await OPLContracts.oplToken.balanceOf(configParams.opalAddrs.OPL_SAFE)
  // assert.equal(oplSafeBal.toString(), '64666666666666666666666667')
  // th.logBN('OPL Safe balance     ', oplSafeBal)

  // // Bounties/hackathons (General Safe)
  // const generalSafeBal = await OPLContracts.oplToken.balanceOf(configParams.opalAddrs.GENERAL_SAFE)
  // assert.equal(generalSafeBal.toString(), '2000000000000000000000000')
  // th.logBN('General Safe balance       ', generalSafeBal)

  // // CommunityIssuance contract
  // const communityIssuanceBal = await OPLContracts.oplToken.balanceOf(OPLContracts.communityIssuance.address)
  // // assert.equal(communityIssuanceBal.toString(), '32000000000000000000000000')
  // th.logBN('Community Issuance balance', communityIssuanceBal)

  // // --- PriceFeed ---
  // console.log("PRICEFEED CHECKS")
  // // Check Pricefeed's status and last good price
  // const lastGoodPrice = await opalCore.priceFeed.lastGoodPrice()
  // const priceFeedInitialStatus = await opalCore.priceFeed.status()
  // th.logBN('PriceFeed first stored price', lastGoodPrice)
  // console.log(`PriceFeed initial status: ${priceFeedInitialStatus}`)

  // // Check PriceFeed's & TellorCaller's stored addresses
  // const priceFeedCLAddress = await opalCore.priceFeed.priceAggregator()
  // const priceFeedTellorCallerAddress = await opalCore.priceFeed.tellorCaller()
  // assert.equal(priceFeedCLAddress, configParams.externalAddrs.CHAINLINK_AUTUSD_PROXY)
  // assert.equal(priceFeedTellorCallerAddress, opalCore.tellorCaller.address)

  // // Check Tellor address
  // const tellorCallerTellorMasterAddress = await opalCore.tellorCaller.tellor()
  // assert.equal(tellorCallerTellorMasterAddress, configParams.externalAddrs.TELLOR_MASTER)

  // // --- Unipool ---

  // // Check Unipool's ONEU-AUT Uniswap Pair address
  // const unipoolUniswapPairAddr = await unipool.uniToken()
  // console.log(`Unipool's stored ONEU-AUT Uniswap Pair address: ${unipoolUniswapPairAddr}`)

  // console.log("SYSTEM GLOBAL VARS CHECKS")
  // // --- Sorted Troves ---

  // // Check max size
  // const sortedTrovesMaxSize = (await opalCore.sortedTroves.data())[2]
  // assert.equal(sortedTrovesMaxSize, '115792089237316195423570985008687907853269984665640564039457584007913129639935')

  // // --- TroveManager ---

  // const liqReserve = await opalCore.troveManager.ONEU_GAS_COMPENSATION()
  // const minNetDebt = await opalCore.troveManager.MIN_NET_DEBT()

  // th.logBN('system liquidation reserve', liqReserve)
  // th.logBN('system min net debt      ', minNetDebt)

  // // --- Make first ONEU-AUT liquidity provision ---

  // // Open trove if not yet opened
  // const troveStatus = await opalCore.troveManager.getTroveStatus(deployerWallet.address)
  // if (troveStatus.toString() != '1') {
  //   let _3kONEUWithdrawal = th.dec(3000, 18) // 3000 ONEU
  //   let _3AUTcoll = th.dec(3, 'ether') // 3 AUT
  //   console.log('Opening trove...')
  //   await mdh.sendAndWaitForTransaction(
  //     opalCore.borrowerOperations.openTrove(
  //       th._100pct,
  //       _3kONEUWithdrawal,
  //       th.ZERO_ADDRESS,
  //       th.ZERO_ADDRESS,
  //       { value: _3AUTcoll, gasPrice }
  //     )
  //   )
  // } else {
  //   console.log('Deployer already has an active trove')
  // }

  // // Check deployer now has an open trove
  // console.log(`deployer is in sorted list after making trove: ${await opalCore.sortedTroves.contains(deployerWallet.address)}`)

  // const deployerTrove = await opalCore.troveManager.Troves(deployerWallet.address)
  // th.logBN('deployer debt', deployerTrove[0])
  // th.logBN('deployer coll', deployerTrove[1])
  // th.logBN('deployer stake', deployerTrove[2])
  // console.log(`deployer's trove status: ${deployerTrove[3]}`)

  // // Check deployer has ONEU
  // let deployerONEUBal = await opalCore.lusdToken.balanceOf(deployerWallet.address)
  // th.logBN("deployer's ONEU balance", deployerONEUBal)

  // // Check Uniswap pool has ONEU and WAUT tokens
  //const ONEUAUTPair = await new ethers.Contract(ONEUWAUTPairAddr, UniswapV2Pair.abi, deployerWallet);

  // const token0Addr = await ONEUAUTPair.token0()
  // const token1Addr = await ONEUAUTPair.token1()
  // console.log(`ONEU-AUT Pair token 0: ${th.squeezeAddr(token0Addr)},
  //       ONEUToken contract addr: ${th.squeezeAddr(opalCore.lusdToken.address)}`)
  // console.log(`ONEU-AUT Pair token 1: ${th.squeezeAddr(token1Addr)},
  //       WAUT ERC20 contract addr: ${th.squeezeAddr(configParams.externalAddrs.WAUT_ERC20)}`)

  // // Check initial ONEU-AUT pair reserves before provision
  // let reserves = await ONEUAUTPair.getReserves()
  // th.logBN("ONEU-AUT Pair's ONEU reserves before provision", reserves[0])
  // th.logBN("ONEU-AUT Pair's AUT reserves before provision", reserves[1])

  // // Get the UniswapV2Router contract
  // const uniswapV2Router02 = new ethers.Contract(
  //   configParams.externalAddrs.UNISWAP_V2_ROUTER02,
  //   UniswapV2Router02.abi,
  //   deployerWallet
  // )

  // // --- Provide liquidity to ONEU-AUT pair if not yet done so ---
  // let deployerLPTokenBal = await ONEUAUTPair.balanceOf(deployerWallet.address)
  // if (deployerLPTokenBal.toString() == '0') {
  //   console.log('Providing liquidity to Uniswap...')
  //   // Give router an allowance for ONEU
  //   await opalCore.lusdToken.increaseAllowance(uniswapV2Router02.address, dec(10000, 18))

  //   // Check Router's spending allowance
  //   const routerONEUAllowanceFromDeployer = await opalCore.lusdToken.allowance(deployerWallet.address, uniswapV2Router02.address)
  //   th.logBN("router's spending allowance for deployer's ONEU", routerONEUAllowanceFromDeployer)

  //   // Get amounts for liquidity provision
  //   const LP_AUT = dec(1, 'ether')

  //   // Convert 8-digit CL price to 18 and multiply by AUT amount
  //   const ONEUAmount = toBigNum(chainlinkPrice)
  //     .mul(toBigNum(dec(1, 10)))
  //     .mul(toBigNum(LP_AUT))
  //     .div(toBigNum(dec(1, 18)))

  //   const minONEUAmount = ONEUAmount.sub(toBigNum(dec(100, 18)))

  //   latestBlock = await ethers.provider.getBlockNumber()
  //   now = (await ethers.provider.getBlock(latestBlock)).timestamp
  //   let tenMinsFromNow = now + (60 * 60 * 10)

  //   // Provide liquidity to ONEU-AUT pair
  //   await mdh.sendAndWaitForTransaction(
  //     uniswapV2Router02.addLiquidityAUT(
  //       opalCore.lusdToken.address, // address of ONEU token
  //       ONEUAmount, // ONEU provision
  //       minONEUAmount, // minimum ONEU provision
  //       LP_AUT, // minimum AUT provision
  //       deployerWallet.address, // address to send LP tokens to
  //       tenMinsFromNow, // deadline for this tx
  //       {
  //         value: dec(1, 'ether'),
  //         gasPrice,
  //         gasLimit: 5000000 // For some reason, ethers can't estimate gas for this tx
  //       }
  //     )
  //   )
  // } else {
  //   console.log('Liquidity already provided to Uniswap')
  // }
  // // Check ONEU-AUT reserves after liquidity provision:
  // reserves = await ONEUAUTPair.getReserves()
  // th.logBN("ONEU-AUT Pair's ONEU reserves after provision", reserves[0])
  // th.logBN("ONEU-AUT Pair's AUT reserves after provision", reserves[1])

  // // ---  Check LP staking  ---
  // console.log("CHECK LP STAKING EARNS OPL")

  // // Check deployer's LP tokens
  // deployerLPTokenBal = await ONEUAUTPair.balanceOf(deployerWallet.address)
  // th.logBN("deployer's LP token balance", deployerLPTokenBal)

  // // Stake LP tokens in Unipool
  // console.log(`ONEUAUTPair addr: ${ONEUAUTPair.address}`)
  // console.log(`Pair addr stored in Unipool: ${await unipool.uniToken()}`)

  // earnedOPL = await unipool.earned(deployerWallet.address)
  // th.logBN("deployer's farmed OPL before staking LP tokens", earnedOPL)

  // const deployerUnipoolStake = await unipool.balanceOf(deployerWallet.address)
  // if (deployerUnipoolStake.toString() == '0') {
  //   console.log('Staking to Unipool...')
  //   // Deployer approves Unipool
  //   await mdh.sendAndWaitForTransaction(
  //     ONEUAUTPair.approve(unipool.address, deployerLPTokenBal, { gasPrice })
  //   )

  //   await mdh.sendAndWaitForTransaction(unipool.stake(1, { gasPrice }))
  // } else {
  //   console.log('Already staked in Unipool')
  // }

  // console.log("wait 90 seconds before checking earnings... ")
  // await configParams.waitFunction()

  // earnedOPL = await unipool.earned(deployerWallet.address)
  // th.logBN("deployer's farmed OPL from Unipool after waiting ~1.5mins", earnedOPL)

  // let deployerOPLBal = await OPLContracts.oplToken.balanceOf(deployerWallet.address)
  // th.logBN("deployer OPL Balance Before SP deposit", deployerOPLBal)

  // // --- Make SP deposit and earn OPL ---
  // console.log("CHECK DEPLOYER MAKING DEPOSIT AND EARNING OPL")

  // let SPDeposit = await opalCore.stabilityPool.getCompoundedONEUDeposit(deployerWallet.address)
  // th.logBN("deployer SP deposit before making deposit", SPDeposit)

  // // Provide to SP
  // await mdh.sendAndWaitForTransaction(opalCore.stabilityPool.provideToSP(dec(15, 18), th.ZERO_ADDRESS, { gasPrice, gasLimit: 400000 }))

  // // Get SP deposit
  // SPDeposit = await opalCore.stabilityPool.getCompoundedONEUDeposit(deployerWallet.address)
  // th.logBN("deployer SP deposit after depositing 15 ONEU", SPDeposit)

  // console.log("wait 90 seconds before withdrawing...")
  // // wait 90 seconds
  // await configParams.waitFunction()

  // // Withdraw from SP
  // // await mdh.sendAndWaitForTransaction(opalCore.stabilityPool.withdrawFromSP(dec(1000, 18), { gasPrice, gasLimit: 400000 }))

  // // SPDeposit = await opalCore.stabilityPool.getCompoundedONEUDeposit(deployerWallet.address)
  // // th.logBN("deployer SP deposit after full withdrawal", SPDeposit)

  // // deployerOPLBal = await OPLContracts.oplToken.balanceOf(deployerWallet.address)
  // // th.logBN("deployer OPL Balance after SP deposit withdrawal", deployerOPLBal)

  // // ---  Attempt withdrawal from LC  ---
  // console.log("CHECK BENEFICIARY ATTEMPTING WITHDRAWAL FROM LC")

  // // connect Acct2 wallet to the LC they are beneficiary of
  // let account2LockupContract = await lockupContracts["ACCOUNT_2"].connect(account2Wallet)

  // // Deployer funds LC with 10 OPL
  // // await mdh.sendAndWaitForTransaction(OPLContracts.oplToken.transfer(account2LockupContract.address, dec(10, 18), { gasPrice }))

  // // account2 OPL bal
  // let account2bal = await OPLContracts.oplToken.balanceOf(account2Wallet.address)
  // th.logBN("account2 OPL bal before withdrawal attempt", account2bal)

  // // Check LC OPL bal
  // let account2LockupContractBal = await OPLContracts.oplToken.balanceOf(account2LockupContract.address)
  // th.logBN("account2's LC OPL bal before withdrawal attempt", account2LockupContractBal)

  // // Acct2 attempts withdrawal from  LC
  // await mdh.sendAndWaitForTransaction(account2LockupContract.withdrawOPL({ gasPrice, gasLimit: 1000000 }))

  // // Acct OPL bal
  // account2bal = await OPLContracts.oplToken.balanceOf(account2Wallet.address)
  // th.logBN("account2's OPL bal after LC withdrawal attempt", account2bal)

  // // Check LC bal
  // account2LockupContractBal = await OPLContracts.oplToken.balanceOf(account2LockupContract.address)
  // th.logBN("account2's LC OPL bal LC withdrawal attempt", account2LockupContractBal)

  // // --- Stake OPL ---
  // console.log("CHECK DEPLOYER STAKING OPL")

  // // Log deployer OPL bal and stake before staking
  // deployerOPLBal = await OPLContracts.oplToken.balanceOf(deployerWallet.address)
  // th.logBN("deployer OPL bal before staking", deployerOPLBal)
  // let deployerOPLStake = await OPLContracts.oplStaking.stakes(deployerWallet.address)
  // th.logBN("deployer stake before staking", deployerOPLStake)

  // // stake 13 OPL
  // await mdh.sendAndWaitForTransaction(OPLContracts.oplStaking.stake(dec(13, 18), { gasPrice, gasLimit: 1000000 }))

  // // Log deployer OPL bal and stake after staking
  // deployerOPLBal = await OPLContracts.oplToken.balanceOf(deployerWallet.address)
  // th.logBN("deployer OPL bal after staking", deployerOPLBal)
  // deployerOPLStake = await OPLContracts.oplStaking.stakes(deployerWallet.address)
  // th.logBN("deployer stake after staking", deployerOPLStake)

  // // Log deployer rev share immediately after staking
  // let deployerONEURevShare = await OPLContracts.oplStaking.getPendingONEUGain(deployerWallet.address)
  // th.logBN("deployer pending ONEU revenue share", deployerONEURevShare)

  // // --- 2nd Account opens trove ---
  // const trove2Status = await opalCore.troveManager.getTroveStatus(account2Wallet.address)
  // if (trove2Status.toString() != '1') {
  //   console.log("Acct 2 opens a trove ...")
  //   let _2kONEUWithdrawal = th.dec(2000, 18) // 2000 ONEU
  //   let _1pt5_AUTcoll = th.dec(15, 17) // 1.5 AUT
  //   const borrowerOpsEthersFactory = await ethers.getContractFactory("BorrowerOperations", account2Wallet)
  //   const borrowerOpsAcct2 = await new ethers.Contract(opalCore.borrowerOperations.address, borrowerOpsEthersFactory.interface, account2Wallet)

  //   await mdh.sendAndWaitForTransaction(borrowerOpsAcct2.openTrove(th._100pct, _2kONEUWithdrawal, th.ZERO_ADDRESS, th.ZERO_ADDRESS, { value: _1pt5_AUTcoll, gasPrice, gasLimit: 1000000 }))
  // } else {
  //   console.log('Acct 2 already has an active trove')
  // }

  // const acct2Trove = await opalCore.troveManager.Troves(account2Wallet.address)
  // th.logBN('acct2 debt', acct2Trove[0])
  // th.logBN('acct2 coll', acct2Trove[1])
  // th.logBN('acct2 stake', acct2Trove[2])
  // console.log(`acct2 trove status: ${acct2Trove[3]}`)

  // // Log deployer's pending ONEU gain - check fees went to staker (deloyer)
  // deployerONEURevShare = await OPLContracts.oplStaking.getPendingONEUGain(deployerWallet.address)
  // th.logBN("deployer pending ONEU revenue share from staking, after acct 2 opened trove", deployerONEURevShare)

  // //  --- deployer withdraws staking gains ---
  // console.log("CHECK DEPLOYER WITHDRAWING STAKING GAINS")

  // // check deployer's ONEU balance before withdrawing staking gains
  // deployerONEUBal = await opalCore.lusdToken.balanceOf(deployerWallet.address)
  // th.logBN('deployer ONEU bal before withdrawing staking gains', deployerONEUBal)

  // // Deployer withdraws staking gains
  // await mdh.sendAndWaitForTransaction(OPLContracts.oplStaking.unstake(0, { gasPrice, gasLimit: 1000000 }))

  // // check deployer's ONEU balance after withdrawing staking gains
  // deployerONEUBal = await opalCore.lusdToken.balanceOf(deployerWallet.address)
  // th.logBN('deployer ONEU bal after withdrawing staking gains', deployerONEUBal)

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

  // TODO: Uniswap *OPL-AUT* pool size (check it's deployed?)

  // ************************
  // --- NOT FOR APRIL 5: Deploy a OPLToken2 with General Safe as beneficiary to test minting OPL showing up in Gnosis App  ---

  // // General Safe OPL bal before:
  // const realGeneralSafeAddr = "0xF06016D822943C42e3Cb7FC3a6A3B1889C1045f8"

  //   const OPLToken2EthersFactory = await ethers.getContractFactory("OPLToken2", deployerWallet)
  //   const oplToken2 = await OPLToken2EthersFactory.deploy(
  //     "0xF41E0DD45d411102ed74c047BdA544396cB71E27",  // CI param: LC1
  //     "0x9694a04263593AC6b895Fc01Df5929E1FC7495fA", // OPL Staking param: LC2
  //     "0x98f95E112da23c7b753D8AE39515A585be6Fb5Ef", // LCF param: LC3
  //     realGeneralSafeAddr,  // bounty/hackathon param: REAL general safe addr
  //     "0x98f95E112da23c7b753D8AE39515A585be6Fb5Ef", // LP rewards param: LC3
  //     deployerWallet.address, // multisig param: deployer wallet
  //     {gasPrice, gasLimit: 10000000}
  //   )

  //   console.log(`opl2 address: ${oplToken2.address}`)

  //   let generalSafeOPLBal = await oplToken2.balanceOf(realGeneralSafeAddr)
  //   console.log(`generalSafeOPLBal: ${generalSafeOPLBal}`)

  // ************************
  // --- NOT FOR APRIL 5: Test short-term lockup contract OPL withdrawal on mainnet ---

  // now = (await ethers.provider.getBlock(latestBlock)).timestamp

  // const LCShortTermEthersFactory = await ethers.getContractFactory("LockupContractShortTerm", deployerWallet)

  // new deployment
  // const LCshortTerm = await LCShortTermEthersFactory.deploy(
  //   OPLContracts.oplToken.address,
  //   deployerWallet.address,
  //   now,
  //   {gasPrice, gasLimit: 1000000}
  // )

  // LCshortTerm.deployTransaction.wait()

  // existing deployment
  // const deployedShortTermLC = await new ethers.Contract(
  //   "0xbA8c3C09e9f55dA98c5cF0C28d15Acb927792dC7",
  //   LCShortTermEthersFactory.interface,
  //   deployerWallet
  // )

  // new deployment
  // console.log(`Short term LC Address:  ${LCshortTerm.address}`)
  // console.log(`recorded beneficiary in short term LC:  ${await LCshortTerm.beneficiary()}`)
  // console.log(`recorded short term LC name:  ${await LCshortTerm.NAME()}`)

  // existing deployment
  //   console.log(`Short term LC Address:  ${deployedShortTermLC.address}`)
  //   console.log(`recorded beneficiary in short term LC:  ${await deployedShortTermLC.beneficiary()}`)
  //   console.log(`recorded short term LC name:  ${await deployedShortTermLC.NAME()}`)
  //   console.log(`recorded short term LC name:  ${await deployedShortTermLC.unlockTime()}`)
  //   now = (await ethers.provider.getBlock(latestBlock)).timestamp
  //   console.log(`time now: ${now}`)

  //   // check deployer OPL bal
  //   let deployerOPLBal = await OPLContracts.oplToken.balanceOf(deployerWallet.address)
  //   console.log(`deployerOPLBal before he withdraws: ${deployerOPLBal}`)

  //   // check LC OPL bal
  //   let LC_OPLBal = await OPLContracts.oplToken.balanceOf(deployedShortTermLC.address)
  //   console.log(`LC OPL bal before withdrawal: ${LC_OPLBal}`)

  // // withdraw from LC
  // const withdrawFromShortTermTx = await deployedShortTermLC.withdrawOPL( {gasPrice, gasLimit: 1000000})
  // withdrawFromShortTermTx.wait()

  // // check deployer bal after LC withdrawal
  // deployerOPLBal = await OPLContracts.oplToken.balanceOf(deployerWallet.address)
  // console.log(`deployerOPLBal after he withdraws: ${deployerOPLBal}`)

  //   // check LC OPL bal
  //   LC_OPLBal = await OPLContracts.oplToken.balanceOf(deployedShortTermLC.address)
  //   console.log(`LC OPL bal after withdrawal: ${LC_OPLBal}`)
}

module.exports = {
  mainnetDeploy
};
