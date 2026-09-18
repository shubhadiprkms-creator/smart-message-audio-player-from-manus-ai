import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, isSummaryNotification, makeMessageId, normalizeForSpeech, removeMessage, type PendingMessage } from "../lib/message-store";

describe("message filtering", () => {
  it("ignores summaries and background checks", () => {
    expect(isSummaryNotification("2 new messages")).toBe(true);
    expect(isSummaryNotification("Checking for messages")).toBe(true);
    expect(isSummaryNotification("New messages")).toBe(true);
    expect(isSummaryNotification("Your package has arrived.")).toBe(false);
  });

  it("spaces OTPs and long digit sequences without changing ordinary short quantities", () => {
    expect(normalizeForSpeech("Your OTP is 482913")).toBe("Your OTP is 4 8 2 9 1 3");
    expect(normalizeForSpeech("Meet at 10 AM")).toBe("Meet at 10 AM");
  });

  it("includes event metadata in a stable message key", () => {
    expect(makeMessageId("Rahim", "Hello", 123)).toBe("123-Rahim-Hello");
    expect(makeMessageId("Rahim", "Hello", 124)).not.toBe(makeMessageId("Rahim", "Hello", 123));
  });

  it("removes only the selected pending message", () => {
    const messages: PendingMessage[] = [
      { id: "one", sender: "A", text: "Keep me", receivedAt: 1, status: "pending" },
      { id: "two", sender: "B", text: "Delete me", receivedAt: 2, status: "pending" },
    ];
    expect(removeMessage(messages, "two")).toEqual([messages[0]]);
    expect(removeMessage(messages, "missing")).toEqual(messages);
  });

  it("defaults to Bluetooth pairing and normal speech speed", () => {
    expect(DEFAULT_SETTINGS.connectionMode).toBe("bluetooth");
    expect(DEFAULT_SETTINGS.speechRate).toBe(1);
    expect(DEFAULT_SETTINGS.ttsVoiceId).toBe("");
  });
});
