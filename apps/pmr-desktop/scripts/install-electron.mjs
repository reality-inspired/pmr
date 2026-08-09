import path from 'node:path';
import os from 'node:os';
import pkg from '../package.json' with { type: 'json' };
import { ensureElectron } from './ensure-electron.mjs';

export function installElectron() {
  const version = pkg.devDependencies.electron;
  const cacheRoot = path.join(os.homedir(), '.electron-runtimes');

  console.log(`installing Electron version ${version} into cache root '${cacheRoot}'...`);
  return ensureElectron(version, cacheRoot);
}
