import { useCallback, useEffect, useRef, useState } from 'react';

import {
  closeCamera,
  isPlausibleBarcode,
  isScanningSupported,
  normalizeBarcode,
  openCamera,
  scanBarcode,
  ScannerUnsupportedError,
} from '../scanner/index.js';

/**
 * Scanningsvisningen ejer kameraet. Streamen åbnes først når man trykker
 * start, og lukkes igen ved stop, ved fund og når visningen forlades.
 */
export default function ScanView({ onBarcode }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const abortRef = useRef(null);

  const [phase, setPhase] = useState('idle'); // idle | starting | live | error
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(null); // null = tjekker
  const [manual, setManual] = useState('');

  useEffect(() => {
    let alive = true;
    isScanningSupported()
      .then((ok) => alive && setSupported(ok))
      .catch(() => alive && setSupported(false));
    return () => {
      alive = false;
    };
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    closeCamera(streamRef.current, videoRef.current);
    streamRef.current = null;
  }, []);

  // Kameraet må aldrig overleve visningen.
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    setPhase('starting');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      streamRef.current = await openCamera(videoRef.current);
      setPhase('live');

      const code = await scanBarcode(videoRef.current, { signal: controller.signal });
      stop();
      setPhase('idle');
      onBarcode(code);
    } catch (err) {
      if (err?.name === 'AbortError') return; // brugeren trykkede stop
      stop();
      setPhase('error');
      setError(
        err instanceof ScannerUnsupportedError
          ? err.message
          : err?.message || 'Scanningen fejlede.',
      );
    }
  }, [onBarcode, stop]);

  const handleStop = useCallback(() => {
    stop();
    setPhase('idle');
  }, [stop]);

  const submitManual = useCallback(
    (event) => {
      event.preventDefault();
      const code = normalizeBarcode(manual);
      if (!code) return;
      stop();
      setPhase('idle');
      setManual('');
      onBarcode(code);
    },
    [manual, onBarcode, stop],
  );

  const manualCode = normalizeBarcode(manual);
  const manualLooksOff = manualCode.length >= 8 && !isPlausibleBarcode(manualCode);

  return (
    <section className="card">
      <h2 className="card__head">Scan stregkode</h2>

      <div className={`viewport${phase === 'live' ? ' viewport--live' : ''}`}>
        <video ref={videoRef} className="viewport__video" playsInline muted />
        {phase === 'live' && <div className="viewport__frame" aria-hidden="true" />}
        {phase !== 'live' && (
          <p className="viewport__idle">
            {phase === 'starting' ? 'Åbner kamera …' : 'Kameraet er slukket'}
          </p>
        )}
      </div>

      {phase === 'live' ? (
        <>
          <p className="hint">Hold stregkoden inde i rammen. Koden læses to gange før den tælles.</p>
          <button type="button" className="btn btn--wide" onClick={handleStop}>
            Stop kamera
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn--wide btn--primary"
          onClick={start}
          disabled={phase === 'starting' || supported === false}
        >
          {phase === 'error' ? 'Prøv igen' : 'Scan'}
        </button>
      )}

      {supported === false && (
        <div className="notice notice--warn" role="alert">
          <strong>Denne browser kan ikke scanne.</strong>
          <p>
            Stregkodelæseren bruger browserens indbyggede <code>BarcodeDetector</code>, som kun
            findes i Chromium-browsere — typisk Chrome på Android. Safari og iOS har den ikke.
          </p>
          <p>Indtast stregkoden i hånden nedenfor, så virker opslaget helt som normalt.</p>
        </div>
      )}

      {error && (
        <div className="notice notice--warn" role="alert">
          <strong>Kameraet</strong>
          <p>{error}</p>
        </div>
      )}

      <form className="manual" onSubmit={submitManual}>
        <label className="manual__label" htmlFor="manual-code">
          Eller indtast stregkoden
        </label>
        <div className="manual__row">
          <input
            id="manual-code"
            className="manual__input"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9 ]*"
            placeholder="5701234567890"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
          />
          <button type="submit" className="btn" disabled={manualCode.length < 8}>
            Slå op
          </button>
        </div>
        {manualLooksOff && (
          <p className="manual__warn">Kontrolcifferet passer ikke — tjek tallene en ekstra gang.</p>
        )}
      </form>
    </section>
  );
}
