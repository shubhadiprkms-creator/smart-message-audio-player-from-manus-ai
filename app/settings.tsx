import * as IntentLauncher from "expo-intent-launcher";
import * as Speech from "expo-speech";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ScreenContainer } from "@/components/screen-container";
import { checkEsp32, connectEsp32, scanForEsp32 } from "@/lib/esp32";
import { DEFAULT_SETTINGS, loadSettings, resolveVoiceId, saveSettings, type AppSettings } from "@/lib/message-store";
import { readNotificationAccess } from "@/lib/native-message";
import { useColors } from "@/hooks/use-colors";

const ink = "#14211F";
const muted = "#6E7C78";
const green = "#1D8C5F";
const mint = "#D8F2E4";
const line = "#E5ECE7";
const speeds: AppSettings["speechRate"][] = [0.5, 1, 2];

type Voice = { identifier: string; name: string; language: string };

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [address, setAddress] = useState(DEFAULT_SETTINGS.esp32BaseUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [foundDevices, setFoundDevices] = useState<{ id: string; name: string }[]>([]);

  const refreshVoices = useCallback(async () => {
    try {
      const available = await Speech.getAvailableVoicesAsync();
      const indian = available.filter((voice) => /^(en|bn|hi|as|ta|te|mr|gu|kn|ml|pa)/i.test(voice.language));
      const usable = (indian.length ? indian : available).slice(0, 12).map((voice) => ({ identifier: voice.identifier, name: voice.name, language: voice.language }));
      setVoices(usable);
      return available;
    } catch {
      setVoices([]);
      return [];
    }
  }, []);

  useEffect(() => {
    refreshVoices();
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([loadSettings(), readNotificationAccess(), refreshVoices()]).then(([stored, access, available]) => {
      if (!active) return;
      const next = { ...stored, ttsVoiceId: resolveVoiceId(stored.ttsVoiceId, available), ...(access === null ? {} : { notificationAccessEnabled: access }) };
      setSettings(next);
      setAddress(next.esp32BaseUrl);
      if (access !== null || next.ttsVoiceId !== stored.ttsVoiceId) void saveSettings(next);
    });
    return () => { active = false; };
  }, [refreshVoices]));

  const updateSettings = async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
  };

  const openNotificationAccess = async () => {
    if (Platform.OS === "android") { await IntentLauncher.startActivityAsync("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"); return; }
    Alert.alert("Android setting", "Message Access is available on the Android build of this app.");
  };

  const openBluetoothSettings = async () => {
    if (Platform.OS === "android") { await IntentLauncher.startActivityAsync("android.settings.BLUETOOTH_SETTINGS"); return; }
    Alert.alert("Bluetooth pairing", "Pair the ESP32 speaker from your phone Bluetooth settings.");
  };

  const scanBluetooth = async () => {
    if (Platform.OS === "web") { Alert.alert("Bluetooth", "Scanning requires the Android/iOS app build."); return; }
    setScanning(true);
    setScanResult("Scanning for ESP32 speakers…");
    setFoundDevices([]);
    const result = await scanForEsp32((device) => {
      setFoundDevices((current) => current.some((item) => item.id === device.id) ? current : [...current, { id: device.id, name: device.name || device.localName || "ESP32 speaker" }]);
    });
    setScanResult(result.detail);
    setScanning(false);
  };

  const selectBluetoothDevice = async (device: { id: string; name: string }) => {
    setScanResult("Connecting to ESP32 speaker…");
    const result = await connectEsp32(device.id);
    if (!result.ok) { setScanResult(result.detail); return; }
    await updateSettings({ bluetoothDeviceId: device.id, bluetoothDeviceName: device.name, connectionMode: "bluetooth" });
    setScanResult("Connected and saved. Messages will use direct Bluetooth audio.");
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
        <View style={styles.nav}><Pressable accessibilityRole="button" accessibilityLabel="Back to Home" onPress={() => router.replace("/" as never)} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={22} color={colors.foreground} /></Pressable><Text style={[styles.navTitle, { color: colors.foreground }]}>Settings</Text><View style={styles.navSpacer} /></View>
        <Text style={styles.intro}>Connect your phone to the ESP32 speaker and tune how every message is spoken.</Text>

        <View style={styles.sectionCard}>
          <View style={styles.cardHeading}><View style={styles.headingIcon}><MaterialIcons name="bluetooth" size={20} color={green} /></View><View><Text style={styles.cardTitle}>Phone Bluetooth</Text><Text style={styles.cardSub}>Primary connection to your ESP32 speaker</Text></View></View>
          <View style={styles.accessRow}><View style={[styles.checkCircle, settings.bluetoothDeviceId ? styles.enabledCircle : styles.disabledCircle]}><MaterialIcons name={settings.bluetoothDeviceId ? "bluetooth-connected" : "bluetooth-disabled"} size={15} color={settings.bluetoothDeviceId ? green : "#A46B2A"} /></View><View style={styles.accessText}><Text style={styles.accessTitle}>{settings.bluetoothDeviceId ? settings.bluetoothDeviceName : "No ESP32 selected"}</Text><Text style={styles.accessSub}>{settings.bluetoothDeviceId ? "Direct Bluetooth audio is ready." : "Scan nearby devices to connect."}</Text></View><Pressable onPress={scanBluetooth} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}><Text style={styles.smallButtonText}>{scanning ? "Scanning…" : "Scan"}</Text></Pressable></View>
          {foundDevices.map((device) => <Pressable key={device.id} onPress={() => selectBluetoothDevice(device)} style={({ pressed }) => [styles.deviceRow, pressed && styles.pressed]}><MaterialIcons name="speaker" size={17} color={green} /><View style={styles.accessText}><Text style={styles.accessTitle}>{device.name}</Text><Text style={styles.accessSub}>{device.id}</Text></View><MaterialIcons name="chevron-right" size={18} color={green} /></Pressable>)}
          {scanResult && <Text style={styles.helper}>{scanResult}</Text>}
          <Pressable onPress={openBluetoothSettings} style={({ pressed }) => [styles.secondaryLink, pressed && styles.pressed]}><Text style={styles.secondaryLinkText}>Open phone Bluetooth settings</Text></Pressable>
          <Text style={styles.helper}>The app scans for the configured ESP32 service and sends WAV PCM 16-bit mono 22050 Hz audio in BLE packets with acknowledgement.</Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.cardHeading}><View style={styles.headingIcon}><MaterialIcons name="notifications-active" size={19} color={green} /></View><View><Text style={styles.cardTitle}>Message Access</Text><Text style={styles.cardSub}>Detect incoming message notifications</Text></View></View>
          <View style={styles.accessRow}><View style={[styles.checkCircle, settings.notificationAccessEnabled ? styles.enabledCircle : styles.disabledCircle]}><MaterialIcons name={settings.notificationAccessEnabled ? "check" : "close"} size={15} color={settings.notificationAccessEnabled ? green : "#A46B2A"} /></View><View style={styles.accessText}><Text style={styles.accessTitle}>{settings.notificationAccessEnabled ? "Enabled" : "Disabled"}</Text><Text style={styles.accessSub}>{settings.notificationAccessEnabled ? "New message notifications can be queued." : "Enable access once to receive new messages."}</Text></View><Pressable onPress={openNotificationAccess} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}><Text style={styles.smallButtonText}>{settings.notificationAccessEnabled ? "Manage" : "Enable"}</Text></Pressable></View>
          <Text style={styles.helper}>Android controls this permission. The app will not repeatedly redirect you after access is granted.</Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.cardHeading}><View style={styles.headingIcon}><MaterialIcons name="record-voice-over" size={19} color={green} /></View><View><Text style={styles.cardTitle}>TTS voice</Text><Text style={styles.cardSub}>Choose the voice used for previews and speaker audio</Text></View></View>
          <View style={styles.optionWrap}>
            <Pressable onPress={() => updateSettings({ ttsVoiceId: "" })} style={[styles.option, !settings.ttsVoiceId && styles.optionSelected]}><Text style={[styles.optionText, !settings.ttsVoiceId && styles.optionTextSelected]}>System default</Text></Pressable>
            {voices.map((voice) => <Pressable key={voice.identifier} onPress={() => updateSettings({ ttsVoiceId: voice.identifier })} style={[styles.option, settings.ttsVoiceId === voice.identifier && styles.optionSelected]}><Text numberOfLines={1} style={[styles.optionText, settings.ttsVoiceId === voice.identifier && styles.optionTextSelected]}>{voice.name || voice.language}</Text></Pressable>)}
          </View>
          <Text style={styles.fieldLabel}>Speech speed</Text>
          <View style={styles.speedRow}>{speeds.map((speed) => <Pressable key={speed} onPress={() => updateSettings({ speechRate: speed })} style={[styles.speedButton, settings.speechRate === speed && styles.speedSelected]}><Text style={[styles.speedText, settings.speechRate === speed && styles.speedTextSelected]}>{speed}x</Text></Pressable>)}</View>
          <Text style={styles.helper}>Banglish, Hinglish, Bengali, Hindi, and English are routed to the phone's regional offline voices with pronunciation hints. Accent quality depends on the voices installed on this phone. 0.5x is slower for clarity, 1x is normal, and 2x is faster. Quick previews are limited to about 5 seconds.</Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.cardHeading}><View style={styles.headingIcon}><MaterialIcons name="wifi" size={19} color={green} /></View><View><Text style={styles.cardTitle}>ESP32 fallback endpoint</Text><Text style={styles.cardSub}>Used for the current acknowledged transfer protocol</Text></View></View>
          <Text style={styles.fieldLabel}>ESP32 base address</Text>
          <TextInput value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.50:8080" placeholderTextColor="#9BA8A3" style={styles.input} />
          <Pressable disabled={testing || !address.trim()} onPress={testConnection} style={({ pressed }) => [styles.testButton, (testing || !address.trim()) && styles.disabled, pressed && styles.pressed]}><MaterialIcons name={testing ? "sync" : "network-check"} size={17} color="#FFFFFF" /><Text style={styles.testButtonText}>{testing ? "Checking speaker…" : "Test Wi-Fi fallback"}</Text></Pressable>
          {testResult && <Text style={[styles.result, testResult.includes("responded") ? styles.success : styles.failure]}>{testResult}</Text>}
          <Text style={styles.helper}>Bluetooth pairing is the selected connection flow. This endpoint remains available for ESP32 firmware that uses the documented HTTP acknowledgement protocol.</Text>
        </View>

        <View style={styles.protocolCard}><MaterialIcons name="security" size={19} color={green} /><View style={styles.protocolCopy}><Text style={styles.protocolTitle}>Local-first by design</Text><Text style={styles.protocolBody}>Message text stays on this device unless you explicitly send audio to the configured ESP32.</Text></View></View>
        <Text style={styles.version}>Smart Message Audio Player  •  v1.0.0</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 }, nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }, backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#F6F8F5", alignItems: "center", justifyContent: "center" }, navTitle: { fontSize: 20, fontWeight: "800" }, navSpacer: { width: 42 }, intro: { color: muted, fontSize: 13, lineHeight: 19, marginBottom: 17 }, sectionCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: line, borderRadius: 20, padding: 17, marginBottom: 13 }, cardHeading: { flexDirection: "row", alignItems: "center", marginBottom: 16 }, headingIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: mint, alignItems: "center", justifyContent: "center", marginRight: 10 }, cardTitle: { color: ink, fontSize: 15, fontWeight: "800" }, cardSub: { color: muted, fontSize: 11, marginTop: 3 }, accessRow: { flexDirection: "row", alignItems: "center" }, checkCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" }, enabledCircle: { backgroundColor: mint }, disabledCircle: { backgroundColor: "#FFF0D8" }, accessText: { flex: 1, marginLeft: 9 }, accessTitle: { color: ink, fontSize: 13, fontWeight: "800" }, accessSub: { color: muted, fontSize: 11, marginTop: 2 }, smallButton: { backgroundColor: "#EDF7F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }, smallButtonText: { color: green, fontSize: 11, fontWeight: "800" }, deviceRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: line, paddingTop: 12, marginTop: 12 }, secondaryLink: { alignSelf: "flex-start", marginTop: 10 }, secondaryLinkText: { color: green, fontSize: 11, fontWeight: "800" }, helper: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 13 }, fieldLabel: { color: ink, fontSize: 11, fontWeight: "800", marginBottom: 7 }, input: { color: ink, backgroundColor: "#F7FAF7", borderColor: line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13 }, testButton: { backgroundColor: ink, borderRadius: 12, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 10 }, testButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" }, disabled: { opacity: 0.5 }, result: { fontSize: 11, fontWeight: "700", marginTop: 10 }, success: { color: green }, failure: { color: "#B6544E" }, optionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }, option: { maxWidth: "100%", borderWidth: 1, borderColor: line, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: "#F7FAF7" }, optionSelected: { backgroundColor: mint, borderColor: green }, optionText: { color: ink, fontSize: 11, fontWeight: "700" }, optionTextSelected: { color: green }, speedRow: { flexDirection: "row", gap: 8 }, speedButton: { flex: 1, borderWidth: 1, borderColor: line, borderRadius: 11, alignItems: "center", paddingVertical: 11, backgroundColor: "#F7FAF7" }, speedSelected: { backgroundColor: ink, borderColor: ink }, speedText: { color: ink, fontSize: 13, fontWeight: "800" }, speedTextSelected: { color: "#FFFFFF" }, protocolCard: { flexDirection: "row", backgroundColor: mint, borderRadius: 18, padding: 15, alignItems: "flex-start", marginTop: 2 }, protocolCopy: { flex: 1, marginLeft: 10 }, protocolTitle: { color: ink, fontSize: 13, fontWeight: "800" }, protocolBody: { color: "#527064", fontSize: 11, lineHeight: 16, marginTop: 4 }, version: { textAlign: "center", color: "#9BA8A3", fontSize: 10, marginTop: 22 }, pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
});
