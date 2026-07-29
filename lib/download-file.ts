/**
 * Client-only helpers for triggering a browser file download from an
 * artifact's in-memory content. Used by the per-kind artifact "download"
 * actions (text/code/sheet/image).
 */

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Sanitizes an artifact title into a safe base filename (no extension). */
export function toSafeFilename(title: string, fallback = "untitled"): string {
  const trimmed = title.trim();
  const safe = trimmed
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return safe.length > 0 ? safe.slice(0, 100) : fallback;
}

export function downloadTextFile(
  content: string,
  filename: string,
  mimeType = "text/plain"
) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  triggerDownload(blob, filename);
}

export function downloadBase64File(
  base64Data: string,
  filename: string,
  mimeType: string
) {
  const byteChars = atob(base64Data);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  triggerDownload(blob, filename);
}
