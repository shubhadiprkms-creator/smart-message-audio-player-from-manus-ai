import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, createManualMessage, isSummaryNotification, languageForSpeech, makeMessageId, normalizeForSpeech, previewForSpeech, removeMessage, resolveVoiceId, speechSegments, type PendingMessage } from "../lib/message-store";

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

  it("limits previews to a short rate-aware excerpt", () => {
    const message = "This is a deliberately long message that should never be spoken in full during the quick preview because the user only needs a short sample.";
    const preview = previewForSpeech(message, 1);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThan(message.length);
    expect(previewForSpeech("Short note", 1)).toBe("Short note");
  });

  it("creates manual messages as pending without sending them", () => {
    const message = createManualMessage("  Call me when you arrive.  ", 456);
    expect(message).toMatchObject({ sender: "Manual note", text: "Call me when you arrive.", receivedAt: 456, status: "pending" });
    expect(createManualMessage("2 new messages", 457)).toBeNull();
  });

  it("routes Bengali, Hindi, and Latin mixed-language text to speech locales", () => {
    expect(languageForSpeech("Ami ekhane achi, call me later")).toBe("bn-IN");
    expect(languageForSpeech("আমি এখানে আছি")).toBe("bn-IN");
    expect(languageForSpeech("मैं यहाँ हूँ")).toBe("hi-IN");
    expect(speechSegments("Ami এখানে আছি").map((segment) => segment.language)).toEqual(["bn-IN"]);
  });

  it("routes common Banglish and Hinglish phrases to regional offline voices", () => {
    expect(languageForSpeech("Ami ekhane achi")).toBe("bn-IN");
    expect(languageForSpeech("Main abhi ghar jao")).toBe("hi-IN");
    expect(speechSegments("Ami ekhane achi, call me later")).toEqual([
      { language: "bn-IN", text: "আমি এখানে আছি," },
      { language: "en-IN", text: "call me later" },
    ]);
  });

  it("falls back to the system voice when a saved voice is unavailable", () => {
    expect(resolveVoiceId("phone-voice", [{ identifier: "other-voice" }])).toBe("");
    expect(resolveVoiceId("other-voice", [{ identifier: "other-voice" }])).toBe("other-voice");
  });
});
