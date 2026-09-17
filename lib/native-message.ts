import { NativeModules, Platform } from "react-native";

import type { PendingMessage } from "./message-store";

const native = NativeModules.SmartMessageAudio as
  | {
      drainDetectedMessages?: () => Promise<string>;
      isNotificationAccessEnabled?: () => Promise<boolean>;
    }
  | undefined;

export async function drainNativeMessages(): Promise<PendingMessage[]> {
  if (Platform.OS === "web" || !native?.drainDetectedMessages) return [];
  try {
    const raw = await native.drainDetectedMessages();
    const parsed = JSON.parse(raw) as Array<{ id: string; sender: string; text: string; receivedAt: number }>;
    return parsed.map((item) => ({ ...item, status: "pending" as const })).filter((item) => item.id && item.sender && item.text);
  } catch {
    return [];
  }
}

export async function readNotificationAccess(): Promise<boolean | null> {
  if (Platform.OS === "web" || !native?.isNotificationAccessEnabled) return null;
  try {
    return await native.isNotificationAccessEnabled();
  } catch {
    return null;
  }
}
