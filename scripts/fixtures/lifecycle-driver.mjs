// Explicit public ACP fixture, with a stubborn grandchild to exercise native
// process-tree ownership. This is never embedded in a distributed package.
import './acp-driver.mjs';
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

if (!process.env.AGENT_GAME_LIFECYCLE_AUDIT) throw new Error('Lifecycle fixture needs an explicit audit path.');
const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: 'ignore', windowsHide: true });
appendFileSync(process.env.AGENT_GAME_LIFECYCLE_AUDIT, JSON.stringify({ pid: process.pid, child: child.pid }) + '\n');
process.on('SIGTERM', () => {});
