#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureElectron } from './ensure-electron.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainPath = path.resolve(__dirname, '../out/main/index.js');

const electronPath = await ensureElectron();
const child = spawn(
  electronPath,
  [mainPath, ...process.argv.slice(2)],
  {
    stdio: 'inherit'
  }
);

child.on('exit', code => process.exit(code ?? 0));
