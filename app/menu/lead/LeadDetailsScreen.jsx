import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../../services/api";

// ── Date Formatting Helper ────────────────────────────────────────────────────
// Manually formats to "29 Jun 2026" — avoids toLocaleDateString inconsistencies
// on Android/iOS and timezone off-by-one issues with UTC-stored dates.
const MONTH_NAMES = [
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

const formatDisplayDate = (value) => {
  if (!value) return "N/A";
  // Parse YYYY-MM-DD or ISO string without shifting timezone
  // e.g. "2026-06-29" or "2026-06-29T00:00:00.000Z"
  const str = String(value);
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const day = parseInt(isoMatch[3], 10);
    const month = parseInt(isoMatch[2], 10) - 1; // 0-indexed
    const year = parseInt(isoMatch[1], 10);
    return `${String(day).padStart(2, "0")} ${MONTH_NAMES[month]} ${year}`;
  }
  // Fallback for non-ISO date objects or timestamps
  const date = new Date(value);
  if (isNaN(date.getTime())) return str;
  return `${String(date.getDate()).padStart(2, "0")} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
};

// ── Minimal Calendar Component ────────────────────────────────────────────────
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
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function CalendarPicker({ visible, value, onConfirm, onCancel, label }) {
  const parseDate = (str) => {
    if (!str) return new Date();
    // Handle both plain "YYYY-MM-DD" and full ISO strings
    // like "2026-06-29T00:00:00.000Z" by extracting the date part only.
    const match = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return new Date();
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    return new Date(y, m - 1, d);
  };
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;

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
            {DAYS.map((d) => (
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

// ── Change Log helpers ────────────────────────────────────────────────────────
const FIELD_LABELS = {
  vehicleName: "Fleet Model",
  vehicleType: "Vehicle Category",
  noOfDays: "Booking Duration",
  fromDate: "From Date",
  toDate: "To Date",
  residents: "Passengers",
  cabService: "Airport Cab Drop",
  mobileNumber: "Contact Line",
  email: "Email",
  leadOwner: "Account Executive",
  whatsappSent: "WhatsApp Automated",
  objective: "Pipeline Objective",
  strategyForClosing: "Strategy for Conversion",
  strategyPreparedBy: "Strategy Blueprint By",
  mondayLead: "Monday Launch Lead",
  longBookingLead: "Extended Scale Booking",
  status: "Status",
  priority: "Priority",
  nextFollowUpDate: "Next Follow-Up Date",
  nextActionItem: "Next Action Item",
  summary: "Summary Log",
  detailedConversation: "Detailed Discussion",
  remarksFeedback: "Remarks Feedback",
  feedbackBy: "Reviewed By",
  reasonForDealLoss: "Reason for Deal Loss",
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, visible }) {
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(op, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(1800),
        Animated.timing(op, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);
  return (
    <Animated.View style={[styles.toast, { opacity: op }]}>
      <Ionicons name="checkmark-circle" size={16} color="#fff" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ── Status / Priority config ──────────────────────────────────────────────────
const STATUS_OPTIONS = [
  "Incomplete information",
  "Information completed",
  "Quotation sent",
  "Negotiation",
  "Booking confirmed",
  "DNP",
  "Need B2B arrangement",
  "Not interested",
  "Disqualified",
  "Decision pending with customer",
  "Enquiry",
  "Deal lost",
];
const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];

// ── Date Row ──────────────────────────────────────────────────────────────────
const DateRow = ({
  label,
  icon,
  fieldKey,
  isEditing,
  editedLead,
  lead,
  calField,
  setCalField,
  updateField,
  updateQuickField,
}) => {
  const rawVal = isEditing ? editedLead[fieldKey] : lead[fieldKey];
  return (
    <>
      <CalendarPicker
        visible={calField === fieldKey}
        value={editedLead[fieldKey]}
        label={`Select ${label}`}
        onCancel={() => setCalField(null)}
        onConfirm={(d) => {
          if (fieldKey === "nextFollowupDate") {
            updateQuickField(fieldKey, d);
          } else {
            updateField(fieldKey, d);
          }

          setCalField(null);
        }}
      />
      <View style={styles.infoRowContainer}>
        <View style={styles.infoLabelSection}>
          <Ionicons
            name={icon}
            size={16}
            color="#64748B"
            style={{ marginRight: 8, width: 16 }}
          />
          <Text style={styles.infoLabelText}>{label}</Text>
        </View>
        {isEditing ? (
          <TouchableOpacity
            style={styles.datePill}
            onPress={() => setCalField(fieldKey)}
          >
            <Ionicons
              name="calendar"
              size={13}
              color="#2563EB"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.datePillText}>
              {rawVal ? formatDisplayDate(rawVal) : "Pick date"}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.infoValueText}>{formatDisplayDate(rawVal)}</Text>
        )}
      </View>
    </>
  );
};

// ── InfoRow ───────────────────────────────────────────────────────────────────
const InfoRow = ({
  label,
  value,
  icon,
  highlight = false,
  isBoolean = false,
  fieldKey,
  isEditing,
  editedLead,
  updateField,
}) => {
  if (isEditing && fieldKey) {
    if (isBoolean) {
      return (
        <View style={styles.infoRowContainer}>
          <View style={styles.infoLabelSection}>
            <Ionicons
              name={icon}
              size={16}
              color="#64748B"
              style={{ marginRight: 8, width: 16 }}
            />
            <Text style={styles.infoLabelText}>{label}</Text>
          </View>
          <Switch
            value={editedLead[fieldKey]}
            onValueChange={(val) => updateField(fieldKey, val)}
            trackColor={{ false: "#CBD5E1", true: "#3B82F6" }}
            thumbColor="#FFF"
          />
        </View>
      );
    }
    return (
      <View style={styles.editRowContainer}>
        <View style={styles.infoLabelSection}>
          <Ionicons
            name={icon}
            size={16}
            color="#64748B"
            style={{ marginRight: 8, width: 16 }}
          />
          <Text style={styles.infoLabelText}>{label}</Text>
        </View>
        <TextInput
          style={styles.inlineInput}
          value={String(editedLead[fieldKey] ?? "")}
          onChangeText={(val) => updateField(fieldKey, val)}
          placeholderTextColor="#94A3B8"
        />
      </View>
    );
  }
  return (
    <View style={styles.infoRowContainer}>
      <View style={styles.infoLabelSection}>
        <Ionicons
          name={icon}
          size={16}
          color="#64748B"
          style={{ marginRight: 8, width: 16 }}
        />
        <Text style={styles.infoLabelText}>{label}</Text>
      </View>
      <Text
        style={[
          styles.infoValueText,
          highlight && styles.highlightedValue,
          isBoolean && { fontWeight: "700" },
        ]}
      >
        {isBoolean ? (value ? "YES" : "NO") : value || "N/A"}
      </Text>
    </View>
  );
};

// ── TextBlock ─────────────────────────────────────────────────────────────────
const TextBlock = ({
  label,
  value,
  fieldKey,
  isEditing,
  editedLead,
  updateField,
  style = {},
}) => {
  if (isEditing && fieldKey) {
    return (
      <>
        <Text style={styles.textBlockLabel}>{label}</Text>
        <TextInput
          style={[styles.textBlockInput, style]}
          value={editedLead[fieldKey] ?? ""}
          onChangeText={(val) => updateField(fieldKey, val)}
          multiline
          placeholderTextColor="#94A3B8"
        />
      </>
    );
  }
  return (
    <>
      <Text style={styles.textBlockLabel}>{label}</Text>
      <Text style={[styles.textBlockValue, style]}>{value || "—"}</Text>
    </>
  );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function LeadDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState("strategy");
  const [lead, setLead] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedLead, setEditedLead] = useState(null);
  const [changeLogs, setChangeLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [calField, setCalField] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [toastVis, setToastVis] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [priorityModal, setPriorityModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newDiscussion, setNewDiscussion] = useState("");
  const [activities, setActivities] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [quickUpdating, setQuickUpdating] = useState("");

  useEffect(() => {
    fetchLead();
    fetchHistory();
    fetchActivities();
    fetchBookings();
  }, [id]);

  const fetchLead = async () => {
    try {
      const res = await api.get(`/leads/${id}`);
      if (res.data.success) {
        setLead(res.data.data);
        setEditedLead(res.data.data);
        setNewDiscussion("");
      }
    } catch (err) {
      console.log("Lead Details Error:", err.response?.data || err.message);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get(`/leads/${id}/history`);
      if (res.data.success) {
        setChangeLogs(res.data.data);
      }
    } catch (err) {
      console.log("History Error:", err.response?.data || err.message);
    } finally {
      setHistoryLoading(false);
    }
  };
  const fetchActivities = async () => {
    try {
      const res = await api.get(`/leads/${id}/activity`);

      if (res.data.success) {
        setActivities(res.data.data);
      }
    } catch (err) {
      console.log(err.response?.data || err.message);
    }
  };
  const fetchBookings = async () => {
    try {
      setBookingLoading(true);

      const res = await api.get(`/leads/${id}/bookings`);

      if (res.data.success) {
        setBookings(res.data.data || []);
      }
    } catch (err) {
      console.log(err.response?.data || err);
    } finally {
      setBookingLoading(false);
    }
  };
  const onRefresh = async () => {
    try {
      setRefreshing(true);

      await Promise.all([
        fetchLead(),
        fetchHistory(),
        fetchActivities(),
        fetchBookings(),
      ]);

      showToast("Data refreshed");
    } catch (err) {
      console.log(err);
    } finally {
      setRefreshing(false);
    }
  };
  const updateQuickField = async (field, value) => {
    try {
      setQuickUpdating(field);

      const res = await api.put(`/leads/${lead._id}`, {
        [field]: value,
      });

      if (res.data.success) {
        setLead(res.data.data);
        setEditedLead(res.data.data);

        if (field === "status") setStatusModal(false);
        if (field === "priority") setPriorityModal(false);
        if (field === "nextFollowupDate") setCalField(null);

        await fetchHistory();

        const fieldName = {
          status: "Status",
          priority: "Priority",
          nextFollowupDate: "Next Follow-up Date",
        };

        showToast(`${fieldName[field]} updated successfully`);
      }
    } catch (err) {
      console.log(err.response?.data || err.message);
      showToast("Unable to update.");
    } finally {
      setQuickUpdating("");
    }
  };

  if (!lead) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="small" color="#3B82F6" />
      </SafeAreaView>
    );
  }

  const showToast = (msg) => {
    setToastMsg(msg);
    setToastVis(true);
    setTimeout(() => setToastVis(false), 2200);
  };

  const handleEditToggle = () => {
    if (isEditing) {
      setEditedLead(lead);
      setNewDiscussion("");
    }

    setIsEditing(!isEditing);
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...editedLead,
      };

      // Never send the discussion array back
      delete payload.detailedConversation;

      // Only send a new discussion if entered
      if (newDiscussion.trim()) {
        payload.detailedConversation = newDiscussion.trim();
      }

      const res = await api.put(`/leads/${lead._id}`, payload);

      if (res.data.success) {
        setLead(res.data.data);
        setEditedLead(res.data.data);

        setNewDiscussion("");

        await fetchHistory();

        setIsEditing(false);

        showToast("Lead updated successfully.");
      }
    } catch (err) {
      console.log(err.response?.data || err.message);
      showToast("Unable to update lead.");
    }
  };

  const updateField = (field, value) => {
    setEditedLead((prev) => ({ ...prev, [field]: value }));
  };

  const triggerPhoneCall = () => Linking.openURL(`tel:${lead.mobileNumber}`);
  const triggerSMS = () => Linking.openURL(`sms:${lead.mobileNumber}`);
  const triggerWhatsApp = () => {
    const msg = `Hello ${lead.customerName}, regarding your ${lead.vehicleName} booking request...`;
    Linking.openURL(
      `whatsapp://send?phone=${lead.mobileNumber}&text=${encodeURIComponent(msg)}`,
    );
  };
  const triggerEmail = () =>
    Linking.openURL(
      `mailto:${lead.email}?subject=Booking Update – ${lead.customerName}`,
    );

  const statusColor = {
    new: { bg: "#EFF6FF", text: "#2563EB" },
    follow_up: { bg: "#E0F2FE", text: "#0369A1" },
    interested: { bg: "#F0FDF4", text: "#15803D" },
    booked: { bg: "#F0FDF4", text: "#166534" },
    lost: { bg: "#FEE2E2", text: "#DC2626" },
    not_responding: { bg: "#FEF9C3", text: "#854D0E" },
  };
  const priorityColor = {
    low: { bg: "#F1F5F9", text: "#475569" },
    medium: { bg: "#FFF7ED", text: "#C2410C" },
    high: { bg: "#FFEDD5", text: "#EA580C" },
    urgent: { bg: "#FEE2E2", text: "#EF4444" },
  };
  const sc = statusColor[lead.status] || statusColor.new;
  const pc = priorityColor[lead.priority] || priorityColor.medium;

  const LOG_TYPE_META = {
    created: { icon: "add-circle", color: "#16A34A" },
    edit: { icon: "pencil", color: "#2563EB" },
    call: { icon: "call", color: "#2563EB" },
    whatsapp: { icon: "logo-whatsapp", color: "#16A34A" },
    sms: { icon: "chatbubble-ellipses", color: "#A855F7" },
    email: { icon: "mail", color: "#EA580C" },
    status: { icon: "swap-horizontal", color: "#D97706" },
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lead Profile</Text>
        {activeTab !== "logs" ? (
          isEditing ? (
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleEditToggle}
              >
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.editIconButton}
              onPress={handleEditToggle}
            >
              <Ionicons name="create-outline" size={22} color="#3B82F6" />
            </TouchableOpacity>
          )
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* ── Profile card ── */}
      {/* ── Profile card ── */}
      <View style={styles.profileHeaderCard}>
        {/* Top row: identity + call log */}
        <View style={styles.profileTopRow}>
          <View style={styles.profileIdentity}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {(isEditing ? editedLead : lead).customerName
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>

            <View style={styles.profileNameBlock}>
              {isEditing ? (
                <TextInput
                  style={styles.profileNameInput}
                  value={editedLead.customerName}
                  onChangeText={(val) => updateField("customerName", val)}
                />
              ) : (
                <Text style={styles.profileName} numberOfLines={1}>
                  {lead.customerName}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/menu/lead/CallLogScreen",
                params: { id: lead._id },
              })
            }
            style={styles.callLogButton}
          >
            <Ionicons name="time-outline" size={16} color="#2563EB" />
            <Text style={styles.callLogButtonText}>Call Log</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom row: status / priority / follow-up */}
        <View style={styles.profileMetaRow}>
          <View style={styles.badgeRow}>
            <TouchableOpacity
              style={[styles.statusBadge, { backgroundColor: sc.bg }]}
              onPress={() => !quickUpdating && setStatusModal(true)}
              disabled={quickUpdating === "status"}
            >
              {quickUpdating === "status" ? (
                <ActivityIndicator size="small" color={sc.text} />
              ) : (
                <>
                  <Ionicons
                    name="chevron-down"
                    size={10}
                    color={sc.text}
                    style={{ marginRight: 3 }}
                  />
                  <Text style={[styles.statusBadgeText, { color: sc.text }]}>
                    {lead.status.toUpperCase()}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.priorityBadge, { backgroundColor: pc.bg }]}
              onPress={() => !quickUpdating && setPriorityModal(true)}
              disabled={quickUpdating === "priority"}
            >
              {quickUpdating === "priority" ? (
                <ActivityIndicator size="small" color={pc.text} />
              ) : (
                <>
                  <Ionicons
                    name="chevron-down"
                    size={10}
                    color={pc.text}
                    style={{ marginRight: 3 }}
                  />
                  <Text style={[styles.priorityBadgeText, { color: pc.text }]}>
                    {lead.priority.toUpperCase()}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.followUpBadge}
            onPress={() => !quickUpdating && setCalField("nextFollowupDate")}
            disabled={quickUpdating === "nextFollowupDate"}
          >
            {quickUpdating === "nextFollowupDate" ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <>
                <Text style={styles.followUpLabel}>Follow Up</Text>

                <Text style={styles.followUpBadgeText} numberOfLines={1}>
                  {formatDisplayDate(
                    lead.nextFollowupDate || lead.nextFollowUpDate,
                  )}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <CalendarPicker
          visible={calField === "nextFollowupDate"}
          value={lead.nextFollowupDate || lead.nextFollowUpDate}
          label="Select Next Follow-up Date"
          onCancel={() => setCalField(null)}
          onConfirm={(date) => {
            updateQuickField("nextFollowupDate", date);
            setCalField(null);
          }}
        />
      </View>

      {/* ── Action toolbar ── */}
      <View style={styles.actionToolbar}>
        {[
          {
            label: "Call",
            bg: "#EFF6FF",
            color: "#2563EB",
            icon: "call",
            fn: triggerPhoneCall,
          },
          {
            label: "WhatsApp",
            bg: "#F0FDF4",
            color: "#16A34A",
            icon: "logo-whatsapp",
            fn: triggerWhatsApp,
          },
          {
            label: "Message",
            bg: "#FDF4FF",
            color: "#C084FC",
            icon: "chatbubble-ellipses",
            fn: triggerSMS,
          },
          {
            label: "Email",
            bg: "#FFF7ED",
            color: "#EA580C",
            icon: "mail",
            fn: triggerEmail,
          },
        ].map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.actionToolItem, { backgroundColor: item.bg }]}
            onPress={item.fn}
          >
            <Ionicons name={item.icon} size={18} color={item.color} />
            <Text style={[styles.actionToolText, { color: item.color }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {lead?.status === "Booking confirmed" && (
        <View style={styles.createBookingContainer}>
          <TouchableOpacity
            style={styles.createBookingButton}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: "./CreateBookingScreen",
                params: {
                  lead: JSON.stringify(lead),
                  mode: "new",
                },
              })
            }
          >
            <Ionicons name="add-circle-outline" size={20} color="#FFF" />

            <Text style={styles.createBookingButtonText}>New Booking</Text>
          </TouchableOpacity>
        </View>
      )}

      {isEditing && (
        <View style={styles.editBanner}>
          <Ionicons name="pencil" size={14} color="#2563EB" />
          <Text style={styles.editBannerText}>
            Editing — tap date fields to open calendar · tap Save when done
          </Text>
        </View>
      )}

      {/* ── Tab bar ── */}
      <View style={styles.tabBarLayout}>
        {[
          { id: "overview", label: "Overview" },
          { id: "bookings", label: "Bookings" },
          { id: "strategy", label: "Strategy" },
          { id: "logs", label: `History (${changeLogs.length})` },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tabItemButton,
              activeTab === tab.id && styles.tabItemButtonActive,
            ]}
            onPress={() => {
              setActiveTab(tab.id);
              if (tab.id === "logs" && isEditing) {
                setIsEditing(false);
                setEditedLead(lead);
              }
            }}
          >
            <Text
              style={[
                styles.tabItemText,
                activeTab === tab.id && styles.tabItemTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.contentScroller}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#3B82F6"]} // Android
            tintColor="#3B82F6" // iOS
          />
        }
      >
        {/* ════ OVERVIEW ════ */}
        {activeTab === "overview" && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Logistics Requirements</Text>
            <InfoRow
              label="Fleet Model"
              value={isEditing ? editedLead.vehicleName : lead.vehicleName}
              icon="car-sport"
              highlight
              fieldKey="vehicleName"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
            <InfoRow
              label="Vehicle Category"
              value={(isEditing
                ? editedLead.vehicleType
                : lead.vehicleType
              ).toUpperCase()}
              icon="options"
              fieldKey="vehicleType"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
            <InfoRow
              label="Booking Duration (Days)"
              value={`${lead.totalDays || 0} Days`}
              icon="time-outline"
            />
            <DateRow
              label="From Date"
              icon="calendar"
              fieldKey="fromDate"
              isEditing={isEditing}
              editedLead={editedLead}
              lead={lead}
              calField={calField}
              setCalField={setCalField}
              updateField={updateField}
            />
            <DateRow
              label="To Date"
              icon="calendar-outline"
              fieldKey="toDate"
              isEditing={isEditing}
              editedLead={editedLead}
              lead={lead}
              calField={calField}
              setCalField={setCalField}
              updateField={updateField}
            />
            <InfoRow
              label="Passengers"
              value={isEditing ? editedLead.residents : lead.residents}
              icon="people"
              fieldKey="residents"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
            <InfoRow
              label="Airport Cab Drop"
              value={isEditing ? editedLead.cabService : lead.cabService}
              icon="airplane"
              isBoolean
              fieldKey="cabService"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />

            <View style={styles.blockDivider} />
            <Text style={styles.sectionTitle}>Client Details</Text>
            <InfoRow
              label="Contact Number"
              value={isEditing ? editedLead.mobileNumber : lead.mobileNumber}
              icon="phone-portrait-outline"
              fieldKey="mobileNumber"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
            <InfoRow
              label="Email Address"
              value={isEditing ? editedLead.email : lead.email}
              icon="mail-outline"
              fieldKey="email"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
            <InfoRow
              label="Inquiry Date & Time"
              value={`${formatDisplayDate(lead.leadDate)} at ${lead.leadTime || "—"}`}
              icon="create-outline"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
            <InfoRow
              label="WhatsApp Sent"
              value={isEditing ? editedLead.whatsappSent : lead.whatsappSent}
              icon="checkmark-circle-outline"
              isBoolean
              fieldKey="whatsappSent"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
            <InfoRow
              label="Missed Calls"
              value={`${lead.missedCalls || 0} Instances`}
              icon="call-outline"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
            <View style={styles.blockDivider} />
            <Text style={styles.sectionTitle}>Flags</Text>
            <InfoRow
              label="Monday Launch Lead"
              value={isEditing ? editedLead.mondayLead : lead.mondayLead}
              icon="flag"
              isBoolean
              fieldKey="mondayLead"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
            <InfoRow
              label="Extended Booking"
              value={
                isEditing ? editedLead.longBookingLead : lead.longBookingLead
              }
              icon="trending-up"
              isBoolean
              fieldKey="longBookingLead"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
          </View>
        )}

        {/* ════ STRATEGY ════ */}
        {activeTab === "strategy" && (
          <View style={styles.sectionCard}>
            <TextBlock
              label="Next Action Item"
              value={lead.nextActionItem}
              fieldKey="nextActionItem"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
              style={{ color: "#D97706" }}
            />
            <TextBlock
              label="Strategy for Conversion"
              value={lead.strategyForClosing}
              fieldKey="strategyForClosing"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
            <TextBlock
              label="Summary"
              value={lead.conversationSummary}
              fieldKey="conversationSummary"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
              style={{ fontStyle: "italic" }}
            />
            <Text style={styles.textBlockLabel}>Detailed Discussion</Text>

            {isEditing ? (
              <TextInput
                style={styles.textBlockInput}
                placeholder="Add new discussion..."
                placeholderTextColor="#94A3B8"
                value={newDiscussion}
                onChangeText={setNewDiscussion}
                multiline
              />
            ) : lead.detailedConversation?.length > 0 ||
              activities.length > 0 ? (
              [
                ...(lead.detailedConversation || []).map((item) => ({
                  type: "discussion",
                  createdAt: item.createdAt,
                  addedBy: item.addedBy,
                  message: item.message,
                })),

                ...(activities || []).map((item) => ({
                  type: "activity",
                  createdAt: item.createdAt,
                  addedBy: item.createdBy,
                  message: item.activitySummary,
                  contactType: item.contactType,
                })),
              ]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map((item, index) => (
                  <View key={index} style={styles.discussionCard}>
                    <View style={styles.discussionHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.discussionName}>
                          {item.addedBy?.fullName || "Unknown User"}
                        </Text>

                        {item.type === "activity" && (
                          <Text
                            style={{
                              color: "#2563EB",
                              fontSize: 12,
                              fontWeight: "600",
                              marginTop: 2,
                            }}
                          >
                            {item.contactType.toUpperCase()}
                          </Text>
                        )}
                      </View>

                      <View style={styles.timeBadge}>
                        <Text style={styles.timeBadgeText}>
                          {new Date(item.createdAt).toLocaleDateString(
                            "en-IN",
                            {
                              day: "2-digit",
                              month: "short",
                            },
                          )}
                          {" • "}
                          {new Date(item.createdAt).toLocaleTimeString(
                            "en-IN",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.discussionMessage}>{item.message}</Text>
                  </View>
                ))
            ) : (
              <View style={styles.emptyDiscussion}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={28}
                  color="#CBD5E1"
                />
                <Text style={styles.emptyDiscussionText}>
                  No discussion added yet.
                </Text>
              </View>
            )}
            {(lead.reasonForDealLoss || isEditing) && (
              <TextBlock
                label="Reason for Deal Loss"
                value={lead.reasonForDealLoss}
                fieldKey="reasonForDealLoss"
                isEditing={isEditing}
                editedLead={editedLead}
                updateField={updateField}
                style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
              />
            )}

            <View style={styles.blockDivider} />
            <TextBlock
              label="Remarks & Feedback"
              value={lead.remarksFeedback}
              fieldKey="remarksFeedback"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
            <InfoRow
              label="Reviewed By"
              value={isEditing ? editedLead.feedbackBy : lead.feedbackBy}
              icon="ribbon"
              fieldKey="feedbackBy"
              isEditing={isEditing}
              editedLead={editedLead}
              updateField={updateField}
            />
          </View>
        )}

        {activeTab === "bookings" && (
          <View style={styles.sectionCard}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Text style={styles.sectionTitle}>
                Booking History ({bookings.length})
              </Text>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "./CreateBookingScreen",
                    params: {
                      lead: JSON.stringify(lead),
                      mode: "new",
                    },
                  })
                }
              >
                <Ionicons name="add-circle" size={28} color="#16A34A" />
              </TouchableOpacity>
            </View>

            {bookingLoading ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : bookings.length === 0 ? (
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: 40,
                }}
              >
                <Ionicons name="receipt-outline" size={40} color="#CBD5E1" />

                <Text
                  style={{
                    marginTop: 12,
                    color: "#64748B",
                    fontWeight: "600",
                  }}
                >
                  No bookings found
                </Text>
              </View>
            ) : (
              bookings.map((booking) => (
                <TouchableOpacity
                  key={booking._id}
                  style={{
                    backgroundColor: "#FFF",
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 12,
                  }}
                  onPress={() =>
                    router.push({
                      pathname: "./CreateBookingScreen",
                      params: {
                        lead: JSON.stringify(lead),
                        booking: JSON.stringify(booking),
                        mode: "edit",
                      },
                    })
                  }
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "700",
                        fontSize: 15,
                      }}
                    >
                      {booking.bookingCode}
                    </Text>

                    <Text
                      style={{
                        color: "#2563EB",
                        fontWeight: "700",
                      }}
                    >
                      {booking.status.toUpperCase()}
                    </Text>
                  </View>

                  <Text style={{ marginTop: 8 }}>
                    Vehicle : {booking.vehicleName}
                  </Text>

                  <Text>Pickup : {formatDisplayDate(booking.fromDate)}</Text>

                  <Text>Return : {formatDisplayDate(booking.toDate)}</Text>

                  <Text>Booking Amount : ₹{booking.bookingAmount}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* ════ HISTORY LOGS ════ */}
        {activeTab === "logs" && (
          <View>
            <View style={styles.logStatsRow}>
              <View style={styles.logStatBox}>
                <Text style={styles.logStatNum}>{changeLogs.length}</Text>
                <Text style={styles.logStatLabel}>Total Events</Text>
              </View>
              <View style={styles.logStatBox}>
                <Text style={styles.logStatNum}>
                  {changeLogs.filter((l) => l.type === "edit").length}
                </Text>
                <Text style={styles.logStatLabel}>Edits</Text>
              </View>
              <View style={styles.logStatBox}>
                <Text style={styles.logStatNum}>{lead.missedCalls || 0}</Text>
                <Text style={styles.logStatLabel}>Missed Calls</Text>
              </View>
              <View style={styles.logStatBox}>
                <Text style={[styles.logStatNum, { fontSize: 12 }]}>
                  {formatDisplayDate(
                    lead.nextFollowupDate || lead.nextFollowUpDate,
                  )}
                </Text>
                <Text style={[styles.logStatLabel, { fontSize: 9 }]}>
                  Next Follow-Up
                </Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Change Timeline</Text>
              {historyLoading ? (
                <ActivityIndicator
                  size="small"
                  color="#3B82F6"
                  style={{ marginVertical: 20 }}
                />
              ) : changeLogs.length === 0 ? (
                <View style={styles.emptyLogs}>
                  <Ionicons
                    name="document-text-outline"
                    size={36}
                    color="#CBD5E1"
                  />
                  <Text style={styles.emptyLogsText}>
                    No activity logged yet.
                  </Text>
                  <Text style={styles.emptyLogsSub}>
                    Changes made in edit mode will appear here.
                  </Text>
                </View>
              ) : (
                changeLogs.map((log, idx) => {
                  const logKey = log._id || log.id || String(idx);
                  const meta = LOG_TYPE_META[log.type] || LOG_TYPE_META.edit;
                  const isLast = idx === changeLogs.length - 1;

                  const isDateField = [
                    "fromDate",
                    "toDate",
                    "nextFollowupDate",
                    "leadDate",
                    "lastFollowupDate",
                    "lastContactedDate",
                    "bookingConfirmedAt",
                    "quotationSentAt",
                  ].includes(log.field);

                  const displayFrom = isDateField
                    ? formatDisplayDate(log.oldValue)
                    : typeof log.oldValue === "boolean"
                      ? log.oldValue
                        ? "YES"
                        : "NO"
                      : String(log.oldValue ?? "—");

                  const displayTo = isDateField
                    ? formatDisplayDate(log.newValue)
                    : typeof log.newValue === "boolean"
                      ? log.newValue
                        ? "YES"
                        : "NO"
                      : String(log.newValue ?? "—");

                  // Unified custom date extraction logic for the timeline entries
                  const getFormattedLogTime = (timestamp) => {
                    if (!timestamp) return "";
                    const dateObj = new Date(timestamp);
                    if (isNaN(dateObj.getTime())) return String(timestamp);

                    const displayDate = formatDisplayDate(timestamp);
                    const hours = String(dateObj.getHours()).padStart(2, "0");
                    const minutes = String(dateObj.getMinutes()).padStart(
                      2,
                      "0",
                    );

                    return `${displayDate} at ${hours}:${minutes}`;
                  };

                  return (
                    <View key={logKey} style={styles.logEntry}>
                      <View style={styles.logLineCol}>
                        <View
                          style={[
                            styles.logDot,
                            { backgroundColor: meta.color },
                          ]}
                        >
                          <Ionicons name={meta.icon} size={10} color="#fff" />
                        </View>
                        {!isLast && <View style={styles.logLine} />}
                      </View>
                      <View style={styles.logContent}>
                        <View style={styles.logHeader}>
                          <Text
                            style={[styles.logField, { color: meta.color }]}
                          >
                            {log.type === "created"
                              ? "Lead Created"
                              : FIELD_LABELS[log.field] || log.field}{" "}
                          </Text>
                          <Text style={styles.logTime}>
                            {log.createdAt
                              ? getFormattedLogTime(log.createdAt)
                              : log.timestamp || ""}
                          </Text>
                        </View>
                        {log.type !== "created" && (
                          <View style={styles.logChange}>
                            <View style={styles.logFromBubble}>
                              <Text style={styles.logFromLabel}>FROM</Text>
                              <Text
                                style={styles.logFromText}
                                numberOfLines={2}
                              >
                                {displayFrom}
                              </Text>
                            </View>
                            <Ionicons
                              name="arrow-forward"
                              size={14}
                              color="#94A3B8"
                              style={{ marginHorizontal: 6, marginTop: 2 }}
                            />
                            <View style={styles.logToBubble}>
                              <Text style={styles.logToLabel}>TO</Text>
                              <Text style={styles.logToText} numberOfLines={2}>
                                {displayTo}
                              </Text>
                            </View>
                          </View>
                        )}
                        <Text style={styles.logActor}>
                          <Ionicons
                            name="person-outline"
                            size={11}
                            color="#94A3B8"
                          />{" "}
                          {log.changedBy?.name || "System"}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Status Picker Modal ── */}
      <Modal visible={statusModal} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Change Status</Text>
            {STATUS_OPTIONS.map((s) => {
              const c = statusColor[s] || { bg: "#F1F5F9", text: "#475569" };
              const isCurrent = editedLead?.status === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.pickerOption,
                    isCurrent && { backgroundColor: c.bg },
                  ]}
                  onPress={() => updateQuickField("status", s)}
                >
                  <View
                    style={[styles.pickerDot, { backgroundColor: c.text }]}
                  />
                  <Text
                    style={[
                      styles.pickerOptionText,
                      isCurrent && { color: c.text, fontWeight: "800" },
                    ]}
                  >
                    {s.toUpperCase().replace("_", " ")}
                  </Text>
                  {isCurrent && (
                    <Ionicons name="checkmark" size={16} color={c.text} />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.pickerCancel}
              onPress={() => setStatusModal(false)}
            >
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Priority Picker Modal ── */}
      <Modal visible={priorityModal} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Change Priority</Text>
            {PRIORITY_OPTIONS.map((p) => {
              const c = priorityColor[p] || { bg: "#F1F5F9", text: "#475569" };
              const isCurrent = editedLead?.priority === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.pickerOption,
                    isCurrent && { backgroundColor: c.bg },
                  ]}
                  onPress={() => updateQuickField("priority", p)}
                >
                  <View
                    style={[styles.pickerDot, { backgroundColor: c.text }]}
                  />
                  <Text
                    style={[
                      styles.pickerOptionText,
                      isCurrent && { color: c.text, fontWeight: "800" },
                    ]}
                  >
                    {p.toUpperCase()}
                  </Text>
                  {isCurrent && (
                    <Ionicons name="checkmark" size={16} color={c.text} />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.pickerCancel}
              onPress={() => setPriorityModal(false)}
            >
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Toast message={toastMsg} visible={toastVis} />
    </SafeAreaView>
  );
}

// ── Calendar styles ───────────────────────────────────────────────────────────
const cal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
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
    elevation: 8,
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  editIconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
  },
  saveButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#3B82F6",
  },
  saveButtonText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  editBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderColor: "#BFDBFE",
  },
  editBannerText: {
    fontSize: 12,
    color: "#2563EB",
    fontWeight: "600",
    flex: 1,
  },

  // ── Profile card ──────────────────────────────────────────────────────────
  profileHeaderCard: {
    backgroundColor: "#FFF",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: "#F1F5F9",
  },
  profileTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  profileIdentity: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1E3A8A",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#FFF", fontSize: 20, fontWeight: "700" },
  profileNameBlock: { marginLeft: 12, flex: 1 },
  profileName: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  profileNameInput: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    borderBottomWidth: 1.5,
    borderColor: "#3B82F6",
    paddingVertical: 2,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  profileSub: { fontSize: 12, color: "#94A3B8", fontWeight: "500" },
  callLogButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  callLogButtonText: {
    marginLeft: 5,
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 12.5,
  },
  profileMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginTop: 14,
    gap: 8,
  },
  badgeRow: { flexDirection: "row", gap: 6 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  followUpLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginRight: 6,
  },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  priorityBadgeText: { fontSize: 10, fontWeight: "800" },
  followUpBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: 200,
  },
  followUpBadgeText: {
    color: "#2563EB",
    fontSize: 11.5,
    fontWeight: "700",
  },

  // ── Action toolbar ────────────────────────────────────────────────────────
  actionToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
  },
  actionToolItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginHorizontal: 3,
    borderRadius: 10,
  },
  actionToolText: { fontSize: 11, fontWeight: "700", marginLeft: 5 },

  // ── Tabs ──────────────────────────────────────────────────────────────────
  tabBarLayout: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
  },
  tabItemButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderColor: "transparent",
  },
  tabItemButtonActive: { borderColor: "#3B82F6" },
  tabItemText: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  tabItemTextActive: { color: "#3B82F6", fontWeight: "700" },
  contentScroller: { flex: 1 },

  // ── Section cards ─────────────────────────────────────────────────────────
  sectionCard: {
    backgroundColor: "#FFF",
    margin: 14,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 14,
  },
  infoRowContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 0.5,
    borderColor: "#F1F5F9",
  },
  editRowContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderColor: "#BFDBFE",
  },
  infoLabelSection: { flexDirection: "row", alignItems: "center", flex: 1 },
  infoLabelText: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  infoValueText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
    textAlign: "right",
    flex: 1,
  },
  highlightedValue: { color: "#2563EB", fontWeight: "700" },
  inlineInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
    textAlign: "right",
    borderBottomWidth: 1.5,
    borderColor: "#3B82F6",
    paddingVertical: 2,
    paddingHorizontal: 4,
    backgroundColor: "#F0F9FF",
    borderRadius: 4,
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  datePillText: { fontSize: 13, fontWeight: "700", color: "#2563EB" },
  blockDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 16 },
  textBlockLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    marginTop: 12,
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  textBlockValue: {
    fontSize: 13,
    color: "#334155",
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 8,
    lineHeight: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  textBlockInput: {
    fontSize: 13,
    color: "#1E293B",
    backgroundColor: "#F0F9FF",
    padding: 10,
    borderRadius: 8,
    lineHeight: 20,
    borderWidth: 1.5,
    borderColor: "#3B82F6",
    minHeight: 70,
    textAlignVertical: "top",
  },

  // ── History / logs ────────────────────────────────────────────────────────
  logStatsRow: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 4,
  },
  logStatBox: { flex: 1, alignItems: "center" },
  logStatNum: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  logStatLabel: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 2,
    textAlign: "center",
  },
  logEntry: { flexDirection: "row", marginBottom: 4 },
  logLineCol: { width: 28, alignItems: "center", paddingTop: 2 },
  logDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  logLine: { width: 2, flex: 1, backgroundColor: "#E2E8F0", marginTop: 4 },
  logContent: { flex: 1, paddingLeft: 8, paddingBottom: 20 },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  logField: { fontSize: 13, fontWeight: "700", flex: 1 },
  logTime: { fontSize: 11, color: "#94A3B8", marginLeft: 8 },
  logChange: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  logFromBubble: {
    flex: 1,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    padding: 6,
  },
  logFromLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#EF4444",
    marginBottom: 2,
  },
  logFromText: { fontSize: 12, color: "#7F1D1D" },
  logToBubble: {
    flex: 1,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    padding: 6,
  },
  logToLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#16A34A",
    marginBottom: 2,
  },
  logToText: { fontSize: 12, color: "#14532D" },
  logActor: { fontSize: 11, color: "#94A3B8" },
  emptyLogs: { alignItems: "center", paddingVertical: 32 },
  emptyLogsText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#CBD5E1",
    marginTop: 10,
  },
  emptyLogsSub: {
    fontSize: 12,
    color: "#CBD5E1",
    marginTop: 4,
    textAlign: "center",
  },

  // ── Picker modals ─────────────────────────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 16,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 6,
  },
  pickerDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  pickerOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  pickerCancel: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
  },
  pickerCancelText: { fontSize: 14, fontWeight: "700", color: "#64748B" },

  // ── Toast ─────────────────────────────────────────────────────────────────
  toast: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E3A8A",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 30,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  toastText: { color: "#FFF", fontSize: 13, fontWeight: "600" },

  // ── Discussion cards ──────────────────────────────────────────────────────
  discussionCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginTop: 10,
  },
  discussionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  discussionName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginRight: 10,
  },
  timeBadge: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  timeBadgeText: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "600",
  },
  discussionMessage: {
    fontSize: 14,
    lineHeight: 22,
    color: "#374151",
  },
  createBookingContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },

  createBookingButton: {
    height: 50,
    backgroundColor: "#16A34A",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  createBookingButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 8,
  },
});
