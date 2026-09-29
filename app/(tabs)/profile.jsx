import { Feather, Ionicons, SimpleLineIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import useAuthStore from "../../store/authStore";

export default function ProfileScreen() {
  const router = useRouter();
  const { logout, user } = useAuthStore();
  // Mock Data matching your exact visual setup
  const userProfile = {
    name: user?.fullName || "User",
    role: user?.role || "Employee",
    email: user?.email || "No Email",
    phone: user?.mobileNumber || "No Phone",
    avatar:
      user?.avatar ||
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS-Dc6DPorv9pqUVf0WO5mMbhkTohHFh_dNDQ&s",

    stats: [
      {
        id: 1,
        count: "28",
        label: "Total Vehicles",
        icon: "car-outline",
        accent: "#3B82F6",
      },
      {
        id: 2,
        count: "156",
        label: "Total Bookings",
        icon: "file-text-outline",
        isFeather: true,
        accent: "#10B981",
      },
      {
        id: 3,
        count: "245",
        label: "Total Customers",
        icon: "people-outline",
        accent: "#9B59FF",
      },
      {
        id: 4,
        count: "₹ 4,85,600",
        label: "Total Revenue",
        icon: "cash-outline",
        accent: "#F59E0B",
      },
    ],
  };
  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };
  // Section configs matching design categories, colors, and icons
  const sections = [
    {
      title: "Account",
      items: [
        {
          id: "personal",
          label: "Personal Information",
          sub: "Update your personal details",
          icon: "person-outline",
          iconColor: "#2563EB",
          bg: "#EFF6FF",
        },
      ],
    },
    {
      title: "Business",
      items: [
        ...(user?.role === "SUPER_ADMIN"
          ? [
              {
                id: "staff",
                label: "Staff Management",
                sub: "Manage your team",
                icon: "people-outline",
                iconColor: "#16A34A",
                bg: "#DCFCE7",
              },
            ]
          : []),
      ],
    },
    {
      title: "Preferences",
      items: [
        {
          id: "preferences",
          label: "App Preferences",
          sub: "Customize app theme and language",
          icon: "settings-outline",
          iconColor: "#9B59FF",
          bg: "#FAF5FF",
        },
        {
          id: "privacy",
          label: "Data & Privacy",
          sub: "Manage your data and privacy settings",
          icon: "eye-outline",
          iconColor: "#9B59FF",
          bg: "#FAF5FF",
        },
      ],
    },
    {
      title: "Support",
      items: [
        {
          id: "help",
          label: "Help & Support",
          sub: "Get help and contact support team",
          icon: "help-circle-outline",
          iconColor: "#F59E0B",
          bg: "#FFFBEB",
        },
        {
          id: "about",
          label: "About App",
          sub: "Version 1.0.0",
          icon: "information-circle-outline",
          iconColor: "#F59E0B",
          bg: "#FFFBEB",
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#08142E" barStyle="light-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Top Header Card */}
        <LinearGradient
          colors={["#08142E", "#0A1F4F"]}
          style={styles.headerProfileCard}
        >
          {/* Header Action Row */}
          <View style={styles.headerTopActions}>
            <Text style={styles.screenMainTitle}>Profile</Text>
          </View>

          {/* User Bio Header Info */}
          <View style={styles.bioWrapperRow}>
            <View style={styles.avatarContainer}>
              <Image
                source={{ uri: userProfile.avatar }}
                style={styles.userAvatarImage}
              />
              <TouchableOpacity
                style={styles.avatarCameraEditBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="camera" size={12} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <View style={styles.bioDetailsColumn}>
              <Text style={styles.userNameText} numberOfLines={1}>
                {userProfile.name}
              </Text>
              <Text style={styles.userRoleText}>{userProfile.role}</Text>

              <View style={styles.contactRowItem}>
                <Ionicons
                  name="mail-outline"
                  size={13}
                  color="rgba(255,255,255,0.6)"
                />
                <Text style={styles.contactText} numberOfLines={1}>
                  {userProfile.email}
                </Text>
              </View>

              <View style={[styles.contactRowItem, { marginTop: 3 }]}>
                <Ionicons
                  name="call-outline"
                  size={13}
                  color="rgba(255,255,255,0.6)"
                />
                <Text style={styles.contactText}>{userProfile.phone}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.editProfileOutlineBtn}
              activeOpacity={0.7}
            >
              <Feather
                name="edit-3"
                size={12}
                color="white"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.editProfileBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Setting Navigation Lists Groups */}
        {sections.map((section) => (
          <View key={section.title} style={styles.categorySection}>
            <Text style={styles.categorySectionTitle}>{section.title}</Text>

            <View style={styles.linksCardWrapper}>
              {section.items.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.navLinkRow,
                    index === section.items.length - 1 && {
                      borderBottomWidth: 0,
                    },
                  ]}
                  activeOpacity={0.6}
                  onPress={() => {
                    switch (item.id) {
                      case "personal":
                        router.push("/components/profile/personal-information");
                        break;

                      case "password":
                        router.push("/components/profile/change-password");
                        break;

                      case "security":
                        router.push("/components/profile/security");
                        break;

                      case "notifications":
                        router.push("/components/profile/notifications");
                        break;

                      case "business_info":
                        router.push("/components/profile/business-information");
                        break;

                      case "staff":
                        router.push(
                          "/components/profile/staff-management/staff-management",
                        );
                        break;

                      case "billing":
                        router.push("/components/profile/billing");
                        break;

                      case "analytics":
                        router.push("/components/profile/analytics");
                        break;

                      case "preferences":
                        router.push("/components/profile/preferences");
                        break;

                      case "privacy":
                        router.push("/components/profile/privacy");
                        break;

                      case "help":
                        router.push("/components/profile/help-support");
                        break;

                      case "about":
                        router.push("/components/profile/about");
                        break;

                      default:
                        break;
                    }
                  }}
                >
                  <View
                    style={[
                      styles.linkIconCircle,
                      {
                        backgroundColor: item.bg,
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={item.iconColor}
                    />
                  </View>

                  <View style={styles.linkTextContent}>
                    <Text style={styles.linkTitleLabel}>{item.label}</Text>

                    <Text style={styles.linkSubtextDesc} numberOfLines={1}>
                      {item.sub}
                    </Text>
                  </View>

                  <ChevronRightIcon />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Danger/Session Actions Logout Trigger Button */}
        <TouchableOpacity
          style={styles.logoutBtnAction}
          activeOpacity={0.8}
          onPress={handleLogout}
        >
          <SimpleLineIcons
            name="logout"
            size={14}
            color="#EF4444"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fixed lightweight SVG arrow element right alignment helper
function ChevronRightIcon() {
  return (
    <Ionicons
      name="chevron-forward"
      size={16}
      color="#94A3B8"
      style={{ marginLeft: "auto" }}
    />
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
  /* Header Card Panel Styling matching layout specifications */
  headerProfileCard: {
    paddingTop: Platform.OS === "android" ? 44 : 12,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTopActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
    marginTop: 4,
  },
  screenMainTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  notificationBellBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  bellBadge: {
    position: "absolute",
    top: 2,
    right: 4,
    backgroundColor: "#F59E0B",
    width: 15,
    height: 15,
    borderRadius: 7.5,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#08142E",
  },
  bellBadgeText: {
    color: "white",
    fontSize: 8,
    fontWeight: "900",
  },
  bioWrapperRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarContainer: {
    position: "relative",
  },
  userAvatarImage: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "#1E293B",
  },
  avatarCameraEditBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "white",
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  bioDetailsColumn: {
    flex: 1,
    marginLeft: 14,
    paddingRight: 6,
  },
  userNameText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  userRoleText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 1,
    marginBottom: 6,
  },
  contactRowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contactText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    flex: 1,
  },
  editProfileOutlineBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 2,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  editProfileOutlineBtnText: {
    color: "white",
    fontSize: 11,
    fontWeight: "700",
  },
  metricsWrapperRow: {
    flexDirection: "row",
    backgroundColor: "white",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginTop: 22,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 3,
    alignItems: "center",
  },
  metricItemBox: {
    flex: 1,
    alignItems: "center",
  },
  metricIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  metricCountText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  metricLabelText: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "600",
    marginTop: 1,
  },
  metricDividerLine: {
    width: 1,
    height: 32,
    backgroundColor: "#F1F5F9",
  },
  /* Settings Category Cards Sizing Groups Layout definitions */
  categorySection: {
    marginTop: 18,
    paddingHorizontal: 16,
  },
  categorySectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
    marginLeft: 2,
  },
  linksCardWrapper: {
    backgroundColor: "white",
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F2554",
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1.5,
  },
  navLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  linkIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  linkTextContent: {
    marginLeft: 12,
    flex: 1,
    paddingRight: 8,
  },
  linkTitleLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  linkSubtextDesc: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "500",
  },
  /* Danger Submissions Log-out Area Button Styles */
  logoutBtnAction: {
    marginHorizontal: 16,
    marginTop: 24,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FEE2E2",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  logoutBtnText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "700",
  },
});
