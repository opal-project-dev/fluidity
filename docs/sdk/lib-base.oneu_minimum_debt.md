<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluidity/lib-base](./lib-base.md) &gt; [ONEU\_MINIMUM\_DEBT](./lib-base.oneu_minimum_debt.md)

## ONEU\_MINIMUM\_DEBT variable

A Trove must always have at least this much debt.

**Signature:**

```typescript
ONEU_MINIMUM_DEBT: Decimal
```

## Remarks

Any transaction that would result in a Trove with less debt than this will be reverted.

