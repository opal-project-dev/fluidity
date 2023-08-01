import { Container } from "theme-ui";
import { SystemStats } from "../components/SystemStats";
import { TopSystemStats } from "../components/TopSystemStats";
import { Stability } from "../components/Stability/Stability";

const statsToShow: string[] = ["tvl", "lusd-supply", "lusd-sp", "staked-lqty", "tcr"]

export const Farm: React.FC = () => (
  <Container variant="columns" sx={{ justifyContent: "flex-start" }}>
    <Container variant="single">
      <TopSystemStats filterStats={["lusd-sp"]}/>
      <Stability />
      <SystemStats showProtocol filterStats={statsToShow}/>
    </Container>
  </Container>
);
