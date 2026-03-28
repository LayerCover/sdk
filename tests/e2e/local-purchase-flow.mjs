#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runnerPath = path.join(__dirname, 'local-purchase-flow.cjs');

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [runnerPath], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', reject);
  child.on('exit', (code) => resolve(code ?? 1));
});

process.exit(exitCode);
