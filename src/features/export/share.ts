export type DeliveryResult = 'shared' | 'downloaded' | 'cancelled';

function toFile(data: string | Uint8Array, filename: string, mime: string): File {
  const part: BlobPart = typeof data === 'string' ? data : (data.slice().buffer as ArrayBuffer);
  return new File([part], filename, { type: mime });
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}

export function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give Safari time to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Open the system share sheet (iOS: Save to Files, Mail, AirDrop, …).
 * Falls back to a regular download where file sharing is not supported.
 * Must be called from a user gesture (tap) for Safari to allow it.
 */
export async function deliverFile(
  data: string | Uint8Array,
  filename: string,
  mime: string,
  prefer: 'share' | 'download',
): Promise<DeliveryResult> {
  const file = toFile(data, filename, mime);
  if (prefer === 'share' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // NotAllowedError (e.g. lost user activation after a slow PDF build): fall back.
    }
  }
  download(file);
  return 'downloaded';
}
