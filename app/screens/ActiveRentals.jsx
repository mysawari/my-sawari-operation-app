import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

// Lives outside the component so it survives this screen unmounting/remounting
// when you navigate to details and come back (module stays in memory for the
// whole app session, reset only on full app reload).
// activeTab / appliedRange / customFrom / customTo are cached here too — not
// just page/scroll/data — so coming back restores the exact tab the user left,
// not just the list contents and scroll position.
const screenCache = {
  rentalsData: null,
  page: 1,
  scrollOffset: 0,
  activeTab: "all",
  appliedRange: null, // { from: Date, to: Date } | null
  customFrom: "",
  customTo: "",
};

// Disk cache: survives full app kills / cold starts. We store the RAW api
// response (not the formatted-with-Date-objects version) so it round-trips
// cleanly through JSON, then run it through formatRentalItem exactly like a
// normal network response. This is what makes the very first screen open
// after killing the app feel instant instead of showing a spinner.
const DISK_CACHE_KEY = "@active_rentals_raw_cache_v1";

const statusStyles = {
  green: { bg: "#DCFCE7", color: "#16A34A" },
  yellow: { bg: "#FEF3C7", color: "#D97706" },
  blue: { bg: "#DBEAFE", color: "#2563EB" },
  purple: { bg: "#EDE9FE", color: "#7C3AED" },
};

const PAGE_SIZE = 10;

const TABS = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
];

// yyyy-mm-dd -> Date (local, midnight)
const parseDateInput = (value) => {
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((p) => parseInt(p, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
};

const isSameDay = (d1, d2) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

// --- Lightweight skeleton placeholder shown ONLY on a true first-ever load
// (no memory cache, no disk cache). Gives an instant "something is here"
// feel instead of a blank spinner while the very first network call resolves.
function SkeletonCard() {
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.skeletonCard, { opacity: pulse }]}>
      <View style={styles.skeletonTopRow}>
        <View style={styles.skeletonImage} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={[styles.skeletonBlock, { width: "60%", height: 14 }]} />
          <View
            style={[
              styles.skeletonBlock,
              { width: "40%", height: 12, marginTop: 8 },
            ]}
          />
        </View>
      </View>
      <View
        style={[
          styles.skeletonBlock,
          { width: "100%", height: 40, marginTop: 14 },
        ]}
      />
      <View
        style={[
          styles.skeletonBlock,
          { width: "100%", height: 40, marginTop: 10 },
        ]}
      />
    </Animated.View>
  );
}

export default function ActiveRentalsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [rentalsData, setRentalsData] = useState(screenCache.rentalsData || []);
  const [refreshing, setRefreshing] = useState(false);
  // loading only stays true when we truly have nothing to show yet (no
  // memory cache AND no disk cache found). Everything else paints instantly.
  const [loading, setLoading] = useState(screenCache.rentalsData === null);
  const { token } = useAuthStore();

  // Tabs + custom date filter — seeded from screenCache so a remount (coming
  // back from details/edit) restores exactly what the user had selected.
  const [activeTab, setActiveTab] = useState(screenCache.activeTab || "all");
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [customFrom, setCustomFrom] = useState(screenCache.customFrom || ""); // yyyy-mm-dd
  const [customTo, setCustomTo] = useState(screenCache.customTo || ""); // yyyy-mm-dd
  const [appliedRange, setAppliedRange] = useState(
    screenCache.appliedRange || null,
  ); // { from, to } Date objects once applied

  // Pagination — restored from cache so going back doesn't collapse to page 1
  const [page, setPage] = useState(screenCache.page || 1);

  // Scroll-position restoration
  const flatListRef = useRef(null);
  const skipNextPageReset = useRef(true); // avoid resetting page on the very first mount

  const handleEditRental = (id) => {
    router.push({
      pathname: "/components/activeRental/edit-rental",
      params: { rentalId: id },
    });
  };

  const handleViewDetails = (id) => {
    router.push({
      pathname: "/components/activeRental/rental-details",
      params: { id },
    });
  };

  // Format Helper with Custom Localized Date Style
  const formatRentalItem = (item) => {
    const options = { day: "numeric", month: "long", year: "numeric" };
    const pickupRaw = item.trip?.pickupDateTime
      ? new Date(item.trip.pickupDateTime)
      : null;

    return {
      id: item._id,
      customer: item.customer?.fullName || "Unknown Customer",
      phone: item.customer?.mobileNumber || "",
      vehicle: item.vehicle?.vehicleName || "Unknown Vehicle",
      plate: item.vehicle?.vehicleNumber || "N/A",
      pickupDateRaw: pickupRaw,
      pickupDate: pickupRaw
        ? pickupRaw.toLocaleDateString("en-GB", options)
        : "",
      pickupTime: pickupRaw
        ? pickupRaw.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
      returnDate: item.trip?.dropDateTime
        ? new Date(item.trip.dropDateTime).toLocaleDateString("en-GB", options)
        : "",
      returnTime: item.trip?.dropDateTime
        ? new Date(item.trip.dropDateTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
      balanceAmount:
        item.payment?.billSummary?.balanceAmount ??
        item.payment?.balanceAmount ??
        0,

      paymentStatus:
        item.payment?.billSummary?.balanceAmount > 0 ? "partial" : "paid",
      image:
        item.images?.vehicleFront ||
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=300&auto=format&fit=crop",
      status: "Active",
      statusType: "green",
    };
  };

  // Persist the RAW api array to disk so the next cold app start can paint
  // instantly before the network call resolves. Fire-and-forget — never
  // blocks the UI or throws into the caller.
  const persistToDisk = (rawData) => {
    AsyncStorage.setItem(DISK_CACHE_KEY, JSON.stringify(rawData)).catch(() => {
      // Non-fatal: worst case we just lose the fast-path next cold start.
    });
  };

  const fetchActiveHandovers = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get("/handover/active-handovers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rawData = res.data?.data || [];
      const formattedData = rawData.map(formatRentalItem);
      setRentalsData(formattedData);
      screenCache.rentalsData = formattedData;
      persistToDisk(rawData);
    } catch (error) {
      console.log("Fetch error:", error?.response?.data || error.message);
      if (!silent) {
        Alert.alert(
          "Error",
          error?.response?.data?.message || "Failed to fetch active rentals",
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.get("/handover/active-handovers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rawData = res.data?.data || [];
      const formattedData = rawData.map(formatRentalItem);
      setRentalsData(formattedData);
      screenCache.rentalsData = formattedData;
      persistToDisk(rawData);
    } catch (error) {
      console.log(error);
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    const hydrateThenFetch = async () => {
      // Case 1: we already have in-memory data (came back within this app
      // session, e.g. from details/edit). Already painted synchronously via
      // useState initial value above — just refresh quietly in background.
      if (screenCache.rentalsData !== null) {
        fetchActiveHandovers({ silent: true });
        return;
      }

      // Case 2: nothing in memory (first mount this session, possibly a
      // fresh app launch). Try the disk cache — this resolves in a few ms,
      // no network round trip — so we can paint instantly instead of
      // showing a spinner.
      try {
        const cachedRaw = await AsyncStorage.getItem(DISK_CACHE_KEY);
        if (cachedRaw && !cancelled) {
          const parsedRaw = JSON.parse(cachedRaw);
          const formatted = parsedRaw.map(formatRentalItem);
          screenCache.rentalsData = formatted;
          setRentalsData(formatted);
          setLoading(false);
        }
      } catch (e) {
        // Corrupt or missing cache — fall through to network, no big deal.
      }

      // Always hit the network too, silently if we already painted
      // something from disk, loudly (spinner) only on a true first-ever load.
      if (!cancelled) {
        fetchActiveHandovers({ silent: screenCache.rentalsData !== null });
      }
    };

    hydrateThenFetch();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the exact scroll position the user was at when they navigated away
  useFocusEffect(
    useCallback(() => {
      if (screenCache.scrollOffset > 0 && flatListRef.current) {
        const timer = setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: screenCache.scrollOffset,
            animated: false,
          });
        }, 60);
        return () => clearTimeout(timer);
      }
    }, []),
  );

  const handleCallPress = (phoneNumber) => {
    if (!phoneNumber) {
      Alert.alert("Error", "No phone number available for this client.");
      return;
    }
    const url = `tel:${phoneNumber}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (!supported) {
          Alert.alert("Error", "Phone calls are not supported on this device.");
        } else {
          return Linking.openURL(url);
        }
      })
      .catch((err) => console.error("Error opening dialer:", err));
  };

  const handleSelectTab = (key) => {
    setActiveTab(key);
    if (key !== "custom") {
      setAppliedRange(null);
    }
  };

  const handleApplyFilter = () => {
    const from = parseDateInput(customFrom);
    const to = parseDateInput(customTo || customFrom);
    if (!from) {
      Alert.alert(
        "Invalid date",
        "Please enter a valid from date (YYYY-MM-DD).",
      );
      return;
    }
    from.setHours(0, 0, 0, 0);
    const toEnd = to ? new Date(to) : new Date(from);
    toEnd.setHours(23, 59, 59, 999);
    setAppliedRange({ from, to: toEnd });
    setActiveTab("custom");
    setFilterModalVisible(false);
  };

  const handleClearFilter = () => {
    setCustomFrom("");
    setCustomTo("");
    setAppliedRange(null);
    setActiveTab("all");
    setFilterModalVisible(false);
  };

  // 1) Filter the FULL dataset by tab / custom date range
  const tabFilteredRentals = useMemo(() => {
    if (activeTab === "today") {
      const now = new Date();
      return rentalsData.filter(
        (item) => item.pickupDateRaw && isSameDay(item.pickupDateRaw, now),
      );
    }
    if (activeTab === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return rentalsData.filter(
        (item) => item.pickupDateRaw && isSameDay(item.pickupDateRaw, y),
      );
    }
    if (activeTab === "custom" && appliedRange) {
      return rentalsData.filter(
        (item) =>
          item.pickupDateRaw &&
          item.pickupDateRaw >= appliedRange.from &&
          item.pickupDateRaw <= appliedRange.to,
      );
    }
    return rentalsData;
  }, [rentalsData, activeTab, appliedRange]);

  // 2) Apply search on top of the tab-filtered (still full, not paginated) dataset
  const searchFilteredRentals = useMemo(() => {
    if (search.trim() === "") return tabFilteredRentals;
    const query = search.toLowerCase();
    return tabFilteredRentals.filter(
      (item) =>
        item.customer.toLowerCase().includes(query) ||
        item.vehicle.toLowerCase().includes(query) ||
        item.plate.toLowerCase().includes(query),
    );
  }, [tabFilteredRentals, search]);

  // Reset pagination to page 1 only when the user changes search/tab/filter —
  // NOT on first mount (where we want the restored page) and NOT when
  // rentalsData silently refreshes in the background.
  useEffect(() => {
    if (skipNextPageReset.current) {
      skipNextPageReset.current = false;
      return;
    }
    setPage(1);
  }, [search, activeTab, appliedRange]);

  // Keep the cache in sync so a remount (e.g. after visiting details) restores
  // exactly where the user left off — page, tab, and the applied date filter.
  useEffect(() => {
    screenCache.page = page;
  }, [page]);

  useEffect(() => {
    screenCache.activeTab = activeTab;
  }, [activeTab]);

  useEffect(() => {
    screenCache.appliedRange = appliedRange;
  }, [appliedRange]);

  useEffect(() => {
    screenCache.customFrom = customFrom;
    screenCache.customTo = customTo;
  }, [customFrom, customTo]);

  // 3) Slice for what's actually rendered (10 at a time)
  const visibleRentals = useMemo(
    () => searchFilteredRentals.slice(0, page * PAGE_SIZE),
    [searchFilteredRentals, page],
  );

  const hasMore = visibleRentals.length < searchFilteredRentals.length;

  const handleLoadMore = () => {
    if (hasMore) {
      setPage((p) => p + 1);
    }
  };

  const renderRental = ({ item }) => {
    const badge = statusStyles[item.statusType] || statusStyles.green;

    return (
      <View
        style={[styles.card, item.balanceAmount > 0 && styles.cardWithBalance]}
      >
        <View style={styles.topRow}>
          <Image source={{ uri: item.image }} style={styles.vehicleImage} />
          <View style={styles.customerSection}>
            <Text style={styles.infoValue} numberOfLines={1}>
              {item.vehicle}
            </Text>
            <Text style={styles.customerName} numberOfLines={1}>
              {item.customer}
            </Text>

            <TouchableOpacity
              style={styles.phoneRow}
              onPress={() => handleCallPress(item.phone)}
            >
              <Ionicons name="call-outline" size={14} color="#2563EB" />
              <Text style={styles.phoneText}>{item.phone}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.rightSection}>
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statusText, { color: badge.color }]}>
                {item.status}
              </Text>
            </View>
            <TouchableOpacity style={styles.kebabBtn}>
              <Feather name="more-vertical" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>VEHICLE</Text>

            <View style={styles.plateTag}>
              <Text style={styles.plateTagText}>{item.plate}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>PICK UP</Text>
            <View style={styles.iconRow}>
              <Ionicons name="calendar-outline" size={12} color="#64748B" />
              <Text style={styles.smallText}>{item.pickupDate}</Text>
            </View>
            <View style={styles.iconRow}>
              <Ionicons name="time-outline" size={12} color="#64748B" />
              <Text style={styles.smallText}>{item.pickupTime}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>RETURN</Text>
            <View style={styles.iconRow}>
              <Ionicons name="calendar-outline" size={12} color="#64748B" />
              <Text style={styles.smallText}>{item.returnDate}</Text>
            </View>
            <View style={styles.iconRow}>
              <Ionicons name="time-outline" size={12} color="#64748B" />
              <Text style={styles.smallText}>{item.returnTime}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>BALANCE</Text>
            <Text
              style={[
                styles.balanceText,
                { color: item.balanceAmount > 0 ? "#DC2626" : "#16A34A" },
              ]}
            >
              ₹{item.balanceAmount.toLocaleString("en-IN")}
            </Text>
            <Text
              style={[
                styles.balanceStatus,
                { color: item.balanceAmount > 0 ? "#DC2626" : "#16A34A" },
              ]}
            >
              {item.balanceAmount > 0 ? "Pending" : "Paid"}
            </Text>
          </View>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => handleCallPress(item.phone)}
          >
            <Ionicons name="call-outline" size={16} color="#0F2554" />
            <Text style={styles.callBtnText}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => handleEditRental(item.id)}
          >
            <Ionicons name="create-outline" size={16} color="#0F2554" />
            <Text style={styles.editBtnText}>Edit Trip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailsBtn}
            onPress={() => handleViewDetails(item.id)}
          >
            <Text style={styles.detailsBtnText}>Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFooter = () => {
    if (!hasMore) {
      if (searchFilteredRentals.length > PAGE_SIZE) {
        return <Text style={styles.endOfListText}>You've reached the end</Text>;
      }
      return null;
    }
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#0F2554" />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0A1628" barStyle="light-content" />

      <LinearGradient colors={["#0A1628", "#0F2554"]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Active Rentals</Text>
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => setFilterModalVisible(true)}
          >
            <MaterialCommunityIcons
              name="filter-outline"
              size={20}
              color="#FFC107"
            />
            <Text style={styles.filterText}>Filter</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color="#94A3B8" />
          <TextInput
            placeholder="Search customer, vehicle or plate..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color="#CBD5E1" />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tabButton,
                activeTab === tab.key && styles.tabButtonActive,
              ]}
              onPress={() => handleSelectTab(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.key && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}

          {activeTab === "custom" && appliedRange && (
            <View style={styles.customChip}>
              <Text style={styles.customChipText} numberOfLines={1}>
                {customFrom}
                {customTo && customTo !== customFrom ? ` → ${customTo}` : ""}
              </Text>
              <TouchableOpacity onPress={handleClearFilter}>
                <Ionicons name="close" size={14} color="#7C3AED" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        // True first-ever load with nothing cached anywhere: show skeleton
        // cards instead of a blank spinner — feels instant/native.
        <View style={styles.listContent}>
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={visibleRentals}
          renderItem={renderRental}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          onScroll={(e) => {
            screenCache.scrollOffset = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          // Perf: avoid re-rendering every row on every re-render of the list
          initialNumToRender={PAGE_SIZE}
          maxToRenderPerBatch={PAGE_SIZE}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="car-outline" size={40} color="#CBD5E1" />
              <Text style={styles.emptyText}>No active rentals found</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#0F2554"]}
              tintColor="#0F2554"
            />
          }
        />
      )}

      {/* Date range filter modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Filter by Date</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>From (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="2026-07-01"
              placeholderTextColor="#94A3B8"
              value={customFrom}
              onChangeText={setCustomFrom}
              keyboardType={
                Platform.OS === "ios" ? "numbers-and-punctuation" : "default"
              }
            />

            <Text style={styles.modalLabel}>To (YYYY-MM-DD) — optional</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="2026-07-17"
              placeholderTextColor="#94A3B8"
              value={customTo}
              onChangeText={setCustomTo}
              keyboardType={
                Platform.OS === "ios" ? "numbers-and-punctuation" : "default"
              }
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalClearBtn}
                onPress={handleClearFilter}
              >
                <Text style={styles.modalClearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalApplyBtn}
                onPress={handleApplyFilter}
              >
                <Text style={styles.modalApplyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  header: {
    paddingTop: Platform.OS === "android" ? 44 : 12,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "800",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  filterText: {
    color: "#FFC107",
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 4,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  searchBox: {
    backgroundColor: "white",
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: "#0F172A",
  },
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    flexWrap: "wrap",
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  tabButtonActive: {
    backgroundColor: "#0F2554",
    borderColor: "#0F2554",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  tabTextActive: {
    color: "white",
  },
  customChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EDE9FE",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    maxWidth: 180,
  },
  customChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7C3AED",
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    elevation: 2,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardWithBalance: {
    borderLeftWidth: 4,
    borderLeftColor: "#DC2626",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  vehicleImage: {
    width: 64,
    height: 54,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    resizeMode: "cover",
  },
  customerSection: {
    flex: 1,
    marginLeft: 12,
  },
  customerName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  phoneText: {
    fontSize: 13,
    color: "#2563EB",
    marginLeft: 4,
    fontWeight: "500",
  },
  rightSection: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontWeight: "700",
    fontSize: 11,
  },
  kebabBtn: {
    marginTop: 4,
    padding: 2,
  },
  infoGrid: {
    flexDirection: "row",
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
  },
  infoBox: {
    flex: 1,
    paddingHorizontal: 2,
  },
  divider: {
    width: 1,
    backgroundColor: "#F1F5F9",
    alignSelf: "stretch",
    marginHorizontal: 2,
  },
  infoTitle: {
    fontSize: 9,
    color: "#94A3B8",
    fontWeight: "700",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  plateTag: {
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#EFF6FF",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  plateTagText: {
    color: "#1E40AF",
    fontWeight: "700",
    fontSize: 10,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  smallText: {
    fontSize: 11,
    color: "#475569",
    marginLeft: 3,
  },
  balanceText: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 1,
  },
  balanceStatus: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: 14,
    gap: 8,
  },
  callBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  callBtnText: {
    color: "#0F2554",
    fontWeight: "600",
    fontSize: 13,
    marginLeft: 4,
  },
  editBtn: {
    flex: 1.2,
    height: 40,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  editBtnText: {
    color: "#0F2554",
    fontWeight: "600",
    fontSize: 13,
    marginLeft: 4,
  },
  detailsBtn: {
    flex: 1.2,
    backgroundColor: "#FFC107",
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  detailsBtnText: {
    fontWeight: "700",
    fontSize: 13,
    color: "#111827",
  },
  footerLoader: {
    paddingVertical: 20,
  },
  endOfListText: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    paddingVertical: 16,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 10,
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  skeletonCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  skeletonTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  skeletonImage: {
    width: 64,
    height: 54,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  skeletonBlock: {
    backgroundColor: "#E2E8F0",
    borderRadius: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#0F172A",
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  modalClearBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  modalClearBtnText: {
    color: "#475569",
    fontWeight: "700",
    fontSize: 14,
  },
  modalApplyBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#FFC107",
    justifyContent: "center",
    alignItems: "center",
  },
  modalApplyBtnText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 14,
  },
});
