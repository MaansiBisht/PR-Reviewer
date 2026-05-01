import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:5174';
const OUT_DIR = '/tmp/pr-reviewer-frames';
const GIF_OUT = '/Users/utopian/Documents/projects/portfolio-app/pr-reviewer-demo.gif';
const WIDTH = 1280;
const HEIGHT = 800;

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: WIDTH, height: HEIGHT });

let frame = 0;

async function shot(label, holdMs = 2500) {
  const file = join(OUT_DIR, `frame-${String(frame).padStart(3, '0')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  captured: ${file}`);

  // Duplicate frame to simulate hold duration (1 frame = ~100ms in output GIF)
  const copies = Math.round(holdMs / 100);
  for (let i = 1; i < copies; i++) {
    const dup = join(OUT_DIR, `frame-${String(frame + i).padStart(3, '0')}-${label}-dup.png`);
    execSync(`cp "${file}" "${dup}"`);
  }
  frame += copies;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

console.log('Launching browser...');

// ── 0. Switch to dark mode ──
console.log('\n[0] Enabling dark mode');
await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
await sleep(500);
await page.getByText('Dark', { exact: true }).click();
await sleep(400);

// ── 1. Dashboard ──
console.log('\n[1/5] Dashboard');
await shot('dashboard', 3000);

// ── 2. Fill in the new review form ──
console.log('\n[2/5] New Review form');
const repoInput = page.locator('input[placeholder*="repo"], input[placeholder*="path"], input[type="text"]').first();
if (await repoInput.isVisible().catch(() => false)) {
  await repoInput.click();
  await repoInput.fill('/Users/utopian/CascadeProjects/PR-Reviewer');
  await sleep(300);
  await shot('form-filled', 2500);
}

// ── 3. History page ──
console.log('\n[3/5] History page');
await page.goto(`${BASE_URL}/history`, { waitUntil: 'networkidle' });
await sleep(600);
await shot('history', 2500);

// ── 4. Analytics page ──
console.log('\n[4/5] Analytics page');
await page.goto(`${BASE_URL}/analytics`, { waitUntil: 'networkidle' });
await sleep(800);
await shot('analytics', 3000);

// ── 5. Settings page ──
console.log('\n[5/5] Settings page');
await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
await sleep(600);
await shot('settings', 2500);

// ── Loop back to dashboard ──
await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
await sleep(400);
await shot('dashboard-end', 1500);

await browser.close();

// ── Build GIF ──
console.log('\nAssembling GIF...');
const gifDir = GIF_OUT.split('/').slice(0, -1).join('/');
mkdirSync(gifDir, { recursive: true });

execSync(
  `convert -delay 10 -loop 0 "${OUT_DIR}/frame-*.png" ` +
  `-layers optimize ` +
  `-resize ${WIDTH / 2}x${HEIGHT / 2} ` +
  `"${GIF_OUT}"`,
  { stdio: 'inherit' }
);

console.log(`\nGIF saved to: ${GIF_OUT}`);
