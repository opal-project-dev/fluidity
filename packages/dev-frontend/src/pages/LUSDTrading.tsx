import { Container } from "theme-ui";

import { Stability } from "../components/Stability/Stability";
import { SystemStats } from "../components/SystemStats";
import { PriceManager } from "../components/PriceManager";

export const LUSDTrading: React.FC = () => (
  <Container variant="columns">
    <Container variant="left">
      <Stability />
    </Container>

    <Container variant="right">
      <SystemStats showBalances showProtocol showPriceFeed/>
      <PriceManager />
    </Container>
  </Container>
);
