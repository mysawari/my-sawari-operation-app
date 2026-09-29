import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import api from "../../../../services/api";
import useAuthStore from "../../../../store/authStore";
import colors from "../../../../theme/colors";

const { height } = Dimensions.get("window");

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

export default function UpdateRoleScreen() {
  const router = useRouter();
  const { token } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");

  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      fetchEmployees();
    }
  }, [token]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);

      // Matches: router.get("/employees", authMiddleware, getAllEmployees)
      const res = await api.get("/auth/employees", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setEmployees(res.data.data || []);
    } catch (error) {
      console.log("FETCH EMPLOYEES ERROR:", error?.response?.data || error);
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to load employees",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackNavigation = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push("/profile/staff-management");
    }
  };

  const formatRole = (value) =>
    roles.find((r) => r.value === value)?.label || value;

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      emp.email?.toLowerCase().includes(search.toLowerCase()),
  );

  const openRolePicker = (employee) => {
    setSelectedEmployee(employee);
    setSelectedRole(employee.role);
    setShowRoleModal(true);
  };

  const handleConfirmRoleChange = async () => {
    if (!selectedEmployee || !selectedRole) return;

    if (selectedRole === selectedEmployee.role) {
      setShowRoleModal(false);
      return;
    }

    try {
      setSubmitting(true);

      // Matches: router.patch("/employees/:id/role", authMiddleware, restrictTo("SUPER_ADMIN"), updateEmployeeRole)
      const res = await api.patch(
        `/auth/employees/${selectedEmployee._id}/role`,
        { role: selectedRole },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const updated = res.data.data;

      setEmployees((prev) =>
        prev.map((emp) =>
          emp._id === selectedEmployee._id
            ? { ...emp, role: updated?.role || selectedRole }
            : emp,
        ),
      );

      setShowRoleModal(false);
      Alert.alert(
        "Success",
        `${selectedEmployee.fullName}'s role updated to ${formatRole(
          selectedRole,
        )}`,
      );
    } catch (error) {
      console.log("UPDATE ROLE ERROR:", error?.response?.data || error);
      Alert.alert(
        "Operation Failed",
        error?.response?.data?.message || "Failed to update role",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#F8FAFC" barStyle="dark-content" />

      {/* HEADING */}
      <View style={styles.headingWrapper}>
        <Text style={styles.screenHeading}>Update Role</Text>
        <Text style={styles.screenSubtext}>
          Change an employee's access tier within your organization.
        </Text>
      </View>

      {/* SEARCH */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search-outline" size={16} color="#94A3B8" />
        <TextInput
          placeholder="Search employee by name or email"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* LIST */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      ) : !filteredEmployees.length ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No employees found</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEmployees}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={styles.empCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.fullName?.charAt(0)?.toUpperCase() || "U"}
                </Text>
              </View>

              <View style={styles.empInfo}>
                <Text numberOfLines={1} style={styles.empName}>
                  {item.fullName}
                </Text>
                <Text numberOfLines={1} style={styles.empEmail}>
                  {item.email}
                </Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>
                    {formatRole(item.role)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.changeBtn}
                activeOpacity={0.8}
                onPress={() => openRolePicker(item)}
              >
                <Feather name="repeat" size={14} color="#1E40AF" />
                <Text style={styles.changeBtnText}>Change</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* ── ROLE SELECTION MODAL ── */}
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
          <View style={styles.sheetHandle} />

          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              Change Role — {selectedEmployee?.fullName}
            </Text>
            <TouchableOpacity
              onPress={() => setShowRoleModal(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSubtitle}>
            Current role: {formatRole(selectedEmployee?.role)}
          </Text>

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
                  onPress={() => setSelectedRole(item.value)}
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

          <TouchableOpacity
            style={[styles.primaryActionButton, submitting && { opacity: 0.6 }]}
            activeOpacity={0.9}
            onPress={handleConfirmRoleChange}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryActionButtonText}>
                Confirm Role Change
              </Text>
            )}
          </TouchableOpacity>
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

  /* ── BACK BUTTON ── */
  topBackNavigationRow: {
    margin: 15,
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

  /* HEADING */
  headingWrapper: {
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 4,
  },
  screenHeading: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  screenSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "500",
    marginTop: 3,
    lineHeight: 18,
  },

  /* SEARCH */
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchInput: {
    marginLeft: 8,
    flex: 1,
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
  },

  loaderWrap: {
    marginTop: 60,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 24,
    elevation: 2,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },

  /* EMPLOYEE CARD */
  empCard: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F2554",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#1E40AF",
    fontWeight: "800",
    fontSize: 16,
  },
  empInfo: {
    flex: 1,
    marginLeft: 12,
  },
  empName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  empEmail: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "500",
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#334155",
  },
  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  changeBtnText: {
    fontSize: 11,
    color: "#1E40AF",
    marginLeft: 5,
    fontWeight: "700",
  },

  /* ── MODAL ── */
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
    maxHeight: height * 0.75,
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
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    flex: 1,
    marginRight: 10,
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

  /* CONFIRM BUTTON */
  primaryActionButton: {
    backgroundColor: "#1E40AF",
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    marginHorizontal: 20,
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
});
