// Dev-only entry for pixel-gallery.html (not part of the production build inputs).
import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import { I18nProvider } from '../i18n/index.js';
import { BUILTIN_THEMES, applyTheme } from '../theme/index.js';
import { PixelGallery } from './PixelGallery.jsx';

const params = new URLSearchParams(window.location.search);
const theme = BUILTIN_THEMES.find(t => t.id === params.get('theme')) || BUILTIN_THEMES[0];
applyTheme(theme);
if (params.get('motion') === 'off') document.documentElement.setAttribute('data-gallery-still', '');

createRoot(document.getElementById('root')).render(
  <I18nProvider initialLang={params.get('lang') || 'en'}>
    <PixelGallery initialTheme={theme.id} />
  </I18nProvider>,
);
