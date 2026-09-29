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

const BASE_TABS = [
  { id: "today", label: "Due Today" },
  { id: "all", label: "All Active" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

const PAGE_SIZE = 7;
const SEARCH_DEBOUNCE_MS = 250;

// ==========================================
// MODULE-LEVEL CACHE — one bucket PER TAB, so switching tabs is instant
// (no refetch, no full-array re-filter) and survives this screen
// unmounting/remounting (tab switch, stack pop/push, navigator
// lazy-unmounting a blurred screen). Reset only on full app reload.
// ==========================================
const emptyTabState = () => ({
  items: [], // mapped, ready-to-render cards for this tab
  rawItems: [], // raw API rows for this tab (kept so "load more" can re-map cleanly)
  page: 0,
  hasMore: true,
  total: 0,
  lastSearch: undefined, // search term this cache was fetched with; mismatch = stale
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

  // No usable expected-return time → fall back to whatever backend sent
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
/*  Small debounce hook — keeps the search TextInput feeling instant while */
/*  delaying the (potentially expensive) filter/sort recompute until the   */
/*  user actually pauses typing.                                          */
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
/*  small page of items the backend returns for the active tab — never    */
/*  to a full multi-hundred-item list.                                    */
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

  const assignedDriver = item.assignedDriver
    ? {
        _id: item.assignedDriver._id,
        fullName: item.assignedDriver.fullName || "",
        mobileNumber: item.assignedDriver.mobileNumber || "",
        profileImage: item.assignedDriver.profileImage || "",
      }
    : null;

  return {
    id: item._id,
    name:
      item.vehicle?.vehicleId?.vehicleName ||
      item.vehicle?.vehicleName ||
      "Unknown Vehicle",
    plate:
      item.vehicle?.vehicleId?.vehicleNumber ||
      item.vehicle?.vehicleNumber ||
      "-",
    image:
      item.vehicle?.vehicleId?.images?.[0]?.url ||
      item.vehicle?.images?.[0]?.url ||
      "https://via.placeholder.com/300",
    customer: item.customer?.fullName || "-",
    phone: item.customer?.mobileNumber || "-",
    booking: item._id?.slice(-8).toUpperCase() || "-",
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
    // Raw expected-return timestamp — used to compute live countdown /
    // overdue / early / on-time on the device.
    dropAt: item.trip?.dropDateTime || null,
    dueIn: isComp
      ? item.returnDetails?.timeStatus || "Completed"
      : item.receiveTracker?.label || "-",
    status,
    statusColor,
    statusBg,
    tab: isComp ? "completed" : tabField,
    assignedDriver,
  };
}

// ==========================================
// COMPONENT: Assign Driver Modal
// ==========================================
function AssignDriverModal({
  visible,
  onClose,
  assignUrl,
  driversUrl = "/bookings/drivers",
  currentDriverId = null,
  onAssigned,
}) {
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(currentDriverId);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedDriver(currentDriverId);
      fetchDrivers();
    }
  }, [visible, currentDriverId]);

  const fetchDrivers = async () => {
    try {
      setLoadingDrivers(true);
      const res = await api.get(driversUrl);
      if (res.data.success) {
        setDrivers(res.data.data || []);
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
  };

  const handleAssign = async () => {
    if (!selectedDriver) {
      return Alert.alert("Select Driver", "Please choose a driver first.");
    }
    try {
      setAssigning(true);
      const res = await api.put(assignUrl, { driverId: selectedDriver });

      if (res.data.success) {
        Alert.alert("Success", res.data.message || "Driver assigned.");
        const assignedDriverObj =
          res.data.data || drivers.find((d) => d._id === selectedDriver);
        onAssigned?.(assignedDriverObj);
        onClose();
      } else {
        Alert.alert("Error", res.data.message || "Unable to assign driver.");
      }
    } catch (err) {
      Alert.alert(
        "Error",
        err?.response?.data?.message || "Unable to assign driver.",
      );
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.modalCard}>
          <View style={modalStyles.dragHandle} />

          <View style={modalStyles.header}>
            <View>
              <Text style={modalStyles.title}>Assign Duty Driver</Text>
              <Text style={modalStyles.subtitle}>
                Select an available driver for this task
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

          {loadingDrivers ? (
            <View style={modalStyles.centerContainer}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={modalStyles.loadingText}>
                Fetching active drivers...
              </Text>
            </View>
          ) : drivers.length === 0 ? (
            <View style={modalStyles.emptyState}>
              <Ionicons
                name="person-remove-outline"
                size={36}
                color="#94A3B8"
              />
              <Text style={modalStyles.emptyTitle}>No Drivers Available</Text>
              <Text style={modalStyles.emptySub}>
                Register active drivers to assign tasks.
              </Text>
            </View>
          ) : (
            <FlatList
              data={drivers}
              keyExtractor={(item) => item._id}
              style={{ maxHeight: 300 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = selectedDriver === item._id;
                return (
                  <TouchableOpacity
                    style={[
                      modalStyles.driverItem,
                      isSelected && modalStyles.driverSelected,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => setSelectedDriver(item._id)}
                  >
                    <Ionicons
                      name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                      size={22}
                      color={isSelected ? "#2563EB" : "#94A3B8"}
                    />
                    <View style={modalStyles.driverMeta}>
                      <Text style={modalStyles.driverName} numberOfLines={1}>
                        {item.fullName || item.name}
                      </Text>
                      <Text style={modalStyles.driverPhone}>
                        {item.mobileNumber || "No contact info"}
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
          )}

          <View style={modalStyles.footerRow}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                modalStyles.assignBtn,
                (!selectedDriver || assigning) && modalStyles.assignBtnDisabled,
              ]}
              onPress={handleAssign}
              disabled={!selectedDriver || assigning}
            >
              {assigning ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={modalStyles.assignBtnText}>
                  Confirm Assignment
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
/*  It mirrors the real card's layout so the screen reads as "already      */
/*  loading content" instead of a blank spinner, and swaps to real cards   */
/*  the instant data lands with no layout jump.                            */
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
/*  CarCard — memoized so typing in search / switching tabs / refresh      */
/*  doesn't re-render every visible card, only the ones whose data changed.*/
/*  Active (not yet returned) cards also re-render on the shared 30s clock */
/*  so "Time Left" / "Overdue By" stays live.                              */
/* ---------------------------------------------------------------------- */
const CarCard = memo(
  function CarCard({ item, onOpenDetail, onCall, onAssignDriver }) {
    const isCompleted = item.tab === "completed";
    const hasBalance = item.balanceAmount > 0;
    const hasDropLocation = item.dropLocation && item.dropLocation !== "-";
    const hasPhone = !!item.phone && item.phone !== "-";

    // Live clock — only subscribed while the vehicle is still out.
    const now = useNow(!isCompleted);

    // Copy-to-clipboard feedback (icon flips to a checkmark for 1.5s)
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

    // Status badge is derived live too, so a card flips to "Overdue" the
    // moment its return time passes (no refresh needed).
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

            {/* Customer Contact: name on the left, copy + call on the right */}
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

            {/* Driver Allocation Row - Assign/Reassign button hidden when completed */}
            <View style={styles.driverAllocationRow}>
              {item.assignedDriver?.fullName ? (
                <View style={styles.driverAssignedBadge}>
                  <Ionicons name="person-circle" size={14} color="#1D4ED8" />
                  <Text style={styles.driverAssignedText} numberOfLines={1}>
                    {item.assignedDriver.fullName}
                  </Text>
                </View>
              ) : (
                <View style={styles.noDriverBadge}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={13}
                    color="#DC2626"
                  />
                  <Text style={styles.noDriverText}>Unassigned</Text>
                </View>
              )}

              {!isCompleted && (
                <TouchableOpacity
                  style={styles.assignActionBtn}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    onAssignDriver(item);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name="person-add-outline"
                    size={11}
                    color="#2563EB"
                  />
                  <Text style={styles.assignActionText}>
                    {item.assignedDriver ? "Reassign" : "Assign"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

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
    prev.onOpenDetail === next.onOpenDetail &&
    prev.onCall === next.onCall &&
    prev.onAssignDriver === next.onAssignDriver,
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

  const [items, setItems] = useState(
    () => screenCache.tabs[screenCache.activeTab].items,
  );
  const [counts, setCounts] = useState(screenCache.counts);
  const [total, setTotal] = useState(
    screenCache.tabs[screenCache.activeTab].total,
  );
  const [hasMore, setHasMore] = useState(
    screenCache.tabs[screenCache.activeTab].hasMore,
  );

  // Only the very first load of the whole session blocks with the full
  // screen loader; every later visit (any tab) shows cached data instantly.
  const [loading, setLoading] = useState(!screenCache.hasFetchedOnce);
  // Small in-list loader used only when switching to a tab we have no
  // cached data for yet.
  const [tabLoading, setTabLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modal State
  const [assignDriverModalVisible, setAssignDriverModalVisible] =
    useState(false);
  const [selectedForDriver, setSelectedForDriver] = useState(null);

  const flatListRef = useRef(null);
  const activeTabRef = useRef(activeTab);
  const isFirstSearchEffect = useRef(true);
  const hasPrefetchedOthers = useRef(false);
  // Holds the in-flight promise for the active tab's very first fetch on
  // mount, so the background "prefetch other tabs" effect (below) can wait
  // for it instead of firing at the same time and fighting it for the
  // device's limited concurrent-connection pool.
  const initialLoadPromiseRef = useRef(null);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const applyResultToState = useCallback((tab, mappedItems, resData) => {
    // Guard against a background fetch for a tab the user has since
    // navigated away from clobbering what's currently on screen.
    if (tab !== activeTabRef.current) return;
    setItems(mappedItems);
    setHasMore(resData.hasMore);
    setTotal(resData.total);
  }, []);

  const fetchTab = useCallback(
    async (
      tab,
      { page = 1, silent = false, searchOverride, includeCounts = false } = {},
    ) => {
      const searchTerm = searchOverride ?? screenCache.search;
      try {
        if (page === 1 && !silent) setTabLoading(true);
        if (page > 1) setLoadingMore(true);

        const res = await api.get("/handover/receive-list", {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            tab,
            page,
            limit: PAGE_SIZE,
            search: searchTerm,
            completedDays: 90,
            // Badge-pill counts don't change between tab switches, "load
            // more" pages, or background prefetch — only ask the backend
            // to recompute them on the moments that actually need fresh
            // numbers (first load, manual refresh), so every other call
            // skips that work server-side entirely.
            includeCounts: includeCounts ? "true" : "false",
          },
        });

        if (res.data.success) {
          const raw = res.data.data || [];
          const cache = screenCache.tabs[tab];
          const rawItems =
            page === 1 ? raw : [...(cache.rawItems || []), ...raw];

          cache.rawItems = rawItems;
          cache.items = rawItems.map(mapRawHandoverToCard);
          cache.page = page;
          cache.hasMore = res.data.hasMore;
          cache.total = res.data.total;
          cache.lastSearch = searchTerm;
          cache.fetchedAt = Date.now();
          if (res.data.counts) {
            screenCache.counts = res.data.counts;
          }

          applyResultToState(tab, cache.items, res.data);
          if (res.data.counts) {
            setCounts(screenCache.counts);
          }
        } else {
          if (!silent) {
            Alert.alert("Error", res.data.message || "Failed to load cars");
          }
        }
      } catch (err) {
        if (!silent) {
          Alert.alert(
            "Error",
            err?.response?.data?.message || "Failed to load cars",
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        setTabLoading(false);
        setLoadingMore(false);
      }
    },
    [token, applyResultToState],
  );

  // ---- Initial load: show cache instantly if we have it, else fetch ----
  useEffect(() => {
    if (!token) return;

    const cache = screenCache.tabs[activeTab];
    const isFresh =
      cache.items.length > 0 && cache.lastSearch === screenCache.search;

    let loadPromise;
    if (isFresh) {
      setItems(cache.items);
      setHasMore(cache.hasMore);
      setTotal(cache.total);
      setLoading(false);
      // Quiet revalidate — cached data is already on screen, so this isn't
      // performance-sensitive; badge counts are unlikely to have moved,
      // so skip recomputing them here too.
      loadPromise = fetchTab(activeTab, { page: 1, silent: true });
    } else {
      setLoading(!screenCache.hasFetchedOnce);
      // First real fetch of the session for this tab — this is the one
      // moment the badge pills actually need fresh numbers.
      loadPromise = fetchTab(activeTab, {
        page: 1,
        silent: screenCache.hasFetchedOnce,
        includeCounts: true,
      });
    }
    initialLoadPromiseRef.current = loadPromise;
    screenCache.hasFetchedOnce = true;

    const savedOffset = screenCache.scrollOffsets[activeTab] || 0;
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

  // ---- Background prefetch of the OTHER tabs, once, staggered — so ----
  // ---- switching tabs feels instant even the very first time.      ----
  // Waits for the active tab's own initial fetch to settle first, so this
  // background work never competes with (and slows down) the request the
  // user is actually looking at.
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
        if (
          cache.items.length === 0 ||
          cache.lastSearch !== screenCache.search
        ) {
          await fetchTab(t, { page: 1, silent: true });
          await new Promise((r) => setTimeout(r, 150)); // don't hammer the API
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, fetchTab]);

  // ---- Search changed: refetch active tab, invalidate other tabs' cache ----
  useEffect(() => {
    if (isFirstSearchEffect.current) {
      isFirstSearchEffect.current = false;
      return;
    }
    screenCache.search = debouncedSearch;
    Object.values(screenCache.tabs).forEach((c) => {
      c.lastSearch = undefined;
    });
    fetchTab(activeTab, { page: 1, searchOverride: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // ---- Persist UI state to the module-level cache as it changes ----
  useEffect(() => {
    screenCache.search = search;
  }, [search]);

  useEffect(() => {
    screenCache.activeTab = activeTab;
  }, [activeTab]);

  const handleTabChange = useCallback(
    (tabId) => {
      if (tabId === activeTab) return;
      setActiveTab(tabId);

      const cache = screenCache.tabs[tabId];
      const isFresh =
        cache.items.length > 0 && cache.lastSearch === screenCache.search;

      setItems(cache.items);
      setHasMore(cache.hasMore);
      setTotal(cache.total);
      setTabLoading(!isFresh);

      const offset = screenCache.scrollOffsets[tabId] || 0;
      flatListRef.current?.scrollToOffset({ offset, animated: false });

      if (!isFresh) {
        fetchTab(tabId, { page: 1, silent: cache.items.length > 0 });
      }
    },
    [activeTab, fetchTab],
  );

  const handleLoadMore = useCallback(() => {
    const cache = screenCache.tabs[activeTab];
    if (!cache.hasMore || loadingMore) return;
    fetchTab(activeTab, { page: (cache.page || 1) + 1, silent: true });
  }, [activeTab, loadingMore, fetchTab]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // Manual refresh is the other moment worth paying for fresh counts.
    fetchTab(activeTab, { page: 1, silent: true, includeCounts: true });
    // Other tabs may now be stale — they'll refetch lazily next time visited.
    Object.entries(screenCache.tabs).forEach(([id, c]) => {
      if (id !== activeTab) c.lastSearch = undefined;
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

  const openAssignDriverModal = useCallback((item) => {
    setSelectedForDriver(item);
    setAssignDriverModalVisible(true);
  }, []);

  const closeAssignDriverModal = () => {
    setAssignDriverModalVisible(false);
    setSelectedForDriver(null);
  };

  const handleDriverAssigned = (driver) => {
    const cache = screenCache.tabs[activeTab];
    const updated = cache.items.map((c) =>
      c.id === selectedForDriver?.id ? { ...c, assignedDriver: driver } : c,
    );
    cache.items = updated;
    setItems(updated);
  };

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
        onAssignDriver={openAssignDriverModal}
      />
    ),
    [handleOpenDetail, handleCall, openAssignDriverModal],
  );

  // ---- Scroll position persistence, per tab ----
  const handleScroll = useCallback(
    (e) => {
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
          <Ionicons name="search-outline" size={16} color="#64748B" />
          <TextInput
            placeholder="Search by customer, vehicle, plate, or ID..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
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
            }
          />
        </>
      )}

      {/* Inline Driver Assignment Modal */}
      {selectedForDriver && (
        <AssignDriverModal
          visible={assignDriverModalVisible}
          onClose={closeAssignDriverModal}
          assignUrl={`/bookings/${selectedForDriver.id}/assign-driver-handover`}
          driversUrl="/bookings/drivers"
          currentDriverId={selectedForDriver.assignedDriver?._id || null}
          onAssigned={handleDriverAssigned}
        />
      )}
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

  // Customer row: [icon + name ............ copy call]
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
});
