const { withAndroidManifest, withDangerousMod, withMainApplication } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function packagePath(packageName) {
  return packageName.split(".").join(path.sep);
}

function kotlinSources(packageName) {
  const pkg = packageName;
  return {
    module: `package ${pkg}\n\nimport android.speech.tts.TextToSpeech\nimport android.speech.tts.UtteranceProgressListener\nimport androidx.core.app.NotificationManagerCompat\nimport com.facebook.react.bridge.Promise\nimport com.facebook.react.bridge.ReactApplicationContext\nimport com.facebook.react.bridge.ReactContextBaseJavaModule\nimport com.facebook.react.bridge.ReactMethod\nimport java.io.File\nimport java.util.Locale\nimport java.util.UUID\n\nclass SmartMessageAudioModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {\n  override fun getName() = "SmartMessageAudio"\n\n  @ReactMethod\n  fun isNotificationAccessEnabled(promise: Promise) {\n    promise.resolve(NotificationManagerCompat.getEnabledListenerPackages(reactApplicationContext).contains(reactApplicationContext.packageName))\n  }\n\n  @ReactMethod\n  fun drainDetectedMessages(promise: Promise) {\n    val prefs = reactApplicationContext.getSharedPreferences("smart_message_audio", android.content.Context.MODE_PRIVATE)\n    val queue = prefs.getString("queue", "[]") ?: "[]"\n    prefs.edit().remove("queue").apply()\n    promise.resolve(queue)\n  }\n\n  @ReactMethod\n  fun synthesizeToWav(text: String, fileName: String, rate: Double, promise: Promise) {\n    val output = File(reactApplicationContext.cacheDir, fileName.ifBlank { "message-\${UUID.randomUUID()}.wav" })\n    val tts = TextToSpeech(reactApplicationContext) { status ->\n      if (status != TextToSpeech.SUCCESS) { promise.reject("TTS_INIT", "Android TTS could not be initialized"); return@TextToSpeech }\n      tts.setSpeechRate(rate.toFloat())\n      tts.language = if (text.any { it in '\\u0980'..'\\u09FF' }) Locale("bn", "IN") else Locale("en", "IN")\n      tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {\n        override fun onStart(id: String?) {}\n        override fun onDone(id: String?) { tts.shutdown(); promise.resolve(output.absolutePath) }\n        override fun onError(id: String?) { tts.shutdown(); promise.reject("TTS_SYNTHESIS", "Android TTS failed to create WAV") }\n      })\n      val result = tts.synthesizeToFile(text, android.os.Bundle(), output, UUID.randomUUID().toString())\n      if (result != TextToSpeech.SUCCESS) { tts.shutdown(); promise.reject("TTS_SYNTHESIS", "Android TTS rejected WAV generation") }\n    }\n  }\n}\n`,
    pkg: `package ${pkg}\n\nimport com.facebook.react.ReactPackage\nimport com.facebook.react.bridge.NativeModule\nimport com.facebook.react.bridge.ReactApplicationContext\nimport com.facebook.react.uimanager.ViewManager\n\nclass SmartMessageAudioPackage : ReactPackage {\n  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SmartMessageAudioModule(context))\n  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()\n}\n`,
    listener: `package ${pkg}\n\nimport android.service.notification.NotificationListenerService\nimport android.service.notification.StatusBarNotification\nimport org.json.JSONArray\nimport org.json.JSONObject\nimport java.util.Locale\n\nclass SmartMessageNotificationListener : NotificationListenerService() {\n  override fun onNotificationPosted(sbn: StatusBarNotification) {\n    if (sbn.packageName == packageName || sbn.isOngoing) return\n    val extras = sbn.notification.extras\n    if (extras.getBoolean("android.isGroupSummary", false)) return\n    val sender = extras.getCharSequence("android.title")?.toString()?.trim().orEmpty()\n    val text = extras.getCharSequence("android.text")?.toString()?.trim().orEmpty()\n    val lowered = text.lowercase(Locale.US)\n    if (sender.isBlank() || text.isBlank() || Regex("^(\\\\d+\\\\s+)?(new|unread) messages?$", RegexOption.IGNORE_CASE).matches(text) || lowered.contains("checking for messages") || lowered.contains("checking for sms")) return\n    val id = "\${sbn.key}:\${sbn.postTime}:\${sender}:\${text}"\n    val prefs = getSharedPreferences("smart_message_audio", MODE_PRIVATE)\n    val existing = JSONArray(prefs.getString("queue", "[]"))\n    for (index in 0 until existing.length()) if (existing.getJSONObject(index).optString("id") == id) return\n    existing.put(JSONObject().apply { put("id", id); put("sender", sender); put("text", text); put("receivedAt", sbn.postTime) })\n    prefs.edit().putString("queue", existing.toString()).apply()\n  }\n}\n`,
  };
}

module.exports = function withSmartMessageAudio(config) {
  const packageName = config.android?.package || "space.manus.smartmessageaudioplayer";
  const source = kotlinSources(packageName);
  config = withAndroidManifest(config, (config) => {
    config.modResults.manifest["uses-permission"] = config.modResults.manifest["uses-permission"] || [];
    for (const permission of ["android.permission.BLUETOOTH", "android.permission.BLUETOOTH_ADMIN", "android.permission.BLUETOOTH_CONNECT", "android.permission.BLUETOOTH_SCAN"]) {
      if (!config.modResults.manifest["uses-permission"].some((entry) => entry.$?.["android:name"] === permission)) {
        config.modResults.manifest["uses-permission"].push({ $: { "android:name": permission } });
      }
    }
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;
    application.service = application.service || [];
    application.service.push({
      $: { "android:name": `${packageName}.SmartMessageNotificationListener`, "android:label": "Smart Message Audio", "android:permission": "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE", "android:exported": "true" },
      "intent-filter": [{ action: [{ $: { "android:name": "android.service.notification.NotificationListenerService" } }] }],
    });
    return config;
  });
  config = withMainApplication(config, (config) => {
    const contents = config.modResults.contents;
    const importLine = `import ${packageName}.SmartMessageAudioPackage`;
    let updated = contents.includes(importLine) ? contents : `${importLine}\n${contents}`;
    if (!updated.includes("SmartMessageAudioPackage()")) {
      updated = updated.replace(/PackageList\\(this\\)\\.packages\\.apply \\{/, (match) => `${match}\n      add(SmartMessageAudioPackage())`);
    }
    config.modResults.contents = updated;
    return config;
  });
  return withDangerousMod(config, ["android", async (config) => {
    const androidRoot = config.modRequest.platformProjectRoot;
    const srcRoot = path.join(androidRoot, "app", "src", "main", "java", packagePath(packageName));
    fs.mkdirSync(srcRoot, { recursive: true });
    fs.writeFileSync(path.join(srcRoot, "SmartMessageAudioModule.kt"), source.module);
    fs.writeFileSync(path.join(srcRoot, "SmartMessageAudioPackage.kt"), source.pkg);
    fs.writeFileSync(path.join(srcRoot, "SmartMessageNotificationListener.kt"), source.listener);
    return config;
  }]);
};
