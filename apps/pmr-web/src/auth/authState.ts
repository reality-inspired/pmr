import { shallow } from "zustand/shallow";
import { createWithEqualityFn } from "zustand/traditional";
import { type AccountInfo, type Configuration, PublicClientApplication } from '@azure/msal-browser';
import { GraphApiHandler } from "./graphApiContext";

export type AuthActions = {
  set(tenantId: string, clientId: string, accountType: AccountType): void;
  authority(tenantId: string, accountType: AccountType): string;
  onRedirectNavigate(url: string): boolean | void;
  blockExternalRedirect<T>(action: () => Promise<T>): Promise<T>;
  logout(): Promise<void>;
  setConfig(value: Configuration): void;
  setAccount(value: AccountInfo | null): void;
};

export const AccountTypes = {
  tenant: 'Accounts in this organizational directory only',
  organizations: 'Accounts in any organizational directory',
  common: 'Accounts in any organizational directory and personal Microsoft accounts',
  consumers: 'Personal Microsoft accounts only',
} as const;

export type AccountType = keyof typeof AccountTypes;

export type AuthState = {
  deviceId: string;
  tenantId: string;
  clientId: string;
  accountType: AccountType;
  allowExternalRedirect: boolean;
  scopes: string[];
  config: Configuration;
  instance: PublicClientApplication;
  account: AccountInfo;
  graph: GraphApiHandler;
  actions: AuthActions;
};

class AuthStorage {
  static DEVICE_ID = 'PMR_DEVICE_ID';
  static TENANT_ID = 'PMR.TENANT_ID';
  static CLIENT_ID = 'PMR.CLIENT_ID';
  static ACCOUNT_TYPE = 'PMR.ACCOUNT_TYPE';
  get deviceId() {
    const value = localStorage.getItem(AuthStorage.DEVICE_ID) ?? crypto.randomUUID();
    localStorage.setItem(AuthStorage.DEVICE_ID, value);
    return value;
  }
  get tenantId() { return localStorage.getItem(AuthStorage.TENANT_ID) ?? 'bb2d54d4-c3e0-4c74-b765-8780e61ed984'; }
  set tenantId(value: string) { localStorage.setItem(AuthStorage.TENANT_ID, value); }
  get clientId() { return localStorage.getItem(AuthStorage.CLIENT_ID) ?? 'bd4fb660-876f-4c50-bec4-e70aa400ed2c'; }
  set clientId(value: string) { localStorage.setItem(AuthStorage.CLIENT_ID, value); }
  get accountType() { return (localStorage.getItem(AuthStorage.ACCOUNT_TYPE) ?? 'consumers') as AccountType; }
  set accountType(value: AccountType) { localStorage.setItem(AuthStorage.ACCOUNT_TYPE, value); }
}

export const useAuth = createWithEqualityFn<AuthState>()((set, get) => {
  const storage = new AuthStorage();
  const instanceId = crypto.randomUUID();
  const actions: AuthActions = {
    set(tenantId, clientId, accountType) {
      storage.tenantId = tenantId;
      storage.clientId = clientId;
      storage.accountType = accountType;
      set({
        tenantId: storage.tenantId,
        clientId: storage.clientId,
        accountType: storage.accountType,
      });
    },
    authority(tenantId, accountType) {
      return `https://login.microsoftonline.com/${accountType === 'tenant' ? tenantId : accountType}`
    },
    onRedirectNavigate() {
      return get().allowExternalRedirect;
    },
    blockExternalRedirect: async (action) => {
      set({ allowExternalRedirect: false });
      try { return await action(); }
      finally { set({ allowExternalRedirect: true }); }
    },
    logout() {
      const { instance, account } = get();
      return actions.blockExternalRedirect(() => instance.logoutRedirect({ account }));
    },
    setConfig(value) {
      const { config, instance, account } = get();
      if (config === value) return;
      if (instance && account) {
        actions.logout();
        return;
      }
      set({ config: value, instance: new PublicClientApplication(value) });
    },
    setAccount(value) {
      const { deviceId, instance, account, graph, scopes } = get()
      if (account === value) return;
      if (graph) graph.dispose();
      if (value) {
        const handler = new GraphApiHandler({ deviceId, instanceId }, async () => {
          const result = await instance.acquireTokenSilent({ account: value, scopes });
          return result.accessToken;
        });
        handler.run();
        set({ account: value, graph: handler });
      } else {
        set({ account: null!, graph: null! });
      }
    },
  };
  return {
    deviceId: storage.deviceId,
    tenantId: storage.tenantId,
    clientId: storage.clientId,
    accountType: storage.accountType,
    allowExternalRedirect: true,
    scopes: ['Files.ReadWrite.AppFolder'],
    config: null!,
    instance: null!,
    account: null!,
    graph: null!,
    actions,
  };
}, shallow);
