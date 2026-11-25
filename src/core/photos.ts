/** Optional photos of the Rapport work: at most this many per day. */
export const MAX_RAPPORT_PHOTOS = 3;

/** Longest side after shrinking, in pixels. Keeps one photo around 100-250 KB. */
export const PHOTO_MAX_SIDE = 1280;
export const PHOTO_QUALITY = 0.7;

/** Size that fits into `max` x `max` and keeps the proportions; never enlarges. */
export function fitSize(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Only shrunk JPEGs made by this app are kept and sent (also when restoring a backup). */
export function isPhoto(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/jpeg;base64,') && v.length < 2_000_000;
}

/** Keeps valid photos only, at most `MAX_RAPPORT_PHOTOS`. */
export function cleanPhotos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(isPhoto).slice(0, MAX_RAPPORT_PHOTOS) : [];
}

/** Shrinks a photo from the camera or gallery to a small JPEG (data URL). */
export async function photoFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, PHOTO_MAX_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas nicht verfügbar');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}
