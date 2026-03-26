import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import './index.css';
import { GlobalErrorBoundary } from './src/components/GlobalErrorBoundary';
import { installGlobalClientTelemetry } from './src/shared/services/clientTelemetry';
import { appQueryClient } from './src/shared/services/queryClient';

// Nao registrar Service Worker (apenas app, sem comportamento PWA/site em dev)
installGlobalClientTelemetry();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={appQueryClient}>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);
