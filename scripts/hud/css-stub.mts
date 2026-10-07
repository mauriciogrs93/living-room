import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Module = require("node:module") as { _extensions: Record<string, (mod: { _compile: (code: string, file: string) => void }, file: string) => void> };

Module._extensions[".css"] = (mod, file) => {
  mod._compile("module.exports = {};", file);
};
