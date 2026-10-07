import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
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

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/* ====================================================================== */
/*  ADD DROP (team leaders only)                                           */
/*                                                                         */
/*  The leader taps "Add Drop" on a card → popup → location, landmark,     */
/*  date, reach time and driver → saved as a "drop" task in the           */
/*  ServiceTask collection (POST /service/drop-task).                     */
/*  The driver then tracks it in the Pickup & Drop screen (My Tasks):     */
/*  Start → I've Reached → Complete. Nothing about it is shown on this    */
/*  card, and no payment is changed.                                      */
/* ====================================================================== */

// Must match LEADER_ROLES in backend serviceTaskController.js
const LEADER_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH_MANAGER",
  "OPERATIONS",
  "FLEET_MANAGER",
  "DRIVER_COORDINATOR",
];

// Is the logged-in user a team leader?
const isTeamLeader = () => {
  const s = useAuthStore.getState?.() || {};
  const u = s.user?.user || s.user || {};
  return LEADER_ROLES.includes(u.role);
};

// bookingId → its drop task (null = no drop yet). Only used to show
// "Add Drop" vs "Change Drop" and to prefill the popup.
// Module level, so it survives leaving / re-entering the screen.
const dropCache = {};

// A drop can be changed only before the driver starts the trip
const isChangeable = (task) =>
  !!task && ["pending", "assigned"].includes(task.status);

const BASE_TABS = [
  { id: "today", label: "Due Today" },
  { id: "all", label: "All Active" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

const PAGE_SIZE = 7;
const SEARCH_DEBOUNCE_MS = 250;

// Search results are cached per (tab + search term), so typing back a
// previous term ("ram" -> "rams" -> backspace -> "ram") is instant.
const SEARCH_CACHE_MAX = 40;
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;

// ==========================================
// MODULE-LEVEL CACHE — one bucket PER TAB (results with NO search), so
// switching tabs is instant and survives this screen unmounting /
// remounting. Reset only on full app reload.
// ==========================================
const emptyTabState = () => ({
  items: [], // mapped, ready-to-render cards
  rawItems: [], // raw API rows (kept so "load more" can append cleanly)
  page: 0,
  hasMore: true,
  total: 0,
  fetchedAt: 0, // 0 = never fetched
  stale: false, // true = show it, but refetch on next visit
});

const screenCache = {
  tabs: {
    today: emptyTabState(),
    all: emptyTabState(),
    tomorrow: emptyTabState(),
    overdue: emptyTabState(),
    completed: emptyTabState(),
  },
  counts: { today: 0, all: 0, tomorrow: 0, overdue: 0, completed: 0 },
  search: "",
  activeTab: "today",
  scrollOffsets: {},
  hasFetchedOnce: false, // true once ANY tab has loaded this app session
};

// Search results: key `${tab}::${term}` -> same shape as emptyTabState()
const searchCache = new Map();

const normalizeTerm = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const searchKey = (tab, term) => `${tab}::${term}`;

// Cache bucket for a tab + search term ("" term = the tab cache).
const getEntry = (tab, term, create = true) => {
  if (!term) return screenCache.tabs[tab];
  const key = searchKey(tab, term);
  let entry = searchCache.get(key);
  if (!entry && create) {
    entry = emptyTabState();
    searchCache.set(key, entry);
    if (searchCache.size > SEARCH_CACHE_MAX) {
      searchCache.delete(searchCache.keys().next().value); // drop oldest
    }
  }
  return entry || null;
};

const isEntryFresh = (entry, term) => {
  if (!entry?.fetchedAt) return false;
  if (!term) return !entry.stale;
  return Date.now() - entry.fetchedAt < SEARCH_CACHE_TTL_MS;
};

const isAbortError = (err) =>
  err?.code === "ERR_CANCELED" ||
  err?.name === "CanceledError" ||
  err?.name === "AbortError";

// Local match used for the instant preview while the server answers.
const matchesSearch = (card, term) => {
  if (card.searchText.includes(term)) return true;
  const compact = term.replace(/[\s-]/g, "");
  return !!compact && card.searchCompact.includes(compact);
};

/**
 * INSTANT PREVIEW — filters results we already have on the device, so
 * the list reacts on the very first keystroke. Uses the closest shorter
 * search already loaded ("ram" results when typing "rams"), otherwise
 * the tab's own list. Server results replace it a moment later.
 */
const buildLocalPreview = (tab, term) => {
  if (!term) return screenCache.tabs[tab].items;
  for (let i = term.length - 1; i >= 0; i--) {
    const prefix = term.slice(0, i);
    const entry = prefix
      ? searchCache.get(searchKey(tab, prefix))
      : screenCache.tabs[tab];
    if (entry?.fetchedAt) {
      return entry.items.filter((card) => matchesSearch(card, term));
    }
  }
  return [];
};

// Utility: Format Date Time
const formatDateTime = (dateObj) => {
  if (!dateObj) return { datePart: "-", timePart: "" };
  const datePart = dateObj.toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timePart = dateObj.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { datePart, timePart };
};

/* ---------------------------------------------------------------------- */
/*  LIVE TIMING HELPERS                                                    */
/*  Shared 30s clock — ONE interval for the whole screen. Every card that  */
/*  is still "active" subscribes to it, so the countdown / overdue        */
/*  counter stays live without each card owning its own timer.            */
/* ---------------------------------------------------------------------- */
const clockListeners = new Set();
let clockTimer = null;

const startClock = () => {
  if (clockTimer) return;
  clockTimer = setInterval(() => {
    const n = Date.now();
    clockListeners.forEach((fn) => fn(n));
  }, 30000);
};

const stopClockIfIdle = () => {
  if (clockListeners.size === 0 && clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
};

function useNow(enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    clockListeners.add(setNow);
    startClock();
    return () => {
      clockListeners.delete(setNow);
      stopClockIfIdle();
    };
  }, [enabled]);
  return now;
}

// ±15 min counts as "On Time" (only used if the backend sent no timeStatus)
const ON_TIME_GRACE_MS = 15 * 60 * 1000;

const formatDuration = (ms) => {
  const totalMin = Math.floor(Math.abs(ms) / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return "<1m";
};

// ACTIVE rentals: live countdown / overdue counter
const getActiveTiming = (dropAt, now, fallbackLabel) => {
  const dropMs = dropAt ? new Date(dropAt).getTime() : NaN;

  if (isNaN(dropMs)) {
    return {
      label: "Remaining",
      value: fallbackLabel || "-",
      sub: "Status Time",
      color: "#D97706",
      overdue: !!fallbackLabel?.startsWith?.("Overdue"),
    };
  }

  const diff = dropMs - now;
  if (diff < 0) {
    return {
      label: "Overdue By",
      value: formatDuration(diff),
      sub: "Past expected return",
      color: "#DC2626",
      overdue: true,
    };
  }
  if (diff <= 60 * 60 * 1000) {
    return {
      label: "Time Left",
      value: formatDuration(diff),
      sub: "Due soon",
      color: "#D97706",
      overdue: false,
    };
  }
  return {
    label: "Time Left",
    value: formatDuration(diff),
    sub: "Until return",
    color: "#16A34A",
    overdue: false,
  };
};

// COMPLETED rentals: on time / early / late (with how much)
const getReturnTiming = (item) => {
  const dropMs = item.dropAt ? new Date(item.dropAt).getTime() : NaN;
  const recvMs = item.receivingTime
    ? new Date(item.receivingTime).getTime()
    : NaN;
  const diff = !isNaN(dropMs) && !isNaN(recvMs) ? recvMs - dropMs : null;

  let kind = "unknown";
  if (item.timeStatus === "Delayed") kind = "late";
  else if (item.timeStatus === "Before Time") kind = "early";
  else if (item.timeStatus && item.timeStatus !== "-") kind = "ontime";
  else if (diff !== null) {
    kind =
      diff > ON_TIME_GRACE_MS
        ? "late"
        : diff < -ON_TIME_GRACE_MS
          ? "early"
          : "ontime";
  }

  const dur = diff !== null && kind !== "ontime" ? formatDuration(diff) : "";

  switch (kind) {
    case "late":
      return {
        value: dur ? `Late ${dur}` : "Late",
        color: "#DC2626",
        icon: "alert-circle",
      };
    case "early":
      return {
        value: dur ? `Early ${dur}` : "Early",
        color: "#D97706",
        icon: "checkmark-circle",
      };
    case "ontime":
      return {
        value: "On Time",
        color: "#16A34A",
        icon: "checkmark-done-circle",
      };
    default:
      return { value: "Returned", color: "#64748B", icon: "checkmark-circle" };
  }
};

/* ---------------------------------------------------------------------- */
/*  Small debounce hook — the server request waits until the user pauses  */
/*  typing; the on-device preview reacts on every keystroke.              */
/* ---------------------------------------------------------------------- */
function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/* ---------------------------------------------------------------------- */
/*  Pure mapping fn, at module scope so it's only ever applied to the      */
/*  small page of items the backend returns for the active tab.           */
/* ---------------------------------------------------------------------- */
function mapRawHandoverToCard(item) {
  const isComp = item.returnStatus === "completed";

  let status = "Upcoming";
  let statusColor = "#475569";
  let statusBg = "#F1F5F9";
  let tabField = "active";

  if (isComp) {
    status = "Completed";
    statusColor = "#16A34A";
    statusBg = "#DCFCE7";
    tabField = "completed";
  } else {
    const dropDateTime = item.trip?.dropDateTime
      ? new Date(item.trip.dropDateTime)
      : null;
    const isOverdue = dropDateTime ? dropDateTime < new Date() : false;
    status = isOverdue ? "Overdue" : "Upcoming";
    statusColor = isOverdue ? "#DC2626" : "#2563EB";
    statusBg = isOverdue ? "#FEE2E2" : "#DBEAFE";
    tabField = isOverdue ? "overdue" : "active";
  }

  const dropDate = item.trip?.dropDateTime
    ? new Date(item.trip.dropDateTime)
    : null;
  const receivingDate = item.returnDetails?.receivingTime
    ? new Date(item.returnDetails.receivingTime)
    : null;
  const receivingFormatted = formatDateTime(receivingDate);
  const handoverDate = item.createdAt ? new Date(item.createdAt) : null;
  const handoverFormatted = formatDateTime(handoverDate);

  const billSummary = item.payment?.billSummary || item.billSummary || {};
  const balanceAmount = Number(billSummary.balanceAmount || 0);
  const paymentStatus =
    balanceAmount > 0
      ? billSummary.bookingAmountPaid > 0 || billSummary.amountReceivedNow > 0
        ? "partial"
        : "pending"
      : "paid";

  const dropLocation =
    item.dropLocation || item.bookingId?.drop?.location || "-";

  const name =
    item.vehicle?.vehicleId?.vehicleName ||
    item.vehicle?.vehicleName ||
    "Unknown Vehicle";
  const plate =
    item.vehicle?.vehicleId?.vehicleNumber ||
    item.vehicle?.vehicleNumber ||
    "-";
  const customer = item.customer?.fullName || "-";
  const phone = item.customer?.mobileNumber || "-";
  const booking = item._id?.slice(-8).toUpperCase() || "-";

  // Pre-built once per card so the instant search preview is cheap.
  const searchText = [name, plate, customer, phone, booking, dropLocation]
    .join(" ")
    .toLowerCase();

  // Booking id (populated object or plain id) — sent when adding a drop
  const bookingId = String(item.bookingId?._id || item.bookingId || "");

  return {
    id: item._id,
    bookingId,
    name,
    plate,
    image: (() => {
      const url =
        item.vehicle?.vehicleId?.images?.[0]?.url ||
        item.vehicle?.images?.[0]?.url;
      if (!url || typeof url !== "string")
        return "https://via.placeholder.com/300";
      if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
        if (!url.includes("q_auto") && !url.includes("w_")) {
          return url.replace(
            "/upload/",
            "/upload/q_auto,f_auto,w_500,c_limit/",
          );
        }
      }
      return url;
    })(),
    customer,
    phone,
    booking,
    searchText,
    searchCompact: searchText.replace(/[\s-]/g, ""),
    balanceAmount,
    paymentStatus,
    billSummary,
    dropLocation,
    dropCharge: Number(item.dropCharge || 0),
    receivedBy: item.returnDetails?.receivedBy?.fullName || "-",
    receivedByRole: item.returnDetails?.receivedBy?.role || "-",
    receivingTime: item.returnDetails?.receivingTime || null,
    createdBy: item.createdByUser?.fullName || "-",
    createdByRole: item.createdByUser?.role || "-",
    handoverDatePart: handoverFormatted.datePart,
    handoverTimePart: handoverFormatted.timePart,
    receivingDatePart: receivingFormatted.datePart,
    receivingTimePart: receivingFormatted.timePart,
    timeStatus: item.returnDetails?.timeStatus || "-",
    delayText: item.returnDetails?.delayText || "-",
    expectedDate: dropDate
      ? dropDate.toLocaleDateString([], {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-",
    expectedTime: dropDate
      ? dropDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "-",
    dropAt: item.trip?.dropDateTime || null,
    dueIn: isComp
      ? item.returnDetails?.timeStatus || "Completed"
      : item.receiveTracker?.label || "-",
    status,
    statusColor,
    statusBg,
    tab: isComp ? "completed" : tabField,
  };
}

// ==========================================
// COMPONENT: Add Drop popup  (team leader)
//
//   Drop location  (prefilled from the booking)
//   Landmark       (optional)
//   Date           (chips: next days)
//   Reach time     (−1h  −15m  +15m  +1h)
//   Driver         (team members list)
//
//   Saves → POST /service/drop-task  → a "drop" task in ServiceTask,
//   already assigned. The driver tracks it in Pickup & Drop → My Tasks.
//   No payment fields.
// ==========================================
const DAY_MS = 24 * 60 * 60 * 1000;

const dayLabel = (d) => {
  const start = (x) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(new Date())) / DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", day: "2-digit" });
};

// task = the existing drop (Change Drop) or null (Add Drop)
function DropTaskModal({ visible, item, task, token, onClose, onSaved }) {
  const isChange = !!task;
  const [drivers, setDrivers] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [saving, setSaving] = useState(false);

  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [reachAt, setReachAt] = useState(new Date());
  const [driverId, setDriverId] = useState(null);

  // Fill the form each time the popup opens
  useEffect(() => {
    if (!visible || !item) return;

    // Change Drop: start from the saved drop.
    // Add Drop: start from the booking's return time and drop location.
    const bookingAddress =
      item.dropLocation && item.dropLocation !== "-" ? item.dropLocation : "";
    const savedTime = task?.scheduledAt ? new Date(task.scheduledAt) : null;
    const bookingTime = item.dropAt ? new Date(item.dropAt) : null;

    setReachAt(savedTime || bookingTime || new Date());
    setAddress(task?.address || bookingAddress);
    setLandmark(task?.landmark || "");
    setDriverId(task?.assignedTo?._id || null);

    let cancelled = false;
    setLoadingDrivers(true);
    api
      .get("/service/team-members", {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => !cancelled && setDrivers(res.data?.data || []))
      .catch((err) =>
        Alert.alert(
          "Error",
          err?.response?.data?.message || "Unable to load team members.",
        ),
      )
      .finally(() => !cancelled && setLoadingDrivers(false));
    return () => {
      cancelled = true;
    };
  }, [visible, item, task, token]);

  // Date chips: 7 days from today (and the booked day, if it's earlier)
  const dayChips = (() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const days = Array.from(
      { length: 7 },
      (_, i) => new Date(base.getTime() + i * DAY_MS),
    );
    const booked = item?.dropAt ? new Date(item.dropAt) : null;
    if (booked) {
      booked.setHours(0, 0, 0, 0);
      if (booked < base) days.unshift(booked);
    }
    return days;
  })();

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const pickDay = (day) => {
    const d = new Date(day);
    d.setHours(reachAt.getHours(), reachAt.getMinutes(), 0, 0);
    setReachAt(d);
  };

  const shiftTime = (minutes) =>
    setReachAt((d) => new Date(d.getTime() + minutes * 60 * 1000));

  const handleSave = async () => {
    if (!address.trim()) {
      return Alert.alert("Drop location", "Please enter the drop location.");
    }
    if (!driverId) {
      return Alert.alert("Driver", "Please select a driver.");
    }
    try {
      setSaving(true);
      const res = await api.post(
        "/service/drop-task",
        {
          bookingId: item.bookingId,
          address: address.trim(),
          landmark: landmark.trim(),
          scheduledAt: reachAt.toISOString(),
          assignedTo: driverId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.data?.success) {
        throw new Error(res.data?.message || "Unable to save the drop.");
      }
      onSaved?.(res.data.data); // card switches to "Change Drop"
      Alert.alert(
        isChange ? "Drop changed" : "Drop added",
        "The driver can see it in Pickup & Drop → My Tasks.",
      );
      onClose();
    } catch (err) {
      Alert.alert(
        "Error",
        err?.response?.data?.message || err?.message || "Unable to save.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.modalCard}>
          <View style={modalStyles.dragHandle} />

          {/* Header */}
          <View style={modalStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.title}>
                {isChange ? "Change Drop" : "Add Drop"}
              </Text>
              <Text style={modalStyles.subtitle} numberOfLines={1}>
                {item?.name} • {item?.plate} • {item?.customer}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={modalStyles.closeBtn}
              hitSlop={12}
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={loadingDrivers ? [] : drivers}
            keyExtractor={(d) => d._id}
            style={{ maxHeight: 520 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                {/* Location */}
                <Text style={modalStyles.fieldLabel}>Drop location *</Text>
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="e.g. LGBI Airport, Borjhar"
                  placeholderTextColor="#94A3B8"
                  style={modalStyles.input}
                />

                <Text style={modalStyles.fieldLabel}>Landmark</Text>
                <TextInput
                  value={landmark}
                  onChangeText={setLandmark}
                  placeholder="e.g. Departure gate 2"
                  placeholderTextColor="#94A3B8"
                  style={modalStyles.input}
                />

                {/* Date */}
                <Text style={modalStyles.fieldLabel}>Date</Text>
                <FlatList
                  horizontal
                  data={dayChips}
                  keyExtractor={(d) => String(d.getTime())}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6 }}
                  renderItem={({ item: day }) => {
                    const active = sameDay(day, reachAt);
                    return (
                      <TouchableOpacity
                        style={[
                          modalStyles.dayChip,
                          active && modalStyles.dayChipActive,
                        ]}
                        onPress={() => pickDay(day)}
                      >
                        <Text
                          style={[
                            modalStyles.dayChipText,
                            active && modalStyles.dayChipTextActive,
                          ]}
                        >
                          {dayLabel(day)}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />

                {/* Time */}
                <Text style={modalStyles.fieldLabel}>Reach by</Text>
                <View style={modalStyles.timeRow}>
                  <Text style={modalStyles.timeValue}>
                    {reachAt.toLocaleDateString([], {
                      day: "2-digit",
                      month: "short",
                    })}
                    ,{" "}
                    {reachAt.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  {[
                    { label: "−1h", min: -60 },
                    { label: "−15m", min: -15 },
                    { label: "+15m", min: 15 },
                    { label: "+1h", min: 60 },
                  ].map((b) => (
                    <TouchableOpacity
                      key={b.label}
                      style={modalStyles.timeBtn}
                      onPress={() => shiftTime(b.min)}
                    >
                      <Text style={modalStyles.timeBtnText}>{b.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Driver */}
                <Text style={modalStyles.fieldLabel}>Driver *</Text>
                {loadingDrivers && (
                  <View style={modalStyles.centerContainer}>
                    <ActivityIndicator size="small" color="#2563EB" />
                    <Text style={modalStyles.loadingText}>
                      Loading team members...
                    </Text>
                  </View>
                )}
              </View>
            }
            ListEmptyComponent={
              loadingDrivers ? null : (
                <View style={modalStyles.emptyState}>
                  <Ionicons
                    name="person-remove-outline"
                    size={30}
                    color="#94A3B8"
                  />
                  <Text style={modalStyles.emptyTitle}>No team members</Text>
                </View>
              )
            }
            renderItem={({ item: d }) => {
              const isSelected = driverId === d._id;
              return (
                <TouchableOpacity
                  style={[
                    modalStyles.driverItem,
                    isSelected && modalStyles.driverSelected,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setDriverId(d._id)}
                >
                  <Ionicons
                    name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={isSelected ? "#2563EB" : "#94A3B8"}
                  />
                  <View style={modalStyles.driverMeta}>
                    <Text style={modalStyles.driverName} numberOfLines={1}>
                      {d.fullName}
                    </Text>
                    <Text style={modalStyles.driverPhone}>
                      {[d.mobileNumber, d.role].filter(Boolean).join(" • ") ||
                        "No contact info"}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={modalStyles.selectedBadge}>
                      <Text style={modalStyles.selectedBadgeText}>
                        Selected
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />

          {/* Footer */}
          <View style={modalStyles.footerRow}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                modalStyles.assignBtn,
                (saving || !driverId || !address.trim()) &&
                  modalStyles.assignBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={modalStyles.assignBtnText}>
                  {isChange ? "Save Changes" : "Add Drop"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ==========================================
// SUB-COMPONENTS (memoized)
// ==========================================
const StatusBadge = memo(({ label, color, bg }) => (
  <View style={[styles.statusBadge, { backgroundColor: bg }]}>
    <View style={[styles.statusDot, { backgroundColor: color }]} />
    <Text style={[styles.statusText, { color }]}>{label}</Text>
  </View>
));

const TimeCell = memo(
  ({ label, value, sub, color, isStatusIcon, iconName, iconColor }) => (
    <View style={styles.timeCell}>
      <Text style={styles.timeCellLabel}>{label}</Text>
      {isStatusIcon ? (
        <View style={styles.timeStatusInCell}>
          {iconName && <Ionicons name={iconName} size={13} color={iconColor} />}
          <Text style={[styles.timeCellValue, color ? { color } : null]}>
            {value}
          </Text>
        </View>
      ) : (
        <Text style={[styles.timeCellValue, color ? { color } : null]}>
          {value}
        </Text>
      )}
      <Text style={styles.timeCellSub}>{sub}</Text>
    </View>
  ),
);

/* ---------------------------------------------------------------------- */
/*  Skeleton placeholder — shown only on a true cold start (no cache yet). */
/* ---------------------------------------------------------------------- */
function SkeletonBlock({ style }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={[styles.skeletonBlock, style, { opacity: pulse }]} />
  );
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderStrip}>
        <SkeletonBlock style={{ width: "50%", height: 12 }} />
        <SkeletonBlock style={{ width: 60, height: 16, borderRadius: 6 }} />
      </View>
      <View style={styles.cardMainBody}>
        <View style={styles.imageCol}>
          <SkeletonBlock
            style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 8 }}
          />
        </View>
        <View style={[styles.detailsCol, { gap: 8 }]}>
          <SkeletonBlock style={{ width: "70%", height: 14 }} />
          <SkeletonBlock style={{ width: "45%", height: 11 }} />
          <SkeletonBlock
            style={{ width: "60%", height: 20, borderRadius: 6 }}
          />
          <SkeletonBlock
            style={{ width: "80%", height: 20, borderRadius: 6 }}
          />
        </View>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------------- */
/*  CarCard — memoized; active cards re-render on the shared 30s clock.    */
/* ---------------------------------------------------------------------- */
const CarCard = memo(
  function CarCard({
    item,
    onOpenDetail,
    onCall,
    onOpenDropForm, // leader: open the Add / Change Drop popup
    leader,
    dropTask, // this booking's drop task, or null (only for the button label)
  }) {
    const isCompleted = item.tab === "completed";

    // Only team leaders, only for cars not yet received.
    //   no drop (or cancelled) → "Add Drop"
    //   drop not started yet   → "Change Drop"
    //   driver already started → small note, no button
    const hasDrop = !!dropTask && dropTask.status !== "cancelled";
    const showDropButton = leader && !isCompleted;
    const dropLocked = hasDrop && !isChangeable(dropTask);
    const hasBalance = item.balanceAmount > 0;
    const hasDropLocation = item.dropLocation && item.dropLocation !== "-";
    const hasPhone = !!item.phone && item.phone !== "-";

    const now = useNow(!isCompleted);

    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef(null);

    useEffect(() => () => clearTimeout(copyTimerRef.current), []);

    const handleCopyPhone = useCallback(async () => {
      if (!hasPhone) {
        Alert.alert(
          "No Phone Number",
          "No contact details available for this customer.",
        );
        return;
      }
      try {
        await Clipboard.setStringAsync(String(item.phone));
        setCopied(true);
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
      } catch {
        Alert.alert("Error", "Unable to copy the number.");
      }
    }, [item.phone, hasPhone]);

    const activeTiming = isCompleted
      ? null
      : getActiveTiming(item.dropAt, now, item.dueIn);
    const returnTiming = isCompleted ? getReturnTiming(item) : null;

    const badge = isCompleted
      ? {
          label: item.status,
          color: item.statusColor,
          bg: item.statusBg,
        }
      : activeTiming.overdue
        ? { label: "Overdue", color: "#DC2626", bg: "#FEE2E2" }
        : { label: "Upcoming", color: "#2563EB", bg: "#DBEAFE" };

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.92}
        onPress={() => onOpenDetail(item)}
      >
        {/* Top Header Strip */}
        <View style={styles.cardHeaderStrip}>
          <View style={styles.metaUserGroup}>
            <Ionicons
              name={
                isCompleted
                  ? "checkmark-done-circle-outline"
                  : "car-sport-outline"
              }
              size={15}
              color={isCompleted ? "#16A34A" : "#2563EB"}
            />
            <Text style={styles.metaUserText} numberOfLines={1}>
              <Text style={styles.metaUserLabel}>
                {isCompleted ? "Received by: " : "Handover by: "}
              </Text>
              {isCompleted ? item.receivedBy : item.createdBy}
            </Text>
          </View>
          <StatusBadge label={badge.label} color={badge.color} bg={badge.bg} />
        </View>

        {/* Main Card Body */}
        <View style={styles.cardMainBody}>
          <View style={styles.imageCol}>
            <Image
              source={{ uri: item.image }}
              style={styles.vehicleImage}
              resizeMethod="resize"
            />
            <View style={styles.plateContainer}>
              <Text style={styles.plateText}>{item.plate}</Text>
            </View>
          </View>

          <View style={styles.detailsCol}>
            <View style={styles.titleRow}>
              <Text style={styles.vehicleTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.bookingIdTag}>#{item.booking}</Text>
            </View>

            {/* Customer Contact */}
            <View style={styles.customerRow}>
              <View style={styles.customerGroup}>
                <Ionicons name="person-outline" size={13} color="#64748B" />
                <Text style={styles.customerName} numberOfLines={1}>
                  {item.customer}
                </Text>
              </View>

              <View style={styles.contactActions}>
                <TouchableOpacity
                  style={[
                    styles.copyIconButton,
                    copied && styles.copyIconButtonDone,
                  ]}
                  onPress={handleCopyPhone}
                  hitSlop={6}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Copy customer phone number"
                >
                  <Ionicons
                    name={copied ? "checkmark" : "copy-outline"}
                    size={13}
                    color={copied ? "#FFFFFF" : "#2563EB"}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.callIconButton}
                  onPress={() => onCall(item.phone)}
                  hitSlop={6}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Call customer"
                >
                  <Ionicons name="call" size={13} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Team leader: Add Drop / Change Drop */}
            {showDropButton && (
              <View style={styles.driverAllocationRow}>
                {dropLocked ? (
                  // Driver already started — can't change from here
                  <View style={styles.dropLockedNote}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={12}
                      color="#16A34A"
                    />
                    <Text style={styles.dropLockedText}>
                      {dropTask.status === "completed"
                        ? "Drop done"
                        : "Drop in progress"}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.assignActionBtn,
                      hasDrop && styles.changeDropBtn,
                    ]}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      onOpenDropForm(item);
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={hasDrop ? "create-outline" : "add-circle-outline"}
                      size={12}
                      color="#2563EB"
                    />
                    <Text style={styles.assignActionText}>
                      {hasDrop ? "Change Drop" : "Add Drop"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Location & Settlement Summary */}
            <View style={styles.badgeWrap}>
              {hasDropLocation && (
                <View style={styles.dropLocationBadge}>
                  <Ionicons name="location-outline" size={12} color="#92400E" />
                  <Text style={styles.dropLocationText} numberOfLines={1}>
                    {item.dropLocation}
                    {item.dropCharge > 0 ? ` (+₹${item.dropCharge})` : ""}
                  </Text>
                </View>
              )}

              <View
                style={[
                  styles.balanceBadge,
                  {
                    backgroundColor: hasBalance ? "#FEF2F2" : "#F0FDF4",
                    borderColor: hasBalance ? "#FEE2E2" : "#DCFCE7",
                  },
                ]}
              >
                <Ionicons
                  name={
                    hasBalance ? "wallet-outline" : "checkmark-circle-outline"
                  }
                  size={12}
                  color={hasBalance ? "#DC2626" : "#16A34A"}
                />
                <Text
                  style={[
                    styles.balanceText,
                    { color: hasBalance ? "#DC2626" : "#16A34A" },
                  ]}
                >
                  {hasBalance
                    ? `Due: ₹${item.balanceAmount.toLocaleString("en-IN")}`
                    : "Paid In Full"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.cardDivider} />

        {/* Timeline Metrics Grid */}
        <View style={styles.timelineRow}>
          <TimeCell
            label="Handover"
            value={item.handoverDatePart}
            sub={item.handoverTimePart}
          />

          <View style={styles.timelineSeparator} />

          <TimeCell
            label="Expected Return"
            value={item.expectedDate}
            sub={item.expectedTime}
          />

          <View style={styles.timelineSeparator} />

          {isCompleted ? (
            <TimeCell
              label="Actual Return"
              value={returnTiming.value}
              sub={`${item.receivingDatePart}${item.receivingTimePart ? ` • ${item.receivingTimePart}` : ""}`}
              color={returnTiming.color}
              isStatusIcon
              iconName={returnTiming.icon}
              iconColor={returnTiming.color}
            />
          ) : (
            <TimeCell
              label={activeTiming.label}
              value={activeTiming.value}
              sub={activeTiming.sub}
              color={activeTiming.color}
            />
          )}
        </View>

        {/* Action Button */}
        {!isCompleted && (
          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={styles.receiveActionBtn}
              activeOpacity={0.88}
              onPress={() => onOpenDetail(item, true)}
            >
              <MaterialCommunityIcons
                name="car-key"
                size={16}
                color="#FFFFFF"
              />
              <Text style={styles.receiveActionBtnText}>
                Start Live Inspection & Receive
              </Text>
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.leader === next.leader &&
    prev.dropTask === next.dropTask &&
    prev.onOpenDetail === next.onOpenDetail &&
    prev.onCall === next.onCall &&
    prev.onOpenDropForm === next.onOpenDropForm,
);

// ==========================================
// MAIN SCREEN
// ==========================================
export default function ReceiveCarScreen() {
  const router = useRouter();
  const { token } = useAuthStore();

  const [activeTab, setActiveTab] = useState(screenCache.activeTab);
  const [search, setSearch] = useState(screenCache.search);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  // What to show on mount: results for the current tab + saved search.
  const initialEntry =
    getEntry(screenCache.activeTab, normalizeTerm(screenCache.search), false) ||
    screenCache.tabs[screenCache.activeTab];

  const [items, setItems] = useState(() => initialEntry.items);
  const [counts, setCounts] = useState(screenCache.counts);
  const [total, setTotal] = useState(initialEntry.total);
  const [hasMore, setHasMore] = useState(initialEntry.hasMore);

  // Only the very first load of the whole session shows the skeleton.
  const [loading, setLoading] = useState(!screenCache.hasFetchedOnce);
  // Small in-list loader, used when switching to a tab with no cache yet.
  const [tabLoading, setTabLoading] = useState(false);
  // Spinner inside the search bar while the server search is running.
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Add Drop popup: the card it was opened for (null = closed)
  const [dropFormFor, setDropFormFor] = useState(null);
  const leader = isTeamLeader();
  // bookingId → drop task (null = none). Drives "Add Drop" / "Change Drop".
  const [drops, setDrops] = useState(() => ({ ...dropCache }));

  const flatListRef = useRef(null);
  const activeTabRef = useRef(activeTab);
  const isFirstSearchEffect = useRef(true);
  const isFirstDebounceEffect = useRef(true);
  const hasPrefetchedOthers = useRef(false);
  const initialLoadPromiseRef = useRef(null);

  // Per-tab request counter + abort controller. Only the LATEST page-1
  // request of a tab may update the screen, so a slow old search can
  // never overwrite newer results; the old request is also cancelled.
  const requestSeqRef = useRef({});
  const abortRef = useRef({});

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Cancel in-flight requests when the screen unmounts
  useEffect(
    () => () => {
      Object.values(abortRef.current).forEach((c) => c?.abort());
    },
    [],
  );

  const showEntry = useCallback((entry) => {
    setItems(entry.items);
    setHasMore(entry.hasMore);
    setTotal(entry.total);
  }, []);

  const fetchTab = useCallback(
    async (
      tab,
      { page = 1, silent = false, term, includeCounts = false } = {},
    ) => {
      const termValue = term ?? normalizeTerm(screenCache.search);
      const seqs = requestSeqRef.current;

      let controller = null;
      if (page === 1) {
        seqs[tab] = (seqs[tab] || 0) + 1;
        abortRef.current[tab]?.abort();
        controller = new AbortController();
        abortRef.current[tab] = controller;
      }
      const seq = seqs[tab] || 0;
      const isLatest = () => seq === requestSeqRef.current[tab];

      try {
        const res = await api.get("/handover/receive-list", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller?.signal,
          params: {
            tab,
            page,
            limit: PAGE_SIZE,
            search: termValue,
            completedDays: 90,
            // Counts only on first load / manual refresh
            includeCounts: includeCounts ? "true" : "false",
          },
        });

        // A newer search / refresh for this tab started — ignore this one.
        if (!isLatest()) return;

        if (res.data.success) {
          const raw = res.data.data || [];
          const mapped = raw.map(mapRawHandoverToCard);
          const entry = getEntry(tab, termValue);

          if (page === 1) {
            entry.rawItems = raw;
            entry.items = mapped;
          } else {
            entry.rawItems = [...(entry.rawItems || []), ...raw];
            entry.items = [...(entry.items || []), ...mapped];
          }
          entry.page = page;
          entry.hasMore = !!res.data.hasMore;
          entry.total = res.data.total || 0;
          entry.fetchedAt = Date.now();
          entry.stale = false;

          if (res.data.counts) {
            screenCache.counts = res.data.counts;
            setCounts(res.data.counts);
          }

          // Only paint it if the user is still looking at this tab + term
          if (
            tab === activeTabRef.current &&
            termValue === normalizeTerm(screenCache.search)
          ) {
            showEntry(entry);
          }
        } else if (!silent) {
          Alert.alert("Error", res.data.message || "Failed to load cars");
        }
      } catch (err) {
        if (isAbortError(err)) return;
        if (!silent && isLatest()) {
          Alert.alert(
            "Error",
            err?.response?.data?.message || "Failed to load cars",
          );
        }
      } finally {
        setRefreshing(false);
        if (page > 1) setLoadingMore(false);
        if (isLatest() && tab === activeTabRef.current) {
          setLoading(false);
          setTabLoading(false);
          if (termValue === normalizeTerm(screenCache.search)) {
            setSearching(false);
          }
        }
      }
    },
    [token, showEntry],
  );

  // ---- Initial load: show cache instantly if we have it, else fetch ----
  useEffect(() => {
    if (!token) return;

    const term = normalizeTerm(screenCache.search);
    const entry = getEntry(activeTab, term, false);

    let loadPromise;
    if (entry?.fetchedAt) {
      showEntry(entry);
      setLoading(false);
      // Quiet revalidate — cached data is already on screen.
      loadPromise = fetchTab(activeTab, { page: 1, silent: true, term });
    } else {
      setLoading(!screenCache.hasFetchedOnce);
      if (screenCache.hasFetchedOnce) {
        if (term) setSearching(true);
        else setTabLoading(true);
      }
      loadPromise = fetchTab(activeTab, {
        page: 1,
        silent: screenCache.hasFetchedOnce,
        includeCounts: true,
        term,
      });
    }
    initialLoadPromiseRef.current = loadPromise;
    screenCache.hasFetchedOnce = true;

    const savedOffset = term ? 0 : screenCache.scrollOffsets[activeTab] || 0;
    if (savedOffset > 0) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({
          offset: savedOffset,
          animated: false,
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ---- Background prefetch of the OTHER tabs (no search), once ----
  useEffect(() => {
    if (!token || hasPrefetchedOthers.current) return;
    hasPrefetchedOthers.current = true;
    let cancelled = false;

    (async () => {
      await initialLoadPromiseRef.current;
      if (cancelled) return;

      const others = BASE_TABS.map((t) => t.id).filter(
        (id) => id !== activeTabRef.current,
      );
      for (const t of others) {
        if (cancelled) return;
        const cache = screenCache.tabs[t];
        if (!cache.fetchedAt || cache.stale) {
          await fetchTab(t, { page: 1, silent: true, term: "" });
          await new Promise((r) => setTimeout(r, 150)); // don't hammer the API
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, fetchTab]);

  // ---- Search typed: react INSTANTLY on the device (every keystroke) ----
  useEffect(() => {
    screenCache.search = search;
    if (isFirstSearchEffect.current) {
      isFirstSearchEffect.current = false;
      return;
    }

    const term = normalizeTerm(search);
    const tab = activeTabRef.current;
    const entry = getEntry(tab, term, false);

    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });

    // Already searched this recently (or cleared back to the tab list)
    if (entry && isEntryFresh(entry, term)) {
      showEntry(entry);
      setSearching(false);
      return;
    }

    // Instant preview from data already on the phone
    const preview = buildLocalPreview(tab, term);
    setItems(preview);
    setTotal(preview.length);
    setHasMore(false);
    setSearching(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ---- Search paused: ask the server (debounced) ----
  useEffect(() => {
    if (isFirstDebounceEffect.current) {
      isFirstDebounceEffect.current = false;
      return;
    }
    const term = normalizeTerm(debouncedSearch);
    const tab = activeTabRef.current;
    const entry = getEntry(tab, term, false);
    if (entry && isEntryFresh(entry, term)) return;

    fetchTab(tab, { page: 1, silent: true, term });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // ---- Which cars already have a drop? (leaders only, one call) ----
  //      Only asks for bookings we haven't checked yet.
  useEffect(() => {
    if (!leader || !token || !items.length) return;
    const ids = [
      ...new Set(
        items.map((c) => c.bookingId).filter((id) => id && !(id in dropCache)),
      ),
    ];
    if (!ids.length) return;

    api
      .get("/service/by-bookings", {
        headers: { Authorization: `Bearer ${token}` },
        params: { bookingIds: ids.join(","), type: "drop" },
      })
      .then((res) => {
        const found = res.data?.data || {};
        ids.forEach((id) => {
          dropCache[id] = found[id] || null;
        });
        setDrops({ ...dropCache });
      })
      .catch(() => {
        /* label just stays "Add Drop" */
      });
  }, [items, leader, token]);

  // After Add / Change in the popup → the card now shows "Change Drop"
  const handleDropSaved = useCallback((task) => {
    if (!task?.bookingId) return;
    dropCache[task.bookingId] = task;
    setDrops({ ...dropCache });
  }, []);

  useEffect(() => {
    screenCache.activeTab = activeTab;
  }, [activeTab]);

  const handleTabChange = useCallback(
    (tabId) => {
      if (tabId === activeTab) return;
      activeTabRef.current = tabId;
      setActiveTab(tabId);

      const term = normalizeTerm(screenCache.search);
      const entry = getEntry(tabId, term, false);
      const fresh = !!entry && isEntryFresh(entry, term);

      if (entry?.fetchedAt) {
        showEntry(entry);
      } else if (term) {
        const preview = buildLocalPreview(tabId, term);
        setItems(preview);
        setTotal(preview.length);
        setHasMore(false);
      } else {
        showEntry(screenCache.tabs[tabId]);
      }

      const offset = term ? 0 : screenCache.scrollOffsets[tabId] || 0;
      flatListRef.current?.scrollToOffset({ offset, animated: false });

      if (fresh) {
        setTabLoading(false);
        setSearching(false);
        return;
      }

      if (term) {
        setTabLoading(false);
        setSearching(true);
      } else {
        setSearching(false);
        setTabLoading(!entry?.fetchedAt);
      }

      fetchTab(tabId, {
        page: 1,
        silent: !!entry?.items?.length,
        term,
      });
    },
    [activeTab, fetchTab, showEntry],
  );

  const handleLoadMore = useCallback(() => {
    const term = normalizeTerm(screenCache.search);
    const entry = getEntry(activeTab, term, false);
    if (
      !entry?.fetchedAt ||
      !entry.hasMore ||
      loadingMore ||
      searching ||
      tabLoading
    ) {
      return;
    }
    setLoadingMore(true);
    fetchTab(activeTab, {
      page: (entry.page || 1) + 1,
      silent: true,
      term,
    });
  }, [activeTab, loadingMore, searching, tabLoading, fetchTab]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    const term = normalizeTerm(screenCache.search);

    // Everything else may now be stale — refetched lazily when visited.
    Object.values(screenCache.tabs).forEach((c) => {
      c.stale = true;
    });
    searchCache.clear();

    // Re-check drops (a driver may have started / finished one)
    Object.keys(dropCache).forEach((k) => delete dropCache[k]);
    setDrops({});

    fetchTab(activeTab, {
      page: 1,
      silent: true,
      includeCounts: true,
      term,
    });
  }, [activeTab, fetchTab]);

  const handleCall = useCallback(async (phone) => {
    if (!phone || phone === "-") {
      Alert.alert(
        "No Phone Number",
        "No contact details available for this customer.",
      );
      return;
    }
    const url = `tel:${phone}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      Linking.openURL(url);
    } else {
      Alert.alert("Error", "Unable to make calls from this device.");
    }
  }, []);

  // Leader taps "Add Drop" on a card
  const openDropForm = useCallback((item) => setDropFormFor(item), []);
  const closeDropForm = useCallback(() => setDropFormFor(null), []);

  const handleOpenDetail = useCallback(
    (item, forceReceive = false) => {
      const isCompleted = item.tab === "completed";
      router.push({
        pathname:
          isCompleted && !forceReceive
            ? "../components/receiveCar/returnDetailScreen"
            : forceReceive
              ? "../components/receiveCar/detail"
              : "../components/receiveCar/detailScreen",
        params: { handoverId: item.id },
      });
    },
    [router],
  );

  const renderCard = useCallback(
    ({ item }) => (
      <CarCard
        item={item}
        onOpenDetail={handleOpenDetail}
        onCall={handleCall}
        onOpenDropForm={openDropForm}
        leader={leader}
        dropTask={drops[item.bookingId] || null}
      />
    ),
    [handleOpenDetail, handleCall, openDropForm, leader, drops],
  );

  // Drop of the card in the popup: changeable → "Change Drop", else "Add Drop"
  const dropFormTask = (() => {
    const t = dropFormFor ? drops[dropFormFor.bookingId] : null;
    return isChangeable(t) ? t : null;
  })();

  // ---- Scroll position persistence, per tab (not for search results) ----
  const handleScroll = useCallback(
    (e) => {
      if (normalizeTerm(screenCache.search)) return;
      screenCache.scrollOffsets[activeTab] = e.nativeEvent.contentOffset.y;
    },
    [activeTab],
  );

  const renderListFooter = () => {
    if (!hasMore) {
      return items.length > 0 && activeTab !== "completed" ? (
        <View style={styles.noticeBox}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color="#2563EB"
          />
          <Text style={styles.noticeText}>
            Mandatory vehicle health assessment logs must be processed live upon
            receipt.
          </Text>
        </View>
      ) : null;
    }
    return (
      <View style={styles.loadMoreContainer}>
        <ActivityIndicator size="small" color="#0B132B" />
        <Text style={styles.loadMoreText}>Loading more records...</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0B132B" />

      {/* Header Bar */}
      <LinearGradient colors={["#0B132B", "#1C2541"]} style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerControlBtn}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerCenterMeta}>
          <Text style={styles.headerTitle}>Receive Desk</Text>
          <Text style={styles.headerSubTitle}>
            Showing {items.length} of {total} vehicle record
            {total !== 1 ? "s" : ""}
          </Text>
        </View>

        <View style={styles.headerActionGroup}>
          <TouchableOpacity
            onPress={handleRefresh}
            style={styles.headerControlBtn}
            hitSlop={10}
          >
            <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Search Input Container */}
      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          {searching ? (
            <ActivityIndicator
              size="small"
              color="#2563EB"
              style={styles.searchSpinner}
            />
          ) : (
            <Ionicons name="search-outline" size={16} color="#64748B" />
          )}
          <TextInput
            placeholder="Search by customer, mobile, vehicle, plate, or ID..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={BASE_TABS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.tabsScrollContent}
          renderItem={({ item }) => {
            const isSelected = activeTab === item.id;
            const count = counts[item.id];
            return (
              <TouchableOpacity
                onPress={() => handleTabChange(item.id)}
                activeOpacity={0.75}
                style={[styles.tabPill, isSelected && styles.activeTabPill]}
              >
                <Text
                  style={[
                    styles.tabPillText,
                    isSelected && styles.activeTabPillText,
                  ]}
                >
                  {item.label}
                  {typeof count === "number" ? ` (${count})` : ""}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Primary Content List */}
      {loading ? (
        <View style={styles.listContainer}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <>
          {tabLoading && (
            <View style={styles.tabLoaderRow}>
              <ActivityIndicator size="small" color="#0B132B" />
            </View>
          )}
          <FlatList
            ref={flatListRef}
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderCard}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[
              styles.listContainer,
              items.length === 0 && styles.emptyListContainer,
            ]}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            removeClippedSubviews={Platform.OS === "android"}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#0B132B"
              />
            }
            ListFooterComponent={renderListFooter}
            ListEmptyComponent={
              searching || tabLoading ? (
                <View style={styles.emptyContainer}>
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text style={[styles.emptySubheading, { marginTop: 10 }]}>
                    {searching ? `Searching "${search.trim()}"…` : "Loading…"}
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons
                      name="car-sport-outline"
                      size={32}
                      color="#94A3B8"
                    />
                  </View>
                  <Text style={styles.emptyHeading}>No Allocations Found</Text>
                  <Text style={styles.emptySubheading}>
                    {search.length > 0
                      ? `No vehicle logs matched your search "${search}"`
                      : "There are currently no records listed under this filter."}
                  </Text>
                </View>
              )
            }
          />
        </>
      )}

      {/* Add Drop popup (team leader) → creates a drop task in ServiceTask */}
      <DropTaskModal
        visible={!!dropFormFor}
        item={dropFormFor}
        task={dropFormTask}
        token={token}
        onClose={closeDropForm}
        onSaved={handleDropSaved}
      />
    </SafeAreaView>
  );
}

// ==========================================
// STYLESHEETS
// ==========================================
const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  // Header Layout
  header: {
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 6 : 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerControlBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenterMeta: {
    flex: 1,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  headerSubTitle: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    marginTop: 2,
  },
  headerActionGroup: {
    flexDirection: "row",
    gap: 6,
  },

  // Search Architecture
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchContainer: {
    height: 42,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchSpinner: {
    width: 16,
    height: 16,
    transform: [{ scale: 0.8 }],
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
    paddingVertical: 0,
  },

  // Filter Tabs
  tabsWrapper: {
    paddingVertical: 6,
  },
  tabsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  activeTabPill: {
    backgroundColor: "#0B132B",
    borderColor: "#0B132B",
  },
  tabPillText: {
    fontWeight: "600",
    fontSize: 12,
    color: "#64748B",
  },
  activeTabPillText: {
    color: "#FFFFFF",
  },

  // Main List Layout
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 28,
  },
  emptyListContainer: {
    flexGrow: 1,
  },
  tabLoaderRow: {
    paddingVertical: 6,
    alignItems: "center",
  },

  // Card Structure
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
    }),
    overflow: "hidden",
  },
  cardHeaderStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  metaUserGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  metaUserText: {
    fontSize: 11,
    color: "#334155",
    fontWeight: "500",
  },
  metaUserLabel: {
    color: "#94A3B8",
    fontWeight: "400",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: -0.1,
  },

  // Card Body
  cardMainBody: {
    flexDirection: "row",
    padding: 14,
    gap: 12,
  },
  imageCol: {
    width: SCREEN_WIDTH * 0.25,
    maxWidth: 100,
  },
  vehicleImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    resizeMode: "cover",
  },
  plateContainer: {
    marginTop: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  plateText: {
    color: "#1E293B",
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 0.3,
  },

  detailsCol: {
    flex: 1,
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  vehicleTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    flex: 1,
  },
  bookingIdTag: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  // Customer row
  customerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
  customerGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  customerName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#334155",
    flex: 1,
  },
  contactActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  copyIconButton: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    justifyContent: "center",
    alignItems: "center",
  },
  copyIconButtonDone: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
  callIconButton: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
  },

  // Driver Allocation Row
  driverAllocationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 4,
    gap: 6,
  },
  driverAssignedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    flexShrink: 1,
  },
  driverAssignedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1D4ED8",
  },
  noDriverBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  noDriverText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#DC2626",
  },
  assignActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  assignActionText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2563EB",
  },
  // "Change Drop" — same button, light blue so it reads as "already added"
  changeDropBtn: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  // "Drop in progress" / "Drop done" — not tappable
  dropLockedNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  dropLockedText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#16A34A",
  },

  // Location & Financial Badges
  badgeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  dropLocationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
    maxWidth: "100%",
  },
  dropLocationText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#78350F",
  },
  balanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  balanceText: {
    fontSize: 10,
    fontWeight: "700",
  },

  cardDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },

  // Timeline Grid
  timelineRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: "#FAFAFA",
  },
  timeCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineSeparator: {
    width: 1,
    backgroundColor: "#E2E8F0",
  },
  timeCellLabel: {
    fontSize: 9,
    color: "#94A3B8",
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  timeCellValue: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },
  timeCellSub: {
    fontSize: 10,
    color: "#64748B",
    textAlign: "center",
    marginTop: 1,
  },
  timeStatusInCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  // Action Footer
  cardFooter: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  receiveActionBtn: {
    backgroundColor: "#0B132B",
    height: 40,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    gap: 8,
  },
  receiveActionBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },

  // Feedback & Empty States
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  noticeText: {
    flex: 1,
    color: "#1E40AF",
    fontSize: 11,
    lineHeight: 16,
  },
  loadMoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
  },
  loadMoreText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  centeredLoader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  loaderLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
  },
  skeletonBlock: {
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 56,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  emptyHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
  },
  emptySubheading: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
});

// Modal Overlay Styles
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "80%",
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
  },
  centerContainer: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: "#64748B",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  emptySub: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
  },
  driverItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  driverSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  driverMeta: {
    marginLeft: 12,
    flex: 1,
  },
  driverName: {
    fontWeight: "700",
    fontSize: 13,
    color: "#0F172A",
  },
  driverPhone: {
    color: "#64748B",
    marginTop: 2,
    fontSize: 11,
  },
  selectedBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  selectedBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2563EB",
  },
  footerRow: {
    flexDirection: "row",
    marginTop: 16,
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  cancelBtnText: {
    fontWeight: "600",
    color: "#64748B",
    fontSize: 13,
  },
  assignBtn: {
    flex: 1.5,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  assignBtnDisabled: {
    opacity: 0.5,
  },
  assignBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },

  // Add Drop form
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  dayChipActive: { backgroundColor: "#0B132B", borderColor: "#0B132B" },
  dayChipText: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  dayChipTextActive: { color: "#FFFFFF" },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  timeValue: { flex: 1, fontSize: 14, fontWeight: "800", color: "#0F172A" },
  timeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  timeBtnText: { fontSize: 11, fontWeight: "700", color: "#2563EB" },
});
