import { execFileSync } from 'node:child_process';
import { cp, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { publicFiles } from './public-files.mjs';

const destination = process.argv[2];
if (!destination) throw new Error('Provide a new, empty destination for the clean release source.');
execFileSync(process.execPath, ['scripts/release-boundary.mjs'], { stdio: 'inherit' });
try {
  await access(destination);
  throw new Error('Destination already exists; refusing to overwrite.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(destination, { recursive: true });
for (const file of publicFiles) {
  try {
    await access(file);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  const target = resolve(destination, file);
  await mkdir(dirname(target), { recursive: true });
  await cp(file, target, { recursive: true, errorOnExist: true, force: false });
}
console.log(`Exported clean release source to ${resolve(destination)}; no Git history copied.`);
