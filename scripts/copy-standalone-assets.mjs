import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const standaloneDir = path.join(root, '.next', 'standalone');
const staticSrc = path.join(root, '.next', 'static');
const staticDest = path.join(standaloneDir, '.next', 'static');
const publicSrc = path.join(root, 'public');
const publicDest = path.join(standaloneDir, 'public');

if (!existsSync(standaloneDir)) {
  console.warn('Standalone output was not found; skipping asset copy.');
  process.exit(0);
}

await mkdir(path.dirname(staticDest), { recursive: true });

if (existsSync(staticSrc)) {
  await cp(staticSrc, staticDest, { recursive: true, force: true });
}

if (existsSync(publicSrc)) {
  await cp(publicSrc, publicDest, { recursive: true, force: true });
}
