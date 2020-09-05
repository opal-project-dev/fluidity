pragma solidity 0.5.16;
import "../Interfaces/IGrowthToken.sol";

//TODO: Decide upon and implement GT community issuance schedule.
contract CommunityIssuance {

    // --- Data ---

    address public communityIssuanceDeployer;

    address public growthTokenAddress;
    IGrowthToken growthToken;

    bool active;

    // --- Events ---

    event GrowthTokenAddressSet(address _growthTokenAddress);

    // --- Functions ---

    constructor() public {
        communityIssuanceDeployer = msg.sender;
    }

    function setGrowthTokenAddress(address _growthTokenAddress) external {
        _requireCallerIsCommunityIssuanceDeployer();
        
        growthTokenAddress = _growthTokenAddress;
        growthToken = IGrowthToken(growthTokenAddress);
        emit GrowthTokenAddressSet(_growthTokenAddress);
    }

    function activateContract() external {
        _requireCallerIsCommunityIssuanceDeployer();
        active = true;
    }

    // --- 'require' functions ---

    function _requireCallerIsCommunityIssuanceDeployer() internal view {
        require(msg.sender == communityIssuanceDeployer, "CommunityIssuance: caller is not deployer");
    }

}