import AsyncStorage from "@react-native-async-storage/async-storage";

export type MessageStatus = "pending" | "sending" | "error";

export type PendingMessage = {
  id: string;
  sender: string;
  text: string;
  receivedAt: number;
  status: MessageStatus;
  lastError?: string;
};

export type AppSettings = {
  esp32BaseUrl: string;
  notificationAccessEnabled: boolean;
  manualHistory: string[];
};

const MESSAGE_KEY = "smart-message-audio.pending.v1";
const SETTINGS_KEY = "smart-message-audio.settings.v1";

export const DEFAULT_SETTINGS: AppSettings = {
  esp32BaseUrl: "http://192.168.1.50:8080",
  notificationAccessEnabled: false,
  manualHistory: [],
};

export async function loadMessages(): Promise<PendingMessage[]> {
  const value = await AsyncStorage.getItem(MESSAGE_KEY);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as PendingMessage[];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.text) : [];
  } catch {
    return [];
  }
}

export async function saveMessages(messages: PendingMessage[]) {
  await AsyncStorage.setItem(MESSAGE_KEY, JSON.stringify(messages));
}

export async function loadSettings(): Promise<AppSettings> {
  const value = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!value) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(value) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function normalizeForSpeech(text: string) {
  return text.replace(/\b\d{4,}\b/g, (digits) => digits.split("").join(" "));
}

export function isSummaryNotification(text: string) {
  const normalized = text.trim().toLowerCase();
  return (
    !normalized ||
    /^(\d+\s+)?new messages?$/.test(normalized) ||
    /^(\d+\s+)?unread messages?$/.test(normalized) ||
    normalized.includes("checking for messages") ||
    normalized.includes("checking for sms") ||
    normalized.includes("message summary")
  );
}

export function makeMessageId(sender: string, text: string, timestamp = Date.now()) {
  return `${timestamp}-${sender}-${text}`.replace(/\s+/g, "-").slice(0, 160);
}
