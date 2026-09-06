import { spawnSync } from 'node:child_process';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

// Load .env.local if present to prevent shell variable expansion of special characters (like $) on command line.
try {
  const envLocalPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const content = fs.readFileSync(envLocalPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index !== -1) {
        const key = trimmed.substring(0, index).trim();
        let val = trimmed.substring(index + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  console.warn('Failed to load .env.local in prisma-cli:', e);
}

const rawArgs = process.argv.slice(2);
const sqlite = rawArgs.includes('--sqlite');
const prismaArgs = rawArgs.filter(arg => arg !== '--sqlite');

if (prismaArgs.length === 0) {
  console.error('Usage: node scripts/prisma-cli.mjs <prisma command...> [--sqlite]');
  process.exit(1);
}

if (sqlite) {
  const pgSchemaPath = path.join(process.cwd(), 'prisma/schema.prisma');
  const sqliteSchemaPath = path.join(process.cwd(), 'prisma/schema.sqlite.prisma');
  if (fs.existsSync(pgSchemaPath)) {
    let content = fs.readFileSync(pgSchemaPath, 'utf8');
    content = content.replace('provider = "postgresql"', 'provider = "sqlite"');
    content = content.replace('url      = env("DATABASE_URL")', 'url      = env("SQLITE_DATABASE_URL")');
    content = content.replace(/\s+directUrl\s*=\s*env\("DIRECT_URL"\)/g, '');
    content = content.replace(/\s+embedding\s+Unsupported\("vector"\)\?/g, '');
    content = content.replace(/(\w+)\s+String\[\](\s+@default\([^)]*\))?/g, '$1 String @default("[]")');
    fs.writeFileSync(sqliteSchemaPath, content, 'utf8');
  }
}

const schema = sqlite ? 'prisma/schema.sqlite.prisma' : 'prisma/schema.prisma';
const env = Object.fromEntries(Object.entries({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/proactive_outreach',
  SQLITE_DATABASE_URL: process.env.SQLITE_DATABASE_URL || 'file:./dev.db',
}).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));

const bin = 'node';
const args = [path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'), ...prismaArgs, '--schema', schema];

const result = spawnSync(bin, args, {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);

