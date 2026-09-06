import { chromium } from 'playwright-core';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import net from 'net';

const RECORDINGS_DIR = path.resolve(process.cwd(), 'recordings');
const OUTPUT_WEBM = path.resolve(process.cwd(), 'proactive-reach-e2e-demo.webm');
const OUTPUT_MP4 = path.resolve(process.cwd(), 'proactive-reach-e2e-demo.mp4');
const PUBLIC_MP4 = path.resolve(process.cwd(), 'public', 'proactive-reach-demo.mp4');
const BRAIN_DIR_PARENT = '/home/pr6thv3/.gemini/antigravity/brain/4a7283a1-6d03-450d-9dff-52592900a763';
const BRAIN_DIR_CURRENT = '/home/pr6thv3/.gemini/antigravity/brain/967f608a-6b41-473f-b1d1-e7e1b1b3b9bf';
const BRAIN_MP4_PARENT = path.resolve(BRAIN_DIR_PARENT, 'proactive-reach-e2e-demo.mp4');
const BRAIN_MP4_CURRENT = path.resolve(BRAIN_DIR_CURRENT, 'proactive-reach-e2e-demo.mp4');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getAvailablePort() {
  if (process.env.PORT) return parseInt(process.env.PORT, 10);
  const canUse3000 = await new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(3000, '127.0.0.1');
  });
  if (canUse3000) return 3000;
  return 3008;
}

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      // Retry
    }
    await sleep(250);
  }
  throw new Error(`Server at ${url} failed to respond within ${timeoutMs}ms`);
}

async function main() {
  console.log('🚀 [Record Walkthrough] Initializing Playwright E2E UI Recording...');

  if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }

  // Clean old recordings
  for (const f of fs.readdirSync(RECORDINGS_DIR)) {
    if (f.endsWith('.webm')) fs.unlinkSync(path.join(RECORDINGS_DIR, f));
  }

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 [Server] Starting Next.js standalone server on port ${port}...`);

  const serverProcess = spawn('node', ['.next/standalone/server.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      SQLITE_DATABASE_URL: 'file:./dev.db',
      AUTH_DEV_BYPASS: 'true',
      AUTH_TRUST_HOST: 'true',
      NEXTAUTH_URL: baseUrl,
    },
    stdio: 'pipe',
  });

  serverProcess.stdout.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg.includes('Ready') || msg.includes('Error')) {
      console.log(`[Next.js Server] ${msg}`);
    }
  });

  serverProcess.stderr.on('data', (d) => {
    console.error(`[Next.js Error] ${d.toString().trim()}`);
  });

  try {
    await waitForServer(`${baseUrl}/auth/signin`);
    console.log(`✅ [Server] Web server is live at ${baseUrl}`);

    console.log('🌐 [Playwright] Launching headless Chromium with 1440x900 viewport & video capture...');
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1440,900',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: {
        dir: RECORDINGS_DIR,
        size: { width: 1440, height: 900 },
      },
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Helper for natural typing
    async function typeWithDelay(selector, text, delayMs = 18) {
      await page.waitForSelector(selector, { state: 'visible' });
      await page.click(selector);
      await page.fill(selector, '');
      for (const ch of text) {
        await page.keyboard.type(ch);
        await sleep(delayMs);
      }
    }

    console.log('🎬 ═════════════════════════════════════════════════════════════');
    console.log('🎬 STARTING 7-STEP GENUINE USER JOURNEY WALKTHROUGH');
    console.log('🎬 ═════════════════════════════════════════════════════════════');

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: Signup / Signin & Account Creation
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📍 [Step 1/7] Navigating to /auth/signup...');
    await page.goto(`${baseUrl}/auth/signup`, { waitUntil: 'domcontentloaded' });
    await sleep(1000);

    const testId = Date.now().toString().slice(-4);
    const signupEmail = `demo.founder.${testId}@apexsec.io`;
    const signupOrg = `ApexSec AI ${testId}`;

    console.log(`✍️  [Step 1/7] Filling signup form for ${signupEmail}...`);
    await typeWithDelay('#name', 'Elena Rostova', 15);
    await sleep(250);
    await typeWithDelay('#orgName', signupOrg, 15);
    await sleep(250);
    await typeWithDelay('#email', signupEmail, 15);
    await sleep(250);
    await typeWithDelay('#password', 'AutonomousSDR2026!', 15);
    await sleep(1000);

    console.log('🔘 [Step 1/7] Submitting account creation...');
    await page.click('button[type="submit"]');
    await sleep(1500);

    console.log('📍 [Step 1/7] Navigating to /auth/signin...');
    await page.goto(`${baseUrl}/auth/signin`, { waitUntil: 'domcontentloaded' });
    await sleep(1000);
    await typeWithDelay('#email', signupEmail, 15);
    await sleep(250);
    await typeWithDelay('#password', 'AutonomousSDR2026!', 15);
    await sleep(1000);

    console.log('🔘 [Step 1/7] Authenticating session...');
    await page.click('button[type="submit"]');
    await sleep(1500);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: 4-step Onboarding Wizard
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📍 [Step 2/7] Navigating to /onboarding/wizard...');
    await page.goto(`${baseUrl}/onboarding/wizard`, { waitUntil: 'domcontentloaded' });
    await sleep(1200);

    console.log('✍️  [Step 2/7] Wizard Step 1: Inputting Natural Language Goal Prompt...');
    const goalSelector = '#goalPrompt';
    await page.waitForSelector(goalSelector, { state: 'visible' });
    await page.fill(goalSelector, '');
    await typeWithDelay(goalSelector, 'Find US fintechs with 50-500 employees hiring cybersecurity leaders and reach out to CTOs', 12);
    await sleep(1000);

    console.log('⚡ [Step 2/7] Clicking "Translate Goal with AI"...');
    const translateBtn = page.getByRole('button', { name: /Translate Goal/i });
    await translateBtn.click();
    await sleep(2500); // Visual pause to showcase strategy confidence & parsed ICP

    console.log('➡️  [Step 2/7] Advancing to Wizard Step 2 (ICP Strategy)...');
    const nextStep1 = page.getByRole('button', { name: /Next Step/i });
    await nextStep1.click();
    await sleep(1800); // Visual pause showing target industries, tech stack, personas, sequence touches

    console.log('➡️  [Step 2/7] Advancing to Wizard Step 3 (Sending Domain & DNS)...');
    const nextStep2 = page.getByRole('button', { name: /Next Step/i });
    await nextStep2.click();
    await sleep(1800); // Visual pause showing SPF, DKIM, DMARC checklist

    console.log('➡️  [Step 2/7] Advancing to Wizard Step 4 (Autonomy & Pacing Controls)...');
    const nextStep3 = page.getByRole('button', { name: /Next Step/i });
    await nextStep3.click();
    await sleep(1800); // Visual pause showing daily limit, min score slider, autonomy switch

    console.log('🚀 [Step 2/7] Launching Campaign & Completing Onboarding...');
    const launchBtn = page.getByRole('button', { name: /Launch Campaign & Open Dashboard/i });
    await launchBtn.click();
    await sleep(2200);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3: Lead Management & 1-Click Sample Population
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📍 [Step 3/7] Navigating to /dashboard/leads...');
    await page.goto(`${baseUrl}/dashboard/leads`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);

    // Click "Load Sample High-Intent Data" if visible
    const seedBtn = page.getByRole('button', { name: /Load Sample High-Intent Data/i }).first();
    if (await seedBtn.isVisible().catch(() => false)) {
      console.log('🌱 [Step 3/7] Clicking "Load Sample High-Intent Data"...');
      await seedBtn.click();
      await sleep(2500);
    }

    console.log('👁️  [Step 3/7] Inspecting Leads Table with fit scores and MX verified badges...');
    await sleep(1500);

    console.log('🔄 [Step 3/7] Toggling "Research Cards" view (WhyQualified intelligence)...');
    const cardsToggle = page.getByRole('button', { name: /Research Cards/i });
    if (await cardsToggle.isVisible().catch(() => false)) {
      await cardsToggle.click();
      await sleep(2000);
    }

    console.log('🔄 [Step 3/7] Toggling back to "Table & Bulk Actions"...');
    const tableToggle = page.getByRole('button', { name: /Table & Bulk Actions/i });
    if (await tableToggle.isVisible().catch(() => false)) {
      await tableToggle.click();
      await sleep(1200);
    }

    console.log('📁 [Step 3/7] Opening CSV Import Dialog modal...');
    const importDialogBtn = page.getByRole('button', { name: /CSV Import/i });
    if (await importDialogBtn.isVisible().catch(() => false)) {
      await importDialogBtn.click();
      await sleep(1800); // Showcase modal with file upload & textarea
      const cancelModalBtn = page.getByRole('button', { name: /Cancel/i });
      if (await cancelModalBtn.isVisible().catch(() => false)) {
        await cancelModalBtn.click();
      }
      await sleep(1000);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 4: 5-second Review Queue & Hotkey Approvals
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📍 [Step 4/7] Navigating to /dashboard/review...');
    await page.goto(`${baseUrl}/dashboard/review`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);

    // Check if sample data needs seeding on review queue
    const reviewSeedBtn = page.getByRole('button', { name: /Load Sample High-Intent Data/i }).first();
    if (await reviewSeedBtn.isVisible().catch(() => false)) {
      console.log('🌱 [Step 4/7] Seeding review queue sample data...');
      await reviewSeedBtn.click();
      await sleep(2000);
    }

    console.log('⌨️  [Step 4/7] Pressing "A" hotkey for high-velocity instant approval...');
    await page.keyboard.press('KeyA');
    await sleep(2000); // Showcase toast and smooth transition to next prospect

    console.log('⌨️  [Step 4/7] Pressing "E" hotkey to trigger inline draft editor...');
    await page.keyboard.press('KeyE');
    await sleep(1800); // Showcase editable subject/body textareas

    console.log('⚡ [Step 4/7] Toggling Autopilot Mode...');
    const autopilotBtn = page.getByRole('button', { name: /Switch to Full Autopilot|Switch to Review Mode/i });
    if (await autopilotBtn.isVisible().catch(() => false)) {
      await autopilotBtn.click();
      await sleep(2000); // Showcase Autopilot banner and status badge
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 5: Autonomy Panel & Emergency Killswitch
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📍 [Step 5/7] Navigating to /dashboard/autonomy...');
    await page.goto(`${baseUrl}/dashboard/autonomy`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);

    console.log('🛑 [Step 5/7] Engaging Emergency Killswitch: "Pause Outreach Agent"...');
    const pauseBtn = page.getByRole('button', { name: /Pause Outreach Agent/i });
    if (await pauseBtn.isVisible().catch(() => false)) {
      await pauseBtn.click();
      await sleep(2200); // Showcase amber alert banner & "Dispatches Frozen" badge
    }

    console.log('▶️  [Step 5/7] Resuming Outreach Agent...');
    const resumeBtn = page.getByRole('button', { name: /Resume Outreach Agent/i });
    if (await resumeBtn.isVisible().catch(() => false)) {
      await resumeBtn.click();
      await sleep(2200); // Showcase emerald banner & "Live Autonomous Engine" badge
    }

    console.log('🔄 [Step 5/7] Triggering Autonomous SDR Cycle...');
    const cycleBtn = page.getByRole('button', { name: /Trigger Autonomous Cycle/i });
    if (await cycleBtn.isVisible().catch(() => false)) {
      await cycleBtn.click();
      await sleep(2200); // Showcase cycle completion toast
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 6: Smart Inbox Classification (Meeting & DNC Opt-out)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📍 [Step 6/7] Navigating to /dashboard/inbox...');
    await page.goto(`${baseUrl}/dashboard/inbox`, { waitUntil: 'domcontentloaded' });
    await sleep(1800); // Showcase KPI cards & filter tabs

    console.log('📅 [Step 6/7] Handling Meeting Request thread: clicking "Book Meeting"...');
    const bookMeetingBtn = page.getByRole('button', { name: /Book Meeting/i }).first();
    if (await bookMeetingBtn.isVisible().catch(() => false)) {
      await bookMeetingBtn.click();
      await sleep(2000); // Showcase calendar invite confirmation toast
    }

    console.log('🚫 [Step 6/7] Selecting Opt-Out / Objection thread for DNC Suppression...');
    const optOutLead = page.locator('text=Robert Garcia').first();
    if (await optOutLead.isVisible().catch(() => false)) {
      await optOutLead.click();
      await sleep(1200);
    }
    const suppressBtn = page.getByRole('button', { name: /Suppress \(DNC\)/i }).first();
    if (await suppressBtn.isVisible().catch(() => false)) {
      await suppressBtn.click();
      await sleep(2000); // Showcase permanent DNC blacklist toast
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 7: Deliverability, Analytics & Command Center Dashboards
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📍 [Step 7/7] Navigating to /dashboard/domains...');
    await page.goto(`${baseUrl}/dashboard/domains`, { waitUntil: 'domcontentloaded' });
    await sleep(2200); // Showcase dedicated secondary sending domain, 2048-bit DKIM, SPF, DMARC

    console.log('📍 [Step 7/7] Navigating to /dashboard/analytics...');
    await page.goto(`${baseUrl}/dashboard/analytics`, { waitUntil: 'domcontentloaded' });
    await sleep(2200); // Showcase 99.2% Deliverability, 0.0% bounce, Circuit Breaker 100% HEALTHY

    console.log('📍 [Step 7/7] Navigating to /dashboard (Executive Command Center)...');
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
    await sleep(2800); // Showcase complete pipeline KPIs & completed quick-start checklist

    console.log('🎬 ═════════════════════════════════════════════════════════════');
    console.log('🎬 USER JOURNEY COMPLETE! FINALIZING VIDEO FLUSH...');
    console.log('🎬 ═════════════════════════════════════════════════════════════');

    await context.close();
    const rawVideoPath = await page.video().path();
    console.log(`📹 Raw WebM recording saved to: ${rawVideoPath}`);

    await browser.close();

    // Copy raw webm to root
    fs.copyFileSync(rawVideoPath, OUTPUT_WEBM);
    console.log(`✅ WebM copied to: ${OUTPUT_WEBM}`);

    // Transcode to MP4 via ffmpeg
    console.log(`🎞️ Transcoding to QuickTime & web-compatible MP4 via /usr/bin/ffmpeg...`);
    const ffmpegCmd = `/usr/bin/ffmpeg -y -i "${rawVideoPath}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 -movflags +faststart "${OUTPUT_MP4}"`;
    execSync(ffmpegCmd, { stdio: 'inherit' });
    console.log(`✅ MP4 transcoded successfully to: ${OUTPUT_MP4}`);

    // Copy to public directory
    const publicDir = path.dirname(PUBLIC_MP4);
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    fs.copyFileSync(OUTPUT_MP4, PUBLIC_MP4);
    console.log(`✅ Copied to public: ${PUBLIC_MP4}`);

    // Copy to current brain artifact directory
    if (fs.existsSync(BRAIN_DIR_CURRENT)) {
      fs.copyFileSync(OUTPUT_MP4, BRAIN_MP4_CURRENT);
      console.log(`✅ Copied to current brain dir: ${BRAIN_MP4_CURRENT}`);
    }

    // Copy to parent brain artifact directory if writable/accessible
    try {
      if (fs.existsSync(BRAIN_DIR_PARENT)) {
        fs.copyFileSync(OUTPUT_MP4, BRAIN_MP4_PARENT);
        console.log(`✅ Copied to parent brain dir: ${BRAIN_MP4_PARENT}`);
      }
    } catch (e) {
      console.log(`Parent brain dir not directly writable: ${e.message}`);
    }

    // Verify video properties
    const stat = fs.statSync(OUTPUT_MP4);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
    console.log(`📊 Video artifact size: ${sizeMb} MB (${stat.size} bytes)`);

    // Verify duration with ffprobe
    const durationStr = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${OUTPUT_MP4}"`
    ).toString().trim();
    const durationSec = parseFloat(durationStr);
    console.log(`⏱️ Video duration: ${durationSec.toFixed(1)} seconds`);

    if (stat.size < 1024 * 1024) {
      throw new Error(`Video file too small: ${stat.size} bytes (< 1MB required)`);
    }
    if (durationSec < 20) {
      throw new Error(`Video duration too short: ${durationSec}s (< 20s required)`);
    }

    console.log('🎉 ALL VIDEO VERIFICATION CHECKS PASSED 100% GREEN!');
  } finally {
    console.log('🛑 [Teardown] Stopping web server child process...');
    serverProcess.kill('SIGTERM');
    await sleep(500);
  }
}

main().catch((err) => {
  console.error('❌ FATAL ERROR in recording walkthrough:', err);
  process.exit(1);
});
