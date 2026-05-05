// Ambient module declarations for third-party packages that ship JS
// without TypeScript types (or whose published types miss the entry
// we use). Keep this small — only declare what we actually import.

declare module "libheif-js/wasm-bundle" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib: any;
  export default lib;
}

// File Handling API (PWA "Open with"): not yet in TypeScript's DOM
// libs. Only declare the surface we consume — a single setConsumer
// that receives LaunchParams with a list of FileSystemFileHandles.
interface LaunchParams {
  readonly files: ReadonlyArray<FileSystemFileHandle>;
  readonly targetURL?: string;
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}
interface Window {
  readonly launchQueue?: LaunchQueue;
}
