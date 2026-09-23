# ESP32 BLE audio protocol

The mobile app connects to an ESP32 advertising the service below and sends a complete WAV file over the write characteristic.

| Purpose | UUID |
|---|---|
| Service | `7b9f0001-6f2a-4c6e-9d4b-7f4d3c2a1001` |
| Audio write characteristic | `7b9f0002-6f2a-4c6e-9d4b-7f4d3c2a1001` |
| Notify/ACK characteristic | `7b9f0003-6f2a-4c6e-9d4b-7f4d3c2a1001` |

Audio is **WAV, PCM 16-bit, mono, 22050 Hz**. The app sends the WAV bytes as base64 BLE writes using response-enabled writes. Each decoded packet is limited to 180 bytes, which is safe for the common negotiated BLE MTU. The app subscribes to the ACK characteristic before transfer and waits up to 12 seconds after the final packet.

The ESP32 firmware should buffer all received writes, reconstruct the WAV file, play it, and notify a short acknowledgement such as `ACK`, `received`, `done`, `complete`, `success`, or `ok` after the complete audio has been accepted. The app treats any notification containing one of those acknowledgement terms as success.

Direct BLE discovery and transfer require a native Android/iOS build with `react-native-ble-plx`; they are not available in Expo web preview. Wi-Fi HTTP delivery remains available as a fallback mode.
