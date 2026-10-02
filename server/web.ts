// The HTTP server shared by live mode and the video renderer: serves the web
// pages (through Vite), your model files, and anything else a caller adds.
import { createReadStream, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { loadAvatarConfig, rootPath } from "./config.ts";

const MIME: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".moc3": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

/** Serves a file from inside `dir`; refuses paths that escape it. */
export function serveFromDir(res: ServerResponse, dir: string, relative: string): void {
  const file = resolve(dir, `.${relative.startsWith("/") ? relative : `/${relative}`}`);
  if (!file.startsWith(dir + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}

export interface WebServerOptions {
  /** Extra routes; return true if the request was handled. */
  handle?: (path: string, req: IncomingMessage, res: ServerResponse) => boolean;
  /** WebSocket upgrades (Vite's hot reload handles its own). */
  upgrade?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
}

export async function createWebServer(options: WebServerOptions = {}): Promise<Server> {
  const modelsDir = fileURLToPath(rootPath("models"));
  const assetsDir = fileURLToPath(rootPath("assets"));

  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    if (path.startsWith("/models/")) return serveFromDir(res, modelsDir, path.slice("/models".length));
    if (path.startsWith("/assets/")) return serveFromDir(res, assetsDir, path.slice("/assets".length));
    if (path === "/api/avatar-config") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(loadAvatarConfig()));
      return;
    }
    if (options.handle?.(path, req, res)) return;
    vite.middlewares(req, res);
  });
  if (options.upgrade) server.on("upgrade", options.upgrade);

  const vite = await createViteServer({
    configFile: fileURLToPath(rootPath("vite.config.ts")),
    server: { middlewareMode: true, hmr: { server } },
    appType: "mpa",
    logLevel: "warn",
  });
  server.on("close", () => void vite.close());
  return server;
}
