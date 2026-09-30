import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './app/App';
import './styles/tokens.css';
import './styles/global.css';
import './styles/polish.css';
import './styles/ui.css';

const THEME_STORAGE_KEY = 'fila-theme';

function applyTheme(theme: string | null) {
  const displayLockedDark = document.documentElement.dataset.displayThemeLock === 'dark';
  const resolvedTheme = displayLockedDark ? 'dark' : theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
}

try {
  applyTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
} catch {
  applyTheme('dark');
}

window.addEventListener('storage', (event) => {
  if (event.key === THEME_STORAGE_KEY) applyTheme(event.newValue);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
