// Downloads the Live2D Cubism Core (the runtime that reads .moc3 files) from
// Live2D's official site into public/lib/. It is not stored in this repo
// because of Live2D's license; see
// https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html
import { mkdir, writeFile } from "node:fs/promises";

const url = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";
const out = new URL("../public/lib/live2dcubismcore.min.js", import.meta.url);

console.log(`Downloading Cubism Core from ${url}`);
const res = await fetch(url);
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}. The avatar page will try the same URL at runtime instead.`);
  process.exit(1);
}
const code = await res.text();
await mkdir(new URL(".", out), { recursive: true });
await writeFile(out, code);
console.log(`Saved ${(code.length / 1024).toFixed(0)} KB to public/lib/live2dcubismcore.min.js`);
