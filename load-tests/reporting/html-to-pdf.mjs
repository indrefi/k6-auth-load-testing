import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const htmlPath = path.resolve(process.env.HTML_REPORT || 'results/dashboard.html');
const pdfPath = path.resolve(process.env.PDF_REPORT || 'results/load-test-history.pdf');

if (!fs.existsSync(htmlPath)) {
  throw new Error(`HTML dashboard was not found: ${htmlPath}`);
}

let browser;
try {
  const launchOptions = [{ headless: true }, { headless: true, channel: 'chrome' }, { headless: true, channel: 'msedge' }];
  let launchError;
  for (const options of launchOptions) {
    try {
      browser = await chromium.launch(options);
      break;
    } catch (error) {
      launchError = error;
    }
  }
  if (!browser) throw launchError;
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'screen' });
  await page.addStyleTag({ content: `
    section > div > div > div,
    table,
    .uplot {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .panel {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    h2, h3, h4 {
      break-after: avoid !important;
      page-break-after: avoid !important;
    }
    .panel.full { break-before: auto !important; }
    .run-actions { display: none !important; }
    .table-wrap { overflow: visible !important; }
    table { font-size: 11px !important; }
    th, td { padding: 6px 5px !important; }
    footer { break-before: avoid !important; page-break-before: avoid !important; }
  ` });
  await page.pdf({ path: pdfPath, format: 'A4', landscape: true, printBackground: true, scale: 0.75, margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' } });
  console.log(`PDF report written to ${pdfPath}`);
} catch (error) {
  console.error('PDF export requires a Playwright browser. Run: npx playwright install chromium');
  throw error;
} finally {
  await browser?.close();
}

