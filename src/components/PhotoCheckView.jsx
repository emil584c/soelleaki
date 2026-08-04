import { useCallback, useEffect, useRef, useState } from 'react';

import StatusStamp from './StatusStamp.jsx';
import { assessIngredientsText } from '../lib/glutenStatus.js';
import { closeCamera, openCamera } from '../scanner/index.js';
import { disposeOcr, OcrError, readImageText, toCanvas } from '../ocr/index.js';

/**
 * Fotolæsning: sidste udvej når hverken Open Food Facts eller cachen har
 * noget at komme med. Brugeren fotograferer varedeklarationen, teksten
 * læses på enheden, og — vigtigst — brugeren SKAL forbi et redigeringstrin
 * før der vurderes noget.
 *
 * Det trin er ikke pynt. Kameralæsning staver forkert, og en læsefejl der
 * æder et "hvede" ville give et falsk "ingen korn". Teksten skal derfor stå
 * på skærmen, rettelig, med pakken i hånden ved siden af — først når
 * brugeren siger god for den, får logikken lov at svare.
 *
 * Billedet forlader aldrig enheden og gemmes ikke. Resultatet gemmes heller
 * ikke i historikken: det bygger på et øjebliksbillede af en pakke, ikke på
 * data der kan slås op igen.
 */
export default function PhotoCheckView({ onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  const [phase, setPhase] = useState('idle'); // idle | camera | reading | review | done
  const [progress, setProgress] = useState(null);
  const [text, setText] = useState('');
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState(null);

  const stopCamera = useCallback(() => {
    closeCamera(streamRef.current, videoRef.current);
    streamRef.current = null;
  }, []);

  // Ved farvel: sluk kameraet og luk læse-workeren, så wasm-hukommelsen slippes.
  useEffect(
    () => () => {
      stopCamera();
      disposeOcr();
    },
    [stopCamera],
  );

  const runOcr = useCallback(async (image) => {
    setError(null);
    setPhase('reading');
    setProgress({ status: 'henter', progress: 0 });

    try {
      const result = await readImageText(image, {
        onProgress: (m) => setProgress({ status: m.status, progress: m.progress ?? 0 }),
      });
      setText(result);
      setPhase('review');
    } catch (err) {
      setPhase('idle');
      setError(err instanceof OcrError ? err.message : 'Læsningen fejlede. Prøv igen.');
    }
  }, []);

  const startCamera = useCallback(() => {
    setError(null);
    setPhase('camera');
  }, []);

  // Kameraet åbnes efter renderingen, når <video>-elementet står i DOM'en —
  // et kald direkte fra knappen ville ramme en ref der endnu er null.
  useEffect(() => {
    if (phase !== 'camera') return undefined;

    let cancelled = false;
    // Højere opløsning end til stregkoder: små bogstaver skal være skarpe.
    openCamera(videoRef.current, { width: 1920, height: 1080 })
      .then((stream) => {
        if (cancelled) {
          closeCamera(stream, videoRef.current);
          return;
        }
        streamRef.current = stream;
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase('idle');
        setError(err?.message || 'Kameraet kunne ikke åbnes.');
      });

    return () => {
      cancelled = true;
    };
  }, [phase]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const frame = toCanvas(video);
    stopCamera();
    runOcr(frame);
  }, [runOcr, stopCamera]);

  const pickFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = ''; // samme fil skal kunne vælges igen
      if (!file) return;
      try {
        const bitmap = await createImageBitmap(file);
        runOcr(toCanvas(bitmap));
        bitmap.close?.();
      } catch {
        setError('Billedet kunne ikke åbnes. Prøv et andet.');
      }
    },
    [runOcr],
  );

  const evaluate = useCallback(() => {
    setAssessment(assessIngredientsText(text));
    setPhase('done');
  }, [text]);

  const reset = useCallback(() => {
    stopCamera();
    setPhase('idle');
    setText('');
    setAssessment(null);
    setError(null);
  }, [stopCamera]);

  return (
    <div className="photo">
      <div className="photo__headrow">
        <h3 className="photo__head">Læs ingredienslisten med kameraet</h3>
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          Tilbage
        </button>
      </div>

      {phase === 'idle' && (
        <>
          <p className="body">
            Tag et billede af varedeklarationen på pakken, så læses teksten og gennemsøges for
            kornsorter — på enheden, uden at billedet gemmes eller sendes nogen steder hen.
          </p>
          <button type="button" className="btn btn--wide btn--primary" onClick={startCamera}>
            Åbn kameraet
          </button>
          <button type="button" className="btn btn--wide" onClick={() => fileRef.current?.click()}>
            Vælg et billede
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={pickFile}
            style={{ display: 'none' }}
          />
          <p className="hint">
            Første brug henter læsemodulet (ca. 6 MB) — derefter ligger det klar, også offline.
          </p>
        </>
      )}

      {phase === 'camera' && (
        <>
          <div className="viewport viewport--live">
            <video ref={videoRef} className="viewport__video" playsInline muted />
          </div>
          <p className="hint">
            Fyld rammen med selve ingredienslisten, i så godt lys som muligt.
          </p>
          <button type="button" className="btn btn--wide btn--primary" onClick={capture}>
            Tag billedet
          </button>
          <button type="button" className="btn btn--wide" onClick={reset}>
            Fortryd
          </button>
        </>
      )}

      {phase === 'reading' && (
        <>
          <p className="hint">
            {progress?.status === 'recognizing text'
              ? 'Læser teksten i billedet …'
              : 'Henter og starter læsemodulet …'}
          </p>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((progress?.progress ?? 0) * 100)}
          >
            <div
              className="progress__bar"
              style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }}
            />
          </div>
        </>
      )}

      {phase === 'review' && (
        <>
          <p className="body">
            <strong>Læs korrektur med pakken i hånden.</strong> Kameralæsning staver forkert — ret
            det der er læst skævt, og fjern det der ikke hører til ingredienslisten, før du lader
            appen vurdere.
          </p>
          <textarea
            className="photo__text"
            rows={7}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="Aflæst ingrediensliste"
          />
          <button
            type="button"
            className="btn btn--wide btn--primary"
            onClick={evaluate}
            disabled={!text.trim()}
          >
            Vurdér teksten
          </button>
          <button type="button" className="btn btn--wide" onClick={reset}>
            Nyt billede
          </button>
        </>
      )}

      {phase === 'done' && assessment && (
        <>
          <StatusStamp
            status={assessment.status}
            heuristic={assessment.heuristic}
            grains={assessment.evidence.grains}
          />

          {assessment.notes.length > 0 && (
            <ul className="notes">
              {assessment.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}

          <details className="details">
            <summary>Den vurderede tekst</summary>
            <p className="ingredients">{text}</p>
          </details>

          <p className="reserve">
            Vurderingen bygger på tekst læst fra dit billede — ikke på Open Food Facts. Den gemmes
            ikke i historikken. Læs altid emballagen selv, især linjen om spor.
          </p>

          <button type="button" className="btn btn--wide" onClick={() => setPhase('review')}>
            Ret teksten
          </button>
          <button type="button" className="btn btn--wide" onClick={reset}>
            Nyt billede
          </button>
        </>
      )}

      {error && (
        <div className="notice notice--warn" role="alert">
          <strong>Fotolæsning</strong>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
