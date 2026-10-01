import {
  FontAwesome,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../services/api";

export default function CustomersScreen() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [customersData, setCustomersData] = useState([]);
  const [statsData, setStatsData] = useState([]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);

      const res = await api.get("/customers/all");

      const customers = res.data.data || [];
      const stats = res.data.stats || {};

      setCustomersData(customers);

      setStatsData([
        {
          id: "1",
          title: "Total",
          count: stats.total || 0,
          icon: "people",
          color: "#1D7AF3",
          bg: "#EEF6FF",
        },
        {
          id: "2",
          title: "Active",
          count: stats.active || 0,
          icon: "checkmark-circle",
          color: "#3EBB3E",
          bg: "#F2FBF2",
        },
        {
          id: "3",
          title: "Inactive",
          count: stats.inactive || 0,
          icon: "alert-circle",
          color: "#F4A300",
          bg: "#FFF9EF",
        },
        {
          id: "4",
          title: "New Mo.",
          count: stats.newThisMonth || 0,
          icon: "person-add",
          color: "#9B59FF",
          bg: "#FAF5FF",
        },
      ]);
    } catch (error) {
      console.log("CUSTOMERS ERROR:", error?.response?.data?.message || error?.message);
    } finally {
      loading && setLoading(false);
    }
  };

  // Direct Cellular Phone Dialer Link
  const handleCall = (phone) => {
    if (!phone) return alert("No phone number available");
    const cleanPhone = phone.replace(/[^0-9+]/g, ""); // Keep only numbers and optional country code "+"
    Linking.openURL(`tel:${cleanPhone}`).catch(() =>
      alert("Failed to open phone dialer"),
    );
  };

  // WhatsApp Chat deep link
  const handleWhatsApp = (phone) => {
    if (!phone) return alert("No phone number available");
    const cleanPhone = phone.replace(/[^0-9]/g, ""); // WhatsApp requires pure numeric values
    Linking.openURL(`whatsapp://send?phone=${cleanPhone}`).catch(() => {
      // Fallback to web link if app isn't installed
      Linking.openURL(`https://wa.me/${cleanPhone}`).catch(() =>
        alert("Failed to open WhatsApp"),
      );
    });
  };

  const filteredCustomers = customersData.filter((item) => {
    const q = search.toLowerCase();

    return (
      item.name?.toLowerCase().includes(q) ||
      item.phone?.includes(search) ||
      item.email?.toLowerCase().includes(q) ||
      item.idNo?.toLowerCase().includes(q)
    );
  });

  const renderCustomer = ({ item }) => {
    const isActive = item.status === "Active";

    return (
      <View style={styles.customerCard}>
        <Image
          source={{
            uri: item.avatar || "https://via.placeholder.com/100",
          }}
          style={styles.avatar}
        />

        <View style={styles.customerInfo}>
          <Text style={styles.customerName} numberOfLines={1}>
            {item.name}
          </Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoRow}>
              <Ionicons name="call" size={13} color="#64748B" />
              <Text style={styles.infoText} numberOfLines={1}>
                {item.phone || "-"}
              </Text>
            </View>

            <View style={styles.infoGridSplit}>
              <View style={[styles.infoRow, { flex: 1.2 }]}>
                <Ionicons name="card" size={13} color="#64748B" />
                <Text style={styles.infoText} numberOfLines={1}>
                  {item.idNo || "-"}
                </Text>
              </View>

              <View style={[styles.infoRow, { flex: 1.8 }]}>
                <Ionicons name="briefcase" size={13} color="#64748B" />
                <Text style={styles.infoText} numberOfLines={1}>
                  {item.profession || "-"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.rightSide}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: isActive ? "#DCFCE7" : "#FEF3C7",
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color: isActive ? "#16A34A" : "#D97706",
                },
              ]}
            >
              {item.status}
            </Text>
          </View>

          {/* Call & WhatsApp Interactive Action Buttons */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.callBtn]}
              onPress={() => handleCall(item.phone)}
            >
              <Ionicons name="call" size={14} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.whatsappBtn]}
              onPress={() => handleWhatsApp(item.phone)}
            >
              <FontAwesome name="whatsapp" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#031B4E" />
        <Text style={styles.loaderText}>Loading customers...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#031B4E" />

      <LinearGradient colors={["#031B4E", "#052C78"]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.navBackClick}
          >
            <Ionicons name="chevron-back" size={26} color="white" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Customers</Text>
        </View>
      </LinearGradient>

      <FlatList
        data={filteredCustomers}
        renderItem={renderCustomer}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.searchSection}>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={18} color="#94A3B8" />
                <TextInput
                  placeholder="Search name, phone, ID..."
                  placeholderTextColor="#94A3B8"
                  value={search}
                  onChangeText={setSearch}
                  style={styles.searchInput}
                />
              </View>

              <TouchableOpacity style={styles.filterBtn}>
                <MaterialCommunityIcons
                  name="filter-variant"
                  size={18}
                  color="#0F2554"
                />
                <Text style={styles.filterText}>Filter</Text>
              </TouchableOpacity>
            </View>

            <ScrollViewSection horizontalData={statsData} />

            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>
                All Customers{" "}
                <Text style={styles.listCount}>
                  ({filteredCustomers.length})
                </Text>
              </Text>
            </View>
          </>
        }
      />
    </SafeAreaView>
  );
}

function ScrollViewSection({ horizontalData }) {
  return (
    <View style={{ flexGrow: 0 }}>
      <FlatList
        horizontal
        data={horizontalData}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsContainerPadding}
        renderItem={({ item }) => (
          <View style={[styles.statCard, { backgroundColor: item.bg }]}>
            <View style={styles.statIconHeader}>
              <Ionicons name={item.icon} size={20} color={item.color} />
              <Text style={styles.statCount}>{item.count}</Text>
            </View>

            <Text style={styles.statLabel}>{item.title}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  loaderText: {
    marginTop: 10,
    color: "#64748B",
    fontWeight: "600",
  },
  header: {
    paddingTop: Platform.OS === "android" ? 40 : 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navBackClick: { paddingRight: 8 },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "800",
    flex: 1,
    marginLeft: 4,
  },
  addCustomerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addCustomerText: {
    color: "#FFC107",
    fontSize: 12,
    fontWeight: "700",
  },
  searchSection: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 8,
  },
  searchBox: {
    flex: 1,
    height: 44,
    backgroundColor: "white",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 6,
    fontSize: 13,
    color: "#111827",
  },
  filterBtn: {
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: "white",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F2554",
  },
  statsContainerPadding: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 4,
  },
  statCard: {
    width: 115,
    borderRadius: 12,
    padding: 10,
  },
  statIconHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statCount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111727",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 6,
  },
  listHeader: {
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  listCount: {
    color: "#94A3B8",
  },
  listContent: {
    paddingBottom: 80,
  },
  customerCard: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  customerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  customerName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  infoGrid: { gap: 3 },
  infoGridSplit: { flexDirection: "row", gap: 4 },
  infoRow: { flexDirection: "row", alignItems: "center" },
  infoText: {
    fontSize: 11,
    color: "#64748B",
    marginLeft: 4,
    flex: 1,
  },
  rightSide: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 58,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  callBtn: {
    backgroundColor: "#1D7AF3",
  },
  whatsappBtn: {
    backgroundColor: "#25D366",
  },
});
