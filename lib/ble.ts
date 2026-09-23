import { BleManager, Device, Subscription } from "react-native-ble-plx";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export const ESP32_SERVICE_UUID = "7b9f0001-6f2a-4c6e-9d4b-7f4d3c2a1001";
export const ESP32_WRITE_UUID = "7b9f0002-6f2a-4c6e-9d4b-7f4d3c2a1001";
export const ESP32_ACK_UUID = "7b9f0003-6f2a-4c6e-9d4b-7f4d3c2a1001";

const CHUNK_SIZE = 180;
const ACK_TIMEOUT_MS = 12000;
let manager: BleManager | null = null;
let connectedDevice: Device | null = null;
let ackSubscription: Subscription | null = null;

export type BleResult = { ok: true; detail: string; device?: Device } | { ok: false; detail: string };

function getManager() {
  if (Platform.OS === "web") throw new Error("Bluetooth is available in the Android/iOS build, not the web preview.");
  return (manager ??= new BleManager());
}

function decodeBase64(value: string) {
  return typeof globalThis.atob === "function" ? globalThis.atob(value) : value;
}

function waitForAck(device: Device) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error("ESP32 did not acknowledge the BLE audio transfer.")); }
    }, ACK_TIMEOUT_MS);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ackSubscription?.remove();
      ackSubscription = null;
      error ? reject(error) : resolve();
    };
    ackSubscription = device.monitorCharacteristicForService(ESP32_SERVICE_UUID, ESP32_ACK_UUID, (error, characteristic) => {
      if (error) return finish(new Error(error.message));
      const payload = characteristic?.value ? decodeBase64(characteristic.value).toLowerCase() : "";
      if (!payload || /ack|received|done|complete|success|ok/.test(payload)) finish();
    });
  });
}

export async function scanForEsp32(onDevice: (device: Device) => void, timeoutMs = 8000): Promise<BleResult> {
  const ble = getManager();
  const state = await ble.state();
  if (state !== "PoweredOn") return { ok: false, detail: "Turn on Bluetooth and allow nearby-device permission to scan." };
  return new Promise((resolve) => {
    let found = 0;
    const timer = setTimeout(() => {
      ble.stopDeviceScan();
      resolve(found ? { ok: true, detail: `Found ${found} ESP32 device${found === 1 ? "" : "s"}.` } : { ok: false, detail: "No ESP32 speaker found nearby." });
    }, timeoutMs);
    ble.startDeviceScan([ESP32_SERVICE_UUID], null, (error, device) => {
      if (error) { clearTimeout(timer); ble.stopDeviceScan(); resolve({ ok: false, detail: error.message }); return; }
      if (device) { found += 1; onDevice(device); }
    });
  });
}

export async function connectEsp32(deviceId: string): Promise<BleResult> {
  const ble = getManager();
  try {
    ble.stopDeviceScan();
    connectedDevice = await ble.connectToDevice(deviceId, { timeout: 12000 });
    connectedDevice = await connectedDevice.discoverAllServicesAndCharacteristics();
    return { ok: true, detail: `Connected to ${connectedDevice.name || "ESP32 speaker"}.`, device: connectedDevice };
  } catch (error) {
    connectedDevice = null;
    return { ok: false, detail: error instanceof Error ? error.message : "Could not connect to the ESP32 speaker." };
  }
}

export async function disconnectEsp32() {
  ackSubscription?.remove();
  ackSubscription = null;
  if (connectedDevice) await connectedDevice.cancelConnection().catch(() => undefined);
  connectedDevice = null;
}

export async function sendWavOverBle(deviceId: string, wavUri: string): Promise<BleResult> {
  const connected = connectedDevice?.id === deviceId ? { ok: true as const, detail: "Already connected.", device: connectedDevice } : await connectEsp32(deviceId);
  if (!connected.ok || !connected.device) return connected;
  try {
    const base64 = await FileSystem.readAsStringAsync(wavUri, { encoding: FileSystem.EncodingType.Base64 });
    const acknowledgement = waitForAck(connected.device);
    for (let offset = 0; offset < base64.length; offset += CHUNK_SIZE * 4 / 3) {
      const chunk = base64.slice(offset, offset + Math.floor(CHUNK_SIZE * 4 / 3));
      await connected.device.writeCharacteristicWithResponseForService(ESP32_SERVICE_UUID, ESP32_WRITE_UUID, chunk);
    }
    await acknowledgement;
    return { ok: true, detail: "ESP32 acknowledged the Bluetooth audio transfer." };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Bluetooth audio transfer failed. The message remains pending." };
  }
}

export async function deliverMessageOverBle(deviceId: string, wavUri: string): Promise<BleResult> {
  return sendWavOverBle(deviceId, wavUri);
}
