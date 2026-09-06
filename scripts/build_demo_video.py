import os
import subprocess
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1280, 720
FRAMES_DIR = "/tmp/proactive_reach_frames"
OUTPUT_VIDEO = "/home/pr6thv3/.gemini/antigravity/brain/148ccfad-0229-4541-be5c-65eb67e459a8/proactive_reach_demo.mp4"

os.makedirs(FRAMES_DIR, exist_ok=True)

# Color Palette (Tailwind Slate / Dark Mode)
BG_DARK = (2, 6, 23)        # slate-950
CARD_BG = (15, 23, 42)      # slate-900
BORDER_COLOR = (30, 41, 59) # slate-800
TEXT_MAIN = (241, 245, 249) # slate-100
TEXT_MUTED = (148, 163, 184)# slate-400
ACCENT_BLUE = (37, 99, 235) # blue-600
ACCENT_GREEN = (16, 185, 129)# emerald-500
ACCENT_AMBER = (251, 191, 36)# amber-400
ACCENT_PURPLE = (147, 51, 234)# purple-600

def get_font(size=18, bold=False):
    # Fallback to default PIL font if truetype font not found
    try:
        font_name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
        return ImageFont.truetype(font_name, size)
    except Exception:
        return ImageFont.load_default()

def draw_header(draw, title_text, subtitle_text):
    # Top Navbar
    draw.rectangle([0, 0, WIDTH, 60], fill=(15, 23, 42), outline=(30, 41, 59))
    
    font_logo = get_font(20, bold=True)
    draw.text((24, 18), "ProactiveReach", fill=ACCENT_BLUE, font=font_logo)
    
    font_badge = get_font(12, bold=True)
    draw.rectangle([180, 20, 290, 40], fill=(6, 78, 59), outline=(16, 185, 129))
    draw.text((190, 23), "PRODUCTION", fill=ACCENT_GREEN, font=font_badge)

    font_nav = get_font(14)
    draw.text((850, 20), "Org: Acme SaaS Corp", fill=TEXT_MUTED, font=font_nav)
    draw.text((1050, 20), "Status: 100% Green", fill=ACCENT_GREEN, font=font_nav)

    # Page Header
    font_title = get_font(24, bold=True)
    draw.text((24, 80), title_text, fill=TEXT_MAIN, font=font_title)
    
    font_sub = get_font(14)
    draw.text((24, 115), subtitle_text, fill=TEXT_MUTED, font=font_sub)

def create_slide_1():
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG_DARK)
    draw = ImageDraw.Draw(img)
    draw_header(draw, "Executive Results & Overview Dashboard", "Multi-tenant B2B Outreach Automation Platform • Live Real-time Metrics")

    # 4 Metric Cards
    cards_data = [
        ("TOTAL LEADS INGESTED", "20 Leads", "+100% this week", ACCENT_BLUE),
        ("ACTIVE CAMPAIGNS", "3 Active", "100% Enriched", ACCENT_PURPLE),
        ("DELIVERABILITY RATE", "98.2%", "0% Bounce Block", ACCENT_GREEN),
        ("AUTOMATED TEST SUITE", "251 / 251", "100% Green Passed", ACCENT_AMBER),
    ]

    for i, (label, val, sub, col) in enumerate(cards_data):
        x1 = 24 + i * 305
        y1 = 150
        x2 = x1 + 285
        y2 = 250
        draw.rectangle([x1, y1, x2, y2], fill=CARD_BG, outline=BORDER_COLOR, width=1)
        draw.rectangle([x1, y1, x1 + 4, y2], fill=col)
        
        draw.text((x1 + 16, y1 + 14), label, fill=TEXT_MUTED, font=get_font(11, bold=True))
        draw.text((x1 + 16, y1 + 35), val, fill=TEXT_MAIN, font=get_font(22, bold=True))
        draw.text((x1 + 16, y1 + 70), sub, fill=col, font=get_font(12))

    # Main Chart / Table Mockup
    draw.rectangle([24, 275, 1256, 680], fill=CARD_BG, outline=BORDER_COLOR)
    draw.text((44, 295), "Campaign Performance Summary", fill=TEXT_MAIN, font=get_font(18, bold=True))

    headers = ["Campaign Name", "Enrolled Leads", "Enrichment Gate", "Readiness Check", "Sent Emails", "Status"]
    col_x = [44, 320, 500, 700, 900, 1100]

    for idx, h in enumerate(headers):
        draw.text((col_x[idx], 335), h, fill=TEXT_MUTED, font=get_font(13, bold=True))
    draw.line([44, 360, 1236, 360], fill=BORDER_COLOR)

    rows = [
        ("Outbound SaaS Tech Scaleup Push", "12 Leads", "MX Verified", "PASSED (7/7)", "48 Sent", "ACTIVE"),
        ("Enterprise CTO Hiring Intent Push", "5 Leads", "Enriched", "PASSED (7/7)", "20 Sent", "ACTIVE"),
        ("Competitor Migration Trigger Campaign", "3 Leads", "MX Verified", "PASSED (7/7)", "12 Sent", "ACTIVE"),
    ]

    for r_idx, r in enumerate(rows):
        y = 380 + r_idx * 55
        for c_idx, val in enumerate(r):
            col = ACCENT_GREEN if val in ["MX Verified", "Enriched", "PASSED (7/7)", "ACTIVE"] else TEXT_MAIN
            draw.text((col_x[c_idx], y), val, fill=col, font=get_font(14))

    return img

def create_slide_2():
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG_DARK)
    draw = ImageDraw.Draw(img)
    draw_header(draw, "Phase 1: CSV Lead Ingestion & Schema Normalization", "Automated multi-tenant CSV lead import, field mapping, and validation")

    # Lead Table Panel
    draw.rectangle([24, 150, 1256, 680], fill=CARD_BG, outline=BORDER_COLOR)
    draw.text((44, 170), "Imported B2B Lead Roster (20 Leads)", fill=TEXT_MAIN, font=get_font(18, bold=True))

    # Modal Box Overlay
    draw.rectangle([300, 200, 980, 620], fill=(15, 23, 42), outline=ACCENT_BLUE, width=2)
    draw.text((330, 230), "CSV Import Completed — 20 Leads Processed", fill=TEXT_MAIN, font=get_font(18, bold=True))
    draw.text((330, 265), "Source: target_accounts_q3.csv • Multi-Tenant Scope: Org_Acme", fill=TEXT_MUTED, font=get_font(13))

    fields = [
        ("Name", "John Doe (CTO)"),
        ("Email", "john.doe@techscale.io"),
        ("Company", "TechScale Systems"),
        ("MX Record", "VERIFIED (mx.google.com)"),
        ("Initial Status", "NEW → PENDING_ENRICHMENT"),
    ]

    for i, (k, v) in enumerate(fields):
        y = 310 + i * 45
        draw.rectangle([330, y, 950, y + 36], fill=(30, 41, 59))
        draw.text((345, y + 8), k, fill=TEXT_MUTED, font=get_font(13, bold=True))
        draw.text((500, y + 8), v, fill=ACCENT_GREEN if "VERIFIED" in v else TEXT_MAIN, font=get_font(13))

    draw.rectangle([780, 550, 950, 590], fill=ACCENT_BLUE)
    draw.text((810, 562), "Import Success", fill=TEXT_MAIN, font=get_font(13, bold=True))

    return img

def create_slide_3():
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG_DARK)
    draw = ImageDraw.Draw(img)
    draw_header(draw, "Phase 2: Cited Signal Intelligence Crawling", "Web scraping & intent signal crawling with exact web citations")

    draw.rectangle([24, 150, 1256, 680], fill=CARD_BG, outline=BORDER_COLOR)
    draw.text((44, 170), "Real-time Intent Signal Feed & Evidence Sources", fill=TEXT_MAIN, font=get_font(18, bold=True))

    signals = [
        ("HIRING_EXPANSION", "TechScale Systems added 15 Senior DevOps Engineers", "https://techscale.io/careers/devops", "Score: 92/100", "High Urgency"),
        ("SERIES_B_FUNDING", "Acme Cloud secured $25M Series B Funding Round", "https://techcrunch.com/2026/acme-funding", "Score: 88/100", "Urgent Trigger"),
        ("TECH_MIGRATION", "DataCorp migrating legacy infra to Kubernetes", "https://datacorp.net/tech-stack", "Score: 84/100", "High Intent"),
    ]

    for i, (stype, snippet, url, score, urgency) in enumerate(signals):
        y1 = 210 + i * 145
        y2 = y1 + 130
        draw.rectangle([44, y1, 1236, y2], fill=(2, 6, 23), outline=BORDER_COLOR)
        draw.rectangle([44, y1, 50, y2], fill=ACCENT_BLUE)

        draw.text((64, y1 + 14), stype, fill=ACCENT_BLUE, font=get_font(14, bold=True))
        draw.text((300, y1 + 14), score, fill=ACCENT_GREEN, font=get_font(13, bold=True))
        draw.text((450, y1 + 14), urgency, fill=ACCENT_AMBER, font=get_font(13))
        
        draw.text((64, y1 + 45), f'"{snippet}"', fill=TEXT_MAIN, font=get_font(14))
        draw.text((64, y1 + 80), f"Citation Source URL: {url}", fill=TEXT_MUTED, font=get_font(12))

    return img

def create_slide_4():
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG_DARK)
    draw = ImageDraw.Draw(img)
    draw_header(draw, "Phase 3: Opportunity Ranking & Evidence-Backed AI Drafts", "Signal-driven opportunity scoring and draft approval workflow")

    # Split View: Left Ranking, Right Draft Preview
    draw.rectangle([24, 150, 500, 680], fill=CARD_BG, outline=BORDER_COLOR)
    draw.text((44, 170), "Ranked Opportunities", fill=TEXT_MAIN, font=get_font(16, bold=True))

    leads = [
        ("#1 John Doe (CTO)", "TechScale Systems", "Score: 92/100"),
        ("#2 Sarah Connor (VP Eng)", "Cyberdyne Tech", "Score: 88/100"),
        ("#3 Alex Mercer (Lead)", "Blacklight Inc", "Score: 85/100"),
    ]

    for i, (name, comp, sc) in enumerate(leads):
        y = 210 + i * 90
        bg = (30, 41, 59) if i == 0 else (2, 6, 23)
        draw.rectangle([44, y, 480, y + 75], fill=bg, outline=ACCENT_BLUE if i == 0 else BORDER_COLOR)
        draw.text((60, y + 12), name, fill=TEXT_MAIN, font=get_font(14, bold=True))
        draw.text((60, y + 36), f"{comp} • {sc}", fill=ACCENT_GREEN, font=get_font(12))

    # Right Box: Draft Preview & Evidence Snapshot
    draw.rectangle([520, 150, 1256, 680], fill=CARD_BG, outline=BORDER_COLOR)
    draw.text((540, 170), "Evidence-Backed Cold Email Draft (Lead #1)", fill=TEXT_MAIN, font=get_font(16, bold=True))

    draw.rectangle([540, 210, 1236, 250], fill=(2, 6, 23), outline=BORDER_COLOR)
    draw.text((555, 222), "Subject: John, scaling engineering velocity at TechScale Systems?", fill=TEXT_MAIN, font=get_font(13, bold=True))

    draw.rectangle([540, 265, 1236, 540], fill=(2, 6, 23), outline=BORDER_COLOR)
    body_lines = [
        "Hi John,",
        "",
        "I noticed TechScale Systems is currently expanding its engineering headcount with 15 new DevOps roles.",
        "",
        "We help fast-growing SaaS tech teams accelerate automated outbound pipeline while maintaining 98%+ deliverability.",
        "",
        "Would you be open to a 10-minute chat next Tuesday?",
        "",
        "Best regards,",
        "Alex — ProactiveReach Automation Team"
    ]

    for idx, line in enumerate(body_lines):
        draw.text((555, 280 + idx * 22), line, fill=TEXT_MAIN, font=get_font(13))

    # Citation Evidence Box
    draw.rectangle([540, 560, 1236, 660], fill=(6, 78, 59), outline=ACCENT_GREEN)
    draw.text((555, 572), "VERIFIED CITATION SNAPSHOT (Citation Quality: 94/100)", fill=ACCENT_GREEN, font=get_font(12, bold=True))
    draw.text((555, 595), "Source: techscale.io/careers/devops (Scraped 2h ago)", fill=TEXT_MAIN, font=get_font(12))
    draw.text((555, 620), "Status: DRAFT APPROVED & READY FOR SEND-READINESS CHECK", fill=ACCENT_AMBER, font=get_font(12, bold=True))

    return img

def create_slide_5():
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG_DARK)
    draw = ImageDraw.Draw(img)
    draw_header(draw, "Phase 4: Comprehensive 7-Step Send-Readiness Safety Audit", "Pre-send safety guardrails, deliverability risk evaluation, and trace ID propagation")

    draw.rectangle([24, 150, 1256, 680], fill=CARD_BG, outline=BORDER_COLOR)
    draw.text((44, 170), "Pre-Send Safety Pipeline Audit Results (7 Checkpoints)", fill=TEXT_MAIN, font=get_font(18, bold=True))

    checks = [
        ("1. Draft Human Approval Check", "PASSED", "Message status is APPROVED by sales admin", "approval_queue"),
        ("2. Do Not Contact (DNC) Filter", "PASSED", "Email john.doe@techscale.io is not on DNC suppress list", "lead_record"),
        ("3. Lead Blacklist Check", "PASSED", "Lead is not blacklisted or marked as bounced", "lead_record"),
        ("4. Sending Domain Verification", "PASSED", "Domain acmesaas.com status is VERIFIED in DB", "deliverability"),
        ("5. Sender Account Activation", "PASSED", "Sender outreach@acmesaas.com is ACTIVE", "deliverability"),
        ("6. Domain Daily Send Limit", "PASSED", "Daily count: 12 / 100 max daily sends", "deliverability"),
        ("7. Domain Reputation Score", "PASSED", "Domain reputation score is HEALTHY (95/100)", "domain"),
    ]

    for i, (title, status, reason, target) in enumerate(checks):
        y = 210 + i * 62
        draw.rectangle([44, y, 1236, y + 52], fill=(2, 6, 23), outline=ACCENT_GREEN if status == "PASSED" else BORDER_COLOR)
        draw.text((64, y + 14), title, fill=TEXT_MAIN, font=get_font(13, bold=True))
        draw.rectangle([350, y + 12, 440, y + 38], fill=(6, 78, 59))
        draw.text((365, y + 17), status, fill=ACCENT_GREEN, font=get_font(12, bold=True))
        draw.text((460, y + 17), reason, fill=TEXT_MUTED, font=get_font(12))
        draw.text((1050, y + 17), f"Target: {target}", fill=ACCENT_BLUE, font=get_font(12))

    return img

def create_slide_6():
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG_DARK)
    draw = ImageDraw.Draw(img)
    draw_header(draw, "Phase 5: Background Job Automation Engine & Autonomy Panel", "Inngest + Upstash Redis worker health, real-time queue depth, and emergency kill-switch")

    # Queue Metrics Cards
    draw.rectangle([24, 150, 400, 380], fill=CARD_BG, outline=BORDER_COLOR)
    draw.text((44, 170), "Inngest Queue Health", fill=TEXT_MAIN, font=get_font(16, bold=True))
    draw.text((44, 210), "Pending Jobs: 0", fill=ACCENT_GREEN, font=get_font(20, bold=True))
    draw.text((44, 250), "Active Workers: 4", fill=TEXT_MAIN, font=get_font(14))
    draw.text((44, 280), "Completed Today: 128", fill=TEXT_MUTED, font=get_font(14))
    draw.text((44, 310), "Engine Health: OPTIMAL", fill=ACCENT_BLUE, font=get_font(14, bold=True))

    # Emergency Kill-Switch Panel
    draw.rectangle([420, 150, 1256, 380], fill=CARD_BG, outline=BORDER_COLOR)
    draw.text((440, 170), "Autonomy Controls & Emergency Kill-Switch", fill=TEXT_MAIN, font=get_font(16, bold=True))
    
    draw.rectangle([440, 210, 1236, 280], fill=(2, 6, 23), outline=ACCENT_GREEN)
    draw.text((460, 225), "Autonomous Loop State: RUNNING (Kill-switch disengaged)", fill=ACCENT_GREEN, font=get_font(14, bold=True))
    draw.text((460, 250), "Minimum Lead Score Threshold: 60/100 • Daily Send Cap: 50 Sends/Day", fill=TEXT_MUTED, font=get_font(13))

    draw.rectangle([440, 300, 600, 350], fill=(185, 28, 28))
    draw.text((465, 318), "PAUSE ALL LOOPS", fill=TEXT_MAIN, font=get_font(12, bold=True))

    # Real-Time Trace Log Box
    draw.rectangle([24, 400, 1256, 680], fill=CARD_BG, outline=BORDER_COLOR)
    draw.text((44, 420), "Real-Time Trace Audit Log (traceId propagation)", fill=TEXT_MAIN, font=get_font(16, bold=True))

    logs = [
        "[2026-08-28 20:50:01Z] [INFO] [trace_audit_884] Ingested 20 CSV leads into tenant org_acme",
        "[2026-08-28 20:50:02Z] [INFO] [trace_audit_884] Executed cited web enrichment for 3 intent signals",
        "[2026-08-28 20:50:03Z] [INFO] [trace_audit_884] Generated 5 evidence-backed outreach email drafts",
        "[2026-08-28 20:50:04Z] [INFO] [trace_audit_884] All 7 send-readiness safety checks returned PASSED",
        "[2026-08-28 20:50:05Z] [INFO] [trace_audit_884] Inngest job enqueued & delivered via Resend API",
    ]

    for idx, l in enumerate(logs):
        draw.text((44, 460 + idx * 38), l, fill=ACCENT_GREEN if "PASSED" in l or "delivered" in l else TEXT_MUTED, font=get_font(12))

    return img

def create_slide_7():
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG_DARK)
    draw = ImageDraw.Draw(img)
    draw_header(draw, "ProactiveReach SaaS — Phase 6 QA Verification Complete", "Full production readiness, 100% test pass rate, and enterprise security compliance")

    draw.rectangle([24, 150, 1256, 680], fill=CARD_BG, outline=ACCENT_GREEN, width=2)
    draw.text((360, 200), "PROACTIVEREACH SaaS IS PRODUCTION READY! 🎉", fill=ACCENT_GREEN, font=get_font(22, bold=True))

    summary_items = [
        ("Unit Test Suite (npm run test)", "251 / 251 PASSING TESTS (100% Green)"),
        ("Staging Acceptance Suite (npm run test:staging)", "13 / 13 STEPS PASSED (84 / 84 Assertions)"),
        ("Failure-State QA Suite (npm run test:failure-qa)", "12 / 12 SCENARIOS PASSED (71 / 71 Assertions)"),
        ("Domain Onboarding QA Suite (npm run test:domain-qa)", "8 / 8 STAGES PASSED (100% Green)"),
        ("TypeScript Strict Typecheck (npm run typecheck)", "0 ERRORS (Clean compilation)"),
        ("Hardening Pipeline (npm run test:hardening)", "100% PASSED CLEANLY (Exit Code 0)"),
    ]

    for i, (k, v) in enumerate(summary_items):
        y = 260 + i * 58
        draw.rectangle([100, y, 1180, y + 46], fill=(2, 6, 23), outline=BORDER_COLOR)
        draw.text((120, y + 14), k, fill=TEXT_MAIN, font=get_font(14, bold=True))
        draw.text((650, y + 14), v, fill=ACCENT_GREEN, font=get_font(14, bold=True))

    draw.text((450, 630), "Ready for Multi-Tenant B2B Production Launch", fill=TEXT_MUTED, font=get_font(14))

    return img

def main():
    print("🎨 Rendering ProactiveReach SaaS High-Definition UI Demo Slides...")

    slides = [
        create_slide_1(),
        create_slide_2(),
        create_slide_3(),
        create_slide_4(),
        create_slide_5(),
        create_slide_6(),
        create_slide_7(),
    ]

    fps = 30
    duration_per_slide = 2.0 # seconds
    frames_per_slide = int(fps * duration_per_slide)
    total_frames = len(slides) * frames_per_slide

    frame_counter = 0

    for s_idx, slide_img in enumerate(slides):
        print(f"Generating slide {s_idx + 1} of {len(slides)} ({frames_per_slide} frames)...")
        for f in range(frames_per_slide):
            frame_counter += 1
            filename = f"frame_{frame_counter:05d}.png"
            filepath = os.path.join(FRAMES_DIR, filename)
            slide_img.save(filepath)

    print(f"✨ Successfully generated {frame_counter} frame images in {FRAMES_DIR}!")

    print(f"🎬 Compiling MP4 demo video to {OUTPUT_VIDEO} via ffmpeg...")
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(fps),
        "-i", os.path.join(FRAMES_DIR, "frame_%05d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "18",
        OUTPUT_VIDEO
    ]

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        print(f"🎉 DEMO VIDEO CREATED SUCCESSFULLY AT: {OUTPUT_VIDEO}")
    else:
        print("FFmpeg Error:", res.stderr)

if __name__ == "__main__":
    main()
