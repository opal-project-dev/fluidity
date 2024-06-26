<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluidity/lib-base](./lib-base.md) &gt; [TransactableLiquity](./lib-base.transactableliquity.md) &gt; [stakeOPL](./lib-base.transactableliquity.stakeopl.md)

## TransactableLiquity.stakeOPL() method

Stake OPL to start earning fee revenue or increase existing stake.

**Signature:**

```typescript
stakeOPL(amount: Decimalish): Promise<void>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  amount | [Decimalish](./lib-base.decimalish.md) | Amount of OPL to add to new or existing stake. |

**Returns:**

Promise&lt;void&gt;

## Exceptions

Throws [TransactionFailedError](./lib-base.transactionfailederror.md) in case of transaction failure.

## Remarks

As a side-effect, the transaction will also pay out an existing OPL stake's [collateral gain](./lib-base.oplstake.collateralgain.md) and [ONEU gain](./lib-base.oplstake.lusdgain.md)<!-- -->.

