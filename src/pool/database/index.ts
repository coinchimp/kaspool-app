import { Pool } from 'pg';

type Miner = {
  balance: bigint;
};

type MinerBalanceRow = {
  miner_id: string;
  wallet: string;
  balance: string;
};

const defaultMiner: Miner = {
  balance: 0n,
};

export default class Database {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString: connectionString,
    });
  }

  async addBalance(minerId: string, wallet: string, balance: bigint) {
    const client = await this.pool.connect();
    const key = `${minerId}_${wallet}`;

    try {
      await client.query('BEGIN');
      
      // Update miners_balance table
      const res = await client.query('SELECT balance FROM miners_balance WHERE id = $1', [key]);
      let minerBalance = res.rows[0] ? BigInt(res.rows[0].balance) : 0n;
      minerBalance += balance;

      await client.query('INSERT INTO miners_balance (id, miner_id, wallet, balance) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance', [
        key,
        minerId,
        wallet,
        minerBalance,
      ]);

      // Update wallet_total table
      const resTotal = await client.query('SELECT total FROM wallet_total WHERE address = $1', [wallet]);
      let walletTotal = resTotal.rows[0] ? BigInt(resTotal.rows[0].total) : 0n;
      walletTotal += balance;

      await client.query('INSERT INTO wallet_total (address, total) VALUES ($1, $2) ON CONFLICT (address) DO UPDATE SET total = EXCLUDED.total', [
        wallet,
        walletTotal,
      ]);

      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async resetBalanceByAddress(wallet: string) {
    const client = await this.pool.connect();
    try {
      await client.query('UPDATE miners_balance SET balance = $1 WHERE wallet = $2', [0n, wallet]);
    } finally {
      client.release();
    }
  }

  async getAllBalances() {
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT miner_id, wallet, balance FROM miners_balance');
      return res.rows.map((row: MinerBalanceRow) => ({
        minerId: row.miner_id,
        address: row.wallet,
        balance: BigInt(row.balance)
      }));
    } finally {
      client.release();
    }
  }

  async getUser(minerId: string, wallet: string) {
    const client = await this.pool.connect();
    const key = `${minerId}_${wallet}`;
    try {
      const res = await client.query('SELECT balance FROM miners_balance WHERE id = $1', [key]);
      if (res.rows.length === 0) {
        return { balance: 0n };
      }
      return { balance: BigInt(res.rows[0].balance) };
    } finally {
      client.release();
    }
  }

  async getPaymentsByWallet(wallet: string) {
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT * FROM payments WHERE $1 = ANY(wallet_address) ORDER BY timestamp DESC', [wallet]);
      return res.rows;
    } finally {
      client.release();
    }
  }
}