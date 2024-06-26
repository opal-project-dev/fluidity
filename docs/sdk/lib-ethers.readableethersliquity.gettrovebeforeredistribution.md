<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluidity/lib-ethers](./lib-ethers.md) &gt; [ReadableEthersLiquity](./lib-ethers.readableethersliquity.md) &gt; [getTroveBeforeRedistribution](./lib-ethers.readableethersliquity.gettrovebeforeredistribution.md)

## ReadableEthersLiquity.getTroveBeforeRedistribution() method

Get a Trove in its state after the last direct modification.

**Signature:**

```typescript
getTroveBeforeRedistribution(address?: string, overrides?: EthersCallOverrides): Promise<TroveWithPendingRedistribution>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  address | string | Address that owns the Trove. |
|  overrides | [EthersCallOverrides](./lib-ethers.etherscalloverrides.md) |  |

**Returns:**

Promise&lt;[TroveWithPendingRedistribution](./lib-base.trovewithpendingredistribution.md)<!-- -->&gt;

## Remarks

The current state of a Trove can be fetched using [getTrove()](./lib-base.readableliquity.gettrove.md)<!-- -->.

