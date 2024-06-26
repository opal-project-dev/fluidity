<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluidity/lib-base](./lib-base.md) &gt; [PopulatableLiquity](./lib-base.populatableliquity.md) &gt; [redeemONEU](./lib-base.populatableliquity.redeemoneu.md)

## PopulatableLiquity.redeemONEU() method

Redeem ONEU to native currency (e.g. Ether) at face value.

**Signature:**

```typescript
redeemONEU(amount: Decimalish, maxRedemptionRate?: Decimalish): Promise<PopulatedRedemption<P, S, R>>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  amount | [Decimalish](./lib-base.decimalish.md) | Amount of ONEU to be redeemed. |
|  maxRedemptionRate | [Decimalish](./lib-base.decimalish.md) | Maximum acceptable [redemption rate](./lib-base.fees.redemptionrate.md)<!-- -->. |

**Returns:**

Promise&lt;[PopulatedRedemption](./lib-base.populatedredemption.md)<!-- -->&lt;P, S, R&gt;&gt;

## Remarks

If `maxRedemptionRate` is omitted, the current redemption rate (based on `amount`<!-- -->) plus 0.1% is used as maximum acceptable rate.

