import React, { useCallback } from "react";
import { Card, Heading, Box, Flex, Button } from "theme-ui";
import { InfoMessage } from "../InfoMessage";
import { useStabilityView } from "./context/StabilityViewContext";
import { DisabledEditableRow } from "../Trove/Editor";
import { RemainingOPL } from "./RemainingOPL";
import { Yield } from "./Yield";
import { COIN } from "../../strings";

export const NoDeposit: React.FC = props => {
  const { dispatchEvent } = useStabilityView();

  const handleOpenTrove = useCallback(() => {
    dispatchEvent("DEPOSIT_PRESSED");
  }, [dispatchEvent]);

  return (
    <Card>
      <Heading>
        Stability Pool
        <Flex sx={{ justifyContent: "flex-end" }}>
          <RemainingOPL />
        </Flex>
      </Heading>
      <Box sx={{ p: [2, 3] }}>
          <DisabledEditableRow
            label="Deposit"
            inputId="deposit-lusd"
            amount="0.00"
            unit={COIN}
          />

        <InfoMessage title="You have no OUSD in the Stability Pool.">
          You can earn NTN and OPAL rewards by depositing OUSD.
        </InfoMessage>

        <Flex variant="layout.actions">
          <Flex sx={{ justifyContent: "flex-start", flex: 1, alignItems: "center" }}>
            <Yield />
          </Flex>
          <Button onClick={handleOpenTrove}>Deposit</Button>
        </Flex>
      </Box>
    </Card>
  );
};
