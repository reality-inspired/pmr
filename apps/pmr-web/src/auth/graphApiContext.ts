import React from 'react';
import { Client } from "@microsoft/microsoft-graph-client";

type DeviceEntry = {
  deviceId: string;
};

const HEARTBEAT_MS = 10_000;
const STALE_MS = 300_000;

export class GraphApiHandler {
  readonly deviceId: string;
  readonly client: Client;

  private _running = true;
  get running() { return this._running; }

  constructor(deviceId: string, getToken: () => Promise<string>) {
    this.deviceId = deviceId;
    this.client = Client.init({
      authProvider: async done => {
        try {
          done(null, await getToken());
        }
        catch (error) {
          done(error as Error, null);
        }
      },
    });
  }

  log(...messages: string[]) {
    console.log(...messages);
  }

  private api(path: string) {
    return this.client.api(`/me/drive/special/approot:${path}`);
  }

  async children(path = "") {
    return this.api(`${path}:/children`).get();
  }

  async putJson<T>(path: string, value: T) {
    return this.api(`${path}:/content`)
      .header("Content-Type", "application/json")
      .put(JSON.stringify(value));
  }

  async getJson<T>(path: string): Promise<T> {
    return this.api(`${path}:/content`).get();
  }

  async deleteItem(id: string) {
    return this.client.api(`/me/drive/items/${id}`).delete();
  }

  private async heartbeat() {
    const entry: DeviceEntry = {
      deviceId: this.deviceId,
    };

    // Create/update this device.
    await this.putJson(`/devices/${this.deviceId}.json`, entry)
      .then(() => this.log(`wrote ${this.deviceId}.json`));

    // Get all registered devices.
    const result = await this.children('/devices');

    for (const item of result.value) {
      if (!item.name.endsWith(".json"))
        continue;

      // use the DriveItem's lastModifiedDateTime to delete stale files
      const modified = new Date(item.lastModifiedDateTime).getTime();
      if (Date.now() - modified > STALE_MS) {
        await this.deleteItem(item.id)
          .then(() => this.log(`deleted ${item.name}`));
      }
    }
  }

  async run() {
    while (this.running) {
      try { await this.heartbeat(); }
      catch (error) { console.error("Heartbeat failed", error); }
      await new Promise(resolve => setTimeout(resolve, HEARTBEAT_MS));
    }
  };

  dispose() {
    this._running = false;
  }
}

export type GraphApi = {};

export const GraphApiContext = React.createContext<GraphApi | null>(null);

export const useGraphApi = () => {
  const context = React.useContext(GraphApiContext);
  if (!context) throw Error('Must be used inside GraphApiProvider');
  return context;
};

export function makeGraphApi(deviceId: string, getToken: () => Promise<string>) {
  const handler = new GraphApiHandler(deviceId, getToken);
  const context: GraphApi = {};

  return {
    context,
    run: () => handler.run(),
    dispose: () => handler.dispose(),
  };
}