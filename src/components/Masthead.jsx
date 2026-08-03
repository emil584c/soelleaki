const TABS = [
  { id: 'scan', label: 'Scan' },
  { id: 'history', label: 'Historik' },
  { id: 'about', label: 'Om' },
];

export default function Masthead({ view, onChange }) {
  return (
    <header className="masthead">
      <div className="masthead__title">
        <h1>Glutentjek</h1>
        <p className="masthead__sub">Stregkodekontrol · alt data bliver på enheden</p>
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
