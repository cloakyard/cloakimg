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
