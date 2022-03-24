import React, { useState } from "react";
import { Card, Box, Flex, Button, Label, Input } from "theme-ui";

import { useLiquity } from "../hooks/LiquityContext";

import { Transaction } from "./Transaction";

export const LiquidationManager: React.FC = () => {
    const {
        liquity: { send: liquity }
    } = useLiquity();
    const [numberOfTrovesToLiquidate, setNumberOfTrovesToLiquidate] = useState("90");

    return (
        <Card sx={{mt: 0}}>
            <Box sx={{ p: [2, 3] }}>
                <Flex sx={{ alignItems: "stretch" }}>
                    <Flex sx={{ ml: 2, alignItems: "center" }}>
                        <Transaction
                            id="batch-liquidate"
                            tooltip="Liquidate"
                            tooltipPlacement="bottom"
                            send={overrides => {
                                if (!numberOfTrovesToLiquidate) {
                                    throw new Error("Invalid number");
                                }
                                return liquity.liquidateUpTo(parseInt(numberOfTrovesToLiquidate, 10), overrides);
                            }}
                        >
                            <Button variant="danger">
                                Liquidate
                            </Button>
                        </Transaction>
                        <Label>Up to</Label>
                        <Input
                            type="number"
                            min="1"
                            step="1"
                            value={numberOfTrovesToLiquidate}
                            onChange={e => setNumberOfTrovesToLiquidate(e.target.value)}
                        />
                        <Label>Troves</Label>
                    </Flex>
                </Flex>
            </Box>
        </Card>
    );
};
