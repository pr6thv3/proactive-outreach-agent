#!/usr/bin/env bash
# ==============================================================================
# ProactiveReach — Automated Zero-to-Working Setup Script
# ==============================================================================
# Usage:
#   bash scripts/setup.sh [--sqlite | --postgres] [--seed] [--skip-seed] [--help]
# ==============================================================================

set -eo pipefail

# Text formatting
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

log_info() {
  echo -e "${BLUE}${BOLD}[INFO]${RESET} $1"
}

log_success() {
  echo -e "${GREEN}${BOLD}[SUCCESS]${RESET} $1"
}

log_warn() {
  echo -e "${YELLOW}${BOLD}[WARN]${RESET} $1"
}

log_error() {
  echo -e "${RED}${BOLD}[ERROR]${RESET} $1"
}

print_banner() {
  echo -e "${BLUE}${BOLD}"
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║           ProactiveReach AI Outreach Platform Setup              ║"
  echo "║               Zero-to-Working Initialization                     ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo -e "${RESET}"
}

show_help() {
  cat << USAGE
ProactiveReach Automated Setup Script

Usage:
  bash scripts/setup.sh [OPTIONS]

Options:
  --sqlite        Use local SQLite database (dev.db) - Default for local evaluation.
  --postgres      Use PostgreSQL database configured via DATABASE_URL in .env.
  --seed          Automatically seed sample workspace, users, and high-intent leads.
  --skip-seed     Skip database seeding step.
  --help, -h      Display this help menu.

Examples:
  bash scripts/setup.sh --sqlite --seed
  bash scripts/setup.sh --postgres
USAGE
  exit 0
}

# Default options
DB_TARGET="sqlite"
DO_SEED="auto"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sqlite)
      DB_TARGET="sqlite"
      shift
      ;;
    --postgres)
      DB_TARGET="postgres"
      shift
      ;;
    --seed)
      DO_SEED="yes"
      shift
      ;;
    --skip-seed)
      DO_SEED="no"
      shift
      ;;
    -h|--help)
      show_help
      ;;
    *)
      log_warn "Unknown argument: $1"
      shift
      ;;
  esac
done

print_banner

# ─── Step 1: Prerequisite Checks ──────────────────────────────────────────────
log_info "Step 1/5: Checking system prerequisites..."

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  log_error "Node.js is not installed. Please install Node.js (v20+ recommended) and re-run setup."
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 18 ]; then
  log_warn "Node.js version $(node -v) detected. Node.js v20+ is strongly recommended."
else
  log_success "Node.js $(node -v) detected."
fi

# Check npm
if ! command -v npm >/dev/null 2>&1; then
  log_error "npm is not installed. Please install npm and re-run setup."
  exit 1
fi
log_success "npm $(npm -v) detected."

# Check dependencies installed
if [ ! -d "node_modules" ]; then
  log_info "node_modules not found. Installing project dependencies via npm install..."
  npm install
  log_success "Dependencies installed successfully."
else
  log_success "node_modules directory found."
fi

# ─── Step 2: Environment File Setup & Secret Generation ───────────────────────
log_info "Step 2/5: Initializing environment configuration (.env)..."

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    log_info "Creating .env from .env.example template..."
    cp .env.example .env
    log_success "Created .env"
  else
    log_error ".env.example not found! Cannot scaffold environment configuration."
    exit 1
  fi
else
  log_info "Existing .env file detected."
fi

# Ensure NEXTAUTH_SECRET is populated with a secure random key
node << 'NODE_EOF'
const fs = require("fs");
const crypto = require("crypto");
const envPath = ".env";

if (fs.existsSync(envPath)) {
  let content = fs.readFileSync(envPath, "utf8");
  const secretMatch = content.match(/^NEXTAUTH_SECRET=(.*)$/m);
  
  const currentSecret = secretMatch ? secretMatch[1].trim().replace(/^["']|["']$/g, "") : "";
  const isPlaceholder = !currentSecret || currentSecret === "your-nextauth-secret-min-32-chars-long" || currentSecret.includes("your-nextauth-secret");

  if (isPlaceholder) {
    const newSecret = crypto.randomBytes(32).toString("base64");
    if (secretMatch) {
      content = content.replace(/^NEXTAUTH_SECRET=.*$/m, `NEXTAUTH_SECRET="${newSecret}"`);
    } else {
      content += `\nNEXTAUTH_SECRET="${newSecret}"\n`;
    }
    fs.writeFileSync(envPath, content, "utf8");
    console.log("[SETUP] Generated new secure 256-bit NEXTAUTH_SECRET in .env");
  } else {
    console.log("[SETUP] Existing NEXTAUTH_SECRET is configured.");
  }
}
NODE_EOF

# ─── Step 3: Database Schema Push & Prisma Client Generation ──────────────────
log_info "Step 3/5: Setting up database target (${DB_TARGET})..."

if [ "$DB_TARGET" = "sqlite" ]; then
  log_info "Pushing schema to SQLite (dev.db)..."
  npm run db:push:sqlite
  log_success "SQLite schema pushed successfully."

  log_info "Generating Prisma Client for SQLite..."
  npm run db:generate:sqlite
  log_success "Prisma Client generated."
else
  log_info "Pushing schema to PostgreSQL..."
  npm run db:push
  log_success "PostgreSQL schema pushed successfully."

  log_info "Generating Prisma Client for PostgreSQL..."
  npm run db:generate
  log_success "Prisma Client generated."
fi

# ─── Step 4: Database Seeding ─────────────────────────────────────────────────
log_info "Step 4/5: Database Seeding..."

run_seed() {
  log_info "Seeding database with sample organization, users, and high-intent leads..."
  if [ "$DB_TARGET" = "sqlite" ]; then
    cross-env SQLITE_DATABASE_URL=file:./dev.db AUTH_DEV_BYPASS=true npm run db:seed
  else
    npm run db:seed
  fi
  log_success "Database seeded successfully."
}

if [ "$DO_SEED" = "yes" ]; then
  run_seed
elif [ "$DO_SEED" = "no" ]; then
  log_info "Skipping database seed (--skip-seed specified)."
else
  # Auto-decision: In non-interactive or default setup, seed to guarantee zero-friction onboarding
  if [ -t 0 ]; then
    read -r -p "Would you like to seed sample high-intent leads and demo accounts? [Y/n] " response || response="y"
    case "$response" in
      [nN][oO]|[nN])
        log_info "Skipping seed."
        ;;
      *)
        run_seed
        ;;
    esac
  else
    log_info "Non-interactive environment: automatically seeding sample data for zero-to-working experience."
    run_seed
  fi
fi

# ─── Step 5: Environment & Integrity Validation ───────────────────────────────
log_info "Step 5/5: Validating environment integrity and runtime contract..."

npx tsx --env-file=.env << 'TS_EOF'
import { validateEnv } from "./src/lib/env";
try {
  const env = validateEnv();
  console.log("\x1b[32m\x1b[1m[SUCCESS]\x1b[0m Environment schema validated successfully.");
  console.log(`[INFO] Database Target: ${process.env.SQLITE_DATABASE_URL ? "SQLite (" + process.env.SQLITE_DATABASE_URL + ")" : "PostgreSQL"}`);
  console.log(`[INFO] Dev Auth Bypass: ${env.AUTH_DEV_BYPASS === "true" ? "Enabled (Local Testing)" : "Disabled (Enforced)"}`);
  console.log(`[INFO] BullMQ Redis:    ${env.REDIS_URL ? env.REDIS_URL : "Not configured (In-Memory / Database fallback mode)"}`);
  console.log(`[INFO] Email Provider:  ${env.RESEND_API_KEY ? "Resend Configured" : "Simulation Mode (Local Sandbox)"}`);
} catch (err: any) {
  console.error("\x1b[31m\x1b[1m[ERROR]\x1b[0m Environment validation check failed:", err.message);
  process.exit(1);
}
TS_EOF

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}🎉 ProactiveReach Setup Complete! System is ready to run.${RESET}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "${BOLD}To start the platform:${RESET}"
echo -e "  1. Start the web application:     ${BLUE}npm run dev${RESET}"
echo -e "  2. Start the background worker:   ${BLUE}npm run worker${RESET}"
echo -e "  3. Open your browser:             ${BLUE}http://localhost:3000${RESET}"
echo ""
echo -e "${BOLD}Default Seeded Credentials:${RESET}"
echo -e "  • Workspace:   ${BLUE}Acme SaaS Corp${RESET}"
echo -e "  • Owner Login: ${BLUE}owner@acme.com${RESET} / ${BLUE}password123${RESET}"
echo -e "  • Sales Login: ${BLUE}bob@acme.com${RESET}   / ${BLUE}password123${RESET}"
echo ""
