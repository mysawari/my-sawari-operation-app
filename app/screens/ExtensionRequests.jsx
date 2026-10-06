import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../../services/api";

/* ---------- Theme ---------- */
const C = {
  bg: "#F4F6FA",
  card: "#FFFFFF",
  text: "#0F172A",
  sub: "#64748B",
  muted: "#94A3B8",
  border: "#E5E9F0",
  soft: "#F8FAFC",
  primary: "#0F2554",
  primarySoft: "#EEF2FF",
  green: "#16A34A",
  greenSoft: "#ECFDF3",
  red: "#DC2626",
  redSoft: "#FEF2F2",
  amber: "#B45309",
  amberSoft: "#FFF7E6",
};

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const STATUS_STYLE = {
  pending: { label: "Pending", color: C.amber, bg: C.amberSoft },
  approved: { label: "Approved", color: C.green, bg: C.greenSoft },
  rejected: { label: "Rejected", color: C.red, bg: C.redSoft },
};

/* ---------- Helpers ---------- */
const DAY_MS = 1000 * 60 * 60 * 24;

const formatINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

const toDateObj = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtDate = (d) =>
  d
    ? d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        timeZone: "Asia/Kolkata",
      })
    : "N/A";

const fmtTime = (d) =>
  d
    ? d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "";

const timeAgo = (v) => {
  const d = toDateObj(v);
  if (!d) return "";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(d);
};

/* ---------- Card ---------- */
function RequestCard({ item, onApprove, onDecline, busy }) {
  const status = STATUS_STYLE[item.status] || STATUS_STYLE.pending;
  const isPending = item.status === "pending";
  const shortened = item.extraDays < 0;
  const absDays = Math.abs(item.extraDays);
  const hasPhone =
    !!item.customer.phone && item.customer.phone !== "Unknown Mobile";

  return (
    <View style={styles.card}>
      {/* Row 1: vehicle + status */}
      <View style={styles.rowTop}>
        {item.vehicle.image ? (
          <Image source={{ uri: item.vehicle.image }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <MaterialCommunityIcons name="car-side" size={20} color={C.muted} />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text style={styles.vehicleName} numberOfLines={1}>
            {item.vehicle.name}
          </Text>
          <View style={styles.metaRow}>
            {!!item.vehicle.plate && (
              <Text style={styles.plate}>{item.vehicle.plate}</Text>
            )}
            <Text style={styles.metaText} numberOfLines={1}>
              {item.bookingCode ||
                `#${String(item.id).slice(-6).toUpperCase()}`}
              {"  ·  "}
              {item.requestedAgo}
            </Text>
          </View>
        </View>

        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Text style={[styles.badgeText, { color: status.color }]}>
            {status.label}
          </Text>
        </View>
      </View>

      {/* Row 2: dates */}
      <View style={styles.dateStrip}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dateLabel}>Current return</Text>
          <Text style={styles.dateOld}>
            {item.fromDate}
            {item.fromTime ? `, ${item.fromTime}` : ""}
          </Text>
        </View>

        <View
          style={[styles.daysChip, shortened && { backgroundColor: C.redSoft }]}
        >
          <Ionicons
            name={shortened ? "remove" : "add"}
            size={11}
            color={shortened ? C.red : C.primary}
          />
          <Text style={[styles.daysText, shortened && { color: C.red }]}>
            {absDays}d
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={styles.dateLabel}>New return</Text>
          <Text style={styles.dateNew}>
            {item.toDate}
            {item.toTime ? `, ${item.toTime}` : ""}
          </Text>
        </View>
      </View>

      {/* Row 3: customer */}
      <View style={styles.customerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(item.customer.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.custName} numberOfLines={1}>
            {item.customer.name}
          </Text>
          <Text style={styles.custPhone}>{item.customer.phone}</Text>
        </View>
        {!!item.vehicle.pricePerDay && (
          <Text style={styles.rate}>
            {formatINR(item.vehicle.pricePerDay)}/day
          </Text>
        )}
        {hasPhone && (
          <Pressable
            style={styles.iconBtn}
            onPress={() => Linking.openURL(`tel:${item.customer.phone}`)}
            hitSlop={8}
            accessibilityLabel={`Call ${item.customer.name}`}
          >
            <Feather name="phone" size={14} color={C.green} />
          </Pressable>
        )}
      </View>

      {/* Reason */}
      {!!item.reason && (
        <Text style={styles.reason} numberOfLines={2}>
          <Text style={styles.reasonLabel}>Reason: </Text>
          {item.reason}
        </Text>
      )}

      {/* Processed info */}
      {!isPending && (
        <Text style={styles.processed} numberOfLines={2}>
          {item.status === "approved" ? "Approved" : "Rejected"} by{" "}
          <Text style={{ fontWeight: "600", color: C.text }}>
            {item.processedBy}
          </Text>
          {item.status === "rejected" && !!item.rejectReason
            ? `  ·  ${item.rejectReason}`
            : ""}
        </Text>
      )}

      {/* Actions */}
      {isPending && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onDecline(item)}
            disabled={busy}
            style={({ pressed }) => [
              styles.btn,
              styles.btnOutline,
              (pressed || busy) && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.btnText, { color: C.red }]}>Decline</Text>
          </Pressable>

          <Pressable
            onPress={() => onApprove(item)}
            disabled={busy}
            style={({ pressed }) => [
              styles.btn,
              styles.btnSolid,
              (pressed || busy) && { opacity: 0.8 },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.btnText, { color: "#fff" }]}>Approve</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

/* ---------- Screen ---------- */
export default function ExtensionRequests() {
  const router = useRouter();
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const [rejectItem, setRejectItem] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const mapRequest = (r) => {
    const booking = r.bookingId || {};
    const customer = r.customerId || {};
    const handover = r.handover || {};
    const v = r.vehicle || {};

    const currentDrop = toDateObj(r.trip?.dropDateTime || booking.toDate);
    const requestedDrop = toDateObj(r.requestedDropDate);

    return {
      id: r._id,
      bookingCode: booking.bookingCode || "",
      vehicle: {
        name: v.vehicleName || booking.vehicleName || "Unknown Vehicle",
        plate: v.vehicleNumber || booking.vehicleNumber || "",
        image: v.image || "",
        pricePerDay: v.pricePerDay || null,
      },
      customer: {
        name:
          customer.customerName ||
          customer.name ||
          handover.customer?.fullName ||
          booking.customerName ||
          "Unknown Customer",
        phone:
          customer.mobileNumber ||
          handover.customer?.mobileNumber ||
          booking.customerPhone ||
          "Unknown Mobile",
      },
      fromDate: fmtDate(currentDrop),
      fromTime: booking.dropTime || fmtTime(currentDrop),
      toDate: fmtDate(requestedDrop),
      toTime: r.requestedDropTime || fmtTime(requestedDrop),
      extraDays:
        currentDrop && requestedDrop
          ? Math.round((requestedDrop - currentDrop) / DAY_MS)
          : 0,
      status: r.status,
      reason: r.reason || "",
      rejectReason: r.rejectReason || "",
      processedBy: r.processedBy?.name || "Unknown",
      requestedAgo: timeAgo(r.createdAt),
    };
  };

  const fetchExtensions = async (isPull = false) => {
    try {
      isPull ? setRefreshing(true) : setLoading(true);
      const response = await api.get("/extensions");
      if (response.data?.success && Array.isArray(response.data.data)) {
        setRequests(response.data.data.map(mapRequest));
      }
    } catch (err) {
      console.log("Error fetching extensions:", err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchExtensions();
    }, []),
  );

  const counts = useMemo(
    () =>
      FILTERS.reduce((acc, f) => {
        acc[f.key] = requests.filter((r) => r.status === f.key).length;
        return acc;
      }, {}),
    [requests],
  );

  const visible = useMemo(
    () => requests.filter((r) => r.status === filter),
    [requests, filter],
  );

  const markProcessed = (id, patch) =>
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );

  /* ---------- Approve ---------- */
  const approveRequest = async (item) => {
    try {
      setProcessingId(item.id);
      const res = await api.put(`/extensions/${item.id}/status`, {
        status: "approved",
      });
      markProcessed(item.id, {
        status: "approved",
        processedBy: res?.data?.data?.processedBy?.name || "You",
      });
      Alert.alert("Approved", "The extension request has been approved.");
    } catch (err) {
      Alert.alert(
        "Error",
        err?.response?.data?.message || "Could not approve the request.",
      );
      // If it was already processed elsewhere, refresh the list
      if (err?.response?.status === 409) fetchExtensions(true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApprove = (item) => {
    Alert.alert(
      "Are you sure?",
      "Do you want to approve this extension request?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Approve", onPress: () => approveRequest(item) },
      ],
    );
  };

  /* ---------- Decline ---------- */
  const handleDecline = (item) => {
    setRejectReason("");
    setRejectItem(item);
  };

  const closeRejectModal = () => {
    if (rejecting) return;
    setRejectItem(null);
    setRejectReason("");
  };

  const confirmDecline = async () => {
    const item = rejectItem;
    const reason = rejectReason.trim();
    if (!item || !reason) return;

    try {
      setProcessingId(item.id);
      const res = await api.put(`/extensions/${item.id}/status`, {
        status: "rejected",
        rejectReason: reason,
      });
      markProcessed(item.id, {
        status: "rejected",
        rejectReason: reason,
        processedBy: res?.data?.data?.processedBy?.name || "You",
      });
      setRejectItem(null);
      setRejectReason("");
      Alert.alert("Declined", "The extension request has been declined.");
    } catch (err) {
      Alert.alert(
        "Error",
        err?.response?.data?.message || "Could not decline the request.",
      );
      if (err?.response?.status === 409) {
        setRejectItem(null);
        fetchExtensions(true);
      }
    } finally {
      setProcessingId(null);
    }
  };

  const rejecting = !!rejectItem && processingId === rejectItem.id;

  /* ---------- Empty ---------- */
  const EmptyState = () =>
    loading ? (
      <View style={styles.empty}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    ) : (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons
            name="calendar-check-outline"
            size={28}
            color={C.primary}
          />
        </View>
        <Text style={styles.emptyTitle}>
          {filter === "pending" ? "All caught up" : `No ${filter} requests`}
        </Text>
        <Text style={styles.emptySub}>
          {filter === "pending"
            ? "New return-date change requests will appear here."
            : "Processed requests will be listed here."}
        </Text>
      </View>
    );

  /* ---------- UI ---------- */
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Extension Requests</Text>
          <Text style={styles.subtitle}>
            {counts.pending || 0} pending{" "}
            {counts.pending === 1 ? "request" : "requests"}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {f.label}
              </Text>
              {!!counts[f.key] && (
                <Text
                  style={[styles.tabCount, active && styles.tabCountActive]}
                >
                  {counts[f.key]}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <RequestCard
            item={item}
            onApprove={handleApprove}
            onDecline={handleDecline}
            busy={processingId === item.id}
          />
        )}
        contentContainerStyle={[
          styles.list,
          visible.length === 0 && { flexGrow: 1 },
        ]}
        ListEmptyComponent={EmptyState}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={() => fetchExtensions(true)}
      />

      {/* Decline modal */}
      <Modal
        visible={!!rejectItem}
        transparent
        animationType="fade"
        onRequestClose={closeRejectModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Decline request</Text>
            <Text style={styles.modalSub}>
              The customer will see this reason.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Vehicle is booked by another customer"
              placeholderTextColor={C.muted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              maxLength={200}
              autoFocus
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={closeRejectModal}
                disabled={rejecting}
              >
                <Text style={[styles.modalBtnText, { color: C.sub }]}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalBtn,
                  { backgroundColor: C.red },
                  (!rejectReason.trim() || rejecting) && { opacity: 0.5 },
                ]}
                onPress={confirmDecline}
                disabled={!rejectReason.trim() || rejecting}
              >
                {rejecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "#fff" }]}>
                    Decline
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "700", color: C.text },
  subtitle: { fontSize: 12, color: C.sub, marginTop: 1 },

  /* Tabs */
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 3,
    backgroundColor: "#E9EDF3",
    borderRadius: 10,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  tabActive: {
    backgroundColor: C.card,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabText: { fontSize: 13, fontWeight: "600", color: C.sub },
  tabTextActive: { color: C.text },
  tabCount: {
    fontSize: 11,
    fontWeight: "700",
    color: C.sub,
    backgroundColor: "#DDE3EB",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  tabCountActive: { color: C.primary, backgroundColor: C.primarySoft },

  /* List */
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 10 },

  /* Card */
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: C.soft },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  vehicleName: { fontSize: 15, fontWeight: "700", color: C.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  plate: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: C.text,
    borderWidth: 1,
    borderColor: C.text,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  metaText: { flex: 1, fontSize: 11, color: C.muted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: "700" },

  /* Dates */
  dateStrip: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: C.soft,
    borderRadius: 10,
    gap: 8,
  },
  dateLabel: {
    fontSize: 10,
    color: C.muted,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  dateOld: {
    fontSize: 13,
    fontWeight: "600",
    color: C.sub,
    textDecorationLine: "line-through",
  },
  dateNew: { fontSize: 13, fontWeight: "700", color: C.primary },
  daysChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.primarySoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 1,
  },
  daysText: { fontSize: 11, fontWeight: "700", color: C.primary },

  /* Customer */
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 11, fontWeight: "700", color: C.primary },
  custName: { fontSize: 13, fontWeight: "600", color: C.text },
  custPhone: { fontSize: 11, color: C.sub, marginTop: 1 },
  rate: { fontSize: 12, fontWeight: "600", color: C.text },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Reason / processed */
  reason: { fontSize: 12, lineHeight: 17, color: C.text, marginTop: 8 },
  reasonLabel: { color: C.sub, fontWeight: "600" },
  processed: { fontSize: 11, color: C.sub, marginTop: 8 },

  /* Actions */
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    height: 38,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: "#F5C2C2",
    backgroundColor: C.card,
  },
  btnSolid: { backgroundColor: C.green },
  btnText: { fontSize: 13, fontWeight: "700" },

  /* Empty */
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.text },
  emptySub: {
    fontSize: 13,
    color: C.sub,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 18,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  modalSub: { fontSize: 12, color: C.sub, marginTop: 3, marginBottom: 12 },
  modalInput: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    backgroundColor: C.soft,
    padding: 10,
    fontSize: 14,
    color: C.text,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  modalBtn: {
    minWidth: 92,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnGhost: { backgroundColor: "#F1F5F9" },
  modalBtnText: { fontSize: 13, fontWeight: "700" },
});
