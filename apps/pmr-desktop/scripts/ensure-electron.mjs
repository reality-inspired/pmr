import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { download } from '@electron/get';
import extract from 'extract-zip';

async function getElectronVersion() {
  const electronPackageUrl = import.meta.resolve('electron/package.json');
  const electronPackage = JSON.parse(await fs.promises.readFile(new URL(electronPackageUrl), 'utf8'));
  return electronPackage.version;
}

function getInstallPath(version, runtimesRoot) {
  return path.join(
    runtimesRoot,
    'electron',
    version,
    `${process.platform}-${process.arch}`
  );
}

function getExecutablePath(installPath) {
  switch (process.platform) {
    case 'win32': return path.join(installPath, 'electron.exe');
    case 'linux': return path.join(installPath, 'electron');
    case 'darwin':
      return path.join(
        installPath,
        'Electron.app',
        'Contents',
        'MacOS',
        'Electron'
      );

    default: throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export async function ensureElectron(options = {}) {
  const version = options.version || await getElectronVersion();
  const runtimesRoot = options.runtimesRoot || path.join(os.homedir(), '.cmdless', 'runtimes');

  const installPath = getInstallPath(version, runtimesRoot);
  const executable = getExecutablePath(installPath);

  if (fs.existsSync(executable))
    return executable;

  console.log(`installing Electron version ${version} at '${installPath}'...`);

  // download zip, write to temp, rename on success to guarantee install succeeds
  const zipPath = await download(version);
  try {
    const tempPath = `${installPath}.tmp`;
    const tempExecutable = getExecutablePath(tempPath);

    // recreate the temp install path to ensure it is fresh
    await fs.promises.rm(tempPath, { recursive: true, force: true });
    await fs.promises.mkdir(tempPath, { recursive: true });

    // extract zip into temp install path and ensure the executable exists
    await extract(zipPath, { dir: tempPath });
    if (!fs.existsSync(tempExecutable))
      throw new Error(`Electron ${version} extracted but executable missing from temp '${tempExecutable}'`);

    // delete real install path if it exists, so the rename succeeds
    await fs.promises.rm(installPath, { recursive: true, force: true });
    await fs.promises.rename(tempPath, installPath);
  } finally {
    await fs.promises.rm(zipPath, { force: true });
    console.log(`deleted cached ${version} zip file at '${zipPath}'...`);
  }

  return executable;
}
