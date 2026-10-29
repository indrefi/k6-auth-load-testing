import fs from 'node:fs';
import path from 'node:path';
import { analyzeHistory } from './report-data.mjs';

const resultsDirectory = path.resolve(process.env.RESULTS_ROOT || 'results');
const outputPath = path.resolve(process.env.DASHBOARD_OUTPUT || path.join(resultsDirectory, 'dashboard.html'));
const dataPath = path.resolve(process.env.DASHBOARD_DATA_OUTPUT || path.join(resultsDirectory, 'dashboard-data.json'));
const templatePath = new URL('./dashboard-template.html', import.meta.url);
const runs = await analyzeHistory(resultsDirectory);
const data = { generatedAt: new Date().toISOString(), runs };
const defaultRunId = process.env.DEFAULT_RUN_ID || runs.at(-1)?.id || '';
const serialized = JSON.stringify(data).replaceAll('</script', '<\\/script');
const template = fs.readFileSync(templatePath, 'utf8');
const renderDashboard = (selectedRunId) => template
  .replace('__DASHBOARD_DATA__', serialized)
  .replace('__DEFAULT_RUN_ID__', JSON.stringify(selectedRunId));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, renderDashboard(defaultRunId));
fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Historical dashboard written to ${outputPath}`);

for (const run of runs) {
  const runOutput = path.join(resultsDirectory, run.resultDirectory, 'dashboard.html');
  fs.writeFileSync(runOutput, renderDashboard(run.id));
  console.log(`Run dashboard written to ${runOutput}`);
}

if (process.env.RUN_DASHBOARD_OUTPUT) {
  const runOutput = path.resolve(process.env.RUN_DASHBOARD_OUTPUT);
  fs.mkdirSync(path.dirname(runOutput), { recursive: true });
  fs.writeFileSync(runOutput, renderDashboard(defaultRunId));
  console.log(`Run dashboard written to ${runOutput}`);
}
