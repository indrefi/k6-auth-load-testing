import { commonOptions, tlsAuthOptions } from '../modules/configuration.js';
import { executeWorkload, setupWorkload, summary } from '../modules/workload.js';

export const options = {
  ...commonOptions({
    executor: 'ramping-arrival-rate', startRate: Number(__ENV.START_RATE || 10), timeUnit: '1s',
    preAllocatedVUs: 200, maxVUs: Number(__ENV.MAX_VUS || 2000),
    stages: [
      { target: Number(__ENV.MID_RATE || 300), duration: '3m' },
      { target: Number(__ENV.MAX_RATE || 1000), duration: __ENV.DURATION || '6m' },
      { target: 0, duration: '1m' },
    ], gracefulStop: '30s',
  }),
  tlsAuth: tlsAuthOptions(),
};
export function setup() { return setupWorkload(); }
export default function () { executeWorkload(); }
export function handleSummary(data) { return summary(data); }

