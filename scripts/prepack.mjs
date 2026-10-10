import { execFileSync } from 'node:child_process';
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
  stdio: ['inherit', 2, 2],
  shell: process.platform === 'win32',
});
