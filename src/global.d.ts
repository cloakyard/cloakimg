// Ambient module declarations for third-party packages that ship JS
// without TypeScript types (or whose published types miss the entry
// we use). Keep this small — only declare what we actually import.

declare module "libheif-js/wasm-bundle" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib: any;
  export default lib;
}
