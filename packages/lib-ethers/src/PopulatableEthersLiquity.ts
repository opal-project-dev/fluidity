import assert from "assert";

import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Log } from "@ethersproject/abstract-provider";
import { ErrorCode } from "@ethersproject/logger";
import { Transaction } from "@ethersproject/transactions";

import {
  CollateralGainTransferDetails,
  Decimal,
  Decimalish,
  LiquidationDetails,
  LiquityReceipt,
  ONEU_MINIMUM_DEBT,
  ONEU_MINIMUM_NET_DEBT,
  MinedReceipt,
  PopulatableLiquity,
  PopulatedLiquityTransaction,
  PopulatedRedemption,
  RedemptionDetails,
  SentLiquityTransaction,
  StabilityDepositChangeDetails,
  StabilityPoolGainsWithdrawalDetails,
  Trove,
  TroveAdjustmentDetails,
  TroveAdjustmentParams,
  TroveClosureDetails,
  TroveCreationDetails,
  TroveCreationParams,
  TroveWithPendingRedistribution,
  _failedReceipt,
  _normalizeTroveAdjustment,
  _normalizeTroveCreation,
  _pendingReceipt,
  _successfulReceipt
} from "@fluidity/lib-base";

import {
  EthersPopulatedTransaction,
  EthersTransactionOverrides,
  EthersTransactionReceipt,
  EthersTransactionResponse
} from "./types";

import {
  EthersLiquityConnection,
  _getContracts,
  _requireAddress,
  _requireSigner
} from "./EthersLiquityConnection";

import { decimalify, promiseAllValues } from "./_utils";
import { _priceFeedIsTestnet } from "./contracts";
import { logsToString } from "./parseLogs";
import { ReadableEthersLiquity } from "./ReadableEthersLiquity";

const bigNumberMax = (a: BigNumber, b?: BigNumber) => (b?.gt(a) ? b : a);

// With 70 iterations redemption costs about ~10M gas, and each iteration accounts for ~138k more
/** @internal */
export const _redeemMaxIterations = 70;

const defaultBorrowingRateSlippageTolerance = Decimal.from(0.005); // 0.5%
const defaultRedemptionRateSlippageTolerance = Decimal.from(0.001); // 0.1%
const defaultBorrowingFeeDecayToleranceMinutes = 10;

const noDetails = () => undefined;

const compose = <T, U, V>(f: (_: U) => V, g: (_: T) => U) => (_: T) => f(g(_));

const id = <T>(t: T) => t;

// Takes ~6-7K (use 10K to be safe) to update lastFeeOperationTime, but the cost of calculating the
// decayed baseRate increases logarithmically with time elapsed since the last update.
const addGasForBaseRateUpdate = (maxMinutesSinceLastUpdate = 10) => (gas: BigNumber) =>
  gas.add(10000 + 1414 * Math.ceil(Math.log2(maxMinutesSinceLastUpdate + 1)));

// First traversal in ascending direction takes ~50K, then ~13.5K per extra step.
// 80K should be enough for 3 steps, plus some extra to be safe.
const addGasForPotentialListTraversal = (gas: BigNumber) => gas.add(80000);

const addGasForOPLIssuance = (gas: BigNumber) => gas.add(50000);

// const addGasForUnipoolRewardUpdate = (gas: BigNumber) => gas.add(20000);

// To get the best entropy available, we'd do something like:
//
// const bigRandomNumber = () =>
//   BigNumber.from(
//     `0x${Array.from(crypto.getRandomValues(new Uint32Array(8)))
//       .map(u32 => u32.toString(16).padStart(8, "0"))
//       .join("")}`
//   );
//
// However, Window.crypto is browser-specific. Since we only use this for randomly picking Troves
// during the search for hints, Math.random() will do fine, too.
//
// This returns a random integer between 0 and Number.MAX_SAFE_INTEGER
const randomInteger = () => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

// Maximum number of trials to perform in a single getApproxHint() call. If the number of trials
// required to get a statistically "good" hint is larger than this, the search for the hint will
// be broken up into multiple getApproxHint() calls.
//
// This should be low enough to work with popular public Ethereum providers like Infura without
// triggering any fair use limits.
const maxNumberOfTrialsAtOnce = 2500;

function* generateTrials(totalNumberOfTrials: number) {
  assert(Number.isInteger(totalNumberOfTrials) && totalNumberOfTrials > 0);

  while (totalNumberOfTrials) {
    const numberOfTrials = Math.min(totalNumberOfTrials, maxNumberOfTrialsAtOnce);
    yield numberOfTrials;

    totalNumberOfTrials -= numberOfTrials;
  }
}

/** @internal */
export enum _RawErrorReason {
  TRANSACTION_FAILED = "transaction failed",
  TRANSACTION_CANCELLED = "cancelled",
  TRANSACTION_REPLACED = "replaced",
  TRANSACTION_REPRICED = "repriced"
}

const transactionReplacementReasons: unknown[] = [
  _RawErrorReason.TRANSACTION_CANCELLED,
  _RawErrorReason.TRANSACTION_REPLACED,
  _RawErrorReason.TRANSACTION_REPRICED
];

interface RawTransactionFailedError extends Error {
  code: ErrorCode.CALL_EXCEPTION;
  reason: _RawErrorReason.TRANSACTION_FAILED;
  transactionHash: string;
  transaction: Transaction;
  receipt: EthersTransactionReceipt;
}

/** @internal */
export interface _RawTransactionReplacedError extends Error {
  code: ErrorCode.TRANSACTION_REPLACED;
  reason:
    | _RawErrorReason.TRANSACTION_CANCELLED
    | _RawErrorReason.TRANSACTION_REPLACED
    | _RawErrorReason.TRANSACTION_REPRICED;
  cancelled: boolean;
  hash: string;
  replacement: EthersTransactionResponse;
  receipt: EthersTransactionReceipt;
}
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const hasProp = <T, P extends string>(o: T, p: P): o is T & { [_ in P]: unknown } => p in o;

const isTransactionFailedError = (error: Error): error is RawTransactionFailedError =>
  hasProp(error, "code") &&
  error.code === ErrorCode.CALL_EXCEPTION &&
  hasProp(error, "reason") &&
  error.reason === _RawErrorReason.TRANSACTION_FAILED;

const isTransactionReplacedError = (error: Error): error is _RawTransactionReplacedError =>
  hasProp(error, "code") &&
  error.code === ErrorCode.TRANSACTION_REPLACED &&
  hasProp(error, "reason") &&
  transactionReplacementReasons.includes(error.reason);

/**
 * Thrown when a transaction is cancelled or replaced by a different transaction.
 *
 * @public
 */
export class EthersTransactionCancelledError extends Error {
  readonly rawReplacementReceipt: EthersTransactionReceipt;
  readonly rawError: Error;

  /** @internal */
  constructor(rawError: _RawTransactionReplacedError) {
    assert(rawError.reason !== _RawErrorReason.TRANSACTION_REPRICED);

    super(`Transaction ${rawError.reason}`);
    this.name = "TransactionCancelledError";
    this.rawReplacementReceipt = rawError.receipt;
    this.rawError = rawError;
  }
}

/**
 * A transaction that has already been sent.
 *
 * @remarks
 * Returned by {@link SendableEthersLiquity} functions.
 *
 * @public
 */
export class SentEthersLiquityTransaction<T = unknown>
  implements
    SentLiquityTransaction<EthersTransactionResponse, LiquityReceipt<EthersTransactionReceipt, T>> {
  /** Ethers' representation of a sent transaction. */
  readonly rawSentTransaction: EthersTransactionResponse;

  private readonly _connection: EthersLiquityConnection;
  private readonly _parse: (rawReceipt: EthersTransactionReceipt) => T;

  /** @internal */
  constructor(
    rawSentTransaction: EthersTransactionResponse,
    connection: EthersLiquityConnection,
    parse: (rawReceipt: EthersTransactionReceipt) => T
  ) {
    this.rawSentTransaction = rawSentTransaction;
    this._connection = connection;
    this._parse = parse;
  }

  private _receiptFrom(rawReceipt: EthersTransactionReceipt | null) {
    return rawReceipt
      ? rawReceipt.status
        ? _successfulReceipt(rawReceipt, this._parse(rawReceipt), () =>
            logsToString(rawReceipt, _getContracts(this._connection))
          )
        : _failedReceipt(rawReceipt)
      : _pendingReceipt;
  }

  private async _waitForRawReceipt(confirmations?: number) {
    try {
      return await this.rawSentTransaction.wait(confirmations);
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (isTransactionFailedError(error)) {
          return error.receipt;
        }

        if (isTransactionReplacedError(error)) {
          if (error.cancelled) {
            throw new EthersTransactionCancelledError(error);
          } else {
            return error.receipt;
          }
        }
      }

      throw error;
    }
  }

  /** {@inheritDoc @fluidity/lib-base#SentLiquityTransaction.getReceipt} */
  async getReceipt(): Promise<LiquityReceipt<EthersTransactionReceipt, T>> {
    return this._receiptFrom(await this._waitForRawReceipt(0));
  }

  /**
   * {@inheritDoc @fluidity/lib-base#SentLiquityTransaction.waitForReceipt}
   *
   * @throws
   * Throws {@link EthersTransactionCancelledError} if the transaction is cancelled or replaced.
   */
  async waitForReceipt(): Promise<MinedReceipt<EthersTransactionReceipt, T>> {
    const receipt = this._receiptFrom(await this._waitForRawReceipt());

    assert(receipt.status !== "pending");
    return receipt;
  }
}

/**
 * Optional parameters of a transaction that borrows ONEU.
 *
 * @public
 */
export interface BorrowingOperationOptionalParams {
  /**
   * Maximum acceptable {@link @fluidity/lib-base#Fees.borrowingRate | borrowing rate}
   * (default: current borrowing rate plus 0.5%).
   */
  maxBorrowingRate?: Decimalish;

  /**
   * Control the amount of extra gas included attached to the transaction.
   *
   * @remarks
   * Transactions that borrow ONEU must pay a variable borrowing fee, which is added to the Trove's
   * debt. This fee increases whenever a redemption occurs, and otherwise decays exponentially.
   * Due to this decay, a Trove's collateral ratio can end up being higher than initially calculated
   * if the transaction is pending for a long time. When this happens, the backend has to iterate
   * over the sorted list of Troves to find a new position for the Trove, which costs extra gas.
   *
   * The SDK can estimate how much the gas costs of the transaction may increase due to this decay,
   * and can include additional gas to ensure that it will still succeed, even if it ends up pending
   * for a relatively long time. This parameter specifies the length of time that should be covered
   * by the extra gas.
   *
   * Default: 10 minutes.
   */
  borrowingFeeDecayToleranceMinutes?: number;
}

const normalizeBorrowingOperationOptionalParams = (
  maxBorrowingRateOrOptionalParams: Decimalish | BorrowingOperationOptionalParams | undefined,
  currentBorrowingRate: Decimal | undefined
): {
  maxBorrowingRate: Decimal;
  borrowingFeeDecayToleranceMinutes: number;
} => {
  if (maxBorrowingRateOrOptionalParams === undefined) {
    return {
      maxBorrowingRate:
        currentBorrowingRate?.add(defaultBorrowingRateSlippageTolerance) ?? Decimal.ZERO,
      borrowingFeeDecayToleranceMinutes: defaultBorrowingFeeDecayToleranceMinutes
    };
  } else if (
    typeof maxBorrowingRateOrOptionalParams === "number" ||
    typeof maxBorrowingRateOrOptionalParams === "string" ||
    maxBorrowingRateOrOptionalParams instanceof Decimal
  ) {
    return {
      maxBorrowingRate: Decimal.from(maxBorrowingRateOrOptionalParams),
      borrowingFeeDecayToleranceMinutes: defaultBorrowingFeeDecayToleranceMinutes
    };
  } else {
    const { maxBorrowingRate, borrowingFeeDecayToleranceMinutes } = maxBorrowingRateOrOptionalParams;

    return {
      maxBorrowingRate:
        maxBorrowingRate !== undefined
          ? Decimal.from(maxBorrowingRate)
          : currentBorrowingRate?.add(defaultBorrowingRateSlippageTolerance) ?? Decimal.ZERO,

      borrowingFeeDecayToleranceMinutes:
        borrowingFeeDecayToleranceMinutes ?? defaultBorrowingFeeDecayToleranceMinutes
    };
  }
};

/**
 * A transaction that has been prepared for sending.
 *
 * @remarks
 * Returned by {@link PopulatableEthersLiquity} functions.
 *
 * @public
 */
export class PopulatedEthersLiquityTransaction<T = unknown>
  implements
    PopulatedLiquityTransaction<EthersPopulatedTransaction, SentEthersLiquityTransaction<T>> {
  /** Unsigned transaction object populated by Ethers. */
  readonly rawPopulatedTransaction: EthersPopulatedTransaction;

  /**
   * Extra gas added to the transaction's `gasLimit` on top of the estimated minimum requirement.
   *
   * @remarks
   * Gas estimation is based on blockchain state at the latest block. However, most transactions
   * stay in pending state for several blocks before being included in a block. This may increase
   * the actual gas requirements of certain Liquity transactions by the time they are eventually
   * mined, therefore the Liquity SDK increases these transactions' `gasLimit` by default (unless
   * `gasLimit` is {@link EthersTransactionOverrides | overridden}).
   *
   * Note: even though the SDK includes gas headroom for many transaction types, currently this
   * property is only implemented for {@link PopulatableEthersLiquity.openTrove | openTrove()},
   * {@link PopulatableEthersLiquity.adjustTrove | adjustTrove()} and its aliases.
   */
  readonly gasHeadroom?: number;

  private readonly _connection: EthersLiquityConnection;
  private readonly _parse: (rawReceipt: EthersTransactionReceipt) => T;

  /** @internal */
  constructor(
    rawPopulatedTransaction: EthersPopulatedTransaction,
    connection: EthersLiquityConnection,
    parse: (rawReceipt: EthersTransactionReceipt) => T,
    gasHeadroom?: number
  ) {
    this.rawPopulatedTransaction = rawPopulatedTransaction;
    this._connection = connection;
    this._parse = parse;

    if (gasHeadroom !== undefined) {
      this.gasHeadroom = gasHeadroom;
    }
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatedLiquityTransaction.send} */
  async send(): Promise<SentEthersLiquityTransaction<T>> {
    return new SentEthersLiquityTransaction(
      await _requireSigner(this._connection).sendTransaction(this.rawPopulatedTransaction),
      this._connection,
      this._parse
    );
  }
}

/**
 * {@inheritDoc @fluidity/lib-base#PopulatedRedemption}
 *
 * @public
 */
export class PopulatedEthersRedemption
  extends PopulatedEthersLiquityTransaction<RedemptionDetails>
  implements
    PopulatedRedemption<
      EthersPopulatedTransaction,
      EthersTransactionResponse,
      EthersTransactionReceipt
    > {
  /** {@inheritDoc @fluidity/lib-base#PopulatedRedemption.attemptedONEUAmount} */
  readonly attemptedONEUAmount: Decimal;

  /** {@inheritDoc @fluidity/lib-base#PopulatedRedemption.redeemableONEUAmount} */
  readonly redeemableONEUAmount: Decimal;

  /** {@inheritDoc @fluidity/lib-base#PopulatedRedemption.isTruncated} */
  readonly isTruncated: boolean;

  private readonly _increaseAmountByMinimumNetDebt?: (
    maxRedemptionRate?: Decimalish
  ) => Promise<PopulatedEthersRedemption>;

  /** @internal */
  constructor(
    rawPopulatedTransaction: EthersPopulatedTransaction,
    connection: EthersLiquityConnection,
    attemptedONEUAmount: Decimal,
    redeemableONEUAmount: Decimal,
    increaseAmountByMinimumNetDebt?: (
      maxRedemptionRate?: Decimalish
    ) => Promise<PopulatedEthersRedemption>
  ) {
    const { troveManager } = _getContracts(connection);

    super(
      rawPopulatedTransaction,
      connection,

      ({ logs }) =>
        troveManager
          .extractEvents(logs, "Redemption")
          .map(({ args: { _AUTSent, _AUTFee, _actualONEUAmount, _attemptedONEUAmount } }) => ({
            attemptedONEUAmount: decimalify(_attemptedONEUAmount),
            actualONEUAmount: decimalify(_actualONEUAmount),
            collateralTaken: decimalify(_AUTSent),
            fee: decimalify(_AUTFee)
          }))[0]
    );

    this.attemptedONEUAmount = attemptedONEUAmount;
    this.redeemableONEUAmount = redeemableONEUAmount;
    this.isTruncated = redeemableONEUAmount.lt(attemptedONEUAmount);
    this._increaseAmountByMinimumNetDebt = increaseAmountByMinimumNetDebt;
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatedRedemption.increaseAmountByMinimumNetDebt} */
  increaseAmountByMinimumNetDebt(
    maxRedemptionRate?: Decimalish
  ): Promise<PopulatedEthersRedemption> {
    if (!this._increaseAmountByMinimumNetDebt) {
      throw new Error(
        "PopulatedEthersRedemption: increaseAmountByMinimumNetDebt() can " +
          "only be called when amount is truncated"
      );
    }

    return this._increaseAmountByMinimumNetDebt(maxRedemptionRate);
  }
}

/** @internal */
export interface _TroveChangeWithFees<T> {
  params: T;
  newTrove: Trove;
  fee: Decimal;
}

/**
 * Ethers-based implementation of {@link @fluidity/lib-base#PopulatableLiquity}.
 *
 * @public
 */
export class PopulatableEthersLiquity
  implements
    PopulatableLiquity<
      EthersTransactionReceipt,
      EthersTransactionResponse,
      EthersPopulatedTransaction
    > {
  private readonly _readable: ReadableEthersLiquity;

  constructor(readable: ReadableEthersLiquity) {
    this._readable = readable;
  }

  private _wrapSimpleTransaction(
    rawPopulatedTransaction: EthersPopulatedTransaction
  ): PopulatedEthersLiquityTransaction<void> {
    return new PopulatedEthersLiquityTransaction(
      rawPopulatedTransaction,
      this._readable.connection,
      noDetails
    );
  }

  private _wrapTroveChangeWithFees<T>(
    params: T,
    rawPopulatedTransaction: EthersPopulatedTransaction,
    gasHeadroom?: number
  ): PopulatedEthersLiquityTransaction<_TroveChangeWithFees<T>> {
    const { borrowerOperations } = _getContracts(this._readable.connection);

    return new PopulatedEthersLiquityTransaction(
      rawPopulatedTransaction,
      this._readable.connection,

      ({ logs }) => {
        const [newTrove] = borrowerOperations
          .extractEvents(logs, "TroveUpdated")
          .map(({ args: { _coll, _debt } }) => new Trove(decimalify(_coll), decimalify(_debt)));

        const [fee] = borrowerOperations
          .extractEvents(logs, "ONEUBorrowingFeePaid")
          .map(({ args: { _ONEUFee } }) => decimalify(_ONEUFee));

        return {
          params,
          newTrove,
          fee
        };
      },

      gasHeadroom
    );
  }

  private async _wrapTroveClosure(
    rawPopulatedTransaction: EthersPopulatedTransaction
  ): Promise<PopulatedEthersLiquityTransaction<TroveClosureDetails>> {
    const { activePool, oneuToken: lusdToken } = _getContracts(this._readable.connection);

    return new PopulatedEthersLiquityTransaction(
      rawPopulatedTransaction,
      this._readable.connection,

      ({ logs, from: userAddress }) => {
        const [repayONEU] = lusdToken
          .extractEvents(logs, "Transfer")
          .filter(({ args: { from, to } }) => from === userAddress && to === AddressZero)
          .map(({ args: { value } }) => decimalify(value));

        const [withdrawCollateral] = activePool
          .extractEvents(logs, "EtherSent")
          .filter(({ args: { _to } }) => _to === userAddress)
          .map(({ args: { _amount } }) => decimalify(_amount));

        return {
          params: repayONEU.nonZero ? { withdrawCollateral, repayONEU } : { withdrawCollateral }
        };
      }
    );
  }

  private _wrapLiquidation(
    rawPopulatedTransaction: EthersPopulatedTransaction
  ): PopulatedEthersLiquityTransaction<LiquidationDetails> {
    const { troveManager } = _getContracts(this._readable.connection);

    return new PopulatedEthersLiquityTransaction(
      rawPopulatedTransaction,
      this._readable.connection,

      ({ logs }) => {
        const liquidatedAddresses = troveManager
          .extractEvents(logs, "TroveLiquidated")
          .map(({ args: { _borrower } }) => _borrower);

        const [totals] = troveManager
          .extractEvents(logs, "Liquidation")
          .map(
            ({
              args: { _ONEUGasCompensation, _collGasCompensation, _liquidatedColl, _liquidatedDebt }
            }) => ({
              collateralGasCompensation: decimalify(_collGasCompensation),
              lusdGasCompensation: decimalify(_ONEUGasCompensation),
              totalLiquidated: new Trove(decimalify(_liquidatedColl), decimalify(_liquidatedDebt))
            })
          );

        return {
          liquidatedAddresses,
          ...totals
        };
      }
    );
  }

  private _extractStabilityPoolGainsWithdrawalDetails(
    logs: Log[]
  ): StabilityPoolGainsWithdrawalDetails {
    const { stabilityPool } = _getContracts(this._readable.connection);

    const [newONEUDeposit] = stabilityPool
      .extractEvents(logs, "UserDepositChanged")
      .map(({ args: { _newDeposit } }) => decimalify(_newDeposit));

    const [[collateralGain, lusdLoss]] = stabilityPool
      .extractEvents(logs, "AUTGainWithdrawn")
      .map(({ args: { _AUT, _ONEULoss } }) => [decimalify(_AUT), decimalify(_ONEULoss)]);

    const [lqtyReward] = stabilityPool
      .extractEvents(logs, "OPLPaidToDepositor")
      .map(({ args: { _OPL } }) => decimalify(_OPL));

    return {
      lusdLoss,
      newONEUDeposit,
      collateralGain,
      lqtyReward
    };
  }

  private _wrapStabilityPoolGainsWithdrawal(
    rawPopulatedTransaction: EthersPopulatedTransaction
  ): PopulatedEthersLiquityTransaction<StabilityPoolGainsWithdrawalDetails> {
    return new PopulatedEthersLiquityTransaction(
      rawPopulatedTransaction,
      this._readable.connection,
      ({ logs }) => this._extractStabilityPoolGainsWithdrawalDetails(logs)
    );
  }

  private _wrapStabilityDepositTopup(
    change: { depositONEU: Decimal },
    rawPopulatedTransaction: EthersPopulatedTransaction
  ): PopulatedEthersLiquityTransaction<StabilityDepositChangeDetails> {
    return new PopulatedEthersLiquityTransaction(
      rawPopulatedTransaction,
      this._readable.connection,

      ({ logs }) => ({
        ...this._extractStabilityPoolGainsWithdrawalDetails(logs),
        change
      })
    );
  }

  private async _wrapStabilityDepositWithdrawal(
    rawPopulatedTransaction: EthersPopulatedTransaction
  ): Promise<PopulatedEthersLiquityTransaction<StabilityDepositChangeDetails>> {
    const { stabilityPool, oneuToken: lusdToken } = _getContracts(this._readable.connection);

    return new PopulatedEthersLiquityTransaction(
      rawPopulatedTransaction,
      this._readable.connection,

      ({ logs, from: userAddress }) => {
        const gainsWithdrawalDetails = this._extractStabilityPoolGainsWithdrawalDetails(logs);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore 
        const [withdrawONEU] = lusdToken.extractEvents(logs, "Transfer").filter(({ args: { from, to } }) =>  from === stabilityPool.address && to === userAddress).map(({ args: { value } }) => decimalify(value));

        return {
          ...gainsWithdrawalDetails,
          change: { withdrawONEU, withdrawAllONEU: gainsWithdrawalDetails.newONEUDeposit.isZero }
        };
      }
    );
  }

  private _wrapCollateralGainTransfer(
    rawPopulatedTransaction: EthersPopulatedTransaction
  ): PopulatedEthersLiquityTransaction<CollateralGainTransferDetails> {
    const { borrowerOperations } = _getContracts(this._readable.connection);

    return new PopulatedEthersLiquityTransaction(
      rawPopulatedTransaction,
      this._readable.connection,

      ({ logs }) => {
        const [newTrove] = borrowerOperations
          .extractEvents(logs, "TroveUpdated")
          .map(({ args: { _coll, _debt } }) => new Trove(decimalify(_coll), decimalify(_debt)));

        return {
          ...this._extractStabilityPoolGainsWithdrawalDetails(logs),
          newTrove
        };
      }
    );
  }

  private async _findHintsForNominalCollateralRatio(
    nominalCollateralRatio: Decimal,
    ownAddress?: string
  ): Promise<[string, string]> {
    const { sortedTroves, hintHelpers } = _getContracts(this._readable.connection);
    const numberOfTroves = await this._readable.getNumberOfTroves();

    if (!numberOfTroves) {
      return [AddressZero, AddressZero];
    }

    if (nominalCollateralRatio.infinite) {
      return [AddressZero, await sortedTroves.getFirst()];
    }

    const totalNumberOfTrials = Math.ceil(10 * Math.sqrt(numberOfTroves));
    const [firstTrials, ...restOfTrials] = generateTrials(totalNumberOfTrials);

    const collectApproxHint = (
      {
        latestRandomSeed,
        results
      }: {
        latestRandomSeed: BigNumberish;
        results: { diff: BigNumber; hintAddress: string }[];
      },
      numberOfTrials: number
    ) =>
      hintHelpers
        .getApproxHint(nominalCollateralRatio.hex, numberOfTrials, latestRandomSeed)
        .then(({ latestRandomSeed, ...result }) => ({
          latestRandomSeed,
          results: [...results, result]
        }));

    const { results } = await restOfTrials.reduce(
      (p, numberOfTrials) => p.then(state => collectApproxHint(state, numberOfTrials)),
      collectApproxHint({ latestRandomSeed: randomInteger(), results: [] }, firstTrials)
    );

    const { hintAddress } = results.reduce((a, b) => (a.diff.lt(b.diff) ? a : b));

    let [prev, next] = await sortedTroves.findInsertPosition(
      nominalCollateralRatio.hex,
      hintAddress,
      hintAddress
    );

    if (ownAddress) {
      // In the case of reinsertion, the address of the Trove being reinserted is not a usable hint,
      // because it is deleted from the list before the reinsertion.
      // "Jump over" the Trove to get the proper hint.
      if (prev === ownAddress) {
        prev = await sortedTroves.getPrev(prev);
      } else if (next === ownAddress) {
        next = await sortedTroves.getNext(next);
      }
    }

    // Don't use `address(0)` as hint as it can result in huge gas cost.
    // (See https://github.com/goldmandao/fluidity/issues/600).
    if (prev === AddressZero) {
      prev = next;
    } else if (next === AddressZero) {
      next = prev;
    }

    return [prev, next];
  }

  private async _findHints(trove: Trove, ownAddress?: string): Promise<[string, string]> {
    if (trove instanceof TroveWithPendingRedistribution) {
      throw new Error("Rewards must be applied to this Trove");
    }

    return this._findHintsForNominalCollateralRatio(trove._nominalCollateralRatio, ownAddress);
  }

  private async _findRedemptionHints(
    amount: Decimal
  ): Promise<
    [
      truncatedAmount: Decimal,
      firstRedemptionHint: string,
      partialRedemptionUpperHint: string,
      partialRedemptionLowerHint: string,
      partialRedemptionHintNICR: BigNumber
    ]
  > {
    const { hintHelpers } = _getContracts(this._readable.connection);
    const price = await this._readable.getPrice();

    const {
      firstRedemptionHint,
      partialRedemptionHintNICR,
      truncatedONEUamount
    } = await hintHelpers.getRedemptionHints(amount.hex, price.hex, _redeemMaxIterations);

    const [
      partialRedemptionUpperHint,
      partialRedemptionLowerHint
    ] = partialRedemptionHintNICR.isZero()
      ? [AddressZero, AddressZero]
      : await this._findHintsForNominalCollateralRatio(
          decimalify(partialRedemptionHintNICR)
          // XXX: if we knew the partially redeemed Trove's address, we'd pass it here
        );

    return [
      decimalify(truncatedONEUamount),
      firstRedemptionHint,
      partialRedemptionUpperHint,
      partialRedemptionLowerHint,
      partialRedemptionHintNICR
    ];
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.openTrove} */
  async openTrove(
    params: TroveCreationParams<Decimalish>,
    maxBorrowingRateOrOptionalParams?: Decimalish | BorrowingOperationOptionalParams,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<TroveCreationDetails>> {
    const { borrowerOperations } = _getContracts(this._readable.connection);

    const normalizedParams = _normalizeTroveCreation(params);
    const { depositCollateral, borrowONEU } = normalizedParams;

    const [fees, blockTimestamp, total, price] = await Promise.all([
      this._readable._getFeesFactory(),
      this._readable._getBlockTimestamp(),
      this._readable.getTotal(),
      this._readable.getPrice()
    ]);

    const recoveryMode = total.collateralRatioIsBelowCritical(price);

    const decayBorrowingRate = (seconds: number) =>
      fees(blockTimestamp + seconds, recoveryMode).borrowingRate();

    const currentBorrowingRate = decayBorrowingRate(0);
    const newTrove = Trove.create(normalizedParams, currentBorrowingRate);
    const hints = await this._findHints(newTrove);

    const {
      maxBorrowingRate,
      borrowingFeeDecayToleranceMinutes
    } = normalizeBorrowingOperationOptionalParams(
      maxBorrowingRateOrOptionalParams,
      currentBorrowingRate
    );

    const txParams = (borrowONEU: Decimal): Parameters<typeof borrowerOperations.openTrove> => [
      maxBorrowingRate.hex,
      borrowONEU.hex,
      ...hints,
      { value: depositCollateral.hex, ...overrides }
    ];

    let gasHeadroom: number | undefined;

    if (overrides?.gasLimit === undefined) {
      const decayedBorrowingRate = decayBorrowingRate(60 * borrowingFeeDecayToleranceMinutes);
      const decayedTrove = Trove.create(normalizedParams, decayedBorrowingRate);
      const { borrowONEU: borrowONEUSimulatingDecay } = Trove.recreate(
        decayedTrove,
        currentBorrowingRate
      );

      if (decayedTrove.debt.lt(ONEU_MINIMUM_DEBT)) {
        throw new Error(
          `Trove's debt might fall below ${ONEU_MINIMUM_DEBT} ` +
            `within ${borrowingFeeDecayToleranceMinutes} minutes`
        );
      }

      const [gasNow, gasLater] = await Promise.all([
        borrowerOperations.estimateGas.openTrove(...txParams(borrowONEU)),
        borrowerOperations.estimateGas.openTrove(...txParams(borrowONEUSimulatingDecay))
      ]);

      const gasLimit = addGasForBaseRateUpdate(borrowingFeeDecayToleranceMinutes)(
        bigNumberMax(addGasForPotentialListTraversal(gasNow), gasLater)
      );

      gasHeadroom = gasLimit.sub(gasNow).toNumber();
      overrides = { ...overrides, gasLimit };
    }

    return this._wrapTroveChangeWithFees(
      normalizedParams,
      await borrowerOperations.populateTransaction.openTrove(...txParams(borrowONEU)),
      gasHeadroom
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.closeTrove} */
  async closeTrove(
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<TroveClosureDetails>> {
    const { borrowerOperations } = _getContracts(this._readable.connection);

    return this._wrapTroveClosure(
      await borrowerOperations.estimateAndPopulate.closeTrove({ ...overrides }, id)
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.depositCollateral} */
  depositCollateral(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<TroveAdjustmentDetails>> {
    return this.adjustTrove({ depositCollateral: amount }, undefined, overrides);
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.withdrawCollateral} */
  withdrawCollateral(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<TroveAdjustmentDetails>> {
    return this.adjustTrove({ withdrawCollateral: amount }, undefined, overrides);
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.borrowONEU} */
  borrowONEU(
    amount: Decimalish,
    maxBorrowingRate?: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<TroveAdjustmentDetails>> {
    return this.adjustTrove({ borrowONEU: amount }, maxBorrowingRate, overrides);
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.repayONEU} */
  repayONEU(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<TroveAdjustmentDetails>> {
    return this.adjustTrove({ repayONEU: amount }, undefined, overrides);
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.adjustTrove} */
  async adjustTrove(
    params: TroveAdjustmentParams<Decimalish>,
    maxBorrowingRateOrOptionalParams?: Decimalish | BorrowingOperationOptionalParams,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<TroveAdjustmentDetails>> {
    const address = _requireAddress(this._readable.connection, overrides);
    const { borrowerOperations } = _getContracts(this._readable.connection);

    const normalizedParams = _normalizeTroveAdjustment(params);
    const { depositCollateral, withdrawCollateral, borrowONEU, repayONEU } = normalizedParams;

    const [trove, feeVars] = await Promise.all([
      this._readable.getTrove(address),
      borrowONEU &&
        promiseAllValues({
          fees: this._readable._getFeesFactory(),
          blockTimestamp: this._readable._getBlockTimestamp(),
          total: this._readable.getTotal(),
          price: this._readable.getPrice()
        })
    ]);

    const decayBorrowingRate = (seconds: number) =>
      feeVars
        ?.fees(
          feeVars.blockTimestamp + seconds,
          feeVars.total.collateralRatioIsBelowCritical(feeVars.price)
        )
        .borrowingRate();

    const currentBorrowingRate = decayBorrowingRate(0);
    const adjustedTrove = trove.adjust(normalizedParams, currentBorrowingRate);
    const hints = await this._findHints(adjustedTrove, address);

    const {
      maxBorrowingRate,
      borrowingFeeDecayToleranceMinutes
    } = normalizeBorrowingOperationOptionalParams(
      maxBorrowingRateOrOptionalParams,
      currentBorrowingRate
    );

    const txParams = (borrowONEU?: Decimal): Parameters<typeof borrowerOperations.adjustTrove> => [
      maxBorrowingRate.hex,
      (withdrawCollateral ?? Decimal.ZERO).hex,
      (borrowONEU ?? repayONEU ?? Decimal.ZERO).hex,
      !!borrowONEU,
      ...hints,
      { value: depositCollateral?.hex, ...overrides }
    ];

    let gasHeadroom: number | undefined;

    if (overrides?.gasLimit === undefined) {
      const decayedBorrowingRate = decayBorrowingRate(60 * borrowingFeeDecayToleranceMinutes);
      const decayedTrove = trove.adjust(normalizedParams, decayedBorrowingRate);
      const { borrowONEU: borrowONEUSimulatingDecay } = trove.adjustTo(
        decayedTrove,
        currentBorrowingRate
      );

      if (decayedTrove.debt.lt(ONEU_MINIMUM_DEBT)) {
        throw new Error(
          `Trove's debt might fall below ${ONEU_MINIMUM_DEBT} ` +
            `within ${borrowingFeeDecayToleranceMinutes} minutes`
        );
      }

      const [gasNow, gasLater] = await Promise.all([
        borrowerOperations.estimateGas.adjustTrove(...txParams(borrowONEU)),
        borrowONEU &&
          borrowerOperations.estimateGas.adjustTrove(...txParams(borrowONEUSimulatingDecay))
      ]);

      let gasLimit = bigNumberMax(addGasForPotentialListTraversal(gasNow), gasLater);

      if (borrowONEU) {
        gasLimit = addGasForBaseRateUpdate(borrowingFeeDecayToleranceMinutes)(gasLimit);
      }

      gasHeadroom = gasLimit.sub(gasNow).toNumber();
      overrides = { ...overrides, gasLimit };
    }

    return this._wrapTroveChangeWithFees(
      normalizedParams,
      await borrowerOperations.populateTransaction.adjustTrove(...txParams(borrowONEU)),
      gasHeadroom
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.claimCollateralSurplus} */
  async claimCollateralSurplus(
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<void>> {
    const { borrowerOperations } = _getContracts(this._readable.connection);

    return this._wrapSimpleTransaction(
      await borrowerOperations.estimateAndPopulate.claimCollateral({ ...overrides }, id)
    );
  }

  /** @internal */
  async setPrice(
    price: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<void>> {
    const { priceFeed } = _getContracts(this._readable.connection);

    if (!_priceFeedIsTestnet(priceFeed)) {
      throw new Error("setPrice() unavailable on this deployment of Liquity");
    }

    return this._wrapSimpleTransaction(
      await priceFeed.estimateAndPopulate.setPrice({ ...overrides }, id, Decimal.from(price).hex)
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.liquidate} */
  async liquidate(
    address: string | string[],
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<LiquidationDetails>> {
    const { troveManager } = _getContracts(this._readable.connection);

    if (Array.isArray(address)) {
      return this._wrapLiquidation(
        await troveManager.estimateAndPopulate.batchLiquidateTroves(
          { ...overrides },
          addGasForOPLIssuance,
          address
        )
      );
    } else {
      return this._wrapLiquidation(
        await troveManager.estimateAndPopulate.liquidate(
          { ...overrides },
          addGasForOPLIssuance,
          address
        )
      );
    }
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.liquidateUpTo} */
  async liquidateUpTo(
    maximumNumberOfTrovesToLiquidate: number,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<LiquidationDetails>> {
    const { troveManager } = _getContracts(this._readable.connection);

    return this._wrapLiquidation(
      await troveManager.estimateAndPopulate.liquidateTroves(
        { ...overrides },
        addGasForOPLIssuance,
        maximumNumberOfTrovesToLiquidate
      )
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.depositONEUInStabilityPool} */
  async depositONEUInStabilityPool(
    amount: Decimalish,
    frontendTag?: string,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<StabilityDepositChangeDetails>> {
    const { stabilityPool } = _getContracts(this._readable.connection);
    const depositONEU = Decimal.from(amount);

    return this._wrapStabilityDepositTopup(
      { depositONEU },
      await stabilityPool.estimateAndPopulate.provideToSP(
        { ...overrides },
        addGasForOPLIssuance,
        depositONEU.hex,
        frontendTag ?? this._readable.connection.frontendTag ?? AddressZero
      )
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.withdrawONEUFromStabilityPool} */
  async withdrawONEUFromStabilityPool(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<StabilityDepositChangeDetails>> {
    const { stabilityPool } = _getContracts(this._readable.connection);

    return this._wrapStabilityDepositWithdrawal(
      await stabilityPool.estimateAndPopulate.withdrawFromSP(
        { ...overrides },
        addGasForOPLIssuance,
        Decimal.from(amount).hex
      )
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.withdrawGainsFromStabilityPool} */
  async withdrawGainsFromStabilityPool(
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<StabilityPoolGainsWithdrawalDetails>> {
    const { stabilityPool } = _getContracts(this._readable.connection);

    return this._wrapStabilityPoolGainsWithdrawal(
      await stabilityPool.estimateAndPopulate.withdrawFromSP(
        { ...overrides },
        addGasForOPLIssuance,
        Decimal.ZERO.hex
      )
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.transferCollateralGainToTrove} */
  async transferCollateralGainToTrove(
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<CollateralGainTransferDetails>> {
    const address = _requireAddress(this._readable.connection, overrides);
    const { stabilityPool } = _getContracts(this._readable.connection);

    const [initialTrove, stabilityDeposit] = await Promise.all([
      this._readable.getTrove(address),
      this._readable.getStabilityDeposit(address)
    ]);

    const finalTrove = initialTrove.addCollateral(stabilityDeposit.collateralGain);

    return this._wrapCollateralGainTransfer(
      await stabilityPool.estimateAndPopulate.withdrawAUTGainToTrove(
        { ...overrides },
        compose(addGasForPotentialListTraversal, addGasForOPLIssuance),
        ...(await this._findHints(finalTrove, address))
      )
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.sendONEU} */
  async sendONEU(
    toAddress: string,
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<void>> {
    const { oneuToken: lusdToken } = _getContracts(this._readable.connection);

    return this._wrapSimpleTransaction(
      await lusdToken.estimateAndPopulate.transfer(
        { ...overrides },
        id,
        toAddress,
        Decimal.from(amount).hex
      )
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.sendOPL} */
  async sendOPL(
    toAddress: string,
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<void>> {
    const { oplToken: lqtyToken } = _getContracts(this._readable.connection);

    return this._wrapSimpleTransaction(
      await lqtyToken.estimateAndPopulate.transfer(
        { ...overrides },
        id,
        toAddress,
        Decimal.from(amount).hex
      )
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.redeemONEU} */
  async redeemONEU(
    amount: Decimalish,
    maxRedemptionRate?: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersRedemption> {
    const { troveManager } = _getContracts(this._readable.connection);
    const attemptedONEUAmount = Decimal.from(amount);

    const [
      fees,
      total,
      [truncatedAmount, firstRedemptionHint, ...partialHints]
    ] = await Promise.all([
      this._readable.getFees(),
      this._readable.getTotal(),
      this._findRedemptionHints(attemptedONEUAmount)
    ]);

    if (truncatedAmount.isZero) {
      throw new Error(
        `redeemONEU: amount too low to redeem (try at least ${ONEU_MINIMUM_NET_DEBT})`
      );
    }

    const defaultMaxRedemptionRate = (amount: Decimal) =>
      Decimal.min(
        fees.redemptionRate(amount.div(total.debt)).add(defaultRedemptionRateSlippageTolerance),
        Decimal.ONE
      );

    const populateRedemption = async (
      attemptedONEUAmount: Decimal,
      maxRedemptionRate?: Decimalish,
      truncatedAmount: Decimal = attemptedONEUAmount,
      partialHints: [string, string, BigNumberish] = [AddressZero, AddressZero, 0]
    ): Promise<PopulatedEthersRedemption> => {
      const maxRedemptionRateOrDefault =
        maxRedemptionRate !== undefined
          ? Decimal.from(maxRedemptionRate)
          : defaultMaxRedemptionRate(truncatedAmount);

      return new PopulatedEthersRedemption(
        await troveManager.estimateAndPopulate.redeemCollateral(
          { ...overrides },
          addGasForBaseRateUpdate(),
          truncatedAmount.hex,
          firstRedemptionHint,
          ...partialHints,
          _redeemMaxIterations,
          maxRedemptionRateOrDefault.hex
        ),

        this._readable.connection,
        attemptedONEUAmount,
        truncatedAmount,

        truncatedAmount.lt(attemptedONEUAmount)
          ? newMaxRedemptionRate =>
              populateRedemption(
                truncatedAmount.add(ONEU_MINIMUM_NET_DEBT),
                newMaxRedemptionRate ?? maxRedemptionRate
              )
          : undefined
      );
    };

    return populateRedemption(attemptedONEUAmount, maxRedemptionRate, truncatedAmount, partialHints);
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.stakeOPL} */
  async stakeOPL(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<void>> {
    const { oplStaking: lqtyStaking } = _getContracts(this._readable.connection);

    return this._wrapSimpleTransaction(
      await lqtyStaking.estimateAndPopulate.stake({ ...overrides }, id, Decimal.from(amount).hex)
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.unstakeOPL} */
  async unstakeOPL(
    amount: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<void>> {
    const { oplStaking: lqtyStaking } = _getContracts(this._readable.connection);

    return this._wrapSimpleTransaction(
      await lqtyStaking.estimateAndPopulate.unstake({ ...overrides }, id, Decimal.from(amount).hex)
    );
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.withdrawGainsFromStaking} */
  withdrawGainsFromStaking(
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<void>> {
    return this.unstakeOPL(Decimal.ZERO, overrides);
  }

  /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.registerFrontend} */
  async registerFrontend(
    kickbackRate: Decimalish,
    overrides?: EthersTransactionOverrides
  ): Promise<PopulatedEthersLiquityTransaction<void>> {
    const { stabilityPool } = _getContracts(this._readable.connection);

    return this._wrapSimpleTransaction(
      await stabilityPool.estimateAndPopulate.registerFrontEnd(
        { ...overrides },
        id,
        Decimal.from(kickbackRate).hex
      )
    );
  }

  // /** @internal */
  // async _mintUniToken(
  //   amount: Decimalish,
  //   address?: string,
  //   overrides?: EthersTransactionOverrides
  // ): Promise<PopulatedEthersLiquityTransaction<void>> {
  //   address ??= _requireAddress(this._readable.connection, overrides);
  //   const { uniToken } = _getContracts(this._readable.connection);

  //   if (!_uniTokenIsMock(uniToken)) {
  //     throw new Error("_mintUniToken() unavailable on this deployment of Liquity");
  //   }

  //   return this._wrapSimpleTransaction(
  //     await uniToken.estimateAndPopulate.mint(
  //       { ...overrides },
  //       id,
  //       address,
  //       Decimal.from(amount).hex
  //     )
  //   );
  // }

  // /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.approveUniTokens} */
  // async approveUniTokens(
  //   allowance?: Decimalish,
  //   overrides?: EthersTransactionOverrides
  // ): Promise<PopulatedEthersLiquityTransaction<void>> {
  //   const { uniToken, unipool } = _getContracts(this._readable.connection);

  //   return this._wrapSimpleTransaction(
  //     await uniToken.estimateAndPopulate.approve(
  //       { ...overrides },
  //       id,
  //       unipool.address,
  //       Decimal.from(allowance ?? Decimal.INFINITY).hex
  //     )
  //   );
  // }

  // /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.stakeUniTokens} */
  // async stakeUniTokens(
  //   amount: Decimalish,
  //   overrides?: EthersTransactionOverrides
  // ): Promise<PopulatedEthersLiquityTransaction<void>> {
  //   const { unipool } = _getContracts(this._readable.connection);

  //   return this._wrapSimpleTransaction(
  //     await unipool.estimateAndPopulate.stake(
  //       { ...overrides },
  //       addGasForUnipoolRewardUpdate,
  //       Decimal.from(amount).hex
  //     )
  //   );
  // }

  // /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.unstakeUniTokens} */
  // async unstakeUniTokens(
  //   amount: Decimalish,
  //   overrides?: EthersTransactionOverrides
  // ): Promise<PopulatedEthersLiquityTransaction<void>> {
  //   const { unipool } = _getContracts(this._readable.connection);

  //   return this._wrapSimpleTransaction(
  //     await unipool.estimateAndPopulate.withdraw(
  //       { ...overrides },
  //       addGasForUnipoolRewardUpdate,
  //       Decimal.from(amount).hex
  //     )
  //   );
  // }

  // /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.withdrawOPLRewardFromLiquidityMining} */
  // async withdrawOPLRewardFromLiquidityMining(
  //   overrides?: EthersTransactionOverrides
  // ): Promise<PopulatedEthersLiquityTransaction<void>> {
  //   const { unipool } = _getContracts(this._readable.connection);

  //   return this._wrapSimpleTransaction(
  //     await unipool.estimateAndPopulate.claimReward({ ...overrides }, addGasForUnipoolRewardUpdate)
  //   );
  // }

  // /** {@inheritDoc @fluidity/lib-base#PopulatableLiquity.exitLiquidityMining} */
  // async exitLiquidityMining(
  //   overrides?: EthersTransactionOverrides
  // ): Promise<PopulatedEthersLiquityTransaction<void>> {
  //   const { unipool } = _getContracts(this._readable.connection);

  //   return this._wrapSimpleTransaction(
  //     await unipool.estimateAndPopulate.withdrawAndClaim(
  //       { ...overrides },
  //       addGasForUnipoolRewardUpdate
  //     )
  //   );
  // }
}
