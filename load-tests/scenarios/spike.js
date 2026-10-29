import { commonOptions, tlsAuthOptions } from '../modules/configuration.js';
import { executeWorkload, setupWorkload, summary } from '../modules/workload.js';

export const options = {
  ...commonOptions({
    executor: 'ramping-vus', startVUs: 5,
    stages: [
      { target: 20, duration: '30s' }, { target: 20, duration: '1m' },
      { target: Number(__ENV.SPIKE_VUS || 500), duration: '10s' },
      { target: Number(__ENV.SPIKE_VUS || 500), duration: __ENV.DURATION || '1m' },
      { target: 20, duration: '10s' }, { target: 0, duration: '30s' },
    ], gracefulRampDown: '30s',
  }),
  tlsAuth: tlsAuthOptions(),
};
export function setup() { return setupWorkload(); }
export default function () { executeWorkload(); }
export function handleSummary(data) { return summary(data); }

