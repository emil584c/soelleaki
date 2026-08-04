/**
 * Tema (lys/mørk) — gemmes i localStorage, så valget overlever genindlæsning.
 * IndexedDB bruges til scanninger; et enkelt præferenceflag hører hjemme her.
 */

export const THEME_KEY = 'soelleaki-theme';
export const THEMES = Object.freeze({ LIGHT: 'light', DARK: 'dark' });

const THEME_COLORS = {
  [THEMES.LIGHT]: '#F2F4F7',
  [THEMES.DARK]: '#0C0E12',
};

export function readStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === THEMES.DARK || value === THEMES.LIGHT) return value;
  } catch {
    // Privat tilstand / blokering — fald tilbage til systemvalg.
  }
  return null;
}

export function systemPrefersDark() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Aktivt tema: gemt valg, ellers systemets prefers-color-scheme. */
export function resolveTheme(stored = readStoredTheme()) {
  if (stored) return stored;
  return systemPrefersDark() ? THEMES.DARK : THEMES.LIGHT;
}

export function applyTheme(theme) {
  const next = theme === THEMES.DARK ? THEMES.DARK : THEMES.LIGHT;
  document.documentElement.setAttribute('data-theme', next);
  document.documentElement.style.colorScheme = next;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[next]);

  return next;
}

export function persistTheme(theme) {
  const next = applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Gemning er bekvemmelighed; UI'en skifter stadig.
  }
  return next;
}

export function toggleTheme(current) {
  const next = current === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
  return persistTheme(next);
}
