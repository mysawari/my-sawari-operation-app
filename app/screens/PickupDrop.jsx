// =====================================================================
//  Pickup & Drop Desk
//
//  Two tabs (Pickup / Drop). A booking appears under Pickup when its
//  service type is "pickup" or "pickup_drop", under Drop when it's
//  "drop" or "pickup_drop".
//
//  Each task moves:  Unassigned → Assigned → On the way → Reached → Completed
//    • Assign / reassign any driver from the card
//    • "Start Trip"   records time + GPS where the team set off
//    • "I've Reached" records time + GPS on arrival (and how far that is
//                     from the booking's map pin, when the link has one)
//    • "Complete"     records time + GPS + optional note
//  Travel time, arrival punctuality and on-site time are computed from
//  those stamps. Search looks across every date and status.
//
//  Frontend only: data lives in services/pickupDropService.js.
//  Needs: npx expo install expo-location
// =====================================================================
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getServiceDrivers,
  getServiceTask,
  listServiceTasks,
  runServiceAction,
} from "../../services/pickupDropService";

const errMsg = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */
const TYPES = [
  { id: "pickup", label: "Pickup", icon: "car-outline" },
  { id: "drop", label: "Drop", icon: "flag-outline" },
];

const FILTERS = [
  { id: "today", label: "Today" },
  { id: "live", label: "Live" },
  { id: "upcoming", label: "Upcoming" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];

const STATUS_META = {
  pending: { label: "Unassigned", color: "#DC2626", bg: "#FEE2E2", step: -1 },
  assigned: { label: "Assigned", color: "#2563EB", bg: "#DBEAFE", step: 0 },
  on_the_way: { label: "On the way", color: "#D97706", bg: "#FEF3C7", step: 1 },
  reached: { label: "Reached", color: "#7C3AED", bg: "#EDE9FE", step: 2 },
  completed: { label: "Completed", color: "#16A34A", bg: "#DCFCE7", step: 3 },
  cancelled: { label: "Cancelled", color: "#64748B", bg: "#F1F5F9", step: -1 },
};

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 60 * 1000;
const POLL_MS = 45 * 1000; // dispatcher view refreshes itself while open
const ON_TIME_MIN = 5; // ±5 min of booked time counts as on time
const FAR_FROM_PIN_M = 500;

/* ------------------------------------------------------------------ */
/*  Module-level cache: survives leaving / re-entering the screen       */
/* ------------------------------------------------------------------ */
const ui = {
  type: "pickup",
  filter: "today",
  mine: false,
  counts: null,
  countsMine: null,
};
const listCache = new Map();
const LIST_CACHE_MAX = 30;
let driversCache = null;

const normalize = (v) => String(v || "").trim();
const cacheKey = (type, filter, mine, term) =>
  `${type}|${term ? "search" : filter}|${mine ? 1 : 0}|${term.toLowerCase()}`;

const isAbortError = (err) =>
  err?.code === "ERR_CANCELED" ||
  err?.name === "CanceledError" ||
  err?.name === "AbortError";

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */
const fmtMinutes = (min) => {
  if (min === null || min === undefined || isNaN(min)) return "-";
  const total = Math.abs(Math.round(min));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  return m ? `${m}m` : "<1m";
};

const fmtTime = (date) => {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d)) return "-";
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${m} ${ap}`;
};

const MONTHS = [
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

const fmtDay = (date) => {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d)) return "-";
  const startOf = (x) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(new Date())) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
};

const fmtDateTime = (date) =>
  date ? `${fmtDay(date)}, ${fmtTime(date)}` : "-";

const fmtDistance = (m) =>
  m === null || m === undefined
    ? null
    : m < 1000
      ? `${m} m`
      : `${(m / 1000).toFixed(1)} km`;

// Arrival vs. booked time
const punctuality = (delayMin) => {
  if (delayMin === null || delayMin === undefined) return null;
  if (Math.abs(delayMin) <= ON_TIME_MIN)
    return { label: "On time", color: "#16A34A" };
  return delayMin > 0
    ? { label: `${fmtMinutes(delayMin)} late`, color: "#DC2626" }
    : { label: `${fmtMinutes(delayMin)} early`, color: "#D97706" };
};

/* ------------------------------------------------------------------ */
/*  Shared 30s clock so live timers tick without one interval per card  */
/* ------------------------------------------------------------------ */
const clockListeners = new Set();
let clockTimer = null;

function useNow(enabled) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    clockListeners.add(setNow);
    if (!clockTimer) {
      clockTimer = setInterval(() => {
        const n = Date.now();
        clockListeners.forEach((fn) => fn(n));
      }, 30000);
    }
    return () => {
      clockListeners.delete(setNow);
      if (!clockListeners.size && clockTimer) {
        clearInterval(clockTimer);
        clockTimer = null;
      }
    };
  }, [enabled]);
  return now;
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// What the timing strip on a card says right now
const liveTiming = (item, now) => {
  const scheduled = item.scheduledAt
    ? new Date(item.scheduledAt).getTime()
    : NaN;
  const m = item.metrics || {};

  switch (item.status) {
    case "on_the_way":
      return {
        label: "On the way",
        value: fmtMinutes((now - new Date(item.startedAt).getTime()) / 60000),
        sub: `Booked for ${fmtTime(item.scheduledAt)}`,
        color: "#D97706",
        icon: "navigate",
      };
    case "reached": {
      const p = punctuality(m.arrivalDelayMinutes);
      return {
        label: "On site",
        value: fmtMinutes((now - new Date(item.reachedAt).getTime()) / 60000),
        sub: `Travel ${fmtMinutes(m.travelMinutes)}${p ? ` • ${p.label}` : ""}`,
        color: "#7C3AED",
        icon: "location",
      };
    }
    case "completed": {
      const p = punctuality(m.arrivalDelayMinutes);
      return {
        label: "Done in",
        value: fmtMinutes(m.totalMinutes),
        sub: `Travel ${fmtMinutes(m.travelMinutes)} • On site ${fmtMinutes(m.onSiteMinutes)}${p ? ` • ${p.label}` : ""}`,
        color: "#16A34A",
        icon: "checkmark-done",
      };
    }
    default: {
      if (isNaN(scheduled))
        return {
          label: "Scheduled",
          value: "-",
          sub: "",
          color: "#64748B",
          icon: "time",
        };
      const diff = (scheduled - now) / 60000;
      if (diff < 0) {
        return {
          label: "Late by",
          value: fmtMinutes(diff),
          sub:
            item.status === "pending"
              ? "No driver assigned yet"
              : "Trip not started yet",
          color: "#DC2626",
          icon: "alert-circle",
        };
      }
      return {
        label: "Starts in",
        value: fmtMinutes(diff),
        sub: item.status === "pending" ? "Assign a driver" : "Waiting to start",
        color: diff <= 60 ? "#D97706" : "#2563EB",
        icon: "time",
      };
    }
  }
};

/* ------------------------------------------------------------------ */
/*  Device helpers                                                     */
/* ------------------------------------------------------------------ */
const withTimeout = (p, ms) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);

async function captureLocation() {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return { error: "permission" };
    if (!(await Location.hasServicesEnabledAsync()))
      return { error: "services" };

    let pos = null;
    try {
      pos = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        15000,
      );
    } catch {
      pos = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
    }
    if (!pos) return { error: "unavailable" };

    const { latitude, longitude, accuracy } = pos.coords;
    let address = "";
    try {
      const [g] = await withTimeout(
        Location.reverseGeocodeAsync({ latitude, longitude }),
        5000,
      );
      if (g) {
        address = [g.name, g.street, g.district || g.subregion, g.city]
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ");
      }
    } catch {
      /* address is optional */
    }

    return {
      location: {
        lat: latitude,
        lng: longitude,
        accuracy,
        address,
        capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
      },
    };
  } catch {
    return { error: "unavailable" };
  }
}

const LOCATION_ERRORS = {
  permission: "Location permission is turned off for this app.",
  services: "Phone location (GPS) is switched off.",
  unavailable: "Couldn't get a GPS fix right now.",
};

const confirmAsync = (title, message, okLabel = "OK") =>
  new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: okLabel, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );

const openUrl = async (url) => {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Can't open", "This link couldn't be opened on this device.");
  }
};

const callNumber = (phone) => {
  if (!phone)
    return Alert.alert("No phone number", "No contact number on this booking.");
  openUrl(`tel:${phone}`);
};

const openCoords = (loc) =>
  loc?.lat !== undefined &&
  openUrl(
    `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`,
  );

const navigateTo = (item) => {
  if (item.mapLink?.trim()) return openUrl(item.mapLink.trim());
  if (item.targetCoords) return openCoords(item.targetCoords);
  if (item.location) {
    return openUrl(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`,
    );
  }
  Alert.alert("No location", "This booking has no address or map link.");
};

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */
const StatusBadge = memo(({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
      <Text style={[styles.statusText, { color: meta.color }]}>
        {meta.label}
      </Text>
    </View>
  );
});

const STEPS = [
  { key: "assignedAt", label: "Assigned" },
  { key: "startedAt", label: "Started" },
  { key: "reachedAt", label: "Reached" },
  { key: "completedAt", label: "Done" },
];

const ProgressStepper = memo(({ item }) => {
  const doneIndex = (STATUS_META[item.status] || STATUS_META.pending).step;
  return (
    <View style={styles.stepper}>
      {STEPS.map((s, i) => {
        const done = i <= doneIndex;
        const current = i === doneIndex + 1 && item.status !== "completed";
        return (
          <View key={s.key} style={styles.stepCol}>
            <View style={styles.stepTrack}>
              <View
                style={[
                  styles.stepLine,
                  i === 0 && styles.stepLineHidden,
                  i <= doneIndex && styles.stepLineDone,
                ]}
              />
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  current && styles.stepDotCurrent,
                ]}
              >
                {done && <Ionicons name="checkmark" size={9} color="#FFFFFF" />}
              </View>
              <View
                style={[
                  styles.stepLine,
                  i === STEPS.length - 1 && styles.stepLineHidden,
                  i < doneIndex && styles.stepLineDone,
                ]}
              />
            </View>
            <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>
              {s.label}
            </Text>
            <Text style={styles.stepTime}>
              {done && item[s.key] ? fmtTime(item[s.key]) : " "}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const ACTION_FOR_STATUS = {
  pending: {
    action: "assign",
    label: "Assign Driver",
    icon: "person-add",
    color: "#2563EB",
  },
  assigned: {
    action: "start",
    label: "Start Trip",
    icon: "navigate",
    color: "#16A34A",
  },
  on_the_way: {
    action: "reach",
    label: "I've Reached",
    icon: "location",
    color: "#7C3AED",
  },
  reached: {
    action: "complete",
    label: "Complete",
    icon: "checkmark-done",
    color: "#0B132B",
  },
};

/* ------------------------------------------------------------------ */
/*  Task card                                                          */
/* ------------------------------------------------------------------ */
const TaskCard = memo(function TaskCard({
  item,
  busyLabel,
  onAssign,
  onAction,
  onOpen,
}) {
  const isClosed = item.status === "completed" || item.status === "cancelled";
  const now = useNow(!isClosed);
  const timing = liveTiming(item, now);
  const primary = ACTION_FOR_STATUS[item.status];
  const primaryLabel =
    primary?.action === "complete"
      ? item.type === "pickup"
        ? "Complete Pickup"
        : "Complete Drop"
      : primary?.label;
  const far =
    item.distanceFromTargetMeters !== null &&
    item.distanceFromTargetMeters > FAR_FROM_PIN_M;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.92}
      onPress={() => onOpen(item)}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View
            style={[
              styles.typeIcon,
              item.type === "drop" && styles.typeIconDrop,
            ]}
          >
            <Ionicons
              name={item.type === "pickup" ? "car-outline" : "flag-outline"}
              size={13}
              color={item.type === "pickup" ? "#2563EB" : "#B45309"}
            />
          </View>
          <Text style={styles.cardHeaderTime}>
            {fmtDay(item.scheduledAt)} • {fmtTime(item.scheduledAt)}
          </Text>
          <Text style={styles.bookingCode}>#{item.bookingCode}</Text>
        </View>
        <StatusBadge status={item.status} />
      </View>

      <View style={styles.cardBody}>
        {/* Vehicle */}
        <View style={styles.vehicleRow}>
          <Text style={styles.vehicleName} numberOfLines={1}>
            {item.vehicleName}
          </Text>
          <View style={styles.platePill}>
            <Text style={styles.plateText}>{item.vehicleNumber}</Text>
          </View>
        </View>

        {/* Customer */}
        <View style={styles.customerRow}>
          <Ionicons name="person-outline" size={13} color="#64748B" />
          <Text style={styles.customerName} numberOfLines={1}>
            {item.customerName}
            {item.mobileNumber ? (
              <Text style={styles.customerPhone}> {item.mobileNumber}</Text>
            ) : null}
          </Text>
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => callNumber(item.mobileNumber)}
            hitSlop={6}
            accessibilityLabel="Call customer"
          >
            <Ionicons name="call" size={13} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Location */}
        <View style={styles.locationBox}>
          <Ionicons
            name="location"
            size={15}
            color={item.type === "pickup" ? "#2563EB" : "#B45309"}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.locationText} numberOfLines={2}>
              {item.location || "No address added"}
            </Text>
            {!!item.landmark && (
              <Text style={styles.landmarkText} numberOfLines={1}>
                Near {item.landmark}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => navigateTo(item)}
            hitSlop={6}
            accessibilityLabel="Open in maps"
          >
            <Ionicons name="navigate" size={15} color="#2563EB" />
          </TouchableOpacity>
        </View>

        {/* Driver */}
        <View style={styles.driverRow}>
          {item.driver ? (
            <View style={styles.driverBadge}>
              <Ionicons name="person-circle" size={15} color="#1D4ED8" />
              <Text style={styles.driverText} numberOfLines={1}>
                {item.driver.fullName}
              </Text>
              {!!item.driver.mobileNumber && (
                <TouchableOpacity
                  onPress={() => callNumber(item.driver.mobileNumber)}
                  hitSlop={8}
                >
                  <Ionicons name="call-outline" size={13} color="#1D4ED8" />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.noDriverBadge}>
              <Ionicons name="alert-circle-outline" size={13} color="#DC2626" />
              <Text style={styles.noDriverText}>No driver</Text>
            </View>
          )}
          {!isClosed && (
            <TouchableOpacity
              style={styles.assignBtn}
              onPress={() => onAssign(item)}
              activeOpacity={0.75}
            >
              <Ionicons name="swap-horizontal" size={12} color="#2563EB" />
              <Text style={styles.assignBtnText}>
                {item.driver ? "Reassign" : "Assign"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {far && (
          <View style={styles.warnRow}>
            <Ionicons name="warning-outline" size={13} color="#B45309" />
            <Text style={styles.warnText}>
              Marked reached {fmtDistance(item.distanceFromTargetMeters)} from
              the map pin
            </Text>
          </View>
        )}
      </View>

      <ProgressStepper item={item} />

      {/* Timing strip */}
      <View style={styles.timingStrip}>
        <Ionicons name={timing.icon} size={15} color={timing.color} />
        <Text style={styles.timingLabel}>{timing.label}</Text>
        <Text style={[styles.timingValue, { color: timing.color }]}>
          {timing.value}
        </Text>
        <Text style={styles.timingSub} numberOfLines={1}>
          {timing.sub}
        </Text>
      </View>

      {/* Primary action */}
      {primary && (
        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: primary.color },
              !!busyLabel && { opacity: 0.75 },
            ]}
            activeOpacity={0.88}
            disabled={!!busyLabel}
            onPress={() =>
              primary.action === "assign"
                ? onAssign(item)
                : onAction(item, primary.action)
            }
          >
            {busyLabel ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>{busyLabel}</Text>
              </>
            ) : (
              <>
                <Ionicons name={primary.icon} size={16} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
                <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
});

/* ------------------------------------------------------------------ */
/*  Assign driver (any user) — searchable                              */
/* ------------------------------------------------------------------ */
function AssignDriverModal({ item, onClose, onAssigned }) {
  const [drivers, setDrivers] = useState(driversCache || []);
  const [loading, setLoading] = useState(!driversCache);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(item?.driver?._id || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(item?.driver?._id || null);
    setQuery("");
  }, [item]);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getServiceDrivers();
        if (!cancelled) {
          driversCache = list;
          setDrivers(list);
        }
      } catch (err) {
        if (!cancelled && !driversCache) {
          Alert.alert("Error", errMsg(err, "Unable to load drivers."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter(
      (d) =>
        d.fullName?.toLowerCase().includes(q) ||
        d.mobileNumber?.includes(q) ||
        d.role?.toLowerCase().includes(q),
    );
  }, [drivers, query]);

  const handleAssign = async () => {
    if (!selected || !item) return;
    try {
      setSaving(true);
      const card = await runServiceAction(item.bookingId, item.type, "assign", {
        driverId: selected,
      });
      onAssigned(card);
      onClose();
    } catch (err) {
      Alert.alert("Error", errMsg(err, "Unable to assign driver."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={!!item}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={sheet.overlay}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={sheet.card}>
          <View style={sheet.handle} />
          <View style={sheet.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={sheet.title}>
                {item?.driver ? "Reassign Driver" : "Assign Driver"}
              </Text>
              <Text style={sheet.subtitle} numberOfLines={1}>
                {item?.type === "pickup" ? "Pickup" : "Drop"} •{" "}
                {item?.customerName} • #{item?.bookingCode}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={sheet.closeBtn}
              hitSlop={12}
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={sheet.searchBox}>
            <Ionicons name="search-outline" size={15} color="#64748B" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, mobile or role"
              placeholderTextColor="#94A3B8"
              style={sheet.searchInput}
              autoCorrect={false}
            />
          </View>

          {loading ? (
            <View style={sheet.center}>
              <ActivityIndicator size="small" color="#2563EB" />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(d) => d._id}
              style={{ maxHeight: 320 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={sheet.empty}>No matching team members.</Text>
              }
              renderItem={({ item: d }) => {
                const isSel = selected === d._id;
                const isCurrent = item?.driver?._id === d._id;
                return (
                  <TouchableOpacity
                    style={[sheet.driverItem, isSel && sheet.driverItemSel]}
                    onPress={() => setSelected(d._id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isSel ? "checkmark-circle" : "ellipse-outline"}
                      size={22}
                      color={isSel ? "#2563EB" : "#94A3B8"}
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={sheet.driverName} numberOfLines={1}>
                        {d.fullName || "Unnamed"}
                      </Text>
                      <Text style={sheet.driverMeta}>
                        {[d.mobileNumber, d.role].filter(Boolean).join(" • ") ||
                          "No contact info"}
                      </Text>
                    </View>
                    {isCurrent && (
                      <View style={sheet.currentTag}>
                        <Text style={sheet.currentTagText}>Current</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <View style={sheet.footer}>
            <TouchableOpacity style={sheet.cancelBtn} onPress={onClose}>
              <Text style={sheet.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                sheet.confirmBtn,
                (!selected || saving || selected === item?.driver?._id) && {
                  opacity: 0.5,
                },
              ]}
              disabled={!selected || saving || selected === item?.driver?._id}
              onPress={handleAssign}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={sheet.confirmText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirm Start / Reached / Complete                                 */
/* ------------------------------------------------------------------ */
const ACTION_COPY = {
  start: {
    title: "Start trip?",
    body: "The current time and your location will be saved as the start of this trip.",
    cta: "Start Trip",
    color: "#16A34A",
    icon: "navigate",
  },
  reach: {
    title: "Reached the location?",
    body: "Your arrival time and current location will be saved. Make sure you're at the customer's spot.",
    cta: "Yes, I've Reached",
    color: "#7C3AED",
    icon: "location",
  },
  complete: {
    title: "Complete this task?",
    body: "Marks the job done and saves the time and your location.",
    cta: "Complete",
    color: "#0B132B",
    icon: "checkmark-done",
  },
};

function ConfirmActionSheet({ request, onCancel, onConfirm }) {
  const [notes, setNotes] = useState("");
  useEffect(() => setNotes(""), [request]);
  const copy = request ? ACTION_COPY[request.action] : null;
  const item = request?.item;

  return (
    <Modal
      visible={!!request}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={sheet.overlay}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onCancel}
        />
        {copy && (
          <View style={sheet.card}>
            <View style={sheet.handle} />
            <View
              style={[sheet.actionIcon, { backgroundColor: `${copy.color}1A` }]}
            >
              <Ionicons name={copy.icon} size={24} color={copy.color} />
            </View>
            <Text style={[sheet.title, { textAlign: "center" }]}>
              {copy.title}
            </Text>
            <Text style={sheet.actionBody}>{copy.body}</Text>

            <View style={sheet.summaryBox}>
              <Text style={sheet.summaryLine} numberOfLines={1}>
                <Text style={sheet.summaryKey}>
                  {item.type === "pickup" ? "Pickup" : "Drop"}{" "}
                </Text>
                {item.customerName} • {item.vehicleNumber}
              </Text>
              <Text style={sheet.summaryLine} numberOfLines={2}>
                <Text style={sheet.summaryKey}>Address </Text>
                {item.location || "-"}
              </Text>
              <Text style={sheet.summaryLine}>
                <Text style={sheet.summaryKey}>Booked </Text>
                {fmtDateTime(item.scheduledAt)}
              </Text>
            </View>

            {request.action === "complete" && (
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes (optional) — fuel, km, anything to flag"
                placeholderTextColor="#94A3B8"
                style={sheet.notesInput}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
            )}

            <View style={sheet.footer}>
              <TouchableOpacity style={sheet.cancelBtn} onPress={onCancel}>
                <Text style={sheet.cancelText}>Not yet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[sheet.confirmBtn, { backgroundColor: copy.color }]}
                onPress={() => onConfirm(request, notes.trim())}
              >
                <Text style={sheet.confirmText}>{copy.cta}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail sheet: metrics, locations, full timeline, undo              */
/* ------------------------------------------------------------------ */
const EVENT_META = {
  assigned: { icon: "person-add", color: "#2563EB", label: "Driver assigned" },
  reassigned: {
    icon: "swap-horizontal",
    color: "#2563EB",
    label: "Driver reassigned",
  },
  started: { icon: "navigate", color: "#16A34A", label: "Trip started" },
  reached: { icon: "location", color: "#7C3AED", label: "Reached location" },
  completed: { icon: "checkmark-done", color: "#0B132B", label: "Completed" },
  cancelled: { icon: "close-circle", color: "#64748B", label: "Cancelled" },
  note: { icon: "document-text", color: "#64748B", label: "Note" },
};

function DetailSheet({ item, onClose, onUpdated, onAssign }) {
  const [full, setFull] = useState(item);
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    setFull(item);
    if (!item) return;
    let cancelled = false;
    setLoading(true);
    getServiceTask(item.bookingId, item.type)
      .then((card) => {
        if (!cancelled) setFull(card);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!item) return null;
  const d = full || item;
  const m = d.metrics || {};
  const p = punctuality(m.arrivalDelayMinutes);
  const canUndo = ["on_the_way", "reached", "completed"].includes(d.status);

  const handleUndo = async () => {
    const ok = await confirmAsync(
      "Undo last step?",
      `This moves the task back from "${STATUS_META[d.status].label}". The timeline keeps a record.`,
      "Undo",
    );
    if (!ok) return;
    try {
      setUndoing(true);
      const card = await runServiceAction(d.bookingId, d.type, "undo");
      setFull(card);
      onUpdated(card);
    } catch (err) {
      Alert.alert("Error", errMsg(err, "Unable to undo."));
    } finally {
      setUndoing(false);
    }
  };

  const LocRow = ({ label, loc, at }) =>
    loc?.lat !== undefined ? (
      <TouchableOpacity
        style={detail.locRow}
        onPress={() => openCoords(loc)}
        activeOpacity={0.7}
      >
        <Ionicons name="pin-outline" size={14} color="#2563EB" />
        <View style={{ flex: 1 }}>
          <Text style={detail.locLabel}>
            {label} • {fmtDateTime(at)}
          </Text>
          <Text style={detail.locText} numberOfLines={2}>
            {loc.address || `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`}
            {loc.accuracy ? `  (±${Math.round(loc.accuracy)} m)` : ""}
          </Text>
        </View>
        <Ionicons name="open-outline" size={14} color="#94A3B8" />
      </TouchableOpacity>
    ) : null;

  return (
    <Modal
      visible={!!item}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View style={detail.header}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            style={detail.headerBtn}
          >
            <Ionicons name="chevron-down" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={detail.title}>
              {d.type === "pickup" ? "Pickup" : "Drop"} #{d.bookingCode}
            </Text>
            <Text style={detail.subtitle}>
              Booked for {fmtDateTime(d.scheduledAt)}
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <StatusBadge status={d.status} />
          )}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Metrics */}
          <View style={detail.metricsGrid}>
            {[
              { label: "Travel time", value: fmtMinutes(m.travelMinutes) },
              { label: "Arrival", value: p?.label || "-", color: p?.color },
              { label: "On site", value: fmtMinutes(m.onSiteMinutes) },
              { label: "Total", value: fmtMinutes(m.totalMinutes) },
            ].map((x) => (
              <View key={x.label} style={detail.metric}>
                <Text style={detail.metricLabel}>{x.label}</Text>
                <Text
                  style={[detail.metricValue, x.color && { color: x.color }]}
                >
                  {x.value}
                </Text>
              </View>
            ))}
          </View>

          {/* Customer + vehicle */}
          <View style={detail.section}>
            <Text style={detail.sectionTitle}>Booking</Text>
            <View style={detail.kv}>
              <Text style={detail.k}>Customer</Text>
              <Text style={detail.v}>{d.customerName}</Text>
            </View>
            <View style={detail.kv}>
              <Text style={detail.k}>Mobile</Text>
              <TouchableOpacity onPress={() => callNumber(d.mobileNumber)}>
                <Text style={[detail.v, detail.link]}>
                  {d.mobileNumber || "-"}
                </Text>
              </TouchableOpacity>
            </View>
            {!!d.alternateMobileNumber && (
              <View style={detail.kv}>
                <Text style={detail.k}>Alternate</Text>
                <TouchableOpacity
                  onPress={() => callNumber(d.alternateMobileNumber)}
                >
                  <Text style={[detail.v, detail.link]}>
                    {d.alternateMobileNumber}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={detail.kv}>
              <Text style={detail.k}>Vehicle</Text>
              <Text style={detail.v}>
                {d.vehicleName} • {d.vehicleNumber}
              </Text>
            </View>
            {d.charge > 0 && (
              <View style={detail.kv}>
                <Text style={detail.k}>
                  {d.type === "pickup" ? "Pickup" : "Drop"} charge
                </Text>
                <Text style={detail.v}>
                  ₹{d.charge.toLocaleString("en-IN")}
                </Text>
              </View>
            )}
          </View>

          {/* Place */}
          <View style={detail.section}>
            <Text style={detail.sectionTitle}>
              {d.type === "pickup" ? "Pickup point" : "Drop point"}
            </Text>
            <Text style={detail.placeText}>
              {d.location || "No address added"}
            </Text>
            {!!d.landmark && (
              <Text style={detail.placeSub}>Landmark: {d.landmark}</Text>
            )}
            {!!d.serviceNotes && (
              <Text style={detail.placeSub}>
                Instructions: {d.serviceNotes}
              </Text>
            )}
            <TouchableOpacity
              style={detail.mapBtn}
              onPress={() => navigateTo(d)}
            >
              <Ionicons name="navigate" size={14} color="#FFFFFF" />
              <Text style={detail.mapBtnText}>Navigate</Text>
            </TouchableOpacity>
          </View>

          {/* Driver */}
          <View style={detail.section}>
            <View style={detail.sectionHeadRow}>
              <Text style={detail.sectionTitle}>Driver</Text>
              {d.status !== "completed" && (
                <TouchableOpacity onPress={() => onAssign(d)}>
                  <Text style={detail.link}>
                    {d.driver ? "Reassign" : "Assign"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {d.driver ? (
              <View style={detail.kv}>
                <Text style={detail.v}>{d.driver.fullName}</Text>
                <TouchableOpacity
                  onPress={() => callNumber(d.driver.mobileNumber)}
                >
                  <Text style={[detail.v, detail.link]}>
                    {d.driver.mobileNumber}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={detail.placeSub}>No driver assigned yet.</Text>
            )}
          </View>

          {/* Captured locations */}
          {(d.startLocation || d.reachLocation || d.completeLocation) && (
            <View style={detail.section}>
              <Text style={detail.sectionTitle}>Recorded locations</Text>
              <LocRow
                label="Started from"
                loc={d.startLocation}
                at={d.startedAt}
              />
              <LocRow
                label="Reached at"
                loc={d.reachLocation}
                at={d.reachedAt}
              />
              <LocRow
                label="Completed at"
                loc={d.completeLocation}
                at={d.completedAt}
              />
              {d.distanceFromTargetMeters !== null && (
                <Text
                  style={[
                    detail.placeSub,
                    {
                      color:
                        d.distanceFromTargetMeters > FAR_FROM_PIN_M
                          ? "#B45309"
                          : "#16A34A",
                    },
                  ]}
                >
                  Reached {fmtDistance(d.distanceFromTargetMeters)} from the
                  booking's map pin
                </Text>
              )}
              {!!d.notes && (
                <Text style={detail.placeSub}>Completion note: {d.notes}</Text>
              )}
            </View>
          )}

          {/* Timeline */}
          <View style={detail.section}>
            <Text style={detail.sectionTitle}>Timeline</Text>
            {(d.timeline || []).length === 0 ? (
              <Text style={detail.placeSub}>Nothing recorded yet.</Text>
            ) : (
              [...d.timeline].reverse().map((e, i, arr) => {
                const meta = EVENT_META[e.type] || EVENT_META.note;
                const who = e.by?.fullName;
                const driverName = e.driver?.fullName;
                return (
                  <View key={`${e.type}-${e.at}-${i}`} style={detail.tlRow}>
                    <View style={detail.tlRail}>
                      <View
                        style={[detail.tlDot, { backgroundColor: meta.color }]}
                      >
                        <Ionicons name={meta.icon} size={11} color="#FFFFFF" />
                      </View>
                      {i < arr.length - 1 && <View style={detail.tlLine} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 14 }}>
                      <Text style={detail.tlTitle}>
                        {meta.label}
                        {driverName &&
                        ["assigned", "reassigned"].includes(e.type)
                          ? ` → ${driverName}`
                          : ""}
                      </Text>
                      <Text style={detail.tlMeta}>
                        {fmtDateTime(e.at)}
                        {who ? ` • by ${who}` : ""}
                      </Text>
                      {!!e.note && <Text style={detail.tlNote}>{e.note}</Text>}
                      {e.location?.lat !== undefined && (
                        <TouchableOpacity
                          onPress={() => openCoords(e.location)}
                        >
                          <Text
                            style={[detail.tlNote, detail.link]}
                            numberOfLines={1}
                          >
                            📍{" "}
                            {e.location.address ||
                              `${e.location.lat.toFixed(5)}, ${e.location.lng.toFixed(5)}`}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {canUndo && (
            <TouchableOpacity
              style={detail.undoBtn}
              onPress={handleUndo}
              disabled={undoing}
            >
              {undoing ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <>
                  <Ionicons
                    name="arrow-undo-outline"
                    size={15}
                    color="#DC2626"
                  />
                  <Text style={detail.undoText}>Undo last step</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */
export default function PickupDropScreen() {
  const router = useRouter();

  const [type, setType] = useState(ui.type);
  const [filter, setFilter] = useState(ui.filter);
  const [mine, setMine] = useState(ui.mine);
  const [search, setSearch] = useState("");
  const term = normalize(useDebouncedValue(search, SEARCH_DEBOUNCE_MS));

  const key = cacheKey(type, filter, mine, term);
  const initial = listCache.get(key);

  const [items, setItems] = useState(initial?.items || []);
  const [hasMore, setHasMore] = useState(initial?.hasMore || false);
  const [total, setTotal] = useState(initial?.total || 0);
  const [counts, setCounts] = useState(ui.counts);
  const [loading, setLoading] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [assignFor, setAssignFor] = useState(null);
  const [confirmReq, setConfirmReq] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const [busy, setBusy] = useState(null); // { id, label }

  const flatListRef = useRef(null);
  const keyRef = useRef(key);
  keyRef.current = key;
  const queryRef = useRef(null);
  queryRef.current = { type, filter, mine, term };
  const busyRef = useRef(null);
  busyRef.current = busy;
  const seqRef = useRef(0);
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchPage = useCallback(
    async (q, { page = 1, includeCounts = false } = {}) => {
      const k = cacheKey(q.type, q.filter, q.mine, q.term);
      let signal;
      let seq = 0;
      if (page === 1) {
        abortRef.current?.abort();
        const c = new AbortController();
        abortRef.current = c;
        signal = c.signal;
        seq = ++seqRef.current;
      }
      const stale = () => page === 1 && seq !== seqRef.current;

      try {
        const d = await listServiceTasks(
          {
            type: q.type,
            filter: q.filter,
            mine: q.mine ? "true" : "false",
            search: q.term,
            page,
            limit: PAGE_SIZE,
            includeCounts: includeCounts ? "true" : "false",
          },
          { signal },
        );
        if (stale()) return;

        const prev = listCache.get(k);
        if (page > 1 && prev?.page !== page - 1) return; // a refresh replaced the list meanwhile

        let nextItems = d.data || [];
        if (page > 1) {
          const seen = new Set(prev.items.map((x) => x.id));
          nextItems = [
            ...prev.items,
            ...nextItems.filter((x) => !seen.has(x.id)),
          ];
        }
        const entry = {
          items: nextItems,
          page,
          hasMore: !!d.hasMore,
          total: d.total || 0,
          fetchedAt: Date.now(),
        };
        listCache.delete(k);
        listCache.set(k, entry);
        if (listCache.size > LIST_CACHE_MAX)
          listCache.delete(listCache.keys().next().value);

        if (d.counts) {
          ui.counts = d.counts;
          ui.countsMine = q.mine;
          setCounts(d.counts);
        }
        if (k === keyRef.current) {
          setItems(entry.items);
          setHasMore(entry.hasMore);
          setTotal(entry.total);
          setError("");
        }
      } catch (err) {
        if (isAbortError(err) || stale()) return;
        if (k === keyRef.current) setError(errMsg(err, "Unable to load tasks"));
      } finally {
        if (!stale() && k === keyRef.current) {
          if (page === 1) {
            setLoading(false);
            setRefreshing(false);
          } else {
            setLoadingMore(false);
          }
        }
      }
    },
    [],
  );

  // Load whenever tab / filter / "my tasks" / search changes. Cached
  // results paint instantly; anything older than CACHE_TTL refetches.
  useEffect(() => {
    const entry = listCache.get(key);
    if (entry) {
      setItems(entry.items);
      setHasMore(entry.hasMore);
      setTotal(entry.total);
      setLoading(false);
    } else {
      setItems([]);
      setHasMore(false);
      setTotal(0);
      setLoading(true);
    }
    setError("");
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });

    const fresh = entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
    if (!fresh) {
      fetchPage(queryRef.current, {
        includeCounts: !ui.counts || ui.countsMine !== mine,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Keep the board live for the dispatcher while this screen is open.
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => {
        const e = listCache.get(keyRef.current);
        if (!e || e.page > 1 || busyRef.current) return;
        fetchPage(queryRef.current, { includeCounts: true });
      }, POLL_MS);
      return () => clearInterval(id);
    }, [fetchPage]),
  );

  const changeType = (t) => {
    if (t === type) return;
    ui.type = t;
    setType(t);
  };
  const changeFilter = (f) => {
    if (f === filter) return;
    ui.filter = f;
    setFilter(f);
  };
  const toggleMine = () => {
    ui.mine = !mine;
    setMine((v) => !v);
  };

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    for (const e of listCache.values()) e.fetchedAt = 0;
    fetchPage(queryRef.current, { includeCounts: true });
  }, [fetchPage]);

  const handleLoadMore = useCallback(() => {
    const e = listCache.get(keyRef.current);
    if (!e || !e.hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    fetchPage(queryRef.current, { page: e.page + 1 });
  }, [fetchPage, loadingMore, loading]);

  const refreshCounts = useCallback(async () => {
    try {
      const q = queryRef.current;
      const d = await listServiceTasks({
        type: q.type,
        filter: "open",
        mine: q.mine ? "true" : "false",
        limit: 1,
        includeCounts: "true",
      });
      if (d?.counts) {
        ui.counts = d.counts;
        ui.countsMine = q.mine;
        setCounts(d.counts);
      }
    } catch {
      /* counts refresh on next poll */
    }
  }, []);

  // Swap an updated card in everywhere. It stays visible in the current
  // list (so the team sees the result of their tap); other lists are
  // marked stale and refetch the next time they're opened.
  const patchCard = useCallback(
    (card) => {
      if (!card) return;
      setItems((prev) => prev.map((c) => (c.id === card.id ? card : c)));
      for (const [k, e] of listCache) {
        if (k === keyRef.current)
          e.items = e.items.map((c) => (c.id === card.id ? card : c));
        else e.fetchedAt = 0;
      }
      setDetailFor((d) => (d && d.id === card.id ? card : d));
      refreshCounts();
    },
    [refreshCounts],
  );

  const openConfirm = useCallback(
    (item, action) => setConfirmReq({ item, action }),
    [],
  );
  const openAssign = useCallback((item) => setAssignFor(item), []);
  const openDetail = useCallback((item) => setDetailFor(item), []);

  const performAction = useCallback(
    async ({ item, action }, notes) => {
      setConfirmReq(null);
      if (busyRef.current) return;

      setBusy({ id: item.id, label: "Getting location…" });
      const loc = await captureLocation();
      if (!loc.location) {
        const go = await confirmAsync(
          "Location not available",
          `${LOCATION_ERRORS[loc.error] || LOCATION_ERRORS.unavailable} Save without location? Only the time will be recorded.`,
          "Save anyway",
        );
        if (!go) {
          setBusy(null);
          return;
        }
      }

      setBusy({ id: item.id, label: "Saving…" });
      try {
        const card = await runServiceAction(item.bookingId, item.type, action, {
          location: loc.location || null,
          notes: notes || undefined,
        });
        patchCard(card);
      } catch (err) {
        Alert.alert(
          "Couldn't update",
          errMsg(err, "Please check your connection and try again."),
        );
        if (err?.response?.status === 409) handleRefresh();
      } finally {
        setBusy(null);
      }
    },
    [patchCard, handleRefresh],
  );

  const renderCard = useCallback(
    ({ item }) => (
      <TaskCard
        item={item}
        busyLabel={busy?.id === item.id ? busy.label : null}
        onAssign={openAssign}
        onAction={openConfirm}
        onOpen={openDetail}
      />
    ),
    [busy, openAssign, openConfirm, openDetail],
  );

  const typeCounts = counts?.[type] || {};

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor="#0B132B" />

      {/* Header */}
      <LinearGradient colors={["#0B132B", "#1C2541"]} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerBtn}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Pickup & Drop</Text>
            <Text style={styles.headerSub}>
              {loading
                ? "Loading…"
                : `Showing ${items.length} of ${total} task${total !== 1 ? "s" : ""}`}
              {typeCounts.live ? ` • ${typeCounts.live} live` : ""}
            </Text>
          </View>
          <TouchableOpacity
            onPress={toggleMine}
            style={[styles.mineBtn, mine && styles.mineBtnActive]}
            hitSlop={6}
          >
            <Ionicons
              name={mine ? "person" : "person-outline"}
              size={14}
              color={mine ? "#0B132B" : "#FFFFFF"}
            />
            <Text style={[styles.mineText, mine && styles.mineTextActive]}>
              My tasks
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRefresh}
            style={styles.headerBtn}
            hitSlop={10}
          >
            <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Pickup / Drop tabs */}
        <View style={styles.typeTabs}>
          {TYPES.map((t) => {
            const active = type === t.id;
            const open = counts?.[t.id]?.open;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.typeTab, active && styles.typeTabActive]}
                onPress={() => changeType(t.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={t.icon}
                  size={16}
                  color={active ? "#0B132B" : "rgba(255,255,255,0.8)"}
                />
                <Text
                  style={[
                    styles.typeTabText,
                    active && styles.typeTabTextActive,
                  ]}
                >
                  {t.label}
                </Text>
                {typeof open === "number" && open > 0 && (
                  <View
                    style={[styles.typeCount, active && styles.typeCountActive]}
                  >
                    <Text
                      style={[
                        styles.typeCountText,
                        active && styles.typeCountTextActive,
                      ]}
                    >
                      {open}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      {/* Search */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#64748B" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search any booking — customer, mobile, vehicle, plate, ID, driver"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
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

      {/* Filters (hidden while searching — search covers every date/status) */}
      {term ? (
        <View style={styles.searchHint}>
          <Ionicons
            name="information-circle-outline"
            size={14}
            color="#2563EB"
          />
          <Text style={styles.searchHintText}>
            Searching all {type === "pickup" ? "pickups" : "drops"} — every date
            and status
          </Text>
        </View>
      ) : (
        <View>
          <FlatList
            horizontal
            data={FILTERS}
            keyExtractor={(f) => f.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            renderItem={({ item: f }) => {
              const active = filter === f.id;
              const n = typeCounts[f.id];
              return (
                <TouchableOpacity
                  onPress={() => changeFilter(f.id)}
                  style={[
                    styles.filterPill,
                    active && styles.filterPillActive,
                    f.id === "overdue" &&
                      n > 0 &&
                      !active &&
                      styles.filterPillAlert,
                  ]}
                  activeOpacity={0.75}
                >
                  {f.id === "live" && n > 0 && <View style={styles.liveDot} />}
                  <Text
                    style={[
                      styles.filterText,
                      active && styles.filterTextActive,
                    ]}
                  >
                    {f.label}
                    {typeof n === "number" ? ` (${n})` : ""}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* List */}
      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0B132B" />
          <Text style={styles.centerText}>
            {term ? `Searching "${term}"…` : "Loading tasks…"}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderCard}
          extraData={busy}
          contentContainerStyle={[
            styles.list,
            items.length === 0 && { flexGrow: 1 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          initialNumToRender={6}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#0B132B"
            />
          }
          ListHeaderComponent={
            error ? (
              <TouchableOpacity style={styles.errorBox} onPress={handleRefresh}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={15}
                  color="#B91C1C"
                />
                <Text style={styles.errorText}>{error} — tap to retry</Text>
              </TouchableOpacity>
            ) : null
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMore}>
                <ActivityIndicator size="small" color="#0B132B" />
                <Text style={styles.centerText}>Loading more…</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons
                  name={
                    type === "pickup" ? "car-arrow-right" : "car-arrow-left"
                  }
                  size={30}
                  color="#94A3B8"
                />
              </View>
              <Text style={styles.emptyTitle}>
                {term
                  ? "No matching bookings"
                  : `No ${type === "pickup" ? "pickups" : "drops"} here`}
              </Text>
              <Text style={styles.emptySub}>
                {term
                  ? `Nothing with a ${type} service matched "${term}".`
                  : mine
                    ? "Nothing assigned to you under this filter."
                    : "Bookings with a pickup/drop service will show up here."}
              </Text>
            </View>
          }
        />
      )}

      <AssignDriverModal
        item={assignFor}
        onClose={() => setAssignFor(null)}
        onAssigned={patchCard}
      />
      <ConfirmActionSheet
        request={confirmReq}
        onCancel={() => setConfirmReq(null)}
        onConfirm={performAction}
      />
      <DetailSheet
        item={detailFor}
        onClose={() => setDetailFor(null)}
        onUpdated={patchCard}
        onAssign={(d) => {
          setDetailFor(null);
          setTimeout(() => setAssignFor(d), 350); // let the sheet close first (iOS can't stack modals)
        }}
      />
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },

  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  headerSub: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 2 },
  mineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  mineBtnActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  mineText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
  mineTextActive: { color: "#0B132B" },

  typeTabs: {
    flexDirection: "row",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 4,
  },
  typeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  typeTabActive: { backgroundColor: "#FFFFFF" },
  typeTabText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "700",
  },
  typeTabTextActive: { color: "#0B132B" },
  typeCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  typeCountActive: { backgroundColor: "#0B132B" },
  typeCountText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  typeCountTextActive: { color: "#FFFFFF" },

  searchSection: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  searchBox: {
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
  searchInput: { flex: 1, fontSize: 13, color: "#0F172A", paddingVertical: 0 },
  searchHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
  },
  searchHintText: { fontSize: 11, color: "#2563EB", fontWeight: "600" },

  filterRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterPillActive: { backgroundColor: "#0B132B", borderColor: "#0B132B" },
  filterPillAlert: { borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" },
  filterText: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  filterTextActive: { color: "#FFFFFF" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#F59E0B" },

  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  centerText: { fontSize: 12, color: "#64748B" },
  loadMore: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 18,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  errorText: { flex: 1, fontSize: 12, color: "#B91C1C" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 56,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#334155" },
  emptySub: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },

  // Card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },
  typeIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  typeIconDrop: { backgroundColor: "#FEF3C7" },
  cardHeaderTime: { fontSize: 12, fontWeight: "700", color: "#0F172A" },
  bookingCode: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    backgroundColor: "#EEF2F7",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "800" },

  cardBody: { paddingHorizontal: 14, paddingTop: 12, gap: 8 },
  vehicleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  vehicleName: { flex: 1, fontSize: 15, fontWeight: "700", color: "#0F172A" },
  platePill: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  plateText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: 0.3,
  },
  customerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  customerName: { flex: 1, fontSize: 13, fontWeight: "600", color: "#334155" },
  customerPhone: { fontWeight: "400", color: "#64748B" },
  callBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  locationBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },
  locationText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E293B",
    lineHeight: 17,
  },
  landmarkText: { fontSize: 11, color: "#64748B", marginTop: 2 },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  driverBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    flexShrink: 1,
  },
  driverText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1D4ED8",
    flexShrink: 1,
  },
  noDriverBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  noDriverText: { fontSize: 12, fontWeight: "600", color: "#DC2626" },
  assignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  assignBtnText: { fontSize: 11, fontWeight: "700", color: "#2563EB" },
  warnRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  warnText: { fontSize: 11, color: "#B45309", fontWeight: "600" },

  // Stepper
  stepper: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingTop: 14,
    paddingBottom: 6,
  },
  stepCol: { flex: 1, alignItems: "center" },
  stepTrack: { flexDirection: "row", alignItems: "center", width: "100%" },
  stepLine: { flex: 1, height: 2, backgroundColor: "#E2E8F0" },
  stepLineDone: { backgroundColor: "#16A34A" },
  stepLineHidden: { backgroundColor: "transparent" },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
  stepDotCurrent: { borderColor: "#2563EB" },
  stepLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 4,
  },
  stepLabelDone: { color: "#0F172A" },
  stepTime: { fontSize: 9, color: "#64748B", marginTop: 1 },

  timingStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 12,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
  },
  timingLabel: { fontSize: 11, color: "#64748B", fontWeight: "600" },
  timingValue: { fontSize: 13, fontWeight: "800" },
  timingSub: { flex: 1, fontSize: 11, color: "#64748B", textAlign: "right" },

  cardFooter: { padding: 12 },
  primaryBtn: {
    height: 44,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});

const sheet = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "85%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  closeBtn: { padding: 4, backgroundColor: "#F1F5F9", borderRadius: 20 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13, color: "#0F172A", paddingVertical: 0 },
  center: { paddingVertical: 40, alignItems: "center" },
  empty: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 12,
    paddingVertical: 24,
  },
  driverItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  driverItemSel: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  driverName: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  driverMeta: { fontSize: 11, color: "#64748B", marginTop: 2 },
  currentTag: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  currentTagText: { fontSize: 10, fontWeight: "700", color: "#16A34A" },
  footer: { flexDirection: "row", gap: 10, marginTop: 14 },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
  confirmBtn: {
    flex: 1.5,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  actionBody: {
    fontSize: 13,
    color: "#475569",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },
  summaryBox: {
    marginTop: 14,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 5,
  },
  summaryLine: { fontSize: 12, color: "#1E293B" },
  summaryKey: { fontWeight: "700", color: "#64748B" },
  notesInput: {
    marginTop: 12,
    minHeight: 70,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: "#0F172A",
  },
});

const detail = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  subtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  metric: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 4,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 12,
  },
  sectionHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
  },
  kv: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    gap: 10,
  },
  k: { fontSize: 12, color: "#64748B" },
  v: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
    flexShrink: 1,
    textAlign: "right",
  },
  link: { color: "#2563EB", fontWeight: "700" },
  placeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
    lineHeight: 19,
  },
  placeSub: { fontSize: 12, color: "#64748B", marginTop: 6, lineHeight: 17 },
  mapBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  mapBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  locLabel: { fontSize: 11, fontWeight: "700", color: "#475569" },
  locText: { fontSize: 12, color: "#1E293B", marginTop: 2 },
  tlRow: { flexDirection: "row", gap: 10 },
  tlRail: { alignItems: "center", width: 22 },
  tlDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tlLine: { flex: 1, width: 2, backgroundColor: "#E2E8F0", marginTop: 2 },
  tlTitle: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  tlMeta: { fontSize: 11, color: "#64748B", marginTop: 2 },
  tlNote: { fontSize: 12, color: "#334155", marginTop: 4 },
  undoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  undoText: { fontSize: 13, fontWeight: "700", color: "#DC2626" },
});
