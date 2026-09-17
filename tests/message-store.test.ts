import { describe, expect, it } from "vitest";

import { isSummaryNotification, makeMessageId, normalizeForSpeech } from "../lib/message-store";

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
});
