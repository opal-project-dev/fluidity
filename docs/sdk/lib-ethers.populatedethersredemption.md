<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluidity/lib-ethers](./lib-ethers.md) &gt; [PopulatedEthersRedemption](./lib-ethers.populatedethersredemption.md)

## PopulatedEthersRedemption class

A redemption transaction that has been prepared for sending.

**Signature:**

```typescript
export declare class PopulatedEthersRedemption extends PopulatedEthersLiquityTransaction<RedemptionDetails> implements PopulatedRedemption<EthersPopulatedTransaction, EthersTransactionResponse, EthersTransactionReceipt> 
```
**Extends:** [PopulatedEthersLiquityTransaction](./lib-ethers.populatedethersliquitytransaction.md)<!-- -->&lt;[RedemptionDetails](./lib-base.redemptiondetails.md)<!-- -->&gt;

**Implements:** [PopulatedRedemption](./lib-base.populatedredemption.md)<!-- -->&lt;[EthersPopulatedTransaction](./lib-ethers.etherspopulatedtransaction.md)<!-- -->, [EthersTransactionResponse](./lib-ethers.etherstransactionresponse.md)<!-- -->, [EthersTransactionReceipt](./lib-ethers.etherstransactionreceipt.md)<!-- -->&gt;

## Remarks

The Liquity protocol fulfills redemptions by repaying the debt of Troves in ascending order of their collateralization ratio, and taking a portion of their collateral in exchange. Due to the [minimum debt](./lib-base.oneu_minimum_debt.md) requirement that Troves must fulfill, some ONEU amounts are not possible to redeem exactly.

When [redeemONEU()](./lib-base.populatableliquity.redeemoneu.md) is called with an amount that can't be fully redeemed, the amount will be truncated (see the `redeemableONEUAmount` property). When this happens, the redeemer can either redeem the truncated amount by sending the transaction unchanged, or prepare a new transaction by [increasing the amount](./lib-base.populatedredemption.increaseamountbyminimumnetdebt.md) to the next lowest possible value, which is the sum of the truncated amount and [ONEU\_MINIMUM\_NET\_DEBT](./lib-base.oneu_minimum_net_debt.md)<!-- -->.

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [attemptedONEUAmount](./lib-ethers.populatedethersredemption.attemptedoneuamount.md) |  | [Decimal](./lib-base.decimal.md) | Amount of ONEU the redeemer is trying to redeem. |
|  [isTruncated](./lib-ethers.populatedethersredemption.istruncated.md) |  | boolean | Whether <code>redeemableONEUAmount</code> is less than <code>attemptedONEUAmount</code>. |
|  [redeemableONEUAmount](./lib-ethers.populatedethersredemption.redeemableoneuamount.md) |  | [Decimal](./lib-base.decimal.md) | Maximum amount of ONEU that is currently redeemable from <code>attemptedONEUAmount</code>. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [increaseAmountByMinimumNetDebt(maxRedemptionRate)](./lib-ethers.populatedethersredemption.increaseamountbyminimumnetdebt.md) |  | Prepare a new transaction by increasing the attempted amount to the next lowest redeemable value. |

