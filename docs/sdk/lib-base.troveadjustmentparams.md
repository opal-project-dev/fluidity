<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluidity/lib-base](./lib-base.md) &gt; [TroveAdjustmentParams](./lib-base.troveadjustmentparams.md)

## TroveAdjustmentParams type

Parameters of an [adjustTrove()](./lib-base.transactableliquity.adjusttrove.md) transaction.

**Signature:**

```typescript
export declare type TroveAdjustmentParams<T = unknown> = (_CollateralChange<T> & _NoDebtChange) | (_DebtChange<T> & _NoCollateralChange) | (_CollateralChange<T> & _DebtChange<T>);
```

## Remarks

The type parameter `T` specifies the allowed value type(s) of the particular `TroveAdjustmentParams` object's properties.

Even though all properties are optional, a valid `TroveAdjustmentParams` object must define at least one.

Defining both `depositCollateral` and `withdrawCollateral`<!-- -->, or both `borrowONEU` and `repayONEU` at the same time is disallowed, and will result in a type-checking error.

<h2>Properties</h2>

<table>

<tr> <th> Property </th> <th> Type </th> <th> Description </th> </tr>

<tr> <td> depositCollateral? </td> <td> T </td> <td> <i>(Optional)</i> The amount of collateral that's deposited. </td> </tr>

<tr> <td> withdrawCollateral? </td> <td> T </td> <td> <i>(Optional)</i> The amount of collateral that's withdrawn. </td> </tr>

<tr> <td> borrowONEU? </td> <td> T </td> <td> <i>(Optional)</i> The amount of ONEU that's borrowed. </td> </tr>

<tr> <td> repayONEU? </td> <td> T </td> <td> <i>(Optional)</i> The amount of ONEU that's repaid. </td> </tr>

</table>

