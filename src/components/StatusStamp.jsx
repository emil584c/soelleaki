import { STATUS, STATUS_ACTION, STATUS_LABEL } from '../lib/glutenStatus.js';

/**
 * Appens signaturelement: resultatet som et fysisk godkendelses- eller
 * afvisningsstempel snarere end et farvet badge.
 *
 * Stemplet viser altid den autoritative tilstand. En formodning fra
 * ingredienslisten kan aldrig blive til et stempel i sig selv — den
 * hænges på som en tilføjet strimmel, så det er tydeligt at den kommer
 * fra et andet og svagere sted end allergenfeltet.
 */
export default function StatusStamp({ status, heuristic = false, grains = [], size = 'full' }) {
  const tone =
    {
      [STATUS.CONTAINS]: 'danger',
      [STATUS.TRACES]: 'warn',
      [STATUS.FREE]: 'safe',
      [STATUS.UNKNOWN]: 'void',
    }[status] ?? 'void';

  if (size === 'mini') {
    return (
      <span className={`mini mini--${tone}`} title={STATUS_LABEL[status]}>
        {MINI_LABEL[status] ?? '?'}
        {heuristic && <span className="mini__mark">*</span>}
      </span>
    );
  }

  return (
    <div className={`stamp stamp--${tone}`} role="status">
      <div className="stamp__box">
        <p className="stamp__kicker">Vurdering</p>
        <p className="stamp__label">{STATUS_LABEL[status]}</p>
        <p className="stamp__action">{STATUS_ACTION[status]}</p>
      </div>

      {heuristic && (
        <p className="stamp__strip">
          Formodning: ingredienslisten nævner {grains.join(', ')} — ikke bekræftet af et allergenfelt
        </p>
      )}
    </div>
  );
}

const MINI_LABEL = {
  [STATUS.CONTAINS]: 'GLUTEN',
  [STATUS.TRACES]: 'SPOR',
  [STATUS.FREE]: 'FRI',
  [STATUS.UNKNOWN]: 'UKENDT',
};
