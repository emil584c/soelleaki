/**
 * Kamerastyring. Holdt adskilt fra selve afkodningen, så en anden
 * scannermotor kan genbruge præcis den samme stream-håndtering.
 *
 * Kameraet åbnes kun mens scanningsvisningen er fremme, og lukkes igen
 * så snart man forlader den — af hensyn til batteri og til at den lille
 * lysdiode ved linsen ikke lyser når den ikke skal.
 */

export class CameraError extends Error {
  constructor(message, { cause, kind } = {}) {
    super(message, { cause });
    this.name = 'CameraError';
    this.kind = kind; // 'denied' | 'missing' | 'insecure' | 'busy' | 'unknown'
  }
}

/**
 * Åbn bagkameraet og kobl det på et <video>-element.
 * @returns {Promise<MediaStream>}
 */
export async function openCamera(videoElement) {
  if (!globalThis.isSecureContext) {
    throw new CameraError(
      'Kameraet kræver HTTPS. Åbn siden via https:// (eller localhost).',
      { kind: 'insecure' },
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('Denne browser giver ikke adgang til kameraet.', { kind: 'missing' });
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch (error) {
    throw new CameraError(cameraMessage(error), { cause: error, kind: cameraKind(error) });
  }

  videoElement.srcObject = stream;
  videoElement.setAttribute('playsinline', ''); // ellers går iOS i fuldskærm
  videoElement.muted = true;

  try {
    await videoElement.play();
  } catch (error) {
    stopStream(stream);
    throw new CameraError('Kunne ikke starte kameravisningen.', { cause: error, kind: 'unknown' });
  }

  return stream;
}

/** Luk streamen og slip <video>-elementet. Sikker at kalde flere gange. */
export function closeCamera(stream, videoElement) {
  stopStream(stream);
  if (videoElement) {
    videoElement.pause?.();
    videoElement.srcObject = null;
  }
}

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function cameraKind(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    case 'NotReadableError':
    case 'AbortError':
      return 'busy';
    default:
      return 'unknown';
  }
}

function cameraMessage(error) {
  switch (cameraKind(error)) {
    case 'denied':
      return 'Adgang til kameraet blev afvist. Giv tilladelse i browserens indstillinger for siden.';
    case 'missing':
      return 'Der blev ikke fundet et brugbart kamera på enheden.';
    case 'busy':
      return 'Kameraet er optaget af en anden app. Luk den og prøv igen.';
    default:
      return 'Kameraet kunne ikke åbnes.';
  }
}
