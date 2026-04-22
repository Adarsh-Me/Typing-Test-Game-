import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, "artifacts", "playtest");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function activeWord(page) {
  const text = await page.locator(".word-active").innerText();
  return text.replace(/\s+/g, "");
}

async function typeCorrectWords(page, count) {
  for (let i = 0; i < count; i += 1) {
    const word = await activeWord(page);
    await page.keyboard.type(word, { delay: 25 });
    await page.keyboard.press("Space");
    await page.waitForTimeout(120);
  }
}

async function run() {
  const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
  await ensureDir(outDir);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.mouse.click(900, 620);

  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outDir, "intro.png") });

  await typeCorrectWords(page, 10);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outDir, "fast-run.png") });

  await page.keyboard.press("x");
  for (let i = 0; i < 28; i += 1) {
    const detail = await page.locator("#status-detail").innerText();
    const match = detail.match(/GAP\s+([0-9.]+)m/i);
    const gap = match ? Number.parseFloat(match[1]) : Number.NaN;
    const resultsVisible = await page.locator("#results-panel").isVisible().catch(() => false);
    if (resultsVisible || (!Number.isNaN(gap) && gap < 9.5)) break;
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: path.join(outDir, "threat.png") });

  await browser.close();
  console.log(`Screenshots saved to ${outDir}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
