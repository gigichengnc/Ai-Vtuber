import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { relative } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { serveFromDir } from "../server/web.ts";

// A relative folder, like the one `npm run video -- --script output/x/script.json` gives.
const fixtures = relative(process.cwd(), fileURLToPath(new URL("./fixtures", import.meta.url)));
const server = createServer((req, res) => serveFromDir(res, fixtures, decodeURIComponent(req.url ?? "/")));
let base = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test("serves files from a relative folder", async () => {
  const res = await fetch(`${base}/fake-tts.mjs`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /stand-in voice program/);
});

test("refuses paths outside the folder", async () => {
  const res = await fetch(`${base}/..%2Fweb.test.ts`);
  assert.equal(res.status, 403);
});
