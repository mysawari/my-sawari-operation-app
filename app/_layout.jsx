import { Redirect, Slot, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import useAuthStore from "../store/authStore";

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
