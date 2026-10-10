import React, { useEffect, useMemo, useState, memo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import api from "../../../services/api";
import colors from "../../../theme/colors";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const PAGE_SIZE = 500;

const TABS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "all", label: "All" },
];

const formatCurrency = (amount) => {
  const value = Number(amount) || 0;
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

const formatDate = (dateString) => {
  if (!dateString) return "--";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const isToday = (date) => {
  const today = new Date();
  const d = new Date(date);
  return d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
};

const isYesterday = (date) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const d = new Date(date);
  return d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
};

const PendingPaymentCard = memo(({ payment }) => {
  const method = String(payment.paymentMethod || "").toUpperCase();
  const type = String(payment.type || "PAYMENT").toUpperCase();
  const customerName = payment?.customer?.fullName || "Customer";
  const customerPhone = payment?.customer?.mobileNumber || "N/A";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.customerInfo}>
          <Text style={styles.customerName}>{customerName}</Text>
          <Pressable 
            style={styles.phoneRow} 
            onPress={() => customerPhone !== "N/A" && Linking.openURL(`tel:${customerPhone}`)}
            hitSlop={8}
          >
            {customerPhone !== "N/A" && (
              <MaterialCommunityIcons name="phone" size={12} color={colors.primary || "#0EA5E9"} style={styles.phoneIcon} />
            )}
            <Text style={[styles.customerPhone, customerPhone !== "N/A" && styles.clickablePhone]}>
              {customerPhone}
            </Text>
          </Pressable>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{method}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>{type} PENDING</Text>
          <Text style={styles.amountValue}>{formatCurrency(payment.remainingAmount)}</Text>
        </View>

        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>Total: {formatCurrency(payment.amount)}</Text>
          <Text style={styles.detailLabel}>{formatDate(payment.createdAt)}</Text>
        </View>
      </View>
    </View>
  );
});

const FILTER_TYPES = [
  { key: "all", label: "All Types" },
  { key: "booking", label: "Booking" },
  { key: "handover", label: "Handover" },
  { key: "extension", label: "Extension" },
  { key: "refund", label: "Refund" },
];

export default function PendingPaymentsScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("today");
  const [typeFilter, setTypeFilter] = useState("all");
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPayments = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await api.get("/handover/pending-payments", { params: { limit: PAGE_SIZE } });
      const data = res.data?.data || [];
      
      setPayments(data);
    } catch (err) {
      console.error("Failed to load pending payments", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const displayedPayments = useMemo(() => {
    let filtered = payments;
    if (activeTab === "today") filtered = filtered.filter(p => isToday(p.createdAt));
    else if (activeTab === "yesterday") filtered = filtered.filter(p => isYesterday(p.createdAt));

    if (typeFilter !== "all") {
      filtered = filtered.filter(p => p.type === typeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((p) => {
        const name = (p.customer?.fullName || "").toLowerCase();
        const phone = (p.customer?.mobileNumber || "").toLowerCase();
        const amount = String(p.remainingAmount || "");
        return name.includes(q) || phone.includes(q) || amount.includes(q);
      });
    }

    return filtered;
  }, [payments, activeTab, typeFilter, searchQuery]);

  const renderTab = (item) => {
    const isActive = activeTab === item.key;
    return (
      <Pressable
        key={item.key}
        style={[styles.tab, isActive && styles.activeTab]}
        onPress={() => setActiveTab(item.key)}
      >
        <Text style={[styles.tabText, isActive && styles.activeTabText]}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  const renderTypeFilter = (item) => {
    const isActive = typeFilter === item.key;
    return (
      <Pressable
        key={item.key}
        style={[styles.typePill, isActive && styles.typePillActive]}
        onPress={() => setTypeFilter(item.key)}
      >
        <Text style={[styles.typePillText, isActive && styles.typePillTextActive]}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backButtonText}>‹</Text>
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Pending Payments</Text>
            <Text style={styles.headerSubtitle}>All pending collection summaries</Text>
          </View>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Pending Payments</Text>
          <Text style={styles.headerSubtitle}>All pending collection summaries</Text>
        </View>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search customer, phone, or amount"
            placeholderTextColor="#9BA1AB"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => setSearchQuery("")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Text style={styles.searchClear}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.tabsContainer}>
        <View style={styles.tabsContent}>
          {TABS.map(renderTab)}
        </View>
      </View>

      <View style={styles.typeFiltersWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTER_TYPES}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => renderTypeFilter(item)}
          contentContainerStyle={styles.typeFiltersContent}
        />
      </View>

      <FlatList
        data={displayedPayments}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <PendingPaymentCard payment={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchPayments(true)} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="check-circle-outline" size={48} color={colors.green} />
            <Text style={styles.emptyTitle}>No Pending Payments</Text>
            <Text style={styles.emptySubtitle}>You&apos;re all caught up for {activeTab}!</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E7E9ED",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F5F6F8",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 24,
    color: "#111827",
    lineHeight: 28,
    marginLeft: -2,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6B7280",
  },
  searchSection: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E7E9ED",
  },
  searchGlyph: {
    fontSize: 20,
    color: "#9BA1AB",
    marginRight: 8,
    marginTop: -2,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
    paddingVertical: 0,
  },
  searchClear: {
    fontSize: 14,
    color: "#9BA1AB",
    fontWeight: "700",
    paddingLeft: 8,
  },
  tabsContainer: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 3,
    borderRadius: 13,
    backgroundColor: "#EDEFF2",
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingVertical: 6,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9BA1AB",
  },
  activeTabText: {
    color: "#111827",
  },
  typeFiltersWrapper: {
    marginBottom: 8,
  },
  typeFiltersContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  typePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 8,
  },
  typePillActive: {
    backgroundColor: "#E0F2FE",
    borderColor: "#BAE6FD",
  },
  typePillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  typePillTextActive: {
    color: "#0369A1",
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  customerInfo: {
    flex: 1,
    paddingRight: 8,
  },
  customerName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  phoneIcon: {
    marginRight: 4,
  },
  customerPhone: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
  },
  clickablePhone: {
    color: "#0EA5E9",
  },
  cardType: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  badge: {
    backgroundColor: "#FEF9C3",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#CA8A04",
  },
  cardBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  amountBox: {
    flex: 1,
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  detailBox: {
    alignItems: "flex-end",
  },
  detailLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0F172A",
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 8,
    textAlign: "center",
  },
});
