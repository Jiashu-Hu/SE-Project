// Browser-only. Resizes an image File and re-encodes as JPEG. Returns a
// base64 data URL plus the resulting byte size for UI display.
//
// Empirically tuned for the GPTGOD vision gateway: 518 KB payloads time
// out at ~215s, but 16 KB ones complete in ~8s. 768 px / quality 0.7
// keeps phone photos in the 50-150 KB range and finishes in under 30s,
// while still giving the model enough resolution to identify ingredients.

const MAX_EDGE = 768;
const JPEG_QUALITY = 0.7;

export interface CompressedImage {
  readonly dataUrl: string;
  readonly sizeBytes: number;
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available.");
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    });

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

    return { dataUrl, sizeBytes: blob.size };
  } finally {
    bitmap.close();
  }
}
