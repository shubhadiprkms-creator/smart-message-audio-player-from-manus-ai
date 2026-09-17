# Smart Message Audio Player — ESP32 protocol

The Android app talks to the speaker over the user's existing Wi-Fi network. The ESP32 should expose a small HTTP server on a fixed local address, for example `http://192.168.1.50:8080`.

## `GET /status`

The app calls this endpoint before every delivery and when the user presses **Connect**.

A ready speaker returns HTTP `200` with JSON:

```json
{ "ready": true, "device": "smart-message-speaker", "firmware": "1.0.0" }
```

A speaker that is reachable but cannot play audio may return `{ "ready": false }`; the app treats that as unavailable.

## `POST /audio`

The request body is the complete WAV file as binary data. Headers:

```text
Content-Type: audio/wav
X-Audio-Format: PCM_S16LE_22050_MONO
```

The ESP32 must validate the RIFF/WAVE header, sample format, declared byte length, and the received byte count before acknowledging. It should write the transfer to the SD card or a temporary file, then queue playback through the amplifier.

A successful response is HTTP `200` with:

```json
{ "ack": "received", "bytes": 123456 }
```

Any non-2xx response or response without `ack: received` is a failed delivery. The Android app keeps the message in its pending queue and allows retry. It never deletes a message before the acknowledgement.

## Transfer safety

The ESP32 should reject a second upload while one transfer is active, enforce a sensible maximum file size, and discard partial files when the connection closes. A checksum field can be added later without changing the high-level flow. The Android side sends messages sequentially and never starts a second transfer while the first is awaiting an acknowledgement.

## Android build

This project is an Expo SDK 54 mobile app. The `withSmartMessageAudio` config plugin adds:

- `SmartMessageNotificationListener`, registered as an Android `NotificationListenerService`.
- Duplicate and summary-notification filtering using notification key, post time, sender, and text.
- `SmartMessageAudio`, a native React Native module for Android TTS `synthesizeToFile` WAV generation.
- Native permission-state and filtered-event queue methods for the JavaScript UI.

Create the native Android project with `npx expo prebuild -p android`, then build with `npx expo run:android` or an equivalent EAS Android build. On first launch, open **Settings → Message Access → Enable** and grant notification access in Android system settings.
