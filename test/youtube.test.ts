import assert from "node:assert/strict";
import { test } from "node:test";
import { toChatMessage } from "../server/chat/youtube.ts";

const author = { displayName: "Viewer", isChatModerator: false, isChatOwner: false };

test("turns YouTube chat items into chat messages", () => {
  assert.deepEqual(toChatMessage({ snippet: { type: "textMessageEvent", displayMessage: "hello" }, authorDetails: author }), {
    author: "Viewer",
    source: "youtube",
    privileged: false,
    text: "hello",
  });
  const superChat = toChatMessage({
    snippet: { type: "superChatEvent", superChatDetails: { amountDisplayString: "$5.00", userComment: "love it" } },
    authorDetails: { ...author, isChatModerator: true },
  });
  assert.equal(superChat?.highlight, "Super Chat $5.00");
  assert.equal(superChat?.privileged, true);
  assert.equal(toChatMessage({ snippet: { type: "messageDeletedEvent" }, authorDetails: author }), null);
});
