// Type in the terminal to talk to her while testing.
//   hello!             chat as a viewer named "you"
//   /say 大家好         make her say exact text
//   /pause  /resume    panic button
import { createInterface } from "node:readline";
import type { Stage } from "../stage.ts";

export function startConsoleChat(stage: Stage, log: (line: string) => void): void {
  if (!process.stdin.isTTY) return; // e.g. started from a shortcut with no terminal
  const rl = createInterface({ input: process.stdin });
  log("Console chat on: type a message and press Enter. /say <text>, /pause, /resume also work.");
  rl.on("line", (input) => {
    const text = input.trim();
    if (!text) return;
    if (text === "/pause") return stage.pause();
    if (text === "/resume") return stage.resume();
    if (text.startsWith("/say ")) return stage.say({ text: text.slice(5).trim() });
    stage.addChat({ author: "you", text, source: "console", privileged: true });
  });
}
