import { spawn } from "node:child_process";
import { ensureElectron } from "./ensure-electron.mjs";

const electronPath = await ensureElectron();
const child = spawn('electron-vite', ['dev'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_EXEC_PATH: electronPath
  }
});

child.on('exit', code => process.exit(code ?? 0));
