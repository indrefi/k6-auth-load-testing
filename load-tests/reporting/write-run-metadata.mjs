import fs from 'node:fs';
import path from 'node:path';

const configPath = path.resolve(process.env.K6_CONFIG_FILE || 'config.json');
const runDirectory = path.resolve(process.env.RUN_DIRECTORY || 'results/current');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const metadata = {
  id: process.env.TEST_ID || path.basename(runDirectory),
  type: process.env.TEST_TYPE || 'custom',
  startedAt: process.env.TEST_STARTED_AT || new Date().toISOString(),
  applicationUrl: config.applicationUrl,
  p95LimitMilliseconds: Number(config.testSettings?.p95LimitMilliseconds ?? 500),
  errorRateLimit: Number(config.testSettings?.errorRateLimit ?? 0.01),
  enabledRequests: Object.entries(config.requests || {}).flatMap(([requestType, requests]) =>
    requests.filter((request) => request.enabled === true).map((request) => ({ requestType, name: request.name, path: request.path }))),
};

fs.mkdirSync(runDirectory, { recursive: true });
fs.writeFileSync(path.join(runDirectory, 'run-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
