import { AppShell, Button, Divider, Menu } from '@mantine/core';
import { useMsal } from '@azure/msal-react';
import { useAuth } from './auth/authState';

function App() {
  const { inProgress } = useMsal();
  const { account, actions: { logout } } = useAuth();

  return (
    <AppShell navbar={{ width: 250, breakpoint: 'xs' }}>
      <AppShell.Navbar>
        <AppShell.Section></AppShell.Section>
        <AppShell.Section grow></AppShell.Section>
        <Divider />
        <AppShell.Section p="xs">
          <Menu position='top'>
            <Menu.Target>
              <Button variant='light' w="100%">{account.name}</Button>
            </Menu.Target>
            <Menu.Dropdown miw={200}>
              <Menu.Item disabled={inProgress !== 'none'} onClick={logout}>Logout</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </AppShell.Section>
      </AppShell.Navbar>
    </AppShell>
  );
}

export default App
