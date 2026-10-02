// Talks to any "OpenAI-compatible" chat API: Ollama on your PC, or online ones
// like Google Gemini, Groq, OpenRouter or DeepSeek. Used by the live brain and
// the video script writer.

export class LLMError extends Error {}

export interface LLMOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  log: (line: string) => void;
}

const TIMEOUT_MS = 180_000; // local models on a slow PC can take a while

export class ChatClient {
  /** Some APIs reject `response_format`; we stop sending it after the first refusal. */
  private jsonMode = true;

  constructor(private options: LLMOptions) {}

  async complete(system: string, user: string, { maxTokens = 800, temperature = 0.8 } = {}): Promise<string> {
    const { baseUrl, apiKey, model, log } = this.options;
    const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const body = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      max_tokens: maxTokens,
      ...(this.jsonMode ? { response_format: { type: "json_object" } } : {}),
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const local = /localhost|127\.0\.0\.1/.test(baseUrl);
      throw new LLMError(
        local
          ? `Couldn't reach the local AI at ${baseUrl}. Is Ollama running? (${String(error)})`
          : `Couldn't reach the AI at ${baseUrl} (${String(error)})`,
      );
    }

    if (response.status === 400 && this.jsonMode) {
      // Retry once without JSON mode; our prompts already ask for JSON.
      this.jsonMode = false;
      log("This AI API doesn't accept JSON mode; continuing without it.");
      return this.complete(system, user, { maxTokens, temperature });
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new LLMError(describeStatus(response.status, model, detail));
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    if (data.usage) log(`AI (${model}): ${data.usage.prompt_tokens ?? "?"} tokens in, ${data.usage.completion_tokens ?? "?"} out`);
    return data.choices?.[0]?.message?.content ?? "";
  }
}

function describeStatus(status: number, model: string, detail: string): string {
  if (status === 401 || status === 403) return `The AI API rejected the key (HTTP ${status}). Check LLM_API_KEY in .env. ${detail}`;
  if (status === 404) return `The AI API says model "${model}" or the URL doesn't exist (HTTP 404). Check LLM_MODEL and LLM_BASE_URL. ${detail}`;
  if (status === 429) return `The AI API is rate limiting (HTTP 429): free tiers allow only so many requests per minute/day. ${detail}`;
  return `The AI API returned HTTP ${status}. ${detail}`;
}

/**
 * Finds the JSON in a model's reply. Small local models sometimes wrap it in
 * thinking tags, code fences or chatter, so be forgiving. Null = unreadable.
 */
export function extractJson(reply: string): unknown {
  const cleaned = reply
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) return null;
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
