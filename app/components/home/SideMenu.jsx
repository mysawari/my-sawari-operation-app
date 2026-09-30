import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import useAuthStore from "../../../store/authStore";
import colors from "../../../theme/colors";

const menuItems = [
  {
    title: "On Service",
    icon: "tools",
    lib: MaterialCommunityIcons,
    route: "/menu/service/service",
  },
  {
    title: "Lead Management",
    icon: "calendar-plus",
    lib: MaterialCommunityIcons,
    route: "/menu/lead/lead-management",
  },
  {
    title: "Track Employee",
    icon: "calendar-clock",
    lib: MaterialCommunityIcons,
    route: "/menu/Track",
  },
  {
    title: "Payments History",
    icon: "clipboard-list-outline",
    lib: MaterialCommunityIcons,
    route: "/menu/payments/payments-history",
  },
  {
    title: "Extension Requests",
    icon: "calendar-arrow-right",
    lib: MaterialCommunityIcons,
    route: "/menu/extensions",
  },
  {
    title: "Offers",
    icon: "tag-outline",
    lib: MaterialCommunityIcons,
    route: "/menu/offers",
  },
  {
    title: "Send Notification",
    icon: "bell-ring-outline",
    lib: MaterialCommunityIcons,
    route: "/screens/SendNotification",
  },
  {
    title: "Refund Requests",
    icon: "cash-refund",
    lib: MaterialCommunityIcons,
    route: "/menu/refunds",
  },
  {
    title: "Memberships",
    icon: "card-account-details-star-outline",
    lib: MaterialCommunityIcons,
    route: "/menu/memberships",
  },
  {
    title: "Referrals",
    icon: "account-group-outline",
    lib: MaterialCommunityIcons,
    route: "/menu/referrals",
  },
];

export default function SideMenu({ visible, onClose }) {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await logout();
      onClose?.();
      router.replace("/(auth)/login");
    } catch (error) {
      console.log("Logout Error:", error);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.drawer}>
          <View style={styles.top}>
            <Text style={styles.logo}>
              My<Text style={{ color: colors.accent }}>Sawari</Text>.in
            </Text>

            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {menuItems.map((item, index) => {
              const Icon = item.lib;

              return (
                <TouchableOpacity
                  key={index}
                  style={styles.item}
                  onPress={() => {
                    onClose();

                    if (item.route) {
                      router.push(item.route);
                    }
                  }}
                >
                  <View style={styles.left}>
                    <View style={styles.iconWrap}>
                      <Icon name={item.icon} size={18} color={colors.primary} />
                    </View>

                    <Text style={styles.itemText}>{item.title}</Text>
                  </View>

                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                </TouchableOpacity>
              );
            })}

            {/* User Profile */}
            <View style={styles.profileCard}>
              <Ionicons
                name="person-circle-outline"
                size={42}
                color="#64748B"
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>
                  {user?.fullName || "User"}
                </Text>

                <Text style={styles.profileRole}>
                  {user?.role || "Employee"}
                </Text>

                {!!user?.email && (
                  <Text style={styles.profileEmail}>{user.email}</Text>
                )}
              </View>
            </View>

            {/* Logout */}
            <TouchableOpacity style={styles.logout} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
  },

  drawer: {
    width: "82%",
    height: "100%",
    backgroundColor: "white",
    paddingTop: 42,
    paddingHorizontal: 16,
  },

  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  logo: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.primaryDark,
  },

  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  left: {
    flexDirection: "row",
    alignItems: "center",
  },

  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  itemText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },

  profileCard: {
    marginTop: 16,
    padding: 14,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  profileName: {
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 10,
    color: "#111827",
  },

  profileRole: {
    color: "#64748B",
    marginTop: 2,
    marginLeft: 10,
    fontSize: 13,
  },

  profileEmail: {
    color: "#94A3B8",
    marginTop: 2,
    marginLeft: 10,
    fontSize: 12,
  },

  logout: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
  },

  logoutText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 10,
  },
});
