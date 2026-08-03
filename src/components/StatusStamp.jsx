import { STATUS, STATUS_ACTION, STATUS_LABEL } from '../lib/glutenStatus.js';

/**
 * Appens signaturelement: resultatet som et fysisk godkendelses- eller
 * afvisningsstempel snarere end et farvet badge.
 *
 * Stemplet har to akser, og de skal holdes fra hinanden:
 *
 *   farven  hvor alvorligt det er;
 *   rammen  hvor svaret kommer fra — hel ramme er et allergenfelt eller en
 *           mærkning, stiplet ramme er læst ud af ingredienslisten.
 *
 * Derfor kan en læsning godt få sit eget stempel. Den kan bare aldrig se
 * ud som en deklaration.
 */
export default function StatusStamp({ status, heuristic = false, grains = [], size = 'full' }) {
  const tone = toneFor(status, grains);
  const frame = heuristic ? ' stamp--unconfirmed' : '';

  if (size === 'mini') {
    return (
      <span
        className={`mini mini--${tone}${heuristic ? ' mini--unconfirmed' : ''}`}
        title={STATUS_LABEL[status]}
      >
        {MINI_LABEL[status] ?? '?'}
        {heuristic && <span className="mini__mark">*</span>}
      </span>
    );
  }

  return (
    <div className={`stamp stamp--${tone}${frame}`} role="status">
      <div className="stamp__box">
        <p className="stamp__kicker">Vurdering</p>
        <p className="stamp__label">{STATUS_LABEL[status]}</p>
        <p className="stamp__action">{STATUS_ACTION[status]}</p>
      </div>

      {heuristic && (
        <p className="stamp__strip">
          {grains.length > 0
            ? `Formodning: ingredienslisten nævner ${grains.join(', ')} — ikke bekræftet af et allergenfelt`
            : 'Læst ud af ingredienslisten — ikke af et allergenfelt eller en glutenfri-mærkning'}
        </p>
      )}
    </div>
  );
}

/**
 * Et kornfund farves efter hvad der blev fundet: havre alene er den milde
 * udgave, præcis som når havre står i allergenfeltet og hæver til spor
 * frem for til "indeholder".
 */
function toneFor(status, grains) {
  if (status === STATUS.GRAIN) {
    return grains.length > 0 && grains.every((grain) => grain === 'havre') ? 'warn' : 'danger';
  }

  return (
    {
      [STATUS.CONTAINS]: 'danger',
      [STATUS.TRACES]: 'warn',
      [STATUS.FREE]: 'safe',
      [STATUS.NO_GRAIN]: 'safe',
      [STATUS.UNKNOWN]: 'void',
    }[status] ?? 'void'
  );
}

const MINI_LABEL = {
  [STATUS.CONTAINS]: 'GLUTEN',
  [STATUS.TRACES]: 'SPOR',
  [STATUS.FREE]: 'FRI',
  [STATUS.GRAIN]: 'KORN',
  [STATUS.NO_GRAIN]: 'INGEN KORN',
  [STATUS.UNKNOWN]: 'UKENDT',
};
