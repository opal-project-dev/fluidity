import React, { useState } from "react";
import { Heading, Box, Card, Button } from "theme-ui";

import { Decimal, Decimalish, Difference, LiquityStoreState, OPLStake } from "@fluidity/lib-base";
import { useLiquitySelector } from "@fluidity/lib-react";

import { COIN, GT } from "../../strings";

import { Icon } from "../Icon";
import { EditableRow, StaticRow } from "../Trove/Editor";
import { LoadingOverlay } from "../LoadingOverlay";

import { useStakingView } from "./context/StakingViewContext";

const select = ({ lqtyBalance, totalStakedOPL }: LiquityStoreState) => ({
  lqtyBalance,
  totalStakedOPL
});

type StakingEditorProps = {
  title: string;
  originalStake: OPLStake;
  editedLQTY: Decimal;
  dispatch: (action: { type: "setStake"; newValue: Decimalish } | { type: "revert" }) => void;
};

export const StakingEditor: React.FC<StakingEditorProps> = ({
  children,
  title,
  originalStake,
  editedLQTY,
  dispatch
}) => {
  const { lqtyBalance, totalStakedOPL } = useLiquitySelector(select);
  const { changePending } = useStakingView();
  const editingState = useState<string>();

  const edited = !editedLQTY.eq(originalStake.stakedOPL);

  const maxAmount = originalStake.stakedOPL.add(lqtyBalance);
  const maxedOut = editedLQTY.eq(maxAmount);

  const totalStakedLQTYAfterChange = totalStakedOPL.sub(originalStake.stakedOPL).add(editedLQTY);

  const originalPoolShare = originalStake.stakedOPL.mulDiv(100, totalStakedOPL);
  const newPoolShare = editedLQTY.mulDiv(100, totalStakedLQTYAfterChange);
  const poolShareChange =
    originalStake.stakedOPL.nonZero && Difference.between(newPoolShare, originalPoolShare).nonZero;

  return (
    <Card>
      <Heading>
        {title}
        {edited && !changePending && (
          <Button
            variant="titleIcon"
            sx={{ ":enabled:hover": { color: "danger" } }}
            onClick={() => dispatch({ type: "revert" })}
          >
            <Icon name="history" size="lg" />
          </Button>
        )}
      </Heading>

      <Box sx={{ p: [2, 3] }}>
        <EditableRow
          label="Stake"
          inputId="stake-lqty"
          amount={editedLQTY.prettify()}
          maxAmount={maxAmount.toString()}
          maxedOut={maxedOut}
          unit={GT}
          {...{ editingState }}
          editedAmount={editedLQTY.toString(2)}
          setEditedAmount={newValue => dispatch({ type: "setStake", newValue })}
        />

        {newPoolShare.infinite ? (
          <StaticRow label="Pool share" inputId="stake-share" amount="N/A" />
        ) : (
          <StaticRow
            label="Pool share"
            inputId="stake-share"
            amount={newPoolShare.prettify(4)}
            pendingAmount={poolShareChange?.prettify(4).concat("%")}
            pendingColor={poolShareChange?.positive ? "success" : "danger"}
            unit="%"
          />
        )}

        {!originalStake.isEmpty && (
          <>
            <StaticRow
              label="Redemption gain"
              inputId="stake-gain-eth"
              amount={originalStake.collateralGain.prettify(4)}
              color={originalStake.collateralGain.nonZero && "success"}
              unit="NTN"
            />

            <StaticRow
              label="Issuance gain"
              inputId="stake-gain-lusd"
              amount={originalStake.lusdGain.prettify()}
              color={originalStake.lusdGain.nonZero && "success"}
              unit={COIN}
            />
          </>
        )}

        {children}
      </Box>

      {changePending && <LoadingOverlay />}
    </Card>
  );
};
