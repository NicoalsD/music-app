import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme/tokens.css';
import './ui/theme/global.css';
import { KitPreview } from './ui/kit/KitPreview';

// Temporary: renders the UI kit showcase. The app shell replaces this later.
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <KitPreview />
    </StrictMode>,
  );
}
