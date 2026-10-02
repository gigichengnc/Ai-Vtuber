// First line of defence before chat reaches the AI, and a last check before
// anything is spoken. The AI's own rules (config/persona.md) are the second.

export interface ChatMessage {
  author: string;
  text: string;
  source: string;
  /** Moderators and the channel owner get priority. */
  privileged?: boolean;
  /** e.g. "Super Chat $5.00" */
  highlight?: string;
}

const MAX_LENGTH = 200;
const PER_AUTHOR_COOLDOWN_MS = 5_000;

export class Moderator {
  private lastSeen = new Map<string, number>();

  constructor(private blocklist: string[]) {}

  setBlocklist(blocklist: string[]): void {
    this.blocklist = blocklist;
  }

  /** Returns a cleaned-up message, or null if it should be dropped. */
  screen(message: ChatMessage, now = Date.now()): ChatMessage | null {
    let text = message.text
      .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ") // control, zero-width and direction chars
      .replace(/https?:\/\/\S+|www\.\S+/gi, "[link]")
      .replace(/(.)\1{6,}/gu, "$1$1$1") // "aaaaaaaaaa" spam
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return null;
    if (text.length > MAX_LENGTH) text = `${text.slice(0, MAX_LENGTH)}…`;
    if (this.blocked(text) || this.blocked(message.author)) return null;

    if (!message.privileged && !message.highlight) {
      const last = this.lastSeen.get(message.author);
      if (last !== undefined && now - last < PER_AUTHOR_COOLDOWN_MS) return null;
      this.lastSeen.set(message.author, now);
    }
    const author = message.author.replace(/[\p{Cc}\p{Cf}<>]/gu, "").slice(0, 40) || "viewer";
    return { ...message, author, text };
  }

  /** True if the text contains a blocked word or phrase. */
  blocked(text: string): boolean {
    const normalized = text.toLowerCase().normalize("NFKC");
    const squashed = normalized.replace(/[\s._\-*]+/g, "");
    return this.blocklist.some((word) => normalized.includes(word) || squashed.includes(word.replace(/\s+/g, "")));
  }
}
