<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluidity/lib-base](./lib-base.md) &gt; [Fees](./lib-base.fees.md) &gt; [borrowingRate](./lib-base.fees.borrowingrate.md)

## Fees.borrowingRate() method

Calculate the current borrowing rate.

**Signature:**

```typescript
borrowingRate(when?: Date): Decimal;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  when | Date | Optional timestamp that can be used to calculate what the borrowing rate would decay to at a point of time in the future. |

**Returns:**

[Decimal](./lib-base.decimal.md)

## Remarks

By default, the fee is calculated at the time of the latest block. This can be overridden using the `when` parameter.

To calculate the borrowing fee in ONEU, multiply the borrowed ONEU amount by the borrowing rate.

## Example


```typescript
const fees = await liquity.getFees();

const borrowedONEUAmount = 100;
const borrowingRate = fees.borrowingRate();
const borrowingFeeONEU = borrowingRate.mul(borrowedONEUAmount);
```

