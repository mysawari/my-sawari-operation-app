import Constants from "expo-constants";
import {
  Slot,
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import useAuthStore from "../store/authStore";
import { AnimatedSplash } from "./components/AnimatedSplash";

SplashScreen.preventAutoHideAsync().catch(() => {});

let messaging = null;
let Notifications = null;
const isExpoGo =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

if (!isExpoGo) {
  try {
    Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
      }).catch(() => {});
    }
  } catch (e) {
    Notifications = null;
    console.warn("expo-notifications not available", e);
  }

  try {
    const mod = require("@react-native-firebase/messaging");
    messaging = mod.default || mod;
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      try {
        if (
          Notifications &&
          !remoteMessage?.notification &&
          remoteMessage?.data
        ) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: String(remoteMessage.data.title || "New Notification"),
              body: String(
                remoteMessage.data.body || "You have a new message.",
              ),
              data: remoteMessage.data,
            },
            trigger: null,
          });
        }
      } catch (e) {
        console.warn("Background notification failed", e);
      }
    });
  } catch (e) {
    messaging = null;
    console.warn("Firebase messaging not available", e);
  }
}

// Shows the real error on screen instead of crashing (works in the APK too)
export function ErrorBoundary({ error, retry }) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 24,
        backgroundColor: "#fff",
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>
        Something went wrong
      </Text>
      <Text selectable style={{ color: "#b91c1c", marginBottom: 20 }}>
        {error?.message}
      </Text>
      <Pressable
        onPress={retry}
        style={{ backgroundColor: "#FFC107", padding: 14, borderRadius: 10 }}
      >
        <Text style={{ textAlign: "center", fontWeight: "600" }}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const token = useAuthStore((s) => s.token);
  const initialized = useAuthStore((s) => s.initialized);
  const initializeAuth = useAuthStore((s) => s.initializeAuth);

  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    initializeAuth().catch((e) =>
      console.error("Auth init failed:", e?.message),
    );
  }, [initializeAuth]);

  // Redirect AFTER the navigator is mounted (never replace <Slot />)
  useEffect(() => {
    if (!initialized || !navState?.key) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!token && !inAuthGroup) router.replace("/(auth)/login");
    else if (token && inAuthGroup) router.replace("/(tabs)/home");
  }, [initialized, token, segments, navState?.key]);

  // Push notifications
  useEffect(() => {
    if (!token || !messaging || isExpoGo) return;
    let unsubscribe = () => {};

    (async () => {
      try {
        if (Platform.OS === "android" && Platform.Version >= 33) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
        } else if (Platform.OS === "ios") {
          await messaging().requestPermission();
        }
        await messaging().subscribeToTopic("admin_notifications");
      } catch (e) {
        console.error("Push setup failed:", e?.message);
      }
    })();

    try {
      unsubscribe = messaging().onMessage(async (remoteMessage) => {
        try {
          if (!Notifications) return;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: String(
                remoteMessage?.notification?.title ||
                  remoteMessage?.data?.title ||
                  "New Notification",
              ),
              body: String(
                remoteMessage?.notification?.body ||
                  remoteMessage?.data?.body ||
                  "You have a new message.",
              ),
              data: remoteMessage?.data || {},
            },
            trigger: null,
          });
        } catch (e) {
          console.warn("Foreground notification failed", e);
        }
      });
    } catch (e) {
      console.warn("onMessage failed", e);
    }

    return () => unsubscribe();
  }, [token]);

  useEffect(() => {
    if (initialized) SplashScreen.hideAsync().catch(() => {});
  }, [initialized]);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <AnimatedSplash isReady={initialized}>
          <Slot />
        </AnimatedSplash>
      </View>
    </SafeAreaProvider>
  );
}
