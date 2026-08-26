import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const androidRoot = resolve(projectRoot, 'android');
try {
  await access(resolve(androidRoot, 'app'));
  console.log('Android platform already exists; syncing it.');
} catch {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['cap', 'add', 'android'], { cwd: projectRoot, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
