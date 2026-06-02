import { spawnSync } from 'node:child_process';
import process from 'node:process';

const rawArgs = process.argv.slice(2);
const sqlite = rawArgs.includes('--sqlite');
const prismaArgs = rawArgs.filter(arg => arg !== '--sqlite');

if (prismaArgs.length === 0) {
  console.error('Usage: node scripts/prisma-cli.mjs <prisma command...> [--sqlite]');
  process.exit(1);
}

const schema = sqlite ? 'prisma/schema.sqlite.prisma' : 'prisma/schema.prisma';
const env = Object.fromEntries(Object.entries({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/proactive_outreach',
  SQLITE_DATABASE_URL: process.env.SQLITE_DATABASE_URL || 'file:./dev.db',
}).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));

const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const result = spawnSync(bin, ['prisma', ...prismaArgs, '--schema', schema], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
