import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const FRAMES_DIR = path.join(process.cwd(), 'scratch', 'frames');
const OUTPUT_VIDEO = '/home/pr6thv3/.gemini/antigravity/brain/148ccfad-0229-4541-be5c-65eb67e459a8/proactive_reach_demo.mp4';

if (!fs.existsSync(FRAMES_DIR)) {
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
}

// Clean old frames
const files = fs.readdirSync(FRAMES_DIR);
for (const file of files) {
  if (file.endsWith('.png')) {
    fs.unlinkSync(path.join(FRAMES_DIR, file));
  }
}

let frameIndex = 0;

async function recordFrames(page, durationMs, fps = 10) {
  const intervalMs = 1000 / fps;
  const totalFrames = Math.ceil((durationMs / 1000) * fps);

  for (let i = 0; i < totalFrames; i++) {
    frameIndex++;
    const frameNumber = String(frameIndex).padStart(5, '0');
    const screenshotPath = path.join(FRAMES_DIR, `frame_${frameNumber}.png`);
    await page.screenshot({ path: screenshotPath, type: 'png' });
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function runDemo() {
  console.log('🎥 Launching Headless Firefox via puppeteer-core for ProactiveReach SaaS Demo Recording...');

  const firefoxPath = '/usr/bin/firefox';

  const browser = await puppeteer.launch({
    executablePath: firefoxPath,
    browser: 'firefox',
    headless: true,
    args: ['--width=1280', '--height=800'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

  const APP_URL = 'http://localhost:3008/dashboard';
  console.log(`🌐 Navigating to ${APP_URL}...`);

  try {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.log('DOM load timeout, proceeding with current loaded DOM state.');
  }

  await new Promise((r) => setTimeout(r, 2000));

  // 1. Dashboard Overview
  console.log('Frame Recording Phase 1: Dashboard & Results Overview');
  await recordFrames(page, 2500, 10);

  // 2. Click through tabs
  const tabTriggers = await page.$$('[role="tab"]');
  console.log(`Found ${tabTriggers.length} dashboard tabs.`);

  for (let i = 0; i < tabTriggers.length; i++) {
    try {
      const tabText = await page.evaluate((el) => el.textContent, tabTriggers[i]);
      console.log(`Frame Recording Phase: Tab ${i + 1} — "${tabText?.trim()}"`);
      await tabTriggers[i].click();
      await recordFrames(page, 2000, 10);
    } catch (e) {
      console.log(`Tab click skipped for index ${i}:`, e.message);
    }
  }

  // 3. Smooth UI Scroll Demonstration
  console.log('Frame Recording Phase: Smooth UI Scroll Demonstration');
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
  await recordFrames(page, 1500, 10);

  await page.evaluate(() => window.scrollBy({ top: -300, behavior: 'smooth' }));
  await recordFrames(page, 1500, 10);

  await browser.close();
  console.log(`✨ Captured ${frameIndex} frames cleanly!`);

  // Compile frames to MP4 via ffmpeg
  console.log(`🎬 Compiling frames into HD video: ${OUTPUT_VIDEO}...`);
  const ffmpegCmd = `ffmpeg -y -framerate 10 -i "${FRAMES_DIR}/frame_%05d.png" -c:v libx264 -pix_fmt yuv420p -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" "${OUTPUT_VIDEO}"`;

  try {
    execSync(ffmpegCmd, { stdio: 'inherit' });
    console.log(`✅ Demo video saved successfully to: ${OUTPUT_VIDEO}`);
  } catch (err) {
    console.error('Error executing ffmpeg compilation:', err);
  }
}

runDemo().catch((err) => {
  console.error('Fatal demo recording error:', err);
  process.exit(1);
});
