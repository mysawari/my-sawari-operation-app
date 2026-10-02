import { Redirect, Slot, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import useAuthStore from "../store/authStore";
import * as SplashScreen from 'expo-splash-screen';
import { AnimatedSplash } from "./components/AnimatedSplash";

SplashScreen.preventAutoHideAsync().catch(() => {});

import { Platform, PermissionsAndroid, Alert } from "react-native";
import Constants from "expo-constants";

// Only require Firebase and Notifications if not running in Expo Go
// as expo-notifications Android push support was removed from Expo Go SDK 53
let messaging = null;
let Notifications = null;
const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (e) {
    console.warn("Expo notifications module not available", e);
  }

  try {
    const messagingModule = require("@react-native-firebase/messaging");
    messaging = messagingModule.default || messagingModule;
    // Register background handler early
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('Message handled in the background!', remoteMessage);
      
      // If Firebase sends a data-only payload, Android won't show a banner automatically.
      // We manually create a local notification here using expo-notifications.
      if (!remoteMessage.notification && remoteMessage.data) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: remoteMessage.data.title || "New Notification",
            body: remoteMessage.data.body || "You have a new message.",
            data: remoteMessage.data,
          },
          trigger: null,
        });
      }
    });
  } catch (e) {
    console.warn("Firebase messaging module not available");
  }
}

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
        console.error("Auth initialization failed:", error?.message);
      }
    };

    init();
  }, [initializeAuth]);

  // Setup Firebase Push Notifications
  useEffect(() => {
    if (token && messaging && !isExpoGo) {
      const setupPushNotifications = async () => {
        try {
          if (Platform.OS === 'android') {
            if (Platform.Version >= 33) {
              await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
            }
          } else {
            await messaging().requestPermission();
          }
          
          await messaging().subscribeToTopic('admin_notifications');
          console.log("Subscribed to admin_notifications topic!");
        } catch (error) {
          console.error("Push notification setup failed:", error?.message);
        }
      };
      
      setupPushNotifications();

      const unsubscribe = messaging().onMessage(async (remoteMessage) => {
        console.log('A new FCM message arrived!', remoteMessage);
        
        // Show a local notification banner when the app is open
        if (Notifications) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: remoteMessage.notification?.title || remoteMessage.data?.title || "New Notification",
              body: remoteMessage.notification?.body || remoteMessage.data?.body || "You have a new message.",
              data: remoteMessage.data || {},
            },
            trigger: null,
          });
        }
      });

      return unsubscribe;
    }
  }, [token]);

  useEffect(() => {
    if (initialized) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [initialized]);

  const inAuthGroup = segments[0] === "(auth)";

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <AnimatedSplash isReady={initialized}>
          {!initialized ? null : !token && !inAuthGroup ? (
            <Redirect href="/(auth)/login" />
          ) : token && inAuthGroup ? (
            <Redirect href="/(tabs)" />
          ) : (
            <Slot />
          )}
        </AnimatedSplash>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({});
