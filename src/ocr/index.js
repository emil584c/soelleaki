/**
 * Fotolæseren: et billede af en ingrediensliste ind, tekst ud.
 *
 * Resten af appen kender kun `readImageText()` og `disposeOcr()` — ikke
 * tesseract.js. Alt hentes fra eget domæne: worker, wasm-kerne og den
 * danske sprogmodel ligger i /ocr/ (samlet af scripts/prepare-ocr.mjs),
 * så tesseract.js' egen CDN aldrig kontaktes. Billedet behandles i en
 * web worker på enheden og forlader den ikke.
 *
 * Modulet importeres dynamisk fra visningen, så stregkodevejen — det
 * almindelige forløb — aldrig betaler for OCR-koden.
 */

import { createWorker, OEM } from 'tesseract.js';

/**
 * Filerne i /ocr/ har faste navne uden hash. Service worker'en cacher dem
 * cache-først, så versionen i stien er det der gør en opgradering synlig:
 * bump den sammen med tesseract.js i package.json.
 */
const ASSET_VERSION = '7.0.0';

const busted = (path) => `${path}?v=${ASSET_VERSION}`;

export class OcrError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = 'OcrError';
  }
}

let workerPromise = null;

/**
 * Init (wasm + sprogmodel) er det dyre — workeren genbruges derfor inden
 * for samme visning, så billede nummer to læses med det samme.
 */
function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = createWorker('dan', OEM.LSTM_ONLY, {
      workerPath: busted('/ocr/worker.min.js'),
      corePath: '/ocr',
      langPath: '/ocr/lang',
      // Service worker'en cacher filerne — tesseracts egen IndexedDB-kopi
      // ville bare være endnu et lager uden for appens egen database.
      cacheMethod: 'none',
      logger: (m) => onProgress?.(m),
    });
  }
  return workerPromise;
}

/**
 * Læs teksten i et billede.
 *
 * @param {HTMLCanvasElement|Blob|File} image
 * @param {{onProgress?: (info: {status: string, progress: number}) => void}} [options]
 * @returns {Promise<string>} Den rå, aflæste tekst.
 */
export async function readImageText(image, { onProgress } = {}) {
  let worker;
  try {
    worker = await getWorker(onProgress);
  } catch (error) {
    workerPromise = null;
    throw new OcrError(
      'Læsemodulet kunne ikke hentes. Første brug kræver internet — derefter ligger det klar på enheden.',
      { cause: error },
    );
  }

  try {
    const { data } = await worker.recognize(image);
    return (data.text ?? '').trim();
  } catch (error) {
    throw new OcrError('Billedet kunne ikke læses. Prøv igen med et skarpere billede.', {
      cause: error,
    });
  }
}

/** Luk workeren og slip wasm-hukommelsen. Sikker at kalde flere gange. */
export async function disposeOcr() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // Nåede aldrig at starte — der er intet at lukke.
  }
}

/**
 * Tegn et billede over på et lærred i en størrelse tesseract er god til.
 * Fotos i fuld opløsning (4000+ px) gør læsningen mange gange langsommere
 * uden at gøre den bedre; teksten skal bare være skarp, ikke enorm.
 */
export function toCanvas(source, maxSide = 1800) {
  const width = source.videoWidth ?? source.width;
  const height = source.videoHeight ?? source.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
