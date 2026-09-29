import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import {
  Animated,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function Bookings() {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -18,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#031B4E" />

      <LinearGradient
        colors={["#031B4E", "#052C78", "#0A4CBF"]}
        style={styles.background}
      >
        <Animated.View
          style={[
            styles.iconWrapper,
            {
              transform: [{ translateY: floatAnim }, { scale: pulseAnim }],
              opacity: fadeAnim,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="clipboard-list"
            size={90}
            color="#FFC107"
          />
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={styles.title}>Coming Soon</Text>

          <Text style={styles.subtitle}>
            Booking Management is under development.
          </Text>

          <Text style={styles.description}>
            Soon you'll be able to manage all bookings, track trip schedules,
            assign vehicles, monitor customer reservations, and handle booking
            workflows in real-time.
          </Text>
        </Animated.View>

        <View style={styles.bottomCard}>
          <View style={styles.featureRow}>
            <Ionicons name="calendar" size={22} color="#2563EB" />
            <Text style={styles.featureText}>Booking Scheduling</Text>
          </View>

          <View style={styles.featureRow}>
            <Ionicons name="car-sport" size={22} color="#16A34A" />
            <Text style={styles.featureText}>Vehicle Assignment</Text>
          </View>

          <View style={styles.featureRow}>
            <Ionicons name="people" size={22} color="#F59E0B" />
            <Text style={styles.featureText}>Customer Reservations</Text>
          </View>

          <View style={styles.featureRow}>
            <Ionicons name="analytics" size={22} color="#8B5CF6" />
            <Text style={styles.featureText}>Booking Analytics</Text>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  background: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  iconWrapper: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  title: {
    fontSize: 34,
    fontWeight: "900",
    color: "white",
    textAlign: "center",
    letterSpacing: 0.5,
  },

  subtitle: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: "700",
    color: "#FFC107",
    textAlign: "center",
  },

  description: {
    marginTop: 16,
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 10,
  },

  bottomCard: {
    marginTop: 40,
    width: "100%",
    backgroundColor: "white",
    borderRadius: 22,
    padding: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },

  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  featureText: {
    marginLeft: 12,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
});
