import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import api from "../../../services/api";

const DEFAULT_STATE = {
  date: "",
  time: "",
  fromDate: "",
  toDate: "",
  lastContactedDate: "",
  nextFollowUpDate: "",
  customerName: "",
  mobileNumber: "",
  vehicleType: "car",
  vehicleName: "",
  residents: 1,
  whatsappSent: false,
  priority: "medium",
  missedCalls: "",
  cabService: false,
  status: "",
  summary: "",
  nextActionItem: "",
  mondayLead: false,
  longBookingLead: false,
  strategyForClosing: "",
  strategyPreparedBy: "",
  detailedConversation: "",
  reasonForDealLoss: "",
  remarksFeedback: "",
  feedbackBy: "",
};

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

const DEAL_LOSS_OPTIONS = [
  "Car not available",
  "Doubtful customer",
  "No response from customer",
  "Plan changed",
  "Price high",
  "Time flexibility",
  "We didn't follow up",
];

const PRIORITY_COLORS = {
  high: { bg: "#EF4444", border: "#EF4444" },
  medium: { bg: "#F59E0B", border: "#F59E0B" },
  low: { bg: "#10B981", border: "#10B981" },
};

export default function AddLeadScreen({ navigation }) {
  const scrollRef = useRef(null);

  const [date, setDate] = useState(DEFAULT_STATE.date);
  const [time, setTime] = useState(DEFAULT_STATE.time);
  const [fromDate, setFromDate] = useState(DEFAULT_STATE.fromDate);
  const [toDate, setToDate] = useState(DEFAULT_STATE.toDate);
  const [lastContactedDate, setLastContactedDate] = useState(
    DEFAULT_STATE.lastContactedDate,
  );
  const [nextFollowUpDate, setNextFollowUpDate] = useState(
    DEFAULT_STATE.nextFollowUpDate,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDateField, setActiveDateField] = useState("");
  const [selectedDateObject, setSelectedDateObject] = useState(new Date());
  const [customerName, setCustomerName] = useState(DEFAULT_STATE.customerName);
  const [mobileNumber, setMobileNumber] = useState(DEFAULT_STATE.mobileNumber);
  const [vehicleType, setVehicleType] = useState(DEFAULT_STATE.vehicleType);
  const [vehicleName, setVehicleName] = useState(DEFAULT_STATE.vehicleName);
  const [residents, setResidents] = useState(DEFAULT_STATE.residents);
  const [whatsappSent, setWhatsappSent] = useState(DEFAULT_STATE.whatsappSent);
  const [priority, setPriority] = useState(DEFAULT_STATE.priority);
  const [missedCalls, setMissedCalls] = useState(DEFAULT_STATE.missedCalls);
  const [cabService, setCabService] = useState(DEFAULT_STATE.cabService);
  const [status, setStatus] = useState(DEFAULT_STATE.status);
  const [summary, setSummary] = useState(DEFAULT_STATE.summary);
  const [nextActionItem, setNextActionItem] = useState(
    DEFAULT_STATE.nextActionItem,
  );
  const [mondayLead, setMondayLead] = useState(DEFAULT_STATE.mondayLead);
  const [longBookingLead, setLongBookingLead] = useState(
    DEFAULT_STATE.longBookingLead,
  );
  const [strategyForClosing, setStrategyForClosing] = useState(
    DEFAULT_STATE.strategyForClosing,
  );
  const [strategyPreparedBy, setStrategyPreparedBy] = useState(
    DEFAULT_STATE.strategyPreparedBy,
  );
  const [detailedConversation, setDetailedConversation] = useState(
    DEFAULT_STATE.detailedConversation,
  );
  const [reasonForDealLoss, setReasonForDealLoss] = useState(
    DEFAULT_STATE.reasonForDealLoss,
  );
  const [remarksFeedback, setRemarksFeedback] = useState(
    DEFAULT_STATE.remarksFeedback,
  );
  const [feedbackBy, setFeedbackBy] = useState(DEFAULT_STATE.feedbackBy);
  const [loading, setLoading] = useState(false);

  // ---- Lead search modal state ----
  const [showSearchModal, setShowSearchModal] = useState(true);
  const [searchMobile, setSearchMobile] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [existingLead, setExistingLead] = useState(null);
  const [leadChecked, setLeadChecked] = useState(false);
  const [leadExists, setLeadExists] = useState(false);

  useEffect(() => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    setTime(`${hours}:${minutes}`);
  }, []);

  const resetAllFields = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");

    setDate(DEFAULT_STATE.date);
    setTime(`${hours}:${minutes}`);
    setFromDate(DEFAULT_STATE.fromDate);
    setToDate(DEFAULT_STATE.toDate);
    setLastContactedDate(DEFAULT_STATE.lastContactedDate);
    setNextFollowUpDate(DEFAULT_STATE.nextFollowUpDate);
    setCustomerName(DEFAULT_STATE.customerName);
    setMobileNumber(DEFAULT_STATE.mobileNumber);
    setVehicleType(DEFAULT_STATE.vehicleType);
    setVehicleName(DEFAULT_STATE.vehicleName);
    setResidents(DEFAULT_STATE.residents);
    setWhatsappSent(DEFAULT_STATE.whatsappSent);
    setPriority(DEFAULT_STATE.priority);
    setMissedCalls(DEFAULT_STATE.missedCalls);
    setCabService(DEFAULT_STATE.cabService);
    setStatus(DEFAULT_STATE.status);
    setSummary(DEFAULT_STATE.summary);
    setNextActionItem(DEFAULT_STATE.nextActionItem);
    setMondayLead(DEFAULT_STATE.mondayLead);
    setLongBookingLead(DEFAULT_STATE.longBookingLead);
    setStrategyForClosing(DEFAULT_STATE.strategyForClosing);
    setStrategyPreparedBy(DEFAULT_STATE.strategyPreparedBy);
    setDetailedConversation(DEFAULT_STATE.detailedConversation);
    setReasonForDealLoss(DEFAULT_STATE.reasonForDealLoss);
    setRemarksFeedback(DEFAULT_STATE.remarksFeedback);
    setFeedbackBy(DEFAULT_STATE.feedbackBy);

    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });
  };

  const openDatePicker = (field, currentValue) => {
    Keyboard.dismiss(); // dismiss keyboard before showing date picker
    setActiveDateField(field);
    if (currentValue) {
      const parsedDate = new Date(currentValue);
      setSelectedDateObject(
        isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
      );
    } else {
      setSelectedDateObject(new Date());
    }
    setShowDatePicker(true);
  };

  const onDateChange = (event, dateValue) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event.type === "dismissed") return;
    }

    if (dateValue) {
      setSelectedDateObject(dateValue);
      const year = dateValue.getFullYear();
      const month = String(dateValue.getMonth() + 1).padStart(2, "0");
      const day = String(dateValue.getDate()).padStart(2, "0");
      const formattedDate = `${year}-${month}-${day}`;

      switch (activeDateField) {
        case "date":
          setDate(formattedDate);
          break;
        case "fromDate":
          setFromDate(formattedDate);
          break;
        case "toDate":
          setToDate(formattedDate);
          break;
        case "lastContactedDate":
          setLastContactedDate(formattedDate);
          break;
        case "nextFollowUpDate":
          setNextFollowUpDate(formattedDate);
          break;
        default:
          break;
      }
    }
  };

  // ---- Lead search handlers ----
  const handleSearchLead = async () => {
    if (searchMobile.length !== 10) {
      Alert.alert("Please enter a valid mobile number.");
      return;
    }

    try {
      setSearchLoading(true);

      setLeadChecked(false);
      setLeadExists(false);
      setExistingLead(null);

      const res = await api.get(`/leads/check/${searchMobile}`);

      setLeadChecked(true);

      if (res.data.exists) {
        setLeadExists(true);
        setExistingLead(res.data.lead);
      } else {
        setLeadExists(false);
      }
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Unable to search.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleContinueCreate = () => {
    setMobileNumber(searchMobile);
    setShowSearchModal(false);
  };

  const handleViewLead = () => {
    router.push({
      pathname: "./LeadDetailsScreen",
      params: {
        id: existingLead._id,
      },
    });
  };

  const handleCreateLead = async () => {
    if (!customerName.trim()) {
      Alert.alert("Required Field Missing", "Please provide a customer name.");
      return;
    }
    if (!mobileNumber.trim()) {
      Alert.alert("Required Field Missing", "Please provide a mobile number.");
      return;
    }

    const payload = {
      leadDate: date || undefined,
      leadTime: time,
      customerName: customerName.trim(),
      mobileNumber: mobileNumber.trim(),
      vehicleType,
      vehicleName: vehicleName.trim(),
      fromDate: fromDate || null,
      toDate: toDate || null,
      residents: Number(residents) || 1,
      whatsappSent,
      priority,
      missedCalls: Number(missedCalls) || 0,
      cabService,
      status: status || undefined,
      conversationSummary: summary.trim(),
      detailedConversation: detailedConversation.trim(),
      lastContactedDate: lastContactedDate || null,
      nextFollowupDate: nextFollowUpDate || null,
      nextActionItem: nextActionItem.trim(),
      mondayLead,
      longBookingLead,
      strategyForClosing: strategyForClosing.trim(),
      strategyPreparedBy: strategyPreparedBy.trim(),
      remarksFeedback: remarksFeedback.trim(),
      feedbackBy: feedbackBy.trim(),
    };

    try {
      setLoading(true);
      const res = await api.post("/leads", payload);

      const successMessage =
        res?.data?.message || res?.data?.msg || "Lead created successfully.";

      resetAllFields();

      Alert.alert("Success ✅", successMessage, [
        { text: "Add Another", style: "cancel" },
        {
          text: "Go Back",
          onPress: () => {
            try {
              navigation.goBack();
            } catch (navErr) {
              console.warn("Navigation error:", navErr);
            }
          },
        },
      ]);
    } catch (err) {
      console.log("Lead creation error — status:", err?.response?.status);
      console.log(
        "Lead creation error — data:",
        JSON.stringify(err?.response?.data, null, 2),
      );
      console.log("Lead creation error — message:", err?.message);

      const errorMessage =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.response?.data?.msg ||
        err?.message ||
        "Something went wrong. Please try again.";

      Alert.alert("Error ❌", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Lead search / lookup modal */}
      <Modal visible={showSearchModal} animationType="fade" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: 22,
          }}
        >
          <View
            style={{
              backgroundColor: "#FFF",
              borderRadius: 18,
              padding: 22,
            }}
          >
            <Text
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: "#111827",
              }}
            >
              Search Lead
            </Text>

            <Text
              style={{
                marginTop: 6,
                color: "#64748B",
                lineHeight: 20,
              }}
            >
              Enter customer's mobile number to check if a lead already exists.
            </Text>

            <TextInput
              style={{
                borderWidth: 1,
                borderColor: "#CBD5E1",
                borderRadius: 12,
                marginTop: 20,
                height: 50,
                paddingHorizontal: 15,
                fontSize: 16,
              }}
              placeholder="ENTER NUMBER"
              keyboardType="phone-pad"
              maxLength={10}
              value={searchMobile}
              onChangeText={(text) => {
                setSearchMobile(text);
                setExistingLead(null);
                setLeadChecked(false);
                setLeadExists(false);
              }}
            />

            <TouchableOpacity
              style={{
                backgroundColor: "#2563EB",
                height: 48,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
                marginTop: 18,
              }}
              onPress={handleSearchLead}
              disabled={searchLoading}
            >
              {searchLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text
                  style={{
                    color: "#FFF",
                    fontWeight: "700",
                  }}
                >
                  Search Lead
                </Text>
              )}
            </TouchableOpacity>

            {existingLead && (
              <View
                style={{
                  marginTop: 24,
                  backgroundColor: "#F8FAFC",
                  padding: 16,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                }}
              >
                <Text
                  style={{
                    fontWeight: "700",
                    fontSize: 18,
                  }}
                >
                  Lead Found ✅
                </Text>

                <View style={{ marginTop: 15 }}>
                  <Text style={{ fontWeight: "700" }}>
                    👤 {existingLead.customerName}
                  </Text>

                  <Text style={{ marginTop: 5 }}>🆔 {existingLead.leadId}</Text>

                  <Text style={{ marginTop: 5 }}>
                    📱 {existingLead.mobileNumber}
                  </Text>

                  <Text style={{ marginTop: 5 }}>📌 {existingLead.status}</Text>
                </View>

                <TouchableOpacity
                  onPress={handleViewLead}
                  style={{
                    backgroundColor: "#16A34A",
                    marginTop: 18,
                    height: 46,
                    borderRadius: 10,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#FFF",
                      fontWeight: "700",
                    }}
                  >
                    View Lead
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setExistingLead(null);
                    setSearchMobile("");
                    setLeadChecked(false);
                    setLeadExists(false);
                  }}
                  style={{
                    marginTop: 10,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#EF4444",
                      fontWeight: "600",
                    }}
                  >
                    Back
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {leadChecked && !leadExists && (
              <View
                style={{
                  marginTop: 24,
                  backgroundColor: "#FEFCE8",
                  borderWidth: 1,
                  borderColor: "#FACC15",
                  borderRadius: 14,
                  padding: 18,
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={40}
                  color="#CA8A04"
                />

                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    marginTop: 12,
                  }}
                >
                  Lead Not Found
                </Text>

                <Text
                  style={{
                    marginTop: 8,
                    color: "#64748B",
                    textAlign: "center",
                  }}
                >
                  No lead exists with this mobile number.
                </Text>
              </View>
            )}

            {leadChecked && !leadExists && !searchLoading && (
              <TouchableOpacity
                onPress={handleContinueCreate}
                style={{
                  marginTop: 18,
                  backgroundColor: "#F59E0B",
                  height: 48,
                  borderRadius: 12,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: "#FFF",
                    fontWeight: "700",
                  }}
                >
                  Create New Lead
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* FIX 1: KeyboardAvoidingView uses "padding" on both platforms.
          "height" on Android shrinks the entire view which breaks ScrollView. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Create New Lead</Text>
          <Text style={styles.headerSubtitle}>
            Enter exhaustive lead intelligence indicators and logistics profile
          </Text>
        </View>

        {/* FIX 2: TouchableWithoutFeedback must wrap the ScrollView so tapping
            any non-input area dismisses the keyboard. Previously it wrapped
            nothing (empty children), so it had zero effect. */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            // FIX 3: Removed keyboardDismissMode="on-drag" — it conflicts with
            // keyboardShouldPersistTaps="handled" and closes keyboard on chip/toggle taps.
            // FIX 4: Removed automaticallyAdjustKeyboardInsets — redundant with
            // KeyboardAvoidingView and causes double offset on iOS.
          >
            {/* Primary Client Info */}
            <Text style={styles.sectionTitle}>Primary Client Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Customer Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="John Doe"
                placeholderTextColor="#94A3B8"
                value={customerName}
                onChangeText={setCustomerName}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Mobile Number *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="+91 98765 43210"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={mobileNumber}
                onChangeText={setMobileNumber}
              />
            </View>

            {/* Log Metadata */}
            <Text style={styles.sectionTitle}>Log Metadata & Ownership</Text>

            <View style={styles.rowLayout}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Date</Text>
                <TouchableOpacity
                  style={[styles.textInput, styles.datePickerButton]}
                  onPress={() => openDatePicker("date", date)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: date ? "#0F172A" : "#94A3B8",
                      fontSize: 14,
                    }}
                  >
                    {date || "YYYY-MM-DD"}
                  </Text>
                  <Ionicons name="calendar-outline" size={16} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>Time</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="HH:MM"
                  placeholderTextColor="#94A3B8"
                  value={time}
                  onChangeText={setTime}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>

            {/* Universal Date Picker */}
            {showDatePicker && (
              <>
                {Platform.OS === "ios" && (
                  <View style={styles.iosPickerDoneContainer}>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.iosDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <DateTimePicker
                  value={selectedDateObject}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onValueChange={onDateChange}
                  onDismiss={() => onDateChange({type: "dismissed"})}
                />
              </>
            )}

            <View style={styles.rowLayout}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Missed Calls Counter</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={missedCalls}
                  onChangeText={setMissedCalls}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]} />
            </View>

            {/* Lead Status */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Lead Status</Text>
              <View style={styles.optionGrid}>
                {STATUS_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.optionChip,
                      status === option && styles.activeOptionChip,
                    ]}
                    onPress={() =>
                      setStatus((prev) => (prev === option ? "" : option))
                    }
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        status === option && styles.activeOptionChipText,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Logistics & Vehicles */}
            <Text style={styles.sectionTitle}>Logistics & Allocation</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Vehicle Allocation Type</Text>
              <View style={styles.segmentedContainer}>
                {["car", "bike"].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.segmentButton,
                      vehicleType === type && styles.activeSegmentButton,
                    ]}
                    onPress={() => setVehicleType(type)}
                  >
                    <Ionicons
                      name={
                        type === "car" ? "car-sport-outline" : "bicycle-outline"
                      }
                      size={18}
                      color={vehicleType === type ? "#FFF" : "#64748B"}
                    />
                    <Text
                      style={[
                        styles.segmentButtonText,
                        vehicleType === type && styles.activeSegmentText,
                      ]}
                    >
                      {type.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>
                Specific Car/Bike Model Name
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Hyundai i20 / Activa 6G"
                placeholderTextColor="#94A3B8"
                value={vehicleName}
                onChangeText={setVehicleName}
              />
            </View>

            <View style={styles.rowLayout}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>From Date</Text>
                <TouchableOpacity
                  style={[styles.textInput, styles.datePickerButton]}
                  onPress={() => openDatePicker("fromDate", fromDate)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: fromDate ? "#0F172A" : "#94A3B8",
                      fontSize: 14,
                    }}
                  >
                    {fromDate || "YYYY-MM-DD"}
                  </Text>
                  <Ionicons name="calendar-outline" size={16} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>To Date</Text>
                <TouchableOpacity
                  style={[styles.textInput, styles.datePickerButton]}
                  onPress={() => openDatePicker("toDate", toDate)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: toDate ? "#0F172A" : "#94A3B8",
                      fontSize: 14,
                    }}
                  >
                    {toDate || "YYYY-MM-DD"}
                  </Text>
                  <Ionicons name="calendar-outline" size={16} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>
                Number of Residents / Occupants
              </Text>
              <View style={styles.counterRow}>
                <TouchableOpacity
                  style={styles.counterAction}
                  onPress={() => setResidents((prev) => Math.max(1, prev - 1))}
                >
                  <Ionicons name="remove" size={20} color="#1E293B" />
                </TouchableOpacity>
                <Text style={styles.counterValue}>{residents}</Text>
                <TouchableOpacity
                  style={styles.counterAction}
                  onPress={() => setResidents((prev) => prev + 1)}
                >
                  <Ionicons name="add" size={20} color="#1E293B" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Toggles & Priority */}
            <Text style={styles.sectionTitle}>Toggles & Priority Metrics</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Priority Ranking Tier</Text>
              <View style={styles.priorityGrid}>
                {["low", "medium", "high"].map((tier) => (
                  <TouchableOpacity
                    key={tier}
                    style={[
                      styles.priorityBox,
                      priority === tier && {
                        backgroundColor: PRIORITY_COLORS[tier].bg,
                        borderColor: PRIORITY_COLORS[tier].border,
                      },
                    ]}
                    onPress={() => setPriority(tier)}
                  >
                    <Text
                      style={[
                        styles.priorityText,
                        priority === tier && { color: "#FFF" },
                      ]}
                    >
                      {tier.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.toggleCard}>
              <View style={styles.toggleCardText}>
                <Text style={styles.toggleCardTitle}>
                  WhatsApp Message Sent
                </Text>
                <Text style={styles.toggleCardSubtitle}>
                  Confirmation communication broadcast status
                </Text>
              </View>
              <Switch
                trackColor={{ false: "#CBD5E1", true: "#BFDBFE" }}
                thumbColor={whatsappSent ? "#3B82F6" : "#94A3B8"}
                value={whatsappSent}
                onValueChange={setWhatsappSent}
              />
            </View>

            <View style={styles.toggleCard}>
              <View style={styles.toggleCardText}>
                <Text style={styles.toggleCardTitle}>Optional Cab Service</Text>
                <Text style={styles.toggleCardSubtitle}>
                  Pickup/Drop transit requested
                </Text>
              </View>
              <Switch
                trackColor={{ false: "#CBD5E1", true: "#BFDBFE" }}
                thumbColor={cabService ? "#3B82F6" : "#94A3B8"}
                value={cabService}
                onValueChange={setCabService}
              />
            </View>

            <View style={styles.toggleCard}>
              <View style={styles.toggleCardText}>
                <Text style={styles.toggleCardTitle}>Monday Lead Flag</Text>
                <Text style={styles.toggleCardSubtitle}>
                  Designate weekend pipeline follow-up schedule
                </Text>
              </View>
              <Switch
                trackColor={{ false: "#CBD5E1", true: "#BFDBFE" }}
                thumbColor={mondayLead ? "#3B82F6" : "#94A3B8"}
                value={mondayLead}
                onValueChange={setMondayLead}
              />
            </View>

            <View style={styles.toggleCard}>
              <View style={styles.toggleCardText}>
                <Text style={styles.toggleCardTitle}>Long Booking Lead</Text>
                <Text style={styles.toggleCardSubtitle}>
                  Extended contract projection mapping
                </Text>
              </View>
              <Switch
                trackColor={{ false: "#CBD5E1", true: "#BFDBFE" }}
                thumbColor={longBookingLead ? "#3B82F6" : "#94A3B8"}
                value={longBookingLead}
                onValueChange={setLongBookingLead}
              />
            </View>

            {/* Pipeline Strategy */}
            <Text style={styles.sectionTitle}>
              Pipeline Strategy & Scheduling
            </Text>

            <View style={styles.rowLayout}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Last Contacted Date</Text>
                <TouchableOpacity
                  style={[styles.textInput, styles.datePickerButton]}
                  onPress={() =>
                    openDatePicker("lastContactedDate", lastContactedDate)
                  }
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: lastContactedDate ? "#0F172A" : "#94A3B8",
                      fontSize: 14,
                    }}
                  >
                    {lastContactedDate || "YYYY-MM-DD"}
                  </Text>
                  <Ionicons name="calendar-outline" size={16} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>Next Follow Up Date</Text>
                <TouchableOpacity
                  style={[styles.textInput, styles.datePickerButton]}
                  onPress={() =>
                    openDatePicker("nextFollowUpDate", nextFollowUpDate)
                  }
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: nextFollowUpDate ? "#0F172A" : "#94A3B8",
                      fontSize: 14,
                    }}
                  >
                    {nextFollowUpDate || "YYYY-MM-DD"}
                  </Text>
                  <Ionicons name="calendar-outline" size={16} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Next Action Item</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Call at 4 PM, send quote"
                placeholderTextColor="#94A3B8"
                value={nextActionItem}
                onChangeText={setNextActionItem}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Strategy Prepared By</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Strategist name / Manager name"
                placeholderTextColor="#94A3B8"
                value={strategyPreparedBy}
                onChangeText={setStrategyPreparedBy}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Strategy for Closing Lead</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="Outline step-by-step specific conversion strategy hooks..."
                placeholderTextColor="#94A3B8"
                multiline={true}
                numberOfLines={3}
                value={strategyForClosing}
                onChangeText={setStrategyForClosing}
                textAlignVertical="top"
              />
            </View>

            {/* Conversational Intelligence */}
            <Text style={styles.sectionTitle}>
              Conversational Intelligence Notes
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Summary</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="Brief high level evaluation overview..."
                placeholderTextColor="#94A3B8"
                multiline={true}
                numberOfLines={3}
                value={summary}
                onChangeText={setSummary}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Detailed Conversation Log</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="Transcripts or structural dialogue summaries logged here..."
                placeholderTextColor="#94A3B8"
                multiline={true}
                numberOfLines={4}
                value={detailedConversation}
                onChangeText={setDetailedConversation}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Reason for Deal Loss</Text>
              <View style={styles.optionGrid}>
                {DEAL_LOSS_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.optionChip,
                      reasonForDealLoss === option && styles.activeOptionChip,
                    ]}
                    onPress={() =>
                      setReasonForDealLoss((prev) =>
                        prev === option ? "" : option,
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        reasonForDealLoss === option &&
                          styles.activeOptionChipText,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Remarks / Feedback</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="General assessment annotations..."
                placeholderTextColor="#94A3B8"
                multiline={true}
                numberOfLines={3}
                value={remarksFeedback}
                onChangeText={setRemarksFeedback}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Feedback By</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Evaluator's name"
                placeholderTextColor="#94A3B8"
                value={feedbackBy}
                onChangeText={setFeedbackBy}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                loading && styles.submitButtonDisabled,
              ]}
              activeOpacity={0.85}
              onPress={handleCreateLead}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? "Creating Lead..." : "Create Lead"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    marginTop: 20,
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFF",
  },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "#0F172A" },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 16,
  },
  scrollContainer: { paddingHorizontal: 24, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1E3A8A",
    textTransform: "uppercase",
    marginTop: 28,
    marginBottom: 14,
    letterSpacing: 0.8,
  },
  inputGroup: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 14,
    fontSize: 14,
    color: "#0F172A",
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iosPickerDoneContainer: {
    backgroundColor: "#F1F5F9",
    padding: 10,
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
  },
  iosDoneText: { color: "#3B82F6", fontWeight: "600", fontSize: 16 },
  textAreaInput: { height: 90, paddingVertical: 12 },
  segmentedContainer: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    padding: 4,
    borderRadius: 10,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    height: 38,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  activeSegmentButton: { backgroundColor: "#3B82F6" },
  segmentButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    marginLeft: 6,
  },
  activeSegmentText: { color: "#FFF" },
  rowLayout: { flexDirection: "row" },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    alignSelf: "flex-start",
    height: 44,
  },
  counterAction: {
    width: 44,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 9,
  },
  counterValue: {
    paddingHorizontal: 20,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  priorityGrid: { flexDirection: "row", justifyContent: "space-between" },
  priorityBox: {
    flex: 1,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginHorizontal: 2,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  priorityText: { fontSize: 11, fontWeight: "700", color: "#475569" },
  toggleCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginVertical: 6,
  },
  toggleCardText: { flex: 1, marginRight: 12 },
  toggleCardTitle: { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  toggleCardSubtitle: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  activeOptionChip: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  optionChipText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  activeOptionChipText: { color: "#FFF" },
  submitButton: {
    backgroundColor: "#10B981",
    height: 52,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 32,
    shadowColor: "#10B981",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
