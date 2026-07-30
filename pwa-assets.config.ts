import { defineConfig, minimal2023Preset, type Preset } from "@vite-pwa/assets-generator/config";

const fullBleedAppIconPreset: Preset = {
  ...minimal2023Preset,
  maskable: {
    ...minimal2023Preset.maskable,
    padding: 0,
    resizeOptions: {
      fit: "cover",
      background: "#f4512c",
    },
  },
  apple: {
    ...minimal2023Preset.apple,
    padding: 0,
    resizeOptions: {
      fit: "cover",
      background: "#f4512c",
    },
  },
};

export default defineConfig({
  preset: fullBleedAppIconPreset,
  images: ["public/icons/logo.svg"],
});
