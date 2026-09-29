import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
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

const statusConfig = {
  available: {
    bg: "#ECFDF5",
    text: "#059669",
    border: "#6EE7B7",
    label: "Available",
    dot: "#10B981",
  },
  rent: {
    bg: "#FFFBEB",
    text: "#D97706",
    border: "#FCD34D",
    label: "On Rent",
    dot: "#F59E0B",
  },
  on_rent: {
    bg: "#FFFBEB",
    text: "#D97706",
    border: "#FCD34D",
    label: "On Rent",
    dot: "#F59E0B",
  },
  service: {
    bg: "#FEF2F2",
    text: "#DC2626",
    border: "#FCA5A5",
    label: "In Service",
    dot: "#EF4444",
  },
};

const PAGE_SIZE = 20;
const CACHE_KEY = "manage_vehicles_cache_v2";
const SEARCH_DEBOUNCE_MS = 350;

const FILTER_TO_STATUS_PARAM = {
  All: "All",
  Available: "available",
  "On Rent": "rent", // backend treats rent/on_rent as the same tab
  Service: "service",
};

const STAT_TITLE_TO_FILTER = {
  Total: "All",
  Available: "Available",
  "On Rent": "On Rent",
  Service: "Service",
};

// Category options shown in the filter-icon dropdown. "All" means no
// category filter is sent to the backend at all.
const CATEGORY_OPTIONS = [
  { key: "All", label: "All Vehicles", icon: "shape-outline" },
  { key: "Car", label: "Car", icon: "car" },
  { key: "Bike", label: "Bike", icon: "motorbike" },
];

let screenCache = {
  vehicles: [],
  statsData: [],
  page: 1,
  hasMore: false,
  activeFilter: "All",
  category: "All", // NEW
  search: "",
  debouncedSearch: "",
  scrollOffset: 0,
  hasLoadedOnce: false,
};

const mapVehicle = (item) => {
  const regDate = item.registrationDate
    ? new Date(item.registrationDate)
    : null;
  const validYear =
    regDate && !isNaN(regDate.getTime()) ? regDate.getFullYear() : "N/A";

  return {
    id: item._id,
    name: item.vehicleName || "Unnamed Vehicle",
    plate: item.vehicleNumber || "—",
    fuel: item.fuelType || "N/A",
    transmission: item.transmission || "N/A",
    seats: `${item.seatingCapacity ?? "N/A"} Seater`,
    status: item.status,
    category: item.category || null, // NEW
    year: validYear,
    pricePerDay: item.pricePerDay || 0,
    image: item.images?.[0]?.url || "https://via.placeholder.com/300x200",
    customer: null,
    till: null,
  };
};

const buildStatsData = (statsArray = []) => {
  const byStatus = Object.fromEntries(statsArray.map((s) => [s._id, s.count]));
  const available = byStatus.available || 0;
  const rent = (byStatus.rent || 0) + (byStatus.on_rent || 0);
  const service = byStatus.service || 0;
  const total = statsArray.reduce((sum, s) => sum + (s.count || 0), 0);

  return [
    {
      id: 1,
      title: "Total",
      count: total,
      icon: "car-outline",
      accent: "#BFDBFE",
    },
    {
      id: 2,
      title: "Available",
      count: available,
      icon: "checkmark-circle-outline",
      accent: "#A7F3D0",
    },
    {
      id: 3,
      title: "On Rent",
      count: rent,
      icon: "time-outline",
      accent: "#FDE68A",
    },
    {
      id: 4,
      title: "Service",
      count: service,
      icon: "construct-outline",
      accent: "#FECACA",
    },
  ];
};

export default function ManageVehiclesScreen() {
  const router = useRouter();
  const [search, setSearch] = useState(screenCache.search);
  const [debouncedSearch, setDebouncedSearch] = useState(
    screenCache.debouncedSearch,
  );
  // "All" (Total) is the default active filter.
  const [activeFilter, setActiveFilter] = useState(screenCache.activeFilter);
  // Category filter state ("All" | "Car" | "Bike"), driven by the
  // dropdown opened from the filter icon next to search.
  const [category, setCategory] = useState(screenCache.category || "All");
  const [categoryMenuVisible, setCategoryMenuVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(null);

  const [vehicles, setVehicles] = useState(screenCache.vehicles);
  const [statsData, setStatsData] = useState(screenCache.statsData);
  const [page, setPage] = useState(screenCache.page);
  const [hasMore, setHasMore] = useState(screenCache.hasMore);

  const [hasPaintedOnce, setHasPaintedOnce] = useState(
    screenCache.hasLoadedOnce,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false); // quiet background sync, no full loader
  const [deletingId, setDeletingId] = useState(null);

  const { token } = useAuthStore();
  const requestIdRef = useRef(0);

  const listRef = useRef(null);
  const hasRestoredScroll = useRef(false);
  const isFirstLoadRun = useRef(true);
  const isFirstFilterRun = useRef(true);

  // Debounce the search box so every keystroke doesn't fire a request —
  // waits for a short pause in typing before hitting the server.
  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedSearch(search.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [search]);

  const fetchVehicles = useCallback(
    async ({
      pageToLoad = 1,
      isRefresh = false,
      isLoadMore = false,
      silent = false,
    } = {}) => {
      const myRequestId = ++requestIdRef.current;
      try {
        if (isRefresh) setRefreshing(true);
        else if (isLoadMore) setLoadingMore(true);
        else if (silent) setSyncing(true);

        const res = await api.get("/vehicles/all", {
          params: {
            page: pageToLoad,
            limit: PAGE_SIZE,
            status: FILTER_TO_STATUS_PARAM[activeFilter] || "All",
            // Only send category when it isn't "All" — keeps the request
            // shape identical to before for the default case.
            category: category !== "All" ? category.toLowerCase() : undefined,
            search: debouncedSearch || undefined,
          },
          headers: { Authorization: `Bearer ${token}` },
        });

        // Drop stale responses if the filter/search changed mid-flight.
        if (myRequestId !== requestIdRef.current) return;

        const rows = (res?.data?.data || [])
          .filter((item) => item && item._id)
          .map(mapVehicle);

        setVehicles((prev) => (pageToLoad === 1 ? rows : [...prev, ...rows]));
        setStatsData(buildStatsData(res?.data?.stats));
        setHasMore(!!res?.data?.hasMore);
        setPage(pageToLoad);
        setHasPaintedOnce(true);

        if (
          pageToLoad === 1 &&
          activeFilter === "All" &&
          category === "All" &&
          !debouncedSearch
        ) {
          AsyncStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ vehicles: rows, stats: res?.data?.stats }),
          ).catch(() => {});
        }
      } catch (error) {
        if (myRequestId !== requestIdRef.current) return;
        console.log("Vehicle fetch error:", error?.response?.data || error);
        // A silent background sync failing shouldn't interrupt the user
        // with a popup — they're already looking at good cached data.
        if (!silent) {
          Alert.alert(
            "Error",
            error?.response?.data?.message || "Failed to fetch vehicles",
          );
        }
      } finally {
        if (myRequestId === requestIdRef.current) {
          setRefreshing(false);
          setLoadingMore(false);
          setSyncing(false);
        }
      }
    },
    [token, activeFilter, category, debouncedSearch],
  );

  // Cold app start only: if we don't already have a warm in-memory cache
  // (screenCache), fall back to the on-disk cache so the very first paint
  // of the app isn't a blank loader. Once screenCache is warm this is
  // skipped entirely.
  useEffect(() => {
    if (screenCache.hasLoadedOnce) return;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          setVehicles(parsed.vehicles || []);
          setStatsData(buildStatsData(parsed.stats));
          setHasPaintedOnce(true);
        }
      } catch {
        // ignore corrupt cache
      }
    })();
  }, []);

  // Fetch page 1 whenever the filter, category, or (debounced) search
  // changes — but on the very first run of this effect (i.e. this
  // mount), if we already have a warm cache for the exact same
  // filter/category/search, don't show a loader or reset anything: just
  // quietly re-sync in the background. This is what stops "leave the
  // screen, come back, everything reloads and jumps to the top".
  useEffect(() => {
    if (!token) return;

    if (isFirstLoadRun.current) {
      isFirstLoadRun.current = false;
      if (
        screenCache.hasLoadedOnce &&
        screenCache.activeFilter === activeFilter &&
        screenCache.category === category &&
        screenCache.debouncedSearch === debouncedSearch &&
        screenCache.vehicles.length > 0
      ) {
        fetchVehicles({ pageToLoad: 1, silent: true });
        return;
      }
    }

    fetchVehicles({ pageToLoad: 1 });
  }, [token, activeFilter, category, debouncedSearch, fetchVehicles]);

  // User-initiated filter/category/search changes should start that view
  // at the top — that's the one case where resetting scroll is correct
  // UX.
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false;
      return;
    }
    screenCache.scrollOffset = 0;
    hasRestoredScroll.current = true;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeFilter, category, debouncedSearch]);

  // Keep the module-level cache in sync with state so it's ready the
  // instant this component remounts.
  useEffect(() => {
    screenCache.vehicles = vehicles;
  }, [vehicles]);
  useEffect(() => {
    screenCache.statsData = statsData;
  }, [statsData]);
  useEffect(() => {
    screenCache.page = page;
  }, [page]);
  useEffect(() => {
    screenCache.hasMore = hasMore;
  }, [hasMore]);
  useEffect(() => {
    screenCache.activeFilter = activeFilter;
  }, [activeFilter]);
  useEffect(() => {
    screenCache.category = category;
  }, [category]);
  useEffect(() => {
    screenCache.search = search;
  }, [search]);
  useEffect(() => {
    screenCache.debouncedSearch = debouncedSearch;
  }, [debouncedSearch]);
  useEffect(() => {
    if (hasPaintedOnce) screenCache.hasLoadedOnce = true;
  }, [hasPaintedOnce]);

  // Track scroll position continuously so it's always current in the
  // cache, in case the component unmounts unexpectedly (e.g. navigating
  // away) without a clean "leaving" event.
  const handleScroll = (e) => {
    screenCache.scrollOffset = e.nativeEvent.contentOffset.y;
  };

  // Once the restored list has actually rendered content, jump straight
  // to where the user left off — only once per mount.
  const handleContentSizeChange = () => {
    if (
      !hasRestoredScroll.current &&
      screenCache.scrollOffset > 0 &&
      vehicles.length > 0
    ) {
      hasRestoredScroll.current = true;
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({
          offset: screenCache.scrollOffset,
          animated: false,
        });
      });
    }
  };

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchVehicles({ pageToLoad: page + 1, isLoadMore: true });
  };

  const onRefresh = useCallback(() => {
    fetchVehicles({ pageToLoad: 1, isRefresh: true });
  }, [fetchVehicles]);

  // Tapping a stat card applies that status as the active filter — tapping
  // the currently active one again resets back to "Total"/"All".
  const handleStatPress = (title) => {
    const filterKey = STAT_TITLE_TO_FILTER[title] || "All";
    setActiveFilter((prev) => (prev === filterKey ? "All" : filterKey));
    setMenuVisible(null);
  };

  // Selecting an option in the filter-icon dropdown applies that category
  // and closes the dropdown.
  const handleCategorySelect = (key) => {
    setCategory(key);
    setCategoryMenuVisible(false);
  };

  const handleDeleteVehicle = (vehicleId, vehicleName) => {
    Alert.alert(
      "Delete Vehicle",
      `Are you sure you want to delete ${vehicleName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingId(vehicleId);
              await api.delete(`/vehicles/delete/${vehicleId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });

              // Remove it from the list in place instead of re-fetching
              // page 1 from scratch — instant feedback, one fewer request.
              setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
              Alert.alert("Success", "Vehicle deleted successfully");
            } catch (error) {
              console.log("Delete error:", error?.response?.data || error);
              Alert.alert(
                "Error",
                error?.response?.data?.message || "Failed to delete vehicle",
              );
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  const renderVehicle = ({ item, index }) => {
    const s = statusConfig[item.status] || {
      bg: "#F3F4F6",
      text: "#6B7280",
      border: "#D1D5DB",
      label: item.status || "Unknown",
      dot: "#9CA3AF",
    };

    const isMenuOpen = menuVisible === item.id;

    return (
      <View
        style={[
          styles.vehicleCard,
          { marginTop: index === 0 ? 0 : 12 },
          isMenuOpen
            ? { zIndex: 50, elevation: 12 }
            : { zIndex: 1, elevation: 2 },
        ]}
      >
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: item.image }}
            style={styles.vehicleImage}
            resizeMode="cover"
          />
          <View style={styles.yearTag}>
            <Text style={styles.yearTagText}>{item.year}</Text>
          </View>
        </View>

        <View style={styles.cardCenter}>
          <Text style={styles.vehicleName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.plateRow}>
            <Ionicons name="card-outline" size={12} color="#2563EB" />
            <Text style={styles.plateText}>{item.plate}</Text>
          </View>
          <Text style={{ color: "#15803D", fontWeight: "700" }}>
            ₹ {item.pricePerDay.toLocaleString("en-IN")} / day
          </Text>
          <View style={styles.tagsRow}>
            <View style={styles.miniTag}>
              <MaterialCommunityIcons
                name={item.fuel === "Diesel" ? "fuel" : "gas-station"}
                size={11}
                color="#64748B"
              />
              <Text style={styles.miniTagText}>{item.fuel}</Text>
            </View>
            <View style={styles.miniTag}>
              <MaterialCommunityIcons
                name="car-shift-pattern"
                size={11}
                color="#64748B"
              />
              <Text style={styles.miniTagText}>{item.transmission}</Text>
            </View>
            <View style={styles.miniTag}>
              <Ionicons name="people-outline" size={11} color="#64748B" />
              <Text style={styles.miniTagText}>{item.seats}</Text>
            </View>
          </View>

          {item.customer && (
            <View style={styles.customerRow}>
              <Ionicons
                name={
                  item.status === "service"
                    ? "construct-outline"
                    : "person-circle-outline"
                }
                size={13}
                color="#94A3B8"
              />
              <Text style={styles.customerText} numberOfLines={1}>
                {item.customer}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardRight}>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: s.bg, borderColor: s.border },
            ]}
          >
            <View style={[styles.statusDot, { backgroundColor: s.dot }]} />
            <Text style={[styles.statusLabel, { color: s.text }]}>
              {s.label}
            </Text>
          </View>

          {item.till && (
            <View style={styles.tillRow}>
              <Ionicons name="calendar-outline" size={11} color="#94A3B8" />
              <Text style={styles.tillText}>{item.till}</Text>
            </View>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.iconAction}
              onPress={() => {
                setMenuVisible(null);
                router.push({
                  pathname: "/screens/EditVehicle",
                  params: { vehicleId: item.id },
                });
              }}
            >
              <Feather name="edit-2" size={14} color="#2563EB" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.iconAction,
                { backgroundColor: isMenuOpen ? "#FEE2E2" : "#EFF6FF" },
              ]}
              onPress={() => setMenuVisible(isMenuOpen ? null : item.id)}
            >
              <Feather
                name={isMenuOpen ? "x" : "more-vertical"}
                size={14}
                color={isMenuOpen ? "#EF4444" : "#94A3B8"}
              />
            </TouchableOpacity>
          </View>
        </View>

        {isMenuOpen && (
          <View style={styles.popupMenu}>
            <TouchableOpacity
              style={styles.popupItem}
              onPress={() => {
                setMenuVisible(null);
                handleDeleteVehicle(item.id, item.name);
              }}
            >
              {deletingId === item.id ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                  <Text style={styles.popupDeleteText}>Delete</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
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
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={22} color="white" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Fleet Manager</Text>
            <View style={styles.headerSubRow}>
              <Text style={styles.headerSub}>
                {statsData.find((s) => s.title === "Total")?.count ?? 0}{" "}
                vehicles total
              </Text>
              {syncing && (
                <ActivityIndicator
                  size="small"
                  color="rgba(255,255,255,0.6)"
                  style={{ marginLeft: 6 }}
                />
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.addBtn}
            activeOpacity={0.85}
            onPress={() => router.push("/screens/AddVehicles")}
          >
            <Ionicons name="add" size={18} color="#0A1628" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Stat cards double as filter buttons — tap one to filter the
            list below by that status. Tapping the active one again
            resets back to "Total" (all vehicles). */}
        <View style={styles.statsRow}>
          {statsData.map((item) => {
            const filterKey = STAT_TITLE_TO_FILTER[item.title] || "All";
            const isActive = activeFilter === filterKey;
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.8}
                onPress={() => handleStatPress(item.title)}
                style={[
                  styles.statCard,
                  isActive && [
                    styles.statCardActive,
                    { borderColor: item.accent },
                  ],
                ]}
              >
                <Text
                  style={[styles.statCount, isActive && { color: item.accent }]}
                >
                  {item.count}
                </Text>
                <Text
                  style={[styles.statLabel, isActive && styles.statLabelActive]}
                >
                  {item.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search vehicle or plate..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter icon now opens a dropdown to pick Car / Bike / All.
            Highlighted (blue) whenever a category is active so the user
            can see a filter is applied at a glance. */}
        <TouchableOpacity
          style={[
            styles.filterIconBtn,
            category !== "All" && styles.filterIconBtnActive,
          ]}
          onPress={() => setCategoryMenuVisible(true)}
        >
          <MaterialCommunityIcons
            name="tune-variant"
            size={20}
            color={category !== "All" ? "#2563EB" : "#0F2554"}
          />
          {category !== "All" && <View style={styles.filterActiveDot} />}
        </TouchableOpacity>
      </View>

      {/* Dropdown menu for the filter icon — tapping outside or an
          option closes it. Positioned to hang below the icon button. */}
      <Modal
        visible={categoryMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryMenuVisible(false)}
      >
        <Pressable
          style={styles.dropdownOverlay}
          onPress={() => setCategoryMenuVisible(false)}
        >
          <View style={styles.dropdownMenu}>
            <Text style={styles.dropdownTitle}>Filter by type</Text>
            {CATEGORY_OPTIONS.map((option) => {
              const isActive = category === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={styles.dropdownItem}
                  onPress={() => handleCategorySelect(option.key)}
                >
                  <MaterialCommunityIcons
                    name={option.icon}
                    size={18}
                    color={isActive ? "#2563EB" : "#64748B"}
                  />
                  <Text
                    style={[
                      styles.dropdownItemText,
                      isActive && styles.dropdownItemTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isActive && (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color="#2563EB"
                      style={{ marginLeft: "auto" }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* Active filter chips — status and/or category, each independently
          clearable. */}
      {(activeFilter !== "All" || category !== "All") && (
        <View style={styles.activeFilterRow}>
          {activeFilter !== "All" && (
            <View style={styles.activeFilterChip}>
              <Text style={styles.activeFilterChipText}>{activeFilter}</Text>
              <TouchableOpacity
                onPress={() => setActiveFilter("All")}
                hitSlop={8}
              >
                <Ionicons name="close" size={14} color="#0F2554" />
              </TouchableOpacity>
            </View>
          )}
          {category !== "All" && (
            <View style={styles.activeFilterChip}>
              <MaterialCommunityIcons
                name={category === "Car" ? "car" : "motorbike"}
                size={12}
                color="#0F2554"
              />
              <Text style={styles.activeFilterChipText}>{category}</Text>
              <TouchableOpacity onPress={() => setCategory("All")} hitSlop={8}>
                <Ionicons name="close" size={14} color="#0F2554" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {!hasPaintedOnce ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#0F2554" />
          <Text style={styles.loaderText}>Loading vehicles...</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={vehicles}
          keyExtractor={(item, index) =>
            item?.id ? item.id.toString() : `vehicle-${index}`
          }
          renderItem={renderVehicle}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={handleContentSizeChange}
          onEndReachedThreshold={0.4}
          onEndReached={handleLoadMore}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#0F2554" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="car-outline" size={52} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No vehicles found</Text>
              <Text style={styles.emptySubtitle}>
                {activeFilter !== "All" || category !== "All"
                  ? "No vehicles match your filters"
                  : "Try changing filters or search term"}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  header: {
    paddingTop: Platform.OS === "android" ? 44 : 12,
    paddingBottom: 20,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  headerSubRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  headerSub: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  addBtn: {
    backgroundColor: "#FCD34D",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addBtnText: { color: "#0A1628", fontSize: 14, fontWeight: "800" },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  statCardActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1.5,
  },
  statCount: {
    fontSize: 14,
    fontWeight: "800",
    color: "white",
    lineHeight: 26,
  },
  statLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.55)",
    marginTop: 3,
    fontWeight: "500",
  },
  statLabelActive: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "700",
  },
  searchSection: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    height: 48,
    backgroundColor: "white",
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#0F2554",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111827", fontWeight: "500" },
  filterIconBtn: {
    width: 48,
    height: 48,
    backgroundColor: "white",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0F2554",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  // NEW: highlighted state + small active-dot for the filter icon when a
  // category is applied.
  filterIconBtnActive: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#93C5FD",
  },
  filterActiveDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#2563EB",
  },
  // NEW: dropdown overlay + menu for the filter icon
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.25)",
  },
  dropdownMenu: {
    position: "absolute",
    top: Platform.OS === "android" ? 140 : 108,
    right: 16,
    backgroundColor: "white",
    borderRadius: 14,
    paddingVertical: 8,
    minWidth: 190,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  dropdownTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 14,
    paddingBottom: 6,
    paddingTop: 2,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownItemText: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "#334155",
  },
  dropdownItemTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
  activeFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  activeFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
  },
  activeFilterChipText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0F2554",
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 110, marginTop: 10 },
  vehicleCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    shadowColor: "#0F2554",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    gap: 12,
    position: "relative",
  },
  imageWrap: { position: "relative" },
  vehicleImage: {
    width: 86,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  yearTag: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(15,37,84,0.75)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  yearTagText: { color: "white", fontSize: 10, fontWeight: "700" },
  cardCenter: { flex: 1, gap: 5 },
  vehicleName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 0.1,
  },
  plateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  plateText: {
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  tagsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  miniTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  miniTagText: { fontSize: 11, color: "#475569", fontWeight: "600" },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  customerText: { fontSize: 12, color: "#64748B", fontWeight: "500", flex: 1 },
  cardRight: { alignItems: "flex-end", gap: 8 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 12, fontWeight: "700" },
  tillRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  tillText: { fontSize: 11, color: "#94A3B8", fontWeight: "500" },
  actionRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  iconAction: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#334155",
    marginTop: 8,
  },
  emptySubtitle: { fontSize: 14, color: "#94A3B8" },
  popupMenu: {
    position: "absolute",
    top: 84,
    right: 14,
    backgroundColor: "white",
    borderRadius: 10,
    paddingVertical: 4,
    minWidth: 120,
    zIndex: 100,
    elevation: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  popupItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  popupDeleteText: {
    marginLeft: 6,
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "700",
  },
  loaderContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loaderText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
  },
});
