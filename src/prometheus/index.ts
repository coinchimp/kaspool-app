import { collectDefaultMetrics, Pushgateway , register, Gauge, MetricType } from 'prom-client';
import PQueue from 'p-queue';
import type { RegistryContentType } from 'prom-client';
import Database from '../pool/database';
import Monitoring from '../monitoring';
const queue = new PQueue({ concurrency: 1 });

collectDefaultMetrics();
export { register };

export const minerHashRateGauge = new Gauge({
  name: 'miner_hash_rate_GHps',
  help: 'Hash rate of each miner',
  labelNames: ['miner_id', 'wallet_address']
}) as Gauge & { metricName: string };
minerHashRateGauge.metricName = 'miner_hash_rate_GHps';

export const poolHashRateGauge = new Gauge({
  name: 'pool_hash_rate_GHps',
  help: 'Overall hash rate of the pool',
  labelNames: ['miner_id', 'pool_address']
}) as Gauge & { metricName: string };
poolHashRateGauge.metricName = 'pool_hash_rate_GHps';

export const minerjobSubmissions = new Gauge({
  name: 'miner_job_submissions_1min_count',
  help: 'Job submitted per miner',
  labelNames: ['miner_id', 'wallet_address']
}) as Gauge & { metricName: string };
minerjobSubmissions.metricName = 'miner_job_submissions_1min_count';

export const minerAddedShares = new Gauge({
  name: 'added_miner_shares_1min_count',
  help: 'Added shares per miner',
  labelNames: ['miner_id', 'wallet_address']
}) as Gauge & { metricName: string };
minerAddedShares.metricName = 'added_miner_shares_1min_count';

export const minerInvalidShares = new Gauge({
  name: 'miner_invalid_shares_1min_count',
  help: 'Invalid shares per miner',
  labelNames: ['miner_id', 'wallet_address']
}) as Gauge & { metricName: string };
minerInvalidShares.metricName = 'miner_invalid_shares_1min_count';

export const minerDuplicatedShares = new Gauge({
  name: 'miner_duplicated_shares_1min_count',
  help: 'Duplicated shares per miner',
  labelNames: ['miner_id', 'wallet_address']
}) as Gauge & { metricName: string };
minerDuplicatedShares.metricName = 'miner_duplicated_shares_1min_count';

export const minerIsBlockShare = new Gauge({
  name: 'miner_isblock_shares_1min_count',
  help: 'Is Block shares per miner',
  labelNames: ['miner_id', 'wallet_address']
}) as Gauge & { metricName: string };
minerIsBlockShare.metricName = 'miner_isblock_shares_1min_count';

export const minerStaleShares = new Gauge({
  name: 'miner_stale_shares_1min_count',
  help: 'Stale shares per miner',
  labelNames: ['miner_id', 'wallet_address']
}) as Gauge & { metricName: string };
minerStaleShares.metricName = 'miner_stale_shares_1min_count';

export const minedBlocksGauge = new Gauge({
  name: 'mined_blocks_1min_count',
  help: 'Total number of mined blocks',
  labelNames: ['miner_id', 'pool_address']
}) as Gauge & { metricName: string };
minedBlocksGauge.metricName = 'mined_blocks_1min_count';

export const paidBlocksGauge = new Gauge({
  name: 'paid_blocks_1min_count',
  help: 'Total number of paid blocks',
  labelNames: ['miner_id', 'pool_address']
}) as Gauge & { metricName: string };
paidBlocksGauge.metricName = 'paid_blocks_1min_count';

export const jobsNotFound = new Gauge({
  name: 'jobs_not_found_1min_count',
  help: 'Total jobs not Found for registered template',
  labelNames: ['miner_id', 'pool_address']
}) as Gauge & { metricName: string };
jobsNotFound.metricName = 'jobs_not_found_1min_count';

export const varDiff = new Gauge({
  name: 'var_diff',
  help: 'Show the difficulty per miner over time',
  labelNames: ['miner_id']
}) as Gauge & { metricName: string };
varDiff.metricName = 'var_diff';


export class PushMetrics {
  private pushGateway: Pushgateway<RegistryContentType>;
  private monitoring: Monitoring;
  //private pushGatewayUrl: string;
  private db: Database;

  constructor(pushGatewayUrl: string, db: Database) {
    //this.pushGatewayUrl = pushGatewayUrl;
    this.pushGateway = new Pushgateway<RegistryContentType>(pushGatewayUrl);
    this.monitoring = new Monitoring();
    this.db = db;
    setInterval(() => this.pushMetrics(), 60000); // Push metrics every 1 minute
    this.initializeMetrics(); 

  }

  // async pushMetrics() {
  //   try {
  //     await this.pushGateway.pushAdd({ jobName: 'mining_metrics' });
  //     this.monitoring.log(`PushMetrics: Metrics pushed to Pushgateway`);
  //   } catch (err) {
  //     console.error(`[${new Date().toISOString()}] PushMetrics: ERROR: Error pushing metrics to Pushgateway:`, err);
  //   }
  // }

  async pushMetrics() {
    try {
      await this.pushGateway.pushAdd({ jobName: 'mining_metrics' });
      this.monitoring.log(`PushMetrics: Metrics pushed to Pushgateway`);

      
      const metrics = await register.getMetricsAsJSON();

      for (const metric of metrics) {
        if (metric.type === MetricType.Gauge) {  
          for (const value of metric.values) {
            const { labels, value: metricValue } = value;
            const minerId = (labels.miner_id || 'unknown_miner') as string;
            const walletAddress = (labels.wallet_address || labels.pool_address || 'unknown_wallet') as string;
            await this.db.saveMetric(metric.name, minerId, walletAddress, metricValue);
          }
        }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] PushMetrics: ERROR: Error pushing metrics to Pushgateway:`, err);
    }
  }

  updateGaugeValue(gauge: Gauge, labels: string[], value: number) {
    queue.add(() => gauge.labels(...labels).set(value));
  }
  updateGaugeInc(gauge: Gauge, labels: string[]) {
      queue.add(() => gauge.labels(...labels).inc(1));  

  }
  async initializeMetrics() {
    // Retrieve minerIds and walletAddresses from the database
    const { minerIds, walletAddresses } = await this.db.getMinerIdsAndWallets();
  
    const gauges = [
      minerHashRateGauge,
      poolHashRateGauge,
      minerjobSubmissions,
      minerAddedShares,
      minerInvalidShares,
      minerDuplicatedShares,
      minerIsBlockShare,
      minerStaleShares,
      minedBlocksGauge,
      paidBlocksGauge,
      jobsNotFound,
      varDiff,
    ];
  
    for (const gauge of gauges) {
      for (const minerId of minerIds) {
        for (const walletAddress of walletAddresses) {
          await this.db.initializeGauge(gauge, minerId, walletAddress);
        }
      }
    }
  }
  
}


