import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ScreenContainer } from "@/components/screen-container";
import { checkEsp32, deliverMessage } from "@/lib/esp32";
import {
  DEFAULT_SETTINGS,
  createManualMessage,
  loadMessages,
  loadSettings,
  previewForSpeech,
  removeMessage,
  saveMessages,
  saveSettings,
  type AppSettings,
  type PendingMessage,
} from "@/lib/message-store";
import { drainNativeMessages } from "@/lib/native-message";
import { useColors } from "@/hooks/use-colors";

const palette = {
  ink: "#14211F",
  muted: "#6E7C78",
  cloud: "#F6F8F5",
  panel: "#FFFFFF",
  mint: "#D8F2E4",
  mintStrong: "#1D8C5F",
  amber: "#E7A53B",
  red: "#C55750",
  line: "#E5ECE7",
};

type EspStatus = "unknown" | "connecting" | "connected" | "disconnected";

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp);
}

function languageFor(text: string) {
  return /[\u0980-\u09FF]/.test(text) ? "bn-IN" : "en-IN";
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  secondary = false,
}: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        secondary ? styles.secondaryButton : styles.primaryButton,
        disabled && styles.disabledButton,
        pressed && styles.pressed,
      ]}
    >
      <MaterialIcons name={icon} size={16} color={secondary ? palette.mintStrong : "#FFFFFF"} />
      <Text style={[styles.actionLabel, secondary && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<EspStatus>("unknown");
  const [statusDetail, setStatusDetail] = useState("Connect to confirm the speaker is reachable.");
  const [isRefreshing, setRefreshing] = useState(false);
  const [manualText, setManualText] = useState("");
  const [manualNotice, setManualNotice] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingCount = messages.length;
  const sortedMessages = useMemo(() => [...messages].sort((a, b) => a.receivedAt - b.receivedAt), [messages]);

  const hydrate = useCallback(async () => {
    const [storedMessages, storedSettings, nativeMessages] = await Promise.all([loadMessages(), loadSettings(), drainNativeMessages()]);
    const storedIds = new Set(storedMessages.map((message) => message.id));
    const mergedMessages = [...storedMessages, ...nativeMessages.filter((message) => !storedIds.has(message.id))];
    setMessages(mergedMessages.map((message) => ({ ...message, status: message.status === "sending" ? "pending" : message.status })));
    if (nativeMessages.length > 0) await saveMessages(mergedMessages);
    setSettings(storedSettings);
  }, []);

  useEffect(() => {
    hydrate();
    return () => {
      if (previewTimeout.current) clearTimeout(previewTimeout.current);
      Speech.stop();
    };
  }, [hydrate]);

  useFocusEffect(
    useCallback(() => {
      hydrate();
    }, [hydrate]),
  );

  const connect = async () => {
    setStatus("connecting");
    setStatusDetail("Open Settings to pair the ESP32 speaker with phone Bluetooth.");
    router.push("/settings" as never);
    setStatus("unknown");
    const result = await checkEsp32(settings.esp32BaseUrl);
    if (result.ok) setStatusDetail("Bluetooth pairing is ready; Wi-Fi fallback also responds.");
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(result.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    }
  };

  const preview = async (message: PendingMessage) => {
    if (previewTimeout.current) clearTimeout(previewTimeout.current);
    await Speech.stop();
    setPreviewingId(message.id);
    Speech.speak(previewForSpeech(message.text, settings.speechRate), {
      language: languageFor(message.text),
      rate: settings.speechRate,
      ...(settings.ttsVoiceId ? { voice: settings.ttsVoiceId } : {}),
      onDone: () => setPreviewingId(null),
      onStopped: () => setPreviewingId(null),
      onError: () => setPreviewingId(null),
    });
    previewTimeout.current = setTimeout(async () => {
      await Speech.stop();
      setPreviewingId(null);
    }, 5000);
  };

  const send = async (message: PendingMessage) => {
    if (sendingId) return;
    setSendingId(message.id);
    const sending = messages.map((item) => (item.id === message.id ? { ...item, status: "sending" as const, lastError: undefined } : item));
    setMessages(sending);
    await saveMessages(sending);
    try {
      const result = await deliverMessage(settings.esp32BaseUrl, message.text, message.id, settings.speechRate);
      if (result.ok) {
        const remaining = sending.filter((item) => item.id !== message.id);
        setMessages(remaining);
        await saveMessages(remaining);
        setStatus("connected");
        setStatusDetail("Last delivery acknowledged by the ESP32.");
        if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const failed = sending.map((item) => item.id === message.id ? { ...item, status: "error" as const, lastError: result.detail } : item);
        setMessages(failed);
        await saveMessages(failed);
        setStatus("disconnected");
        setStatusDetail(result.detail);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Audio generation failed. The message remains pending.";
      const failed = sending.map((item) => item.id === message.id ? { ...item, status: "error" as const, lastError: detail } : item);
      setMessages(failed);
      await saveMessages(failed);
      setStatusDetail(detail);
    } finally {
      setSendingId(null);
    }
  };

  const addManualMessage = async () => {
    const text = manualText.trim();
    const message = createManualMessage(text);
    if (!message) return;
    const next = [...messages, message];
    setMessages(next);
    setManualText("");
    setManualNotice("Added to pending queue. Tap Send to speaker when you are ready.");
    const nextSettings = { ...settings, manualHistory: [text, ...settings.manualHistory.filter((item) => item !== text)].slice(0, 8) };
    setSettings(nextSettings);
    await Promise.all([saveMessages(next), saveSettings(nextSettings)]);
  };

  const deleteMessage = async (messageId: string) => {
    if (sendingId === messageId) return;
    if (previewingId === messageId) {
      await Speech.stop();
      setPreviewingId(null);
    }
    const next = removeMessage(messages, messageId);
    setMessages(next);
    await saveMessages(next);
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const refresh = async () => {
    setRefreshing(true);
    await hydrate();
    setRefreshing(false);
  };

  return (
    <ScreenContainer containerClassName="bg-background" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={sortedMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={palette.mintStrong} />}
          ListHeaderComponent={
            <>
              <View style={styles.topBar}>
                <View style={styles.brandMark}>
                  <MaterialIcons name="graphic-eq" size={20} color={palette.mintStrong} />
                </View>
                <View style={styles.brandCopy}>
                  <Text style={[styles.eyebrow, { color: colors.muted }]}>SMART MESSAGE</Text>
                  <Text style={[styles.title, { color: colors.foreground }]}>Audio Player</Text>
                </View>
                <Pressable accessibilityLabel="Open settings" onPress={() => router.push("/settings" as never)} style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}>
                  <MaterialIcons name="tune" size={22} color={colors.foreground} />
                </Pressable>
              </View>

              <View style={styles.statusCard}>
                <View style={styles.statusTopRow}>
                  <View style={styles.speakerCircle}>
                    <MaterialIcons name="speaker" size={23} color={palette.mintStrong} />
                  </View>
                  <View style={styles.statusCopy}>
                    <View style={styles.statusTitleRow}>
                    <Text style={styles.statusTitle}>Phone Bluetooth</Text>
                      <View style={[styles.statusPill, status === "connected" ? styles.connectedPill : status === "connecting" ? styles.connectingPill : styles.neutralPill]}>
                        <View style={[styles.statusDot, status === "connected" ? styles.connectedDot : status === "connecting" ? styles.connectingDot : styles.neutralDot]} />
                        <Text style={styles.statusPillText}>{status === "connected" ? "Connected" : status === "connecting" ? "Checking" : "Not checked"}</Text>
                      </View>
                    </View>
                    <Text style={styles.statusDetail}>{statusDetail}</Text>
                  </View>
                </View>
                <View style={styles.statusBottomRow}>
                  <Text style={styles.endpoint} numberOfLines={1}>{settings.bluetoothDeviceName || "ESP32 speaker"}</Text>
                  <Pressable accessibilityRole="button" onPress={connect} style={({ pressed }) => [styles.connectButton, pressed && styles.pressed]}>
                    <MaterialIcons name="bluetooth" size={17} color="#FFFFFF" />
                    <Text style={styles.connectButtonText}>Pair in Settings</Text>
                  </Pressable>
                </View>
              </View>

              {!settings.notificationAccessEnabled && (
                <Pressable accessibilityRole="button" onPress={() => router.push("/settings" as never)} style={({ pressed }) => [styles.accessBanner, pressed && styles.pressed]}>
                  <View style={styles.accessIcon}><MaterialIcons name="notifications-none" size={20} color={palette.amber} /></View>
                  <View style={styles.accessCopy}>
                    <Text style={styles.accessTitle}>Message Access is off</Text>
                    <Text style={styles.accessBody}>Enable it once to detect new messages automatically.</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={palette.amber} />
                </Pressable>
              )}

              <View style={styles.sectionHeader}>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Pending messages</Text>
                  <Text style={[styles.sectionSub, { color: colors.muted }]}>{pendingCount === 0 ? "Your delivery queue is clear" : `${pendingCount} ${pendingCount === 1 ? "message" : "messages"} waiting to be sent`}</Text>
                </View>
                {pendingCount > 0 && <View style={styles.countBadge}><Text style={styles.countBadgeText}>{pendingCount}</Text></View>}
              </View>
            </>
          }
          renderItem={({ item }) => (
            <View style={styles.messageCard}>
              <View style={styles.messageHeader}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.sender.charAt(0).toUpperCase()}</Text></View>
                <View style={styles.messageSender}><Text style={styles.sender}>{item.sender}</Text><Text style={styles.time}>{formatTime(item.receivedAt)}</Text></View>
                {item.status === "error" && <View style={styles.errorBadge}><MaterialIcons name="error-outline" size={14} color={palette.red} /><Text style={styles.errorBadgeText}>Retry needed</Text></View>}
              </View>
              <Text style={styles.messageText}>{item.text}</Text>
              {item.lastError && <Text style={styles.errorText}>{item.lastError}</Text>}
              <View style={styles.messageActions}>
                <ActionButton label={previewingId === item.id ? "Playing" : "Preview · 5s"} icon={previewingId === item.id ? "volume-up" : "play-arrow"} secondary onPress={() => preview(item)} disabled={!!sendingId} />
                <ActionButton label={sendingId === item.id ? "Sending…" : "Send to speaker"} icon="send" onPress={() => send(item)} disabled={!!sendingId} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete message from ${item.sender}`} onPress={() => deleteMessage(item.id)} disabled={!!sendingId} style={({ pressed }) => [styles.deleteButton, !!sendingId && styles.disabledButton, pressed && styles.pressed]}>
                  <MaterialIcons name="delete-outline" size={18} color={palette.red} />
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={<View style={styles.emptyState}><View style={styles.emptyIcon}><MaterialIcons name="mark-email-read" size={28} color={palette.mintStrong} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing waiting</Text><Text style={[styles.emptyBody, { color: colors.muted }]}>New messages will appear here after Message Access is enabled.</Text></View>}
          ListFooterComponent={
            <View style={styles.manualCard}>
              <View style={styles.manualHeading}><View><Text style={styles.manualTitle}>Add a manual message</Text><Text style={styles.manualSub}>It will stay pending until you tap Send to speaker.</Text></View><MaterialIcons name="edit-note" size={24} color={palette.mintStrong} /></View>
              <TextInput value={manualText} onChangeText={(value) => { setManualText(value); setManualNotice(null); }} placeholder="Type or paste a message…" placeholderTextColor="#9BA8A3" multiline maxLength={600} style={styles.manualInput} />
              <Pressable accessibilityRole="button" disabled={!manualText.trim()} onPress={addManualMessage} style={({ pressed }) => [styles.addButton, !manualText.trim() && styles.disabledButton, pressed && styles.pressed]}><MaterialIcons name="add" size={18} color="#FFFFFF" /><Text style={styles.addButtonText}>Add as pending message</Text></Pressable>
              {manualNotice && <Text style={styles.manualNotice}>{manualNotice}</Text>}
            </View>
          }
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 38, gap: 14 },
  topBar: { flexDirection: "row", alignItems: "center", marginBottom: 22 },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" },
  brandCopy: { marginLeft: 11, flex: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  title: { fontSize: 22, lineHeight: 27, fontWeight: "800", letterSpacing: -0.5 },
  settingsButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.cloud, alignItems: "center", justifyContent: "center" },
  statusCard: { backgroundColor: palette.ink, borderRadius: 22, padding: 18, marginBottom: 2 },
  statusTopRow: { flexDirection: "row" },
  speakerCircle: { width: 46, height: 46, borderRadius: 16, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center" },
  statusCopy: { flex: 1, marginLeft: 13 },
  statusTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statusTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  statusDetail: { color: "#B6C5BE", fontSize: 12, lineHeight: 17, marginTop: 4 },
  statusPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99 },
  connectedPill: { backgroundColor: "#D8F2E4" },
  connectingPill: { backgroundColor: "#F7E6C4" },
  neutralPill: { backgroundColor: "#32413C" },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  connectedDot: { backgroundColor: palette.mintStrong },
  connectingDot: { backgroundColor: palette.amber },
  neutralDot: { backgroundColor: "#98A7A1" },
  statusPillText: { color: palette.ink, fontSize: 10, fontWeight: "800" },
  statusBottomRow: { flexDirection: "row", alignItems: "center", marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#33443E" },
  endpoint: { color: "#91A49C", fontSize: 11, flex: 1, marginRight: 10 },
  connectButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.mintStrong, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12 },
  connectButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  accessBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF8EA", borderWidth: 1, borderColor: "#F4E4C7", borderRadius: 16, padding: 13 },
  accessIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#FCEBC5", alignItems: "center", justifyContent: "center" },
  accessCopy: { flex: 1, marginHorizontal: 10 },
  accessTitle: { color: "#7B551E", fontSize: 13, fontWeight: "800" },
  accessBody: { color: "#997544", fontSize: 11, lineHeight: 15, marginTop: 2 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 10, marginBottom: 1 },
  sectionTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  sectionSub: { fontSize: 12, marginTop: 3 },
  countBadge: { backgroundColor: palette.mint, minWidth: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  countBadgeText: { color: palette.mintStrong, fontWeight: "800", fontSize: 13 },
  messageCard: { backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.line, borderRadius: 20, padding: 17, shadowColor: "#17352B", shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  messageHeader: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#E8F2EA", alignItems: "center", justifyContent: "center" },
  avatarText: { color: palette.mintStrong, fontSize: 15, fontWeight: "800" },
  messageSender: { marginLeft: 10, flex: 1 },
  sender: { color: palette.ink, fontSize: 14, fontWeight: "800" },
  time: { color: palette.muted, fontSize: 11, marginTop: 2 },
  errorBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#FCEBE9", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, gap: 3 },
  errorBadgeText: { color: palette.red, fontSize: 10, fontWeight: "700" },
  messageText: { color: palette.ink, fontSize: 16, lineHeight: 23, marginTop: 16 },
  errorText: { color: palette.red, fontSize: 11, lineHeight: 16, marginTop: 10 },
  messageActions: { flexDirection: "row", gap: 9, marginTop: 17 },
  actionButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 11, minHeight: 40, paddingHorizontal: 8 },
  primaryButton: { backgroundColor: palette.mintStrong },
  secondaryButton: { backgroundColor: "#EDF7F0" },
  actionLabel: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  secondaryLabel: { color: palette.mintStrong },
  deleteButton: { width: 42, minHeight: 40, borderRadius: 11, backgroundColor: "#FCEBE9", alignItems: "center", justifyContent: "center" },
  disabledButton: { opacity: 0.45 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  emptyState: { alignItems: "center", paddingHorizontal: 30, paddingTop: 24, paddingBottom: 8 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: palette.mint, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptyBody: { textAlign: "center", fontSize: 12, lineHeight: 18, marginTop: 5 },
  manualCard: { backgroundColor: "#F4F8F3", borderRadius: 20, padding: 16, marginTop: 4 },
  manualHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  manualTitle: { color: palette.ink, fontSize: 15, fontWeight: "800" },
  manualSub: { color: palette.muted, fontSize: 11, marginTop: 3 },
  manualInput: { minHeight: 78, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: palette.line, borderRadius: 13, marginTop: 13, padding: 12, color: palette.ink, fontSize: 14, lineHeight: 20, textAlignVertical: "top" },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.ink, borderRadius: 12, minHeight: 41, marginTop: 10 },
  addButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  manualNotice: { color: palette.mintStrong, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 10 },
});
