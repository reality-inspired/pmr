import React from 'react';
import { useAuth } from './authState';
import { InteractionType, type Configuration } from '@azure/msal-browser';
import { MsalAuthenticationTemplate, MsalProvider, useMsal } from '@azure/msal-react';

const AccountTracker = React.memo(({ children }: React.PropsWithChildren) => {
  const { instance, accounts } = useMsal();
  const { account, scopes, actions: { setAccount } } = useAuth();
  const [active, setActive] = React.useState(instance.getActiveAccount());

  // will initialize if accounts exist but no active account set
  React.useEffect(() => {
    if (!active && accounts.length > 0)
      instance.setActiveAccount(accounts[0]);
  }, [instance, accounts, active]);

  // keeps active up to date with the active inside instance
  React.useEffect(() => {
    const callbackId = instance.addEventCallback(() => setActive(instance.getActiveAccount()), ['msal:activeAccountChanged']);
    return () => { if (callbackId) instance.removeEventCallback(callbackId); }
  }, [instance]);

  React.useEffect(() => setAccount(active), [setAccount, active]);

  return (
    <MsalAuthenticationTemplate key={active?.homeAccountId} interactionType={InteractionType.Redirect} authenticationRequest={{ scopes }}>
      {account && children}
    </MsalAuthenticationTemplate>
  );
});

export const AuthGuard = React.memo(({ children }: React.PropsWithChildren) => {
  const { instance, tenantId, clientId, accountType, actions } = useAuth();
  const { authority, onRedirectNavigate, setConfig } = actions;
  const config = React.useMemo<Configuration>(() => ({
    auth: {
      clientId,
      authority: authority(tenantId, accountType),
      onRedirectNavigate,
    },
  }), [tenantId, clientId, accountType, authority, onRedirectNavigate]);

  React.useEffect(() => setConfig(config), [config]);

  return instance && (
    <MsalProvider instance={instance}>
      <AccountTracker>
        {children}
      </AccountTracker>
    </MsalProvider>
  );
});
