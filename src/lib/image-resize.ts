// Client-side image downscale before upload. Vercel serverless functions cap
// request bodies at 4.5MB — a full-resolution phone photo (often 8-15MB)
// hits that ceiling and /api/upload returns a 413 before our own code even
// runs. Resizing in the browser first means any photo size/source works.
export async function resizeImageFile(
  file: File,
  { maxDimension = 1600, maxBytes = 3.5 * 1024 * 1024, quality = 0.85 }: {
    maxDimension?: number;
    maxBytes?: number;
    quality?: number;
  } = {}
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  let q = quality;
  let blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', q));
  while (blob && blob.size > maxBytes && q > 0.4) {
    q -= 0.15;
    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', q));
  }
  if (!blob) return file;

  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], newName, { type: 'image/jpeg' });
}
