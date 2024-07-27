import type { Socket } from 'bun';
import { calculateTarget } from "../../wasm/kaspa";
import { Pushgateway, Gauge } from 'prom-client';
import type { RegistryContentType } from 'prom-client';
import { stringifyHashrate, getAverageHashrateGHs } from './utils';

export interface WorkerStats {
  blocksFound: number;
  sharesFound: number;
  sharesDiff: number;
  staleShares: number;
  invalidShares: number;
  workerName: string;
  startTime: number;
  lastShare: number;
  varDiffStartTime: number;
  varDiffSharesFound: number;
  varDiffWindow: number;
  minDiff: number;
}

type MinerData = {
  sockets: Set<Socket<any>>,
  workerStats: WorkerStats
};

type Contribution = {
  address: string;
  difficulty: number;
  timestamp: number;
  minerId: string;
};

export const sharesGauge = new Gauge({
  name: 'shares',
  help: 'Total number of shares',
  labelNames: ['pool_address'],
});

export class SharesManager {
  private contributions: Map<bigint, Contribution> = new Map();
  private miners: Map<string, MinerData> = new Map();
  private minerHashRateGauge: Gauge<string>;
  private poolHashRateGauge: Gauge<string>;
  private poolAddress: string;
  private pushGateway: Pushgateway<RegistryContentType>;

  constructor(poolAddress: string, pushGatewayUrl: string) {
    this.poolAddress = poolAddress;

    this.minerHashRateGauge = new Gauge({
      name: 'miner_hash_rate',
      help: 'Hash rate of individual miners',
      labelNames: ['wallet_address'],
    });

    this.poolHashRateGauge = new Gauge({
      name: 'pool_hash_rate',
      help: 'Overall hash rate of the pool',
      labelNames: ['pool_address'],
    });

    this.pushGateway = new Pushgateway<RegistryContentType>(pushGatewayUrl);
    this.startHashRateLogging(60000);
    this.startStatsThread(); // Start the stats logging thread
  }

  getOrCreateWorkerStats(workerName: string, minerData: MinerData): WorkerStats {
    let workerStats = minerData.workerStats;
    if (!workerStats) {
      workerStats = {
        blocksFound: 0,
        sharesFound: 0,
        sharesDiff: 0,
        staleShares: 0,
        invalidShares: 0,
        workerName,
        startTime: Date.now(),
        lastShare: Date.now(),
        varDiffStartTime: Date.now(),
        varDiffSharesFound: 0,
        varDiffWindow: 0,
        minDiff: 1 // Set to initial difficulty
      };
      minerData.workerStats = workerStats;
      console.log(`[${new Date().toISOString()}] SharesManager: Created new worker stats for ${workerName}`);
    }
    return workerStats;
  }

  async pushMetrics() {
    try {
      await this.pushGateway.pushAdd({ jobName: 'mining_metrics' });
      console.log(`[${new Date().toISOString()}] SharesManager: Metrics pushed to Pushgateway`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] SharesManager: ERROR: Error pushing metrics to Pushgateway:`, err);
    }
  }

  startHashRateLogging(interval: number) {
    setInterval(() => {
      this.calcHashRates();
      this.pushMetrics();
    }, interval);
  }

  async addShare(minerId: string, address: string, hash: string, difficulty: number, nonce: bigint, templates: any) {
    sharesGauge.labels(address).inc();
    const timestamp = Date.now();
    if (this.contributions.has(nonce)) throw Error('Duplicate share');
    const state = templates.getPoW(hash);
    if (!state) throw Error('Stale header');
    const [isBlock, target] = state.checkWork(nonce);
    if (isBlock) await templates.submit(hash, nonce);
    const validity = target <= calculateTarget(difficulty);
    if (!validity) throw Error('Invalid share');
    this.contributions.set(nonce, { address, difficulty, timestamp, minerId });

    let minerData = this.miners.get(address);
    if (!minerData) {
      minerData = {
        sockets: new Set(),
        workerStats: {
          blocksFound: 0,
          sharesFound: 0,
          sharesDiff: 0,
          staleShares: 0,
          invalidShares: 0,
          workerName: minerId,
          startTime: Date.now(),
          lastShare: Date.now(),
          varDiffStartTime: Date.now(),
          varDiffSharesFound: 0,
          varDiffWindow: 0,
          minDiff: difficulty
        }
      };
      this.miners.set(address, minerData);
    }

    minerData.workerStats.sharesFound++;
    minerData.workerStats.varDiffSharesFound++;
    minerData.workerStats.lastShare = timestamp;
    minerData.workerStats.minDiff = difficulty;

    console.log(`[${new Date().toISOString()}] SharesManager: Share added for ${minerId} - Address: ${address}`);
  }

  startStatsThread() {
    const start = Date.now();

    setInterval(() => {
      let str = "\n===============================================================================\n";
      str += "  worker name   |  avg hashrate  |   acc/stl/inv  |    blocks    |    uptime   \n";
      str += "-------------------------------------------------------------------------------\n";
      const lines: string[] = [];
      let totalRate = 0;

      this.miners.forEach((minerData, address) => {
        const stats = minerData.workerStats;
        const rate = getAverageHashrateGHs(stats);
        totalRate += rate;
        const rateStr = stringifyHashrate(rate);
        const ratioStr = `${stats.sharesFound}/${stats.staleShares}/${stats.invalidShares}`;
        lines.push(
          ` ${stats.workerName.padEnd(15)}| ${rateStr.padEnd(14)} | ${ratioStr.padEnd(14)} | ${stats.blocksFound.toString().padEnd(12)} | ${(Date.now() - stats.startTime) / 1000}s`
        );
      });

      lines.sort();
      str += lines.join("\n");
      const rateStr = stringifyHashrate(totalRate);
      const overallStats = Array.from(this.miners.values()).reduce((acc, minerData) => {
        const stats = minerData.workerStats;
        acc.sharesFound += stats.sharesFound;
        acc.staleShares += stats.staleShares;
        acc.invalidShares += stats.invalidShares;
        return acc;
      }, { sharesFound: 0, staleShares: 0, invalidShares: 0 });
      const ratioStr = `${overallStats.sharesFound}/${overallStats.staleShares}/${overallStats.invalidShares}`;
      str += "\n-------------------------------------------------------------------------------\n";
      str += `                | ${rateStr.padEnd(14)} | ${ratioStr.padEnd(14)} | ${Array.from(this.miners.values()).reduce((acc, minerData) => acc + minerData.workerStats.blocksFound, 0).toString().padEnd(12)} | ${(Date.now() - start) / 1000}s`;
      str += "\n==========================================================\n";
      console.log(str);
    }, 600000); // 10 minutes
  }

  calcHashRates() {
    let totalHashRate = 0;
    this.miners.forEach((minerData, address) => {
      const timeDifference = (Date.now() - minerData.workerStats.startTime) / 1000; // Convert to seconds
      const workerStats = minerData.workerStats;
      const workerHashRate = (workerStats.minDiff * workerStats.varDiffSharesFound) / timeDifference;
      this.minerHashRateGauge.labels(address).set(workerHashRate);
      totalHashRate += workerHashRate;
      console.log(`[${new Date().toISOString()}] SharesManager: Worker ${workerStats.workerName} stats - Time: ${timeDifference}s, HashRate: ${workerHashRate}H/s, SharesFound: ${workerStats.sharesFound}, StaleShares: ${workerStats.staleShares}, InvalidShares: ${workerStats.invalidShares}`);
    });
    this.poolHashRateGauge.labels(this.poolAddress).set(totalHashRate);
    console.log(`[${new Date().toISOString()}] SharesManager: Total pool hash rate updated to ${totalHashRate}H/s`);
  }

  getMiners() {
    return this.miners;
  }

  resetContributions() {
    this.contributions.clear();
  }

  dumpContributions() {
    const contributions = Array.from(this.contributions.values());
    this.contributions.clear();
    return contributions;
  }
}
