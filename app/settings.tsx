import * as IntentLauncher from "expo-intent-launcher";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ScreenContainer } from "@/components/screen-container";
import { checkEsp32 } from "@/lib/esp32";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from "@/lib/message-store";
import { readNotificationAccess } from "@/lib/native-message";
import { useColors } from "@/hooks/use-colors";

const ink = "#14211F";
const muted = "#6E7C78";
const green = "#1D8C5F";
const mint = "#D8F2E4";
const line = "#E5ECE7";

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [address, setAddress] = useState(DEFAULT_SETTINGS.esp32BaseUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then((stored) => {
      setSettings(stored);
      setAddress(stored.esp32BaseUrl);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      readNotificationAccess().then((access) => {
        if (!active || access === null) return;
        setSettings((current) => {
          const next = { ...current, notificationAccessEnabled: access };
          void saveSettings(next);
          return next;
        });
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const updateSettings = async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
  };

  const openNotificationAccess = async () => {
    if (Platform.OS === "android") {
      await IntentLauncher.startActivityAsync("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
      return;
    }
    Alert.alert("Android setting", "Notification Access is available on the Android build of this app.");
  };

  const testConnection = async () => {
    const nextAddress = address.trim().replace(/\/$/, "");
    setAddress(nextAddress);
    await updateSettings({ esp32BaseUrl: nextAddress });
    setTesting(true);
    const result = await checkEsp32(nextAddress);
    setTestResult(result.detail);
    setTesting(false);
  };

  return (
    <ScreenContainer containerClassName="bg-background" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.nav}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={22} color={colors.foreground} /></Pressable><Text style={[styles.navTitle, { color: colors.foreground }]}>Settings</Text><View style={styles.navSpacer} /></View>

        <Text style={styles.intro}>Keep the speaker connection and message access ready for everyday use.</Text>

        <View style={styles.sectionCard}>
          <View style={styles.cardHeading}><View style={styles.headingIcon}><MaterialIcons name="notifications-active" size={19} color={green} /></View><View><Text style={styles.cardTitle}>Message Access</Text><Text style={styles.cardSub}>Detect incoming message notifications</Text></View></View>
          <View style={styles.accessRow}><View style={[styles.checkCircle, settings.notificationAccessEnabled ? styles.enabledCircle : styles.disabledCircle]}><MaterialIcons name={settings.notificationAccessEnabled ? "check" : "close"} size={15} color={settings.notificationAccessEnabled ? green : "#A46B2A"} /></View><View style={styles.accessText}><Text style={styles.accessTitle}>{settings.notificationAccessEnabled ? "Enabled" : "Disabled"}</Text><Text style={styles.accessSub}>{settings.notificationAccessEnabled ? "Notification access is enabled." : "Enable access once to receive new messages."}</Text></View><Pressable onPress={openNotificationAccess} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}><Text style={styles.smallButtonText}>{settings.notificationAccessEnabled ? "Manage" : "Enable"}</Text></Pressable></View>
          <Text style={styles.helper}>Android controls this permission. The app will not repeatedly redirect you after access is granted.</Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.cardHeading}><View style={styles.headingIcon}><MaterialIcons name="wifi" size={19} color={green} /></View><View><Text style={styles.cardTitle}>ESP32 speaker</Text><Text style={styles.cardSub}>Wi-Fi address and transfer endpoint</Text></View></View>
          <Text style={styles.fieldLabel}>ESP32 base address</Text>
          <TextInput value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.50:8080" placeholderTextColor="#9BA8A3" style={styles.input} />
          <Pressable disabled={testing || !address.trim()} onPress={testConnection} style={({ pressed }) => [styles.testButton, (testing || !address.trim()) && styles.disabled, pressed && styles.pressed]}><MaterialIcons name={testing ? "sync" : "network-check"} size={17} color="#FFFFFF" /><Text style={styles.testButtonText}>{testing ? "Checking speaker…" : "Test connection"}</Text></Pressable>
          {testResult && <Text style={[styles.result, testResult.includes("responded") ? styles.success : styles.failure]}>{testResult}</Text>}
          <Text style={styles.helper}>The ESP32 should expose GET /status and POST /audio. Audio is removed from the pending queue only after an acknowledgement.</Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.cardHeading}><View style={styles.headingIcon}><MaterialIcons name="record-voice-over" size={19} color={green} /></View><View><Text style={styles.cardTitle}>Text to speech</Text><Text style={styles.cardSub}>Android engine used for preview and WAV creation</Text></View></View>
          <View style={styles.statusLine}><View style={styles.onlineDot} /><Text style={styles.statusLineText}>Preview uses the Android TTS engine</Text></View>
          <View style={styles.statusLine}><View style={styles.onlineDot} /><Text style={styles.statusLineText}>OTP and long digit sequences are spaced for clarity</Text></View>
          <View style={styles.statusLine}><View style={styles.onlineDot} /><Text style={styles.statusLineText}>Bengali and mixed-language text use a sensible fallback</Text></View>
        </View>

        <View style={styles.protocolCard}><MaterialIcons name="security" size={19} color={green} /><View style={styles.protocolCopy}><Text style={styles.protocolTitle}>Local-first by design</Text><Text style={styles.protocolBody}>Message text stays on this device unless you explicitly send audio to the configured ESP32.</Text></View></View>
        <Text style={styles.version}>Smart Message Audio Player  •  v1.0.0</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#F6F8F5", alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 20, fontWeight: "800" },
  navSpacer: { width: 42 },
  intro: { color: muted, fontSize: 13, lineHeight: 19, marginBottom: 17 },
  sectionCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: line, borderRadius: 20, padding: 17, marginBottom: 13 },
  cardHeading: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  headingIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: mint, alignItems: "center", justifyContent: "center", marginRight: 10 },
  cardTitle: { color: ink, fontSize: 15, fontWeight: "800" },
  cardSub: { color: muted, fontSize: 11, marginTop: 3 },
  accessRow: { flexDirection: "row", alignItems: "center" },
  checkCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  enabledCircle: { backgroundColor: mint },
  disabledCircle: { backgroundColor: "#FFF0D8" },
  accessText: { flex: 1, marginLeft: 9 },
  accessTitle: { color: ink, fontSize: 13, fontWeight: "800" },
  accessSub: { color: muted, fontSize: 11, marginTop: 2 },
  smallButton: { backgroundColor: "#EDF7F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  smallButtonText: { color: green, fontSize: 11, fontWeight: "800" },
  helper: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 13 },
  fieldLabel: { color: ink, fontSize: 11, fontWeight: "800", marginBottom: 7 },
  input: { color: ink, backgroundColor: "#F7FAF7", borderColor: line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13 },
  testButton: { backgroundColor: ink, borderRadius: 12, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 10 },
  testButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  result: { fontSize: 11, fontWeight: "700", marginTop: 10 },
  success: { color: green },
  failure: { color: "#B6544E" },
  statusLine: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: green, marginRight: 9 },
  statusLineText: { color: ink, fontSize: 12 },
  protocolCard: { flexDirection: "row", backgroundColor: mint, borderRadius: 18, padding: 15, alignItems: "flex-start", marginTop: 2 },
  protocolCopy: { flex: 1, marginLeft: 10 },
  protocolTitle: { color: ink, fontSize: 13, fontWeight: "800" },
  protocolBody: { color: "#527064", fontSize: 11, lineHeight: 16, marginTop: 4 },
  version: { textAlign: "center", color: "#9BA8A3", fontSize: 10, marginTop: 22 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
});
