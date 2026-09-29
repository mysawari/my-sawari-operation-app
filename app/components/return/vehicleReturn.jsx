import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../../../services/api";
import useAuthStore from "../../../store/authStore";

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
const COLORS = {
  bg: "#F5F6FA",
  surface: "#FFFFFF",
  navy: "#111827",
  navySoft: "#1F2937",
  border: "#E7E9EE",
  textPrimary: "#111827",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  teal: "#0E9384",
  tealSoft: "#E4F6F3",
  amber: "#B45309",
  amberSoft: "#FEF3C7",
  red: "#B91C1C",
  redSoft: "#FEE2E2",
  green: "#15803D",
  greenSoft: "#DCFCE7",
  blue: "#1D4ED8",
  blueSoft: "#DBEAFE",
  skeleton: "#EEF0F4",
};

const PAGE_SIZE = 15;
const SEARCH_DEBOUNCE_MS = 300;
const CACHE_KEY_PREFIX = "vehicle_returns_dashboard_cache_v2:"; // per-tab cache

// Scroll offsets are keyed by tab (no search) or "tab::query" (searching),
// so a search list and the normal list never overwrite each other.
const scrollPositionCache = {};
const scrollKey = (tab, q) => (q ? `${tab}::${q}` : tab);

let lastActiveTabCache = "Today";
let lastSearchCache = ""; // survives this screen unmounting (e.g. opening detail)

// tab -> { returns, stats }. ONLY holds the un-searched list per tab.
const memoryCache = {};

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------
const compact = (s) => s.replace(/[\s\-_.]/g, "");

// Every word typed must match somewhere in the row (order doesn't matter).
// Plates are also matched ignoring spaces/dashes, so "as01ab1234" finds
// "AS-01 AB 1234".
const matchesSearch = (item, query) => {
  const hay = [
    item.vehicleName,
    item.manufacturer,
    item.model,
    item.variant,
    item.vehicleNumber,
    item.customerName,
    item.mobileNumber,
    item.receivedBy,
    item.handoverId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const hayCompact = compact(hay);

  return query
    .split(/\s+/)
    .filter(Boolean)
    .every(
      (token) => hay.includes(token) || hayCompact.includes(compact(token)),
    );
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
const Badge = ({ label, tone = "teal", icon }) => {
  const toneMap = {
    teal: { bg: COLORS.tealSoft, fg: COLORS.teal },
    amber: { bg: COLORS.amberSoft, fg: COLORS.amber },
    red: { bg: COLORS.redSoft, fg: COLORS.red },
    green: { bg: COLORS.greenSoft, fg: COLORS.green },
    blue: { bg: COLORS.blueSoft, fg: COLORS.blue },
  };
  const c = toneMap[tone] || toneMap.teal;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      {icon ? (
        <Ionicons
          name={icon}
          size={11}
          color={c.fg}
          style={{ marginRight: 4 }}
        />
      ) : null}
      <Text style={[styles.badgeText, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const StatPill = ({ label, value, active, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    style={[styles.statPill, active && styles.statPillActive]}
  >
    <Text style={[styles.statValue, active && styles.statValueActive]}>
      {value}
    </Text>
    <Text style={[styles.statLabel, active && styles.statLabelActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const formatTime = (iso) => {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "--";
  }
};

const formatDate = (iso) => {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "--";
  }
};

const currency = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// ---------------------------------------------------------------------------
// Return Card
// ---------------------------------------------------------------------------
const ReturnCard = ({ item, onPress }) => {
  const vehicleTitle =
    item.vehicleName ||
    [item.manufacturer, item.model, item.variant].filter(Boolean).join(" ") ||
    "Vehicle";

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress(item)}
      style={styles.card}
    >
      <View
        style={[
          styles.cardAccent,
          { backgroundColor: item.isDue ? COLORS.amber : COLORS.teal },
        ]}
      />

      <View style={styles.cardBody}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.vehicleTitle} numberOfLines={1}>
              {vehicleTitle}
            </Text>
            <Text style={styles.vehicleSub} numberOfLines={1}>
              {item.customerName || "Unknown customer"}
              {item.mobileNumber ? ` • ${item.mobileNumber}` : ""}
            </Text>
          </View>

          <View style={styles.plateChip}>
            <Text style={styles.plateChipText}>
              {item.vehicleNumber || "—"}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
            <Text style={styles.metaText}>
              {formatDate(item.returnTime || item.createdAt)} •{" "}
              {formatTime(item.returnTime || item.createdAt)}
            </Text>
          </View>

          {item.kilometersAtReturn != null && (
            <View style={styles.metaItem}>
              <MaterialCommunityIcons
                name="speedometer"
                size={13}
                color={COLORS.textMuted}
              />
              <Text style={styles.metaText}>{item.kilometersAtReturn} km</Text>
            </View>
          )}

          {item.fuelLevel != null && (
            <View style={styles.metaItem}>
              <Ionicons
                name="water-outline"
                size={13}
                color={COLORS.textMuted}
              />
              <Text style={styles.metaText}>{item.fuelLevel}% fuel</Text>
            </View>
          )}
        </View>

        <View style={styles.badgeRow}>
          <Badge
            label={item.tab}
            tone={
              item.tab === "Today"
                ? "green"
                : item.tab === "Yesterday"
                  ? "blue"
                  : "teal"
            }
            icon="calendar-outline"
          />

          {item.hasDamage ? (
            <Badge label="Damage reported" tone="red" icon="warning-outline" />
          ) : null}

          {item.timeStatus === "delayed" || item.delayText ? (
            <Badge
              label={item.delayText || "Delayed"}
              tone="amber"
              icon="alert-circle-outline"
            />
          ) : null}

          {item.isDue ? (
            <Badge
              label={`Due ${currency(item.finalBalance || item.pendingAmount)}`}
              tone="amber"
              icon="cash-outline"
            />
          ) : (
            <Badge
              label="Settled"
              tone="green"
              icon="checkmark-circle-outline"
            />
          )}
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.receivedByText} numberOfLines={1}>
            {item.receivedBy ? `Received by ${item.receivedBy}` : ""}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// Skeleton card — shown instead of a blank spinner while the very first
// page loads and there's no cache yet, so the screen never feels frozen.
// ---------------------------------------------------------------------------
const SkeletonCard = () => (
  <View style={[styles.card, { opacity: 1 }]}>
    <View style={[styles.cardAccent, { backgroundColor: COLORS.skeleton }]} />
    <View style={styles.cardBody}>
      <View
        style={{
          height: 15,
          width: "55%",
          backgroundColor: COLORS.skeleton,
          borderRadius: 4,
        }}
      />
      <View
        style={{
          height: 11,
          width: "40%",
          backgroundColor: COLORS.skeleton,
          borderRadius: 4,
          marginTop: 8,
        }}
      />
      <View
        style={{
          height: 11,
          width: "70%",
          backgroundColor: COLORS.skeleton,
          borderRadius: 4,
          marginTop: 14,
        }}
      />
    </View>
  </View>
);

const SkeletonList = () => (
  <View style={styles.listContent}>
    {Array.from({ length: 6 }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </View>
);

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
const EmptyState = ({ tab, search, searching }) => {
  if (searching) {
    return (
      <View style={styles.emptyWrap}>
        <ActivityIndicator size="small" color={COLORS.teal} />
        <Text style={styles.emptySub}>Searching…</Text>
      </View>
    );
  }

  if (search) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="search-outline" size={40} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>No matches found</Text>
        <Text style={styles.emptySub}>
          {`Nothing in "${tab}" matches "${search}". Try a different name, plate or phone number, or switch to the "All" tab.`}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyWrap}>
      <MaterialCommunityIcons
        name="car-off"
        size={40}
        color={COLORS.textMuted}
      />
      <Text style={styles.emptyTitle}>No returns here</Text>
      <Text style={styles.emptySub}>
        {tab === "Due"
          ? "Nothing pending settlement right now."
          : `No vehicle returns found for "${tab}".`}
      </Text>
    </View>
  );
};

const ListFooter = ({ visible }) => {
  if (!visible) return <View style={{ height: 12 }} />;
  return (
    <View style={styles.footerLoading}>
      <ActivityIndicator size="small" color={COLORS.teal} />
      <Text style={styles.footerLoadingText}>Loading more…</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export default function VehicleReturnsDashboardScreen() {
  const router = useRouter();
  const { token } = useAuthStore();

  // Read the in-memory cache synchronously at construction time — if this
  // screen was previously mounted this session, its last-known tab data
  // is already here, so the very first render shows real content instead
  // of a skeleton that flips to content a tick later.
  const [returns, setReturns] = useState(
    () => memoryCache[lastActiveTabCache]?.returns || [],
  );
  const [stats, setStats] = useState(
    () =>
      memoryCache[lastActiveTabCache]?.stats || {
        total: 0,
        today: 0,
        yesterday: 0,
        due: 0,
      },
  );
  const [activeTab, setActiveTab] = useState(lastActiveTabCache);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // hasCacheOrData: true once we have *something* to show (from cache or
  // network) — controls whether we show skeletons or the real list.
  const [hasCacheOrData, setHasCacheOrData] = useState(
    () => !!memoryCache[lastActiveTabCache],
  );
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // ---- Search state ----
  // searchInput: what's typed (instant). searchQuery: debounced value that
  // actually goes to the server.
  const [searchInput, setSearchInput] = useState(lastSearchCache);
  const [searchQuery, setSearchQuery] = useState(lastSearchCache);
  const [searching, setSearching] = useState(false);
  const searchQueryRef = useRef(lastSearchCache);
  const isFirstSearchEffect = useRef(true);

  const flatListRef = useRef(null);
  // Live scroll offset for the currently mounted instance. Kept in sync
  // with scrollPositionCache on every scroll event.
  const scrollOffsetRef = useRef(0);
  const requestIdRef = useRef(0); // guards against stale/out-of-order responses

  // Holds a scroll offset that still needs to be applied once the list
  // actually has rows to scroll through. Set by the focus-restore logic,
  // cleared once successfully applied (either immediately, or later via
  // onContentSizeChange once data arrives).
  const pendingRestoreOffsetRef = useRef(null);

  // ---- Core fetch: always server-paginated, always tab-scoped ----------
  // `search` defaults to the current debounced query; pass it explicitly
  // when the query has just changed.
  const fetchPage = useCallback(
    async ({
      tab,
      pageToLoad,
      isRefresh = false,
      isLoadMore = false,
      search,
    }) => {
      const myRequestId = ++requestIdRef.current;
      const q = (search ?? searchQueryRef.current ?? "").trim();

      try {
        if (isRefresh) setRefreshing(true);
        else if (isLoadMore) setLoadingMore(true);
        else if (q) setSearching(true);

        setError(null);

        const storageToken = await AsyncStorage.getItem("token");
        const authToken = token || storageToken;

        const res = await api.get("/vehicle-return/dashboard", {
          params: {
            page: pageToLoad,
            limit: PAGE_SIZE,
            tab,
            ...(q ? { search: q } : {}),
          },
          headers: { Authorization: `Bearer ${authToken}` },
        });

        // If the user switched tabs / changed the search while this was in
        // flight, drop the stale response instead of flashing wrong data.
        if (myRequestId !== requestIdRef.current) return;

        if (res.data?.success) {
          const newRows = res.data.returns || [];
          const newStats = res.data.stats || {
            total: 0,
            today: 0,
            yesterday: 0,
            due: 0,
          };

          setStats(newStats);
          setHasMore(!!res.data.hasMore);
          setPage(pageToLoad);
          setReturns((prev) =>
            pageToLoad === 1 ? newRows : [...prev, ...newRows],
          );
          setHasCacheOrData(true);

          // Only the normal (un-searched) list is cached — search results
          // are too varied and would pollute the tab's cache.
          if (pageToLoad === 1 && !q) {
            memoryCache[tab] = { returns: newRows, stats: newStats };
            AsyncStorage.setItem(
              CACHE_KEY_PREFIX + tab,
              JSON.stringify({ returns: newRows, stats: newStats }),
            ).catch(() => {});
          }
        } else {
          setError(res.data?.message || "Failed to load returns");
        }
      } catch (err) {
        if (myRequestId !== requestIdRef.current) return;
        setError(
          err?.response?.data?.message || err.message || "Something went wrong",
        );
      } finally {
        if (myRequestId === requestIdRef.current) {
          setRefreshing(false);
          setLoadingMore(false);
          setSearching(false);
        }
      }
    },
    [token],
  );

  // ---- Instant paint from cache, then silently refresh from network ----
  // Runs once per mount. Prefers the synchronous in-memory cache (instant,
  // no flash); falls back to AsyncStorage only when memory is cold (first
  // mount this session, or after an app restart). Either way, uses
  // activeTab's own cache/fetch (not a hardcoded "All") so it stays
  // consistent with whatever tab is actually showing — this matters on
  // remount too, e.g. if the screen was unmounted while the detail screen
  // was on top and is now being recreated from scratch.
  useEffect(() => {
    (async () => {
      if (memoryCache[activeTab]) {
        setReturns(memoryCache[activeTab].returns || []);
        setStats(
          memoryCache[activeTab].stats || {
            total: 0,
            today: 0,
            yesterday: 0,
            due: 0,
          },
        );
        setHasCacheOrData(true);
      } else {
        try {
          const cached = await AsyncStorage.getItem(
            CACHE_KEY_PREFIX + activeTab,
          );
          if (cached) {
            const parsed = JSON.parse(cached);
            setReturns(parsed.returns || []);
            setStats(
              parsed.stats || { total: 0, today: 0, yesterday: 0, due: 0 },
            );
            setHasCacheOrData(true); // paint immediately, before network resolves
          }
        } catch {
          // ignore corrupt cache
        }
      }
      fetchPage({ tab: activeTab, pageToLoad: 1 });
    })();
    // Intentionally run only on mount — activeTab changes are handled by
    // handleTabChange, not by re-running this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the in-memory cache in sync with whatever's on screen, so the
  // next mount (this session) can read it synchronously. Skipped while a
  // search is active so search results never overwrite the tab's cache.
  useEffect(() => {
    if (searchQueryRef.current) return;
    memoryCache[activeTab] = { returns, stats };
  }, [activeTab, returns, stats]);

  // ---- Debounce the typed text into the query that hits the server ----
  useEffect(() => {
    const t = setTimeout(
      () => setSearchQuery(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [searchInput]);

  // ---- Debounced query changed: refetch page 1 with the new search ----
  useEffect(() => {
    if (isFirstSearchEffect.current) {
      isFirstSearchEffect.current = false;
      return;
    }

    searchQueryRef.current = searchQuery;
    lastSearchCache = searchQuery;

    // New search (or cleared search) always starts at the top.
    scrollOffsetRef.current = 0;
    pendingRestoreOffsetRef.current = null;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });

    // Search cleared → instantly bring back the tab's normal cached list.
    if (!searchQuery && memoryCache[activeTab]) {
      setReturns(memoryCache[activeTab].returns || []);
      setStats(memoryCache[activeTab].stats || stats);
      setHasCacheOrData(true);
    }

    fetchPage({ tab: activeTab, pageToLoad: 1, search: searchQuery });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useFocusEffect(
    useCallback(() => {
      const savedOffset =
        scrollPositionCache[scrollKey(activeTab, searchQueryRef.current)] || 0;
      if (savedOffset <= 0) return;

      pendingRestoreOffsetRef.current = savedOffset;

      const raf = requestAnimationFrame(() => {
        if (pendingRestoreOffsetRef.current == null) return;
        flatListRef.current?.scrollToOffset({
          offset: pendingRestoreOffsetRef.current,
          animated: false,
        });
        pendingRestoreOffsetRef.current = null;
      });

      return () => {
        cancelAnimationFrame(raf);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]),
  );

  const handleContentSizeChange = () => {
    if (pendingRestoreOffsetRef.current == null || returns.length === 0) {
      return;
    }
    const offset = pendingRestoreOffsetRef.current;
    pendingRestoreOffsetRef.current = null;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({ offset, animated: false });
    });
  };

  const handleCardPress = (item) => {
    if (!item?.handoverId) {
      console.warn("Handover ID not found.");
      return;
    }
    router.push({
      pathname: "./detail",
      params: {
        handoverId: item.handoverId,
        vehicleReturnId: item.vehicleReturnId || item._id,
      },
    });
  };

  const handleTabChange = async (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    lastActiveTabCache = tab; // remember for the next remount

    // Switching tabs deliberately should start fresh at the top —
    // only "back from detail" should restore a previous position.
    const activeSearch = searchQueryRef.current;
    scrollOffsetRef.current = 0;
    scrollPositionCache[scrollKey(tab, activeSearch)] = 0;
    pendingRestoreOffsetRef.current = null;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });

    if (activeSearch) {
      // Searching: no per-tab cache for search results — show skeleton
      // briefly and load this tab's matches.
      setReturns([]);
      setHasCacheOrData(false);
    } else if (memoryCache[tab]) {
      // Instant paint from that tab's own cache (memory first, then disk)
      // while the fresh page loads in the background.
      setReturns(memoryCache[tab].returns || []);
      setStats(memoryCache[tab].stats || stats);
      setHasCacheOrData(true);
    } else {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY_PREFIX + tab);
        if (cached) {
          const parsed = JSON.parse(cached);
          setReturns(parsed.returns || []);
          setStats(parsed.stats || stats);
          setHasCacheOrData(true);
        } else {
          setReturns([]); // no cache for this tab — show skeleton briefly
          setHasCacheOrData(false);
        }
      } catch {
        setReturns([]);
      }
    }

    fetchPage({ tab, pageToLoad: 1 });
  };

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    fetchPage({ tab: activeTab, pageToLoad: page + 1, isLoadMore: true });
  }, [loadingMore, hasMore, activeTab, page, fetchPage]);

  const handleRefresh = () => {
    fetchPage({ tab: activeTab, pageToLoad: 1, isRefresh: true });
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearchQuery(""); // clear immediately, don't wait for the debounce
  };

  // Instant, on-device filtering of whatever rows are already loaded —
  // results react to every keystroke, while the debounced server search
  // catches up in the background and brings in matches from pages that
  // haven't been loaded yet.
  const liveQuery = searchInput.trim().toLowerCase();
  const visibleReturns = useMemo(
    () =>
      liveQuery ? returns.filter((r) => matchesSearch(r, liveQuery)) : returns,
    [returns, liveQuery],
  );

  const showSkeleton = !hasCacheOrData && !error;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Vehicle Returns</Text>
          <Text style={styles.headerSubtitle}>
            {stats.total} total • {stats.due} pending settlement
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={handleRefresh}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={18} color={COLORS.navy} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search vehicle, plate, customer or phone"
            placeholderTextColor={COLORS.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {searching ? (
            <ActivityIndicator size="small" color={COLORS.teal} />
          ) : searchInput.length > 0 ? (
            <TouchableOpacity
              onPress={handleClearSearch}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {liveQuery ? (
          <Text style={styles.searchMeta}>
            {visibleReturns.length}{" "}
            {visibleReturns.length === 1 ? "result" : "results"} in {activeTab}
            {hasMore ? " (scroll for more)" : ""}
          </Text>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <StatPill
          label="All"
          value={stats.total}
          active={activeTab === "All"}
          onPress={() => handleTabChange("All")}
        />
        <StatPill
          label="Today"
          value={stats.today}
          active={activeTab === "Today"}
          onPress={() => handleTabChange("Today")}
        />
        <StatPill
          label="Yesterday"
          value={stats.yesterday}
          active={activeTab === "Yesterday"}
          onPress={() => handleTabChange("Yesterday")}
        />
        <StatPill
          label="Due"
          value={stats.due}
          active={activeTab === "Due"}
          onPress={() => handleTabChange("Due")}
        />
      </View>

      {showSkeleton ? (
        <SkeletonList />
      ) : error && returns.length === 0 ? (
        <View style={styles.centerFill}>
          <Ionicons
            name="cloud-offline-outline"
            size={36}
            color={COLORS.textMuted}
          />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => fetchPage({ tab: activeTab, pageToLoad: 1 })}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={visibleReturns}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <ReturnCard item={item} onPress={handleCardPress} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <EmptyState
              tab={activeTab}
              search={searchInput.trim()}
              searching={searching}
            />
          }
          onScroll={(e) => {
            const offset = e.nativeEvent.contentOffset.y;
            scrollOffsetRef.current = offset;
            // Persist to the module-level cache so it survives this
            // screen unmounting while the detail screen is on top.
            scrollPositionCache[scrollKey(activeTab, searchQueryRef.current)] =
              offset;
          }}
          scrollEventThrottle={16}
          onContentSizeChange={handleContentSizeChange}
          onEndReachedThreshold={0.4}
          onEndReached={handleLoadMore}
          ListFooterComponent={<ListFooter visible={loadingMore} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.teal]}
              tintColor={COLORS.teal}
            />
          }
          // ---- FlatList perf tuning ----
          // Renders fewer off-screen cards up front and recycles rows
          // further off-screen, which keeps scroll smooth as the list
          // grows across pages instead of degrading over time.
          initialNumToRender={PAGE_SIZE}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
          updateCellsBatchingPeriod={50}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "android" ? 12 : 4,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.navy,
    letterSpacing: -0.3,
  },
  headerSubtitle: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Search
  searchSection: {
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  searchMeta: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
    marginTop: 6,
    marginLeft: 4,
  },

  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    marginBottom: 6,
    gap: 8,
  },
  statPill: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statPillActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  statValue: { fontSize: 16, fontWeight: "700", color: COLORS.navy },
  statValueActive: { color: "#FFFFFF" },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  statLabelActive: { color: "#D1D5DB" },

  listContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 24 },

  card: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  vehicleTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  vehicleSub: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  plateChip: {
    backgroundColor: COLORS.navy,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  plateChipText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: COLORS.textSecondary },

  badgeRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    maxWidth: 180,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  receivedByText: { fontSize: 11.5, color: COLORS.textMuted },

  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  errorText: {
    marginTop: 10,
    fontSize: 13.5,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 14,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },

  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },

  footerLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  footerLoadingText: { fontSize: 12.5, color: COLORS.textSecondary },
});
