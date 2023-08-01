//import { InjectedConnector } from './Injected'
import { InjectedConnector } from '@web3-react/injected-connector'
import { NetworkConnector } from './Network'

const POLLING_INTERVAL = 10000

export const injected = new InjectedConnector({
  supportedChainIds: [65100000]
})

export const network = new NetworkConnector({
  urls: { 65100000: "https://rpc1.piccadilly.autonity.org/"  }, //TODO: Use a env variable
  pollingInterval: POLLING_INTERVAL
})
