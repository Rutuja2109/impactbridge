// ImpactBridge mobile shell: shows the ImpactBridge web app full screen, like the installed app.
// The address comes from app.json -> expo.extra.webUrl (your laptop's Wi-Fi address while testing,
// your https server address once it is online). You can also change it on the error screen.
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const TEAL = "#00918F";
const DEFAULT_URL = Constants.expoConfig?.extra?.webUrl || "http://192.168.1.11:8000";

function Shell() {
  const web = useRef(null);
  const [url, setUrl] = useState(DEFAULT_URL);
  const [draft, setDraft] = useState(DEFAULT_URL);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const origin = url.replace(/^(https?:\/\/[^/]+).*$/, "$1");

  // Android back button goes back inside the app before leaving it.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack && web.current) { web.current.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // WhatsApp, phone, email and other sites open in their own apps.
  const onShouldStart = useCallback((req) => {
    if (req.url.startsWith(origin) || req.url.startsWith("about:") || req.url.startsWith("blob:") || req.url.startsWith("data:")) return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, [origin]);

  if (failed) {
    return (
      <View style={styles.fail}>
        <Text style={styles.failTitle}>Can't reach ImpactBridge</Text>
        <Text style={styles.failText}>Make sure the server is running on your laptop and your phone is on the same Wi-Fi. Check the address below.</Text>
        <TextInput style={styles.input} value={draft} onChangeText={setDraft} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Pressable style={styles.button} onPress={() => { setUrl(draft.trim().replace(/\/$/, "")); setFailed(false); setLoading(true); }}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={web}
        source={{ uri: url }}
        cacheEnabled={false}
        cacheMode="LOAD_NO_CACHE"
        style={{ flex: 1 }}
        applicationNameForUserAgent="ImpactBridgeApp/1.0"
        onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        onShouldStartLoadWithRequest={onShouldStart}
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500 && !canGoBack) setFailed(true); }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        allowFileAccess
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
        overScrollMode="never"
      />
      {loading && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>ImpactBridge</Text>
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top", "bottom"]}>
        <StatusBar style="dark" backgroundColor="#ffffff" />
        <Shell />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { ...StyleSheet.absoluteFillObject, backgroundColor: TEAL, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  fail: { flex: 1, padding: 24, justifyContent: "center", backgroundColor: "#fff", gap: 12 },
  failTitle: { fontSize: 22, fontWeight: "700", color: "#333" },
  failText: { fontSize: 15, color: "#666", lineHeight: 22 },
  input: { borderWidth: 1.5, borderColor: "#D6D6D6", borderRadius: 6, padding: 12, fontSize: 16, color: "#333" },
  button: { backgroundColor: TEAL, borderRadius: 4, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
