import React from "react";
import { Flex } from "theme-ui";

import { LiquityStoreState } from "@fluidity/lib-base";
import { useLiquitySelector } from "@fluidity/lib-react";

const selector = ({ remainingStabilityPoolOPLReward }: LiquityStoreState) => ({
  remainingStabilityPoolOPLReward
});

export const RemainingOPL: React.FC = () => {
  const { remainingStabilityPoolOPLReward } = useLiquitySelector(selector);

  return (
    <Flex sx={{ mr: 2, fontSize: 2, fontWeight: "medium" }}>
      {remainingStabilityPoolOPLReward.prettify(0)} OPAL remaining
    </Flex>
  );
};
