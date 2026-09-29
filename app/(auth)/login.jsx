import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image, // Added Image import
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import useAuthStore from "../../store/authStore";

const { width } = Dimensions.get("window");

export default function LoginScreen() {
  const router = useRouter();

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [secureText, setSecureText] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);
  const { login, loading } = useAuthStore();

  const handleLogin = async () => {
    if (!emailOrPhone.trim()) {
      Alert.alert("Validation", "Email or mobile number is required");
      return;
    }

    if (!password.trim()) {
      Alert.alert("Validation", "Password is required");
      return;
    }

    const result = await login(emailOrPhone, password);

    if (result.success) {
      Alert.alert("Success", "Login successful");
      router.replace("/(tabs)/home");
    } else {
      Alert.alert("Login Failed", result.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#F8FAFC" barStyle="dark-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Top Branding Header Layout Area */}
        <View style={styles.headerBackgroundContainer}>
          <View style={styles.brandingContent}>
            {/* Full Width Actual PNG Logo Replacement */}
            <Image
              source={require("../../assets/images/logo.webp")} // Adjust this path to match your project structure
              style={styles.fullWidthLogo}
              resizeMode="contain"
            />

            <Text style={styles.welcomeHeading}>Employee Login</Text>
            <Text style={styles.welcomeSubtext}>
              Login to continue to your account
            </Text>
          </View>
        </View>

        {/* Form Inputs Container Sheet Card Block */}
        <View style={styles.formCardWrapper}>
          {/* Email / Phone Field */}
          <Text style={styles.fieldLabel}>Email or Mobile Number</Text>
          <View style={styles.inputContainerBox}>
            <Ionicons
              name="mail-outline"
              size={20}
              color="#94A3B8"
              style={styles.leftFieldIcon}
            />
            <TextInput
              placeholder="Enter email or mobile number"
              placeholderTextColor="#94A3B8"
              style={styles.textInputField}
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Password Field */}
          <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Password</Text>
          <View style={styles.inputContainerBox}>
            <Feather
              name="lock"
              size={18}
              color="#94A3B8"
              style={styles.leftFieldIcon}
            />
            <TextInput
              placeholder="Enter your password"
              placeholderTextColor="#94A3B8"
              style={styles.textInputField}
              secureTextEntry={secureText}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setSecureText(!secureText)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={secureText ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#64748B"
              />
            </TouchableOpacity>
          </View>

          {/* Remember Me & Forgot Password Controller Row */}
          <View style={styles.utilitiesControlRow}>
            <TouchableOpacity
              style={styles.checkboxTouchWrapper}
              activeOpacity={0.7}
              onPress={() => setRememberMe(!rememberMe)}
            ></TouchableOpacity>
          </View>

          {/* Primary Submission Login Action Button */}
          <TouchableOpacity
            style={styles.primaryLoginButton}
            activeOpacity={0.9}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryLoginButtonText}>Login</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Bottom Verification Trust Safety Banner */}
        <View style={styles.secureBadgeCard}>
          <View style={styles.secureIconCircle}>
            <Ionicons name="shield-checkmark" size={20} color="#2563EB" />
          </View>
          <View style={styles.secureTextColumn}>
            <Text style={styles.secureHeadingTitle}>Secure Login</Text>
            <Text style={styles.secureSubtextParagraph}>
              Your data is safe and secured with us.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingBottom: 24,
  },
  headerBackgroundContainer: {
    height: 280, // Increased from 240 to accommodate the larger logo size comfortably
    position: "relative",
    justifyContent: "flex-end",
    paddingBottom: 12,
    paddingHorizontal: 24,
  },
  brandingContent: {
    alignSelf: "stretch",
    zIndex: 2,
  },
  fullWidthLogo: {
    width: "100%",
    height: 120, // Doubled from 60
    alignSelf: "center",
  },
  subTitleLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 6,
  },
  welcomeHeading: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 20,
  },
  welcomeSubtext: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 4,
  },
  formCardWrapper: {
    backgroundColor: "white",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F2554",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  inputContainerBox: {
    height: 48,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    backgroundColor: "white",
  },
  leftFieldIcon: {
    marginRight: 10,
  },
  textInputField: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    padding: 0,
    fontWeight: "500",
  },
  utilitiesControlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  checkboxTouchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  primaryLoginButton: {
    backgroundColor: "#2563EB",
    height: 46,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryLoginButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
  secureBadgeCard: {
    backgroundColor: "#EFF6FF",
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    marginTop: 16,
  },
  secureIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  secureTextColumn: {
    marginLeft: 12,
    flex: 1,
  },
  secureHeadingTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E3A8A",
  },
  secureSubtextParagraph: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
    fontWeight: "500",
  },
});
