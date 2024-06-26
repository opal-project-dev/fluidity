<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluidity/lib-ethers](./lib-ethers.md) &gt; [SendableEthersLiquity](./lib-ethers.sendableethersliquity.md) &gt; [repayONEU](./lib-ethers.sendableethersliquity.repayoneu.md)

## SendableEthersLiquity.repayONEU() method

Adjust existing Trove by repaying some of its debt.

**Signature:**

```typescript
repayONEU(amount: Decimalish, overrides?: EthersTransactionOverrides): Promise<SentEthersLiquityTransaction<TroveAdjustmentDetails>>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  amount | [Decimalish](./lib-base.decimalish.md) | The amount of ONEU to repay. |
|  overrides | [EthersTransactionOverrides](./lib-ethers.etherstransactionoverrides.md) |  |

**Returns:**

Promise&lt;[SentEthersLiquityTransaction](./lib-ethers.sentethersliquitytransaction.md)<!-- -->&lt;[TroveAdjustmentDetails](./lib-base.troveadjustmentdetails.md)<!-- -->&gt;&gt;

## Remarks

Equivalent to:

```typescript
adjustTrove({ repayONEU: amount })
```

