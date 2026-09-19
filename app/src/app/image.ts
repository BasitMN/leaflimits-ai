/** Largest file accepted before shrinking. Phone photos are usually 2 to 8 MB. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export interface PickedFile {
  name: string;
  type: string;
  size: number;
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

/** Some browsers give no MIME type (for example for HEIC), so the file extension counts too. */
function looksLikeImage(file: PickedFile): boolean {
  return file.type.startsWith('image/') || (file.type === '' && IMAGE_EXTENSIONS.test(file.name));
}

/** Returns a message for the user when the file cannot be used, otherwise null. */
export function checkImageFile(file: PickedFile): string | null {
  if (file.type === 'image/svg+xml') return 'SVG drawings are not supported. Choose a photo (JPEG, PNG or WebP).';
  if (!looksLikeImage(file)) return 'That is not an image. Choose a photo (JPEG, PNG or WebP).';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_INPUT_BYTES) return 'That photo is larger than 25 MB. Choose a smaller one.';
  return null;
}

/** Message for a file that passed the checks but the browser could not decode. */
export function decodeErrorMessage(file: PickedFile): string {
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    return 'This browser cannot open HEIC photos. Choose a JPEG or PNG, or take the photo with the camera.';
  }
  return 'Could not read that photo. Try another one.';
}

/** Scale (width, height) down so the longer side is at most maxSide. Never scales up. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Downscale a photo to a JPEG so the upload stays small (about 100 to 300 KB). */
export async function downscaleToJpeg(
  file: File,
  maxSide = 1024,
  quality = 0.8,
): Promise<{ base64: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}
