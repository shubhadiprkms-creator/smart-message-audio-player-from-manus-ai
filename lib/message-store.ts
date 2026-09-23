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
  connectionMode: "bluetooth" | "wifi";
  bluetoothDeviceId: string;
  bluetoothDeviceName: string;
  notificationAccessEnabled: boolean;
  ttsVoiceId: string;
  speechRate: 0.5 | 1 | 2;
  manualHistory: string[];
};

const MESSAGE_KEY = "smart-message-audio.pending.v1";
const SETTINGS_KEY = "smart-message-audio.settings.v1";

export const DEFAULT_SETTINGS: AppSettings = {
  esp32BaseUrl: "http://192.168.1.50:8080",
  connectionMode: "bluetooth",
  bluetoothDeviceId: "",
  bluetoothDeviceName: "ESP32 speaker",
  notificationAccessEnabled: false,
  ttsVoiceId: "",
  speechRate: 1,
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

export function removeMessage(messages: PendingMessage[], messageId: string) {
  return messages.filter((message) => message.id !== messageId);
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

export type SpeechLanguage = "en-IN" | "bn-IN" | "hi-IN";

export type AvailableVoice = { identifier: string };

export function resolveVoiceId(savedVoiceId: string, voices: AvailableVoice[]) {
  return savedVoiceId && voices.some((voice) => voice.identifier === savedVoiceId) ? savedVoiceId : "";
}

export function languageForSpeech(text: string): SpeechLanguage {
  if (/[\u0980-\u09FF]/.test(text)) return "bn-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const banglishWords = new Set(["ami", "amra", "tumi", "tomake", "tomar", "amar", "apni", "apnake", "kemon", "acho", "achi", "bhalo", "bhalobashi", "ekhane", "okhane", "kothay", "jabo", "jacchi", "asbo", "aschi", "ekhuni", "ekhon", "shuno", "bolo", "korcho", "korchi", "kotha", "keno", "ki", "na", "hobe", "kore", "parbo", "parena", "lagbe", "dorkar", "dhonnobad", "aj", "kal", "rat", "sokal", "bari", "kaj", "khabar", "pani", "phone", "message", "whatsapp", "meeting", "asho", "jao", "thik", "thakbe", "koro", "korbo", "e"]);
  const hinglishWords = new Set(["main", "mein", "mujhe", "tum", "aap", "mera", "meri", "mujhse", "kya", "kaise", "hai", "hoon", "nahi", "karna", "kar", "jana", "jao", "kal", "abhi", "bhai", "theek", "kyun"]);
  const banglishScore = words.filter((word) => banglishWords.has(word)).length;
  const hinglishScore = words.filter((word) => hinglishWords.has(word)).length;
  if (banglishScore > hinglishScore && banglishScore > 0) return "bn-IN";
  if (hinglishScore > 0) return "hi-IN";
  return "en-IN";
}

const romanizedBengali: Record<string, string> = { ami: "আমি", amra: "আমরা", tumi: "তুমি", tomake: "তোমাকে", tomar: "তোমার", amar: "আমার", apni: "আপনি", apnake: "আপনাকে", kemon: "কেমন", acho: "আছো", achi: "আছি", bhalo: "ভালো", bhalobashi: "ভালোবাসি", ekhane: "এখানে", okhane: "ওখানে", kothay: "কোথায়", jabo: "যাবো", jacchi: "যাচ্ছি", asbo: "আসবো", aschi: "আসছি", ekhuni: "এখনই", ekhon: "এখন", shuno: "শোনো", bolo: "বলো", korcho: "করছো", korchi: "করছি", kotha: "কথা", keno: "কেন", ki: "কি", na: "না", hobe: "হবে", kore: "করে", parbo: "পারবো", parena: "পারেনা", lagbe: "লাগবে", dorkar: "দরকার", dhonnobad: "ধন্যবাদ", please: "প্লিজ", aj: "আজ", kal: "কাল", rat: "রাত", sokal: "সকাল", bari: "বাড়ি", kaj: "কাজ", khabar: "খাবার", pani: "পানি", phone: "ফোন", message: "মেসেজ", whatsapp: "হোয়াটসঅ্যাপ", call: "কল", meeting: "মিটিং", asho: "এসো", jao: "যাও", thik: "ঠিক", thakbe: "থাকবে", koro: "করো", "tomar sathe": "তোমার সাথে", e: "এ" };
const romanizedHindi: Record<string, string> = { main: "मैं", mein: "में", mujhe: "मुझे", tum: "तुम", aap: "आप", mera: "मेरा", meri: "मेरी", mujhse: "मुझसे", kya: "क्या", kaise: "कैसे", hai: "है", hoon: "हूँ", nahi: "नहीं", karna: "करना", kar: "कर", jana: "जाना", jao: "जाओ", kal: "कल", abhi: "अभी", bhai: "भाई", theek: "ठीक", kyun: "क्यों" };

const romanizedBengaliPhrases: Array<[RegExp, string]> = [
  [/\bami tomake bhalobashi\b/gi, "আমি তোমাকে ভালোবাসি"],
  [/\bami bhalo achi\b/gi, "আমি ভালো আছি"],
  [/\bkemon acho\b/gi, "কেমন আছো"],
  [/\btumi kemon acho\b/gi, "তুমি কেমন আছো"],
  [/\bki korcho\b/gi, "কি করছো"],
  [/\btumi kothay\b/gi, "তুমি কোথায়"],
  [/\bami ekhane achi\b/gi, "আমি এখানে আছি"],
  [/\beikhuni aschi\b/gi, "এইখুনি আসছি"],
  [/\bami tomake phone korbo\b/gi, "আমি তোমাকে ফোন করবো"],
];

function prepareRomanizedSegment(text: string, language: SpeechLanguage) {
  const dictionary = language === "bn-IN" ? romanizedBengali : language === "hi-IN" ? romanizedHindi : undefined;
  if (!dictionary) return text;
  let prepared = text;
  for (const [pattern, replacement] of language === "bn-IN" ? romanizedBengaliPhrases : []) prepared = prepared.replace(pattern, replacement);
  return prepared.replace(/\b[a-z]+\b/gi, (word) => dictionary[word.toLowerCase()] ?? word);
}

export function speechSegments(text: string) {
  const normalized = normalizeForSpeech(text).trim();
  const segments: { text: string; language: SpeechLanguage }[] = [];
  let currentLanguage: SpeechLanguage | null = null;
  let buffer = "";
  for (const token of normalized.split(/(\s+)/)) {
    if (/^\s+$/.test(token)) { buffer += token; continue; }
    const tokenLanguage = languageForSpeech(token);
    if (currentLanguage && tokenLanguage !== currentLanguage && buffer.trim()) {
      segments.push({ text: prepareRomanizedSegment(buffer.trim(), currentLanguage), language: currentLanguage });
      buffer = "";
    }
    currentLanguage = tokenLanguage;
    buffer += token;
  }
  if (buffer.trim() && currentLanguage) segments.push({ text: prepareRomanizedSegment(buffer.trim(), currentLanguage), language: currentLanguage });
  return segments;
}

export function previewForSpeech(text: string, rate: 0.5 | 1 | 2) {
  const normalized = normalizeForSpeech(text).trim();
  const maxCharacters = Math.round(75 * rate);
  if (normalized.length <= maxCharacters) return normalized;
  const excerpt = normalized.slice(0, maxCharacters).replace(/\s+\S*$/, "").trim();
  return `${excerpt || normalized.slice(0, maxCharacters).trim()}…`;
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

export function createManualMessage(text: string, timestamp = Date.now()): PendingMessage | null {
  const normalized = text.trim();
  if (!normalized || isSummaryNotification(normalized)) return null;
  return { id: makeMessageId("Manual note", normalized, timestamp), sender: "Manual note", text: normalized, receivedAt: timestamp, status: "pending" };
}
