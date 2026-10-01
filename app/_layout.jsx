import { Redirect, Slot, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import useAuthStore from "../store/authStore";

import messaging from "@react-native-firebase/messaging";
import { Platform, PermissionsAndroid } from "react-native";

// Register background handler early
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
});

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

      const unsubscribe = messaging().onMessage(async (remoteMessage) => {
        console.log('A new FCM message arrived!', JSON.stringify(remoteMessage));
        // Use Alert from react-native (make sure it's imported)
        const { Alert } = require('react-native');
        if (remoteMessage.notification) {
          Alert.alert(
            remoteMessage.notification.title || "New Notification",
            remoteMessage.notification.body
          );
        }
      });

      return unsubscribe;
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
