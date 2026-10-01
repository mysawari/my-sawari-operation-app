import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { usePathname, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../services/api";

const { width } = Dimensions.get("window");

// ==========================================
// SERVER-SIDE PAGINATION + CACHE-FIRST RENDERING
// ==========================================
// Data is fetched a page at a time from the backend, which now does ALL
// of the filtering/sorting/bucketing/pagination in a Mongo aggregation
// (see booking-dashboard-controller.js) instead of pulling the whole
// collection into Node on every request. The client's job is:
//   (1) show whatever it already has, instantly
//   (2) silently reconcile with the network in the background
//   (3) get AHEAD of the network before the user needs it:
//       - read-ahead: as soon as page N lands, page N+1 is quietly
//         fetched into cache so "load more" almost never shows a
//         spinner — it's already there by the time you scroll to it.
//       - idle tab prefetch: once the active tab's first page has
//         painted, the other tabs' first pages are fetched one at a
//         time in the background (staggered, so it never competes with
//         anything the user is actively waiting on). Switching tabs
//         then reads from cache instead of hitting the network at all.
//
// Two layers of cache:
//   - `memoryCache` (module scope): survives this screen unmounting while
//     the app stays alive (tab switches, navigating to details and back).
//   - AsyncStorage: survives a full app kill, so a cold start can still
//     paint the last-seen list before the first network response arrives.
//
// DATE RANGE FILTER (client-side only)
// ==========================================
// The backend endpoint (`/leads/booking`) is intentionally left untouched
// beyond its internal pagination/filtering rewrite. The "From date / To
// date" filter below is applied entirely on the device, on top of
// whatever pages have already been fetched for the active tab/search.
// ==========================================
const PAGE_SIZE = 20;
const DISK_CACHE_KEY = "bookings_screen_cache_v1";
const SEARCH_DEBOUNCE_MS = 250;

// Safety cap on how many cards we'll force-render on mount when there is
// NO specific scroll-restore target — protects against an extreme case
// (hundreds of cached bookings) forcing a huge synchronous first paint.
const MAX_INITIAL_RENDER = 100;

// Higher cap used ONLY when we know exactly which card we need to land
// on (returning from the details/edit screen).
const MAX_RESTORE_RENDER = 400;

// How long to wait after a page lands before quietly fetching the next
// one. Short enough to beat the user's scroll, long enough to not
// compete with the request that's still finishing / rendering.
const READ_AHEAD_DELAY_MS = 400;

// Stagger between background tab-prefetch requests, so a slow network
// doesn't get seven parallel requests fired at once.
const TAB_PREFETCH_STAGGER_MS = 600;

const ALL_TABS = [
  "All",
  "Pending",
  "Today's Pickup",
  "Tomorrow's Pickup",
  "Upcoming",
  "Active Rental",
  "Completed",
  "Cancelled",
];

const buildCacheKey = (tab, search) => `${tab}::${search.trim().toLowerCase()}`;

const memoryCache = {
  byKey: {}, // cacheKey -> { bookings, stats, hasMore, page, fetchedAt }
  searchInput: "",
  searchQuery: "",
  activeTab: "Today's Pickup",
  visibleItemId: null,
  // Guards so read-ahead / tab-prefetch never fire more than once for
  // the same cache key, even if effects re-run.
  readAheadInFlight: {}, // cacheKey -> true while a background page-2 fetch is running
  tabsPrefetched: false, // whether the idle all-tabs prefetch has already run this session
};

let persistTimer = null;
const persistCacheToDisk = () => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const key = buildCacheKey(memoryCache.activeTab, memoryCache.searchQuery);
    const entry = memoryCache.byKey[key];
    const slim = {
      searchInput: memoryCache.searchInput,
      searchQuery: memoryCache.searchQuery,
      activeTab: memoryCache.activeTab,
      visibleItemId: memoryCache.visibleItemId,
      lastKey: key,
      lastEntry: entry
        ? {
            bookings: entry.bookings.slice(0, PAGE_SIZE),
            stats: entry.stats,
            hasMore: entry.hasMore,
            page: 1,
          }
        : null,
    };
    AsyncStorage.setItem(DISK_CACHE_KEY, JSON.stringify(slim)).catch(() => {});
  }, 150);
};

let hydrationPromise = null;
const hydrateCacheFromDisk = () => {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = AsyncStorage.getItem(DISK_CACHE_KEY)
    .then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (
        parsed.lastKey &&
        parsed.lastEntry &&
        !memoryCache.byKey[parsed.lastKey]
      ) {
        memoryCache.byKey[parsed.lastKey] = parsed.lastEntry;
      }
      if (memoryCache.fetchedAt == null) {
        memoryCache.searchInput = parsed.searchInput ?? memoryCache.searchInput;
        memoryCache.searchQuery = parsed.searchQuery ?? memoryCache.searchQuery;
        memoryCache.activeTab = parsed.activeTab ?? memoryCache.activeTab;
        memoryCache.visibleItemId =
          parsed.visibleItemId ?? memoryCache.visibleItemId;
      }
    })
    .catch(() => {});
  return hydrationPromise;
};

const clearAllCacheEntries = () => {
  memoryCache.byKey = {};
  memoryCache.readAheadInFlight = {};
  memoryCache.tabsPrefetched = false;
};

const fetchBookingsPageFromApi = ({ tab, search, page }) =>
  api
    .get("/leads/booking", { params: { tab, search, page, limit: PAGE_SIZE } })
    .then((res) => res.data);

// Writes a fetched page straight into the cache without touching any
// component state — used by both read-ahead and tab-prefetch so
// background fetches never fight with whatever the visible screen is
// currently rendering.
const fetchIntoCacheOnly = async (tab, search, page, { append } = {}) => {
  const key = buildCacheKey(tab, search);
  try {
    const data = await fetchBookingsPageFromApi({ tab, search, page });
    if (!data?.success) return;

    const normalized = Array.isArray(data.bookings)
      ? data.bookings.map(normalizeBooking)
      : [];
    const prevEntry = memoryCache.byKey[key];
    const merged =
      append && prevEntry ? [...prevEntry.bookings, ...normalized] : normalized;

    memoryCache.byKey[key] = {
      bookings: merged,
      stats: data.stats || prevEntry?.stats || {},
      hasMore: !!data.pagination?.hasMore,
      page,
      fetchedAt: Date.now(),
    };
    persistCacheToDisk();
  } catch (e) {
    // Silent — this is a speculative background fetch, not a
    // user-facing request. The normal foreground fetch will retry and
    // surface any real error if the user actually navigates there.
  }
};

// ==========================================
// 1. PREMIUM THEME CONFIGURATION
// ==========================================
const THEME = {
  primary: "#0F172A",
  secondary: "#2563EB",
  accent: "#3B82F6",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#DC2626",
  background: "#F8FAFC",
  card: "#FFFFFF",
  border: "#E2E8F0",
  textMuted: "#64748B",
  textDark: "#0F172A",
  glass: "rgba(255, 255, 255, 0.8)",
};

const STATUS_CONFIG = {
  "Booking Confirmed": { color: THEME.success, bg: "#DCFCE7" },
  "Today's Pickup": { color: THEME.secondary, bg: "#DBEAFE" },
  "Tomorrow's Pickup": { color: THEME.warning, bg: "#FEF3C7" },
  "Pending Handover": { color: "#7C3AED", bg: "#F3E8FF" },
  "Active Rental": { color: "#0D9488", bg: "#CCFB17" },
  Completed: { color: "#475569", bg: "#E2E8F0" },
  Cancelled: { color: THEME.danger, bg: "#FEE2E2" },
};

const normalizeBooking = (lead = {}) => ({
  ...lead,
  id: String(lead._id ?? lead.leadId ?? Math.random()),
  phone: lead.mobileNumber ?? "",
  vehicle:
    lead.vehicleName?.trim() ||
    lead.booking?.vehicleName ||
    lead.vehicleType ||
    "",
  destination: lead.destination || lead.booking?.destination || "",
  pickupDate: lead.pickupDate,
  dropDate: lead.dropDate,
  fromDate: lead.fromDate,
  toDate: lead.toDate,
  pickupTime: lead.pickupTime || "08:00 AM",
  dropTime: lead.dropTime || "08:00 AM",
  tripDays: lead.tripDays ?? 1,
  totalDays: lead.totalDays ?? lead.tripDays ?? 1,
  residents: lead.residents ?? 1,
  quotationAmount: lead.quotationAmount ?? 0,
  priority: lead.priority ?? "medium",
  source: lead.source ?? "",
  leadOwner: lead.leadOwner ?? "",
  status: lead.status ?? "Booking Confirmed",
  handoverCompleted: !!lead.handoverCompleted,
  alternateMobileNumber:
    lead.alternateMobileNumber || lead.booking?.alternateMobileNumber || "",
  occupation: lead.occupation || lead.booking?.occupation || "",
  aadhaarNumber: lead.aadhaarNumber || lead.booking?.aadhaarNumber || "",
  drivingLicenseNumber:
    lead.drivingLicenseNumber || lead.booking?.drivingLicenseNumber || "",
  tripType: lead.tripType || lead.booking?.tripType || "outstation",
  vehicleId: lead.vehicleId || lead.booking?.vehicleId || "",
  vehicleName: lead.vehicleName || lead.booking?.vehicleName || "",
  vehicleNumber: lead.vehicleNumber || lead.booking?.vehicleNumber || "",
  vehicleColor: lead.vehicleColor || lead.booking?.vehicleColor || "",
  handoverKm: lead.handoverKm || lead.booking?.handoverKm || "",
  bookingAmount: lead.bookingAmount || lead.booking?.bookingAmount || 0,
  discountAmount: lead.discountAmount || lead.booking?.discountAmount || 0,
  pickupDropRequired: lead.pickupDropRequired ?? false,
  serviceType: lead.serviceType ?? "",
  assignedDriver: lead.assignedDriver || lead.booking?.assignedDriver || null,
  createdBy: lead.createdBy?.name || lead.booking?.createdBy?.name || "",
  createdAt: lead.createdAt || lead.booking?.createdAt || null,
  pickup: lead.pickup || { charge: 0 },
  drop: lead.drop || { charge: 0 },
  pickupLocationDisplay:
    (lead.pickup?.location || lead.pickup?.address || "").trim() || "Office",
  dropLocationDisplay:
    (lead.drop?.location || lead.drop?.address || "").trim() || "Office",
  // Vehicle change history — an array of { fromVehicle, toVehicle,
  // changedByName, changedAt, note } objects returned by the dashboard
  // controller. Always an array, even if the backend omits it.
  vehicleHistory: Array.isArray(lead.vehicleHistory) ? lead.vehicleHistory : [],
});

const formatCompactDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  const options = {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const parts = new Intl.DateTimeFormat("en-IN", options).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
};

const formatFilterDate = (date) => {
  if (!date) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const toDateOnly = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// ==========================================
// 3. HIGH-DENSITY COMPACT BOOKING CARD
// ==========================================
const BookingCard = memo(
  function BookingCard({
    item,
    onCall,
    onNavigate,
    onHandover,
    onViewBooking,
    onMenuPress,
  }) {
    const [historyVisible, setHistoryVisible] = useState(false);

    const statusStyle = STATUS_CONFIG[item.status] || {
      color: THEME.primary,
      bg: THEME.border,
    };
    const isUrgentStage =
      item.status === "Today's Pickup" || item.status === "Pending Handover";

    const isActiveRental = item.status === "Active Rental";
    const isCompleted = item.status === "Completed";
    const showViewBooking = isActiveRental || isCompleted;

    const navLocation = isActiveRental ? item.drop : item.pickup;
    const canNavigate =
      !!(navLocation?.latitude && navLocation?.longitude) ||
      !!navLocation?.address ||
      !!item.destination;

    const handlePrimaryPress = () => {
      if (item.status === "Cancelled") return;
      if (showViewBooking) {
        onViewBooking(item);
      } else {
        onHandover(item);
      }
    };

    return (
      <View style={styles.bookingCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.customerName} numberOfLines={1}>
            {item.customerName}
          </Text>
          <View style={styles.headerRightGroup}>
            <View
              style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}
            >
              <Text style={[styles.statusText, { color: statusStyle.color }]}>
                {item.status}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => onMenuPress(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={16}
                color={THEME.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.vehicleSection}>
          <View style={styles.vehicleInfoLeft}>
            <Ionicons
              name="car-sport-sharp"
              size={14}
              color={THEME.accent}
              style={styles.sectionIcon}
            />
            <Text style={styles.vehicleName} numberOfLines={1}>
              {item.vehicle || "Vehicle TBD"}
            </Text>
            <Text style={styles.bulletSeparator}>•</Text>
            <Text style={styles.residentsText}>{item.residents} Person</Text>
          </View>

          {!!item.destination && (
            <Text style={styles.destinationText} numberOfLines={1}>
              <Ionicons
                name="location-outline"
                size={11}
                color={THEME.textMuted}
              />{" "}
              {item.destination}
            </Text>
          )}
        </View>

        <View style={styles.locationPairRow}>
          <View style={styles.locationHalf}>
            <Ionicons
              name="location-outline"
              size={11}
              color={THEME.secondary}
              style={styles.sectionIcon}
            />
            <Text style={styles.locationHalfText} numberOfLines={1}>
              Pickup: {item.pickupLocationDisplay}
            </Text>
          </View>

          <View style={styles.locationHalf}>
            <Ionicons
              name="flag-outline"
              size={11}
              color={THEME.success}
              style={styles.sectionIcon}
            />
            <Text style={styles.locationHalfText} numberOfLines={1}>
              Drop: {item.dropLocationDisplay}
            </Text>
          </View>
        </View>

        {!!item.assignedDriver?.fullName && (
          <View style={styles.driverBadge}>
            <Ionicons
              name="person-circle"
              size={13}
              color="#B45309"
              style={styles.sectionIcon}
            />
            <Text style={styles.driverBadgeText} numberOfLines={1}>
              Driver: {item.assignedDriver.fullName}
            </Text>
          </View>
        )}

        <View style={styles.timelineContainer}>
          <View style={styles.timeBlock}>
            <Text style={styles.timeLabel}>PICKUP</Text>
            <Text style={styles.timeValue}>
              {new Date(item.fromDate).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
              , {item.pickupTime}
            </Text>
          </View>

          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{item.tripDays}d</Text>
          </View>

          <View style={[styles.timeBlock, { alignItems: "flex-end" }]}>
            <Text style={styles.timeLabel}>RETURN</Text>
            <Text style={styles.timeValue}>
              {new Date(item.toDate).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
              , {item.dropTime}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.communicationButtons}>
            <TouchableOpacity
              style={styles.secondaryCardButton}
              onPress={() => onCall(item)}
            >
              <Ionicons name="call" size={14} color={THEME.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.vehicleHistoryButton}
              onPress={() => setHistoryVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="time-outline" size={13} color="#7C3AED" />
              <Text style={styles.vehicleHistoryButtonText}>
                Vehicle History
              </Text>
              {!!item.vehicleHistory?.length && (
                <View style={styles.vehicleHistoryCountBadge}>
                  <Text style={styles.vehicleHistoryCountText}>
                    {item.vehicleHistory.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {item.status !== "Cancelled" && (
            <TouchableOpacity
              style={[
                styles.primaryHandoverButton,
                showViewBooking && styles.primaryViewBookingButton,
                !isUrgentStage &&
                  !showViewBooking && { backgroundColor: THEME.primary },
              ]}
              onPress={handlePrimaryPress}
            >
              <Text style={styles.primaryHandoverButtonText}>
                {showViewBooking ? "View Booking" : "Start Handover"}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        {(item.createdBy || item.createdAt) && (
          <View style={styles.createdByRow}>
            <Ionicons
              name="person-outline"
              size={10}
              color={THEME.textMuted}
              style={styles.sectionIcon}
            />
            <Text style={styles.createdByText} numberOfLines={1}>
              {item.createdBy ? `${item.createdBy}` : "Created"}
              {item.createdAt
                ? ` · ${formatCompactDateTime(item.createdAt)}`
                : ""}
            </Text>
          </View>
        )}

        {/* ── Vehicle Change History Popup ── */}
        <Modal
          visible={historyVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setHistoryVisible(false)}
        >
          <View style={styles.historyOverlay}>
            {/* Backdrop: tap outside to close */}
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setHistoryVisible(false)}
            />

            {/* Card is a plain View, so it no longer steals scroll gestures */}
            <View style={styles.historyModalCard}>
              <View style={styles.historyModalHeader}>
                <Text style={styles.historyModalTitle}>
                  Vehicle Change History
                </Text>
                <TouchableOpacity
                  onPress={() => setHistoryVisible(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              {!item.vehicleHistory?.length ? (
                <View style={styles.historyEmptyState}>
                  <Ionicons name="car-outline" size={36} color="#CBD5E1" />
                  <Text style={styles.historyEmptyText}>
                    No vehicle changes recorded yet.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={[...item.vehicleHistory].reverse()}
                  keyExtractor={(_, idx) => String(idx)}
                  style={styles.historyList}
                  contentContainerStyle={styles.historyListContent}
                  showsVerticalScrollIndicator
                  persistentScrollbar
                  nestedScrollEnabled
                  bounces
                  ItemSeparatorComponent={() => (
                    <View style={styles.historyItemSeparator} />
                  )}
                  renderItem={({ item: h }) => (
                    <View style={styles.historyRow}>
                      <View style={styles.historyVehicleBlock}>
                        <View style={styles.historyVehicleTag}>
                          <Text style={styles.historyVehicleTagLabel}>
                            FROM
                          </Text>
                        </View>
                        <View style={styles.historyVehicleTextWrap}>
                          <Text style={styles.historyFromText}>
                            {h.fromVehicle?.vehicleName || "Unknown"}
                          </Text>
                          {!!h.fromVehicle?.vehicleNumber && (
                            <Text style={styles.historyVehicleNumberText}>
                              {h.fromVehicle.vehicleNumber}
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={styles.historyArrowRow}>
                        <Ionicons name="arrow-down" size={14} color="#94A3B8" />
                      </View>

                      <View style={styles.historyVehicleBlock}>
                        <View
                          style={[
                            styles.historyVehicleTag,
                            styles.historyVehicleTagTo,
                          ]}
                        >
                          <Text
                            style={[
                              styles.historyVehicleTagLabel,
                              styles.historyVehicleTagLabelTo,
                            ]}
                          >
                            TO
                          </Text>
                        </View>
                        <View style={styles.historyVehicleTextWrap}>
                          <Text style={styles.historyToText}>
                            {h.toVehicle?.vehicleName || "Unknown"}
                          </Text>
                          {!!h.toVehicle?.vehicleNumber && (
                            <Text style={styles.historyVehicleNumberText}>
                              {h.toVehicle.vehicleNumber}
                            </Text>
                          )}
                        </View>
                      </View>

                      <Text style={styles.historyMetaText}>
                        {h.changedByName ? `By ${h.changedByName} · ` : ""}
                        {h.changedAt ? formatCompactDateTime(h.changedAt) : ""}
                      </Text>
                    </View>
                  )}
                />
              )}

              <TouchableOpacity
                style={styles.historyCloseButton}
                onPress={() => setHistoryVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.historyCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  },
  (prevProps, nextProps) =>
    prevProps.item === nextProps.item &&
    prevProps.item.status === nextProps.item.status,
);

const SkeletonCard = () => (
  <View style={[styles.bookingCard, styles.skeletonCard]}>
    <View style={styles.cardHeader}>
      <View style={[styles.skeletonLine, { width: "45%" }]} />
      <View style={[styles.skeletonLine, { width: 60, height: 16 }]} />
    </View>
    <View style={[styles.skeletonLine, { width: "70%", marginTop: 10 }]} />
    <View style={[styles.skeletonLine, { width: "55%", marginTop: 8 }]} />
    <View style={[styles.skeletonBlock, { marginTop: 10 }]} />
  </View>
);

const SkeletonList = () => (
  <View style={styles.scrollContainer}>
    {Array.from({ length: 6 }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </View>
);

// ==========================================
// 4. MAIN SCREEN IMPLEMENTATION
// ==========================================
export default function BookingScreen() {
  const router = useRouter();
  const pathname = usePathname();

  const [searchInput, setSearchInput] = useState(memoryCache.searchInput);
  const [searchQuery, setSearchQuery] = useState(memoryCache.searchQuery);
  const searchDebounceRef = useRef(null);

  const [activeTab, setActiveTab] = useState(memoryCache.activeTab);

  const initialKey = buildCacheKey(
    memoryCache.activeTab,
    memoryCache.searchQuery,
  );
  const initialEntry = memoryCache.byKey[initialKey];

  const [bookings, setBookings] = useState(initialEntry?.bookings || []);
  const [stats, setStats] = useState(initialEntry?.stats || {});
  const [hasMore, setHasMore] = useState(initialEntry?.hasMore ?? true);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(!initialEntry);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [assigningDriver, setAssigningDriver] = useState(false);

  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const [dateFilterModalVisible, setDateFilterModalVisible] = useState(false);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [tempDateFrom, setTempDateFrom] = useState(null);
  const [tempDateTo, setTempDateTo] = useState(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const flatListRef = useRef(null);

  const targetItemIdRef = useRef(memoryCache.visibleItemId || null);
  const restoreDoneRef = useRef(!memoryCache.visibleItemId);
  const restoreAttemptsRef = useRef(0);

  const activeTabRef = useRef(activeTab);
  const searchQueryRef = useRef(searchQuery);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  const tabs = ALL_TABS;

  // ---- Disk hydration ----
  useEffect(() => {
    let alive = true;
    hydrateCacheFromDisk().then(() => {
      if (!alive) return;
      setIsHydrated(true);

      const key = buildCacheKey(activeTabRef.current, searchQueryRef.current);
      const cached = memoryCache.byKey[key];
      if (cached) {
        setBookings(cached.bookings);
        setStats(cached.stats);
        setHasMore(cached.hasMore);
        setLoading(false);
      }
      if (memoryCache.activeTab !== activeTabRef.current) {
        setActiveTab(memoryCache.activeTab);
      }
      if (memoryCache.searchInput !== searchInput) {
        setSearchInput(memoryCache.searchInput);
      }
      if (memoryCache.searchQuery !== searchQueryRef.current) {
        setSearchQuery(memoryCache.searchQuery);
      }
      if (memoryCache.visibleItemId && !targetItemIdRef.current) {
        targetItemIdRef.current = memoryCache.visibleItemId;
        restoreDoneRef.current = false;
        restoreAttemptsRef.current = 0;
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Search debounce ----
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchInput]);

  useEffect(() => {
    memoryCache.searchInput = searchInput;
    persistCacheToDisk();
  }, [searchInput]);

  useEffect(() => {
    memoryCache.searchQuery = searchQuery;
    persistCacheToDisk();
  }, [searchQuery]);

  useEffect(() => {
    memoryCache.activeTab = activeTab;
    persistCacheToDisk();
  }, [activeTab]);

  // ---- Core paged fetch (foreground — updates UI state) ----
  const loadPage = useCallback(async (tab, search, page, opts = {}) => {
    const { append = false, silent = false } = opts;
    const key = buildCacheKey(tab, search);

    if (!silent) setLoading(true);
    if (append) setLoadingMore(true);
    setLoadError(null);

    try {
      const data = await fetchBookingsPageFromApi({ tab, search, page });
      const isStillCurrent =
        activeTabRef.current === tab && searchQueryRef.current === search;

      if (data?.success) {
        const normalized = Array.isArray(data.bookings)
          ? data.bookings.map(normalizeBooking)
          : [];
        const prevEntry = memoryCache.byKey[key];
        const merged =
          append && prevEntry
            ? [...prevEntry.bookings, ...normalized]
            : normalized;

        memoryCache.byKey[key] = {
          bookings: merged,
          stats: data.stats || {},
          hasMore: !!data.pagination?.hasMore,
          page,
          fetchedAt: Date.now(),
        };
        persistCacheToDisk();

        if (isStillCurrent) {
          setBookings(merged);
          setStats(data.stats || {});
          setHasMore(!!data.pagination?.hasMore);

          // ---- READ-AHEAD ----
          // The first page just landed and rendered. Quietly fetch page 2
          // now, before the user has scrolled anywhere near the end, so
          // by the time onEndReached fires the data is already sitting
          // in cache and loadMore feels instant instead of spinning.
          if (
            !append &&
            data.pagination?.hasMore &&
            !memoryCache.readAheadInFlight[key]
          ) {
            memoryCache.readAheadInFlight[key] = true;
            setTimeout(() => {
              fetchIntoCacheOnly(tab, search, 2, { append: true }).finally(
                () => {
                  delete memoryCache.readAheadInFlight[key];
                  // If the user is still on this exact tab/search when the
                  // read-ahead lands, surface it immediately instead of
                  // waiting for a real onEndReached-triggered fetch.
                  if (
                    activeTabRef.current === tab &&
                    searchQueryRef.current === search
                  ) {
                    const fresh = memoryCache.byKey[key];
                    if (fresh) {
                      setBookings(fresh.bookings);
                      setHasMore(fresh.hasMore);
                    }
                  }
                },
              );
            }, READ_AHEAD_DELAY_MS);
          }
        }
      } else if (isStillCurrent) {
        setLoadError(data?.message || "Failed to fetch bookings.");
      }
    } catch (error) {
      if (activeTabRef.current === tab && searchQueryRef.current === search) {
        setLoadError("Network error. Pull down to refresh.");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  // ---- Refetch page 1 whenever tab or (debounced) search changes ----
  useEffect(() => {
    const key = buildCacheKey(activeTab, searchQuery);
    const cached = memoryCache.byKey[key];

    if (cached) {
      setBookings(cached.bookings);
      setStats(cached.stats);
      setHasMore(cached.hasMore);
      setLoading(false);
    } else {
      setBookings([]);
      setHasMore(true);
      setLoading(true);
    }

    loadPage(activeTab, searchQuery, 1, { append: false, silent: !!cached });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, searchQuery]);

  // ---- IDLE TAB PREFETCH ----
  // Once the active tab has painted, warm up the other tabs' first pages
  // in the background (only for the no-search case — searches are too
  // varied to speculatively prefetch). Staggered so it never competes
  // with a request the user is actually waiting on.
  useEffect(() => {
    if (memoryCache.tabsPrefetched) return;
    if (loading) return;
    if (searchQuery) return; // don't prefetch while a search is active

    memoryCache.tabsPrefetched = true;

    const otherTabs = ALL_TABS.filter((t) => t !== activeTab);
    otherTabs.forEach((tab, i) => {
      const key = buildCacheKey(tab, "");
      if (memoryCache.byKey[key]) return; // already cached, skip
      setTimeout(
        () => {
          fetchIntoCacheOnly(tab, "", 1);
        },
        TAB_PREFETCH_STAGGER_MS * (i + 1),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, activeTab, searchQuery]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const key = buildCacheKey(activeTab, searchQuery);
    const nextPage = (memoryCache.byKey[key]?.page || 1) + 1;
    loadPage(activeTab, searchQuery, nextPage, { append: true, silent: true });
  }, [activeTab, searchQuery, hasMore, loading, loadingMore, loadPage]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPage(activeTab, searchQuery, 1, { append: false, silent: true });
  }, [activeTab, searchQuery, loadPage]);

  // Any mutation (assign driver / cancel) invalidates all cached pages.
  // This also resets `tabsPrefetched` (via clearAllCacheEntries) so the
  // idle prefetch re-runs and other tabs' counts/lists reflect the change.
  const invalidateAndRefresh = useCallback(() => {
    clearAllCacheEntries();
    loadPage(activeTab, searchQuery, 1, { append: false, silent: true });
  }, [activeTab, searchQuery, loadPage]);

  const fetchDrivers = useCallback(async () => {
    try {
      setLoadingDrivers(true);
      const res = await api.get("/bookings/drivers");
      if (res.data.success) {
        setDrivers(res.data.data);
        if (selectedBooking?.assignedDriver?._id) {
          setSelectedDriver(selectedBooking.assignedDriver._id);
        } else {
          setSelectedDriver(null);
        }
      } else {
        Alert.alert("Error", res.data.message || "Unable to load drivers.");
      }
    } catch (err) {
      Alert.alert(
        "Error",
        err?.response?.data?.message || "Unable to load drivers.",
      );
    } finally {
      setLoadingDrivers(false);
    }
  }, [selectedBooking]);

  const handleTabChange = useCallback(
    (tab) => {
      setActiveTab(tab);
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      memoryCache.visibleItemId = null;
      targetItemIdRef.current = null;
      restoreDoneRef.current = true;
      restoreAttemptsRef.current = 0;

      fadeAnim.setValue(0.7);
      slideAnim.setValue(8);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [fadeAnim, slideAnim],
  );

  const handleAssignDriverAction = async () => {
    setActionSheetVisible(false);
    await fetchDrivers();
    setDriverModalVisible(true);
  };

  const assignDriver = async () => {
    if (!selectedDriver) {
      return Alert.alert("Select Driver");
    }
    try {
      setAssigningDriver(true);
      const bookingId = selectedBooking._id || selectedBooking.id;
      const res = await api.put(`/bookings/${bookingId}/assign-driver`, {
        driverId: selectedDriver,
      });
      if (res.data.success) {
        Alert.alert("Success", "Driver assigned successfully.");
        setDriverModalVisible(false);
        invalidateAndRefresh();
      }
    } catch (err) {
      Alert.alert(
        "Error",
        err?.response?.data?.message || "Unable to assign driver.",
      );
    } finally {
      setAssigningDriver(false);
    }
  };

  const handleBookingDetails = useCallback(
    (booking) => {
      memoryCache.visibleItemId = booking.id;
      persistCacheToDisk();
      router.push({
        pathname: "../menu/booking/booking-details",
        params: { id: booking._id || booking.id, returnTo: pathname },
      });
    },
    [router, pathname],
  );

  const handleEditBooking = useCallback(
    (booking) => {
      memoryCache.visibleItemId = booking.id;
      persistCacheToDisk();
      router.push({
        pathname: "../menu/booking/booking-details",
        params: {
          id: booking._id || booking.id,
          mode: "edit",
          returnTo: pathname,
        },
      });
    },
    [router, pathname],
  );

  const handleViewBooking = useCallback(
    (booking) => {
      memoryCache.visibleItemId = booking.id;
      persistCacheToDisk();
      router.push({
        pathname: "/menu/booking/details",
        params: { id: booking._id || booking.id, returnTo: pathname },
      });
    },
    [router, pathname],
  );

  const handleStartHandover = (booking) => {
    memoryCache.visibleItemId = booking.id;
    persistCacheToDisk();
    router.push({
      pathname: "/screens/NewBooking",
      params: { booking: JSON.stringify(booking) },
    });
  };

  const handleCall = useCallback(async (item) => {
    if (!item?.phone) {
      return Alert.alert(
        "Missing Contact",
        "No phone number linked to this record.",
      );
    }
    const phone = item.phone.replace(/[^\d+]/g, "");
    const url = `tel:${phone}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Error", "Phone calls are not supported on this device.");
      }
    } catch (error) {
      Alert.alert("Error", "Unable to initiate the call.");
    }
  }, []);

  const handleNavigate = useCallback(async (item) => {
    const isActiveRental = item.status === "Active Rental";
    const location = isActiveRental ? item.drop : item.pickup;

    let query = "";
    if (location?.latitude && location?.longitude) {
      query = `${location.latitude},${location.longitude}`;
    } else if (location?.address) {
      query = location.address;
    } else if (item.destination) {
      query = item.destination;
    }

    if (!query) {
      return Alert.alert(
        "Location Unavailable",
        "No navigation details found for this booking.",
      );
    }

    const encodedQuery = encodeURIComponent(query);
    const label = encodeURIComponent(
      isActiveRental ? "Drop Location" : "Pickup Location",
    );

    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${encodedQuery}`,
      android: `geo:0,0?q=${encodedQuery}(${label})`,
    });
    const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;

    try {
      const supported = await Linking.canOpenURL(url);
      await Linking.openURL(supported ? url : fallbackUrl);
    } catch (error) {
      Alert.alert("Error", "Unable to open navigation.");
    }
  }, []);

  const handleResetSearch = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
    setDateFrom(null);
    setDateTo(null);
    setTempDateFrom(null);
    setTempDateTo(null);
  }, []);

  const openActionSheet = useCallback((item) => {
    setSelectedBooking(item);
    setActionSheetVisible(true);
  }, []);

  const closeActionSheet = useCallback(() => {
    setActionSheetVisible(false);
    setSelectedBooking(null);
  }, []);

  const handleViewDetailsAction = useCallback(() => {
    if (!selectedBooking) return;
    const booking = selectedBooking;
    closeActionSheet();
    handleBookingDetails(booking);
  }, [selectedBooking, closeActionSheet, handleBookingDetails]);

  const handleEditAction = useCallback(() => {
    if (!selectedBooking) return;
    const booking = selectedBooking;
    closeActionSheet();
    handleEditBooking(booking);
  }, [selectedBooking, closeActionSheet, handleEditBooking]);

  const performCancelBooking = useCallback(
    async (booking) => {
      const bookingId = booking._id || booking.id;
      setCancelling(true);
      try {
        await api.put(`/leads/${bookingId}/cancel`, {});
        setBookings((prev) =>
          prev.map((b) =>
            b.id === booking.id ? { ...b, status: "Cancelled" } : b,
          ),
        );
        Alert.alert("Success", "Booking cancelled successfully.");
        invalidateAndRefresh();
      } catch (error) {
        console.log("Cancel booking error:", error?.response?.data?.message || error?.message);
        Alert.alert(
          "Error",
          error?.response?.data?.message || "Unable to cancel booking.",
        );
      } finally {
        setCancelling(false);
      }
    },
    [invalidateAndRefresh],
  );

  const handleCancelAction = useCallback(() => {
    if (!selectedBooking) return;
    const booking = selectedBooking;
    closeActionSheet();

    Alert.alert(
      "Cancel Booking",
      `Are you sure you want to cancel ${booking.customerName || "this"} booking?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: () => performCancelBooking(booking),
        },
      ],
    );
  }, [selectedBooking, closeActionSheet, performCancelBooking]);

  // ==========================================
  // DATE RANGE FILTER HANDLERS (client-side)
  // ==========================================
  const openDateFilter = useCallback(() => {
    setTempDateFrom(dateFrom);
    setTempDateTo(dateTo);
    setDateFilterModalVisible(true);
  }, [dateFrom, dateTo]);

  const closeDateFilterModal = useCallback(() => {
    setShowFromPicker(false);
    setShowToPicker(false);
    setDateFilterModalVisible(false);
  }, []);

  const onChangeFromDate = useCallback(
    (event, selectedDate) => {
      if (Platform.OS === "android") setShowFromPicker(false);
      if (event?.type === "dismissed" || !selectedDate) return;
      const picked = toDateOnly(selectedDate);
      setTempDateFrom(picked);
      if (tempDateTo && picked && tempDateTo < picked) {
        setTempDateTo(null);
      }
    },
    [tempDateTo],
  );

  const onChangeToDate = useCallback((event, selectedDate) => {
    if (Platform.OS === "android") setShowToPicker(false);
    if (event?.type === "dismissed" || !selectedDate) return;
    setTempDateTo(toDateOnly(selectedDate));
  }, []);

  const applyDateFilter = useCallback(() => {
    setDateFrom(tempDateFrom);
    setDateTo(tempDateTo);
    closeDateFilterModal();
  }, [tempDateFrom, tempDateTo, closeDateFilterModal]);

  const clearDateFilterInModal = useCallback(() => {
    setTempDateFrom(null);
    setTempDateTo(null);
  }, []);

  const clearAppliedDateFilter = useCallback(() => {
    setDateFrom(null);
    setDateTo(null);
    setTempDateFrom(null);
    setTempDateTo(null);
  }, []);

  const isDateFilterActive = !!(dateFrom || dateTo);

  const filteredBookings = useMemo(() => {
    if (!dateFrom && !dateTo) return bookings;
    return bookings.filter((item) => {
      const pickup = toDateOnly(item.fromDate);
      if (!pickup) return false;
      if (dateFrom && pickup < dateFrom) return false;
      if (dateTo && pickup > dateTo) return false;
      return true;
    });
  }, [bookings, dateFrom, dateTo]);

  // ---- Scroll position persistence + restore (ID-BASED) ----
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 20,
    minimumViewTime: 100,
  }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (!viewableItems || viewableItems.length === 0) return;
    const topItem = viewableItems[0]?.item;
    if (!topItem?.id) return;

    memoryCache.visibleItemId = topItem.id;

    if (!restoreDoneRef.current && topItem.id === targetItemIdRef.current) {
      restoreDoneRef.current = true;
    }
  }).current;

  const handleContentSizeChange = useCallback(() => {
    if (restoreDoneRef.current) return;

    const targetId = targetItemIdRef.current;
    if (!targetId) {
      restoreDoneRef.current = true;
      return;
    }

    if (restoreAttemptsRef.current >= 6) {
      restoreDoneRef.current = true;
      return;
    }
    restoreAttemptsRef.current += 1;

    const index = filteredBookings.findIndex((b) => b.id === targetId);
    if (index < 0) {
      restoreDoneRef.current = true;
      return;
    }

    requestAnimationFrame(() => {
      try {
        flatListRef.current?.scrollToIndex({
          index,
          animated: false,
          viewPosition: 0,
        });
      } catch (e) {
        // Swallowed — onScrollToIndexFailed below handles the case where
        // the index hasn't been measured yet.
      }
    });
  }, [filteredBookings]);

  const handleScrollToIndexFailed = useCallback((info) => {
    const estimatedOffset = (info.averageItemLength || 160) * info.index;

    flatListRef.current?.scrollToOffset({
      offset: estimatedOffset,
      animated: false,
    });

    setTimeout(() => {
      if (restoreDoneRef.current) return;
      try {
        flatListRef.current?.scrollToIndex({
          index: info.index,
          animated: false,
          viewPosition: 0,
        });
      } catch (e) {
        // If it fails again, handleContentSizeChange's own retry loop
        // (and this handler firing again) will keep nudging it.
      }
    }, 120);
  }, []);

  const keyExtractor = useCallback((item) => item.id, []);
  const renderItem = useCallback(
    ({ item }) => (
      <BookingCard
        item={item}
        onCall={handleCall}
        onHandover={handleStartHandover}
        onViewBooking={handleViewBooking}
        onNavigate={handleNavigate}
        onMenuPress={openActionSheet}
      />
    ),
    [handleCall, handleNavigate, handleViewBooking, openActionSheet],
  );

  const ListFooter = useCallback(() => {
    if (!hasMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={THEME.secondary} />
        <Text style={styles.footerLoaderText}>Loading more...</Text>
      </View>
    );
  }, [hasMore]);

  const initialNumToRender = useMemo(() => {
    const base = Math.min(
      Math.max(filteredBookings.length, PAGE_SIZE),
      MAX_INITIAL_RENDER,
    );

    if (!restoreDoneRef.current && targetItemIdRef.current) {
      const targetIndex = filteredBookings.findIndex(
        (b) => b.id === targetItemIdRef.current,
      );
      if (targetIndex >= 0) {
        return Math.min(
          Math.max(targetIndex + PAGE_SIZE, base),
          filteredBookings.length,
          MAX_RESTORE_RENDER,
        );
      }
    }

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBookings]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={THEME.background} />

      <View style={styles.stickyHeader}>
        <View style={styles.searchRow}>
          <View style={styles.searchWrapper}>
            <Ionicons
              name="search"
              size={18}
              color={THEME.textMuted}
              style={{ marginRight: 8 }}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search bookings..."
              placeholderTextColor={THEME.textMuted}
              value={searchInput}
              onChangeText={setSearchInput}
              clearButtonMode="while-editing"
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.filterIconButton,
              isDateFilterActive && styles.filterIconButtonActive,
            ]}
            activeOpacity={0.8}
            onPress={openDateFilter}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={isDateFilterActive ? "#FFFFFF" : THEME.primary}
            />
            {isDateFilterActive && <View style={styles.filterActiveDot} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.newBookingButton}
            activeOpacity={0.85}
            onPress={() => router.push("/menu/lead/NewBooking")}
          >
            <View style={styles.newBookingIcon}>
              <Ionicons name="add" size={16} color="#2563EB" />
            </View>
            <Text style={styles.newBookingButtonText}>New Booking</Text>
          </TouchableOpacity>
        </View>

        {isDateFilterActive && (
          <View style={styles.filterChipRow}>
            <View style={styles.filterChip}>
              <Ionicons name="calendar" size={12} color={THEME.secondary} />
              <Text style={styles.filterChipText} numberOfLines={1}>
                {dateFrom ? formatFilterDate(dateFrom) : "Any"}
                {"  →  "}
                {dateTo ? formatFilterDate(dateTo) : "Any"}
              </Text>
              <TouchableOpacity
                onPress={clearAppliedDateFilter}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons
                  name="close-circle"
                  size={14}
                  color={THEME.secondary}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.tabsOuterWrapper}>
          <FlatList
            horizontal
            data={tabs}
            keyExtractor={(tab) => tab}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsWrapper}
            renderItem={({ item: tab }) => {
              const isSelected = activeTab === tab;
              return (
                <TouchableOpacity
                  style={[
                    styles.tabButton,
                    isSelected && styles.activeTabButton,
                  ]}
                  onPress={() => handleTabChange(tab)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.tabButtonText,
                      isSelected && styles.activeTabButtonText,
                    ]}
                  >
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>

      {loading ? (
        <SkeletonList />
      ) : (
        <Animated.View
          style={[
            styles.listFlexWrapper,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {loadError && (
            <View style={styles.errorBanner}>
              <Ionicons
                name="alert-circle-outline"
                size={14}
                color={THEME.danger}
              />
              <Text style={styles.errorBannerText}>{loadError}</Text>
            </View>
          )}

          <FlatList
            ref={flatListRef}
            data={filteredBookings}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContainer}
            initialNumToRender={initialNumToRender}
            maxToRenderPerBatch={PAGE_SIZE}
            windowSize={11}
            removeClippedSubviews={Platform.OS === "android"}
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            onContentSizeChange={handleContentSizeChange}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            ListFooterComponent={ListFooter}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons
                  name="file-search-outline"
                  size={48}
                  color={THEME.textMuted}
                />
                <Text style={styles.emptyTitle}>
                  {isDateFilterActive && bookings.length > 0
                    ? "No Bookings In This Range"
                    : "No Results Found"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {isDateFilterActive && bookings.length > 0
                    ? "Try widening the pickup date range."
                    : "Refine your search metrics or change active tab."}
                </Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={handleResetSearch}
                >
                  <Text style={styles.emptyButtonText}>Clear Filters</Text>
                </TouchableOpacity>
              </View>
            }
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        </Animated.View>
      )}

      <Modal
        visible={dateFilterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDateFilterModal}
      >
        <TouchableOpacity
          style={styles.actionSheetOverlay}
          activeOpacity={1}
          onPress={closeDateFilterModal}
        >
          <TouchableOpacity
            style={styles.actionSheetContainer}
            activeOpacity={1}
            onPress={() => {}}
          >
            <View style={styles.actionSheetHeader}>
              <Text style={styles.actionSheetTitle}>Filter by Pickup Date</Text>
              <Text style={styles.actionSheetSubtitle}>
                Show bookings picking up within a date range
              </Text>
            </View>

            <View style={styles.dateFieldsRow}>
              <TouchableOpacity
                style={styles.dateFieldButton}
                onPress={() => {
                  setShowToPicker(false);
                  setShowFromPicker(true);
                }}
              >
                <Text style={styles.dateFieldLabel}>From Date</Text>
                <View style={styles.dateFieldValueRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={THEME.secondary}
                  />
                  <Text style={styles.dateFieldValue}>
                    {tempDateFrom ? formatFilterDate(tempDateFrom) : "Select"}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.dateFieldsArrow}>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color={THEME.textMuted}
                />
              </View>

              <TouchableOpacity
                style={styles.dateFieldButton}
                onPress={() => {
                  setShowFromPicker(false);
                  setShowToPicker(true);
                }}
              >
                <Text style={styles.dateFieldLabel}>To Date</Text>
                <View style={styles.dateFieldValueRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={THEME.secondary}
                  />
                  <Text style={styles.dateFieldValue}>
                    {tempDateTo ? formatFilterDate(tempDateTo) : "Select"}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {showFromPicker && (
              <DateTimePicker
                value={tempDateFrom || new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                onValueChange={onChangeFromDate}
                onDismiss={() => setShowFromPicker(false)}
                maximumDate={tempDateTo || undefined}
              />
            )}

            {showToPicker && (
              <DateTimePicker
                value={tempDateTo || tempDateFrom || new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                onValueChange={onChangeToDate}
                onDismiss={() => setShowToPicker(false)}
                minimumDate={tempDateFrom || undefined}
              />
            )}

            <View style={styles.dateFilterActionsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={clearDateFilterInModal}
              >
                <Text>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.assignBtn}
                onPress={applyDateFilter}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  Apply Filter
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.actionSheetCancelButton}
              onPress={closeDateFilterModal}
            >
              <Text style={styles.actionSheetCancelText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={actionSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={closeActionSheet}
      >
        <TouchableOpacity
          style={styles.actionSheetOverlay}
          activeOpacity={1}
          onPress={closeActionSheet}
        >
          <TouchableOpacity
            style={styles.actionSheetContainer}
            activeOpacity={1}
            onPress={() => {}}
          >
            {!!selectedBooking && (
              <View style={styles.actionSheetHeader}>
                <Text style={styles.actionSheetTitle} numberOfLines={1}>
                  {selectedBooking.customerName}
                </Text>
                <Text style={styles.actionSheetSubtitle} numberOfLines={1}>
                  {selectedBooking.vehicle || "Vehicle TBD"}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={handleAssignDriverAction}
            >
              <Ionicons
                name="person-add-outline"
                size={20}
                color={THEME.secondary}
              />
              <Text style={styles.actionSheetOptionText}>Assign Driver</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={handleViewDetailsAction}
            >
              <Ionicons name="eye-outline" size={20} color={THEME.textDark} />
              <Text style={styles.actionSheetOptionText}>
                View Details and edit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={handleCancelAction}
              disabled={cancelling}
            >
              <Ionicons
                name="close-circle-outline"
                size={20}
                color={THEME.danger}
              />
              <Text
                style={[styles.actionSheetOptionText, styles.destructiveText]}
              >
                {cancelling ? "Cancelling..." : "Cancel Booking"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetCancelButton}
              onPress={closeActionSheet}
            >
              <Text style={styles.actionSheetCancelText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={driverModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.driverModal}>
            <Text style={styles.driverTitle}>Assign Driver</Text>

            {loadingDrivers ? (
              <ActivityIndicator />
            ) : (
              <FlatList
                data={drivers}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.driverItem,
                      selectedDriver === item._id && styles.driverSelected,
                    ]}
                    onPress={() => setSelectedDriver(item._id)}
                  >
                    <Ionicons
                      name={
                        selectedDriver === item._id
                          ? "radio-button-on"
                          : "radio-button-off"
                      }
                      size={20}
                      color={THEME.secondary}
                    />
                    <View style={{ marginLeft: 10 }}>
                      <Text style={styles.driverName}>{item.fullName}</Text>
                      <Text style={styles.driverPhone}>
                        {item.mobileNumber}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}

            <View style={{ flexDirection: "row", marginTop: 15 }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setDriverModalVisible(false)}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.assignBtn} onPress={assignDriver}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {assigningDriver ? "Assigning..." : "Assign Driver"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==========================================
// 5. HIGH-DENSITY UI STYLESHEET
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  stickyHeader: {
    backgroundColor: THEME.card,
    paddingTop: Platform.OS === "ios" ? 4 : 8,
    borderBottomWidth: 1,
    borderColor: THEME.border,
    zIndex: 10,
  },
  listFlexWrapper: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  loadingText: { fontSize: 12, fontWeight: "500", color: THEME.textMuted },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 14,
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
  },
  errorBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: THEME.danger,
  },
  scrollContainer: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 24 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginVertical: 8,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: THEME.background,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: THEME.border,
  },
  searchIcon: { marginRight: 6 },
  filterIconButton: {
    width: 44,
    height: 44,
    marginLeft: 8,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  filterIconButtonActive: {
    backgroundColor: THEME.secondary,
    borderColor: THEME.secondary,
  },
  filterActiveDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FEF3C7",
  },
  filterChipRow: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginBottom: 6,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    maxWidth: "100%",
  },
  filterChipText: { fontSize: 11, fontWeight: "700", color: THEME.secondary },
  dateFieldsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 4,
    gap: 8,
  },
  dateFieldsArrow: { paddingTop: 14 },
  dateFieldButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: THEME.background,
  },
  dateFieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: THEME.textMuted,
    letterSpacing: 0.2,
  },
  dateFieldValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  dateFieldValue: { fontSize: 13, fontWeight: "700", color: THEME.textDark },
  dateFilterActionsRow: { flexDirection: "row", marginTop: 14 },
  newBookingButton: {
    height: 44,
    marginLeft: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  newBookingIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  newBookingButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: THEME.textDark,
    fontWeight: "500",
  },
  tabsOuterWrapper: { marginBottom: 6 },
  tabsWrapper: { paddingHorizontal: 12, height: 32 },
  tabButton: {
    paddingHorizontal: 12,
    borderRadius: 12,
    marginRight: 6,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  activeTabButton: { backgroundColor: THEME.primary },
  tabButtonText: { fontSize: 12, fontWeight: "600", color: THEME.textMuted },
  activeTabButtonText: { color: "#FFFFFF" },
  bookingCard: {
    backgroundColor: THEME.card,
    marginTop: 8,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  skeletonCard: { opacity: 0.7 },
  skeletonBlock: { height: 28, borderRadius: 6, backgroundColor: "#E2E8F0" },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: "#E2E8F0" },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerRightGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  menuButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  customerName: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.textDark,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: "700" },
  vehicleSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  vehicleInfoLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  sectionIcon: { marginRight: 4 },
  vehicleName: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textDark,
    maxWidth: "70%",
  },
  bulletSeparator: {
    marginHorizontal: 5,
    fontSize: 10,
    color: THEME.textMuted,
  },
  residentsText: { fontSize: 11, fontWeight: "500", color: THEME.textMuted },
  destinationText: {
    fontSize: 11,
    color: THEME.textMuted,
    fontWeight: "500",
    maxWidth: "40%",
  },
  pickupLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  locationPairRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 8,
  },
  locationHalf: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  locationHalfText: {
    flex: 1,
    fontSize: 11,
    color: THEME.textMuted,
    fontWeight: "500",
  },
  pickupLocationText: {
    fontSize: 11,
    color: THEME.textMuted,
    fontWeight: "500",
  },
  timelineContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  timeBlock: { flex: 2 },
  timeLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: THEME.textMuted,
    letterSpacing: 0.2,
  },
  timeValue: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.textDark,
    marginTop: 1,
  },
  durationBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: "#BFDBFE",
    marginHorizontal: 4,
  },
  durationText: { fontSize: 10, fontWeight: "700", color: THEME.secondary },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  communicationButtons: { flexDirection: "row", gap: 4, flex: 1 },
  secondaryCardButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: THEME.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FAFAFA",
  },
  // ── Vehicle History button (replaces WhatsApp/Navigate icons) ──
  vehicleHistoryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    backgroundColor: "#F5F3FF",
    gap: 5,
    paddingHorizontal: 8,
  },
  vehicleHistoryButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7C3AED",
  },
  vehicleHistoryCountBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  vehicleHistoryCountText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  historyList: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 420,
  },
  historyListContent: {
    paddingBottom: 4,
  },
  // ── Vehicle History popup modal ──
  historyOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    padding: 20,
  },
  historyModalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    maxHeight: "80%",
  },
  historyModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  historyModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: THEME.textDark,
  },
  historyEmptyState: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 8,
  },
  historyEmptyText: {
    fontSize: 13,
    color: THEME.textMuted,
    fontWeight: "500",
  },
  historyItemSeparator: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  historyRow: {
    paddingVertical: 12,
  },
  historyVehicleBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  historyVehicleTag: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
    marginTop: 1,
  },
  historyVehicleTagTo: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  historyVehicleTagLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#B91C1C",
    letterSpacing: 0.3,
  },
  historyVehicleTagLabelTo: {
    color: "#16A34A",
  },
  historyVehicleTextWrap: {
    flex: 1,
  },
  historyFromText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
    flexWrap: "wrap",
  },
  historyToText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
    flexWrap: "wrap",
  },
  historyVehicleNumberText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textMuted,
    marginTop: 1,
  },
  historyArrowRow: {
    alignItems: "flex-start",
    paddingLeft: 8,
    paddingVertical: 3,
  },
  historyMetaText: {
    fontSize: 11,
    color: THEME.textMuted,
    marginTop: 8,
  },
  historyCloseButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  historyCloseButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.textMuted,
  },
  primaryHandoverButton: {
    flex: 1,
    height: 32,
    backgroundColor: THEME.secondary,
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  primaryViewBookingButton: { backgroundColor: "#0D9488" },
  primaryHandoverButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
    marginRight: 2,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.textDark,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: THEME.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
  emptyButton: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: THEME.primary,
  },
  emptyButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
  footerLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
  },
  footerLoaderText: { fontSize: 12, fontWeight: "600", color: THEME.textMuted },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  actionSheetContainer: {
    backgroundColor: THEME.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
  },
  actionSheetHeader: {
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    marginBottom: 8,
  },
  actionSheetTitle: { fontSize: 15, fontWeight: "700", color: THEME.textDark },
  actionSheetSubtitle: { fontSize: 12, color: THEME.textMuted, marginTop: 2 },
  actionSheetOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  actionSheetOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.textDark,
  },
  destructiveText: { color: THEME.danger },
  actionSheetCancelButton: {
    marginTop: 6,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  actionSheetCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },
  driverModal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    maxHeight: "75%",
  },
  driverTitle: { fontSize: 18, fontWeight: "700", marginBottom: 15 },
  driverItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#F1F5F9",
  },
  driverSelected: { backgroundColor: "#EFF6FF", borderRadius: 8 },
  driverName: { fontWeight: "700", fontSize: 14 },
  driverPhone: { color: "#64748B", marginTop: 2, fontSize: 12 },
  cancelBtn: {
    flex: 1,
    height: 45,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  assignBtn: {
    flex: 1,
    height: 45,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  driverBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  driverBadgeText: { fontSize: 11, fontWeight: "700", color: "#B45309" },
  createdByRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  createdByText: { fontSize: 9, color: THEME.textMuted, fontWeight: "500" },
});
