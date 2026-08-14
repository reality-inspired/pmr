import { Client, GraphRequest } from "@microsoft/microsoft-graph-client";
import { Emitter } from "./emitter";

type PeerEntry = {
  deviceId: string;
  instanceId: string;
};

type SignalEntry = {
  sessionId: string;
  source: PeerEntry;
  target: PeerEntry;
};

type MaybePromise<T> = Promise<T> | T;
type ModifyRequest = (r: GraphRequest) => GraphRequest;
const DEFAULT_MODIFY_REQUEST: ModifyRequest = x => x;

const PAGINATION_DELAY_MS = 500;
const HEARTBEAT_MS = 2_500;
const DEVICE_STALE_MS = 150_000;
const DEFAULT_GUID = crypto.randomUUID();

function delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

class PeerId {
  static SEPARATOR = '--';
  static get length() { return (DEFAULT_GUID.length * 2) + '--'.length; }

  static fromEntry(entry: PeerEntry) {
    return `${entry.deviceId}${this.SEPARATOR}${entry.instanceId}`;
  }

  static toEntry(id: string): PeerEntry | null {
    // be super sure this string is a host id {deviceId}--{instanceId}
    if (!id || id.length !== this.length)
      return null;

    // separate device id and instance id
    const split = id.split(this.SEPARATOR);
    if (split.length !== 2)
      return null;

    // this file just got written; ignore it and don't add to lists
    const [deviceId, instanceId] = split;
    if (DEFAULT_GUID.length !== deviceId.length || DEFAULT_GUID.length !== instanceId.length)
      return null;

    return { deviceId, instanceId };
  }
}

class SignalId {
  static SEPARATOR = '++';
  static get length() { return (PeerId.length * 2) + DEFAULT_GUID.length + (this.SEPARATOR.length * 2); }

  static fromEntry(entry: SignalEntry) {
    return `${entry.sessionId}${this.SEPARATOR}${PeerId.fromEntry(entry.source)}${this.SEPARATOR}${PeerId.fromEntry(entry.target)}`;
  }

  static toEntry(id: string): SignalEntry | null {
    if (!id || id.length !== this.length)
      return null;

    const split = id.split(this.SEPARATOR);
    if (split.length !== 3)
      return null;

    const [sessionId, sourceId, targetId] = split;
    if (sessionId.length != DEFAULT_GUID.length)
      return null;

    const [source, target] = [PeerId.toEntry(sourceId), PeerId.toEntry(targetId)];
    if (!source || !target)
      return null;

    return { sessionId, source, target };
  }
}

type GraphEvents = {};

export class GraphApiHandler extends Emitter<GraphEvents> {
  readonly peer: PeerEntry;
  readonly id: string;
  readonly client: Client;
  readonly pending = new Set<string>();
  readonly created = new Set<string>();

  private approotId?: string;
  async getApprootId() {
    if (!this.approotId) {
      const item = await this.client.api("/me/drive/special/approot").get();
      this.approotId = item.id as string;
    }
    return this.approotId;
  }

  private _running = true;
  get running() { return this._running; }

  constructor(peer: PeerEntry, getToken: () => Promise<string>) {
    super();
    this.peer = peer;
    this.id = PeerId.fromEntry(peer);
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

  approot(path: string) {
    return `/me/drive/special/approot:${path}`;
  }

  private api(uri: string, modify = DEFAULT_MODIFY_REQUEST) {
    return modify(this.client.api(uri));
  }

  async *paginate<T>(uri = "", modify?: ModifyRequest): AsyncGenerator<T> {
    let result = await this.api(uri, modify).get();
    while (true) {
      for (const item of result.value)
        yield item as T;
      const nextLink = result["@odata.nextLink"];
      if (!nextLink)
        return;
      await delay(PAGINATION_DELAY_MS);
      result = await this.client.api(nextLink).get();
    }
  }

  async *children<T = any>(path = "", modify?: ModifyRequest): AsyncGenerator<T> {
    const uri = !path || path === "/" ? "/me/drive/special/approot/children" : this.approot(`${path}:/children`);
    yield* this.paginate<T>(uri, modify);
  }

  async postFolder(parentId: string, name: string) {
    parentId ||= await this.getApprootId();
    return this.client.api(`/me/drive/items/${parentId}/children`)
      .post({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail"
      });
  }

  async ensureFolder(parentId: string, name: string) {
    parentId ||= await this.getApprootId();
    const existing = await this.client
      .api(`/me/drive/items/${parentId}:/${name}`)
      .get()
      .catch(() => null);

    if (existing)
      return existing;

    try { return await this.postFolder(parentId, name); }
    catch (e) { console.log(e); return null; }
  }

  putJson<T>(path: string, value: T, modify?: ModifyRequest) {
    return this.api(this.approot(`${path}:/content`), modify)
      .header("Content-Type", "application/json")
      .put(JSON.stringify(value));
  }

  getJson<T>(path: string, modify?: ModifyRequest): Promise<T> {
    return this.api(this.approot(`${path}:/content`), modify).get();
  }

  deleteItem(id: string, eTag?: string, modify?: ModifyRequest) {
    const request = this.api(`/me/drive/items/${id}`, modify);
    return (eTag ? request.header("If-Match", eTag) : request).delete();
  }

  async ifNotStaleBy(timestamp: number, item: any, action?: () => MaybePromise<void>) {
    const modified = new Date(item.lastModifiedDateTime).getTime();
    if (timestamp - modified > DEVICE_STALE_MS) {
      try {
        await this.deleteItem(item.id, item.eTag);
        this.log(`deleted ${item.name} (${item.eTag})`);
      } catch (e: any) { if (e?.statusCode !== 412) throw e; }
      return false;
    } else {
      await action?.();
      return true;
    }
  }

  private async heartbeat() {
    // Create/update this device entry
    const putItem = await this.putJson(`/devices/${this.id}`, {});
    const timestamp = new Date(putItem.lastModifiedDateTime).getTime();
    this.log(`wrote ${this.id}`);

    // collect registered devices as peers
    const peers: Record<string, PeerEntry> = {};
    for await (const item of this.children("/devices", x => x.orderby('name'))) {
      // use the DriveItem's lastModifiedDateTime to delete stale files
      await this.ifNotStaleBy(timestamp, item, () => {
        // track the device for this heartbeat
        const peer = PeerId.toEntry(item.name);
        if (peer && this.id !== item.name)
          peers[item.name] = peer;
      });
    }

    const removing = new Set<string>(...this.created);
    for await (const item of this.children("/signals", x => x.orderby('name'))) {
      await this.ifNotStaleBy(timestamp, item, () => {
        // track the device for this heartbeat
        const signal = SignalId.toEntry(item.name);
        if (signal) removing.delete(`${PeerId.fromEntry(signal.source)}++${PeerId.fromEntry(signal.target)}`);

        //TODO: process signal?
      });
    }

    // entries still in removing were no longer found; clean them up
    for (const item of removing)
      this.created.delete(item);

    // entries in pending need to be created
    for (const item of this.pending) {
      const signalId = `${crypto.randomUUID()}++${item}`;
      await this.putJson(`/signals/${signalId}`, {});
    }
  }

  connect(peer: PeerEntry) {
    if (peer.deviceId === this.peer.deviceId && peer.instanceId === this.peer.instanceId)
      return;
    this.pending.add(`${this.id}++${PeerId.fromEntry(peer)}`);
  }

  async run() {
    await this.ensureFolder("", "signals");
    while (this.running) {
      try { await this.heartbeat(); }
      catch (error) { console.error("Heartbeat failed", error); }
      await delay(HEARTBEAT_MS);
    }
  };

  dispose() {
    this._running = false;
  }
}
