import { commonOptions, tlsAuthOptions } from '../modules/configuration.js';
import { executeWorkload, setupWorkload, summary } from '../modules/workload.js';

export const options = {
  ...commonOptions({
    executor: 'constant-arrival-rate', rate: Number(__ENV.RATE || 25), timeUnit: '1s',
    duration: __ENV.DURATION || '7m', preAllocatedVUs: 50, maxVUs: 500, gracefulStop: '1m',
  }),
  tlsAuth: tlsAuthOptions(),
};
export function setup() { return setupWorkload(); }
export default function () { executeWorkload(); }
export function handleSummary(data) { return summary(data); }

