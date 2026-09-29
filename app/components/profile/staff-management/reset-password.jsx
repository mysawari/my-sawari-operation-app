import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import api from "../../../../services/api";

export default function ResetPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async () => {
    try {
      if (!email.trim()) {
        Alert.alert("Error", "Please enter email");
        return;
      }

      if (!password) {
        Alert.alert("Error", "Please enter new password");
        return;
      }

      if (password.length < 8) {
        Alert.alert("Error", "Password must be at least 8 characters");
        return;
      }

      if (password !== confirmPassword) {
        Alert.alert("Error", "Passwords do not match");
        return;
      }

      setLoading(true);

      const response = await api.post("/auth/reset-password", {
        email,
        password,
      });

      Alert.alert(
        "Success",
        response.data.message || "Password reset successfully",
      );

      setEmail("");
      setPassword("");
      setConfirmPassword("");

      router.back();
    } catch (error) {
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to reset password",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#08142E" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Reset Password</Text>

        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.iconBox}>
            <Ionicons name="lock-closed-outline" size={40} color="#DC2626" />
          </View>

          <Text style={styles.title}>Employee Password Reset</Text>

          <Text style={styles.subtitle}>
            Enter employee email and assign a new password.
          </Text>

          <Text style={styles.label}>Employee Email</Text>

          <TextInput
            style={styles.input}
            placeholder="employee@mysawari.in"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />

          <Text style={styles.label}>New Password</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter new password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Text style={styles.label}>Confirm Password</Text>

          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleResetPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={18} color="#fff" />
                <Text style={styles.buttonText}>Reset Password</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  header: {
    backgroundColor: "#08142E",
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },

  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },

  content: {
    padding: 16,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
  },

  iconBox: {
    alignSelf: "center",
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },

  title: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    color: "#0F172A",
  },

  subtitle: {
    textAlign: "center",
    color: "#64748B",
    marginTop: 8,
    marginBottom: 24,
  },

  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#334155",
  },

  input: {
    height: 52,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    backgroundColor: "#fff",
  },

  button: {
    marginTop: 10,
    backgroundColor: "#DC2626",
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
