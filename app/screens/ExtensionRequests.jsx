import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
    Alert,
    FlatList,
    Image,
    Linking,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { extensionRequestsData } from "../../constants/homeData";

const C = {
  bg: "#F8FAFC",
  card: "#FFFFFF",
  text: "#0F172A",
  sub: "#64748B",
  muted: "#94A3B8",
  border: "#E2E8F0",
  accent: "#DB2777",
  accentBg: "#FDF2F8",
  green: "#16A34A",
  greenBg: "#F0FDF4",
  red: "#DC2626",
  redBg: "#FEF2F2",
  amber: "#D97706",
  amberBg: "#FFFBEB",
};

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
];

const STATUS_STYLE = {
  pending: { label: "Awaiting reply", color: C.amber, bg: C.amberBg },
  accepted: { label: "Accepted", color: C.green, bg: C.greenBg },
  declined: { label: "Declined", color: C.red, bg: C.redBg },
};

const formatINR = (n) => "₹" + Number(n).toLocaleString("en-IN");
const initials = (name) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/* ---------- Card ---------- */
function RequestCard({ item, onAccept, onDecline }) {
  const status = STATUS_STYLE[item.status];
  const isPending = item.status === "pending";

  return (
    <View style={styles.card}>
      {/* Top row */}
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.reqId}>{item.id}</Text>
          <Text style={styles.reqTime}>Requested {item.requestedAt}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.label}
          </Text>
        </View>
      </View>

      {/* Vehicle */}
      <View style={styles.vehicleRow}>
        {item.vehicle.image ? (
          <Image source={{ uri: item.vehicle.image }} style={styles.carImg} />
        ) : (
          <View style={[styles.carImg, styles.carPlaceholder]}>
            <MaterialCommunityIcons name="car" size={28} color={C.muted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.carName} numberOfLines={1}>
            {item.vehicle.name}
          </Text>
          <Text style={styles.carType}>{item.vehicle.type}</Text>
          <View style={styles.plate}>
            <Text style={styles.plateText}>{item.vehicle.plate}</Text>
          </View>
        </View>
      </View>

      {/* Date range – the hero of the card */}
      <View style={styles.dateBox}>
        <View style={styles.dateCol}>
          <Text style={styles.dateLabel}>Current return</Text>
          <Text style={[styles.dateValue, styles.dateOld]}>
            {item.fromDate}
          </Text>
          <Text style={styles.dateTime}>{item.fromTime}</Text>
        </View>

        <View style={styles.dateMiddle}>
          <View style={styles.extraPill}>
            <Text style={styles.extraText}>
              +{item.extraDays} {item.extraDays > 1 ? "days" : "day"}
            </Text>
          </View>
          <View style={styles.arrowLine}>
            <View style={styles.line} />
            <Ionicons name="chevron-forward" size={14} color={C.accent} />
          </View>
        </View>

        <View style={[styles.dateCol, { alignItems: "flex-end" }]}>
          <Text style={styles.dateLabel}>New return</Text>
          <Text style={[styles.dateValue, { color: C.accent }]}>
            {item.toDate}
          </Text>
          <Text style={styles.dateTime}>{item.toTime}</Text>
        </View>
      </View>

      <View style={styles.chargeRow}>
        <Text style={styles.chargeLabel}>Extra charge</Text>
        <Text style={styles.chargeValue}>{formatINR(item.extraAmount)}</Text>
      </View>

      <View style={styles.divider} />

      {/* Customer */}
      <View style={styles.customerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(item.customer.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.custName}>{item.customer.name}</Text>
          <Text style={styles.custSub}>
            {item.customer.phone} • {item.customer.bookingId}
          </Text>
        </View>
        <Pressable
          style={styles.callBtn}
          onPress={() => Linking.openURL(`tel:${item.customer.phone}`)}
          hitSlop={8}
          accessibilityLabel={`Call ${item.customer.name}`}
        >
          <Feather name="phone" size={16} color={C.green} />
        </Pressable>
      </View>

      {/* Reason */}
      <View style={styles.reasonBox}>
        <View style={styles.reasonHead}>
          <Feather name="message-square" size={13} color={C.sub} />
          <Text style={styles.reasonLabel}>Reason</Text>
        </View>
        <Text style={styles.reasonText}>{item.reason}</Text>
      </View>

      {/* Actions */}
      {isPending && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onDecline(item)}
            style={({ pressed }) => [
              styles.btn,
              styles.btnDecline,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="close" size={18} color={C.red} />
            <Text style={[styles.btnText, { color: C.red }]}>Decline</Text>
          </Pressable>
          <Pressable
            onPress={() => onAccept(item)}
            style={({ pressed }) => [
              styles.btn,
              styles.btnAccept,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={[styles.btnText, { color: "#fff" }]}>Accept</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/* ---------- Screen ---------- */
export default function ExtensionRequests() {
  const router = useRouter();
  const [requests, setRequests] = useState(extensionRequestsData ?? []);
  const [filter, setFilter] = useState("pending");

  const counts = useMemo(
    () =>
      FILTERS.reduce((acc, f) => {
        acc[f.key] = requests.filter((r) => r.status === f.key).length;
        return acc;
      }, {}),
    [requests],
  );

  const visible = requests.filter((r) => r.status === filter);

  const updateStatus = (id, status) => {
    // TODO: call your API here, then update state on success
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r)),
    );
  };

  const handleAccept = (item) => {
    Alert.alert(
      "Accept extension?",
      `${item.customer.name}'s rental of ${item.vehicle.name} will be extended to ${item.toDate}, ${item.toTime}. Extra charge: ${formatINR(item.extraAmount)}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Accept", onPress: () => updateStatus(item.id, "accepted") },
      ],
    );
  };

  const handleDecline = (item) => {
    Alert.alert(
      "Decline extension?",
      `${item.customer.name} will need to return ${item.vehicle.name} on ${item.fromDate}, ${item.fromTime}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: () => updateStatus(item.id, "declined"),
        },
      ],
    );
  };

  const EmptyState = () => (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons
          name="calendar-check"
          size={34}
          color={C.accent}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {filter === "pending" ? "No requests waiting" : `No ${filter} requests`}
      </Text>
      <Text style={styles.emptySub}>
        {filter === "pending"
          ? "When a customer asks to keep a car longer, it will show up here."
          : "Requests you respond to will be listed here."}
      </Text>
    </View>
  );

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
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Extension Requests</Text>
          <Text style={styles.subtitle}>
            {counts.pending} waiting for your reply
          </Text>
        </View>
      </View>

      {/* Filter tabs */}
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
              <View style={[styles.tabCount, active && styles.tabCountActive]}>
                <Text
                  style={[styles.tabCountText, active && { color: C.accent }]}
                >
                  {counts[f.key]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RequestCard
            item={item}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        )}
        contentContainerStyle={[
          styles.list,
          visible.length === 0 && { flexGrow: 1 },
        ]}
        ListEmptyComponent={EmptyState}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: "700", color: C.text },
  subtitle: { fontSize: 13, color: C.sub, marginTop: 2 },

  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    padding: 4,
    backgroundColor: "#EEF2F6",
    borderRadius: 14,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  tabActive: {
    backgroundColor: C.card,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: { fontSize: 13, fontWeight: "600", color: C.sub },
  tabTextActive: { color: C.text },
  tabCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountActive: { backgroundColor: C.accentBg },
  tabCountText: { fontSize: 11, fontWeight: "700", color: C.sub },

  list: { padding: 16, paddingBottom: 40, gap: 14 },

  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  reqId: { fontSize: 14, fontWeight: "700", color: C.text },
  reqTime: { fontSize: 12, color: C.muted, marginTop: 2 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: "600" },

  vehicleRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  carImg: {
    width: 88,
    height: 60,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  carPlaceholder: { alignItems: "center", justifyContent: "center" },
  carName: { fontSize: 16, fontWeight: "700", color: C.text },
  carType: { fontSize: 12, color: C.sub, marginTop: 2 },
  plate: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.text,
    backgroundColor: "#FFFFFF",
  },
  plateText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: C.text,
  },

  dateBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.accentBg,
  },
  dateCol: { flex: 1 },
  dateLabel: { fontSize: 11, color: C.sub, marginBottom: 4 },
  dateValue: { fontSize: 15, fontWeight: "700", color: C.text },
  dateOld: { color: C.sub, textDecorationLine: "line-through" },
  dateTime: { fontSize: 12, color: C.sub, marginTop: 2 },
  dateMiddle: { alignItems: "center", paddingHorizontal: 6 },
  extraPill: {
    backgroundColor: C.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 6,
  },
  extraText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  arrowLine: { flexDirection: "row", alignItems: "center" },
  line: {
    width: 36,
    height: 1.5,
    backgroundColor: C.accent,
    opacity: 0.5,
    marginRight: -4,
  },

  chargeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 2,
  },
  chargeLabel: { fontSize: 13, color: C.sub },
  chargeValue: { fontSize: 16, fontWeight: "700", color: C.text },

  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },

  customerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "700", color: "#2563EB" },
  custName: { fontSize: 15, fontWeight: "600", color: C.text },
  custSub: { fontSize: 12, color: C.sub, marginTop: 2 },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.greenBg,
    alignItems: "center",
    justifyContent: "center",
  },

  reasonBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderLeftWidth: 3,
    borderLeftColor: C.border,
  },
  reasonHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  reasonLabel: { fontSize: 12, fontWeight: "600", color: C.sub },
  reasonText: { fontSize: 14, lineHeight: 20, color: C.text },

  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnDecline: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: "#FECACA",
  },
  btnAccept: { backgroundColor: C.green },
  btnText: { fontSize: 15, fontWeight: "700" },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.accentBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: C.text },
  emptySub: {
    fontSize: 14,
    color: C.sub,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
});
