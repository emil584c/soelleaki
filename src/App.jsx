import { useCallback, useEffect, useState } from 'react';

import Masthead from './components/Masthead.jsx';
import ScanView from './components/ScanView.jsx';
import ResultView from './components/ResultView.jsx';
import HistoryView from './components/HistoryView.jsx';
import AboutView from './components/AboutView.jsx';

import { normalizeBarcode } from './scanner/index.js';
import { assessGluten, STATUS } from './lib/glutenStatus.js';
import {
  fetchProduct,
  productTitle,
  ProductNotFoundError,
  LookupError,
} from './lib/openFoodFacts.js';
import { cacheProduct, listScans, readCachedProduct, saveScan } from './lib/db.js';

const VIEWS = ['scan', 'history', 'about'];

/**
 * Historikken vurderes forfra ud fra det gemte rå-svar, ikke ud fra den
 * status der blev gemt dengang. Bliver logikken skarpere, retter gamle
 * scanninger sig selv — det er hele grunden til at rå-svaret gemmes.
 */
function reassess(entry) {
  if (!entry.snapshot) return entry;
  const { status, heuristic, evidence } = assessGluten(entry.snapshot);
  return { ...entry, status, heuristic, grains: evidence.grains };
}

export default function App() {
  const [view, setView] = useState('scan');
  const [lookup, setLookup] = useState(null); // null = ingen aktiv visning af resultat
  const [history, setHistory] = useState([]);

  const refreshHistory = useCallback(() => {
    listScans()
      .then((rows) => setHistory(rows.map(reassess)))
      .catch(() => setHistory([]));
  }, []);

  useEffect(refreshHistory, [refreshHistory]);

  /** Hele opslagsforløbet: kode ind, vurderet resultat ud, gemt undervejs. */
  const handleBarcode = useCallback(
    async (rawCode) => {
      const barcode = normalizeBarcode(rawCode);
      setLookup({ state: 'loading', barcode });

      const persist = async (entry) => {
        try {
          await saveScan(entry);
          refreshHistory();
        } catch {
          // Historik er en bekvemmelighed. Fejler den, skal resultatet stadig vises.
        }
      };

      try {
        const product = await fetchProduct(barcode);
        const assessment = assessGluten(product);

        cacheProduct(barcode, product).catch(() => {});
        await persist({
          barcode,
          name: productTitle(product),
          brands: product.brands ?? '',
          status: assessment.status,
          heuristic: assessment.heuristic,
          found: true,
          product,
        });

        setLookup({ state: 'found', barcode, product, assessment, fromCache: false });
        return;
      } catch (error) {
        if (error instanceof ProductNotFoundError) {
          await persist({
            barcode,
            name: 'Ukendt produkt',
            status: STATUS.UNKNOWN,
            found: false,
            product: null,
          });
          setLookup({ state: 'missing', barcode });
          return;
        }

        // Netværksfejl: prøv den lokale kopi før vi giver op.
        const cached = await readCachedProduct(barcode).catch(() => null);
        if (cached?.product) {
          const assessment = assessGluten(cached.product);
          setLookup({
            state: 'found',
            barcode,
            product: cached.product,
            assessment,
            fromCache: true,
            cachedAt: cached.fetchedAt,
          });
          return;
        }

        setLookup({
          state: 'error',
          barcode,
          message:
            error instanceof LookupError ? error.message : 'Noget gik galt under opslaget.',
          offline: error instanceof LookupError && error.offline,
        });
      }
    },
    [refreshHistory],
  );

  /** Genåbn en tidligere scanning fra det gemte rå-svar. Rører ikke netværket. */
  const openHistoryEntry = useCallback((entry) => {
    if (!entry.snapshot) {
      setLookup({ state: 'missing', barcode: entry.barcode });
      return;
    }
    setLookup({
      state: 'found',
      barcode: entry.barcode,
      product: entry.snapshot,
      assessment: assessGluten(entry.snapshot),
      fromCache: true,
      cachedAt: entry.scannedAt,
    });
    setView('scan');
  }, []);

  const dismissResult = useCallback(() => setLookup(null), []);

  const changeView = useCallback((next) => {
    if (!VIEWS.includes(next)) return;
    setView(next);
    setLookup(null);
  }, []);

  return (
    <div className="sheet">
      <Masthead view={view} onChange={changeView} />

      <main className="sheet__body">
        {view === 'scan' &&
          (lookup ? (
            <ResultView lookup={lookup} onDone={dismissResult} onRetry={handleBarcode} />
          ) : (
            <ScanView onBarcode={handleBarcode} />
          ))}

        {view === 'history' && (
          <HistoryView entries={history} onOpen={openHistoryEntry} onChanged={refreshHistory} />
        )}

        {view === 'about' && <AboutView />}
      </main>

      <footer className="sheet__foot">
        <p className="fineprint">
          Hjælperedskab — ikke en garanti og ikke en lægefaglig vurdering.
          <br />
          Ved tvivl eller manglende data: <strong>læs varens emballage selv.</strong>
        </p>
        <p className="fineprint fineprint--credit">
          Produktdata fra <span className="src">Open Food Facts</span>, ODbL.
        </p>
      </footer>
    </div>
  );
}
