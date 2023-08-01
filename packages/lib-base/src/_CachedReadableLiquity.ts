import { Decimal } from "./Decimal";
import { Fees } from "./Fees";
import { OPLStake } from "./OPLStake";
import { StabilityDeposit } from "./StabilityDeposit";
import { Trove, TroveWithPendingRedistribution, UserTrove } from "./Trove";
import { FrontendStatus, ReadableLiquity, TroveListingParams } from "./ReadableLiquity";

/** @internal */
export type _ReadableLiquityWithExtraParamsBase<T extends unknown[]> = {
  [P in keyof ReadableLiquity]: ReadableLiquity[P] extends (...params: infer A) => infer R
    ? (...params: [...originalParams: A, ...extraParams: T]) => R
    : never;
};

/** @internal */
export type _LiquityReadCacheBase<T extends unknown[]> = {
  [P in keyof ReadableLiquity]: ReadableLiquity[P] extends (...args: infer A) => Promise<infer R>
    ? (...params: [...originalParams: A, ...extraParams: T]) => R | undefined
    : never;
};

// Overloads get lost in the mapping, so we need to define them again...

/** @internal */
export interface _ReadableLiquityWithExtraParams<T extends unknown[]>
  extends _ReadableLiquityWithExtraParamsBase<T> {
  getTroves(
    params: TroveListingParams & { beforeRedistribution: true },
    ...extraParams: T
  ): Promise<TroveWithPendingRedistribution[]>;

  getTroves(params: TroveListingParams, ...extraParams: T): Promise<UserTrove[]>;
}

/** @internal */
export interface _LiquityReadCache<T extends unknown[]> extends _LiquityReadCacheBase<T> {
  getTroves(
    params: TroveListingParams & { beforeRedistribution: true },
    ...extraParams: T
  ): TroveWithPendingRedistribution[] | undefined;

  getTroves(params: TroveListingParams, ...extraParams: T): UserTrove[] | undefined;
}

/** @internal */
export class _CachedReadableLiquity<T extends unknown[]>
  implements _ReadableLiquityWithExtraParams<T> {
  private _readable: _ReadableLiquityWithExtraParams<T>;
  private _cache: _LiquityReadCache<T>;

  constructor(readable: _ReadableLiquityWithExtraParams<T>, cache: _LiquityReadCache<T>) {
    this._readable = readable;
    this._cache = cache;
  }

  async getTotalRedistributed(...extraParams: T): Promise<Trove> {
    return (
      this._cache.getTotalRedistributed(...extraParams) ??
      this._readable.getTotalRedistributed(...extraParams)
    );
  }

  async getTroveBeforeRedistribution(
    address?: string,
    ...extraParams: T
  ): Promise<TroveWithPendingRedistribution> {
    return (
      this._cache.getTroveBeforeRedistribution(address, ...extraParams) ??
      this._readable.getTroveBeforeRedistribution(address, ...extraParams)
    );
  }

  async getTrove(address?: string, ...extraParams: T): Promise<UserTrove> {
    const [troveBeforeRedistribution, totalRedistributed] = await Promise.all([
      this.getTroveBeforeRedistribution(address, ...extraParams),
      this.getTotalRedistributed(...extraParams)
    ]);

    return troveBeforeRedistribution.applyRedistribution(totalRedistributed);
  }

  async getNumberOfTroves(...extraParams: T): Promise<number> {
    return (
      this._cache.getNumberOfTroves(...extraParams) ??
      this._readable.getNumberOfTroves(...extraParams)
    );
  }

  async getPrice(...extraParams: T): Promise<Decimal> {
    return this._cache.getPrice(...extraParams) ?? this._readable.getPrice(...extraParams);
  }

  async getTotal(...extraParams: T): Promise<Trove> {
    return this._cache.getTotal(...extraParams) ?? this._readable.getTotal(...extraParams);
  }

  async getStabilityDeposit(address?: string, ...extraParams: T): Promise<StabilityDeposit> {
    return (
      this._cache.getStabilityDeposit(address, ...extraParams) ??
      this._readable.getStabilityDeposit(address, ...extraParams)
    );
  }

  async getRemainingStabilityPoolOPLReward(...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getRemainingStabilityPoolOPLReward(...extraParams) ??
      this._readable.getRemainingStabilityPoolOPLReward(...extraParams)
    );
  }

  async getONEUInStabilityPool(...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getONEUInStabilityPool(...extraParams) ??
      this._readable.getONEUInStabilityPool(...extraParams)
    );
  }

  async getONEUBalance(address?: string, ...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getONEUBalance(address, ...extraParams) ??
      this._readable.getONEUBalance(address, ...extraParams)
    );
  }

  async getOPLBalance(address?: string, ...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getOPLBalance(address, ...extraParams) ??
      this._readable.getOPLBalance(address, ...extraParams)
    );
  }

  // async getUniTokenBalance(address?: string, ...extraParams: T): Promise<Decimal> {
  //   return (
  //     this._cache.getUniTokenBalance(address, ...extraParams) ??
  //     this._readable.getUniTokenBalance(address, ...extraParams)
  //   );
  // }

  // async getUniTokenAllowance(address?: string, ...extraParams: T): Promise<Decimal> {
  //   return (
  //     this._cache.getUniTokenAllowance(address, ...extraParams) ??
  //     this._readable.getUniTokenAllowance(address, ...extraParams)
  //   );
  // }

  // async getRemainingLiquidityMiningOPLReward(...extraParams: T): Promise<Decimal> {
  //   return (
  //     this._cache.getRemainingLiquidityMiningOPLReward(...extraParams) ??
  //     this._readable.getRemainingLiquidityMiningOPLReward(...extraParams)
  //   );
  // }

  // async getLiquidityMiningStake(address?: string, ...extraParams: T): Promise<Decimal> {
  //   return (
  //     this._cache.getLiquidityMiningStake(address, ...extraParams) ??
  //     this._readable.getLiquidityMiningStake(address, ...extraParams)
  //   );
  // }

  // async getTotalStakedUniTokens(...extraParams: T): Promise<Decimal> {
  //   return (
  //     this._cache.getTotalStakedUniTokens(...extraParams) ??
  //     this._readable.getTotalStakedUniTokens(...extraParams)
  //   );
  // }

  // async getLiquidityMiningOPLReward(address?: string, ...extraParams: T): Promise<Decimal> {
  //   return (
  //     this._cache.getLiquidityMiningOPLReward(address, ...extraParams) ??
  //     this._readable.getLiquidityMiningOPLReward(address, ...extraParams)
  //   );
  // }

  async getCollateralSurplusBalance(address?: string, ...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getCollateralSurplusBalance(address, ...extraParams) ??
      this._readable.getCollateralSurplusBalance(address, ...extraParams)
    );
  }

  getTroves(
    params: TroveListingParams & { beforeRedistribution: true },
    ...extraParams: T
  ): Promise<TroveWithPendingRedistribution[]>;

  getTroves(params: TroveListingParams, ...extraParams: T): Promise<UserTrove[]>;

  async getTroves(params: TroveListingParams, ...extraParams: T): Promise<UserTrove[]> {
    const { beforeRedistribution, ...restOfParams } = params;

    const [totalRedistributed, troves] = await Promise.all([
      beforeRedistribution ? undefined : this.getTotalRedistributed(...extraParams),
      this._cache.getTroves({ beforeRedistribution: true, ...restOfParams }, ...extraParams) ??
        this._readable.getTroves({ beforeRedistribution: true, ...restOfParams }, ...extraParams)
    ]);

    if (totalRedistributed) {
      return troves.map(trove => trove.applyRedistribution(totalRedistributed));
    } else {
      return troves;
    }
  }

  async getFees(...extraParams: T): Promise<Fees> {
    return this._cache.getFees(...extraParams) ?? this._readable.getFees(...extraParams);
  }

  async getOPLStake(address?: string, ...extraParams: T): Promise<OPLStake> {
    return (
      this._cache.getOPLStake(address, ...extraParams) ??
      this._readable.getOPLStake(address, ...extraParams)
    );
  }

  async getTotalStakedOPL(...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getTotalStakedOPL(...extraParams) ??
      this._readable.getTotalStakedOPL(...extraParams)
    );
  }

  async getFrontendStatus(address?: string, ...extraParams: T): Promise<FrontendStatus> {
    return (
      this._cache.getFrontendStatus(address, ...extraParams) ??
      this._readable.getFrontendStatus(address, ...extraParams)
    );
  }
}
