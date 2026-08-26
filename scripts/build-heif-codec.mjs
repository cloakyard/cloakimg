import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "vendor", "heif-codec");
const build = join(source, ".build");
const output = join(root, "src", "editor", "vendor", "heif-codec.js");

rmSync(build, { recursive: true, force: true });
mkdirSync(dirname(output), { recursive: true });

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    "-e",
    "EMSCRIPTEN_ROOT=/emsdk",
    "-v",
    `${source}:/src`,
    "-w",
    "/src",
    "emscripten/emsdk:6.0.8",
    "bash",
    "-lc",
    "emcmake cmake -S . -B .build -DEMSCRIPTEN=ON -DCMAKE_BUILD_TYPE=Release && cmake --build .build --target cloakimg-heif-codec -j4",
  ],
  { stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);
copyFileSync(join(build, "wasm", "cloakimg-heif-codec.js"), output);
