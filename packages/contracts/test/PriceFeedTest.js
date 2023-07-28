const PriceFeed = artifacts.require("./PriceFeedTester.sol");
const PriceFeedTestnet = artifacts.require("./PriceFeedTestnet.sol");
const MockChainlink = artifacts.require("./MockAggregator.sol");

const testHelpers = require("../utils/testHelpers.js");
const th = testHelpers.TestHelper;

const { dec, assertRevert, toBN } = th;

contract("PriceFeed", async accounts => {
  const [owner, alice] = accounts;
  let priceFeedTestnet;
  let priceFeed;
  let zeroAddressPriceFeed;
  let mockChainlink;

  const setAddresses = async () => {
    await priceFeed.setAddresses(mockChainlink.address, { from: owner });
  };

  beforeEach(async () => {
    priceFeedTestnet = await PriceFeedTestnet.new();
    PriceFeedTestnet.setAsDeployed(priceFeedTestnet);

    priceFeed = await PriceFeed.new();
    PriceFeed.setAsDeployed(priceFeed);

    zeroAddressPriceFeed = await PriceFeed.new();
    PriceFeed.setAsDeployed(zeroAddressPriceFeed);

    mockChainlink = await MockChainlink.new();
    MockChainlink.setAsDeployed(mockChainlink);

    // Set Chainlink latest and prev round Id's to non-zero
    await mockChainlink.setLatestRoundId(3);
    await mockChainlink.setPrevRoundId(2);

    //Set current and prev prices in both oracles
    await mockChainlink.setPrice(dec(100, 18));
    await mockChainlink.setPrevPrice(dec(100, 18));

    // Set mock price updateTimes in both oracles to very recent
    const now = await th.getLatestBlockTimestamp(web3);
    await mockChainlink.setUpdateTime(now);
  });

  describe("PriceFeed internal testing contract", async accounts => {
    it("fetchPrice before setPrice should return the default price", async () => {
      const price = await priceFeedTestnet.getPrice();
      assert.equal(price, dec(200, 18));
    });
    it("should be able to fetchPrice after setPrice, output of former matching input of latter", async () => {
      await priceFeedTestnet.setPrice(dec(100, 18));
      const price = await priceFeedTestnet.getPrice();
      assert.equal(price, dec(100, 18));
    });
  });

  describe("Mainnet PriceFeed setup", async accounts => {
    it("fetchPrice should fail on contract with no chainlink address set", async () => {
      try {
        const price = await zeroAddressPriceFeed.fetchPrice();
        assert.isFalse(price.receipt.status);
      } catch (err) {
        assert.include(err.message, "function call to a non-contract account");
      }
    });

    it("setAddresses should fail whe called by nonOwner", async () => {
      await assertRevert(
        priceFeed.setAddresses(mockChainlink.address, { from: alice }),
        "Ownable: caller is not the owner"
      );
    });

    it("setAddresses should fail after address has already been set", async () => {
      // Owner can successfully set any address
      const txOwner = await priceFeed.setAddresses(mockChainlink.address, {
        from: owner
      });
      assert.isTrue(txOwner.receipt.status);

      await assertRevert(
        priceFeed.setAddresses(mockChainlink.address, { from: owner }),
        "Ownable: caller is not the owner"
      );
    });
  });

  it("Chainlink working: fetchPrice should return the correct price, taking into account the number of decimal digits on the aggregator", async () => {
    await setAddresses();

    // Oracle price price is 10.00000000
    await mockChainlink.setDecimals(8);
    await mockChainlink.setPrevPrice(dec(1, 9));
    await mockChainlink.setPrice(dec(1, 9));
    await priceFeed.fetchPrice();
    let price = await priceFeed.lastGoodPrice();
    // Check Liquity PriceFeed gives 10, with 18 digit precision
    assert.equal(price, dec(10, 18));

    // Oracle price is 1e9
    await mockChainlink.setDecimals(0);
    await mockChainlink.setPrevPrice(dec(1, 9));
    await mockChainlink.setPrice(dec(1, 9));
    await priceFeed.fetchPrice();
    price = await priceFeed.lastGoodPrice();
    // Check Liquity PriceFeed gives 1e9, with 18 digit precision
    assert.isTrue(price.eq(toBN(dec(1, 27))));

    // Oracle price is 0.0001
    await mockChainlink.setDecimals(18);
    const decimals = await mockChainlink.decimals();

    await mockChainlink.setPrevPrice(dec(1, 14));
    await mockChainlink.setPrice(dec(1, 14));
    await priceFeed.fetchPrice();
    price = await priceFeed.lastGoodPrice();
    // Check Liquity PriceFeed gives 0.0001 with 18 digit precision
    assert.isTrue(price.eq(toBN(dec(1, 14))));

    // Oracle price is 1234.56789
    await mockChainlink.setDecimals(5);
    await mockChainlink.setPrevPrice(dec(123456789));
    await mockChainlink.setPrice(dec(123456789));
    await priceFeed.fetchPrice();
    price = await priceFeed.lastGoodPrice();
    // Check Liquity PriceFeed gives 0.0001 with 18 digit precision
    assert.equal(price, "1234567890000000000000");
  });

  // --- Chainlink breaks ---

  it("Chainlink working: Chainlink broken by zero latest roundId, return last good price", async () => {
    await setAddresses();
    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(999, 8));
    await mockChainlink.setPrice(dec(999, 8));
    await priceFeed.setLastGoodPrice(dec(888, 18));

    await mockChainlink.setLatestRoundId(0);

    await priceFeed.fetchPrice();

    const price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(888, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "1"); // status 1: Chainlink is broken
  });

  it("Chainlink working: Chainlink broken by zero timestamp, return last good price", async () => {
    await setAddresses();
    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(999, 8));
    await mockChainlink.setPrice(dec(999, 8));
    await priceFeed.setLastGoodPrice(dec(888, 18));

    await mockChainlink.setUpdateTime(0);

    await priceFeed.fetchPrice();

    const price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(888, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "1"); // status 1: Chainlink is broken
  });

  it("Chainlink working: Chainlink broken by future timestamp, return last good price", async () => {
    await setAddresses();
    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(999, 8));
    await mockChainlink.setPrice(dec(999, 8));
    await priceFeed.setLastGoodPrice(dec(888, 18));

    const now = await th.getLatestBlockTimestamp(web3);
    const future = toBN(now).add(toBN("1000"));

    await mockChainlink.setUpdateTime(future);

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(888, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "1"); // status 1: Chainlink is broken
  });

  it("Chainlink working: Chainlink broken by negative price, return last good price", async () => {
    await setAddresses();
    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(999, 8));
    await priceFeed.setLastGoodPrice(dec(888, 18));

    await mockChainlink.setPrice("-5000");

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(888, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "1"); // status 1: Chainlink is broken
  });

  it("Chainlink working: Chainlink broken - decimals call reverted, return last good price", async () => {
    await setAddresses();
    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(999, 8));
    await mockChainlink.setPrice(dec(999, 8));
    await priceFeed.setLastGoodPrice(dec(888, 18));

    await mockChainlink.setDecimalsRevert();

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(888, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "1"); // status 1: Chainlink is broken
  });

  it("Chainlink working: Chainlink broken - latest round call reverted, return last good price", async () => {
    await setAddresses();
    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(999, 8));
    await mockChainlink.setPrice(dec(999, 8));
    await priceFeed.setLastGoodPrice(dec(888, 18));

    await mockChainlink.setLatestRevert();

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(888, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "1"); // status 1: Chainlink is broken
  });

  it("Chainlink working: previous round call reverted, return last good price", async () => {
    await setAddresses();
    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(999, 8));
    await mockChainlink.setPrice(dec(999, 8));
    await priceFeed.setLastGoodPrice(dec(888, 18));

    await mockChainlink.setPrevRevert();

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(888, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "1"); // status 1: Chainlink is broken
  });

  // --- Chainlink timeout ---

  it("Chainlink working: Chainlink frozen, return last good price", async () => {
    await setAddresses();
    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(999, 8));
    await mockChainlink.setPrice(dec(999, 8));
    await priceFeed.setLastGoodPrice(dec(888, 18));

    await th.fastForwardTime(14400, web3.currentProvider); // fast forward 4 hours
    const now = await th.getLatestBlockTimestamp(web3);

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(888, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "2"); // status 2: hainlink frozen
  });

  it("Chainlink working: Chainlink is out of date by <3hrs: return Chainklink price", async () => {
    await setAddresses();
    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(1234, 8));
    await mockChainlink.setPrice(dec(1234, 8));
    await th.fastForwardTime(10740, web3.currentProvider); // fast forward 2hrs 59 minutes

    await priceFeed.fetchPrice();

    const price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(1234, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "0"); // status 0: Chainlink working
  });

  // --- Chainlink price deviation ---

  it("Chainlink working: Chainlink price drop of >50%, return last good price", async () => {
    await setAddresses();
    priceFeed.setLastGoodPrice(dec(2, 18));

    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)); // price = 2
    await mockChainlink.setPrice(99999999); // price drops to 0.99999999: a drop of > 50% from previous

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(2, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "3"); // status 3: Chainlink untrusted
  });

  it("Chainlink working: Chainlink price drop of 50%, return the Chainlink price ", async () => {
    await setAddresses();
    priceFeed.setLastGoodPrice(dec(2, 18));

    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)); // price = 2
    await mockChainlink.setPrice(dec(1, 8)); // price drops to 1

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(1, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "0"); // status 0: Chainlink working
  });

  it("Chainlink working: Chainlink price drop of <50%, return Chainlink price", async () => {
    await setAddresses();
    priceFeed.setLastGoodPrice(dec(2, 18));

    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)); // price = 2
    await mockChainlink.setPrice(dec(100000001)); // price drops to 1.00000001:  a drop of < 50% from previous

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(100000001, 10));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "0"); // status 0: Chainlink working
  });

  // Price increase
  it("Chainlink working: Chainlink price increase of >100%, return last good price", async () => {
    await setAddresses();
    priceFeed.setLastGoodPrice(dec(2, 18));

    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)); // price = 2
    await mockChainlink.setPrice(400000001); // price increases to 4.000000001: an increase of > 100% from previous

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(2, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "3"); // Chainlink untrusted
  });

  it("Chainlink working: Chainlink price increase of 100%, return Chainlink price", async () => {
    await setAddresses();
    priceFeed.setLastGoodPrice(dec(2, 18));

    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)); // price = 2
    await mockChainlink.setPrice(dec(4, 8)); // price increases to 4: an increase of 100% from previous

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(4, 18));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "0"); // status 0: Chainlink working
  });

  it("Chainlink working: Chainlink price increase of <100%, return Chainlink price", async () => {
    await setAddresses();
    priceFeed.setLastGoodPrice(dec(2, 18));

    const statusBefore = await priceFeed.status();
    assert.equal(statusBefore, "0"); // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)); // price = 2
    await mockChainlink.setPrice(399999999); // price increases to 3.99999999: an increase of < 100% from previous

    await priceFeed.fetchPrice();

    let price = await priceFeed.lastGoodPrice();
    assert.equal(price, dec(399999999, 10));

    const statusAfter = await priceFeed.status();
    assert.equal(statusAfter, "0"); // status 0: Chainlink working
  });
});
