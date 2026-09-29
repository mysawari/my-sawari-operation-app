import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
    Animated,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity
} from "react-native";

export default function NotFoundScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -12,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 5000,
        useNativeDriver: true,
      }),
    ).start();
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#08142E", "#0F2554", "#1E3A8A"]}
        style={styles.gradient}
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.iconWrapper,
              {
                transform: [{ translateY: floatAnim }, { rotate: spin }],
              },
            ]}
          >
            <Ionicons name="alert-circle" size={90} color="#FFC107" />
          </Animated.View>

          <Text style={styles.oops}>Oops!</Text>

          <Text style={styles.title}>404 Page Not Found</Text>

          <Text style={styles.subtitle}>
            Looks like the page you are trying to access doesn't exist or has
            been moved.
          </Text>

          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => router.replace("/(tabs)/home")}
          >
            <Ionicons name="home" size={20} color="#0A1628" />
            <Text style={styles.homeText}>Go To Home</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={18} color="white" />
            <Text style={styles.backText}>Go Back</Text>
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  gradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  content: {
    alignItems: "center",
    width: "100%",
  },

  iconWrapper: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  oops: {
    fontSize: 44,
    fontWeight: "900",
    color: "#FFC107",
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "white",
    marginTop: 10,
  },

  subtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 24,
    marginTop: 14,
    paddingHorizontal: 8,
  },

  homeBtn: {
    marginTop: 30,
    backgroundColor: "#FFC107",
    height: 58,
    width: "100%",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    elevation: 8,
  },

  homeText: {
    color: "#0A1628",
    fontSize: 16,
    fontWeight: "800",
  },

  backBtn: {
    marginTop: 14,
    height: 56,
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },

  backText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
});
