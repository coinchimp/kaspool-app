import { Client } from 'pg';
import { Gauge } from 'prom-client';
import {
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
  jobsNotFound
} from '../../prometheus/index';

type Miner = {
  balance: bigint;
}; 

const gaugeNames = new Map<Gauge<string>, string>([
  [minerHashRateGauge, 'miner_hash_rate_GHps'],
  [poolHashRateGauge, 'pool_hash_rate_GHps'],
  [minerjobSubmissions, 'miner_job_submissions_1min_count'],
  [minerAddedShares, 'added_miner_shares_1min_count'],
  [minerInvalidShares, 'miner_invalid_shares_1min_count'],
  [minerDuplicatedShares, 'miner_duplicated_shares_1min_count'],
  [minerIsBlockShare, 'miner_isblock_shares_1min_count'],
  [minerStaleShares, 'miner_stale_shares_1min_count'],
  [minedBlocksGauge, 'mined_blocks_1min_count'],
  [paidBlocksGauge, 'paid_blocks_1min_count'],
  [jobsNotFound, 'jobs_not_found_1min_count'],
]);

type MinerBalanceRow = {
  miner_id: string;
  wallet: string;
  balance: string;
};

const defaultMiner: Miner = {
  balance: 0n,
};

export default class Database {
  client: Client;

  constructor(connectionString: string) {
    this.client = new Client({
      connectionString: connectionString,
    });
    this.client.connect();
  }

  async addBalance(minerId: string, wallet: string, balance: bigint) {
    const key = `${minerId}_${wallet}`;
    
    await this.client.query('BEGIN');
    try {
      // Update miners_balance table
      const res = await this.client.query('SELECT balance FROM miners_balance WHERE id = $1', [key]);
      let minerBalance = res.rows[0] ? BigInt(res.rows[0].balance) : 0n;
      minerBalance += balance;
  
      await this.client.query('INSERT INTO miners_balance (id, miner_id, wallet, balance) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance', [
        key,
        minerId,
        wallet,
        minerBalance,
      ]);
  
      // Update wallet_total table
      const resTotal = await this.client.query('SELECT total FROM wallet_total WHERE address = $1', [wallet]);
      let walletTotal = resTotal.rows[0] ? BigInt(resTotal.rows[0].total) : 0n;
      walletTotal += balance;
  
      await this.client.query('INSERT INTO wallet_total (address, total) VALUES ($1, $2) ON CONFLICT (address) DO UPDATE SET total = EXCLUDED.total', [
        wallet,
        walletTotal,
      ]);
  
      await this.client.query('COMMIT');
      return true;
    } catch (e) {
      await this.client.query('ROLLBACK');
      throw e;
    }
  }
  

  async resetBalanceByAddress(wallet: string) {
    await this.client.query('UPDATE miners_balance SET balance = $1 WHERE wallet = $2', [0n, wallet]);
  }
  
  async getAllBalances() {
    const res = await this.client.query('SELECT miner_id, wallet, balance FROM miners_balance');
    return res.rows.map((row: MinerBalanceRow) => ({
      minerId: row.miner_id,
      address: row.wallet,
      balance: BigInt(row.balance)
    }));
  }

  async getUser(minerId: string, wallet: string) {
    const key = `${minerId}_${wallet}`;
    const res = await this.client.query('SELECT balance FROM miners_balance WHERE id = $1', [key]);
    if (res.rows.length === 0) {
      return { balance: 0n };
    }
    return { balance: BigInt(res.rows[0].balance) };
  }

  async saveMetric(metricName: string, minerId: string, walletAddress: string, value: number) {
    await this.client.query(
      'INSERT INTO last_metrics (metric_name, miner_id, wallet_address, value) VALUES ($1, $2, $3, $4)',
      [metricName, minerId, walletAddress, value]
    );
  }

  async getLastMetric(metricName: string, minerId: string, walletAddress: string): Promise<number | null> {
    const res = await this.client.query(
      'SELECT value FROM last_metrics WHERE metric_name = $1 AND miner_id = $2 AND wallet_address = $3 ORDER BY timestamp DESC LIMIT 1',
      [metricName, minerId, walletAddress]
    );
    return res.rows.length > 0 ? parseFloat(res.rows[0].value) : null;
  }

  async getMinerIdsAndWallets() {
    const res = await this.client.query('SELECT DISTINCT miner_id, wallet FROM miners_balance');
  
    const minerIds = res.rows.map((row: MinerBalanceRow) => row.miner_id);
    const walletAddresses = res.rows.map((row: MinerBalanceRow) => row.wallet);
  
    return { minerIds, walletAddresses };
  }

  async initializeGauge(gauge: Gauge<string>, minerId: string, walletAddress: string) {
    const metricName = gaugeNames.get(gauge);
    if (!metricName) throw new Error('Metric name not found for the gauge');
    const lastValue = await this.getLastMetric(metricName, minerId, walletAddress);
    gauge.labels(minerId, walletAddress).set(lastValue !== null ? lastValue : 0);
  }
}
