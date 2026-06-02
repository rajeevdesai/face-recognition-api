/**
 * Image input handling. Normalizes the accepted input types into ImageData and
 * bridges ImageData back to a canvas for MediaPipe.
 * Browser-only: relies on createImageBitmap / OffscreenCanvas.
 */

/** Schemes toImageData will fetch. Anything else (file:, javascript:, …) is rejected. */
const ALLOWED_IMAGE_SCHEMES = ['http', 'https', 'data', 'blob'];

/**
 * Reject string inputs with an unexpected URL scheme before fetching. A string
 * with no scheme is a relative/same-origin path and is allowed. Defense-in-depth:
 * callers should still only pass image sources they trust — toImageData will
 * fetch whatever URL it is given (with the page's credentials for same-origin).
 */
export function assertSafeImageSource(input: string): void {
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(input)?.[1].toLowerCase();
  if (scheme && !ALLOWED_IMAGE_SCHEMES.includes(scheme)) {
    throw new Error(
      `Unsupported image source scheme "${scheme}:". Allowed: ${ALLOWED_IMAGE_SCHEMES.join(', ')}, or a relative path.`,
    );
  }
}

/**
 * Normalize any supported input type to ImageData.
 *
 * Supported: HTMLImageElement, ImageData, data: URLs, blob: URLs,
 * same-origin URLs, and CORS-enabled cross-origin URLs.
 * Cross-origin non-CORS URLs will fail; use data-URL, blob:, or same-origin paths.
 *
 * String inputs are fetched, so pass only sources you trust (see assertSafeImageSource).
 */
/* v8 ignore start */
// Browser-only (createImageBitmap / OffscreenCanvas / document); not executable
// under Node unit tests. assertSafeImageSource above is unit-tested separately.
export async function toImageData(
  input: HTMLImageElement | ImageData | string,
): Promise<ImageData> {
  if (input instanceof ImageData) return input;

  let bitmap: ImageBitmap;

  if (typeof input === 'string') {
    assertSafeImageSource(input);
    const response = await fetch(input);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${input}`);
    const blob = await response.blob();
    bitmap = await createImageBitmap(blob);
  } else {
    bitmap = await createImageBitmap(input);
  }

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return data;
}

/** Draw ImageData onto a visible HTMLCanvasElement (for passing to MediaPipe). */
export function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  (canvas.getContext('2d') as CanvasRenderingContext2D).putImageData(imageData, 0, 0);
  return canvas;
}
/* v8 ignore stop */
