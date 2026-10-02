// WebSocket connections to the avatar page(s) and the control panel.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientToServer, ServerToClient } from "../shared/protocol.ts";

type Role = "avatar" | "panel" | "unknown";

export class Hub {
  private wss = new WebSocketServer({ noServer: true });
  private roles = new Map<WebSocket, Role>();

  constructor(
    private onMessage: (message: ClientToServer) => void,
    private onConnect: (send: (message: ServerToClient) => void) => void,
  ) {
    this.wss.on("connection", (ws) => {
      this.roles.set(ws, "unknown");
      ws.on("message", (raw) => {
        let message: ClientToServer;
        try {
          message = JSON.parse(String(raw)) as ClientToServer;
        } catch {
          return;
        }
        if (typeof message?.type !== "string") return;
        if (message.type === "hello") {
          this.roles.set(ws, message.role === "panel" ? "panel" : "avatar");
          this.onConnect((reply) => ws.send(JSON.stringify(reply)));
          return;
        }
        this.onMessage(message);
      });
      ws.on("close", () => this.roles.delete(ws));
    });
  }

  /** Called for HTTP upgrade requests; only /ws is ours (Vite uses its own). */
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    if (new URL(request.url ?? "/", "http://localhost").pathname !== "/ws") return false;
    this.wss.handleUpgrade(request, socket, head, (ws) => this.wss.emit("connection", ws, request));
    return true;
  }

  /** Avatar pages and panels both show the avatar, so both get everything. */
  broadcast(message: ServerToClient): void {
    const data = JSON.stringify(message);
    for (const ws of this.roles.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }

  toPanels(message: ServerToClient): void {
    const data = JSON.stringify(message);
    for (const [ws, role] of this.roles) if (role === "panel" && ws.readyState === WebSocket.OPEN) ws.send(data);
  }

  /** Is any page showing the avatar right now (OBS or a panel)? */
  get watching(): boolean {
    return [...this.roles.values()].some((role) => role !== "unknown");
  }
}
