import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Moonlight Seva: #root element is missing from index.html');

// StrictMode stays on deliberately. Its double-invoked effects are exactly what
// catches a Phaser instance that isn't being torn down properly — the single
// most common failure mode when embedding Phaser in React.
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
