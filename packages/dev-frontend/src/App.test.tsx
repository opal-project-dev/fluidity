import { render } from "@testing-library/react";

import { Decimal, ONEU_MINIMUM_NET_DEBT, Trove } from "@fluidity/lib-base";

import App from "./App";

const params = { depositCollateral: Decimal.from(20), borrowONEU: ONEU_MINIMUM_NET_DEBT };
const trove = Trove.create(params);

console.log(`${trove}`);

/*
 * Just a quick and dirty testcase to prove that the approach can work in our CI pipeline.
 */
test("there's no smoke", async () => {
  const { findByText } = render(<App />);
  expect(await findByText(/^borrow$/i)).toBeInTheDocument();
});
