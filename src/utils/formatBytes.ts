// formatBytes — Two flavours of byte-count formatting used across the
// editor. Kept here (instead of duplicated in each modal) so the units
// and rounding rules stay consistent if we ever tweak them.
//
// Two functions because the call-sites have different intent:
//
//   formatBytes      → exact, "24.4 KB" / "1.23 MB"
//                      Used for known sizes (source file, layer count).
//   formatBytesRough → approximate with a ~ prefix, "~ 24 KB" / "~ 1.2 MB"
//                      Used for export-pipeline estimates that haven't
//                      actually been encoded yet.

const KB = 1024;
const MB = 1024 * 1024;

/** Exact byte-count readout — for sizes we already measured. */
export function formatBytes(n: number): string {
  if (n < KB) return `${n} B`;
  if (n < MB) return `${(n / KB).toFixed(1)} KB`;
  return `${(n / MB).toFixed(2)} MB`;
}

/** Approximate readout for *predicted* sizes. The leading "~" tells the
 *  user it's a forecast, and the coarser rounding (whole KB, one
 *  decimal MB) matches the sub-percent uncertainty of the estimate. */
export function formatBytesRough(n: number): string {
  if (n > MB) return `~ ${(n / MB).toFixed(1)} MB`;
  if (n > KB) return `~ ${Math.round(n / KB)} KB`;
  return `~ ${n} B`;
}
