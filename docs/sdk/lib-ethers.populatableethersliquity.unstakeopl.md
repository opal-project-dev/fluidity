<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluidity/lib-ethers](./lib-ethers.md) &gt; [PopulatableEthersLiquity](./lib-ethers.populatableethersliquity.md) &gt; [unstakeOPL](./lib-ethers.populatableethersliquity.unstakeopl.md)

## PopulatableEthersLiquity.unstakeOPL() method

Withdraw OPL from staking.

**Signature:**

```typescript
unstakeOPL(amount: Decimalish, overrides?: EthersTransactionOverrides): Promise<PopulatedEthersLiquityTransaction<void>>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  amount | [Decimalish](./lib-base.decimalish.md) | Amount of OPL to withdraw. |
|  overrides | [EthersTransactionOverrides](./lib-ethers.etherstransactionoverrides.md) |  |

**Returns:**

Promise&lt;[PopulatedEthersLiquityTransaction](./lib-ethers.populatedethersliquitytransaction.md)<!-- -->&lt;void&gt;&gt;

## Remarks

As a side-effect, the transaction will also pay out the OPL stake's [collateral gain](./lib-base.oplstake.collateralgain.md) and [ONEU gain](./lib-base.oplstake.lusdgain.md)<!-- -->.

