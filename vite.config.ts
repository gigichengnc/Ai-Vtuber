import { defineConfig } from "vite";

// The Node server (server/main.ts) runs Vite in middleware mode, so the avatar
// page, the WebSocket, the model files and the audio all share one port.
export default defineConfig({
  root: "web",
  publicDir: "../public",
  clearScreen: false,
});
