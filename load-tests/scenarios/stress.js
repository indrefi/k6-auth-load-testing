import { commonOptions, tlsAuthOptions } from '../modules/configuration.js';
import { executeWorkload, setupWorkload, summary } from '../modules/workload.js';

export const options = {
  ...commonOptions({
    executor: 'ramping-arrival-rate', startRate: 10, timeUnit: '1s', preAllocatedVUs: 100, maxVUs: 1000,
    stages: [
      { target: 50, duration: '1m' }, { target: 100, duration: '2m' },
      { target: 200, duration: __ENV.DURATION || '3m' }, { target: 0, duration: '1m' },
    ], gracefulStop: '30s',
  }),
  tlsAuth: tlsAuthOptions(),
};
export function setup() { return setupWorkload(); }
export default function () { executeWorkload(); }
export function handleSummary(data) { return summary(data); }

