/**
 * Primær scanner: browserens indbyggede BarcodeDetector.
 *
 * Hurtig, ingen afhængigheder, ingen wasm at hente — men findes kun i
 * Chromium (Android Chrome, desktop Chrome/Edge). Safari/iOS har den
 * ikke, og det er derfor motoren er isoleret bag ScanEngine-interfacet.
 */

import { BARCODE_FORMATS } from './formats.js';
import { isPlausibleBarcode } from './formats.js';

/** Samme kode skal ses to gange i træk før vi tror på den. */
const REQUIRED_STREAK = 2;

let supportedFormatsCache = null;

async function usableFormats() {
  if (supportedFormatsCache) return supportedFormatsCache;
  let available = BARCODE_FORMATS;
  try {
    const supported = await globalThis.BarcodeDetector.getSupportedFormats();
    const filtered = BARCODE_FORMATS.filter((f) => supported.includes(f));
    if (filtered.length > 0) available = filtered;
  } catch {
    // getSupportedFormats kan mangle i ældre implementeringer — brug listen som den er.
  }
  supportedFormatsCache = available;
  return available;
}

/** @type {import('./index.js').ScanEngine} */
export const barcodeDetectorEngine = {
  id: 'barcode-detector',
  label: 'BarcodeDetector (indbygget)',

  async isSupported() {
    if (!('BarcodeDetector' in globalThis)) return false;
    try {
      const formats = await usableFormats();
      return formats.length > 0;
    } catch {
      return false;
    }
  },

  scan(videoElement, { signal } = {}) {
    return new Promise((resolve, reject) => {
      let detector;
      let frameHandle = null;
      let stopped = false;
      let lastCode = null;
      let streak = 0;

      const cleanup = () => {
        stopped = true;
        if (frameHandle !== null) cancelAnimationFrame(frameHandle);
        signal?.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(new DOMException('Scanningen blev afbrudt.', 'AbortError'));
      };

      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort);

      const tick = async () => {
        if (stopped) return;

        // readyState < 2 = ingen billeddata endnu; detect() ville kaste.
        if (videoElement.readyState >= 2) {
          try {
            const results = await detector.detect(videoElement);
            if (stopped) return;

            const hit = results.find((r) => isPlausibleBarcode(r.rawValue));
            if (hit) {
              // To ens aflæsninger i træk: filtrerer de enkeltframes fra
              // hvor et ciffer bliver læst forkert i dårligt lys.
              streak = hit.rawValue === lastCode ? streak + 1 : 1;
              lastCode = hit.rawValue;
              if (streak >= REQUIRED_STREAK) {
                cleanup();
                resolve(hit.rawValue);
                return;
              }
            } else if (results.length === 0) {
              streak = 0;
              lastCode = null;
            }
          } catch (error) {
            cleanup();
            reject(error);
            return;
          }
        }

        frameHandle = requestAnimationFrame(tick);
      };

      usableFormats()
        .then((formats) => {
          if (stopped) return;
          detector = new globalThis.BarcodeDetector({ formats });
          frameHandle = requestAnimationFrame(tick);
        })
        .catch((error) => {
          cleanup();
          reject(error);
        });
    });
  },
};
