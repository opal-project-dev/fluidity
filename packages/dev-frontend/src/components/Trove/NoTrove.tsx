import React, { useCallback } from "react";
import { Card, Heading, Box, Flex, Button } from "theme-ui";
import { InfoMessage } from "../InfoMessage";
import { useTroveView } from "./context/TroveViewContext";
import { DisabledEditableRow } from "./Editor";
import { COIN } from "../../strings";

export const NoTrove: React.FC = props => {
  const { dispatchEvent } = useTroveView();

  const handleOpenTrove = useCallback(() => {
    dispatchEvent("OPEN_TROVE_PRESSED");
  }, [dispatchEvent]);

  return (
    <Card>
      <Heading>Trove</Heading>
      <Box sx={{ p: [2, 3] }}>
          <DisabledEditableRow
            label="Collateral"
            inputId="trove-collateral"
            amount="0.00"
            unit="NTN"
          />

          <DisabledEditableRow
            label="Debt"
            inputId="trove-debt"
            amount="0.00"
            unit={COIN}
          />

        <InfoMessage title="You haven't borrowed any OUSD yet.">
          You can borrow OUSD by opening a Trove.
        </InfoMessage>

        <Flex variant="layout.actions">
          <Button onClick={handleOpenTrove}>Open Trove</Button>
        </Flex>
      </Box>
    </Card>
  );
};
