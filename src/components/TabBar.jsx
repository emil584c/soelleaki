import { TABS } from './Masthead.jsx';

/**
 * Bundnavigation til telefoner og små tablets — faste knapper i bunden,
 * som i en indbygget app. CSS'en styrer hvornår den findes: under
 * 900px-brydepunktet vises den her og mastheadets faner gemmes; over
 * beholder skrivebordet sine faner og denne står som display: none
 * (og er dermed også ude af skærmlæserens træ — der er aldrig to
 * hovedmenuer på én gang).
 */

const ICONS = {
  scan: (
    // Sigtekorn med stregkode — samme motiv som app-ikonet.
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M8 9.5v5M12 9.5v5M15 9.5v5M17.5 9.5v5" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  about: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.01" />
    </svg>
  ),
};

export default function TabBar({ view, onChange }) {
  return (
    <nav className="tabbar" aria-label="Hovedmenu">
      <div className="tabbar__row">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tabbar__tab${view === tab.id ? ' tabbar__tab--on' : ''}`}
            aria-current={view === tab.id ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
          >
            {ICONS[tab.id]}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
