import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme/tokens.css';
import './ui/theme/global.css';
import { App } from './app/App';
import { createApp } from './app/createApp';

// The runtime is built once at module scope, outside React, so StrictMode's
// double-invoked effects can never create a second player or a second store.
const app = createApp();
void app.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.dispose());
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App store={app.store} lyricsProvider={app.lyricsProvider} />
    </StrictMode>,
  );
}
