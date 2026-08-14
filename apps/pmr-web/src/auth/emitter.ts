export type EmitterEventMap = Record<string, readonly unknown[]>;

export class Emitter<Events extends EmitterEventMap = {}> {
  private readonly target = new EventTarget();
  private readonly handlers = new WeakMap<Function, EventListener>();

  on<K extends keyof Events>(
    type: K,
    handler: (...args: Events[K]) => void,
  ): this {
    const wrapped: EventListener = (event) => {
      handler(...(event as CustomEvent<Events[K]>).detail);
    };

    this.handlers.set(handler, wrapped);
    this.target.addEventListener(type as string, wrapped);

    return this;
  }

  once<K extends keyof Events>(
    type: K,
    handler: (...args: Events[K]) => void,
  ): this {
    const wrapped: EventListener = (event) => {
      this.handlers.delete(handler);
      handler(...(event as CustomEvent<Events[K]>).detail);
    };

    this.handlers.set(handler, wrapped);
    this.target.addEventListener(type as string, wrapped, { once: true });

    return this;
  }

  off<K extends keyof Events>(
    type: K,
    handler: (...args: Events[K]) => void,
  ): this {
    const wrapped = this.handlers.get(handler);

    if (wrapped) {
      this.target.removeEventListener(type as string, wrapped);
      this.handlers.delete(handler);
    }

    return this;
  }

  emit<K extends keyof Events>(
    type: K,
    ...args: Events[K]
  ): boolean {
    return this.target.dispatchEvent(
      new CustomEvent(type as string, {
        detail: args,
      }),
    );
  }

  subscribe<K extends keyof Events>(
    type: K,
    handler: (...args: Events[K]) => void,
  ): () => void {
    this.on(type, handler);
    return () => this.off(type, handler);
  }
}

export class WindowEmitter<
  TReceive extends EmitterEventMap,
  TSend extends EmitterEventMap,
> {
  private readonly receiver: Window;
  private readonly sender: Window;
  private readonly listeners = new Map<string, Map<Function, EventListener>>();

  constructor(receiver: Window, sender: Window) {
    this.receiver = receiver;
    this.sender = sender;
  }

  on<K extends keyof TReceive & string>(
    type: K,
    handler: (...args: TReceive[K]) => void,
  ): this {
    const wrapped: EventListener = (e) => {
      const msg = e as MessageEvent<{ type: string; args: unknown[] }>;
      if (msg.source !== this.sender || msg.data?.type !== type) return;
      handler(...(msg.data.args as unknown as TReceive[K]));
    };

    if (!this.listeners.has(type)) this.listeners.set(type, new Map());
    this.listeners.get(type)!.set(handler, wrapped);
    this.receiver.addEventListener('message', wrapped);

    return this;
  }

  once<K extends keyof TReceive & string>(
    type: K,
    handler: (...args: TReceive[K]) => void,
  ): this {
    const wrapper = (...args: TReceive[K]) => {
      this.off(type, wrapper);
      handler(...args);
    };
    return this.on(type, wrapper);
  }

  off<K extends keyof TReceive & string>(
    type: K,
    handler: (...args: TReceive[K]) => void,
  ): this {
    const wrapped = this.listeners.get(type)?.get(handler);

    if (wrapped) {
      this.receiver.removeEventListener('message', wrapped);
      this.listeners.get(type)!.delete(handler);
    }

    return this;
  }

  emit<K extends keyof TSend & string>(type: K, ...args: TSend[K]): void {
    this.sender.postMessage({ type, args }, '*');
  }

  subscribe<K extends keyof TReceive & string>(
    type: K,
    handler: (...args: TReceive[K]) => void,
  ): () => void {
    this.on(type, handler);
    return () => this.off(type, handler);
  }

  destroy() {
    for (const handlers of this.listeners.values())
      for (const wrapped of handlers.values())
        this.receiver.removeEventListener('message', wrapped);
    this.listeners.clear();
  }
}
