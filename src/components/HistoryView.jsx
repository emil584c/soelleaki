import { useState } from 'react';

import StatusStamp from './StatusStamp.jsx';
import { clearScans, deleteScan } from '../lib/db.js';

const dateFormat = new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short' });

export default function HistoryView({ entries, onOpen, onChanged }) {
  const [confirmClear, setConfirmClear] = useState(false);

  const remove = async (id) => {
    await deleteScan(id);
    onChanged();
  };

  const clearAll = async () => {
    await clearScans();
    setConfirmClear(false);
    onChanged();
  };

  return (
    <section className="card">
      <div className="card__headrow">
        <h2 className="card__head">Historik</h2>
        {entries.length > 0 &&
          (confirmClear ? (
            <span className="confirm">
              <button type="button" className="btn btn--quiet" onClick={clearAll}>
                Slet alt
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => setConfirmClear(false)}
              >
                Fortryd
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn--quiet" onClick={() => setConfirmClear(true)}>
              Ryd
            </button>
          ))}
      </div>

      {entries.length === 0 ? (
        <p className="hint">Ingen scanninger endnu. De gemmes kun her på enheden.</p>
      ) : (
        <ol className="log">
          {entries.map((entry) => (
            <li key={entry.id} className="log__row">
              <button type="button" className="log__open" onClick={() => onOpen(entry)}>
                <StatusStamp status={entry.status} heuristic={entry.heuristic} size="mini" />
                <span className="log__text">
                  <span className="log__name">{entry.found ? entry.name : 'Ikke i databasen'}</span>
                  <span className="log__meta">
                    {entry.brands ? `${entry.brands} · ` : ''}
                    {entry.barcode}
                  </span>
                  <span className="log__meta">{dateFormat.format(entry.scannedAt)}</span>
                </span>
              </button>
              <button
                type="button"
                className="log__del"
                aria-label={`Slet scanning af ${entry.barcode}`}
                onClick={() => remove(entry.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      <p className="fineprint">* = formodning ud fra ingrediensliste, ikke et allergenfelt.</p>
    </section>
  );
}
