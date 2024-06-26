<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluidity/lib-ethers](./lib-ethers.md) &gt; [SendableEthersLiquity](./lib-ethers.sendableethersliquity.md) &gt; [withdrawONEUFromStabilityPool](./lib-ethers.sendableethersliquity.withdrawoneufromstabilitypool.md)

## SendableEthersLiquity.withdrawONEUFromStabilityPool() method

Withdraw ONEU from Stability Deposit.

**Signature:**

```typescript
withdrawONEUFromStabilityPool(amount: Decimalish, overrides?: EthersTransactionOverrides): Promise<SentEthersLiquityTransaction<StabilityDepositChangeDetails>>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  amount | [Decimalish](./lib-base.decimalish.md) | Amount of ONEU to withdraw. |
|  overrides | [EthersTransactionOverrides](./lib-ethers.etherstransactionoverrides.md) |  |

**Returns:**

Promise&lt;[SentEthersLiquityTransaction](./lib-ethers.sentethersliquitytransaction.md)<!-- -->&lt;[StabilityDepositChangeDetails](./lib-base.stabilitydepositchangedetails.md)<!-- -->&gt;&gt;

## Remarks

As a side-effect, the transaction will also pay out the Stability Deposit's [collateral gain](./lib-base.stabilitydeposit.collateralgain.md) and [OPL reward](./lib-base.stabilitydeposit.lqtyreward.md)<!-- -->.

