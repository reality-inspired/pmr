import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { download } from '@electron/get';
import extract from 'extract-zip';

function getRuntimeRoot(version, cacheRoot) {
  return path.join(
    cacheRoot,
    version,
    `${process.platform}-${process.arch}`
  );
}

function getExecutablePath(runtimeRoot) {
  switch (process.platform) {
    case 'win32': return path.join(runtimeRoot, 'electron.exe');
    case 'linux': return path.join(runtimeRoot, 'electron');
    case 'darwin':
      return path.join(
        runtimeRoot,
        'Electron.app',
        'Contents',
        'MacOS',
        'Electron'
      );

    default: throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export async function ensureElectron(version, cacheRoot) {
  const runtimeRoot = getRuntimeRoot(version, cacheRoot);
  const executable = getExecutablePath(runtimeRoot);

  if (fs.existsSync(executable))
    return executable;

  await fs.promises.mkdir(runtimeRoot, { recursive: true });

  const zipPath = await download(version);

  await extract(zipPath, { dir: runtimeRoot });

  if (!fs.existsSync(executable))
    throw new Error(`Electron ${version} extracted but executable was not found at ${executable}`);

  return executable;
}
