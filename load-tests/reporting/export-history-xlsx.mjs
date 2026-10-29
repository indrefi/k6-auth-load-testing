import path from 'node:path';
import ExcelJS from 'exceljs';
import { analyzeHistory } from './report-data.mjs';

const resultsDirectory = path.resolve(process.env.RESULTS_ROOT || 'results');
const outputPath = path.resolve(process.env.HISTORY_XLSX_OUTPUT || path.join(resultsDirectory, 'load-test-history.xlsx'));
const runs = await analyzeHistory(resultsDirectory);
const workbook = new ExcelJS.Workbook();
workbook.creator = 'k6 black-box load testing';
workbook.created = new Date();

const runsSheet = workbook.addWorksheet('Test Runs');
runsSheet.columns = [
  { header: 'Run ID', key: 'id', width: 34 }, { header: 'Test Type', key: 'type', width: 18 },
  { header: 'Started UTC', key: 'startedAt', width: 26 }, { header: 'Target', key: 'applicationUrl', width: 36 },
  { header: 'Duration seconds', key: 'durationSeconds', width: 18 }, { header: 'Requests', key: 'totalRequests', width: 14 },
  { header: 'Requests/second', key: 'requestsPerSecond', width: 18 }, { header: 'Maximum VUs', key: 'maxVus', width: 14 },
  { header: 'Average ms', key: 'average', width: 14 }, { header: 'P95 ms', key: 'p95', width: 14 },
  { header: 'P99 ms', key: 'p99', width: 14 }, { header: 'Maximum ms', key: 'maximum', width: 14 },
  { header: 'Error rate', key: 'errorRate', width: 14 }, { header: 'Dropped iterations', key: 'dropped', width: 20 },
  { header: 'Breaking point RPS', key: 'breakingPoint', width: 20 },
];
for (const run of runs) {
  runsSheet.addRow({
    ...run,
    average: run.latency.avg,
    p95: run.latency.p95,
    p99: run.latency.p99,
    maximum: run.latency.max,
    dropped: run.droppedIterations,
    breakingPoint: run.breakingPoint?.rps ?? 'Not reached',
  });
}

const endpointsSheet = workbook.addWorksheet('All Endpoints');
endpointsSheet.columns = [
  { header: 'Run ID', key: 'runId', width: 34 }, { header: 'Test Type', key: 'type', width: 18 },
  { header: 'Request', key: 'name', width: 30 }, { header: 'Authentication', key: 'authType', width: 18 },
  { header: 'Method', key: 'operation', width: 12 }, { header: 'Count', key: 'count', width: 12 },
  { header: 'Average ms', key: 'avg', width: 14 }, { header: 'P90 ms', key: 'p90', width: 14 },
  { header: 'P95 ms', key: 'p95', width: 14 }, { header: 'P99 ms', key: 'p99', width: 14 },
  { header: 'Maximum ms', key: 'max', width: 14 }, { header: 'Error rate', key: 'errorRate', width: 14 },
  { header: 'Status codes', key: 'statuses', width: 28 },
];
for (const run of runs) {
  for (const endpoint of run.endpoints) {
    endpointsSheet.addRow({
      runId: run.id,
      type: run.type,
      ...endpoint,
      statuses: Object.entries(endpoint.statuses).map(([status, count]) => `${status}: ${count}`).join(', '),
    });
  }
}

const timelineSheet = workbook.addWorksheet('Timeline');
timelineSheet.columns = [
  { header: 'Run ID', key: 'runId', width: 34 }, { header: 'Test Type', key: 'type', width: 18 },
  { header: 'Elapsed seconds', key: 'elapsed', width: 18 }, { header: 'Requests/second', key: 'rps', width: 18 },
  { header: 'Average ms', key: 'avg', width: 14 }, { header: 'P95 ms', key: 'p95', width: 14 },
  { header: 'Error rate', key: 'errorRate', width: 14 }, { header: 'VUs', key: 'vus', width: 10 },
  { header: 'Dropped iterations', key: 'dropped', width: 20 },
];
for (const run of runs) {
  for (const point of run.timeline) timelineSheet.addRow({ runId: run.id, type: run.type, ...point });
}

for (const sheet of workbook.worksheets) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173C78' } };
}

await workbook.xlsx.writeFile(outputPath);
console.log(`Historical Excel report written to ${outputPath}`);
