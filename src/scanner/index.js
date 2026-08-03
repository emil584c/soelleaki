/**
 * Scanner-modulets eneste offentlige flade.
 *
 * Resten af appen kender kun disse funktioner — ikke BarcodeDetector,
 * ikke getUserMedia. Skal der senere et fallback-bibliotek ind (fx til
 * iOS/Safari, som ikke implementerer BarcodeDetector), registreres det
 * med `registerEngine()` og resten af appen rører man ikke.
 */

import { barcodeDetectorEngine } from './barcodeDetectorEngine.js';

export { openCamera, closeCamera, CameraError } from './camera.js';
export { BARCODE_FORMATS, normalizeBarcode, isPlausibleBarcode } from './formats.js';

/**
 * @typedef {object} ScanEngine
 * @property {string} id             Kort id, fx 'barcode-detector'.
 * @property {string} label          Menneskelæsbart navn til fejlbeskeder.
 * @property {() => Promise<boolean>} isSupported
 * @property {(video: HTMLVideoElement, opts: {signal?: AbortSignal}) => Promise<string>} scan
 */

/** @type {ScanEngine[]} */
const engines = [barcodeDetectorEngine];

/** Tilføj en motor. Sidst registrerede vinder ikke — rækkefølgen er prioritet. */
export function registerEngine(engine, { priority = 'fallback' } = {}) {
  if (priority === 'primary') engines.unshift(engine);
  else engines.push(engine);
}

/** Første motor der virker i denne browser, eller null. */
export async function resolveEngine() {
  for (const engine of engines) {
    if (await engine.isSupported()) return engine;
  }
  return null;
}

export async function isScanningSupported() {
  return (await resolveEngine()) !== null;
}

export class ScannerUnsupportedError extends Error {
  constructor() {
    super('Ingen stregkodescanner er tilgængelig i denne browser.');
    this.name = 'ScannerUnsupportedError';
  }
}

/**
 * Læs én stregkode fra et kørende <video>-element.
 *
 * Løftet resolver med stregkoden som streng, afvises med
 * ScannerUnsupportedError hvis browseren ikke kan scanne, eller med en
 * AbortError hvis `signal` afbrydes.
 *
 * @param {HTMLVideoElement} videoElement
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<string>}
 */
export async function scanBarcode(videoElement, options = {}) {
  const engine = await resolveEngine();
  if (!engine) throw new ScannerUnsupportedError();
  return engine.scan(videoElement, options);
}
