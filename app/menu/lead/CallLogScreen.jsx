import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
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

// ─── Extracted outside parent to prevent remount on every state change ────────
// This is the KEY fix: defining FormHeader inside CallLogScreen caused React to
// treat it as a new component type on every render → unmount/remount → keyboard closes.
const FormHeader = ({
  contactType,
  setContactType,
  direction,
  setDirection,
  activitySummary,
  setActivitySummary,
  outcome,
  setOutcome,
  showOutcomeMenu,
  setShowOutcomeMenu,
  followUpRequired,
  setFollowUpRequired,
  nextFollowUpDate,
  setNextFollowUpDate,
  showDatePicker,
  setShowDatePicker,
  leadStatus,
  setLeadStatus,
  showStatusMenu,
  setShowStatusMenu,
  handleSaveLog,
  outcomeOptions,
  statusOptions,
  formatDateLabel,
  handleDateChange,
}) => (
  <View style={styles.formContainer}>
    {/* Contact Type Toggle Badges */}
    <Text style={styles.groupLabel}>Contact Type</Text>
    <View style={styles.toggleRow}>
      {["call", "whatsapp", "message", "email"].map((type) => (
        <TouchableOpacity
          key={type}
          style={[
            styles.typeBadge,
            contactType === type && styles.activeTypeBadge,
          ]}
          onPress={() => setContactType(type)}
        >
          <Text
            style={[
              styles.typeBadgeText,
              contactType === type && styles.activeTypeBadgeText,
            ]}
          >
            {type === "call" && "📞 Call"}
            {type === "whatsapp" && "💬 WhatsApp"}
            {type === "message" && "✉️ SMS"}
            {type === "email" && "📧 Email"}
          </Text>
        </TouchableOpacity>
      ))}
    </View>

    {/* Direction Selection */}
    <Text style={styles.groupLabel}>Direction</Text>
    <View style={styles.radioRow}>
      <TouchableOpacity
        style={styles.radioButton}
        onPress={() => setDirection("incoming")}
      >
        <Ionicons
          name={
            direction === "incoming" ? "radio-button-on" : "radio-button-off"
          }
          size={18}
          color={direction === "incoming" ? "#0F172A" : "#64748B"}
        />
        <Text style={styles.radioLabel}>Incoming</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.radioButton}
        onPress={() => setDirection("outgoing")}
      >
        <Ionicons
          name={
            direction === "outgoing" ? "radio-button-on" : "radio-button-off"
          }
          size={18}
          color={direction === "outgoing" ? "#0F172A" : "#64748B"}
        />
        <Text style={styles.radioLabel}>Outgoing</Text>
      </TouchableOpacity>
    </View>

    {/* Conversation Summary */}
    <Text style={styles.groupLabel}>Conversation Summary</Text>
    <TextInput
      style={[styles.textInputBox, styles.textAreaBox]}
      value={activitySummary}
      onChangeText={setActivitySummary}
      placeholder="Customer asked about pricing, availability profiles..."
      placeholderTextColor="#94A3B8"
      multiline
      numberOfLines={4}
    />

    {/* Outcome Selector */}
    <Text style={styles.groupLabel}>Outcome</Text>
    <TouchableOpacity
      style={styles.dropdownSelector}
      onPress={() => setShowOutcomeMenu(!showOutcomeMenu)}
    >
      <Text style={styles.dropdownText}>{outcome}</Text>
      <Ionicons name="chevron-down" size={16} color="#64748B" />
    </TouchableOpacity>
    {showOutcomeMenu && (
      <View style={styles.dropdownExpandedList}>
        <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }}>
          {outcomeOptions.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={styles.dropdownOptionRow}
              onPress={() => {
                setOutcome(opt);
                setShowOutcomeMenu(false);
              }}
            >
              <Text style={styles.optionItemText}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    )}

    {/* Follow-up Checkbox */}
    <View style={styles.checkboxWrapperRow}>
      <TouchableOpacity
        style={styles.checkboxContainer}
        onPress={() => setFollowUpRequired(!followUpRequired)}
      >
        <Ionicons
          name={followUpRequired ? "checkbox" : "square-outline"}
          size={22}
          color={followUpRequired ? "#3B82F6" : "#64748B"}
        />
        <Text style={styles.checkboxLabel}>Follow-up Required</Text>
      </TouchableOpacity>
    </View>

    {/* Follow Up Date */}
    {followUpRequired && (
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.groupLabel}>Next Follow-up Date</Text>
        <TouchableOpacity
          style={styles.calendarField}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.calendarValueText}>
            {formatDateLabel(nextFollowUpDate)}
          </Text>
          <Ionicons name="calendar-outline" size={18} color="#64748B" />
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={nextFollowUpDate}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "calendar"}
            onValueChange={handleDateChange}
            onDismiss={() => setShowDatePicker(false)}
          />
        )}
      </View>
    )}

    {/* Lead Status Selector */}
    <Text style={styles.groupLabel}>Lead Status After Contact</Text>
    <TouchableOpacity
      style={styles.dropdownSelector}
      onPress={() => setShowStatusMenu(!showStatusMenu)}
    >
      <Text style={styles.dropdownText}>{leadStatus}</Text>
      <Ionicons name="chevron-down" size={16} color="#64748B" />
    </TouchableOpacity>
    {showStatusMenu && (
      <View style={styles.dropdownExpandedList}>
        <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }}>
          {statusOptions.map((status) => (
            <TouchableOpacity
              key={status}
              style={styles.dropdownOptionRow}
              onPress={() => {
                setLeadStatus(status);
                setShowStatusMenu(false);
              }}
            >
              <Text style={styles.optionItemText}>{status}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    )}

    {/* Submit Button */}
    <TouchableOpacity
      style={styles.actionSubmitButton}
      activeOpacity={0.8}
      onPress={handleSaveLog}
    >
      <Text style={styles.actionSubmitButtonText}>Save Activity Log</Text>
    </TouchableOpacity>

    <View style={styles.sectionDividerRow}>
      <Text style={styles.sectionDividerTitle}>Activity History Timeline</Text>
    </View>
  </View>
);

// ─── History Item (also extracted outside for same reason) ────────────────────
const HistoryItem = ({ item }) => {
  const icons = {
    call: { name: "call", color: "#3B82F6", bg: "#EFF6FF" },
    whatsapp: { name: "logo-whatsapp", color: "#25D366", bg: "#DCFCE7" },
    message: { name: "chatbubble-text", color: "#F59E0B", bg: "#FEF3C7" },
    email: { name: "mail", color: "#EF4444", bg: "#FEE2E2" },
  };
  const config = icons[item.contactType] || icons.call;

  return (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={[styles.iconWrapper, { backgroundColor: config.bg }]}>
            <Ionicons name={config.name} size={16} color={config.color} />
          </View>
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.historyTypeText}>
              {item.contactType.toUpperCase()} ({item.direction.toUpperCase()})
            </Text>
            <Text style={styles.historyTimeText}>
              {new Date(item.createdAt).toLocaleString("en-IN")}
            </Text>

            <Text style={styles.historyUser}>
              👤 {item.createdBy?.fullName || "Unknown User"}
            </Text>
          </View>
        </View>
        <View style={styles.outcomeBadge}>
          <Text style={styles.outcomeBadgeText}>{item.outcome}</Text>
        </View>
      </View>
      <Text style={styles.historySummaryText}>{item.activitySummary}</Text>
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CallLogScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  // Form state
  const [contactType, setContactType] = useState("call");
  const [direction, setDirection] = useState("outgoing");
  const [duration, setDuration] = useState("00:00");
  const [activitySummary, setActivitySummary] = useState("");
  const [outcome, setOutcome] = useState("Interested");
  const [followUpRequired, setFollowUpRequired] = useState(true);
  const [nextFollowUpDate, setNextFollowUpDate] = useState(new Date());
  const [leadStatus, setLeadStatus] = useState("Enquiry");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showOutcomeMenu, setShowOutcomeMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  // Data state
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const outcomeOptions = [
    "No Answer",
    "Busy",
    "Callback Requested",
    "Interested",
    "Follow-up",
    "Booked",
    "Not Interested",
    "Wrong Number",
    "Converted",
    "Lost",
  ];

  const statusOptions = [
    "Enquiry",
    "Incomplete information",
    "Information completed",
    "Quotation sent",
    "Negotiation",
    "Booking confirmed",
    "Decision pending with customer",
    "Need B2B arrangement",
    "DNP",
    "Not interested",
    "Disqualified",
    "Deal lost",
  ];

  useEffect(() => {
    if (id) fetchActivities();
  }, [id]);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/leads/${id}/activity`);
      if (res.data.success) {
        setHistory(res.data.data);

        // Set current lead status from DB
        if (res.data.leadStatus) {
          setLeadStatus(res.data.leadStatus);
        }
      }
    } catch (err) {
      console.log(err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (selectedDate) setNextFollowUpDate(selectedDate);
  };

  const formatDateLabel = (date) =>
    date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const handleSaveLog = async () => {
    try {
      const validStatuses = [
        "Enquiry",
        "Incomplete information",
        "Information completed",
        "Quotation sent",
        "Negotiation",
        "Booking confirmed",
        "Decision pending with customer",
        "Need B2B arrangement",
        "DNP",
        "Not interested",
        "Disqualified",
        "Deal lost",
      ];

      const body = {
        contactType,
        direction,
        duration,
        activitySummary,
        outcome,
        followUpRequired,
        nextFollowUpDate,
        leadStatusAfterContact: validStatuses.includes(leadStatus)
          ? leadStatus
          : "Enquiry",
      };

      const res = await api.post(`/leads/${id}/activity`, body);

      if (res.data.success) {
        Alert.alert(
          "Success",
          "Activity log saved successfully.",
          [
            {
              text: "OK",
              onPress: () => router.back(),
            },
          ],
          { cancelable: false },
        );
      }
    } catch (err) {
      console.log(err.response?.data || err.message);
      Alert.alert("Error", "Failed to update activity. Please try again.");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.masterContainer}>
        <ActivityIndicator
          size="large"
          color="#2563EB"
          style={{ marginTop: 100 }}
        />
      </SafeAreaView>
    );
  }

  // Pass all state and handlers as props — FormHeader stays stable as a type
  const headerProps = {
    contactType,
    setContactType,
    direction,
    setDirection,
    activitySummary,
    setActivitySummary,
    outcome,
    setOutcome,
    showOutcomeMenu,
    setShowOutcomeMenu,
    followUpRequired,
    setFollowUpRequired,
    nextFollowUpDate,
    setNextFollowUpDate,
    showDatePicker,
    setShowDatePicker,
    leadStatus,
    setLeadStatus,
    showStatusMenu,
    setShowStatusMenu,
    handleSaveLog,
    outcomeOptions,
    statusOptions,
    formatDateLabel,
    handleDateChange,
  };

  return (
    <SafeAreaView style={styles.masterContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.appBarFrame}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Call Activity Log</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={history}
        renderItem={({ item }) => <HistoryItem item={item} />}
        keyExtractor={(item) => item._id}
        // Using an inline arrow here is fine because FormHeader itself is stable (defined outside)
        ListHeaderComponent={<FormHeader {...headerProps} />}
        contentContainerStyle={styles.timelineListContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  masterContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  appBarFrame: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 23,
  },
  backButton: {
    padding: 4,
  },
  appBarTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  timelineListContainer: {
    paddingBottom: 40,
  },
  formContainer: {
    padding: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  activeTypeBadge: {
    backgroundColor: "#0F172A",
    borderColor: "#0F172A",
  },
  typeBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  activeTypeBadgeText: {
    color: "#FFF",
  },
  radioRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  radioButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 24,
  },
  radioLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#334155",
    marginLeft: 6,
  },
  textInputBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#0F172A",
  },
  textAreaBox: {
    height: 80,
    paddingTop: 10,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  dropdownSelector: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  dropdownText: {
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "500",
  },
  dropdownExpandedList: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    marginTop: -12,
    marginBottom: 16,
    overflow: "hidden",
  },
  dropdownOptionRow: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  optionItemText: {
    fontSize: 14,
    color: "#334155",
  },
  checkboxWrapperRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginLeft: 8,
  },
  calendarField: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarValueText: {
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "500",
  },
  actionSubmitButton: {
    backgroundColor: "#2563EB",
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  actionSubmitButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },
  sectionDividerRow: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  sectionDividerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  historyCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  historyTypeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  historyTimeText: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  outcomeBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  outcomeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  historySummaryText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
  },
  historyDurationText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 6,
    fontVariant: ["tabular-nums"],
  },
});
