import { Decimal, Decimalish } from "./Decimal";

/**
 * Represents the change between two states of an OPL Stake.
 *
 * @public
 */
export type OPLStakeChange<T> =
  | { stakeOPL: T; unstakeOPL?: undefined }
  | { stakeOPL?: undefined; unstakeOPL: T; unstakeAllOPL: boolean };

/** 
 * Represents a user's OPL stake and accrued gains.
 * 
 * @remarks
 * Returned by the {@link ReadableLiquity.getOPLStake | getOPLStake()} function.

 * @public
 */
export class OPLStake {
  /** The amount of OPL that's staked. */
  readonly stakedOPL: Decimal;

  /** Collateral gain available to withdraw. */
  readonly collateralGain: Decimal;

  /** ONEU gain available to withdraw. */
  readonly lusdGain: Decimal;

  /** @internal */
  constructor(stakedOPL = Decimal.ZERO, collateralGain = Decimal.ZERO, lusdGain = Decimal.ZERO) {
    this.stakedOPL = stakedOPL;
    this.collateralGain = collateralGain;
    this.lusdGain = lusdGain;
  }

  get isEmpty(): boolean {
    return this.stakedOPL.isZero && this.collateralGain.isZero && this.lusdGain.isZero;
  }

  /** @internal */
  toString(): string {
    return (
      `{ stakedOPL: ${this.stakedOPL}` +
      `, collateralGain: ${this.collateralGain}` +
      `, lusdGain: ${this.lusdGain} }`
    );
  }

  /**
   * Compare to another instance of `OPLStake`.
   */
  equals(that: OPLStake): boolean {
    return (
      this.stakedOPL.eq(that.stakedOPL) &&
      this.collateralGain.eq(that.collateralGain) &&
      this.lusdGain.eq(that.lusdGain)
    );
  }

  /**
   * Calculate the difference between this `OPLStake` and `thatStakedOPL`.
   *
   * @returns An object representing the change, or `undefined` if the staked amounts are equal.
   */
  whatChanged(thatStakedOPL: Decimalish): OPLStakeChange<Decimal> | undefined {
    thatStakedOPL = Decimal.from(thatStakedOPL);

    if (thatStakedOPL.lt(this.stakedOPL)) {
      return {
        unstakeOPL: this.stakedOPL.sub(thatStakedOPL),
        unstakeAllOPL: thatStakedOPL.isZero
      };
    }

    if (thatStakedOPL.gt(this.stakedOPL)) {
      return { stakeOPL: thatStakedOPL.sub(this.stakedOPL) };
    }
  }

  /**
   * Apply a {@link OPLStakeChange} to this `OPLStake`.
   *
   * @returns The new staked OPL amount.
   */
  apply(change: OPLStakeChange<Decimalish> | undefined): Decimal {
    if (!change) {
      return this.stakedOPL;
    }

    if (change.unstakeOPL !== undefined) {
      return change.unstakeAllOPL || this.stakedOPL.lte(change.unstakeOPL)
        ? Decimal.ZERO
        : this.stakedOPL.sub(change.unstakeOPL);
    } else {
      return this.stakedOPL.add(change.stakeOPL);
    }
  }
}
