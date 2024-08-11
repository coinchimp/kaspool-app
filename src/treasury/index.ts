import { EventEmitter } from 'events'
import Monitoring from '../monitoring';
import { PrivateKey, UtxoProcessor, UtxoContext, type RpcClient } from "../../wasm/kaspa"

export default class Treasury extends EventEmitter {
  privateKey: PrivateKey
  address: string
  processor: UtxoProcessor
  context: UtxoContext
  fee: number
  private monitoring: Monitoring;
  private matureEventCounter = 0;
  private totalReward = 0n;
  
  constructor (rpc: RpcClient, networkId: string, privateKey: string, fee: number) {
    super()
    
    this.privateKey = new PrivateKey(privateKey)
    this.address = (this.privateKey.toAddress(networkId)).toString()
    this.processor = new UtxoProcessor({ rpc, networkId })
    this.context = new UtxoContext({ processor: this.processor })
    this.fee = fee
    this.monitoring = new Monitoring();
    this.monitoring.log(`Treasury: Pool Wallet Address: " ${this.address}`)

    this.registerProcessor()
  }
  

  private registerProcessor () {
    this.processor.addEventListener("utxo-proc-start", async () => {
      await this.context.clear()
      await this.context.trackAddresses([ this.address ])
    })

    this.processor.addEventListener('maturity', (e) => {
      // @ts-ignore
      const reward = e.data.value
      this.monitoring.log(`Treasury: Rewards to distribute on this coinbase cycle:  ${reward}.`);
    
      // Increment the counter and accumulate the rewards
      this.matureEventCounter++;
      this.totalReward += reward;
    
      // Check if 10 mature events have occurred
      if (this.matureEventCounter === 10) {
        const poolFee = (this.totalReward * BigInt(this.fee * 100)) / 10000n
        this.monitoring.log(`Treasury: Pool fees to distribute on the coinbase cycle: ${poolFee}.`);
    
        this.emit('coinbase', this.totalReward - poolFee, poolFee) 
    
        // Reset the counter and totalReward
        this.matureEventCounter = 0;
        this.totalReward = 0n;
      }
    })

    this.processor.start()
  }
}
