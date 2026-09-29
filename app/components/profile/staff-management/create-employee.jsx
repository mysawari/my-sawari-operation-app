import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import useAuthStore from "../../../../store/authStore";

// ── API helper ──────────────────────────────────────────────────────────────
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://my-sawari.onrender.com/api/v1";

async function apiCreateEmployee(payload, token) {
  const res = await fetch(`${BASE_URL}/auth/employees`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (!res.ok) {
    // Backend sends { success:false, message:"..." } on errors
    throw new Error(json?.message ?? `Request failed (${res.status})`);
  }

  return json; // { success:true, message:"...", data:{ user:{...} } }
}

const { width, height } = Dimensions.get("window");

const roles = [
  { label: "Admin", value: "ADMIN" },
  { label: "Branch Manager", value: "BRANCH_MANAGER" },
  { label: "Operations", value: "OPERATIONS" },
  { label: "Operations Executive", value: "OPERATIONS_EXECUTIVE" },
  { label: "Booking", value: "BOOKING" },
  { label: "Booking Executive", value: "BOOKING_EXECUTIVE" },
  { label: "Sales Manager", value: "SALES_MANAGER" },
  { label: "Sales Executive", value: "SALES_EXECUTIVE" },
  { label: "Fleet Manager", value: "FLEET_MANAGER" },
  { label: "Vehicle Supervisor", value: "VEHICLE_SUPERVISOR" },
  { label: "Customer Support", value: "CUSTOMER_SUPPORT" },
  { label: "Accounts Manager", value: "ACCOUNTS_MANAGER" },
  { label: "Finance Executive", value: "FINANCE_EXECUTIVE" },
  { label: "Driver Coordinator", value: "DRIVER_COORDINATOR" },
  { label: "Inspector", value: "INSPECTOR" },
  { label: "Field Executive", value: "FIELD_EXECUTIVE" },
];

export default function CreateAccountScreen() {
  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securePassword, setSecurePassword] = useState(true);
  const [secureConfirmPassword, setSecureConfirmPassword] = useState(true);
  const [selectedRole, setSelectedRole] = useState("");
  const [showRoleModal, setShowRoleModal] = useState(false);

  const router = useRouter();
  // Pull the auth token from your existing store (adjust key if needed)
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const passwordCriteria = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const handleBackNavigation = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push("/profile/staff-management");
    }
  };

  const handleCreateAccount = async () => {
    // ── Client-side validation ──────────────────────────────────────────────
    if (
      !fullName.trim() ||
      !mobileNumber.trim() ||
      !email.trim() ||
      !password.trim() ||
      !confirmPassword.trim()
    ) {
      Alert.alert("Validation", "All fields are strictly required");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Validation", "Passwords do not match");
      return;
    }

    if (
      !passwordCriteria.length ||
      !passwordCriteria.uppercase ||
      !passwordCriteria.number
    ) {
      Alert.alert("Validation", "Password does not meet security requirements");
      return;
    }

    if (!selectedRole) {
      Alert.alert("Validation", "Please select an account role");
      return;
    }

    // ── API call ────────────────────────────────────────────────────────────
    setLoading(true);
    try {
      await apiCreateEmployee(
        {
          fullName: fullName.trim(),
          mobileNumber: mobileNumber.trim(),
          email: email.trim(),
          password,
          role: selectedRole,
        },
        token,
      );

      Alert.alert("Success", "Employee account created successfully", [
        {
          text: "OK",
          onPress: () =>
            router.replace("/profile/staff-management/employee-list"),
        },
      ]);
    } catch (error) {
      // Map common backend messages to friendly text
      const msg = error.message ?? "Something went wrong. Please try again.";
      Alert.alert("Operation Failed", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#F8FAFC" barStyle="dark-content" />

      {/* ── BACK BUTTON ── clearly visible pill-style */}
      <View style={styles.topBackNavigationRow}>
        <TouchableOpacity
          onPress={handleBackNavigation}
          style={styles.backButtonTouch}
          activeOpacity={0.75}
        >
          <View style={styles.backIconCircle}>
            <Ionicons name="chevron-back" size={20} color="#1E40AF" />
          </View>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* HEADER BRANDING BANNER */}
          <View style={styles.headerGraphicContainer}>
            <Image
              source={{
                uri: "https://imgd.aeplcdn.com/664x374/n/cw/ec/40432/scorpio-n-exterior-right-front-three-quarter.jpeg",
              }}
              style={styles.floatingVehicleImage}
              resizeMode="contain"
            />
            <View style={styles.brandingWrapper}>
              <View style={styles.logoRow}>
                <Ionicons name="car-sport" size={32} color="#1E40AF" />
                <Text style={styles.logoMainText}>
                  Mysawari<Text style={styles.logoDomainText}>.in</Text>
                </Text>
              </View>
              <Text style={styles.brandingSubtitle}>
                Vehicle Rental Management Console
              </Text>
              <Text style={styles.screenHeading}>Create Employee</Text>
              <Text style={styles.screenSubtext}>
                Provision an access profile securely within your organization
                framework.
              </Text>
            </View>
          </View>

          {/* FORM CARD */}
          <View style={styles.formCard}>
            {/* NAME + MOBILE */}
            <View style={styles.inputGridRow}>
              <View style={[styles.gridColumn, { marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <View style={styles.textInputBox}>
                  <Ionicons
                    name="person-outline"
                    size={16}
                    color="#94A3B8"
                    style={styles.leftFieldIcon}
                  />
                  <TextInput
                    placeholder="Enter name"
                    placeholderTextColor="#94A3B8"
                    style={styles.innerInputField}
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>
              </View>

              <View style={[styles.gridColumn, { marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Mobile Number</Text>
                <View style={styles.textInputBox}>
                  <Ionicons
                    name="call-outline"
                    size={16}
                    color="#94A3B8"
                    style={styles.leftFieldIcon}
                  />
                  <TextInput
                    placeholder="Mobile"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    style={styles.innerInputField}
                    value={mobileNumber}
                    onChangeText={setMobileNumber}
                  />
                </View>
              </View>
            </View>

            {/* EMAIL */}
            <Text style={[styles.inputLabel, { marginTop: 16 }]}>
              Email Address
            </Text>
            <View style={styles.textInputBox}>
              <Ionicons
                name="mail-outline"
                size={16}
                color="#94A3B8"
                style={styles.leftFieldIcon}
              />
              <TextInput
                placeholder="Enter email address"
                placeholderTextColor="#94A3B8"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.innerInputField}
                value={email}
                onChangeText={setEmail}
              />
            </View>

            {/* PASSWORD ROW */}
            <View style={[styles.inputGridRow, { marginTop: 16 }]}>
              <View style={[styles.gridColumn, { marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.textInputBox}>
                  <Feather
                    name="lock"
                    size={14}
                    color="#94A3B8"
                    style={styles.leftFieldIcon}
                  />
                  <TextInput
                    placeholder="Password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={securePassword}
                    autoCapitalize="none"
                    style={styles.innerInputField}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setSecurePassword(!securePassword)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={securePassword ? "eye-off-outline" : "eye-outline"}
                      size={16}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.gridColumn, { marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={styles.textInputBox}>
                  <Feather
                    name="lock"
                    size={14}
                    color="#94A3B8"
                    style={styles.leftFieldIcon}
                  />
                  <TextInput
                    placeholder="Confirm"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={secureConfirmPassword}
                    autoCapitalize="none"
                    style={styles.innerInputField}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                  <TouchableOpacity
                    onPress={() =>
                      setSecureConfirmPassword(!secureConfirmPassword)
                    }
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={
                        secureConfirmPassword
                          ? "eye-off-outline"
                          : "eye-outline"
                      }
                      size={16}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* PASSWORD CRITERIA */}
            <View style={styles.validationRuleWrapper}>
              <Text style={styles.validationIntroText}>
                Security Standard Rules:
              </Text>
              {[
                {
                  key: "length",
                  label: "At least 8 characters",
                  met: passwordCriteria.length,
                },
                {
                  key: "uppercase",
                  label: "One uppercase letter",
                  met: passwordCriteria.uppercase,
                },
                {
                  key: "number",
                  label: "One number",
                  met: passwordCriteria.number,
                },
              ].map((item) => (
                <View key={item.key} style={styles.checklistLineRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color={item.met ? "#22C55E" : "#94A3B8"}
                  />
                  <Text
                    style={[
                      styles.ruleLabelText,
                      item.met && styles.ruleLabelTextSuccess,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* ROLE SELECTOR — triggers Modal */}
            <Text style={[styles.inputLabel, { marginTop: 16 }]}>
              Assign Operations Role Context
            </Text>
            <TouchableOpacity
              style={styles.dropdownSelectorBox}
              activeOpacity={0.8}
              onPress={() => setShowRoleModal(true)}
            >
              <Ionicons
                name="people-outline"
                size={16}
                color="#64748B"
                style={styles.leftFieldIcon}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.dropdownValuePlaceholder,
                  selectedRole && { color: "#111827", fontWeight: "600" },
                ]}
              >
                {roles.find((r) => r.value === selectedRole)?.label ||
                  "Choose administrative tier access"}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#64748B" />
            </TouchableOpacity>

            {/* POLICY INFO */}
            <View style={styles.infoCard}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color="#1E40AF"
              />
              <Text style={styles.infoText}>
                Employees will receive an activation alert via email to confirm
                system permissions.
              </Text>
            </View>

            {/* SUBMIT */}
            <TouchableOpacity
              style={styles.primaryActionButton}
              activeOpacity={0.9}
              onPress={handleCreateAccount}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.primaryActionButtonText}>
                  Provision Employee Profile
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── ROLE SELECTION MODAL ── fully scrollable, rendered above everything */}
      <Modal
        visible={showRoleModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRoleModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowRoleModal(false)}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>

        <View style={styles.modalSheet}>
          {/* Sheet handle */}
          <View style={styles.sheetHandle} />

          {/* Modal header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Role</Text>
            <TouchableOpacity
              onPress={() => setShowRoleModal(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSubtitle}>
            Choose the operational access tier for this employee
          </Text>

          {/* Scrollable role list */}
          <FlatList
            data={roles}
            keyExtractor={(item) => item.value}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.roleListContent}
            ItemSeparatorComponent={() => <View style={styles.roleSeparator} />}
            renderItem={({ item }) => {
              const isSelected = selectedRole === item.value;
              return (
                <TouchableOpacity
                  style={[
                    styles.roleModalItem,
                    isSelected && styles.roleModalItemSelected,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedRole(item.value);
                    setShowRoleModal(false);
                  }}
                >
                  <View
                    style={[
                      styles.roleRadio,
                      isSelected && styles.roleRadioSelected,
                    ]}
                  >
                    {isSelected && <View style={styles.roleRadioDot} />}
                  </View>
                  <Text
                    style={[
                      styles.roleModalItemText,
                      isSelected && styles.roleModalItemTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={18} color="#1E40AF" />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  keyboardView: {
    flex: 1,
  },

  /* ── BACK BUTTON ── */
  topBackNavigationRow: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 16 : 8,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  backButtonTouch: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    borderRadius: 20,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    alignSelf: "flex-start",
  },
  backIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E40AF",
  },

  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },

  /* HEADER */
  headerGraphicContainer: {
    height: 190,
    position: "relative",
    justifyContent: "flex-end",
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  floatingVehicleImage: {
    position: "absolute",
    right: -30,
    bottom: -10,
    width: width * 0.6,
    height: 150,
    opacity: 0.85,
  },
  brandingWrapper: {
    alignSelf: "flex-start",
    zIndex: 5,
    width: "70%",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  logoMainText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#1E3A8A",
    letterSpacing: -0.4,
  },
  logoDomainText: {
    color: "#2563EB",
    fontWeight: "700",
  },
  brandingSubtitle: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 2,
  },
  screenHeading: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 16,
  },
  screenSubtext: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 3,
    lineHeight: 18,
  },

  /* FORM CARD */
  formCard: {
    backgroundColor: "white",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 30,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F2554",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  inputGridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  gridColumn: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  textInputBox: {
    height: 46,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    backgroundColor: "white",
  },
  leftFieldIcon: {
    marginRight: 6,
  },
  innerInputField: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
    padding: 0,
    height: "100%",
  },

  /* PASSWORD CRITERIA */
  validationRuleWrapper: {
    marginTop: 14,
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  validationIntroText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
  },
  checklistLineRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },
  ruleLabelText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
    marginLeft: 6,
  },
  ruleLabelTextSuccess: {
    color: "#16A34A",
    fontWeight: "700",
  },

  /* ROLE DROPDOWN TRIGGER */
  dropdownSelectorBox: {
    height: 46,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    backgroundColor: "white",
  },
  dropdownValuePlaceholder: {
    flex: 1,
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "500",
  },

  /* INFO + BUTTON */
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  infoText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12,
    color: "#1E40AF",
    fontWeight: "500",
    lineHeight: 18,
  },
  primaryActionButton: {
    backgroundColor: "#1E40AF",
    height: 52,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 20,
    shadowColor: "#1E40AF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryActionButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  /* ── ROLE MODAL ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Show roughly 65% of screen height so list is clearly scrollable
    maxHeight: height * 0.65,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  roleListContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  roleSeparator: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  roleModalItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  roleModalItemSelected: {
    backgroundColor: "#EFF6FF",
  },
  roleRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  roleRadioSelected: {
    borderColor: "#1E40AF",
  },
  roleRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#1E40AF",
  },
  roleModalItemText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
  },
  roleModalItemTextSelected: {
    color: "#1E40AF",
    fontWeight: "700",
  },
});
