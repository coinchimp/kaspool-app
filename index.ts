import { RpcClient, Encoding, Resolver } from "./wasm/kaspa";
import Treasury from "./src/treasury";
import Templates from "./src/stratum/templates";
import Stratum from "./src/stratum";
import Pool from "./src/pool";
import config from "./config/config.json";
import dotenv from 'dotenv';
import Monitoring from './src/monitoring'
import { PushMetrics } from "./src/prometheus";
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export let DEBUG = 0
if (process.env.DEBUG == "1") {
  DEBUG = 1;
}

// Send config.json to API server
async function sendConfig() {
  if (DEBUG) monitoring.debug(`Main: Trying to send config to kaspool-monitor`);
  try {
    const configPath = path.resolve('./config/config.json');
    const configData = fs.readFileSync(configPath, 'utf-8');

    const response = await axios.post('http://kaspool-monitor:9302/postconfig', {
      config: JSON.parse(configData)
    });

    monitoring.log(`Main: Config sent to API server. Response status: ${response.status}`);
  } catch (error) {
    monitoring.error(`Main: Error sending config: ${error}`);
  }
}

const monitoring = new Monitoring();
monitoring.log(`Main: Starting kaspool App`)

// Check if config.json file exists and has minimal required elements
const configPath = path.resolve('./config/config.json');
if (!fs.existsSync(configPath)) {
  throw new Error('config.json file is missing.');
}

const configData = fs.readFileSync(configPath, 'utf-8');
const requiredConfigKeys = ['network', 'treasury', 'stratum'];
const parsedConfig = JSON.parse(configData);

for (const key of requiredConfigKeys) {
  if (!(key in parsedConfig)) {
    throw new Error(`Missing required key '${key}' in config.json.`);
  }
}
// Check if .env file exists and has minimal required environment variables
const envPath = path.resolve('./.env');
if (!fs.existsSync(envPath)) {
  throw new Error('.env file is missing.');
}

dotenv.config();

const requiredEnvVars = ['TREASURY_PRIVATE_KEY', 'PUSHGATEWAY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Environment variable ${envVar} is not set.`);
  }
}


monitoring.log(`Main: network: ${config.network}`);

const resolverOptions = config.node && config.node.length > 0 ? { urls: config.node } : {};

const rpc = new RpcClient({
  resolver: new Resolver(resolverOptions),
  encoding: Encoding.Borsh,
  networkId: config.network,
});

await rpc.connect();

monitoring.log(`Main: RPC connection started`)

const serverInfo = await rpc.getServerInfo();
if (!serverInfo.isSynced || !serverInfo.hasUtxoIndex) throw Error('Provided node is either not synchronized or lacks the UTXO index.');

const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;
if (!treasuryPrivateKey) {
  throw new Error('Environment variable TREASURY_PRIVATE_KEY is not set.');
}


const kaspoolPshGw = process.env.PUSHGATEWAY;
if (!kaspoolPshGw) {
  throw new Error('Environment variable PUSHGATEWAY is not set.');
}
export const metrics = new PushMetrics(kaspoolPshGw);

sendConfig();

const treasury = new Treasury(rpc, serverInfo.networkId, treasuryPrivateKey, config.treasury.fee);
const templates = new Templates(rpc, treasury.address, config.stratum.templates.cacheSize);

const stratum = new Stratum(templates, config.stratum.port, config.stratum.difficulty, kaspoolPshGw, treasury.address, config.stratum.sharesPerMinute);
const pool = new Pool(treasury, stratum, stratum.sharesManager);




