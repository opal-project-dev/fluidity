<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluidity/lib-base](./lib-base.md) &gt; [PopulatableLiquity](./lib-base.populatableliquity.md) &gt; [withdrawONEUFromStabilityPool](./lib-base.populatableliquity.withdrawoneufromstabilitypool.md)

## PopulatableLiquity.withdrawONEUFromStabilityPool() method

Withdraw ONEU from Stability Deposit.

**Signature:**

```typescript
withdrawONEUFromStabilityPool(amount: Decimalish): Promise<PopulatedLiquityTransaction<P, SentLiquityTransaction<S, LiquityReceipt<R, StabilityDepositChangeDetails>>>>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  amount | [Decimalish](./lib-base.decimalish.md) | Amount of ONEU to withdraw. |

**Returns:**

Promise&lt;[PopulatedLiquityTransaction](./lib-base.populatedliquitytransaction.md)<!-- -->&lt;P, [SentLiquityTransaction](./lib-base.sentliquitytransaction.md)<!-- -->&lt;S, [LiquityReceipt](./lib-base.liquityreceipt.md)<!-- -->&lt;R, [StabilityDepositChangeDetails](./lib-base.stabilitydepositchangedetails.md)<!-- -->&gt;&gt;&gt;&gt;

## Remarks

As a side-effect, the transaction will also pay out the Stability Deposit's [collateral gain](./lib-base.stabilitydeposit.collateralgain.md) and [OPL reward](./lib-base.stabilitydeposit.lqtyreward.md)<!-- -->.

