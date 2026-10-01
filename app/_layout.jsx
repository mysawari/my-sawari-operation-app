import { Redirect, Slot, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import useAuthStore from "../store/authStore";

import messaging from "@react-native-firebase/messaging";
import { Platform, PermissionsAndroid } from "react-native";

export default function RootLayout() {
  const token = useAuthStore((state) => state.token);
  const initialized = useAuthStore((state) => state.initialized);
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  const segments = useSegments();

  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;

    hasInitialized.current = true;

    const init = async () => {
      try {
        await initializeAuth();
      } catch (error) {
        console.error("Auth initialization failed:", error);
      }
    };

    init();
  }, [initializeAuth]);

  // Setup Firebase Push Notifications
  useEffect(() => {
    if (token) {
      const setupPushNotifications = async () => {
        try {
          if (Platform.OS === 'android') {
            await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
          } else {
            await messaging().requestPermission();
          }
          
          await messaging().subscribeToTopic('admin_notifications');
          console.log("Subscribed to admin_notifications topic!");
        } catch (error) {
          console.error("Push notification setup failed:", error);
        }
      };
      
      setupPushNotifications();
    }
  }, [token]);

  const inAuthGroup = segments[0] === "(auth)";

  return (
    <SafeAreaProvider>
      {!initialized ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : !token && !inAuthGroup ? (
        <Redirect href="/(auth)/login" />
      ) : token && inAuthGroup ? (
        <Redirect href="/(tabs)" />
      ) : (
        <Slot />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
});
