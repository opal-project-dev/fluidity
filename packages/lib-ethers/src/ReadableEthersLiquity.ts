import { BlockTag } from "@ethersproject/abstract-provider";

import {
  Decimal,
  Fees,
  FrontendStatus,
  LiquityStore,
  OPLStake,
  ReadableLiquity,
  StabilityDeposit,
  Trove,
  TroveListingParams,
  TroveWithPendingRedistribution,
  UserTrove,
  UserTroveStatus
} from "@fluidity/lib-base";

import { MultiTroveGetter } from "../types";

import { decimalify, panic } from "./_utils";
import { EthersCallOverrides, EthersProvider, EthersSigner } from "./types";

import {
  EthersLiquityConnection,
  EthersLiquityConnectionOptionalParams,
  EthersLiquityStoreOption,
  _connect,
  _getBlockTimestamp,
  _getContracts,
  _requireAddress,
  _requireFrontendAddress
} from "./EthersLiquityConnection";

import { BlockPolledLiquityStore } from "./BlockPolledLiquityStore";

// TODO: these are constant in the contracts, so it doesn't make sense to make a call for them,
// but to avoid having to update them here when we change them in the contracts, we could read
// them once after deployment and save them to LiquityDeployment.
const MINUTE_DECAY_FACTOR = Decimal.from("0.999037758833783000");
const BETA = Decimal.from(2);

enum BackendTroveStatus {
  nonExistent,
  active,
  closedByOwner,
  closedByLiquidation,
  closedByRedemption
}

const userTroveStatusFrom = (backendStatus: BackendTroveStatus): UserTroveStatus =>
  backendStatus === BackendTroveStatus.nonExistent
    ? "nonExistent"
    : backendStatus === BackendTroveStatus.active
    ? "open"
    : backendStatus === BackendTroveStatus.closedByOwner
    ? "closedByOwner"
    : backendStatus === BackendTroveStatus.closedByLiquidation
    ? "closedByLiquidation"
    : backendStatus === BackendTroveStatus.closedByRedemption
    ? "closedByRedemption"
    : panic(new Error(`invalid backendStatus ${backendStatus}`));

const convertToDate = (timestamp: number) => new Date(timestamp * 1000);

const validSortingOptions = ["ascendingCollateralRatio", "descendingCollateralRatio"];

const expectPositiveInt = <K extends string>(obj: { [P in K]?: number }, key: K) => {
  if (obj[key] !== undefined) {
    if (!Number.isInteger(obj[key])) {
      throw new Error(`${key} must be an integer`);
    }

    if (obj[key] < 0) {
      throw new Error(`${key} must not be negative`);
    }
  }
};

/**
 * Ethers-based implementation of {@link @fluidity/lib-base#ReadableLiquity}.
 *
 * @public
 */
export class ReadableEthersLiquity implements ReadableLiquity {
  readonly connection: EthersLiquityConnection;

  /** @internal */
  constructor(connection: EthersLiquityConnection) {
    this.connection = connection;
  }

  /** @internal */
  static _from(
    connection: EthersLiquityConnection & { useStore: "blockPolled" }
  ): ReadableEthersLiquityWithStore<BlockPolledLiquityStore>;

  /** @internal */
  static _from(connection: EthersLiquityConnection): ReadableEthersLiquity;

  /** @internal */
  static _from(connection: EthersLiquityConnection): ReadableEthersLiquity {
    const readable = new ReadableEthersLiquity(connection);

    return connection.useStore === "blockPolled"
      ? new _BlockPolledReadableEthersLiquity(readable)
      : readable;
  }

  /** @internal */
  static connect(
    signerOrProvider: EthersSigner | EthersProvider,
    optionalParams: EthersLiquityConnectionOptionalParams & { useStore: "blockPolled" }
  ): Promise<ReadableEthersLiquityWithStore<BlockPolledLiquityStore>>;

  static connect(
    signerOrProvider: EthersSigner | EthersProvider,
    optionalParams?: EthersLiquityConnectionOptionalParams
  ): Promise<ReadableEthersLiquity>;

  /**
   * Connect to the Liquity protocol and create a `ReadableEthersLiquity` object.
   *
   * @param signerOrProvider - Ethers `Signer` or `Provider` to use for connecting to the Ethereum
   *                           network.
   * @param optionalParams - Optional parameters that can be used to customize the connection.
   */
  static async connect(
    signerOrProvider: EthersSigner | EthersProvider,
    optionalParams?: EthersLiquityConnectionOptionalParams
  ): Promise<ReadableEthersLiquity> {
    return ReadableEthersLiquity._from(await _connect(signerOrProvider, optionalParams));
  }

  /**
   * Check whether this `ReadableEthersLiquity` is a {@link ReadableEthersLiquityWithStore}.
   */
  hasStore(): this is ReadableEthersLiquityWithStore;

  /**
   * Check whether this `ReadableEthersLiquity` is a
   * {@link ReadableEthersLiquityWithStore}\<{@link BlockPolledLiquityStore}\>.
   */
  hasStore(store: "blockPolled"): this is ReadableEthersLiquityWithStore<BlockPolledLiquityStore>;

  hasStore(): boolean {
    return false;
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getTotalRedistributed} */
  async getTotalRedistributed(overrides?: EthersCallOverrides): Promise<Trove> {
    const { troveManager } = _getContracts(this.connection);

    const [collateral, debt] = await Promise.all([
      troveManager.L_AUT({ ...overrides }).then(decimalify),
      troveManager.L_ONEUDebt({ ...overrides }).then(decimalify)
    ]);

    return new Trove(collateral, debt);
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getTroveBeforeRedistribution} */
  async getTroveBeforeRedistribution(
    address?: string,
    overrides?: EthersCallOverrides
  ): Promise<TroveWithPendingRedistribution> {
    address ??= _requireAddress(this.connection);
    const { troveManager } = _getContracts(this.connection);

    const [trove, snapshot] = await Promise.all([
      troveManager.Troves(address, { ...overrides }),
      troveManager.rewardSnapshots(address, { ...overrides })
    ]);

    if (trove.status === BackendTroveStatus.active) {
      return new TroveWithPendingRedistribution(
        address,
        userTroveStatusFrom(trove.status),
        decimalify(trove.coll),
        decimalify(trove.debt),
        decimalify(trove.stake),
        new Trove(decimalify(snapshot.AUT), decimalify(snapshot.ONEUDebt))
      );
    } else {
      return new TroveWithPendingRedistribution(address, userTroveStatusFrom(trove.status));
    }
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getTrove} */
  async getTrove(address?: string, overrides?: EthersCallOverrides): Promise<UserTrove> {
    const [trove, totalRedistributed] = await Promise.all([
      this.getTroveBeforeRedistribution(address, overrides),
      this.getTotalRedistributed(overrides)
    ]);

    return trove.applyRedistribution(totalRedistributed);
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getNumberOfTroves} */
  async getNumberOfTroves(overrides?: EthersCallOverrides): Promise<number> {
    const { troveManager } = _getContracts(this.connection);

    return (await troveManager.getTroveOwnersCount({ ...overrides })).toNumber();
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getPrice} */
  getPrice(overrides?: EthersCallOverrides): Promise<Decimal> {
    const { priceFeed } = _getContracts(this.connection);

    return priceFeed.callStatic.fetchPrice({ ...overrides }).then(decimalify);
  }

  /** @internal */
  async _getActivePool(overrides?: EthersCallOverrides): Promise<Trove> {
    const { activePool } = _getContracts(this.connection);

    const [activeCollateral, activeDebt] = await Promise.all(
      [
        activePool.getAUT({ ...overrides }),
        activePool.getONEUDebt({ ...overrides })
      ].map(getBigNumber => getBigNumber.then(decimalify))
    );

    return new Trove(activeCollateral, activeDebt);
  }

  /** @internal */
  async _getDefaultPool(overrides?: EthersCallOverrides): Promise<Trove> {
    const { defaultPool } = _getContracts(this.connection);

    const [liquidatedCollateral, closedDebt] = await Promise.all(
      [
        defaultPool.getAUT({ ...overrides }),
        defaultPool.getONEUDebt({ ...overrides })
      ].map(getBigNumber => getBigNumber.then(decimalify))
    );

    return new Trove(liquidatedCollateral, closedDebt);
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getTotal} */
  async getTotal(overrides?: EthersCallOverrides): Promise<Trove> {
    const [activePool, defaultPool] = await Promise.all([
      this._getActivePool(overrides),
      this._getDefaultPool(overrides)
    ]);

    return activePool.add(defaultPool);
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getStabilityDeposit} */
  async getStabilityDeposit(
    address?: string,
    overrides?: EthersCallOverrides
  ): Promise<StabilityDeposit> {
    address ??= _requireAddress(this.connection);
    const { stabilityPool } = _getContracts(this.connection);

    const [
      { frontEndTag, initialValue },
      currentONEU,
      collateralGain,
      lqtyReward
    ] = await Promise.all([
      stabilityPool.deposits(address, { ...overrides }),
      stabilityPool.getCompoundedONEUDeposit(address, { ...overrides }),
      stabilityPool.getDepositorAUTGain(address, { ...overrides }),
      stabilityPool.getDepositorOPLGain(address, { ...overrides })
    ]);

    return new StabilityDeposit(
      decimalify(initialValue),
      decimalify(currentONEU),
      decimalify(collateralGain),
      decimalify(lqtyReward),
      frontEndTag
    );
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getRemainingStabilityPoolOPLReward} */
  async getRemainingStabilityPoolOPLReward(overrides?: EthersCallOverrides): Promise<Decimal> {
    const { communityIssuance } = _getContracts(this.connection);

    const issuanceCap = this.connection.totalStabilityPoolOPLReward;
    const totalOPLIssued = decimalify(await communityIssuance.totalOPLIssued({ ...overrides }));

    // totalOPLIssued approaches but never reaches issuanceCap
    return issuanceCap.sub(totalOPLIssued);
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getONEUInStabilityPool} */
  getONEUInStabilityPool(overrides?: EthersCallOverrides): Promise<Decimal> {
    const { stabilityPool } = _getContracts(this.connection);

    return stabilityPool.getTotalONEUDeposits({ ...overrides }).then(decimalify);
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getONEUBalance} */
  getONEUBalance(address?: string, overrides?: EthersCallOverrides): Promise<Decimal> {
    address ??= _requireAddress(this.connection);
    const { oneuToken: lusdToken } = _getContracts(this.connection);

    return lusdToken.balanceOf(address, { ...overrides }).then(decimalify);
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getOPLBalance} */
  getOPLBalance(address?: string, overrides?: EthersCallOverrides): Promise<Decimal> {
    address ??= _requireAddress(this.connection);
    const { oplToken: lqtyToken } = _getContracts(this.connection);

    return lqtyToken.balanceOf(address, { ...overrides }).then(decimalify);
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getUniTokenBalance} */
  // getUniTokenBalance(address?: string, overrides?: EthersCallOverrides): Promise<Decimal> {
  //   address ??= _requireAddress(this.connection);
  //   const { uniToken } = _getContracts(this.connection);

  //   return uniToken.balanceOf(address, { ...overrides }).then(decimalify);
  // }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getUniTokenAllowance} */
  // getUniTokenAllowance(address?: string, overrides?: EthersCallOverrides): Promise<Decimal> {
  //   address ??= _requireAddress(this.connection);
  //   const { uniToken, unipool } = _getContracts(this.connection);

  //   return uniToken.allowance(address, unipool.address, { ...overrides }).then(decimalify);
  // }

  /** @internal */
  // async _getRemainingLiquidityMiningOPLRewardCalculator(
  //   overrides?: EthersCallOverrides
  // ): Promise<(blockTimestamp: number) => Decimal> {
  //   const { unipool } = _getContracts(this.connection);

  //   const [totalSupply, rewardRate, periodFinish, lastUpdateTime] = await Promise.all([
  //     unipool.totalSupply({ ...overrides }),
  //     unipool.rewardRate({ ...overrides }).then(decimalify),
  //     unipool.periodFinish({ ...overrides }).then(numberify),
  //     unipool.lastUpdateTime({ ...overrides }).then(numberify)
  //   ]);

  //   return (blockTimestamp: number) =>
  //     rewardRate.mul(
  //       Math.max(0, periodFinish - (totalSupply.isZero() ? lastUpdateTime : blockTimestamp))
  //     );
  // }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getRemainingLiquidityMiningOPLReward} */
  // async getRemainingLiquidityMiningOPLReward(overrides?: EthersCallOverrides): Promise<Decimal> {
  //   const [calculateRemainingOPL, blockTimestamp] = await Promise.all([
  //     this._getRemainingLiquidityMiningOPLRewardCalculator(overrides),
  //     this._getBlockTimestamp(overrides?.blockTag)
  //   ]);

  //   return calculateRemainingOPL(blockTimestamp);
  // }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getLiquidityMiningStake} */
  // getLiquidityMiningStake(address?: string, overrides?: EthersCallOverrides): Promise<Decimal> {
  //   address ??= _requireAddress(this.connection);
  //   const { unipool } = _getContracts(this.connection);

  //   return unipool.balanceOf(address, { ...overrides }).then(decimalify);
  // }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getTotalStakedUniTokens} */
  // getTotalStakedUniTokens(overrides?: EthersCallOverrides): Promise<Decimal> {
  //   const { unipool } = _getContracts(this.connection);

  //   return unipool.totalSupply({ ...overrides }).then(decimalify);
  // }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getLiquidityMiningOPLReward} */
  // getLiquidityMiningOPLReward(address?: string, overrides?: EthersCallOverrides): Promise<Decimal> {
  //   address ??= _requireAddress(this.connection);
  //   const { unipool } = _getContracts(this.connection);

  //   return unipool.earned(address, { ...overrides }).then(decimalify);
  // }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getCollateralSurplusBalance} */
  getCollateralSurplusBalance(address?: string, overrides?: EthersCallOverrides): Promise<Decimal> {
    address ??= _requireAddress(this.connection);
    const { collSurplusPool } = _getContracts(this.connection);

    return collSurplusPool.getCollateral(address, { ...overrides }).then(decimalify);
  }

  /** @internal */
  getTroves(
    params: TroveListingParams & { beforeRedistribution: true },
    overrides?: EthersCallOverrides
  ): Promise<TroveWithPendingRedistribution[]>;

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.(getTroves:2)} */
  getTroves(params: TroveListingParams, overrides?: EthersCallOverrides): Promise<UserTrove[]>;

  async getTroves(
    params: TroveListingParams,
    overrides?: EthersCallOverrides
  ): Promise<UserTrove[]> {
    const { multiTroveGetter } = _getContracts(this.connection);

    expectPositiveInt(params, "first");
    expectPositiveInt(params, "startingAt");

    if (!validSortingOptions.includes(params.sortedBy)) {
      throw new Error(
        `sortedBy must be one of: ${validSortingOptions.map(x => `"${x}"`).join(", ")}`
      );
    }

    const [totalRedistributed, backendTroves] = await Promise.all([
      params.beforeRedistribution ? undefined : this.getTotalRedistributed({ ...overrides }),
      multiTroveGetter.getMultipleSortedTroves(
        params.sortedBy === "descendingCollateralRatio"
          ? params.startingAt ?? 0
          : -((params.startingAt ?? 0) + 1),
        params.first,
        { ...overrides }
      )
    ]);

    const troves = mapBackendTroves(backendTroves);

    if (totalRedistributed) {
      return troves.map(trove => trove.applyRedistribution(totalRedistributed));
    } else {
      return troves;
    }
  }

  /** @internal */
  _getBlockTimestamp(blockTag?: BlockTag): Promise<number> {
    return _getBlockTimestamp(this.connection, blockTag);
  }

  /** @internal */
  async _getFeesFactory(
    overrides?: EthersCallOverrides
  ): Promise<(blockTimestamp: number, recoveryMode: boolean) => Fees> {
    const { troveManager } = _getContracts(this.connection);

    const [lastFeeOperationTime, baseRateWithoutDecay] = await Promise.all([
      troveManager.lastFeeOperationTime({ ...overrides }),
      troveManager.baseRate({ ...overrides }).then(decimalify)
    ]);

    return (blockTimestamp, recoveryMode) =>
      new Fees(
        baseRateWithoutDecay,
        MINUTE_DECAY_FACTOR,
        BETA,
        convertToDate(lastFeeOperationTime.toNumber()),
        convertToDate(blockTimestamp),
        recoveryMode
      );
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getFees} */
  async getFees(overrides?: EthersCallOverrides): Promise<Fees> {
    const [createFees, total, price, blockTimestamp] = await Promise.all([
      this._getFeesFactory(overrides),
      this.getTotal(overrides),
      this.getPrice(overrides),
      this._getBlockTimestamp(overrides?.blockTag)
    ]);

    return createFees(blockTimestamp, total.collateralRatioIsBelowCritical(price));
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getOPLStake} */
  async getOPLStake(address?: string, overrides?: EthersCallOverrides): Promise<OPLStake> {
    address ??= _requireAddress(this.connection);
    const { oplStaking: lqtyStaking } = _getContracts(this.connection);

    const [stakedOPL, collateralGain, lusdGain] = await Promise.all(
      [
        lqtyStaking.stakes(address, { ...overrides }),
        lqtyStaking.getPendingAUTGain(address, { ...overrides }),
        lqtyStaking.getPendingONEUGain(address, { ...overrides })
      ].map(getBigNumber => getBigNumber.then(decimalify))
    );

    return new OPLStake(stakedOPL, collateralGain, lusdGain);
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getTotalStakedOPL} */
  async getTotalStakedOPL(overrides?: EthersCallOverrides): Promise<Decimal> {
    const { oplStaking: lqtyStaking } = _getContracts(this.connection);

    return lqtyStaking.totalOPLStaked({ ...overrides }).then(decimalify);
  }

  /** {@inheritDoc @fluidity/lib-base#ReadableLiquity.getFrontendStatus} */
  async getFrontendStatus(
    address?: string,
    overrides?: EthersCallOverrides
  ): Promise<FrontendStatus> {
    address ??= _requireFrontendAddress(this.connection);
    const { stabilityPool } = _getContracts(this.connection);

    const { registered, kickbackRate } = await stabilityPool.frontEnds(address, { ...overrides });

    return registered
      ? { status: "registered", kickbackRate: decimalify(kickbackRate) }
      : { status: "unregistered" };
  }
}

type Resolved<T> = T extends Promise<infer U> ? U : T;
type BackendTroves = Resolved<ReturnType<MultiTroveGetter["getMultipleSortedTroves"]>>;

const mapBackendTroves = (troves: BackendTroves): TroveWithPendingRedistribution[] =>
  troves.map(
    trove =>
      new TroveWithPendingRedistribution(
        trove.owner,
        "open", // These Troves are coming from the SortedTroves list, so they must be open
        decimalify(trove.coll),
        decimalify(trove.debt),
        decimalify(trove.stake),
        new Trove(decimalify(trove.snapshotAUT), decimalify(trove.snapshotONEUDebt))
      )
  );

/**
 * Variant of {@link ReadableEthersLiquity} that exposes a {@link @fluidity/lib-base#LiquityStore}.
 *
 * @public
 */
export interface ReadableEthersLiquityWithStore<T extends LiquityStore = LiquityStore>
  extends ReadableEthersLiquity {
  /** An object that implements LiquityStore. */
  readonly store: T;
}

class _BlockPolledReadableEthersLiquity
  implements ReadableEthersLiquityWithStore<BlockPolledLiquityStore> {
  readonly connection: EthersLiquityConnection;
  readonly store: BlockPolledLiquityStore;

  private readonly _readable: ReadableEthersLiquity;

  constructor(readable: ReadableEthersLiquity) {
    const store = new BlockPolledLiquityStore(readable);

    this.store = store;
    this.connection = readable.connection;
    this._readable = readable;
  }

  private _blockHit(overrides?: EthersCallOverrides): boolean {
    return (
      !overrides ||
      overrides.blockTag === undefined ||
      overrides.blockTag === this.store.state.blockTag
    );
  }

  private _userHit(address?: string, overrides?: EthersCallOverrides): boolean {
    return (
      this._blockHit(overrides) &&
      (address === undefined || address === this.store.connection.userAddress)
    );
  }

  private _frontendHit(address?: string, overrides?: EthersCallOverrides): boolean {
    return (
      this._blockHit(overrides) &&
      (address === undefined || address === this.store.connection.frontendTag)
    );
  }

  hasStore(store?: EthersLiquityStoreOption): boolean {
    return store === undefined || store === "blockPolled";
  }

  async getTotalRedistributed(overrides?: EthersCallOverrides): Promise<Trove> {
    return this._blockHit(overrides)
      ? this.store.state.totalRedistributed
      : this._readable.getTotalRedistributed(overrides);
  }

  async getTroveBeforeRedistribution(
    address?: string,
    overrides?: EthersCallOverrides
  ): Promise<TroveWithPendingRedistribution> {
    return this._userHit(address, overrides)
      ? this.store.state.troveBeforeRedistribution
      : this._readable.getTroveBeforeRedistribution(address, overrides);
  }

  async getTrove(address?: string, overrides?: EthersCallOverrides): Promise<UserTrove> {
    return this._userHit(address, overrides)
      ? this.store.state.trove
      : this._readable.getTrove(address, overrides);
  }

  async getNumberOfTroves(overrides?: EthersCallOverrides): Promise<number> {
    return this._blockHit(overrides)
      ? this.store.state.numberOfTroves
      : this._readable.getNumberOfTroves(overrides);
  }

  async getPrice(overrides?: EthersCallOverrides): Promise<Decimal> {
    return this._blockHit(overrides) ? this.store.state.price : this._readable.getPrice(overrides);
  }

  async getTotal(overrides?: EthersCallOverrides): Promise<Trove> {
    return this._blockHit(overrides) ? this.store.state.total : this._readable.getTotal(overrides);
  }

  async getStabilityDeposit(
    address?: string,
    overrides?: EthersCallOverrides
  ): Promise<StabilityDeposit> {
    return this._userHit(address, overrides)
      ? this.store.state.stabilityDeposit
      : this._readable.getStabilityDeposit(address, overrides);
  }

  async getRemainingStabilityPoolOPLReward(overrides?: EthersCallOverrides): Promise<Decimal> {
    return this._blockHit(overrides)
      ? this.store.state.remainingStabilityPoolOPLReward
      : this._readable.getRemainingStabilityPoolOPLReward(overrides);
  }

  async getONEUInStabilityPool(overrides?: EthersCallOverrides): Promise<Decimal> {
    return this._blockHit(overrides)
      ? this.store.state.lusdInStabilityPool
      : this._readable.getONEUInStabilityPool(overrides);
  }

  async getONEUBalance(address?: string, overrides?: EthersCallOverrides): Promise<Decimal> {
    return this._userHit(address, overrides)
      ? this.store.state.lusdBalance
      : this._readable.getONEUBalance(address, overrides);
  }

  async getOPLBalance(address?: string, overrides?: EthersCallOverrides): Promise<Decimal> {
    return this._userHit(address, overrides)
      ? this.store.state.lqtyBalance
      : this._readable.getOPLBalance(address, overrides);
  }

  // async getUniTokenBalance(address?: string, overrides?: EthersCallOverrides): Promise<Decimal> {
  //   return this._userHit(address, overrides)
  //     ? this.store.state.uniTokenBalance
  //     : this._readable.getUniTokenBalance(address, overrides);
  // }

  // async getUniTokenAllowance(address?: string, overrides?: EthersCallOverrides): Promise<Decimal> {
  //   return this._userHit(address, overrides)
  //     ? this.store.state.uniTokenAllowance
  //     : this._readable.getUniTokenAllowance(address, overrides);
  // }

  // async getRemainingLiquidityMiningOPLReward(overrides?: EthersCallOverrides): Promise<Decimal> {
  //   return this._blockHit(overrides)
  //     ? this.store.state.remainingLiquidityMiningOPLReward
  //     : this._readable.getRemainingLiquidityMiningOPLReward(overrides);
  // }

  // async getLiquidityMiningStake(
  //   address?: string,
  //   overrides?: EthersCallOverrides
  // ): Promise<Decimal> {
  //   return this._userHit(address, overrides)
  //     ? this.store.state.liquidityMiningStake
  //     : this._readable.getLiquidityMiningStake(address, overrides);
  // }

  // async getTotalStakedUniTokens(overrides?: EthersCallOverrides): Promise<Decimal> {
  //   return this._blockHit(overrides)
  //     ? this.store.state.totalStakedUniTokens
  //     : this._readable.getTotalStakedUniTokens(overrides);
  // }

  // async getLiquidityMiningOPLReward(
  //   address?: string,
  //   overrides?: EthersCallOverrides
  // ): Promise<Decimal> {
  //   return this._userHit(address, overrides)
  //     ? this.store.state.liquidityMiningOPLReward
  //     : this._readable.getLiquidityMiningOPLReward(address, overrides);
  // }

  async getCollateralSurplusBalance(
    address?: string,
    overrides?: EthersCallOverrides
  ): Promise<Decimal> {
    return this._userHit(address, overrides)
      ? this.store.state.collateralSurplusBalance
      : this._readable.getCollateralSurplusBalance(address, overrides);
  }

  async _getBlockTimestamp(blockTag?: BlockTag): Promise<number> {
    return this._blockHit({ blockTag })
      ? this.store.state.blockTimestamp
      : this._readable._getBlockTimestamp(blockTag);
  }

  async _getFeesFactory(
    overrides?: EthersCallOverrides
  ): Promise<(blockTimestamp: number, recoveryMode: boolean) => Fees> {
    return this._blockHit(overrides)
      ? this.store.state._feesFactory
      : this._readable._getFeesFactory(overrides);
  }

  async getFees(overrides?: EthersCallOverrides): Promise<Fees> {
    return this._blockHit(overrides) ? this.store.state.fees : this._readable.getFees(overrides);
  }

  async getOPLStake(address?: string, overrides?: EthersCallOverrides): Promise<OPLStake> {
    return this._userHit(address, overrides)
      ? this.store.state.lqtyStake
      : this._readable.getOPLStake(address, overrides);
  }

  async getTotalStakedOPL(overrides?: EthersCallOverrides): Promise<Decimal> {
    return this._blockHit(overrides)
      ? this.store.state.totalStakedOPL
      : this._readable.getTotalStakedOPL(overrides);
  }

  async getFrontendStatus(
    address?: string,
    overrides?: EthersCallOverrides
  ): Promise<FrontendStatus> {
    return this._frontendHit(address, overrides)
      ? this.store.state.frontend
      : this._readable.getFrontendStatus(address, overrides);
  }

  getTroves(
    params: TroveListingParams & { beforeRedistribution: true },
    overrides?: EthersCallOverrides
  ): Promise<TroveWithPendingRedistribution[]>;

  getTroves(params: TroveListingParams, overrides?: EthersCallOverrides): Promise<UserTrove[]>;

  getTroves(params: TroveListingParams, overrides?: EthersCallOverrides): Promise<UserTrove[]> {
    return this._readable.getTroves(params, overrides);
  }

  _getActivePool(): Promise<Trove> {
    throw new Error("Method not implemented.");
  }

  _getDefaultPool(): Promise<Trove> {
    throw new Error("Method not implemented.");
  }

  _getRemainingLiquidityMiningOPLRewardCalculator(): Promise<(blockTimestamp: number) => Decimal> {
    throw new Error("Method not implemented.");
  }
}
