import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

function makeApi(): AppApi {
  const { ipcRenderer } = electronAPI;

  return {
    ping: () => ipcRenderer.send('ping'),
    versions: () => electronAPI.process.versions,
  };
}

// Custom APIs for renderer
const api = makeApi();

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
