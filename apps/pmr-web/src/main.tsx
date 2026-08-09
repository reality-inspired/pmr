import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createTheme, MantineProvider } from '@mantine/core';
import App from './App.tsx'
import { AuthGuard } from './auth/AuthGuard.tsx'
import '@mantine/core/styles.css';
import './index.css'

const theme = createTheme({
  /** Your theme override here */
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <AuthGuard>
        <App />
      </AuthGuard>
    </MantineProvider>
  </StrictMode>,
)
