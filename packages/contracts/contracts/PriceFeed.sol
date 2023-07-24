// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./Interfaces/IPriceFeed.sol";
import "./Dependencies/AggregatorV3Interface.sol";
import "./Dependencies/SafeMath.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/BaseMath.sol";
import "./Dependencies/LiquityMath.sol";

import "./Dependencies/console.sol";

/*
 * PriceFeed for mainnet deployment, to be connected to Chainlink's live AUT:USD aggregator reference
 * contract.
 *
 * The PriceFeed uses Chainlink as primary oracle.
 */
contract PriceFeed is Ownable, CheckContract, BaseMath, IPriceFeed {
    using SafeMath for uint256;
    string public constant NAME = "PriceFeed";

    AggregatorV3Interface public priceAggregator; // Mainnet Chainlink aggregator

    // Core Liquity contracts
    address borrowerOperationsAddress;
    address troveManagerAddress;

    // Use to convert a price answer to an 18-digit precision uint
    uint public constant TARGET_DIGITS = 18;

    // Maximum time period allowed since Chainlink's latest round data timestamp, beyond which Chainlink is considered frozen.
    uint public constant TIMEOUT = 14400; // 4 hours: 60 * 60 * 4

    // Maximum deviation allowed between two consecutive Chainlink oracle prices. 18-digit precision.
    uint public constant MAX_PRICE_DEVIATION_FROM_PREVIOUS_ROUND = 5e17; // 50%

    // The last good price seen from an oracle by Liquity
    uint public lastGoodPrice;

    struct ChainlinkResponse {
        uint80 roundId;
        int256 answer;
        uint256 timestamp;
        bool success;
        uint8 decimals;
    }

    enum Status {
        chainlinkIsWorking,
        chainlinkIsBroken,
        chainlinkIsFrozen,
        chainlinkIsUntrusted
    }

    // The current status of the PricFeed, which determines the conditions for the next price fetch attempt
    Status public status;

    event LastGoodPriceUpdated(uint _lastGoodPrice);
    event PriceFeedStatusChanged(Status newStatus);

    // --- Dependency setters ---

    function setAddresses(address _priceAggregatorAddress) external onlyOwner {
        checkContract(_priceAggregatorAddress);

        priceAggregator = AggregatorV3Interface(_priceAggregatorAddress);

        // Explicitly set initial system status
        status = Status.chainlinkIsWorking;

        // Get an initial price from Chainlink to serve as first reference for lastGoodPrice
        ChainlinkResponse memory chainlinkResponse = _getCurrentChainlinkResponse();
        ChainlinkResponse memory prevChainlinkResponse = _getPrevChainlinkResponse(
            chainlinkResponse.roundId,
            chainlinkResponse.decimals
        );

        console.log("chainliinkResponse");
        console.logInt(chainlinkResponse.answer);
        console.log(chainlinkResponse.decimals);
        console.log(chainlinkResponse.roundId);
        console.log(chainlinkResponse.timestamp);
        console.log(chainlinkResponse.success);
        console.log(_badChainlinkResponse(chainlinkResponse));

        console.log("prevChainlinkResponse");
        console.logInt(prevChainlinkResponse.answer);
        console.log(prevChainlinkResponse.decimals);
        console.log(prevChainlinkResponse.roundId);
        console.log(prevChainlinkResponse.timestamp);
        console.log(prevChainlinkResponse.success);
        console.log(_badChainlinkResponse(prevChainlinkResponse));

        require(
            !_chainlinkIsBroken(chainlinkResponse, prevChainlinkResponse) &&
                !_chainlinkIsFrozen(chainlinkResponse),
            "PriceFeed: Chainlink must be working and current"
        );

        _storeChainlinkPrice(chainlinkResponse);

        _renounceOwnership();
    }

    // --- Functions ---

    /*
     * fetchPrice():
     * Returns the latest price obtained from the Oracle. Called by Liquity functions that require a current price.
     *
     * Also callable by anyone externally.
     *
     * Non-view function - it stores the last good price seen by Liquity.
     *
     * Uses a main oracle (Chainlink). If it fails,
     * it uses the last good price seen by Liquity.
     *
     */
    function fetchPrice() external override returns (uint) {
        // Get current and previous price data from Chainlink
        ChainlinkResponse memory chainlinkResponse = _getCurrentChainlinkResponse();
        ChainlinkResponse memory prevChainlinkResponse = _getPrevChainlinkResponse(
            chainlinkResponse.roundId,
            chainlinkResponse.decimals
        );

        // If Chainlink is broken, return last good price
        if (_chainlinkIsBroken(chainlinkResponse, prevChainlinkResponse)) {
            _changeStatus(Status.chainlinkIsBroken);
            return lastGoodPrice;
        }

        // If Chainlink is frozen, return last good price
        if (_chainlinkIsFrozen(chainlinkResponse)) {
            _changeStatus(Status.chainlinkIsFrozen);
            return lastGoodPrice;
        }

        // If Chainlink price has changed by > 50% between two consecutive rounds, return last good price
        if (_chainlinkPriceChangeAboveMax(chainlinkResponse, prevChainlinkResponse)) {
            _changeStatus(Status.chainlinkIsUntrusted);
            return lastGoodPrice;
        }

        _changeStatus(Status.chainlinkIsWorking);
        return _storeChainlinkPrice(chainlinkResponse);
    }

    // --- Helper functions ---

    /* Chainlink is considered broken if its current or previous round data is in any way bad. We check the previous round
     * for two reasons:
     *
     * 1) It is necessary data for the price deviation check in case 1,
     * and
     * 2) Chainlink is the PriceFeed's preferred primary oracle - having two consecutive valid round responses adds
     * peace of mind when using or returning to Chainlink.
     */
    function _chainlinkIsBroken(
        ChainlinkResponse memory _currentResponse,
        ChainlinkResponse memory _prevResponse
    ) internal view returns (bool) {
        return _badChainlinkResponse(_currentResponse) || _badChainlinkResponse(_prevResponse);
    }

    function _badChainlinkResponse(ChainlinkResponse memory _response) internal view returns (bool) {
        // Check for response call reverted
        if (!_response.success) {
            return true;
        }
        // Check for an invalid roundId that is 0
        if (_response.roundId == 0) {
            return true;
        }
        // Check for an invalid timeStamp that is 0, or in the future
        if (_response.timestamp == 0 || _response.timestamp > block.timestamp) {
            return true;
        }
        // Check for non-positive price
        if (_response.answer <= 0) {
            return true;
        }

        return false;
    }

    function _chainlinkIsFrozen(ChainlinkResponse memory _response) internal view returns (bool) {
        return block.timestamp.sub(_response.timestamp) > TIMEOUT;
    }

    function _chainlinkPriceChangeAboveMax(
        ChainlinkResponse memory _currentResponse,
        ChainlinkResponse memory _prevResponse
    ) internal pure returns (bool) {
        uint currentScaledPrice = _scaleChainlinkPriceByDigits(
            uint256(_currentResponse.answer),
            _currentResponse.decimals
        );
        uint prevScaledPrice = _scaleChainlinkPriceByDigits(
            uint256(_prevResponse.answer),
            _prevResponse.decimals
        );

        uint minPrice = LiquityMath._min(currentScaledPrice, prevScaledPrice);
        uint maxPrice = LiquityMath._max(currentScaledPrice, prevScaledPrice);

        /*
         * Use the larger price as the denominator:
         * - If price decreased, the percentage deviation is in relation to the the previous price.
         * - If price increased, the percentage deviation is in relation to the current price.
         */
        uint percentDeviation = maxPrice.sub(minPrice).mul(DECIMAL_PRECISION).div(maxPrice);

        // Return true if price has more than doubled, or more than halved.
        return percentDeviation > MAX_PRICE_DEVIATION_FROM_PREVIOUS_ROUND;
    }

    function _scaleChainlinkPriceByDigits(
        uint _price,
        uint _answerDigits
    ) internal pure returns (uint) {
        /*
         * Convert the price returned by the Chainlink oracle to an 18-digit decimal for use by Liquity.
         * At date of Liquity launch, Chainlink uses an 8-digit price, but we also handle the possibility of
         * future changes.
         *
         */
        uint price;
        if (_answerDigits >= TARGET_DIGITS) {
            // Scale the returned price value down to Liquity's target precision
            price = _price.div(10 ** (_answerDigits - TARGET_DIGITS));
        } else if (_answerDigits < TARGET_DIGITS) {
            // Scale the returned price value up to Liquity's target precision
            price = _price.mul(10 ** (TARGET_DIGITS - _answerDigits));
        }
        return price;
    }

    function _changeStatus(Status _status) internal {
        status = _status;
        emit PriceFeedStatusChanged(_status);
    }

    function _storePrice(uint _currentPrice) internal {
        lastGoodPrice = _currentPrice;
        emit LastGoodPriceUpdated(_currentPrice);
    }

    function _storeChainlinkPrice(
        ChainlinkResponse memory _chainlinkResponse
    ) internal returns (uint) {
        uint scaledChainlinkPrice = _scaleChainlinkPriceByDigits(
            uint256(_chainlinkResponse.answer),
            _chainlinkResponse.decimals
        );
        _storePrice(scaledChainlinkPrice);

        return scaledChainlinkPrice;
    }

    // --- Oracle response wrapper functions ---

    function _getCurrentChainlinkResponse()
        internal
        view
        returns (ChainlinkResponse memory chainlinkResponse)
    {
        // First, try to get current decimal precision:
        try priceAggregator.decimals() returns (uint8 decimals) {
            // If call to Chainlink succeeds, record the current decimal precision
            chainlinkResponse.decimals = decimals;
        } catch {
            // If call to Chainlink aggregator reverts, return a zero response with success = false
            return chainlinkResponse;
        }

        // Secondly, try to get latest price data:
        try priceAggregator.latestRoundData() returns (
            uint80 roundId,
            int256 answer,
            uint256 /* startedAt */,
            uint256 timestamp,
            uint80 /* answeredInRound */
        ) {
            // If call to Chainlink succeeds, return the response and success = true
            chainlinkResponse.roundId = roundId;
            chainlinkResponse.answer = answer;
            chainlinkResponse.timestamp = timestamp;
            chainlinkResponse.success = true;
            return chainlinkResponse;
        } catch {
            // If call to Chainlink aggregator reverts, return a zero response with success = false
            return chainlinkResponse;
        }
    }

    function _getPrevChainlinkResponse(
        uint80 _currentRoundId,
        uint8 _currentDecimals
    ) internal view returns (ChainlinkResponse memory prevChainlinkResponse) {
        /*
         * NOTE: Chainlink only offers a current decimals() value - there is no way to obtain the decimal precision used in a
         * previous round.  We assume the decimals used in the previous round are the same as the current round.
         */

        // Try to get the price data from the previous round:
        try priceAggregator.getRoundData(_currentRoundId) returns (
            uint80 roundId,
            int256 answer,
            uint256 /* startedAt */,
            uint256 timestamp,
            uint80 /* answeredInRound */
        ) {
            // If call to Chainlink succeeds, return the response and success = true
            prevChainlinkResponse.roundId = roundId;
            prevChainlinkResponse.answer = answer;
            prevChainlinkResponse.timestamp = timestamp;
            prevChainlinkResponse.decimals = _currentDecimals;
            prevChainlinkResponse.success = true;
            return prevChainlinkResponse;
        } catch {
            // If call to Chainlink aggregator reverts, return a zero response with success = false
            return prevChainlinkResponse;
        }
    }
}
