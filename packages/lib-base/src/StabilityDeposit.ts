import { Decimal, Decimalish } from "./Decimal";

/**
 * Represents the change between two Stability Deposit states.
 *
 * @public
 */
export type StabilityDepositChange<T> =
  | { depositONEU: T; withdrawONEU?: undefined }
  | { depositONEU?: undefined; withdrawONEU: T; withdrawAllONEU: boolean };

/**
 * A Stability Deposit and its accrued gains.
 *
 * @public
 */
export class StabilityDeposit {
  /** Amount of ONEU in the Stability Deposit at the time of the last direct modification. */
  readonly initialONEU: Decimal;

  /** Amount of ONEU left in the Stability Deposit. */
  readonly currentONEU: Decimal;

  /** Amount of native currency (e.g. Ether) received in exchange for the used-up ONEU. */
  readonly collateralGain: Decimal;

  /** Amount of OPL rewarded since the last modification of the Stability Deposit. */
  readonly lqtyReward: Decimal;

  /**
   * Address of frontend through which this Stability Deposit was made.
   *
   * @remarks
   * If the Stability Deposit was made through a frontend that doesn't tag deposits, this will be
   * the zero-address.
   */
  readonly frontendTag: string;

  /** @internal */
  constructor(
    initialONEU: Decimal,
    currentONEU: Decimal,
    collateralGain: Decimal,
    lqtyReward: Decimal,
    frontendTag: string
  ) {
    this.initialONEU = initialONEU;
    this.currentONEU = currentONEU;
    this.collateralGain = collateralGain;
    this.lqtyReward = lqtyReward;
    this.frontendTag = frontendTag;

    if (this.currentONEU.gt(this.initialONEU)) {
      throw new Error("currentONEU can't be greater than initialONEU");
    }
  }

  get isEmpty(): boolean {
    return (
      this.initialONEU.isZero &&
      this.currentONEU.isZero &&
      this.collateralGain.isZero &&
      this.lqtyReward.isZero
    );
  }

  /** @internal */
  toString(): string {
    return (
      `{ initialONEU: ${this.initialONEU}` +
      `, currentONEU: ${this.currentONEU}` +
      `, collateralGain: ${this.collateralGain}` +
      `, lqtyReward: ${this.lqtyReward}` +
      `, frontendTag: "${this.frontendTag}" }`
    );
  }

  /**
   * Compare to another instance of `StabilityDeposit`.
   */
  equals(that: StabilityDeposit): boolean {
    return (
      this.initialONEU.eq(that.initialONEU) &&
      this.currentONEU.eq(that.currentONEU) &&
      this.collateralGain.eq(that.collateralGain) &&
      this.lqtyReward.eq(that.lqtyReward) &&
      this.frontendTag === that.frontendTag
    );
  }

  /**
   * Calculate the difference between the `currentONEU` in this Stability Deposit and `thatONEU`.
   *
   * @returns An object representing the change, or `undefined` if the deposited amounts are equal.
   */
  whatChanged(thatONEU: Decimalish): StabilityDepositChange<Decimal> | undefined {
    thatONEU = Decimal.from(thatONEU);

    if (thatONEU.lt(this.currentONEU)) {
      return { withdrawONEU: this.currentONEU.sub(thatONEU), withdrawAllONEU: thatONEU.isZero };
    }

    if (thatONEU.gt(this.currentONEU)) {
      return { depositONEU: thatONEU.sub(this.currentONEU) };
    }
  }

  /**
   * Apply a {@link StabilityDepositChange} to this Stability Deposit.
   *
   * @returns The new deposited ONEU amount.
   */
  apply(change: StabilityDepositChange<Decimalish> | undefined): Decimal {
    if (!change) {
      return this.currentONEU;
    }

    if (change.withdrawONEU !== undefined) {
      return change.withdrawAllONEU || this.currentONEU.lte(change.withdrawONEU)
        ? Decimal.ZERO
        : this.currentONEU.sub(change.withdrawONEU);
    } else {
      return this.currentONEU.add(change.depositONEU);
    }
  }
}
