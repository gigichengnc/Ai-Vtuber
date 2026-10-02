// Reads live chat from your YouTube stream with the YouTube Data API.
// Needs YOUTUBE_API_KEY and YOUTUBE_VIDEO_ID in .env.
import type { ChatMessage } from "../moderation.ts";

const API = "https://www.googleapis.com/youtube/v3";

interface ChatItem {
  snippet?: {
    type?: string;
    displayMessage?: string;
    superChatDetails?: { amountDisplayString?: string; userComment?: string };
    superStickerDetails?: { amountDisplayString?: string };
    newSponsorDetails?: { memberLevelName?: string };
  };
  authorDetails?: { displayName?: string; isChatOwner?: boolean; isChatModerator?: boolean };
}

export function toChatMessage(item: ChatItem): ChatMessage | null {
  const s = item.snippet;
  const a = item.authorDetails;
  if (!s || !a?.displayName) return null;
  const privileged = Boolean(a.isChatOwner || a.isChatModerator);
  const base = { author: a.displayName, source: "youtube", privileged };
  switch (s.type) {
    case "textMessageEvent":
      return s.displayMessage ? { ...base, text: s.displayMessage } : null;
    case "superChatEvent":
      return {
        ...base,
        text: s.superChatDetails?.userComment || "(sent a Super Chat)",
        highlight: `Super Chat ${s.superChatDetails?.amountDisplayString ?? ""}`.trim(),
      };
    case "superStickerEvent":
      return { ...base, text: "(sent a Super Sticker)", highlight: `Super Sticker ${s.superStickerDetails?.amountDisplayString ?? ""}`.trim() };
    case "newSponsorEvent":
      return { ...base, text: "(just became a member!)", highlight: "New member" };
    default:
      return null;
  }
}

export interface YouTubeOptions {
  apiKey: string;
  videoId: string;
  pollSeconds: number;
  onMessage: (message: ChatMessage) => void;
  log: (line: string) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url: string): Promise<{ status: number; body: any }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

export async function startYouTubeChat(o: YouTubeOptions): Promise<void> {
  if (!o.apiKey || !o.videoId) {
    o.log("YouTube chat: set YOUTUBE_API_KEY and YOUTUBE_VIDEO_ID in .env to read live chat.");
    return;
  }

  // 1. Find the live chat that belongs to the stream (retry until the stream is live).
  let liveChatId: string | undefined;
  while (!liveChatId) {
    try {
      const { status, body } = await getJson(`${API}/videos?part=liveStreamingDetails&id=${encodeURIComponent(o.videoId)}&key=${o.apiKey}`);
      if (status !== 200) o.log(`YouTube: couldn't look up the video (HTTP ${status}: ${body?.error?.message ?? "unknown error"}).`);
      liveChatId = body?.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    } catch (error) {
      o.log(`YouTube: ${String(error)}`);
    }
    if (!liveChatId) {
      o.log("YouTube: that video has no active live chat yet. Checking again in 60 s.");
      await sleep(60_000);
    }
  }
  o.log("YouTube: connected to live chat.");

  // 2. Poll for new messages. The first page is history; skip it so she
  //    doesn't answer messages from before she started.
  let pageToken: string | undefined;
  let first = true;
  for (;;) {
    let waitMs = o.pollSeconds * 1000;
    try {
      const url = `${API}/liveChat/messages?liveChatId=${encodeURIComponent(liveChatId)}&part=snippet,authorDetails&maxResults=200&key=${o.apiKey}${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const { status, body } = await getJson(url);
      if (status === 200) {
        pageToken = body.nextPageToken;
        if (!first) {
          for (const item of body.items ?? []) {
            const message = toChatMessage(item);
            if (message) o.onMessage(message);
          }
        }
        first = false;
        waitMs = Math.max(waitMs, Number(body.pollingIntervalMillis) || 0);
      } else {
        const reason: string = body?.error?.errors?.[0]?.reason ?? "";
        if (reason === "liveChatEnded" || status === 404) {
          o.log("YouTube: the live chat has ended.");
          return;
        }
        if (reason === "quotaExceeded" || reason === "rateLimitExceeded") {
          o.log("YouTube: API quota used up for today (resets at midnight Pacific time). Pausing chat reading for 10 minutes.");
          waitMs = 10 * 60_000;
        } else {
          o.log(`YouTube: HTTP ${status} ${reason} ${body?.error?.message ?? ""}`.trim());
          waitMs = 30_000;
        }
      }
    } catch (error) {
      o.log(`YouTube: ${String(error)}`);
      waitMs = 30_000;
    }
    await sleep(waitMs);
  }
}
