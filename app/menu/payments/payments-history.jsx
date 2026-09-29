import {
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  FlatList,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import colors from "../../../theme/colors";

const paymentActions = [
  {
    id: "1",
    title: "Payment History",
    subtitle: "View all handover & received payment records",
    icon: MaterialCommunityIcons,
    iconName: "history",
    color: "#0F766E",
    bg: "#D1FAE5",
    route: "./history",
  },
  {
    id: "2",
    title: "Pending to collect cash",
    subtitle: "Collect pending payment from customer",
    icon: MaterialCommunityIcons,
    iconName: "cash-plus",
    color: "#2563EB",
    bg: "#DBEAFE",
    route: "./cashpaymentverificationscreen",
  },
  {
    id: "3",
    title: "Verify UPI Collection",
    subtitle: "Balances waiting to be collected",
    icon: FontAwesome5,
    iconName: "wallet",
    color: "#D97706",
    bg: "#FEF3C7",
    route: "./phonepepaymentverificationscreen",
  },
  {
    id: "4",
    title: "Today's Collection",
    subtitle: "Cash & UPI collection summary for today",
    icon: MaterialCommunityIcons,
    iconName: "calendar-today",
    color: "#16A34A",
    bg: "#DCFCE7",
    route: "/payments/today",
  },
  {
    id: "5",
    title: "Collection Report",
    subtitle: "Daily, weekly and monthly payment reports",
    icon: MaterialCommunityIcons,
    iconName: "chart-line",
    color: "#059669",
    bg: "#D1FAE5",
    route: "/payments/reports",
  },
  {
    id: "6",
    title: "Refund History",
    subtitle: "View refunded payment transactions",
    icon: MaterialCommunityIcons,
    iconName: "cash-refund",
    color: "#7C3AED",
    bg: "#EDE9FE",
    route: "/payments/refunds",
  },
  {
    id: "7",
    title: "Payment Requests",
    subtitle: "View customer payment requests & follow-ups",
    icon: MaterialCommunityIcons,
    iconName: "clipboard-text-clock",
    color: "#EA580C",
    bg: "#FFEDD5",
    route: "/payments/requests",
  },
  {
    id: "8",
    title: "Payment Methods",
    subtitle: "Cash, UPI, Card and Bank Transfer details",
    icon: MaterialCommunityIcons,
    iconName: "credit-card-outline",
    color: "#0284C7",
    bg: "#E0F2FE",
    route: "/payments/methods",
  },
  {
    id: "9",
    title: "Outstanding Dues",
    subtitle: "Customers with unpaid balances",
    icon: MaterialCommunityIcons,
    iconName: "alert-circle-outline",
    color: "#DC2626",
    bg: "#FEE2E2",
    route: "/payments/outstanding",
  },
  {
    id: "10",
    title: "Settlement",
    subtitle: "View completed payment settlements",
    icon: MaterialCommunityIcons,
    iconName: "check-decagram",
    color: "#15803D",
    bg: "#DCFCE7",
    route: "/payments/settlements",
  },
  {
    id: "11",
    title: "Export Payments",
    subtitle: "Download Excel or PDF payment reports",
    icon: MaterialCommunityIcons,
    iconName: "download-circle-outline",
    color: "#7C3AED",
    bg: "#F3E8FF",
    route: "/payments/export",
  },
  {
    id: "12",
    title: "Payment Settings",
    subtitle: "Manage payment preferences and options",
    icon: MaterialCommunityIcons,
    iconName: "cog-outline",
    color: "#475569",
    bg: "#F1F5F9",
    route: "/payments/settings",
  },
];

export default function PaymentActions() {
  const router = useRouter();

  const renderItem = ({ item }) => {
    const Icon = item.icon;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.card}
        onPress={() => router.push(item.route)}
      >
        <View style={[styles.iconWrap, { backgroundColor: item.bg }]}>
          <Icon name={item.iconName} size={24} color={item.color} />
        </View>

        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {item.subtitle}
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={20}
          color="#94A3B8"
          style={styles.chevron}
        />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={paymentActions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<Text style={styles.heading}>Payments</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },

  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },

  heading: {
    fontSize: 26,
    fontWeight: "800",
    color: colors?.textPrimary || "#1E293B",
    marginBottom: 20,
    marginTop: 8,
  },

  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginBottom: 12,

    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },

  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  content: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },

  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors?.textPrimary || "#1E293B",
  },

  subtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: colors?.textSecondary || "#64748B",
  },

  chevron: {
    marginLeft: "auto",
  },
});
