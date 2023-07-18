// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Interfaces/IOPLToken.sol";
import "../Interfaces/ICommunityIssuance.sol";
import "../Dependencies/BaseMath.sol";
import "../Dependencies/LiquityMath.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/SafeMath.sol";

contract CommunityIssuance is ICommunityIssuance, Ownable, CheckContract, BaseMath {
    using SafeMath for uint;

    // --- Data ---

    string public constant NAME = "CommunityIssuance";

    uint public constant SECONDS_IN_ONE_MINUTE = 60;

    /* The issuance factor F determines the curvature of the issuance curve.
     *
     * Minutes in one year: 60*24*365 = 525600
     *
     * For 50% of remaining tokens issued each year, with minutes as time units, we have:
     *
     * F ** 525600 = 0.5
     *
     * Re-arranging:
     *
     * 525600 * ln(F) = ln(0.5)
     * F = 0.5 ** (1/525600)
     * F = 0.999998681227695000
     */
    uint public constant ISSUANCE_FACTOR = 999998681227695000;

    /*
     * The community OPL supply cap is the starting balance of the Community Issuance contract.
     * It should be minted to this contract by OPLToken, when the token is deployed.
     *
     * Set to 32M (slightly less than 1/3) of total OPL supply.
     */
    uint public constant OPLSupplyCap = 32e24; // 32 million

    IOPLToken public lqtyToken;

    address public stabilityPoolAddress;

    uint public totalOPLIssued;
    uint public immutable deploymentTime;

    // --- Events ---

    event OPLTokenAddressSet(address _lqtyTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalOPLIssuedUpdated(uint _totalOPLIssued);

    // --- Functions ---

    constructor() public {
        deploymentTime = block.timestamp;
    }

    function setAddresses(
        address _lqtyTokenAddress,
        address _stabilityPoolAddress
    ) external override onlyOwner {
        checkContract(_lqtyTokenAddress);
        checkContract(_stabilityPoolAddress);

        lqtyToken = IOPLToken(_lqtyTokenAddress);
        stabilityPoolAddress = _stabilityPoolAddress;

        // When OPLToken deployed, it should have transferred CommunityIssuance's OPL entitlement
        uint OPLBalance = lqtyToken.balanceOf(address(this));
        assert(OPLBalance >= OPLSupplyCap);

        emit OPLTokenAddressSet(_lqtyTokenAddress);
        emit StabilityPoolAddressSet(_stabilityPoolAddress);

        _renounceOwnership();
    }

    function issueOPL() external override returns (uint) {
        _requireCallerIsStabilityPool();

        uint latestTotalOPLIssued = OPLSupplyCap.mul(_getCumulativeIssuanceFraction()).div(
            DECIMAL_PRECISION
        );
        uint issuance = latestTotalOPLIssued.sub(totalOPLIssued);

        totalOPLIssued = latestTotalOPLIssued;
        emit TotalOPLIssuedUpdated(latestTotalOPLIssued);

        return issuance;
    }

    /* Gets 1-f^t    where: f < 1

    f: issuance factor that determines the shape of the curve
    t:  time passed since last OPL issuance event  */
    function _getCumulativeIssuanceFraction() internal view returns (uint) {
        // Get the time passed since deployment
        uint timePassedInMinutes = block.timestamp.sub(deploymentTime).div(SECONDS_IN_ONE_MINUTE);

        // f^t
        uint power = LiquityMath._decPow(ISSUANCE_FACTOR, timePassedInMinutes);

        //  (1 - f^t)
        uint cumulativeIssuanceFraction = (uint(DECIMAL_PRECISION).sub(power));
        assert(cumulativeIssuanceFraction <= DECIMAL_PRECISION); // must be in range [0,1]

        return cumulativeIssuanceFraction;
    }

    function sendOPL(address _account, uint _OPLamount) external override {
        _requireCallerIsStabilityPool();

        lqtyToken.transfer(_account, _OPLamount);
    }

    // --- 'require' functions ---

    function _requireCallerIsStabilityPool() internal view {
        require(msg.sender == stabilityPoolAddress, "CommunityIssuance: caller is not SP");
    }
}
