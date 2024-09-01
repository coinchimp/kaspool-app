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

dotenv.config();

const requiredEnvVars = ['TREASURY_PRIVATE_KEY', 'PUSHGATEWAY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Environment variable ${envVar} is not set.`);
  }
}


monitoring.log(`Main: network: ${config.network}`);

let rpc;

if (config.node && config.node.length > 0) {
  rpc = new RpcClient({
    resolver: new Resolver({ urls: config.node }),
    encoding: Encoding.Borsh,
    networkId: config.network,
  });
  monitoring.debug(`Main: using node configuration for RPC connection`);
} else {
  rpc = new RpcClient({
    resolver: new Resolver(),
    encoding: Encoding.Borsh,
    networkId: config.network,
  });
  monitoring.debug(`Main: using public Resolver for RPC connection`);
}

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


sendConfig();

const treasury = new Treasury(rpc, serverInfo.networkId, treasuryPrivateKey, config.treasury.fee);
const templates = new Templates(rpc, treasury.address, config.stratum.templates.cacheSize);

const stratum = new Stratum(templates, config.stratum.port, config.stratum.difficulty, kaspoolPshGw, treasury.address, config.stratum.sharesPerMinute);
const pool = new Pool(treasury, stratum, stratum.sharesManager);

//export const metrics = new PushMetrics(kaspoolPshGw, pool.database);



