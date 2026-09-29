import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../../services/api";

// ── Calendar Picker ───────────────────────────────────────────────────────────
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function CalendarPicker({ visible, value, onConfirm, onCancel, label }) {
  const parseDate = (str) => {
    if (!str) return new Date();
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const [viewing, setViewing] = useState(() => parseDate(value));
  const [selected, setSelected] = useState(() => parseDate(value));

  useEffect(() => {
    if (visible) {
      const d = parseDate(value);
      setViewing(d);
      setSelected(d);
    }
  }, [visible, value]);

  const year = viewing.getFullYear();
  const month = viewing.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => setViewing(new Date(year, month - 1, 1));
  const nextMonth = () => setViewing(new Date(year, month + 1, 1));

  const isSel = (d) =>
    d &&
    selected.getFullYear() === year &&
    selected.getMonth() === month &&
    selected.getDate() === d;

  const isToday = (d) => {
    const t = new Date();
    return (
      d &&
      t.getFullYear() === year &&
      t.getMonth() === month &&
      t.getDate() === d
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={cal.overlay}>
        <View style={cal.sheet}>
          <Text style={cal.calLabel}>{label}</Text>
          <View style={cal.nav}>
            <TouchableOpacity onPress={prevMonth} style={cal.navBtn}>
              <Ionicons name="chevron-back" size={18} color="#1E3A8A" />
            </TouchableOpacity>
            <Text style={cal.navTitle}>
              {MONTHS[month]} {year}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={cal.navBtn}>
              <Ionicons name="chevron-forward" size={18} color="#1E3A8A" />
            </TouchableOpacity>
          </View>
          <View style={cal.weekRow}>
            {WEEK_DAYS.map((d) => (
              <Text key={d} style={cal.weekDay}>
                {d}
              </Text>
            ))}
          </View>
          <View style={cal.grid}>
            {cells.map((d, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  cal.cell,
                  isSel(d) && cal.cellSel,
                  isToday(d) && !isSel(d) && cal.cellToday,
                ]}
                onPress={() => d && setSelected(new Date(year, month, d))}
                disabled={!d}
              >
                <Text
                  style={[
                    cal.cellText,
                    isSel(d) && cal.cellTextSel,
                    isToday(d) && !isSel(d) && cal.cellTextToday,
                  ]}
                >
                  {d || ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={cal.calActions}>
            <TouchableOpacity style={cal.calCancel} onPress={onCancel}>
              <Text style={cal.calCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={cal.calConfirm}
              onPress={() => onConfirm(fmt(selected))}
            >
              <Text style={cal.calConfirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Date Pill Button ──────────────────────────────────────────────────────────
function DatePill({ value, placeholder, onPress }) {
  return (
    <TouchableOpacity style={styles.datePill} onPress={onPress}>
      <Ionicons
        name="calendar-outline"
        size={14}
        color={value ? "#2563EB" : "#94A3B8"}
        style={{ marginRight: 6 }}
      />
      <Text
        style={[
          styles.datePillText,
          !value && { color: "#94A3B8", fontWeight: "500" },
        ]}
      >
        {value || placeholder}
      </Text>
      {value && (
        <Ionicons
          name="checkmark-circle"
          size={14}
          color="#2563EB"
          style={{ marginLeft: 4 }}
        />
      )}
    </TouchableOpacity>
  );
}

// ── Generic Chip Selector ──────────────────────────────────────────────────────
// Reusable single-select pill group. Any future chip-based filter (fuel type,
// city, lead source, etc.) can reuse this instead of writing a new .map() block.
function ChipSelector({ options, selectedValue, onSelect, wrap = false }) {
  return (
    <View style={[styles.modalOptionsRow, wrap && { flexWrap: "wrap" }]}>
      {options.map((opt) => {
        const active = selectedValue === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            style={[
              styles.modalOptionBadge,
              wrap && { marginBottom: 8 },
              active && styles.modalOptionBadgeActive,
            ]}
            onPress={() => onSelect(opt.id)}
          >
            {opt.icon && (
              <Ionicons
                name={opt.icon}
                size={13}
                color={active ? "#FFF" : "#475569"}
                style={{ marginRight: 5 }}
              />
            )}
            <Text
              style={[
                styles.modalOptionText,
                active && styles.modalOptionTextActive,
              ]}
            >
              {opt.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Generic Collapsible Filter Section ─────────────────────────────────────────
// Every filter group in the modal is wrapped in this. To add a new filter in
// future, just add another <FilterSection title="..."> block in the modal body —
// header, footer, scroll, and collapse behavior are all handled here already.
function FilterSection({ title, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.filterSectionContainer}>
      <TouchableOpacity
        style={styles.filterSectionHeader}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <View style={styles.filterSectionHeaderLeft}>
          <Text style={styles.filterSectionTitle}>{title}</Text>
          {badge ? (
            <View style={styles.filterSectionBadge}>
              <Text style={styles.filterSectionBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color="#94A3B8"
        />
      </TouchableOpacity>
      {open && <View style={styles.filterSectionBody}>{children}</View>}
    </View>
  );
}

// ── List footer loader (pagination spinner) ────────────────────────────────────
function ListFooterLoader({ visible }) {
  if (!visible) return null;
  return (
    <View style={styles.footerLoader}>
      <ActivityIndicator size="small" color="#3B82F6" />
      <Text style={styles.footerLoaderText}>Loading more leads…</Text>
    </View>
  );
}

// ── Filter option configs ──────────────────────────────────────────────────────
// Keep every filter's option list here, next to DATE_FIELD_OPTIONS. Adding a new
// dropdown/chip filter usually just means adding one more config array like these.
const VEHICLE_OPTIONS = [
  { id: "all", name: "All Types" },
  { id: "car", name: "Cars" },
  { id: "bike", name: "Bikes" },
];

const PRIORITY_OPTIONS = [
  { id: "all", name: "All Levels" },
  { id: "high", name: "HIGH" },
  { id: "medium", name: "MEDIUM" },
  { id: "low", name: "LOW" },
];

const DATE_MODE_OPTIONS = [
  { id: "all", name: "Any Date" },
  { id: "single", name: "Single Day" },
  { id: "range", name: "Date Range" },
];

const DATE_FIELD_OPTIONS = [
  { id: "created", label: "Created Date", icon: "add-circle-outline" },
  { id: "followup", label: "Follow-up Date", icon: "alarm-outline" },
  { id: "pickup", label: "Pickup Date", icon: "car-outline" },
  { id: "dropoff", label: "Drop-off Date", icon: "flag-outline" },
  { id: "booking", label: "Booking Date", icon: "receipt-outline" },
];

// ── Priority visual config for the redesigned card (HOT / WARM / COOL) ────────
// Underlying data model still only stores high | medium | low — this just maps
// each level onto the hotter/cooler pill styling & icon seen in the design.
const PRIORITY_CONFIG = {
  high: { label: "HOT", icon: "flame", color: "#EF4444", bg: "#FEE2E2" },
  medium: { label: "WARM", icon: "star", color: "#F97316", bg: "#FFEDD5" },
  low: { label: "COOL", icon: "snow", color: "#10B981", bg: "#D1FAE5" },
};
const getPriorityConfig = (level) =>
  PRIORITY_CONFIG[level] || PRIORITY_CONFIG.low;

// ── Small date helpers used only by the card (display only) ───────────────────
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const formatShortDate = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d)) return null;
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]}`;
};

const formatRelativeDateTime = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d)) return null;
  const diffDays = Math.round(
    (startOfDay(d) - startOfDay(new Date())) / 86400000,
  );
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diffDays === 0) return `TODAY, ${time}`;
  if (diffDays === 1) return `TOMORROW, ${time}`;
  if (diffDays === -1) return `YESTERDAY, ${time}`;
  const short = formatShortDate(date);
  return `${short}, ${time}`;
};

const getTripBadge = (fromDate) => {
  if (!fromDate) return null;
  const d = new Date(fromDate);
  if (isNaN(d)) return null;
  const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
  if (diff > 0)
    return {
      label: `Trip in ${diff} Day${diff > 1 ? "s" : ""}`,
      color: "#D97706",
      bg: "#FEF3C7",
    };
  if (diff === 0)
    return { label: "Trip Today", color: "#059669", bg: "#D1FAE5" };
  return null;
};

const formatCurrency = (num) => {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return `₹${Number(num).toLocaleString("en-IN")}`;
};

// Page size for pagination — small enough to load fast, big enough to fill a screen.
const PAGE_SIZE = 20;

// Module-level (not component state) so the scroll offset survives this screen
// unmounting/remounting when the user navigates away and back via expo-router.
let persistedScrollOffset = 0;

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function LeadsScreen() {
  const router = useRouter();
  const listRef = useRef(null);

  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({
    totalLeads: 0,
    todayFollowups: 0,
    missedCalls: 0,
  });

  // Loading states split by purpose so the UI can distinguish first load,
  // pull-to-refresh, and "loading next page" without them fighting each other.
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTab, setSelectedTab] = useState("all");

  // Filter states
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [filterVehicleType, setFilterVehicleType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  // Date filter — field type + mode
  const [dateFieldType, setDateFieldType] = useState("created"); // which date field to filter on
  const [dateFilterMode, setDateFilterMode] = useState("all"); // all | single | range
  const [filterSingleDate, setFilterSingleDate] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDealLossReason, setFilterDealLossReason] = useState("all");
  const [filterLongBooking, setFilterLongBooking] = useState("all");
  const [filterMondayLead, setFilterMondayLead] = useState("all");

  // Calendar open state
  const [openCal, setOpenCal] = useState(null); // "single" | "from" | "to" | null

  // Guards against race conditions: if the user changes a filter while a
  // request is in flight, the stale response is dropped instead of clobbering
  // newer results.
  const requestIdRef = useRef(0);
  // Ensures we only try to restore the saved scroll position once per mount.
  const hasRestoredScrollRef = useRef(false);

  // Debounce the search box so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter/search/tab change resets pagination and loads page 1.
  useEffect(() => {
    fetchDashboardStats();
    setHasMore(true);
    fetchLeads(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedTab,
    debouncedSearch,

    filterVehicleType,
    filterPriority,

    filterStatus,
    filterDealLossReason,
    filterLongBooking,
    filterMondayLead,

    dateFieldType,
    dateFilterMode,
    filterSingleDate,
    filterFromDate,
    filterToDate,
  ]);

  // Restore scroll position once, after the first page of data has landed.
  useEffect(() => {
    if (!loading && !hasRestoredScrollRef.current && leads.length > 0) {
      hasRestoredScrollRef.current = true;
      if (persistedScrollOffset > 0) {
        const id = setTimeout(() => {
          listRef.current?.scrollToOffset({
            offset: persistedScrollOffset,
            animated: false,
          });
        }, 50);
        return () => clearTimeout(id);
      }
    }
  }, [loading, leads.length]);

  const STATUS_OPTIONS = [
    { id: "all", name: "All Status" },
    { id: "Enquiry", name: "Enquiry" },
    { id: "Incomplete information", name: "Incomplete" },
    { id: "Information completed", name: "Information Completed" },
    { id: "Quotation sent", name: "Quotation Sent" },
    { id: "Negotiation", name: "Negotiation" },
    { id: "Booking confirmed", name: "Booking Confirmed" },
    { id: "Decision pending with customer", name: "Decision Pending" },
    { id: "Need B2B arrangement", name: "Need B2B" },
    { id: "Not interested", name: "Not Interested" },
    { id: "Disqualified", name: "Disqualified" },
    { id: "DNP", name: "DNP" },
    { id: "Deal lost", name: "Deal Lost" },
  ];

  const DEAL_LOSS_OPTIONS = [
    { id: "all", name: "All Reasons" },
    { id: "Car not available", name: "Car not available" },
    { id: "Price high", name: "Price high" },
    { id: "Plan changed", name: "Plan changed" },
    { id: "No response from customer", name: "No response" },
    { id: "Time flexibility", name: "Time flexibility" },
    { id: "We didn't follow up", name: "No follow-up" },
    { id: "Doubtful customer", name: "Doubtful customer" },
  ];

  const BOOLEAN_OPTIONS = [
    { id: "all", name: "All" },
    { id: "yes", name: "Yes" },
    { id: "no", name: "No" },
  ];

  const fetchDashboardStats = async () => {
    try {
      const res = await api.get("/leads/dashboard");

      if (res.data.success) {
        setStats({
          totalLeads: res.data.data.totalLeads,
          todayFollowups: res.data.data.todayFollowups,
          missedCalls: res.data.data.newLeads,
        });
      }
    } catch (err) {
      console.log("Dashboard Error:", err.response?.data || err.message);
    }
  };

  // Helper: get the correct date field from a lead based on dateFieldType
  const getLeadDateForField = (lead, fieldType) => {
    switch (fieldType) {
      case "followup":
        return lead.nextFollowupDate || "";

      case "pickup":
        return lead.fromDate || "";

      case "dropoff":
        return lead.toDate || "";

      case "booking":
        return lead.bookingConfirmedAt || "";

      default:
        return lead.leadDate || "";
    }
  };

  // fetchLeads(pageNum, append) — append=false replaces the list (first load,
  // filter change, pull-to-refresh); append=true adds the next page on top of
  // what's already rendered (infinite scroll).
  const fetchLeads = async (pageNum = 1, append = false) => {
    const currentRequestId = ++requestIdRef.current;

    try {
      if (append) {
        setLoadingMore(true);
      } else if (pageNum === 1 && !refreshing) {
        setLoading(true);
      }

      const params = {
        page: pageNum,
        limit: PAGE_SIZE,

        search: debouncedSearch,

        tab: selectedTab,

        vehicleType: filterVehicleType,
        priority: filterPriority,

        dateField: dateFieldType,
        dateMode: dateFilterMode,

        singleDate: filterSingleDate,
        fromDate: filterFromDate,
        toDate: filterToDate,

        status: filterStatus,
        dealLossReason: filterDealLossReason,
        longBooking: filterLongBooking,
        mondayLead: filterMondayLead,
      };

      const res = await api.get("/leads", { params });

      // A newer request has since been fired (filter/search/tab changed
      // while this one was in flight) — drop this stale response.
      if (currentRequestId !== requestIdRef.current) return;

      if (res.data.success) {
        const newLeads = res.data.data || [];
        setLeads((prev) => (append ? [...prev, ...newLeads] : newLeads));
        setHasMore(newLeads.length === PAGE_SIZE);
        setPage(pageNum);
      } else {
        if (!append) setLeads([]);
        setHasMore(false);
      }
    } catch (err) {
      console.log("Lead Fetch Error", err.response?.data || err.message);

      if (currentRequestId !== requestIdRef.current) return;
      if (!append) setLeads([]);
      setHasMore(false);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  };

  // Infinite scroll — called by FlatList when the user nears the end of the list.
  const handleLoadMore = () => {
    if (loading || loadingMore || refreshing || !hasMore) return;
    fetchLeads(page + 1, true);
  };

  // Pull-to-refresh — reloads page 1 without showing the full-screen spinner.
  const handleRefresh = () => {
    setRefreshing(true);
    setHasMore(true);
    fetchDashboardStats();
    fetchLeads(1, false);
  };

  const handleScroll = (e) => {
    persistedScrollOffset = e.nativeEvent.contentOffset.y;
  };

  const resetFilters = () => {
    setFilterVehicleType("all");
    setFilterPriority("all");
    setDateFieldType("created");
    setDateFilterMode("all");
    setFilterSingleDate("");
    setFilterFromDate("");
    setFilterToDate("");
    setFilterStatus("all");
    setFilterDealLossReason("all");
    setFilterLongBooking("all");
    setFilterMondayLead("all");
  };

  // Count of active filter GROUPS (not individual values) — shown in modal
  // header + apply button. When you add a new filter, add its "is active"
  // condition to this array too.
  const activeFilterCount = [
    filterVehicleType !== "all",
    filterPriority !== "all",

    filterStatus !== "all",
    filterDealLossReason !== "all",

    filterLongBooking !== "all",
    filterMondayLead !== "all",

    dateFilterMode !== "all",
  ].filter(Boolean).length;

  const isAnyFilterActive = activeFilterCount > 0;

  const activeDateFieldLabel =
    DATE_FIELD_OPTIONS.find((o) => o.id === dateFieldType)?.label || "Date";

  const formatDate = (date) => {
    if (!date) return "-";

    const d = new Date(date);

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = String(d.getFullYear()).slice(-2);

    return `${day}:${month}:${year}`;
  };

  // ── Redesigned lead card — matches the reference screenshot ─────────────────
  const renderLeadCard = useCallback(
    ({ item }) => {
      const cfg = getPriorityConfig(item.priority);
      const tripBadge = getTripBadge(item.fromDate);
      const dateRangeText =
        item.fromDate && item.toDate
          ? `${formatShortDate(item.fromDate)} – ${formatShortDate(item.toDate)}${
              item.totalDays ? ` (${item.totalDays} Days)` : ""
            }`
          : formatShortDate(item.fromDate) || "-";
      const followUpText = formatRelativeDateTime(item.nextFollowupDate);
      const lastContactText = formatRelativeDateTime(
        item.lastContactAt || item.updatedAt,
      );
      const estValue =
        item.estimatedValue ?? item.totalAmount ?? item.bookingAmount;

      return (
        <TouchableOpacity
          style={[styles.card, { borderLeftColor: cfg.color }]}
          activeOpacity={0.75}
          onPress={() => router.push(`./LeadDetailsScreen?id=${item._id}`)}
        >
          {/* Top row: priority pill + overflow menu */}
          <View style={styles.cardTopRow}>
            <View style={[styles.priorityPill, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon} size={11} color={cfg.color} />
              <Text style={[styles.priorityPillText, { color: cfg.color }]}>
                {cfg.label}
              </Text>
            </View>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Main row: name/details on the left, trip badge + value on the right */}
          <View style={styles.cardMainRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.customerName}>{item.customerName}</Text>

              <View style={styles.contactRow}>
                <Text style={styles.mobileNumber}>{item.mobileNumber}</Text>
                {item.whatsappSent && (
                  <View style={styles.whatsappBadge}>
                    <Ionicons name="logo-whatsapp" size={11} color="#25D366" />
                    <Text style={styles.whatsappBadgeText}>SENT</Text>
                  </View>
                )}
                {item.missedCalls > 0 && (
                  <View style={styles.missedCallBadge}>
                    <Ionicons name="call" size={10} color="#EF4444" />
                    <Text style={styles.missedCallBadgeText}>
                      {item.missedCalls} missed
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.logisticsRow}>
                <View style={styles.logisticItem}>
                  <Ionicons
                    name={item.vehicleType === "car" ? "car-sport" : "bicycle"}
                    size={14}
                    color="#475569"
                  />
                  <Text style={styles.logisticText} numberOfLines={1}>
                    {item.vehicleName || "-"}
                  </Text>
                </View>

                <View style={styles.logisticItem}>
                  <Ionicons name="calendar-outline" size={14} color="#475569" />
                  <Text style={styles.logisticText} numberOfLines={1}>
                    {dateRangeText}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.cardRightCol}>
              {tripBadge && (
                <View
                  style={[styles.tripBadge, { backgroundColor: tripBadge.bg }]}
                >
                  <Ionicons name="calendar" size={11} color={tripBadge.color} />
                  <Text
                    style={[styles.tripBadgeText, { color: tripBadge.color }]}
                  >
                    {tripBadge.label}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Bottom row: follow-up / last contact info boxes + quick action */}
          <View style={styles.infoBoxesRow}>
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxLabel}>Follow-up Due</Text>
              <Text style={styles.infoBoxValue} numberOfLines={1}>
                {followUpText || "-"}
              </Text>
            </View>
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxLabel}>Last Contact</Text>
              <Text style={styles.infoBoxValue} numberOfLines={1}>
                {lastContactText || "-"}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.actionCircle,
                { backgroundColor: item.whatsappSent ? "#25D366" : "#3B82F6" },
              ]}
              activeOpacity={0.8}
              onPress={() => {
                const phone = String(item.mobileNumber).replace(/\D/g, "");

                if (item.whatsappSent) {
                  Linking.openURL(`https://wa.me/91${phone}`);
                } else {
                  Linking.openURL(`tel:${phone}`);
                }
              }}
            >
              <Ionicons
                name={item.whatsappSent ? "logo-whatsapp" : "call"}
                size={18}
                color="#FFF"
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [router],
  );

  const keyExtractor = useCallback((item) => item._id, []);

  // ── Tab definitions ────────────────────────────────────────────────────────
  const TABS = [
    { id: "all", label: "All Leads" },
    { id: "new", label: "New ✨" },
    { id: "today_followup", label: "Today Follow-up ⏰" },
    { id: "tomorrow_followup", label: "Tomorrow Follow-up 📅" },
    { id: "missed_followup", label: "Missed Follow-up 🚨" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>

          <View>
            <Text style={styles.headerTitle}>Lead Management</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push("./AddLeadScreen")}
        >
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        {[
          {
            tab: "all",
            num: stats.totalLeads,
            label: "Total Inventory",
            accent: "#3B82F6",
          },
          {
            tab: "today_followup",
            num: stats.todayFollowups,
            label: "Today's Follows",
            accent: "#D97706",
          },
          {
            tab: "new",
            num: stats.missedCalls,
            label: "New Queries",
            accent: "#10B981",
          },
        ].map((s) => (
          <TouchableOpacity
            key={s.tab}
            style={[
              styles.statBox,
              { borderLeftColor: s.accent },
              selectedTab === s.tab && styles.activeStatBox,
            ]}
            onPress={() => setSelectedTab(s.tab)}
          >
            <Text style={styles.statNumber}>{s.num}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search + Filter */}
      <View style={styles.searchRowContainer}>
        <View style={styles.searchSection}>
          <Ionicons
            style={styles.searchIcon}
            name="search-outline"
            size={18}
            color="#94A3B8"
          />
          <TextInput
            style={styles.input}
            placeholder="Search leads..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
        </View>
        <TouchableOpacity
          style={[
            styles.filterIconButton,
            isAnyFilterActive && styles.activeFilterAppliedButton,
          ]}
          onPress={() => setIsFilterModalVisible(true)}
        >
          <Ionicons
            name="funnel"
            size={20}
            color={isAnyFilterActive ? "#FFF" : "#475569"}
          />
          {isAnyFilterActive && (
            <View style={styles.filterCountDot}>
              <Text style={styles.filterCountDotText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Active filter chips */}
      {isAnyFilterActive && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.activeChipsScroll}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
        >
          {filterVehicleType !== "all" && (
            <View style={styles.activeChip}>
              <Ionicons
                name={filterVehicleType === "car" ? "car-sport" : "bicycle"}
                size={11}
                color="#2563EB"
              />
              <Text style={styles.activeChipText}>
                {filterVehicleType === "car" ? "Cars" : "Bikes"}
              </Text>
              <TouchableOpacity onPress={() => setFilterVehicleType("all")}>
                <Ionicons name="close-circle" size={14} color="#2563EB" />
              </TouchableOpacity>
            </View>
          )}
          {filterPriority !== "all" && (
            <View style={styles.activeChip}>
              <Text style={styles.activeChipText}>
                {filterPriority.toUpperCase()}
              </Text>
              <TouchableOpacity onPress={() => setFilterPriority("all")}>
                <Ionicons name="close-circle" size={14} color="#2563EB" />
              </TouchableOpacity>
            </View>
          )}
          {dateFilterMode === "single" && filterSingleDate && (
            <View style={styles.activeChip}>
              <Ionicons name="calendar" size={11} color="#2563EB" />
              <Text style={styles.activeChipText}>
                {activeDateFieldLabel}: {filterSingleDate}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setDateFilterMode("all");
                  setFilterSingleDate("");
                }}
              >
                <Ionicons name="close-circle" size={14} color="#2563EB" />
              </TouchableOpacity>
            </View>
          )}
          {dateFilterMode === "range" && (filterFromDate || filterToDate) && (
            <View style={styles.activeChip}>
              <Ionicons name="calendar" size={11} color="#2563EB" />
              <Text style={styles.activeChipText}>
                {activeDateFieldLabel}: {filterFromDate || "Any"} →{" "}
                {filterToDate || "Any"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setDateFilterMode("all");
                  setFilterFromDate("");
                  setFilterToDate("");
                }}
              >
                <Ionicons name="close-circle" size={14} color="#2563EB" />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Tabs */}
      <View style={{ height: 44, marginVertical: 8 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterWrapper}
        >
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.filterTab,
                selectedTab === tab.id && styles.activeFilterTab,
                tab.id === "missed_followup" && styles.missedTab,
                tab.id === "missed_followup" &&
                  selectedTab === tab.id &&
                  styles.activeMissedTab,
              ]}
              onPress={() => setSelectedTab(tab.id)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  selectedTab === tab.id && styles.activeFilterTabText,
                  tab.id === "missed_followup" && styles.missedTabText,
                  tab.id === "missed_followup" &&
                    selectedTab === tab.id &&
                    styles.activeMissedTabText,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={leads}
          renderItem={renderLeadCard}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListFooterComponent={<ListFooterLoader visible={loadingMore} />}
          // Perf tuning: only render what's near the viewport, drop offscreen
          // native views, and avoid rendering huge batches at once.
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews={true}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Ionicons name="alert-circle-outline" size={44} color="#CBD5E1" />
              <Text style={styles.emptyText}>No leads match parameters.</Text>
            </View>
          }
        />
      )}

      {/* ── Filter Modal ──────────────────────────────────────────────────────
          Structure: fixed header (title + live filter count) → scrollable body
          made of independent <FilterSection> blocks → fixed footer (Reset/Apply).
          To add a NEW filter later: drop another <FilterSection> in the body and
          add its "is active" check to `activeFilterCount` above. Nothing else
          needs to change. */}
      <Modal
        animationType="slide"
        transparent
        visible={isFilterModalVisible}
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Fixed header */}
            <View style={styles.modalHeaderFixed}>
              <View>
                <Text style={styles.modalTitle}>Filter Parameters</Text>
                <Text style={styles.modalSubtitle}>
                  {activeFilterCount > 0
                    ? `${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""} applied`
                    : "No filters applied"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsFilterModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Scrollable body — each filter lives in its own section */}
            <ScrollView
              style={styles.modalScrollBody}
              contentContainerStyle={styles.modalScrollBodyContent}
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              <FilterSection
                title="Vehicle Type Filter"
                badge={filterVehicleType !== "all" ? "1" : null}
              >
                <ChipSelector
                  options={VEHICLE_OPTIONS}
                  selectedValue={filterVehicleType}
                  onSelect={setFilterVehicleType}
                />
              </FilterSection>

              <FilterSection
                title="Priority Filter"
                badge={filterPriority !== "all" ? "1" : null}
              >
                <ChipSelector
                  options={PRIORITY_OPTIONS}
                  selectedValue={filterPriority}
                  onSelect={setFilterPriority}
                  wrap
                />
              </FilterSection>
              <FilterSection
                title="Status"
                badge={filterStatus !== "all" ? "1" : null}
              >
                <ChipSelector
                  options={STATUS_OPTIONS}
                  selectedValue={filterStatus}
                  onSelect={setFilterStatus}
                  wrap
                />
              </FilterSection>

              <FilterSection
                title="Long Booking"
                badge={filterLongBooking !== "all" ? "1" : null}
              >
                <ChipSelector
                  options={BOOLEAN_OPTIONS}
                  selectedValue={filterLongBooking}
                  onSelect={setFilterLongBooking}
                />
              </FilterSection>

              <FilterSection
                title="Monday Lead"
                badge={filterMondayLead !== "all" ? "1" : null}
              >
                <ChipSelector
                  options={BOOLEAN_OPTIONS}
                  selectedValue={filterMondayLead}
                  onSelect={setFilterMondayLead}
                />
              </FilterSection>

              {filterStatus === "Deal lost" && (
                <FilterSection
                  title="Deal Loss Reason"
                  badge={filterDealLossReason !== "all" ? "1" : null}
                >
                  <ChipSelector
                    options={DEAL_LOSS_OPTIONS}
                    selectedValue={filterDealLossReason}
                    onSelect={setFilterDealLossReason}
                    wrap
                  />
                </FilterSection>
              )}

              <FilterSection
                title="date filter"
                badge={dateFilterMode !== "all" ? "1" : null}
              >
                {/* Step 1: which date field */}
                <Text style={styles.filterSubLabel}>Filter by which date?</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 14 }}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {DATE_FIELD_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.dateFieldBadge,
                        dateFieldType === opt.id && styles.dateFieldBadgeActive,
                      ]}
                      onPress={() => {
                        setDateFieldType(opt.id);
                        // reset date values when switching field type
                        setFilterSingleDate("");
                        setFilterFromDate("");
                        setFilterToDate("");
                      }}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={13}
                        color={dateFieldType === opt.id ? "#FFF" : "#475569"}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={[
                          styles.dateFieldBadgeText,
                          dateFieldType === opt.id &&
                            styles.dateFieldBadgeTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Step 2: mode — any / single / range */}
                <Text style={styles.filterSubLabel}>Date range mode</Text>
                <View style={{ marginBottom: 14 }}>
                  <ChipSelector
                    options={DATE_MODE_OPTIONS}
                    selectedValue={dateFilterMode}
                    onSelect={setDateFilterMode}
                  />
                </View>

                {/* Single date picker */}
                {dateFilterMode === "single" && (
                  <View style={styles.dateBlock}>
                    <Text style={styles.inlineFieldLabel}>
                      Select {activeDateFieldLabel}
                    </Text>
                    <DatePill
                      value={filterSingleDate}
                      placeholder="Tap to pick a date"
                      onPress={() => setOpenCal("single")}
                    />
                  </View>
                )}

                {/* Range date pickers */}
                {dateFilterMode === "range" && (
                  <View style={styles.dateBlock}>
                    <Text style={styles.inlineFieldLabel}>
                      {activeDateFieldLabel} Range
                    </Text>
                    <View style={styles.rangeRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.inlineFieldLabel}>From</Text>
                        <DatePill
                          value={filterFromDate}
                          placeholder="Start date"
                          onPress={() => setOpenCal("from")}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inlineFieldLabel}>To</Text>
                        <DatePill
                          value={filterToDate}
                          placeholder="End date"
                          onPress={() => setOpenCal("to")}
                        />
                      </View>
                    </View>
                    {filterFromDate &&
                      filterToDate &&
                      filterFromDate > filterToDate && (
                        <View style={styles.dateWarnRow}>
                          <Ionicons
                            name="warning-outline"
                            size={13}
                            color="#EF4444"
                          />
                          <Text style={styles.dateWarnText}>
                            Start date must be before end date
                          </Text>
                        </View>
                      )}
                  </View>
                )}
              </FilterSection>

              {/* ── FUTURE FILTERS GO HERE ──
                  Example:
                  <FilterSection title="Lead Source" badge={filterSource !== "all" ? "1" : null}>
                    <ChipSelector
                      options={SOURCE_OPTIONS}
                      selectedValue={filterSource}
                      onSelect={setFilterSource}
                      wrap
                    />
                  </FilterSection>
              */}
            </ScrollView>

            {/* Fixed footer */}
            <View style={styles.modalFooterFixed}>
              <TouchableOpacity
                style={styles.clearFilterButton}
                onPress={resetFilters}
              >
                <Text style={styles.clearFilterText}>Reset All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyFilterButton}
                onPress={() => setIsFilterModalVisible(false)}
              >
                <Text style={styles.applyFilterText}>
                  Apply Filters
                  {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Calendar Modals ── */}
      <CalendarPicker
        visible={openCal === "single"}
        value={filterSingleDate}
        label={`Select ${activeDateFieldLabel}`}
        onCancel={() => setOpenCal(null)}
        onConfirm={(d) => {
          setFilterSingleDate(d);
          setOpenCal(null);
        }}
      />
      <CalendarPicker
        visible={openCal === "from"}
        value={filterFromDate}
        label={`${activeDateFieldLabel} — From`}
        onCancel={() => setOpenCal(null)}
        onConfirm={(d) => {
          setFilterFromDate(d);
          setOpenCal(null);
        }}
      />
      <CalendarPicker
        visible={openCal === "to"}
        value={filterToDate}
        label={`${activeDateFieldLabel} — To`}
        onCancel={() => setOpenCal(null)}
        onConfirm={(d) => {
          setFilterToDate(d);
          setOpenCal(null);
        }}
      />
    </SafeAreaView>
  );
}

// ── Calendar styles ───────────────────────────────────────────────────────────
const cal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    width: 320,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  calLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
    textAlign: "center",
    marginBottom: 12,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  navTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekDay: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  cellSel: { backgroundColor: "#1E3A8A" },
  cellToday: { backgroundColor: "#EFF6FF" },
  cellText: { fontSize: 13, color: "#334155" },
  cellTextSel: { color: "#FFF", fontWeight: "800" },
  cellTextToday: { color: "#2563EB", fontWeight: "700" },
  calActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    gap: 10,
  },
  calCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  calCancelText: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  calConfirm: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1E3A8A",
  },
  calConfirmText: { fontSize: 13, fontWeight: "700", color: "#FFF" },
});

// ── Main styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    marginTop: 20,
    paddingBottom: 8,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerSubtitle: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  headerTitle: { fontSize: 24, fontWeight: "700", color: "#0F172A" },
  addButton: {
    backgroundColor: "#3B82F6",
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#FFF",
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginHorizontal: 4,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  activeStatBox: { backgroundColor: "#F1F5F9", borderColor: "#94A3B8" },
  statNumber: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  statLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 2,
  },

  searchRowContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 6,
  },
  searchSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 6 },
  input: { flex: 1, height: 44, color: "#0F172A", fontSize: 14 },
  filterIconButton: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  activeFilterAppliedButton: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  filterCountDot: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
  },
  filterCountDotText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
  },

  // Active filter chips
  activeChipsScroll: { maxHeight: 36, marginTop: 8 },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  activeChipText: { fontSize: 11, fontWeight: "700", color: "#2563EB" },

  // Tabs
  filterWrapper: { paddingHorizontal: 20, alignItems: "center" },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
    marginRight: 8,
    height: 36,
    justifyContent: "center",
  },
  activeFilterTab: { backgroundColor: "#0F172A" },
  filterTabText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  activeFilterTabText: { color: "#FFF" },
  // Missed tab — reddish tint
  missedTab: { backgroundColor: "#FEE2E2" },
  activeMissedTab: { backgroundColor: "#DC2626" },
  missedTabText: { color: "#DC2626" },
  activeMissedTabText: { color: "#FFF" },

  // ── Lead card — redesigned to match the reference screenshot ──────────────
  listContainer: { paddingHorizontal: 20, paddingBottom: 24 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 4,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  priorityPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  priorityPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  cardMainRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardRightCol: { alignItems: "flex-end" },
  customerName: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  tripBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    marginBottom: 6,
  },
  tripBadgeText: { fontSize: 10, fontWeight: "800" },
  estValue: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  estValueLabel: { fontSize: 10, color: "#94A3B8", fontWeight: "600" },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    flexWrap: "wrap",
    gap: 6,
  },
  mobileNumber: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  whatsappBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  whatsappBadgeText: {
    color: "#15803D",
    fontSize: 8,
    fontWeight: "800",
    marginLeft: 2,
  },
  missedCallBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    gap: 3,
  },
  missedCallBadgeText: { color: "#EF4444", fontSize: 8, fontWeight: "800" },
  logisticsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },

  logisticItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  logisticText: {
    fontSize: 12,
    color: "#475569",
    marginLeft: 6,
    fontWeight: "500",
    flexShrink: 1,
  },
  infoBoxesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  infoBox: {
    flex: 1,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  infoBoxLabel: {
    fontSize: 9,
    color: "#64748B",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  infoBoxValue: {
    fontSize: 12,
    color: "#1D4ED8",
    fontWeight: "800",
    marginTop: 2,
  },
  actionCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    color: "#94A3B8",
    marginTop: 10,
    fontSize: 13,
    textAlign: "center",
  },

  // Pagination footer loader
  footerLoader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  footerLoaderText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
  },

  // ── Filter Modal — fixed header/scroll/footer structure ──────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    overflow: "hidden",
  },
  modalHeaderFixed: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 2,
  },
  modalScrollBody: { flexGrow: 0 },
  modalScrollBodyContent: { paddingHorizontal: 20, paddingTop: 12 },
  modalFooterFixed: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FFF",
  },

  // Collapsible filter section
  filterSectionContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingVertical: 14,
  },
  filterSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterSectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  filterSectionBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "#1E3A8A",
    justifyContent: "center",
    alignItems: "center",
  },
  filterSectionBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "800" },
  filterSectionBody: { marginTop: 14 },

  filterSubLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 8,
  },
  modalOptionsRow: { flexDirection: "row" },
  modalOptionBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    marginRight: 8,
  },
  modalOptionBadgeActive: { backgroundColor: "#1E3A8A" },
  modalOptionText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  modalOptionTextActive: { color: "#FFF" },

  // Date field type selector
  dateFieldBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  dateFieldBadgeActive: { backgroundColor: "#1E3A8A", borderColor: "#1E3A8A" },
  dateFieldBadgeText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  dateFieldBadgeTextActive: { color: "#FFF" },

  // Date picker area
  dateBlock: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  inlineFieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderStyle: "dashed",
  },
  datePillText: { fontSize: 13, fontWeight: "700", color: "#2563EB", flex: 1 },
  rangeRow: { flexDirection: "row" },
  dateWarnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    backgroundColor: "#FEF2F2",
    padding: 8,
    borderRadius: 8,
  },
  dateWarnText: { fontSize: 11, color: "#EF4444", fontWeight: "600" },

  clearFilterButton: {
    flex: 1,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  clearFilterText: { fontSize: 14, fontWeight: "700", color: "#475569" },
  applyFilterButton: {
    flex: 2,
    height: 48,
    backgroundColor: "#1E3A8A",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
  applyFilterText: { fontSize: 14, fontWeight: "700", color: "#FFF" },
});
