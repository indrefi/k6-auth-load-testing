import { commonOptions, tlsAuthOptions } from '../modules/configuration.js';
import { executeWorkload, setupWorkload, summary } from '../modules/workload.js';

export const options = {
  ...commonOptions({
    executor: 'ramping-arrival-rate', startRate: 5, timeUnit: '1s', preAllocatedVUs: 25, maxVUs: 200,
    stages: [{ target: 25, duration: '1m' }, { target: 25, duration: __ENV.DURATION || '3m' }, { target: 0, duration: '30s' }],
    gracefulStop: '30s',
  }),
  tlsAuth: tlsAuthOptions(),
};
export function setup() { return setupWorkload(); }
export default function () { executeWorkload(); }
export function handleSummary(data) { return summary(data); }

