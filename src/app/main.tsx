import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useSettings } from '../state/settings';
import { App, DataError } from './App';
import { appData } from './appData';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('The page is missing its #root element.');
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Load and validate /data once, then restore the learner's settings (irsim:settings), before the first render.
let failure: string | null = null;
try {
  const data = appData();
  useSettings.getState().init(data.defaultSettings, data.limits, storage());
} catch (cause) {
  failure = cause instanceof Error ? cause.message : String(cause);
}

createRoot(container).render(
  <StrictMode>{failure === null ? <App /> : <DataError message={failure} />}</StrictMode>,
);
