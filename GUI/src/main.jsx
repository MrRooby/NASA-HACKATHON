import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import App from './App.jsx';
import Providers from './Providers.jsx';
import { applyTheme, getThemeById, loadSelectedThemeId } from './theme/index.js';

// Theme variables before the first paint (SettingsProvider keeps them in sync afterwards).
applyTheme(getThemeById(loadSelectedThemeId()));

createRoot(document.getElementById('root')).render(
  <Providers>
    <App />
  </Providers>,
);
