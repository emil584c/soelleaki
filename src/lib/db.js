/**
 * IndexedDB — al lagring sker her, på enheden, uden konto og uden sky.
 *
 * To object stores:
 *   scans    én række pr. scanning (historik), nyeste først via `scannedAt`.
 *   products cache af rå API-svar, nøglet på stregkoden.
 *
 * Rå-svaret gemmes med vilje: hvis vurderingslogikken senere bliver
 * skarpere, kan gamle scanninger vurderes igen uden nyt netværksopslag.
 */

const DB_NAME = 'soelleaki';
const DB_VERSION = 1;
const SCANS = 'scans';
const PRODUCTS = 'products';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Denne browser understøtter ikke IndexedDB.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SCANS)) {
        const scans = db.createObjectStore(SCANS, { keyPath: 'id', autoIncrement: true });
        scans.createIndex('scannedAt', 'scannedAt');
        scans.createIndex('barcode', 'barcode');
      }

      if (!db.objectStoreNames.contains(PRODUCTS)) {
        db.createObjectStore(PRODUCTS, { keyPath: 'barcode' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function tx(store, mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        if (request) {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        } else {
          transaction.oncomplete = () => resolve();
        }
      }),
  );
}

/**
 * Gem en scanning i historikken.
 * @param {{barcode: string, name: string, brands?: string, status: string,
 *          heuristic?: boolean, found: boolean, product: object|null}} entry
 */
export async function saveScan(entry) {
  const row = {
    barcode: entry.barcode,
    name: entry.name,
    brands: entry.brands ?? '',
    status: entry.status,
    heuristic: Boolean(entry.heuristic),
    found: Boolean(entry.found),
    snapshot: entry.product ?? null, // rå API-svar, præcis som det kom ind
    scannedAt: Date.now(),
  };
  const id = await tx(SCANS, 'readwrite', (store) => store.add(row));
  return { ...row, id };
}

/** Historik, nyeste først. */
export async function listScans(limit = 200) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const rows = [];
    const transaction = db.transaction(SCANS, 'readonly');
    const cursorRequest = transaction.objectStore(SCANS).index('scannedAt').openCursor(null, 'prev');

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || rows.length >= limit) {
        resolve(rows);
        return;
      }
      rows.push(cursor.value);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

export function deleteScan(id) {
  return tx(SCANS, 'readwrite', (store) => store.delete(id));
}

export function clearScans() {
  return tx(SCANS, 'readwrite', (store) => store.clear());
}

/** Læg produktet i cachen, så gensyn i butikken ikke kræver netværk. */
export function cacheProduct(barcode, product) {
  return tx(PRODUCTS, 'readwrite', (store) =>
    store.put({ barcode, product, fetchedAt: Date.now() }),
  );
}

export async function readCachedProduct(barcode) {
  const row = await tx(PRODUCTS, 'readonly', (store) => store.get(barcode));
  return row ?? null;
}

export function clearProductCache() {
  return tx(PRODUCTS, 'readwrite', (store) => store.clear());
}

/** Til Om-siden: hvor meget ligger der egentlig på enheden. */
export async function storageSummary() {
  const [scans, products] = await Promise.all([
    tx(SCANS, 'readonly', (store) => store.count()),
    tx(PRODUCTS, 'readonly', (store) => store.count()),
  ]);
  return { scans, products };
}
