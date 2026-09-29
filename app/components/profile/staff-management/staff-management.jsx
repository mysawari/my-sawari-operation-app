import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function StaffManagementScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#08142E" barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Staff Management</Text>

        <View style={{ width: 24 }} />
      </View>

      {/* Content Navigation Area */}
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("../staff-management/create-employee")}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="person-add-outline" size={28} color="#2563EB" />
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>Create Employee</Text>
            <Text style={styles.cardSubtitle}>Add new employee accounts</Text>
          </View>

          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() =>
            router.push("/components/staff-management/employee-list")
          }
        >
          <View style={styles.iconContainer}>
            <Ionicons name="people-outline" size={28} color="#16A34A" />
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>Employee List</Text>
            <Text style={styles.cardSubtitle}>
              View, edit and disable employees
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("../staff-management/reset-password")}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="lock-closed-outline" size={28} color="#DC2626" />
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>Reset Password</Text>
            <Text style={styles.cardSubtitle}>
              Reset employee account passwords
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("../staff-management/update-role")}
        >
          <View style={styles.iconContainer}>
            <Ionicons
              name="shield-checkmark-outline"
              size={28}
              color="#D97706"
            />
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>Update Role</Text>
            <Text style={styles.cardSubtitle}>
              Change employee roles and permissions
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
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
    color: "white",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  content: {
    padding: 16,
    marginTop: 12,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    lineHeight: 18,
  },
});
