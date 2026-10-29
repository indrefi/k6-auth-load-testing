import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const reportingDirectory = path.dirname(fileURLToPath(import.meta.url));
const loadTestsDirectory = path.dirname(reportingDirectory);
const resultsDirectory = path.resolve(process.env.RESULTS_ROOT || path.join(loadTestsDirectory, 'results'));

function runScript(name, environment = {}) {
  const script = path.join(reportingDirectory, name);
  const result = spawnSync(process.execPath, [script], {
    cwd: loadTestsDirectory,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name} exited with code ${result.status}.`);
}

runScript('generate-dashboard.mjs', { RESULTS_ROOT: resultsDirectory });

const runDirectories = fs.readdirSync(resultsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(resultsDirectory, entry.name, 'raw.json')))
  .map((entry) => path.join(resultsDirectory, entry.name))
  .sort();

for (const runDirectory of runDirectories) {
  const metadataPath = path.join(runDirectory, 'run-metadata.json');
  const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : {};
  runScript('export-xlsx.mjs', {
    K6_RAW_RESULTS: path.join(runDirectory, 'raw.json'),
    K6_SUMMARY: path.join(runDirectory, 'end-summary.json'),
    XLSX_OUTPUT: path.join(runDirectory, 'load-test-results.xlsx'),
    P95_LIMIT_MS: String(metadata.p95LimitMilliseconds ?? 500),
    ERROR_RATE_LIMIT: String(metadata.errorRateLimit ?? 0.01),
  });
}

runScript('export-history-xlsx.mjs', {
  RESULTS_ROOT: resultsDirectory,
  HISTORY_XLSX_OUTPUT: path.join(resultsDirectory, 'load-test-history.xlsx'),
});

const pdfFailures = [];
for (const runDirectory of runDirectories) {
  try {
    runScript('html-to-pdf.mjs', {
      HTML_REPORT: path.join(runDirectory, 'dashboard.html'),
      PDF_REPORT: path.join(runDirectory, 'load-test-report.pdf'),
    });
  } catch (error) {
    pdfFailures.push(`${path.basename(runDirectory)}: ${error.message}`);
  }
}
try {
  runScript('html-to-pdf.mjs', {
    HTML_REPORT: path.join(resultsDirectory, 'dashboard.html'),
    PDF_REPORT: path.join(resultsDirectory, 'load-test-history.pdf'),
  });
} catch (error) {
  pdfFailures.push(`history: ${error.message}`);
}

if (pdfFailures.length) {
  throw new Error(`XLSX files were generated, but these PDF exports failed:\n${pdfFailures.join('\n')}`);
}

console.log(`Generated XLSX and PDF reports for ${runDirectories.length} saved run(s).`);
