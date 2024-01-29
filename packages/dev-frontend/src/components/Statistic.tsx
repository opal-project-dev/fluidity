import React from "react";
import { Flex, Card } from "theme-ui";
import { InfoIcon } from "./InfoIcon";

type StatisticProps = {
  name: React.ReactNode;
  tooltip?: React.ReactNode;
  children?: React.ReactNode;
};

export const Statistic: React.FC<StatisticProps> = ({ name, tooltip, children }) => {
  return (
    <Flex sx={{ my: "10px" }}>
      <Flex sx={{ alignItems: "center", justifyContent: "flex-start", flex: 1.2, fontWeight: 200 }}>
        <Flex>{name}</Flex>
        {tooltip && <InfoIcon size="xs" tooltip={<Card variant="tooltip">{tooltip}</Card>} />}
      </Flex>
      <Flex sx={{ justifyContent: "flex-end", flex: 0.8, alignItems: "center" }}>{children}</Flex>
    </Flex>
  );
};
