import StatusStamp from './StatusStamp.jsx';
import { QUALITY, STATUS } from '../lib/glutenStatus.js';
import {
  humanizeTag,
  ingredientsText,
  productTitle,
  PRODUCT_EDIT_URL,
  PRODUCT_PAGE_URL,
} from '../lib/openFoodFacts.js';

const dateFormat = new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short' });

export default function ResultView({ lookup, onDone, onRetry }) {
  const { state, barcode } = lookup;

  return (
    <section className="card">
      <div className="card__headrow">
        <h2 className="card__head">Resultat</h2>
        <button type="button" className="btn btn--quiet" onClick={onDone}>
          Ny scanning
        </button>
      </div>

      <p className="code">{barcode}</p>

      {state === 'loading' && <p className="hint">Slår op i Open Food Facts …</p>}

      {state === 'found' && <FoundResult lookup={lookup} />}

      {state === 'missing' && (
        <>
          <StatusStamp status={STATUS.UNKNOWN} />
          <div className="notice">
            <strong>Produktet findes ikke i databasen.</strong>
            <p>
              Ingen har tilføjet denne stregkode til Open Food Facts endnu. Det siger intet om
              varens indhold — læs emballagen.
            </p>
            <p>
              <a className="link" href={PRODUCT_EDIT_URL(barcode)} target="_blank" rel="noreferrer">
                Tilføj produktet på Open Food Facts →
              </a>
            </p>
          </div>
        </>
      )}

      {state === 'error' && (
        <>
          <StatusStamp status={STATUS.UNKNOWN} />
          <div className="notice notice--warn" role="alert">
            <strong>{lookup.offline ? 'Ingen forbindelse' : 'Opslaget fejlede'}</strong>
            <p>{lookup.message}</p>
            <button type="button" className="btn" onClick={() => onRetry(barcode)}>
              Prøv igen
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function FoundResult({ lookup }) {
  const { product, assessment, fromCache, cachedAt, barcode } = lookup;
  const { status, heuristic, notes, evidence } = assessment;
  const ingredients = ingredientsText(product);

  return (
    <>
      <StatusStamp status={status} heuristic={heuristic} grains={evidence.grains} />

      <div className="product">
        {product.image_front_small_url && (
          <img
            className="product__img"
            src={product.image_front_small_url}
            alt=""
            width="72"
            height="72"
            loading="lazy"
          />
        )}
        <div>
          <h3 className="product__name">{productTitle(product)}</h3>
          {product.brands && <p className="product__brand">{product.brands}</p>}
          {product.quantity && <p className="product__brand">{product.quantity}</p>}
        </div>
      </div>

      {fromCache && (
        <p className="hint">
          Vist fra din lokale kopi{cachedAt ? `, gemt ${dateFormat.format(cachedAt)}` : ''}.
        </p>
      )}

      {notes.length > 0 && (
        <ul className="notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <dl className="fields">
        <Field
          term="Allergener"
          tags={evidence.allergens}
          empty="Feltet er tomt — ikke udfyldt af nogen"
        />
        <Field term="Spor" tags={evidence.traces} empty="Feltet er tomt — ikke udfyldt af nogen" />
        <Field term="Mærkning" tags={evidence.labels} empty="Ingen glutenfri-mærkning registreret" />
        <div className="fields__row">
          <dt>Ingrediensliste</dt>
          <dd>
            {evidence.ingredientQuality === QUALITY.NONE ? (
              <span className="fields__empty">Ikke udfyldt — intet at søge i</span>
            ) : (
              INGREDIENT_BASIS[evidence.ingredientQuality]
            )}
          </dd>
        </div>
      </dl>

      {ingredients && (
        // Hviler vurderingen på listen, skal man kunne se den uden at klikke.
        <details className="details" open={heuristic}>
          <summary>Ingrediensliste</summary>
          <p className="ingredients">{ingredients}</p>
        </details>
      )}

      <p className="reserve">
        Data er indtastet af frivillige og kan være forældet eller mangelfuld.
        {status === STATUS.FREE && ' En glutenfri-mærkning her er ikke en producentgaranti.'}
        {status === STATUS.NO_GRAIN &&
          ' At der ikke står korn i listen, er ikke det samme som en glutenfri-mærkning: forurening under produktionen står sjældent i ingredienserne.'}{' '}
        Læs altid emballagen første gang du køber en vare.
      </p>

      <p className="source">
        <a className="link" href={PRODUCT_PAGE_URL(barcode)} target="_blank" rel="noreferrer">
          Se eller ret produktet på Open Food Facts →
        </a>
      </p>
    </>
  );
}

/** Hvad listen duede til — så det er synligt hvad stemplet bygger på. */
const INGREDIENT_BASIS = {
  [QUALITY.FULL]: 'Hel liste, gennemsøgt for kornsorter',
  [QUALITY.THIN]: 'For kort til at bygge en vurdering på',
  [QUALITY.FOREIGN]: 'På et sprog appen ikke læser',
};

function Field({ term, tags, empty }) {
  return (
    <div className="fields__row">
      <dt>{term}</dt>
      <dd>
        {tags.length > 0 ? (
          tags.map(humanizeTag).join(', ')
        ) : (
          <span className="fields__empty">{empty}</span>
        )}
      </dd>
    </div>
  );
}
