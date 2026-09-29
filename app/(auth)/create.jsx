import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator, // Fixed: Added missing import
  Alert,
  Dimensions,
  Image,
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

// Fixed: Added missing roles definition
const roles = [
  { label: "Super Admin", value: "SUPER_ADMIN" },
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
  const [businessName, setBusinessName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securePassword, setSecurePassword] = useState(true);
  const [secureConfirmPassword, setSecureConfirmPassword] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  const router = useRouter();
  const { register, loading } = useAuthStore();

  const passwordCriteria = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const handleCreateAccount = async () => {
    if (!fullName.trim()) {
      Alert.alert("Validation", "Full name is required");
      return;
    }

    if (!mobileNumber.trim()) {
      Alert.alert("Validation", "Mobile number is required");
      return;
    }

    if (!email.trim()) {
      Alert.alert("Validation", "Email is required");
      return;
    }

    if (!businessName.trim()) {
      Alert.alert("Validation", "Business name is required");
      return;
    }

    if (!password.trim()) {
      Alert.alert("Validation", "Password is required");
      return;
    }

    if (!confirmPassword.trim()) {
      Alert.alert("Validation", "Confirm password is required");
      return;
    }

    if (!selectedRole) {
      Alert.alert("Validation", "Please select a role");
      return;
    }

    const result = await register({
      fullName,
      mobileNumber,
      email,
      businessName,
      password,
      confirmPassword,
      role: selectedRole,
    });

    if (result.success) {
      Alert.alert("Success", "Account created successfully");
      router.replace("/(tabs)/home");
    } else {
      Alert.alert("Registration Failed", result.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#F8FAFC" barStyle="dark-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* HEADER */}
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
              Vehicle Rental Management
            </Text>

            <Text style={styles.screenHeading}>Create Account</Text>
            <Text style={styles.screenSubtext}>
              Join and manage your business professionally.
            </Text>
          </View>
        </View>

        {/* FORM */}
        <View style={styles.formCard}>
          {/* NAME + MOBILE */}
          <View style={styles.inputGridRow}>
            <View style={styles.gridColumn}>
              <Text style={styles.inputLabel}>Full Name</Text>

              <View style={styles.textInputBox}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color="#94A3B8"
                  style={styles.leftFieldIcon}
                />
                <TextInput
                  placeholder="Enter full name"
                  placeholderTextColor="#94A3B8"
                  style={styles.innerInputField}
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>
            </View>

            <View style={styles.gridColumn}>
              <Text style={styles.inputLabel}>Mobile Number</Text>

              <View style={styles.textInputBox}>
                <Ionicons
                  name="call-outline"
                  size={18}
                  color="#94A3B8"
                  style={styles.leftFieldIcon}
                />
                <TextInput
                  placeholder="Enter mobile"
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
              size={18}
              color="#94A3B8"
              style={styles.leftFieldIcon}
            />
            <TextInput
              placeholder="Enter email"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.innerInputField}
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* BUSINESS */}
          <Text style={[styles.inputLabel, { marginTop: 16 }]}>
            Business Name
          </Text>
          <View style={styles.textInputBox}>
            <Ionicons
              name="business-outline"
              size={18}
              color="#94A3B8"
              style={styles.leftFieldIcon}
            />
            <TextInput
              placeholder="Enter company/business name"
              placeholderTextColor="#94A3B8"
              style={styles.innerInputField}
              value={businessName}
              onChangeText={setBusinessName}
            />
          </View>

          {/* PASSWORDS */}
          <View style={[styles.inputGridRow, { marginTop: 16 }]}>
            <View style={styles.gridColumn}>
              <Text style={styles.inputLabel}>Password</Text>

              <View style={styles.textInputBox}>
                <Feather
                  name="lock"
                  size={16}
                  color="#94A3B8"
                  style={styles.leftFieldIcon}
                />
                <TextInput
                  placeholder="Create password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={securePassword}
                  autoCapitalize="none"
                  style={styles.innerInputField}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  onPress={() => setSecurePassword(!securePassword)}
                >
                  <Ionicons
                    name={securePassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.gridColumn}>
              <Text style={styles.inputLabel}>Confirm Password</Text>

              <View style={styles.textInputBox}>
                <Feather
                  name="lock"
                  size={16}
                  color="#94A3B8"
                  style={styles.leftFieldIcon}
                />
                <TextInput
                  placeholder="Confirm password"
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
                >
                  <Ionicons
                    name={
                      secureConfirmPassword ? "eye-off-outline" : "eye-outline"
                    }
                    size={18}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* PASSWORD RULES */}
          <View style={styles.validationRuleWrapper}>
            <Text style={styles.validationIntroText}>
              Password must contain:
            </Text>

            <View style={styles.checklistLineRow}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={passwordCriteria.length ? "#22C55E" : "#94A3B8"}
              />
              <Text
                style={[
                  styles.ruleLabelText,
                  passwordCriteria.length && styles.ruleLabelTextSuccess,
                ]}
              >
                At least 8 characters
              </Text>
            </View>

            <View style={styles.checklistLineRow}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={passwordCriteria.uppercase ? "#22C55E" : "#94A3B8"}
              />
              <Text
                style={[
                  styles.ruleLabelText,
                  passwordCriteria.uppercase && styles.ruleLabelTextSuccess,
                ]}
              >
                One uppercase letter
              </Text>
            </View>

            <View style={styles.checklistLineRow}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={passwordCriteria.number ? "#22C55E" : "#94A3B8"}
              />
              <Text
                style={[
                  styles.ruleLabelText,
                  passwordCriteria.number && styles.ruleLabelTextSuccess,
                ]}
              >
                One number
              </Text>
            </View>

            <View style={styles.checklistLineRow}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={passwordCriteria.special ? "#22C55E" : "#94A3B8"}
              />
              <Text
                style={[
                  styles.ruleLabelText,
                  passwordCriteria.special && styles.ruleLabelTextSuccess,
                ]}
              >
                One special character
              </Text>
            </View>
          </View>

          {/* ROLE */}
          <Text style={[styles.inputLabel, { marginTop: 16 }]}>Role</Text>
          <View style={styles.roleWrapper}>
            <TouchableOpacity
              style={styles.dropdownSelectorBox}
              activeOpacity={0.8}
              onPress={() => setShowRoleDropdown(!showRoleDropdown)}
            >
              <Ionicons
                name="people-outline"
                size={18}
                color="#64748B"
                style={styles.leftFieldIcon}
              />
              <Text
                style={[
                  styles.dropdownValuePlaceholder,
                  selectedRole && { color: "#111827" },
                ]}
              >
                {roles.find((r) => r.value === selectedRole)?.label ||
                  "Select your role"}
              </Text>
              <Ionicons
                name={showRoleDropdown ? "chevron-up" : "chevron-down"}
                size={16}
                color="#64748B"
                style={{ marginLeft: "auto" }}
              />
            </TouchableOpacity>

            {showRoleDropdown && (
              <View style={styles.roleDropdownMenu}>
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="always"
                  showsVerticalScrollIndicator
                >
                  {roles.map((role, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.roleItem}
                      onPress={() => {
                        setSelectedRole(role.value);
                        setShowRoleDropdown(false);
                      }}
                    >
                      <Text style={styles.roleItemText}>{role.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* CREATE BTN */}
          <TouchableOpacity
            style={styles.primaryActionButton}
            activeOpacity={0.9}
            onPress={handleCreateAccount}
            disabled={loading} // Added: Disable button while loading
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryActionButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/* DIVIDER */}
          <View style={styles.splitDividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabelText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* GOOGLE */}
          <TouchableOpacity
            style={styles.socialGoogleButton}
            activeOpacity={0.8}
          >
            <Image
              source={{
                // Fixed: Changed from unsupported .svg to web-safe .png
                uri: "https://fonts.gstatic.com/s/i/productlogos/googleg/v6/web-24dp/logo_googleg_color_24dp.png",
              }}
              style={styles.googleBrandIconAsset}
            />
            <Text style={styles.socialGoogleButtonText}>
              Sign up with Google
            </Text>
          </TouchableOpacity>
        </View>

        {/* FOOTER */}
        <View style={styles.footerRedirectRow}>
          <Text style={styles.footerLabelText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push("/login")}>
            <Text style={styles.signInLinkText}>Sign In</Text>
          </TouchableOpacity>
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
    paddingBottom: 30,
  },
  headerGraphicContainer: {
    height: 190,
    position: "relative",
    justifyContent: "flex-end",
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  floatingVehicleImage: {
    position: "absolute",
    right: -40,
    bottom: -15,
    width: width * 0.68,
    height: 170,
    opacity: 0.95,
  },
  brandingWrapper: {
    alignSelf: "flex-start",
    zIndex: 5,
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
    marginTop: 20,
  },
  screenSubtext: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 3,
  },
  formCard: {
    backgroundColor: "white",
    marginHorizontal: 16,
    marginTop: 12,
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
    gap: 12,
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
    paddingHorizontal: 12,
    backgroundColor: "white",
  },
  leftFieldIcon: {
    marginRight: 8,
  },
  innerInputField: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
    padding: 0,
  },
  validationRuleWrapper: {
    marginTop: 10,
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
    marginBottom: 6,
  },
  checklistLineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },
  ruleLabelText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  ruleLabelTextSuccess: {
    color: "#16A34A",
    fontWeight: "700",
  },
  roleWrapper: {
    position: "relative", // Added: Ensures absolute dropdown anchors correctly
    zIndex: 10,
  },
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
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "500",
  },
  roleDropdownMenu: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    height: 180, // Toned down slightly so it fits screen spaces cleaner
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 20,
    zIndex: 99999,
  },
  roleItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  roleItemText: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
  },
  primaryActionButton: {
    backgroundColor: "#2563EB",
    height: 48,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  primaryActionButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "800",
  },
  splitDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  dividerLabelText: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "700",
    paddingHorizontal: 10,
  },
  socialGoogleButton: {
    flexDirection: "row",
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  googleBrandIconAsset: {
    width: 18,
    height: 18,
    marginRight: 8,
  },
  socialGoogleButtonText: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "700",
  },
  footerRedirectRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 10,
  },
  footerLabelText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
  signInLinkText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#2563EB",
  },
});
