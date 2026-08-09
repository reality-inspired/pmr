import React from 'react';
import { useAuth } from './authState';
import { type AccountInfo, InteractionType, PublicClientApplication, type Configuration } from '@azure/msal-browser';
import { MsalAuthenticationTemplate, MsalProvider, useMsal } from '@azure/msal-react';
import { GraphApiContext, makeGraphApi, type GraphApi } from './graphApiContext';

const GraphApiProvider = React.memo(({ account, children }: React.PropsWithChildren<{ account: AccountInfo }>) => {
  const { instance, inProgress } = useMsal();
  const { deviceId, scopes } = useAuth();
  const [context, setContext] = React.useState<GraphApi | null>(null);

  // heartbeat that keeps this device alive
  React.useEffect(() => {
    const { context, run, dispose } = makeGraphApi(deviceId, async () => {
      const result = await instance.acquireTokenSilent({ account, scopes });
      return result.accessToken;
    });
    run();
    setContext(context);
    return () => {
      dispose();
      setContext(null);
    };
  }, [instance, inProgress, account, deviceId, scopes]);

  return context && (
    <GraphApiContext.Provider value={context}>
      {children}
    </GraphApiContext.Provider>
  );
});

const AccountTracker = React.memo(({ scopes, children }: React.PropsWithChildren<{ scopes: string[] }>) => {
  const { instance, inProgress, accounts } = useMsal();
  const account = instance.getActiveAccount();
  const [active, setActive] = React.useState(instance.getActiveAccount());
  const [key, setKey] = React.useState(active?.homeAccountId);

  // will initialize if accounts exist but no active account set
  React.useEffect(() => {
    if (!account && accounts.length > 0)
      instance.setActiveAccount(accounts[0]);
  }, [instance, accounts, account]);

  // keeps active up to date with the active inside instance
  React.useEffect(() => {
    const callbackId = instance.addEventCallback(() => setActive(instance.getActiveAccount()), ['msal:activeAccountChanged']);
    if (callbackId) return () => instance.removeEventCallback(callbackId);
  }, [instance]);

  // updates the key for auth template when active has changed and instance is no longer busy
  React.useEffect(() => {
    if (inProgress === 'none')
      setKey(active?.homeAccountId);
  }, [inProgress, active]);

  return (
    <MsalAuthenticationTemplate key={key} interactionType={InteractionType.Redirect} authenticationRequest={{ scopes }}>
      {account && (
        <GraphApiProvider account={account}>
          {children}
        </GraphApiProvider>
      )}
    </MsalAuthenticationTemplate>
  );
});

export const AuthGuard = React.memo(({ children }: React.PropsWithChildren) => {
  const { tenantId, clientId, scopes, actions } = useAuth();

  const { onRedirectNavigate } = actions;
  const config = React.useMemo<Configuration>(() => ({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/consumers`,
      onRedirectNavigate,
    },
  }), [tenantId, clientId, onRedirectNavigate]);

  const instance = React.useMemo(() => new PublicClientApplication(config), [config]);

  return (
    <MsalProvider instance={instance}>
      <AccountTracker scopes={scopes}>
        {children}
      </AccountTracker>
    </MsalProvider>
  );
});