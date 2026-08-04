import { useCallback, useEffect, useState } from 'react';

import { resolveTheme, toggleTheme, THEMES } from '../lib/theme.js';

const TABS = [
  { id: 'scan', label: 'Scan' },
  { id: 'history', label: 'Historik' },
  { id: 'about', label: 'Om' },
];

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export default function Masthead({ view, onChange }) {
  const [theme, setTheme] = useState(() => resolveTheme());

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChangePref = () => {
      // Kun følg systemet når brugeren ikke selv har valgt.
      try {
        if (localStorage.getItem('soelleaki-theme')) return;
      } catch {
        // Ignorer — resolveTheme håndterer fejl.
      }
      setTheme(resolveTheme());
    };
    media.addEventListener('change', onChangePref);
    return () => media.removeEventListener('change', onChangePref);
  }, []);

  const onToggleTheme = useCallback(() => {
    setTheme(toggleTheme(theme));
  }, [theme]);

  const dark = theme === THEMES.DARK;

  return (
    <header className="masthead">
      <div className="masthead__top">
        <div className="masthead__title">
          <h1>Glutentjek</h1>
          <p className="masthead__sub">Stregkodekontrol · alt data bliver på enheden</p>
        </div>

        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={dark ? 'Skift til lyst tema' : 'Skift til mørkt tema'}
          aria-pressed={dark}
          title={dark ? 'Lyst tema' : 'Mørkt tema'}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      <nav className="tabs" aria-label="Hovedmenu">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab${view === tab.id ? ' tab--on' : ''}`}
            aria-current={view === tab.id ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
