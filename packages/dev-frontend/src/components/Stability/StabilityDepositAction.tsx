import { Button } from "theme-ui";
import { Decimal, LiquityStoreState, StabilityDepositChange } from "@fluidity/lib-base";
import { useLiquitySelector } from "@fluidity/lib-react";

import { useLiquity } from "../../hooks/LiquityContext";
import { useTransactionFunction } from "../Transaction";

type StabilityDepositActionProps = {
  transactionId: string;
  change: StabilityDepositChange<Decimal>;
  children?: React.ReactNode;
};

const selectFrontendRegistered = ({ frontend }: LiquityStoreState) =>
  frontend.status === "registered";

export const StabilityDepositAction: React.FC<StabilityDepositActionProps> = ({
  children,
  transactionId,
  change
}) => {
  const { config, liquity } = useLiquity();
  const frontendRegistered = useLiquitySelector(selectFrontendRegistered);

  const frontendTag = frontendRegistered ? config.frontendTag : undefined;

  const [sendTransaction] = useTransactionFunction(
    transactionId,
    change.depositONEU
      ? liquity.send.depositONEUInStabilityPool.bind(liquity.send, change.depositONEU, frontendTag)
      : liquity.send.withdrawONEUFromStabilityPool.bind(liquity.send, change.withdrawONEU)
  );

  return <Button onClick={sendTransaction}>{children}</Button>;
};
