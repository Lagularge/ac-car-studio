import React from 'react';
import ReactDOM from 'react-dom/client';
import { ensureAcApiBridge } from './bridge/acBridge';
import App from './App';
import './index.css';

// Initialize native WebView2 bridge (no-op if Electron preload already injected window.acApi)
ensureAcApiBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
