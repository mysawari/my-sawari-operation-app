import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import useAuthStore from "../../../store/authStore";

const inspectionItems = [
  { id: 1, label: "Exterior Body", icon: "car-outline" },
  { id: 2, label: "Brakes", icon: "disc-outline" },
  { id: 3, label: "Interior Condition", icon: "car-seat" },
  { id: 4, label: "AC & Heater", icon: "snow-outline" },
  { id: 5, label: "Tyres Condition", icon: "ellipse-outline" },
  { id: 6, label: "Wipers", icon: "rainy-outline" },
  { id: 7, label: "Lights & Indicators", icon: "sunny-outline" },
  { id: 8, label: "Horn", icon: "volume-high-outline" },
  { id: 9, label: "Engine Condition", icon: "construct-outline" },
  { id: 10, label: "Windows & Mirrors", icon: "albums-outline" },
];

const ALL_CONDITIONS = ["good", "minor", "major"];
const ALL_LABELS = { good: "Good", minor: "Minor", major: "Major" };
const PAYMENT_MODES = ["Cash", "PhonePe", "Razorpay", "Mixed"];

// Simple numeric coercion helper used across the payment calculations
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Fisher-Yates shuffle seeded by item id + a session salt. Kept
// intentional: randomizing the Good/Minor/Major order per visit stops
// staff from rubber-stamping "Good" in the same screen position on every
// item without actually reading the label first.
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const formatCurrency = (n) => `₹ ${Number(n || 0).toLocaleString("en-IN")}`;

// UPI QR Popup Component
function UpiQrModal({ visible, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <MaterialCommunityIcons
              name="qrcode-scan"
              size={22}
              color="#1E3A8A"
            />
            <Text style={styles.modalTitle}>Scan to Pay via UPI</Text>
          </View>
          <Image
            source={require("../../../assets/images/upi-qr.jpeg")}
            style={styles.qrImage}
            resizeMode="contain"
          />
          <Text style={styles.upiIdText}>MySawari</Text>
          <Text style={styles.upiNote}>
            Ask customer to scan & confirm payment before proceeding
          </Text>
          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
            <Text style={styles.modalCloseBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Small reusable "label + value" cell used in the vehicle detail grid.
// `action` is an optional element (e.g. a copy button) rendered right
// next to the value.
function DetailCell({
  icon,
  label,
  value,
  valueStyle,
  align = "left",
  action = null,
}) {
  return (
    <View
      style={[
        styles.detailCell,
        align === "right" && { alignItems: "flex-end" },
      ]}
    >
      <View style={styles.detailCellLabelRow}>
        {icon ? <Ionicons name={icon} size={11} color="#94A3B8" /> : null}
        <Text style={styles.detailCellLabel}>{label}</Text>
      </View>
      <View
        style={[
          styles.detailCellValueRow,
          align === "right" && { justifyContent: "flex-end" },
        ]}
      >
        <Text
          style={[
            styles.detailCellValue,
            action ? { flexShrink: 1 } : null,
            valueStyle,
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
        {action}
      </View>
    </View>
  );
}

export default function ReceiveCarDetailScreen() {
  const router = useRouter();
  const { handoverId } = useLocalSearchParams();
  const { token } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [handoverData, setHandoverData] = useState(null);

  const [fuelLevel, setFuelLevel] = useState(0);
  const [kms, setKms] = useState("");
  const [damage, setDamage] = useState("no");
  const [damageNotes, setDamageNotes] = useState("");
  const [damageImages, setDamageImages] = useState([]);
  const [needsMaintenance, setNeedsMaintenance] = useState("no");
  const [maintenanceReason, setMaintenanceReason] = useState("");
  const [maintenanceDays, setMaintenanceDays] = useState("");

  const [repairEstimate, setRepairEstimate] = useState("");
  const [repairDays, setRepairDays] = useState("");
  const [amountCollected, setAmountCollected] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");

  // Single source of truth for UPI transaction references (array of
  // 4-digit strings).
  const [upiReferences, setUpiReferences] = useState([]);
  const [upiInput, setUpiInput] = useState("");
  const [showUpiModal, setShowUpiModal] = useState(false);

  // Mixed-payment breakdown fields
  const [cashAmount, setCashAmount] = useState("");
  const [phonePeAmount, setPhonePeAmount] = useState("");
  const [razorpayAmount, setRazorpayAmount] = useState("");

  const [pendingAmount, setPendingAmount] = useState(0);

  const [lateReturnFine, setLateReturnFine] = useState("");
  const [extraKmFine, setExtraKmFine] = useState("");
  const [fuelUsageAmount, setFuelUsageAmount] = useState("");
  const [balanceReason, setBalanceReason] = useState("");

  // Copy-phone feedback (icon flips to a checkmark for 1.5s)
  const [phoneCopied, setPhoneCopied] = useState(false);
  const copyTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  // No pre-filled checks or notes — exec must select manually
  const [checks, setChecks] = useState({
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
    6: null,
    7: null,
    8: null,
    9: null,
    10: null,
  });
  const [itemNotes, setItemNotes] = useState({});

  // Generate a random session salt once per screen mount so button order
  // is different every time the screen becomes visible
  const sessionSalt = useMemo(() => Math.floor(Math.random() * 0xffffff), []);

  const formatDate = (date) => {
    if (!date) return "-";
    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const formattedTime = dateObj.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${formattedDate}, ${formattedTime}`;
  };

  // Pre-compute a stable (for this session) shuffled order per item
  const shuffledOrders = useMemo(() => {
    const orders = {};
    inspectionItems.forEach((item) => {
      orders[item.id] = seededShuffle(
        ALL_CONDITIONS,
        item.id * 997 + sessionSalt,
      );
    });
    return orders;
  }, [sessionSalt]);

  useEffect(() => {
    if (handoverId && token) {
      fetchHandoverDetails();
    }
  }, [handoverId, token]);

  const fetchHandoverDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/handover/single/${handoverId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data.data;
      setHandoverData(data);
      setPendingAmount(Number(data?.payment?.billSummary?.balanceAmount) || 0);
    } catch (error) {
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to load details",
      );
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const setCondition = (id, value) => {
    setChecks((prev) => ({ ...prev, [id]: value }));
  };

  const handleItemNoteChange = (id, text) => {
    setItemNotes((prev) => ({ ...prev, [id]: text }));
  };

  const completedCount = inspectionItems.filter(
    (item) => checks[item.id],
  ).length;

  const handlePaymentModeSelect = (mode) => {
    setPaymentMode(mode);
    if (mode !== "PhonePe" && mode !== "Mixed") {
      setUpiReferences([]);
      setUpiInput("");
    }
  };

  const addUpiReference = () => {
    const value = upiInput.trim();

    if (!/^\d{4}$/.test(value)) {
      Alert.alert("Validation", "Please enter exactly 4 digits");
      return;
    }
    if (upiReferences.includes(value)) {
      Alert.alert("Validation", "This UPI reference is already added");
      return;
    }

    setUpiReferences((prev) => [...prev, value]);
    setUpiInput("");
  };

  const removeUpiReference = (index) => {
    setUpiReferences((prev) => prev.filter((_, i) => i !== index));
  };

  const triggerCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Camera access required");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      allowsEditing: true,
    });
    if (!result.canceled) {
      setDamageImages((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const removeImage = (index) => {
    setDamageImages((prev) => prev.filter((_, i) => i !== index));
  };

  const damageAmount = parseFloat(repairEstimate) || 0;
  const lateFine = parseFloat(lateReturnFine) || 0;
  const kmFine = parseFloat(extraKmFine) || 0;
  const fuelFine = parseFloat(fuelUsageAmount) || 0;

  const totalBalance =
    pendingAmount + lateFine + kmFine + fuelFine + damageAmount;
  const totalCost = totalBalance;

  const receivedAmount =
    paymentMode === "Mixed"
      ? toNum(cashAmount) + toNum(phonePeAmount) + toNum(razorpayAmount)
      : toNum(amountCollected);

  const collected = receivedAmount;
  const paymentBreakdown =
    paymentMode === "Mixed"
      ? {
          cash: toNum(cashAmount),
          phonePe: toNum(phonePeAmount),
          razorpay: toNum(razorpayAmount),
        }
      : {
          cash: paymentMode === "Cash" ? toNum(amountCollected) : 0,
          phonePe: paymentMode === "PhonePe" ? toNum(amountCollected) : 0,
          razorpay: paymentMode === "Razorpay" ? toNum(amountCollected) : 0,
        };

  const finalBalance = Math.max(totalBalance - collected, 0);

  let settlementStatus = "Pending Collection";
  if (totalBalance === 0 || collected >= totalBalance) {
    settlementStatus = "Collected";
  } else if (collected > 0) {
    settlementStatus = "Partially Collected";
  }

  const operationalStatus =
    collected >= damageAmount ? "Collected" : "Partially Collected";

  const needsUpiReference =
    paymentMode === "PhonePe" ||
    (paymentMode === "Mixed" && toNum(phonePeAmount) > 0);

  const settlementColor =
    settlementStatus === "Collected"
      ? "#16A34A"
      : settlementStatus === "Partially Collected"
        ? "#F59E0B"
        : "#DC2626";

  const handleNext = () => {
    if (!kms.trim()) {
      Alert.alert("Validation", "Please enter kilometers at return");
      return;
    }

    if (!paymentMode) {
      Alert.alert("Validation", "Please select payment method");
      return;
    }

    if (needsUpiReference && upiReferences.length === 0) {
      Alert.alert(
        "Validation",
        "Please add at least one UPI transaction reference",
      );
      return;
    }

    if (paymentMode === "Mixed") {
      const mixedTotal =
        toNum(cashAmount) + toNum(phonePeAmount) + toNum(razorpayAmount);

      if (mixedTotal <= 0) {
        Alert.alert("Validation", "Please enter payment amounts");
        return;
      }
      if (mixedTotal > totalBalance) {
        Alert.alert(
          "Validation",
          "Received amount cannot exceed total balance",
        );
        return;
      }
    } else if (toNum(amountCollected) > totalBalance) {
      Alert.alert("Validation", "Received amount cannot exceed total balance");
      return;
    }

    if (finalBalance > 0 && !balanceReason.trim()) {
      Alert.alert(
        "Validation",
        "Reason is required when full amount is not collected",
      );
      return;
    }

    const incompleteItems = inspectionItems.filter((item) => !checks[item.id]);
    if (incompleteItems.length > 0) {
      Alert.alert(
        "Validation",
        `Please complete all inspection items (${incompleteItems.length} remaining)`,
      );
      return;
    }

    if (damage === "yes") {
      if (!damageNotes.trim()) {
        Alert.alert("Validation", "Please enter damage description");
        return;
      }
      if (damageImages.length === 0) {
        Alert.alert("Validation", "Please capture at least one damage image");
        return;
      }
      if (!repairEstimate) {
        Alert.alert("Validation", "Please enter repair estimate");
        return;
      }
      if (!repairDays) {
        Alert.alert("Validation", "Please enter repair duration");
        return;
      }
      if (needsMaintenance === "yes" && !maintenanceReason.trim()) {
        Alert.alert("Validation", "Please enter maintenance reason");
        return;
      }
      if (needsMaintenance === "yes" && !maintenanceDays) {
        Alert.alert("Validation", "Please enter estimated repair days");
        return;
      }
    }

    const inspectionPayload = inspectionItems.map((item) => ({
      itemName: item.label,
      condition: checks[item.id],
      note: itemNotes[item.id] || "",
    }));

    router.push({
      pathname: "/components/receiveCar/image",
      params: {
        handoverId,
        fuelLevel,
        kilometersAtReturn: kms,
        hasDamage: damage,
        damageNotes,
        damageImages: JSON.stringify(damageImages),
        repairEstimate,
        repairDays,
        lateReturnFine,
        extraKmFine,
        fuelUsageAmount,
        amountCollected: String(receivedAmount),
        paymentMode,
        paymentBreakdown: JSON.stringify(paymentBreakdown),
        upiLast4: JSON.stringify(upiReferences),
        balanceReason,
        needsMaintenance,
        maintenanceReason,
        maintenanceDays,
        inspection: JSON.stringify(inspectionPayload),
      },
    });
  };

  const renderConditionButton = (id, type) => {
    const label = ALL_LABELS[type];
    const active = checks[id] === type;
    let bg = "#fff";
    let border = "#E2E8F0";
    let text = "#64748B";

    if (active && type === "good") {
      bg = "#DCFCE7";
      border = "#22C55E";
      text = "#16A34A";
    }
    if (active && type === "minor") {
      bg = "#FEF3C7";
      border = "#F59E0B";
      text = "#D97706";
    }
    if (active && type === "major") {
      bg = "#FEE2E2";
      border = "#EF4444";
      text = "#DC2626";
    }

    return (
      <TouchableOpacity
        key={type}
        style={[
          styles.conditionBtn,
          { backgroundColor: bg, borderColor: border },
        ]}
        onPress={() => setCondition(id, type)}
        activeOpacity={0.7}
      >
        {active && (
          <Ionicons
            name="checkmark-circle"
            size={13}
            color={text}
            style={{ marginRight: 3 }}
          />
        )}
        <Text style={[styles.conditionText, { color: text }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const vehicle = handoverData?.vehicle?.vehicleId || handoverData?.vehicle;
  const customer = handoverData?.customer;
  const trip = handoverData?.trip;
  const payment = handoverData?.payment;
  const dueDate = trip?.dropDateTime ? new Date(trip.dropDateTime) : null;
  const pickupDate = trip?.pickupDateTime
    ? new Date(trip.pickupDateTime)
    : null;

  const customerPhone = customer?.mobileNumber || "";
  const hasCustomerPhone = !!customerPhone && customerPhone !== "-";

  const handleCopyPhone = async () => {
    if (!hasCustomerPhone) {
      Alert.alert(
        "No Phone Number",
        "No contact details available for this customer.",
      );
      return;
    }
    try {
      await Clipboard.setStringAsync(String(customerPhone));
      setPhoneCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setPhoneCopied(false), 1500);
    } catch {
      Alert.alert("Error", "Unable to copy the number.");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.loaderContainer]}>
        <ActivityIndicator size="large" color="#0A1F4F" />
        <Text style={styles.loaderText}>Loading details...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <StatusBar backgroundColor="#0A1F4F" barStyle="light-content" />

        <UpiQrModal
          visible={showUpiModal}
          onClose={() => setShowUpiModal(false)}
        />

        {/* Header */}
        <LinearGradient colors={["#08142E", "#0A1F4F"]} style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backTouch}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Vehicle Received</Text>
          <View style={{ width: 26 }} />
        </LinearGradient>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Vehicle + Trip Details Card — no thumbnail image; instead a
              compact, scannable detail grid so more real information
              (plate, spec, customer, dates, balance) is visible at once
              without an oversized photo pushing it below the fold. */}
          <View style={styles.vehicleCard}>
            <View style={styles.vehicleCardTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.carName} numberOfLines={1}>
                  {vehicle?.vehicleName || "Unknown Vehicle"}
                </Text>
                <View style={styles.plateRow}>
                  <View style={styles.plateBadge}>
                    <Text style={styles.plateText}>
                      {vehicle?.vehicleNumber || "-"}
                    </Text>
                  </View>
                  <Text style={styles.specInline}>
                    {vehicle?.fuelType || "N/A"} ·{" "}
                    {vehicle?.transmission || "N/A"} ·{" "}
                    {vehicle?.seatingCapacity || "-"} Seater
                  </Text>
                </View>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>
                  {vehicle?.status === "rent"
                    ? "On Rent"
                    : vehicle?.status || "N/A"}
                </Text>
              </View>
            </View>

            <View style={styles.detailGrid}>
              <DetailCell
                icon="person-outline"
                label="Customer"
                value={customer?.fullName || "-"}
              />
              <DetailCell
                icon="call-outline"
                label="Mobile"
                value={customer?.mobileNumber || "-"}
                align="right"
                action={
                  hasCustomerPhone ? (
                    <TouchableOpacity
                      style={[
                        styles.copyIconButton,
                        phoneCopied && styles.copyIconButtonDone,
                      ]}
                      onPress={handleCopyPhone}
                      hitSlop={6}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Copy customer phone number"
                    >
                      <Ionicons
                        name={phoneCopied ? "checkmark" : "copy-outline"}
                        size={13}
                        color={phoneCopied ? "#FFFFFF" : "#2563EB"}
                      />
                    </TouchableOpacity>
                  ) : null
                }
              />
              <DetailCell
                icon="calendar-outline"
                label="Pickup Date & Time"
                value={pickupDate ? formatDate(pickupDate) : "-"}
              />
              <DetailCell
                icon="alarm-outline"
                label="Return Due"
                value={dueDate ? formatDate(dueDate) : "-"}
                valueStyle={styles.redText}
                align="right"
              />
            </View>

            <View style={styles.balanceStrip}>
              <Text style={styles.balanceStripLabel}>Balance Amount</Text>
              <Text style={styles.balanceStripValue}>
                {formatCurrency(payment?.billSummary?.balanceAmount || 0)}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.viewButton}
              onPress={() =>
                router.push({
                  pathname: "/components/receiveCar/viewHandover",
                  params: { handoverId },
                })
              }
            >
              <Ionicons
                name="document-text-outline"
                size={15}
                color="#2563EB"
              />
              <Text style={styles.viewButtonText}>
                View full handover details
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#2563EB" />
            </TouchableOpacity>
          </View>

          {/* Vehicle Condition Check */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <MaterialCommunityIcons
                  name="clipboard-check-outline"
                  size={20}
                  color="#0F172A"
                />
                <Text style={styles.sectionTitle}>Vehicle Condition Check</Text>
              </View>
              <View
                style={[
                  styles.progressPill,
                  completedCount === inspectionItems.length &&
                    styles.progressPillDone,
                ]}
              >
                <Text
                  style={[
                    styles.progressPillText,
                    completedCount === inspectionItems.length &&
                      styles.progressPillTextDone,
                  ]}
                >
                  {completedCount}/{inspectionItems.length}
                </Text>
              </View>
            </View>

            <View style={styles.gridContainer}>
              {inspectionItems.map((item) => {
                const needsNote =
                  checks[item.id] === "minor" || checks[item.id] === "major";
                const orderedTypes = shuffledOrders[item.id];

                return (
                  <View key={item.id} style={styles.inspectWrapperBlock}>
                    <View style={styles.inspectRowWrapper}>
                      <View style={styles.inspectTitleColumn}>
                        <Ionicons
                          name={item.icon}
                          size={16}
                          color="#475569"
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.inspectTitle} numberOfLines={1}>
                          {item.label}
                        </Text>
                      </View>
                      <View style={styles.conditionActionGroup}>
                        {orderedTypes.map((type) =>
                          renderConditionButton(item.id, type),
                        )}
                      </View>
                    </View>
                    {needsNote && (
                      <View style={styles.inlineNoteContainer}>
                        <TextInput
                          placeholder={`Describe ${checks[item.id]} issue...`}
                          placeholderTextColor="#94A3B8"
                          style={styles.inlineNoteInput}
                          value={itemNotes[item.id] || ""}
                          onChangeText={(text) =>
                            handleItemNoteChange(item.id, text)
                          }
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Fuel + KM + Damage Section */}
          <View style={styles.section}>
            <View style={styles.formRowFields}>
              {/* Fuel Level */}
              <View style={styles.fuelContainerForm}>
                <Text style={styles.fieldLabel}>
                  <MaterialCommunityIcons name="gas-station" size={15} /> Fuel
                  Level
                </Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={fuelLevel}
                    onValueChange={(value) => setFuelLevel(Number(value))}
                    style={styles.picker}
                  >
                    <Picker.Item label="Reserve (light on)" value={0} />
                    <Picker.Item label="1 Stick" value={1} />
                    <Picker.Item label="2 Sticks" value={2} />
                    <Picker.Item label="3 Sticks" value={3} />
                    <Picker.Item label="4 Sticks" value={4} />
                    <Picker.Item label="5 Sticks" value={5} />
                    <Picker.Item label="6 Sticks" value={6} />
                    <Picker.Item label="Full Tank" value={7} />
                  </Picker>
                </View>
              </View>

              {/* KM */}
              <View style={styles.kmContainerForm}>
                <Text style={styles.fieldLabel}>
                  Kilometers at Return{" "}
                  <Text style={{ color: "#DC2626" }}>*</Text>
                </Text>
                <View style={styles.inputBox}>
                  <MaterialCommunityIcons
                    name="speedometer"
                    size={18}
                    color="#94A3B8"
                    style={{ marginRight: 6 }}
                  />
                  <TextInput
                    placeholder="Kilometers"
                    placeholderTextColor="#94A3B8"
                    style={styles.textInputField}
                    keyboardType="numeric"
                    value={kms}
                    onChangeText={setKms}
                  />
                </View>
              </View>
            </View>

            {/* Damage Radio */}
            <Text
              style={[styles.fieldLabel, { marginTop: 22, marginBottom: 10 }]}
            >
              Any New Damage / Issues?
            </Text>
            <View style={styles.damageSelectionWrapper}>
              <TouchableOpacity
                style={[
                  styles.damageBtn,
                  damage === "no" && styles.damageActiveGreen,
                ]}
                onPress={() => setDamage("no")}
              >
                <View
                  style={[
                    styles.radioOuter,
                    damage === "no" && { borderColor: "#22C55E" },
                  ]}
                >
                  {damage === "no" && (
                    <View
                      style={[
                        styles.radioInner,
                        { backgroundColor: "#22C55E" },
                      ]}
                    />
                  )}
                </View>
                <Text style={styles.damageText}>No, everything fine</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.damageBtn,
                  damage === "yes" && styles.damageActiveRed,
                ]}
                onPress={() => setDamage("yes")}
              >
                <View
                  style={[
                    styles.radioOuter,
                    damage === "yes" && { borderColor: "#EF4444" },
                  ]}
                >
                  {damage === "yes" && (
                    <View
                      style={[
                        styles.radioInner,
                        { backgroundColor: "#EF4444" },
                      ]}
                    />
                  )}
                </View>
                <Text style={styles.damageText}>Yes, there are issues</Text>
              </TouchableOpacity>
            </View>

            {/* Damage-specific fields */}
            {damage === "yes" && (
              <View style={{ marginTop: 18 }}>
                <Text style={styles.innerSectionLabel}>
                  Damage Note Description *
                </Text>
                <TextInput
                  placeholder="Type structural descriptions or accident notes here..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  style={styles.damageNotesInput}
                  value={damageNotes}
                  onChangeText={setDamageNotes}
                />

                <Text style={[styles.innerSectionLabel, { marginTop: 16 }]}>
                  Evidence Photos (Multiple) *
                </Text>

                {damageImages.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 12 }}
                  >
                    {damageImages.map((uri, index) => (
                      <View
                        key={index}
                        style={styles.multiImagePreviewContainer}
                      >
                        <Image
                          source={{ uri }}
                          style={styles.multiPreviewFile}
                        />
                        <TouchableOpacity
                          style={styles.removeImageBadge}
                          onPress={() => removeImage(index)}
                        >
                          <Ionicons
                            name="close-circle"
                            size={20}
                            color="#EF4444"
                          />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}

                <TouchableOpacity
                  style={styles.uploadDashedContainer}
                  activeOpacity={0.7}
                  onPress={triggerCamera}
                >
                  <View style={styles.uploadStateFlexContainer}>
                    <Ionicons name="camera-outline" size={26} color="#2563EB" />
                    <Text style={styles.uploadMainText}>
                      Click Damage Image
                    </Text>
                    <Text style={styles.uploadSubText}>
                      Captured: {damageImages.length}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.costWorkflowContainer}>
                  <View style={styles.costWorkflowHeader}>
                    <MaterialCommunityIcons
                      name="calculator"
                      size={18}
                      color="#1E3A8A"
                    />
                    <Text style={styles.costWorkflowTitle}>
                      Repair Estimate Assessment
                    </Text>
                  </View>

                  <View style={styles.formRowFields}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>
                        Repair Estimate (₹) *
                      </Text>
                      <View style={styles.inputBox}>
                        <TextInput
                          placeholder="Cost"
                          placeholderTextColor="#94A3B8"
                          keyboardType="numeric"
                          style={styles.textInputField}
                          value={repairEstimate}
                          onChangeText={setRepairEstimate}
                        />
                      </View>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>
                        Repair Duration (Days) *
                      </Text>
                      <View style={styles.inputBox}>
                        <TextInput
                          placeholder="Days"
                          placeholderTextColor="#94A3B8"
                          keyboardType="numeric"
                          style={styles.textInputField}
                          value={repairDays}
                          onChangeText={setRepairDays}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.calculatedCostRow}>
                    <Text style={styles.calculatedCostLabel}>
                      Total Estimated Cost:
                    </Text>
                    <Text style={styles.calculatedCostValue}>
                      {formatCurrency(totalCost)}
                    </Text>
                  </View>

                  <View style={styles.statusDisplayRow}>
                    <Text style={styles.fieldLabel}>
                      Calculated Entry Status:
                    </Text>
                    <Text
                      style={[
                        styles.statusIndicatorText,
                        operationalStatus === "Collected" && {
                          color: "#16A34A",
                        },
                        operationalStatus === "Partially Collected" && {
                          color: "#F59E0B",
                        },
                      ]}
                    >
                      {operationalStatus}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Settlement Details */}
            <View style={styles.costWorkflowContainer}>
              <Text style={styles.costWorkflowTitle}>Settlement Details</Text>

              <View style={styles.calculatedCostRow}>
                <Text style={styles.calculatedCostLabel}>Pending Amount</Text>
                <Text style={styles.calculatedCostValue}>
                  {formatCurrency(pendingAmount)}
                </Text>
              </View>

              <View style={styles.formRowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Late Return Fine</Text>
                  <View style={styles.inputBox}>
                    <TextInput
                      placeholder="0"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      value={lateReturnFine}
                      onChangeText={setLateReturnFine}
                      style={styles.textInputField}
                    />
                  </View>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Extra KM Fine</Text>
                  <View style={styles.inputBox}>
                    <TextInput
                      placeholder="0"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      value={extraKmFine}
                      onChangeText={setExtraKmFine}
                      style={styles.textInputField}
                    />
                  </View>
                </View>
              </View>

              <View style={{ marginTop: 14 }}>
                <Text style={styles.fieldLabel}>Fuel Usage Amount</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={fuelUsageAmount}
                    onChangeText={setFuelUsageAmount}
                    style={styles.textInputField}
                  />
                </View>
              </View>

              <View style={styles.calculatedCostRow}>
                <Text style={styles.calculatedCostLabel}>Total Balance</Text>
                <Text style={styles.calculatedCostValue}>
                  {formatCurrency(totalBalance)}
                </Text>
              </View>

              {/* Payment Mode selector — 2x2 grid, all 4 modes the rest
                  of the screen already supports. */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                Payment Mode
              </Text>
              <View style={styles.paymentSelectorGrid}>
                {PAYMENT_MODES.map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.paymentModeBadge,
                      paymentMode === mode && styles.paymentModeBadgeActive,
                    ]}
                    onPress={() => handlePaymentModeSelect(mode)}
                  >
                    <Text
                      style={[
                        styles.paymentModeText,
                        paymentMode === mode && styles.paymentModeTextActive,
                      ]}
                    >
                      {mode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Amount Collected (single-mode) */}
              {paymentMode !== "Mixed" && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.fieldLabel}>Amount Collected *</Text>
                  <View style={styles.inputBox}>
                    <Ionicons
                      name="cash-outline"
                      size={18}
                      color="#94A3B8"
                      style={{ marginRight: 6 }}
                    />
                    <TextInput
                      placeholder="Collected"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      style={styles.textInputField}
                      value={amountCollected}
                      onChangeText={setAmountCollected}
                    />
                  </View>
                </View>
              )}

              {/* Mixed payment breakdown inputs */}
              {paymentMode === "Mixed" && (
                <View style={{ marginTop: 16, gap: 12 }}>
                  <View>
                    <Text style={styles.fieldLabel}>Cash Amount</Text>
                    <View style={styles.inputBox}>
                      <Ionicons
                        name="cash-outline"
                        size={18}
                        color="#94A3B8"
                        style={{ marginRight: 6 }}
                      />
                      <TextInput
                        placeholder="Enter cash amount"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                        style={styles.textInputField}
                        value={cashAmount}
                        onChangeText={setCashAmount}
                      />
                    </View>
                  </View>

                  <View>
                    <Text style={styles.fieldLabel}>PhonePe Amount</Text>
                    <View style={styles.inputBox}>
                      <Ionicons
                        name="phone-portrait-outline"
                        size={18}
                        color="#94A3B8"
                        style={{ marginRight: 6 }}
                      />
                      <TextInput
                        placeholder="Enter PhonePe amount"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                        style={styles.textInputField}
                        value={phonePeAmount}
                        onChangeText={(text) => {
                          setPhonePeAmount(text);
                          if (!toNum(text)) {
                            setUpiReferences([]);
                          }
                        }}
                      />
                    </View>
                  </View>

                  <View>
                    <Text style={styles.fieldLabel}>Razorpay Amount</Text>
                    <View style={styles.inputBox}>
                      <Ionicons
                        name="card-outline"
                        size={18}
                        color="#94A3B8"
                        style={{ marginRight: 6 }}
                      />
                      <TextInput
                        placeholder="Enter Razorpay amount"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                        style={styles.textInputField}
                        value={razorpayAmount}
                        onChangeText={setRazorpayAmount}
                      />
                    </View>
                  </View>

                  <View style={styles.calculatedCostRow}>
                    <Text style={styles.calculatedCostLabel}>
                      Total Collected:
                    </Text>
                    <Text style={styles.calculatedCostValue}>
                      {formatCurrency(
                        toNum(cashAmount) +
                          toNum(phonePeAmount) +
                          toNum(razorpayAmount),
                      )}
                    </Text>
                  </View>
                </View>
              )}

              {/* Single UPI reference block */}
              {(needsUpiReference || upiReferences.length > 0) && (
                <View
                  style={[
                    styles.upiInputContainer,
                    needsUpiReference && styles.upiInputContainerRequired,
                  ]}
                >
                  <View style={styles.upiInputHeader}>
                    <MaterialCommunityIcons
                      name="bank-transfer"
                      size={18}
                      color="#1E3A8A"
                    />
                    <Text style={styles.fieldLabel}>
                      UPI Transaction Reference {needsUpiReference ? "*" : ""}
                    </Text>
                  </View>

                  <View style={styles.upiInputRow}>
                    <View style={[styles.inputBox, { flex: 1, marginTop: 0 }]}>
                      <TextInput
                        value={upiInput}
                        onChangeText={(text) =>
                          setUpiInput(text.replace(/\D/g, "").slice(0, 4))
                        }
                        placeholder="Last 4 digits"
                        placeholderTextColor="#94A3B8"
                        keyboardType="number-pad"
                        maxLength={4}
                        style={styles.textInputField}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.addUpiButton}
                      onPress={addUpiReference}
                    >
                      <Text style={styles.addUpiButtonText}>Add</Text>
                    </TouchableOpacity>
                  </View>

                  {upiReferences.length > 0 && (
                    <View style={styles.upiList}>
                      {upiReferences.map((reference, index) => (
                        <View
                          key={`${reference}-${index}`}
                          style={styles.upiReferenceItem}
                        >
                          <Text style={styles.upiReferenceText}>
                            UPI •••• {reference}
                          </Text>
                          <TouchableOpacity
                            onPress={() => removeUpiReference(index)}
                          >
                            <Ionicons
                              name="close-circle"
                              size={18}
                              color="#DC2626"
                            />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  <Text style={styles.upiInputHint}>
                    Enter the last 4 digits of the customer's UPI
                    transaction/reference ID.
                  </Text>
                </View>
              )}

              <View style={styles.calculatedCostRow}>
                <Text style={styles.calculatedCostLabel}>Final Balance</Text>
                <Text
                  style={[
                    styles.calculatedCostValue,
                    { color: finalBalance > 0 ? "#DC2626" : "#16A34A" },
                  ]}
                >
                  {formatCurrency(finalBalance)}
                </Text>
              </View>

              {finalBalance > 0 && (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.fieldLabel}>
                    Reason for Pending Balance *
                  </Text>
                  <TextInput
                    placeholder="Required if balance remains"
                    placeholderTextColor="#94A3B8"
                    value={balanceReason}
                    onChangeText={setBalanceReason}
                    multiline
                    style={styles.damageNotesInput}
                  />
                </View>
              )}

              <View style={styles.statusDisplayRow}>
                <Text style={styles.fieldLabel}>Settlement Status:</Text>
                <Text
                  style={[
                    styles.statusIndicatorText,
                    { color: settlementColor },
                  ]}
                >
                  {settlementStatus}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.upiQrLink}
                onPress={() => setShowUpiModal(true)}
              >
                <MaterialCommunityIcons
                  name="qrcode-scan"
                  size={16}
                  color="#2563EB"
                />
                <Text style={styles.upiQrLinkText}>
                  Show UPI QR to customer
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Maintenance */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Vehicle Maintenance Required?
            </Text>

            <View style={[styles.damageSelectionWrapper, { marginTop: 12 }]}>
              <TouchableOpacity
                style={[
                  styles.damageBtn,
                  needsMaintenance === "no" && styles.damageActiveGreen,
                ]}
                onPress={() => setNeedsMaintenance("no")}
              >
                <View
                  style={[
                    styles.radioOuter,
                    needsMaintenance === "no" && { borderColor: "#22C55E" },
                  ]}
                >
                  {needsMaintenance === "no" && (
                    <View
                      style={[
                        styles.radioInner,
                        { backgroundColor: "#22C55E" },
                      ]}
                    />
                  )}
                </View>
                <Text style={styles.damageText}>No</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.damageBtn,
                  needsMaintenance === "yes" && styles.damageActiveRed,
                ]}
                onPress={() => setNeedsMaintenance("yes")}
              >
                <View
                  style={[
                    styles.radioOuter,
                    needsMaintenance === "yes" && { borderColor: "#EF4444" },
                  ]}
                >
                  {needsMaintenance === "yes" && (
                    <View
                      style={[
                        styles.radioInner,
                        { backgroundColor: "#EF4444" },
                      ]}
                    />
                  )}
                </View>
                <Text style={styles.damageText}>Yes</Text>
              </TouchableOpacity>
            </View>

            {needsMaintenance === "yes" && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                  Maintenance Reason
                </Text>
                <TextInput
                  placeholder="Engine issue, tyre change, servicing..."
                  placeholderTextColor="#94A3B8"
                  value={maintenanceReason}
                  onChangeText={setMaintenanceReason}
                  style={styles.damageNotesInput}
                />

                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                  Estimated Days
                </Text>
                <View style={styles.inputBox}>
                  <TextInput
                    placeholder="Number of days"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={maintenanceDays}
                    onChangeText={setMaintenanceDays}
                    style={styles.textInputField}
                  />
                </View>
              </>
            )}
          </View>
        </ScrollView>

        {/* Sticky footer: always-visible balance + Next button */}
        <View style={styles.footerBar}>
          <View>
            <Text style={styles.footerLabel}>Final Balance</Text>
            <Text
              style={[
                styles.footerAmount,
                { color: finalBalance > 0 ? "#DC2626" : "#16A34A" },
              ]}
            >
              {formatCurrency(finalBalance)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.primarySubmitBtn, submitting && { opacity: 0.7 }]}
            activeOpacity={0.9}
            onPress={handleNext}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Text style={styles.primarySubmitBtnText}>Next</Text>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color="white"
                  style={{ marginLeft: 6 }}
                />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---- Sizing constants kept in one place so every input / button on the
// screen shares the same footprint instead of drifting between 32 / 42 /
// 46px like the original file. ----
const INPUT_HEIGHT = 46;
const BUTTON_HEIGHT = 46;
const CONDITION_BTN_HEIGHT = 38;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    paddingTop: Platform.OS === "android" ? 45 : 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backTouch: { paddingRight: 12 },
  headerTitle: { color: "white", fontSize: 18, fontWeight: "700", flex: 1 },

  // Vehicle detail card (no image)
  vehicleCard: {
    backgroundColor: "white",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  vehicleCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  carName: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  plateRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  plateBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  plateText: { fontSize: 11, fontWeight: "700", color: "#2563EB" },
  specInline: { fontSize: 12, color: "#64748B", fontWeight: "500" },
  statusBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusText: { color: "#16A34A", fontWeight: "700", fontSize: 11 },

  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  detailCell: { width: "50%", marginBottom: 12 },
  detailCellLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 3,
  },
  detailCellLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
  },
  detailCellValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
  },
  detailCellValue: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  redText: { color: "#DC2626" },

  // Copy-phone button (sits right next to the mobile number)
  copyIconButton: {
    width: 24,
    height: 24,
    borderRadius: 6,
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

  balanceStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  balanceStripLabel: { fontSize: 12, fontWeight: "600", color: "#475569" },
  balanceStripValue: { fontSize: 18, fontWeight: "800", color: "#0F172A" },

  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#F8FAFF",
  },
  viewButtonText: { color: "#2563EB", fontWeight: "700", fontSize: 12 },

  section: {
    backgroundColor: "white",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 6,
  },
  progressPill: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  progressPillDone: { backgroundColor: "#DCFCE7" },
  progressPillText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  progressPillTextDone: { color: "#16A34A" },

  gridContainer: { gap: 14 },
  inspectWrapperBlock: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 12,
  },
  inspectRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inspectTitleColumn: {
    flex: 1.1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 4,
  },
  inspectTitle: { fontSize: 13, fontWeight: "600", color: "#334155" },
  conditionActionGroup: { flexDirection: "row", gap: 6, flex: 1.9 },
  conditionBtn: {
    flex: 1,
    height: CONDITION_BTN_HEIGHT,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  conditionText: { fontWeight: "600", fontSize: 11.5 },
  inlineNoteContainer: {
    marginTop: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    height: 38,
    justifyContent: "center",
  },
  inlineNoteInput: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
    padding: 0,
  },

  formRowFields: { flexDirection: "row", gap: 14 },
  fuelContainerForm: { flex: 1.1, justifyContent: "flex-start" },
  kmContainerForm: { flex: 0.9 },

  inputBox: {
    height: INPUT_HEIGHT,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    backgroundColor: "white",
  },
  textInputField: { flex: 1, fontSize: 14, color: "#111827", padding: 0 },

  damageSelectionWrapper: { flexDirection: "row", gap: 12 },
  damageBtn: {
    flex: 1,
    height: BUTTON_HEIGHT,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  damageActiveGreen: { backgroundColor: "#F0FDF4", borderColor: "#22C55E" },
  damageActiveRed: { backgroundColor: "#FEF2F2", borderColor: "#EF4444" },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  radioInner: { width: 8, height: 8, borderRadius: 4 },
  damageText: { fontSize: 12.5, fontWeight: "600", color: "#334155" },
  innerSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
  },
  damageNotesInput: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 12,
    fontSize: 13.5,
    color: "#0F172A",
    textAlignVertical: "top",
    minHeight: 80,
  },
  uploadDashedContainer: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    height: 92,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  uploadStateFlexContainer: { alignItems: "center", justifyContent: "center" },
  uploadMainText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1D4ED8",
    marginTop: 4,
  },
  uploadSubText: { fontSize: 11, color: "#64748B", marginTop: 1 },
  loaderContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loaderText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "600",
    color: "#475569",
  },
  multiImagePreviewContainer: { marginRight: 10, position: "relative" },
  multiPreviewFile: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: "cover",
    backgroundColor: "#E2E8F0",
  },
  removeImageBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "white",
    borderRadius: 10,
  },
  costWorkflowContainer: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  costWorkflowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  costWorkflowTitle: { fontSize: 13, fontWeight: "700", color: "#1E3A8A" },
  calculatedCostRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    padding: 12,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
  },
  calculatedCostLabel: { fontSize: 12, fontWeight: "600", color: "#475569" },
  calculatedCostValue: { fontSize: 14, fontWeight: "700", color: "#0F172A" },

  paymentSelectorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  paymentModeBadge: {
    minWidth: "23%",
    flexGrow: 1,
    height: BUTTON_HEIGHT,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
    paddingHorizontal: 4,
  },
  paymentModeBadgeActive: {
    backgroundColor: "#1E3A8A",
    borderColor: "#1E3A8A",
  },
  paymentModeText: { fontSize: 11.5, fontWeight: "600", color: "#475569" },
  paymentModeTextActive: { color: "white" },

  statusDisplayRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    alignItems: "center",
  },
  statusIndicatorText: { fontSize: 13, fontWeight: "700" },

  upiInputContainer: {
    marginTop: 16,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
  },
  upiInputContainerRequired: {
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
  },
  upiInputHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  upiInputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  addUpiButton: {
    height: INPUT_HEIGHT,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: "#1E3A8A",
    justifyContent: "center",
    alignItems: "center",
  },
  addUpiButtonText: { color: "white", fontWeight: "700", fontSize: 12.5 },
  upiList: { marginTop: 10, gap: 6 },
  upiReferenceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  upiReferenceText: { fontSize: 12.5, fontWeight: "600", color: "#334155" },
  upiInputHint: {
    fontSize: 10.5,
    color: "#64748B",
    marginTop: 8,
    lineHeight: 14,
  },
  upiQrLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 16,
  },
  upiQrLinkText: { color: "#2563EB", fontWeight: "700", fontSize: 12.5 },

  // Sticky footer
  footerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 6,
  },
  footerLabel: { fontSize: 11, fontWeight: "600", color: "#64748B" },
  footerAmount: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  primarySubmitBtn: {
    height: BUTTON_HEIGHT,
    minWidth: 130,
    borderRadius: 10,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 22,
  },
  primarySubmitBtnText: { color: "white", fontSize: 15, fontWeight: "700" },

  // UPI Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  qrImage: {
    width: 220,
    height: 220,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  upiIdText: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: "700",
    color: "#1E3A8A",
    letterSpacing: 0.3,
  },
  upiNote: {
    marginTop: 8,
    fontSize: 11,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  modalCloseBtn: {
    marginTop: 20,
    backgroundColor: "#1E3A8A",
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 8,
  },
  modalCloseBtnText: { color: "white", fontSize: 14, fontWeight: "700" },

  pickerContainer: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    marginTop: 0,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    height: INPUT_HEIGHT + 4,
  },
  picker: { height: INPUT_HEIGHT + 4 },
});
