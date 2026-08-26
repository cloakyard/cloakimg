const OBJECT_URL_TTL_MS = 30_000;

/** Start a browser download without routing through the Web Share API. */
export function startBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }

  // Keep the URL alive long enough for mobile Safari's download UI to
  // finish reading it, then release the backing Blob.
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_TTL_MS);
}
