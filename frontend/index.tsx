import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import './index.css';
import { GlobalErrorBoundary } from './src/components/GlobalErrorBoundary';
import { installGlobalClientTelemetry } from './src/shared/services/clientTelemetry';

// Nao registrar Service Worker (apenas app, sem comportamento PWA/site em dev)
installGlobalClientTelemetry();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>
);
