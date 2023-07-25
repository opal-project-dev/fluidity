import { Button } from "theme-ui";

import { Decimal, OPLStakeChange } from "@fluidity/lib-base";

import { useLiquity } from "../../hooks/LiquityContext";
import { useTransactionFunction } from "../Transaction";

type StakingActionProps = {
  change: OPLStakeChange<Decimal>;
};

export const StakingManagerAction: React.FC<StakingActionProps> = ({ change, children }) => {
  const { liquity } = useLiquity();

  const [sendTransaction] = useTransactionFunction(
    "stake",
    change.stakeOPL
      ? liquity.send.stakeOPL.bind(liquity.send, change.stakeOPL)
      : liquity.send.unstakeOPL.bind(liquity.send, change.unstakeOPL)
  );

  return <Button onClick={sendTransaction}>{children}</Button>;
};
