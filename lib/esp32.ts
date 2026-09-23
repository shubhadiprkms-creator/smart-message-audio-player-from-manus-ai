import * as FileSystem from "expo-file-system/legacy";
import { NativeModules, Platform } from "react-native";

import { normalizeForSpeech } from "./message-store";
import { connectEsp32, deliverMessageOverBle, scanForEsp32, sendWavOverBle } from "./ble";

export type Esp32Result = { ok: true; detail: string } | { ok: false; detail: string };

const nativeAudio = NativeModules.SmartMessageAudio as
  | { synthesizeToWav: (text: string, fileName: string, rate: number) => Promise<string> }
  | undefined;

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

export async function checkEsp32(baseUrl: string, timeoutMs = 4500): Promise<Esp32Result> {
  const url = `${normalizeBaseUrl(baseUrl)}/status`;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timeout = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "GET", signal: controller?.signal });
    if (!response.ok) return { ok: false, detail: `ESP32 returned HTTP ${response.status}.` };
    const payload = await response.json().catch(() => ({}));
    if (payload?.ready === false) return { ok: false, detail: "ESP32 is reachable but not ready." };
    return { ok: true, detail: "ESP32 responded to the status check." };
  } catch {
    return { ok: false, detail: "ESP32 is not reachable on this Wi-Fi network." };
  } finally {
    clearTimeout(timeout);
  }
}

export async function synthesizeToWav(text: string, fileName: string) {
  if (Platform.OS === "web") {
    throw new Error("WAV generation requires an Android build with the SmartMessageAudio native module.");
  }
  if (!nativeAudio?.synthesizeToWav) {
    throw new Error("This build does not include the Android TTS-to-WAV module yet.");
  }
  return nativeAudio.synthesizeToWav(normalizeForSpeech(text), fileName, 1);
}

export async function synthesizeToWavWithRate(text: string, fileName: string, rate: 0.5 | 1 | 2) {
  if (Platform.OS === "web") throw new Error("WAV generation requires an Android build with the SmartMessageAudio native module.");
  if (!nativeAudio?.synthesizeToWav) throw new Error("This build does not include the Android TTS-to-WAV module yet.");
  return nativeAudio.synthesizeToWav(normalizeForSpeech(text), fileName, rate);
}

export async function sendWavToEsp32(baseUrl: string, wavUri: string): Promise<Esp32Result> {
  const url = `${normalizeBaseUrl(baseUrl)}/audio`;
  try {
    const upload = await FileSystem.uploadAsync(url, wavUri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": "audio/wav", "X-Audio-Format": "PCM_S16LE_22050_MONO" },
    });
    if (upload.status < 200 || upload.status >= 300) {
      return { ok: false, detail: `ESP32 rejected the audio (HTTP ${upload.status}).` };
    }
    const acknowledgement = JSON.parse(upload.body || "{}");
    if (acknowledgement?.ack !== "received" && acknowledgement?.success !== true) {
      return { ok: false, detail: "ESP32 did not acknowledge the complete audio transfer." };
    }
    return { ok: true, detail: "ESP32 acknowledged the audio transfer." };
  } catch {
    return { ok: false, detail: "Audio transfer failed. The message remains pending." };
  }
}

export async function deliverMessage(baseUrl: string, text: string, id: string, rate: 0.5 | 1 | 2 = 1): Promise<Esp32Result> {
  const status = await checkEsp32(baseUrl);
  if (!status.ok) return status;
  const wavUri = await synthesizeToWavWithRate(text, `smart-message-${id}.wav`, rate);
  return sendWavToEsp32(baseUrl, wavUri);
}

export async function deliverMessageBluetooth(deviceId: string, text: string, id: string, rate: 0.5 | 1 | 2 = 1): Promise<Esp32Result> {
  if (Platform.OS === "web") return { ok: false, detail: "Direct Bluetooth delivery requires the Android/iOS app build." };
  if (!deviceId) return { ok: false, detail: "Pair an ESP32 speaker in Settings before sending." };
  const wavUri = await synthesizeToWavWithRate(text, `smart-message-${id}.wav`, rate);
  return deliverMessageOverBle(deviceId, wavUri);
}

export { connectEsp32, scanForEsp32, sendWavOverBle };
