import { spawn } from "node:child_process";
import { installElectron } from "./install-electron.mjs";

const electronPath = await installElectron();
const child = spawn('electron-vite', ['dev'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_EXEC_PATH: electronPath
  }
});

child.on('exit', code => process.exit(code ?? 0));
