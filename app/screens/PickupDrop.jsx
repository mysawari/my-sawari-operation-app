// =====================================================================
//  Pickup & Drop
//
//  Flow:
//    1. Team leader opens "All Tasks", sets the reach time and
//       assigns a team member.
//    2. That member sees the task in "My Tasks".
//    3. Member taps  Start Trip → I've Reached → Complete → ✓ Done
//       Each tap saves the time + the current location name.
//    4. The driver or a leader can Cancel any task that isn't finished.
//
//  Filters:
//    Type    All | Pickup | Drop          (My Tasks and All Tasks)
//    Status  Active | Unassigned | Done   (Unassigned = All Tasks only:
//                                          pickups + drops with no one
//                                          assigned yet)
//
//  Everything a card shows or allows comes from STATUS_MAP + ACTIONS.
//
//  Data: services/pickupDropService.js → backend /api/v1/service
//  Needs: npx expo install expo-location
// =====================================================================
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  assignTask,
  cancelTask,
  currentUser,
  getTeamMembers,
  isTeamLeader,
  listTasks,
  updateTaskStatus,
} from "../../services/pickupDropService";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */
// ---------------------------------------------------------------------
//  STATUS MAP — one place that decides everything per status
//
//    label / color / bg   badge on the card
//    memberAction         button the ASSIGNED member sees (or null)
//                         "done" = finished, shown as a green non-tap bar
//    canAssign            leader can assign / change the member
//    canCancel            leader OR the assigned driver can cancel
//
//    pending ─assign→ assigned ─start→ on_the_way ─reach→ reached ─complete→ completed
//       └──────────────── cancel (leader, any time before completed) ───→ cancelled
// ---------------------------------------------------------------------
const STATUS_MAP = {
  pending: {
    label: "Not assigned",
    color: "#DC2626",
    bg: "#FEE2E2",
    memberAction: null,
    canAssign: true,
    canCancel: true,
  },
  assigned: {
    label: "Assigned",
    color: "#2563EB",
    bg: "#DBEAFE",
    memberAction: "start",
    canAssign: true,
    canCancel: true,
  },
  on_the_way: {
    label: "On the way",
    color: "#D97706",
    bg: "#FEF3C7",
    memberAction: "reach",
    canAssign: false,
    canCancel: true,
  },
  reached: {
    label: "Reached",
    color: "#7C3AED",
    bg: "#EDE9FE",
    memberAction: "complete",
    canAssign: false,
    canCancel: true,
  },
  completed: {
    label: "Completed",
    color: "#16A34A",
    bg: "#DCFCE7",
    memberAction: "done",
    canAssign: false,
    canCancel: false,
  },
  cancelled: {
    label: "Cancelled",
    color: "#64748B",
    bg: "#F1F5F9",
    memberAction: null,
    canAssign: false,
    canCancel: false,
  },
};

// ---------------------------------------------------------------------
//  ACTIONS — how each button looks and what it asks before running
//    needsLocation: capture the current location name before saving
// ---------------------------------------------------------------------
const ACTIONS = {
  start: {
    label: "Start Trip",
    icon: "navigate",
    color: "#16A34A",
    title: "Start trip?",
    confirm: "The time and your location will be saved.",
    okText: "Start",
    needsLocation: true,
  },
  reach: {
    label: "I've Reached",
    icon: "location",
    color: "#7C3AED",
    title: "Reached the location?",
    confirm: "Make sure you're at the customer's spot.",
    okText: "Yes, reached",
    needsLocation: true,
  },
  complete: {
    label: "Complete",
    icon: "checkmark-done",
    color: "#0B132B",
    title: "Complete this task?",
    confirm: "This marks the job as done.",
    okText: "Complete",
    needsLocation: true,
  },
  // Not a real action — the finished state after Complete
  done: {
    label: "Task Done",
    icon: "checkmark-circle",
    color: "#16A34A",
    isFinal: true,
  },
  assign: {
    label: "Assign Team Member",
    icon: "person-add",
    color: "#2563EB",
  },
  cancel: {
    label: "Cancel",
    icon: "close",
    color: "#DC2626",
    title: "Cancel this task?",
    confirm: "It will move out of Active. This can't be undone.",
    okText: "Yes, cancel",
    needsLocation: false,
  },
};

// Decide which buttons a card shows for this user
const getCardActions = (item, { isMine, leader, scope }) => {
  const s = STATUS_MAP[item.status] || STATUS_MAP.pending;
  const leaderHere = leader && scope === "all";

  // Main button: member's next step, or "Assign" for a leader
  let primary = null;
  if (isMine && s.memberAction) primary = s.memberAction;
  else if (leaderHere && item.status === "pending") primary = "assign";

  return {
    primary,
    canChange: leaderHere && s.canAssign && !!item.assignedTo,
    // Cancel: the assigned driver (on their own task) OR a leader,
    // any time before the task is completed
    canCancel: (isMine || leaderHere) && s.canCancel,
  };
};

// Type filter — "all" shows pickups and drops together
const TYPE_TABS = [
  { id: "all", label: "All" },
  { id: "pickup", label: "Pickup" },
  { id: "drop", label: "Drop" },
];

// Status filter — "unassigned" only exists in All Tasks (leaders)
const STATUS_TABS = [
  { id: "active", label: "Active", allOnly: false },
  { id: "unassigned", label: "Unassigned", allOnly: true },
  { id: "completed", label: "Done", allOnly: false },
];

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// Open = not finished / cancelled
const OPEN_STATUSES = ["pending", "assigned", "on_the_way", "reached"];

// Open task with no one assigned
const isUnassigned = (t) => OPEN_STATUSES.includes(t.status) && !t.assignedTo;

const STEPS = [
  { label: "Started", time: "startedAt", place: "startLocation" },
  { label: "Reached", time: "reachedAt", place: "reachLocation" },
  { label: "Completed", time: "completedAt", place: "completeLocation" },
];

const errMsg = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */
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

const fmtTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d)) return "-";
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
};

const fmtDay = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d)) return "-";
  const dayStart = (x) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dayStart(d) - dayStart(new Date())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const fmtDateTime = (value) => `${fmtDay(value)}, ${fmtTime(value)}`;

/* ------------------------------------------------------------------ */
/*  Location name (no coordinates are stored)                          */
/* ------------------------------------------------------------------ */
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);

async function getLocationName() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return "";

    let pos = null;
    try {
      pos = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        10000,
      );
    } catch {
      pos = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
    }
    if (!pos) return "";

    const [place] = await withTimeout(
      Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      }),
      6000,
    );
    if (!place) return "";

    return [
      place.name,
      place.street,
      place.district || place.subregion,
      place.city,
    ]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(", ");
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Device helpers                                                     */
/* ------------------------------------------------------------------ */
const openUrl = async (url) => {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Can't open", "This link couldn't be opened on this device.");
  }
};

const callNumber = (phone) => {
  if (!phone) return Alert.alert("No number", "No contact number available.");
  openUrl(`tel:${phone}`);
};

const openMap = (address) => {
  if (!address)
    return Alert.alert("No address", "This booking has no address.");
  openUrl(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
  );
};

/* ------------------------------------------------------------------ */
/*  My Task buttons — ALWAYS shown on cards in "My Tasks"              */
/*                                                                     */
/*    assigned   → [ Start Trip ]    [ Cancel ]                        */
/*    on_the_way → [ I've Reached ]  [ Cancel ]                        */
/*    reached    → [ Complete ]      [ Cancel ]                        */
/*    completed  → [ ✓ Task Done ]                                     */
/*    cancelled  → (nothing — card shows "cancelled" note)             */
/* ------------------------------------------------------------------ */
const MY_TASK_BUTTON = {
  pending: "start", // assigned to me but status not updated yet
  assigned: "start",
  on_the_way: "reach",
  reached: "complete",
  completed: "done",
};

function MyTaskButtons({ item, busy, onAction }) {
  const key = MY_TASK_BUTTON[item.status];
  if (!key) return null; // cancelled

  const btn = ACTIONS[key];

  // Finished
  if (key === "done") {
    return (
      <View style={styles.actions}>
        <View style={styles.doneBar}>
          <Ionicons name={btn.icon} size={18} color="#16A34A" />
          <Text style={styles.doneText}>
            {btn.label}
            {item.completedAt ? ` • ${fmtTime(item.completedAt)}` : ""}
          </Text>
        </View>
      </View>
    );
  }

  // Start / I've Reached / Complete  +  Cancel
  return (
    <View style={styles.actions}>
      <TouchableOpacity
        style={[
          styles.primaryBtn,
          { backgroundColor: btn.color },
          busy && { opacity: 0.7 },
        ]}
        disabled={busy}
        onPress={() => onAction(item, key)}
        activeOpacity={0.85}
      >
        {busy ? (
          <>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Saving…</Text>
          </>
        ) : (
          <>
            <Ionicons name={btn.icon} size={16} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>{btn.label}</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.cancelTaskBtn, busy && { opacity: 0.6 }]}
        disabled={busy}
        onPress={() => onAction(item, "cancel")}
        activeOpacity={0.8}
      >
        <Ionicons name={ACTIONS.cancel.icon} size={16} color="#DC2626" />
        <Text style={styles.cancelTaskText}>{ACTIONS.cancel.label}</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Task card                                                          */
/* ------------------------------------------------------------------ */
function TaskCard({ item, myId, scope, leader, busy, onAction, onAssign }) {
  const meta = STATUS_MAP[item.status] || STATUS_MAP.pending;
  const inMyTasks = scope === "mine";
  // My Tasks only contains my tasks (backend filters by assignedTo = me).
  // In All Tasks, compare ids.
  const isMine =
    inMyTasks || (!!myId && String(item.assignedTo?._id) === String(myId));
  const { primary, canChange, canCancel } = getCardActions(item, {
    isMine,
    leader,
    scope,
  });
  const primaryBtn = primary ? ACTIONS[primary] : null;
  const typeLabel = item.type === "pickup" ? "Pickup" : "Drop";
  const typeColor = item.type === "pickup" ? "#2563EB" : "#B45309";
  const doneSteps = STEPS.filter((s) => item[s.time]);

  return (
    <View
      style={[styles.card, item.status === "cancelled" && styles.cardMuted]}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.rowCenter}>
          <Ionicons
            name={item.type === "pickup" ? "car-outline" : "flag-outline"}
            size={15}
            color={typeColor}
          />
          <Text style={[styles.typeLabel, { color: typeColor }]}>
            {typeLabel}
          </Text>
          <Text style={styles.code}>#{item.bookingCode}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>
            {meta.label}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        {/* Time */}
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={15} color="#64748B" />
          <Text style={styles.infoLabel}>Reach by</Text>
          <Text style={styles.infoValue}>{fmtDateTime(item.scheduledAt)}</Text>
        </View>

        {/* Drop price (set by the leader on the Receive Desk) */}
        {item.type === "drop" && Number(item.dropCharge) > 0 && (
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={15} color="#64748B" />
            <Text style={styles.infoLabel}>Drop price</Text>
            <Text style={styles.infoValue}>{rupees(item.dropCharge)}</Text>
          </View>
        )}

        {/* Vehicle */}
        <View style={styles.infoRow}>
          <Ionicons name="car-sport-outline" size={15} color="#64748B" />
          <Text style={styles.vehicleName} numberOfLines={1}>
            {item.vehicleName}
          </Text>
          <View style={styles.plate}>
            <Text style={styles.plateText}>{item.vehicleNumber}</Text>
          </View>
        </View>

        {/* Customer */}
        <View style={styles.infoRow}>
          <Ionicons name="person-outline" size={15} color="#64748B" />
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName} numberOfLines={1}>
              {item.customerName}
            </Text>
            <Text style={styles.subText}>
              {item.mobileNumber || "No number"}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => callNumber(item.mobileNumber)}
            hitSlop={6}
          >
            <Ionicons name="call" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Address */}
        <View style={styles.addressBox}>
          <Ionicons name="location" size={15} color={typeColor} />
          <Text style={styles.addressText} numberOfLines={2}>
            {item.address || "No address added"}
          </Text>
          <TouchableOpacity
            style={styles.mapBtn}
            onPress={() => openMap(item.address)}
            hitSlop={6}
          >
            <Ionicons name="navigate" size={14} color="#2563EB" />
          </TouchableOpacity>
        </View>

        {/* Assigned member */}
        <View style={styles.assignRow}>
          <Text style={styles.assignText} numberOfLines={1}>
            {item.assignedTo ? (
              <>
                Assigned to{" "}
                <Text style={styles.bold}>
                  {isMine ? "You" : item.assignedTo.fullName}
                </Text>
              </>
            ) : (
              <Text style={{ color: "#DC2626" }}>No one assigned yet</Text>
            )}
          </Text>
          {canChange && (
            <TouchableOpacity
              style={styles.assignBtn}
              onPress={() => onAssign(item)}
            >
              <Text style={styles.assignBtnText}>Change</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Steps done so far */}
        {doneSteps.length > 0 && (
          <View style={styles.steps}>
            {doneSteps.map((s) => (
              <View key={s.label} style={styles.stepRow}>
                <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                <Text style={styles.stepLabel}>{s.label}</Text>
                <Text style={styles.stepTime}>{fmtTime(item[s.time])}</Text>
                <Text style={styles.stepPlace} numberOfLines={1}>
                  {item[s.place] || "Location not captured"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Cancelled note */}
        {item.status === "cancelled" && (
          <View style={styles.cancelNote}>
            <Ionicons name="close-circle" size={14} color="#64748B" />
            <Text style={styles.cancelNoteText}>
              This task was cancelled
              {item.cancelledAt ? ` • ${fmtDateTime(item.cancelledAt)}` : ""}
            </Text>
          </View>
        )}
      </View>

      {/* My Tasks: Start → I've Reached → Complete → Task Done */}
      {inMyTasks && (
        <MyTaskButtons item={item} busy={busy} onAction={onAction} />
      )}

      {/* All Tasks (leader): Assign / Cancel, or my own task's next step */}
      {!inMyTasks && (primaryBtn || canCancel) && (
        <View style={styles.actions}>
          {/* Finished: green "Done" bar, not tappable */}
          {primaryBtn?.isFinal && (
            <View style={styles.doneBar}>
              <Ionicons name={primaryBtn.icon} size={18} color="#16A34A" />
              <Text style={styles.doneText}>
                {primaryBtn.label}
                {item.completedAt ? ` • ${fmtTime(item.completedAt)}` : ""}
              </Text>
            </View>
          )}

          {primaryBtn && !primaryBtn.isFinal && (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: primaryBtn.color },
                busy && { opacity: 0.7 },
              ]}
              disabled={busy}
              onPress={() =>
                primary === "assign" ? onAssign(item) : onAction(item, primary)
              }
              activeOpacity={0.85}
            >
              {busy ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Saving…</Text>
                </>
              ) : (
                <>
                  <Ionicons name={primaryBtn.icon} size={16} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>{primaryBtn.label}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {canCancel && (
            <TouchableOpacity
              style={[
                styles.cancelTaskBtn,
                !primaryBtn && { flex: 1 },
                busy && { opacity: 0.6 },
              ]}
              disabled={busy}
              onPress={() => onAction(item, "cancel")}
              activeOpacity={0.8}
            >
              <Ionicons name={ACTIONS.cancel.icon} size={16} color="#DC2626" />
              <Text style={styles.cancelTaskText}>{ACTIONS.cancel.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Assign team member (tap a name to assign)                          */
/* ------------------------------------------------------------------ */
function AssignModal({ item, onClose, onAssigned }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [reachAt, setReachAt] = useState(null); // when the member should reach

  useEffect(() => {
    if (!item) return;
    // Start from the task's current reach time
    setReachAt(item.scheduledAt ? new Date(item.scheduledAt) : new Date());
    let cancelled = false;
    setLoading(true);
    getTeamMembers()
      .then((list) => !cancelled && setMembers(list))
      .catch((err) => Alert.alert("Error", errMsg(err, "Unable to load team.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [item]);

  const shiftReach = (minutes) =>
    setReachAt((d) => new Date((d || new Date()).getTime() + minutes * 60000));

  const timeChanged =
    !!reachAt &&
    !!item?.scheduledAt &&
    reachAt.getTime() !== new Date(item.scheduledAt).getTime();

  const handlePick = async (member) => {
    // Same person and same time = nothing to save
    if (savingId) return;
    if (member._id === item.assignedTo?._id && !timeChanged) return;
    try {
      setSavingId(member._id);
      const updated = await assignTask(item.id, member._id, reachAt);
      onAssigned(updated);
      onClose();
    } catch (err) {
      Alert.alert("Error", errMsg(err, "Unable to assign."));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Modal
      visible={!!item}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Assign team member</Text>
          {item && (
            <Text style={styles.sheetSub} numberOfLines={1}>
              {item.type === "pickup" ? "Pickup" : "Drop"} • {item.customerName}{" "}
              • {item.vehicleNumber}
            </Text>
          )}

          {/* Reach time */}
          <View style={styles.reachBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reachLabel}>Reach by</Text>
              <Text style={styles.reachValue}>
                {reachAt ? fmtDateTime(reachAt) : "-"}
              </Text>
            </View>
            {[
              { label: "−15m", min: -15 },
              { label: "+15m", min: 15 },
              { label: "+1h", min: 60 },
            ].map((b) => (
              <TouchableOpacity
                key={b.label}
                style={styles.reachBtn}
                onPress={() => shiftReach(b.min)}
              >
                <Text style={styles.reachBtnText}>{b.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.reachHint}>
            Booked for {fmtDateTime(item?.scheduledAt)}. Tap a name to assign.
          </Text>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 30 }} color="#2563EB" />
          ) : (
            <FlatList
              data={members}
              keyExtractor={(m) => m._id}
              style={{ maxHeight: 360, marginTop: 12 }}
              ListEmptyComponent={
                <Text style={styles.reachHint}>No team members found.</Text>
              }
              renderItem={({ item: m }) => {
                const current = m._id === item?.assignedTo?._id;
                return (
                  <TouchableOpacity
                    style={[
                      styles.memberRow,
                      current && styles.memberRowCurrent,
                    ]}
                    onPress={() => handlePick(m)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(m.fullName || "?").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{m.fullName}</Text>
                      <Text style={styles.subText}>
                        {[m.mobileNumber, m.role].filter(Boolean).join(" • ")}
                      </Text>
                    </View>
                    {savingId === m._id ? (
                      <ActivityIndicator size="small" color="#2563EB" />
                    ) : current ? (
                      <Text style={styles.currentTag}>Current</Text>
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color="#94A3B8"
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */
export default function PickupDropScreen() {
  const router = useRouter();
  const myId = currentUser()._id;
  const leader = isTeamLeader();

  // Leaders open on All Tasks; others only have My Tasks
  const [scope, setScope] = useState(leader ? "all" : "mine"); // mine | all
  const [type, setType] = useState("all"); // all | pickup | drop
  const [status, setStatus] = useState("active"); // active | unassigned | completed

  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({
    active: 0,
    unassigned: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [assignFor, setAssignFor] = useState(null);

  const requestId = useRef(0);

  const load = useCallback(
    async (mode = "normal") => {
      const id = ++requestId.current;
      if (mode === "normal") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      try {
        const res = await listTasks({ scope, type, status });
        if (id !== requestId.current) return; // a newer request replaced this one
        const list = res.data || [];
        const apiCounts = res.counts || {};
        setItems(list);

        setCounts((prev) => {
          // Unassigned: use the backend number when it sends one,
          // otherwise work it out from the list we just loaded
          let unassigned = Number(apiCounts.unassigned);
          if (!Number.isFinite(unassigned)) {
            if (scope !== "all") unassigned = 0;
            else if (status === "unassigned") unassigned = list.length;
            else if (status === "active")
              unassigned = list.filter(isUnassigned).length;
            else unassigned = prev.unassigned; // Done tab can't tell — keep last
          }
          return {
            active: Number(apiCounts.active) || 0,
            completed: Number(apiCounts.completed) || 0,
            unassigned,
          };
        });
        setError("");
      } catch (err) {
        if (id === requestId.current)
          setError(errMsg(err, "Unable to load tasks."));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [scope, type, status],
  );

  // Reload when the screen opens or a tab changes
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const changeScope = (next) => {
    setScope(next);
    if (next === "mine" && status === "unassigned") setStatus("active");
  };

  const statusTabs = STATUS_TABS.filter((t) => !t.allOnly || scope === "all");

  const replaceCard = (card) =>
    setItems((prev) => prev.map((c) => (c.id === card.id ? card : c)));

  // One handler for every card button: start | reach | complete | cancel
  const handleAction = (item, actionKey) => {
    const a = ACTIONS[actionKey];
    if (!a) return;

    const details = `${item.customerName} • ${item.vehicleNumber}`;

    Alert.alert(a.title, `${details}\n\n${a.confirm}`, [
      { text: "Not now", style: "cancel" },
      {
        text: a.okText,
        style: actionKey === "cancel" ? "destructive" : "default",
        onPress: async () => {
          setBusyId(item.id);
          try {
            let updated;
            if (actionKey === "cancel") {
              updated = await cancelTask(item.id);
            } else {
              const locationName = a.needsLocation
                ? await getLocationName()
                : "";
              updated = await updateTaskStatus(item.id, actionKey, {
                locationName,
              });
            }
            if (updated) replaceCard(updated);
            if (actionKey === "cancel" && isUnassigned(item)) {
              setCounts((c) => ({
                ...c,
                unassigned: Math.max(0, c.unassigned - 1),
              }));
            }

            // After Complete, keep the card on screen showing "Done"
            // for a moment, then refresh (it moves to the Done tab).
            if (actionKey === "complete" && status === "active") {
              setTimeout(() => load("silent"), 2500);
            } else {
              load("silent"); // refresh list + counts
            }
          } catch (err) {
            Alert.alert("Couldn't update", errMsg(err, "Please try again."));
            load("silent");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const handleAssigned = (card) => {
    const before = items.find((c) => c.id === card.id);
    if (before && isUnassigned(before) && !isUnassigned(card)) {
      setCounts((c) => ({ ...c, unassigned: Math.max(0, c.unassigned - 1) }));
    }
    if (status === "unassigned") {
      setItems((prev) => prev.filter((c) => c.id !== card.id));
    } else {
      replaceCard(card);
    }
    load("silent");
  };

  const typeWord =
    type === "pickup"
      ? "pickups"
      : type === "drop"
        ? "drops"
        : "pickups or drops";
  const emptyText =
    status === "completed"
      ? `No completed ${typeWord} yet.`
      : status === "unassigned"
        ? `No unassigned ${typeWord}. Everything has a team member.`
        : scope === "mine"
          ? `No ${typeWord} assigned to you right now.`
          : `No open ${typeWord}.`;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor="#0B132B" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerBtn}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {leader ? "Pickup & Drop" : "My Pickup & Drop"}
          </Text>
          <TouchableOpacity
            onPress={() => load("refresh")}
            style={styles.headerBtn}
            hitSlop={10}
          >
            <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* My Tasks / All Tasks — leaders only */}
        {leader && (
          <View style={styles.tabs}>
            {[
              { id: "mine", label: "My Tasks", icon: "person" },
              { id: "all", label: "All Tasks", icon: "people" },
            ].map((t) => {
              const active = scope === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => changeScope(t.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={t.icon}
                    size={15}
                    color={active ? "#0B132B" : "rgba(255,255,255,0.8)"}
                  />
                  <Text
                    style={[styles.tabText, active && styles.tabTextActive]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* All / Pickup / Drop */}
      <View style={styles.filters}>
        <View style={styles.segment}>
          {TYPE_TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.segmentBtn,
                type === t.id && styles.segmentBtnActive,
              ]}
              onPress={() => setType(t.id)}
            >
              <Text
                style={[
                  styles.segmentText,
                  type === t.id && styles.segmentTextActive,
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Active / Unassigned (All Tasks) / Done */}
      <View style={styles.chipsRow}>
        {statusTabs.map((t) => {
          const active = status === t.id;
          const warn = t.id === "unassigned" && counts.unassigned > 0;
          return (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.chip,
                warn && !active && styles.chipWarn,
                active && styles.chipActive,
              ]}
              onPress={() => setStatus(t.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  warn && !active && styles.chipTextWarn,
                  active && styles.chipTextActive,
                ]}
              >
                {t.label} ({counts[t.id] || 0})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0B132B" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={[
            styles.list,
            items.length === 0 && { flexGrow: 1 },
          ]}
          showsVerticalScrollIndicator={false}
          extraData={busyId}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
            />
          }
          ListHeaderComponent={
            error ? (
              <TouchableOpacity style={styles.errorBox} onPress={() => load()}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={15}
                  color="#B91C1C"
                />
                <Text style={styles.errorText}>{error} — tap to retry</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons
                name="checkmark-done-circle-outline"
                size={44}
                color="#CBD5E1"
              />
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TaskCard
              item={item}
              myId={myId}
              scope={scope}
              leader={leader}
              busy={busyId === item.id}
              onAction={handleAction}
              onAssign={setAssignFor}
            />
          )}
        />
      )}

      <AssignModal
        item={assignFor}
        onClose={() => setAssignFor(null)}
        onAssigned={handleAssigned}
      />
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F1F5F9" },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  bold: { fontWeight: "700", color: "#0F172A" },
  subText: { fontSize: 12, color: "#64748B", marginTop: 1 },

  // Header
  header: {
    backgroundColor: "#0B132B",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  tabs: {
    flexDirection: "row",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabActive: { backgroundColor: "#FFFFFF" },
  tabText: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "700" },
  tabTextActive: { color: "#0B132B" },

  // Filters
  filters: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderRadius: 9,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    borderRadius: 7,
  },
  segmentBtnActive: { backgroundColor: "#FFFFFF" },
  segmentText: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  segmentTextActive: { color: "#0F172A" },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipActive: { backgroundColor: "#0B132B", borderColor: "#0B132B" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  chipTextActive: { color: "#FFFFFF" },
  chipWarn: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  chipTextWarn: { color: "#DC2626" },

  // List
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 40,
  },
  emptyText: { fontSize: 13, color: "#94A3B8" },
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

  // Card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  typeLabel: { fontSize: 13, fontWeight: "800" },
  code: { fontSize: 11, fontWeight: "600", color: "#94A3B8" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: "800" },

  cardBody: { padding: 14, gap: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoLabel: { fontSize: 12, color: "#64748B" },
  infoValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  vehicleName: { flex: 1, fontSize: 14, fontWeight: "700", color: "#0F172A" },
  plate: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
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
  customerName: { fontSize: 14, fontWeight: "600", color: "#334155" },
  callBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  addressBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },
  addressText: { flex: 1, fontSize: 13, color: "#1E293B", lineHeight: 18 },
  mapBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  assignText: { flex: 1, fontSize: 13, color: "#475569" },
  assignBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  assignBtnText: { fontSize: 12, fontWeight: "700", color: "#2563EB" },

  steps: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
    gap: 6,
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepLabel: { fontSize: 12, fontWeight: "700", color: "#0F172A", width: 70 },
  stepTime: { fontSize: 12, color: "#334155", width: 66 },
  stepPlace: { flex: 1, fontSize: 12, color: "#64748B" },

  // Cancelled card
  cardMuted: { opacity: 0.75 },
  cancelNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  cancelNoteText: { fontSize: 12, color: "#64748B", fontWeight: "600" },

  // Buttons row: main CTA + Cancel
  actions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  primaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  doneBar: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  doneText: { color: "#16A34A", fontSize: 15, fontWeight: "800" },
  cancelTaskBtn: {
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  cancelTaskText: { color: "#DC2626", fontSize: 14, fontWeight: "700" },

  // Assign sheet
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)" },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  sheetSub: { fontSize: 12, color: "#64748B", marginTop: 3 },
  reachBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  reachLabel: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  reachValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 2,
  },
  reachBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  reachBtnText: { fontSize: 12, fontWeight: "700", color: "#2563EB" },
  reachHint: { fontSize: 11, color: "#94A3B8", marginTop: 6 },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginBottom: 6,
  },
  memberRowCurrent: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontWeight: "800", color: "#1D4ED8" },
  memberName: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  currentTag: { fontSize: 11, fontWeight: "700", color: "#16A34A" },
  cancelBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
});
