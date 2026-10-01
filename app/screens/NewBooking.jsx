import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.log("NewBookingScreen crashed:", error?.message);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={fallbackStyles.container}>
          <StatusBar backgroundColor="#001B45" barStyle="light-content" />
          <View style={fallbackStyles.content}>
            <Ionicons name="warning-outline" size={48} color="#EF4444" />
            <Text style={fallbackStyles.title}>Something went wrong</Text>
            <Text style={fallbackStyles.message}>
              {this.state.error?.message ||
                "This screen ran into an unexpected error."}
            </Text>
            <TouchableOpacity
              style={fallbackStyles.retryBtn}
              onPress={this.handleReset}
            >
              <Text style={fallbackStyles.retryText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fallbackStyles.backBtn}
              onPress={() => this.props.onGoBack?.()}
            >
              <Text style={fallbackStyles.backText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const fallbackStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginTop: 14,
  },
  message: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
  },
  retryBtn: {
    marginTop: 24,
    backgroundColor: "#FFC107",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: { fontWeight: "800", color: "#111827" },
  backBtn: { marginTop: 14, padding: 8 },
  backText: { color: "#002B6B", fontWeight: "700" },
});

// ==========================================
// 1. SAFE HELPERS
// ==========================================

// Returns a valid Date or null — never lets an Invalid Date leak into state.
const safeDate = (input) => {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
};

const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ==========================================
// 2. HOISTED SUB-COMPONENTS
// ==========================================

const InputField = ({
  label,
  placeholder,
  icon,
  required = false,
  multiline = false,
  fullWidth = false,
  value,
  onChangeText,
  keyboardType = "default",
  editable = true,
  hint,
}) => (
  <View style={[styles.inputContainer, fullWidth && { width: "100%" }]}>
    <Text style={styles.label}>
      {label}
      {required && <Text style={styles.required}> *</Text>}
    </Text>

    <View
      style={[
        styles.inputBox,
        multiline && styles.notesBox,
        !editable && styles.inputBoxDisabled,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={editable ? "#64748B" : "#94A3B8"}
      />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        style={[
          styles.input,
          multiline && styles.notesInput,
          !editable && { color: "#94A3B8" },
        ]}
        multiline={multiline}
        value={value ?? ""}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        maxLength={multiline ? 200 : undefined}
        editable={editable}
      />
    </View>
    {hint ? <Text style={styles.hintText}>{hint}</Text> : null}
  </View>
);

const SelectField = ({
  label,
  placeholder,
  icon,
  required = false,
  onPress,
  value,
  locked = false,
  hint,
}) => (
  <View style={styles.inputContainer}>
    <View style={styles.labelRow}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
    </View>

    <TouchableOpacity
      style={[styles.inputBox, locked && styles.inputBoxLocked]}
      activeOpacity={locked ? 1 : 0.8}
      onPress={locked ? undefined : onPress}
    >
      <Ionicons name={icon} size={18} color={locked ? "#94A3B8" : "#64748B"} />
      <Text
        style={[
          styles.placeholder,
          value ? { color: locked ? "#6366F1" : "#111827" } : null,
        ]}
      >
        {value || placeholder}
      </Text>
      {!locked && <Ionicons name="chevron-down" size={18} color="#64748B" />}
      {locked && <Ionicons name="lock-closed" size={14} color="#6366F1" />}
    </TouchableOpacity>
    {hint ? <Text style={styles.hintText}>{hint}</Text> : null}
  </View>
);

// Reusable Yes/No (or custom options) radio button field.
// Used for the highlighted "Spare & Toolkit" section below, but generic
// enough to reuse anywhere else a simple radio choice is needed.
const RadioField = ({
  label,
  required = false,
  value,
  onChange,
  options = [
    { label: "Yes", value: "yes" },
    { label: "No", value: "no" },
  ],
}) => (
  <View style={styles.radioFieldContainer}>
    <Text style={styles.radioQuestionLabel}>
      {label}
      {required && <Text style={styles.required}> *</Text>}
    </Text>
    <View style={styles.radioOptionsRow}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={styles.radioOption}
            activeOpacity={0.8}
            onPress={() => onChange(opt.value)}
          >
            <View
              style={[
                styles.radioCircle,
                selected && styles.radioCircleSelected,
              ]}
            >
              {selected && <View style={styles.radioCircleDot} />}
            </View>
            <Text
              style={[
                styles.radioOptionText,
                selected && styles.radioOptionTextSelected,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

const SectionTitle = ({ title, subtitle }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    <View style={styles.yellowLine} />
  </View>
);

// ==========================================
// 3. SMART DATE/TIME HELPERS
// ==========================================

/**
 * Given a pickup datetime + number of days + tripType,
 * calculate the expected drop datetime.
 *
 * Outstation rule: drop time is always 8:00 AM on (pickupDate + numberOfDays)
 * Local rule:      drop time matches pickup time, date += numberOfDays
 */
const calculateDropDateTime = (
  pickupDate,
  pickupTime,
  numberOfDays,
  tripType,
) => {
  const pDate = safeDate(pickupDate);
  const pTime = safeDate(pickupTime);
  const days = toNum(numberOfDays, 0);

  if (!pDate || !pTime || days <= 0) {
    return { dropDate: null, dropTime: null };
  }

  const newDropDate = new Date(pDate);
  newDropDate.setDate(newDropDate.getDate() + days);

  let newDropTime;

  if (tripType === "outstation" || tripType === "") {
    // Outstation: always 8:00 AM
    newDropTime = new Date(pTime);
    newDropTime.setHours(8, 0, 0, 0);
  } else {
    // Local: same time as pickup
    newDropTime = new Date(pTime);
  }

  return { dropDate: newDropDate, dropTime: newDropTime };
};

// ==========================================
// 4. MAIN SCREEN COMPONENT (inner, unwrapped)
// ==========================================

function NewBookingScreenInner() {
  const router = useRouter();
  const { token, initialized } = useAuthStore();

  const params = useLocalSearchParams();
  // `booking` can occasionally arrive as an array depending on how the
  // route was pushed — normalize it before parsing.
  const bookingParam = Array.isArray(params?.booking)
    ? params.booking[0]
    : params?.booking;

  const bookingData = useMemo(() => {
    if (!bookingParam) return null;
    try {
      const parsed = JSON.parse(bookingParam);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (err) {
      console.log("Booking Parse Error:", err?.message);
      return null;
    }
  }, [bookingParam]);

  const [notes, setNotes] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState("date");
  const [selectedField, setSelectedField] = useState("");

  // --- Smart: Initialize pickup to NOW ---
  const [pickupDate, setPickupDate] = useState(() => new Date());
  const [pickupTime, setPickupTime] = useState(() => new Date());
  const [dropDate, setDropDate] = useState(null);
  const [dropTime, setDropTime] = useState(null);
  const [isDropDateEdited, setIsDropDateEdited] = useState(false);
  const [isDropTimeEdited, setIsDropTimeEdited] = useState(false);

  const [numberOfDays, setNumberOfDays] = useState("");
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const [paymentMethod, setPaymentMethod] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [phonePeAmount, setPhonePeAmount] = useState("");
  const [razorpayAmount, setRazorpayAmount] = useState("");
  // Multiple UPI reference entries — each is a 4-digit code. Starts with
  // one empty slot; user can tap the "+" icon to add more, and remove any
  // extra slot with the "-" icon. At least one slot always remains.
  const [upiLast4List, setUpiLast4List] = useState([""]);

  const [bookingStatus, setBookingStatus] = useState("");

  const [fuelLevel, setFuelLevel] = useState(1);
  const [loading, setLoading] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [alternateNumber, setAlternateNumber] = useState("");
  const [occupation, setOccupation] = useState("");
  const [destination, setDestination] = useState("");

  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [drivingLicenseNumber, setDrivingLicenseNumber] = useState("");
  const [tripType, setTripType] = useState("outstation");

  const [fastTagPayable, setFastTagPayable] = useState("");
  const [totalFare, setTotalFare] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  const [extraCharges, setExtraCharges] = useState("");
  const [bookingAmountPaid, setBookingAmountPaid] = useState("");
  const [balanceAmount, setBalanceAmount] = useState("");

  const [vehicles, setVehicles] = useState([]);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [handoverKm, setHandoverKm] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");

  const [discountAmount, setDiscountAmount] = useState("");
  const [hasMembership, setHasMembership] = useState(false);
  const [membershipTier, setMembershipTier] = useState(null);

  // ── Spare & Toolkit check (highlighted section) ──
  const [spareAvailable, setSpareAvailable] = useState("");
  const [toolkitAvailable, setToolkitAvailable] = useState("");

  // Bill Summary (invoice-style breakdown) - collapsed by default, tap to
  // expand/close, Zomato-style. Same pattern as the other booking screens.
  const [showBillSummary, setShowBillSummary] = useState(false);

  const fuelOptions = [
    { value: 0, label: "Blink" },
    { value: 1, label: "1 Stick" },
    { value: 2, label: "2 Sticks" },
    { value: 3, label: "3 Sticks" },
    { value: 4, label: "4 Sticks" },
    { value: 5, label: "5 Sticks" },
    { value: 6, label: "6 Sticks" },
    { value: 7, label: "Full Tank" },
  ];

  // ---- UPI Last 4 Digits: multi-entry helpers ----
  const updateUpiLast4 = (index, text) => {
    const cleaned = text.replace(/[^0-9]/g, "").slice(0, 4);
    setUpiLast4List((prev) => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });
  };

  const addUpiLast4Field = () => {
    setUpiLast4List((prev) => [...prev, ""]);
  };

  const removeUpiLast4Field = (index) => {
    setUpiLast4List((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
  };

  // ---- Smart: Auto-calculate drop date/time when deps change ----
  useEffect(() => {
    const days = toNum(numberOfDays, 0);

    if (!numberOfDays || days <= 0) {
      if (!isDropDateEdited) setDropDate(null);
      if (!isDropTimeEdited) setDropTime(null);
      return;
    }

    const { dropDate: newDrop, dropTime: newDropT } = calculateDropDateTime(
      pickupDate,
      pickupTime,
      numberOfDays,
      tripType,
    );

    if (!isDropDateEdited) setDropDate(newDrop);
    if (!isDropTimeEdited) setDropTime(newDropT);
  }, [
    numberOfDays,
    tripType,
    pickupDate,
    pickupTime,
    isDropDateEdited,
    isDropTimeEdited,
  ]);

  const pickupDropCharge = useMemo(() => {
    return (
      toNum(bookingData?.pickup?.charge) + toNum(bookingData?.drop?.charge)
    );
  }, [bookingData]);

  // ── Bill Summary (same convention as the other booking screens) ──
  // `totalAmount` is the gross / headline "Total" — Discount does NOT
  // reduce it. Discount only reduces what's still owed, exactly like
  // Advance / Booking Amount Paid does — see the balance calculation
  // below, where `discountAmount` is subtracted alongside `bookingAmountPaid`.
  const totalAmount = Math.max(
    toNum(totalFare) +
      toNum(fastTagPayable) +
      toNum(pickupDropCharge) +
      toNum(securityDeposit) +
      toNum(extraCharges),
    0,
  );

  useEffect(() => {
    const bookingPaid = toNum(bookingAmountPaid);
    const discount = toNum(discountAmount);

    const totalPaidNow =
      toNum(cashAmount) + toNum(phonePeAmount) + toNum(razorpayAmount);

    const receivedNow = totalPaidNow || toNum(amountReceived);

    // Advance AND Discount both come off the balance — neither touches
    // the headline Total shown above.
    const remainingAmount = Math.max(0, totalAmount - bookingPaid - discount);
    const balance = Math.max(0, remainingAmount - receivedNow);

    setBalanceAmount(balance.toString());
  }, [
    totalAmount,
    bookingAmountPaid,
    discountAmount,
    amountReceived,
    cashAmount,
    phonePeAmount,
    razorpayAmount,
  ]);

  // Amount actually received right now (mixed breakdown or single field),
  // and running total collected across advance + now — used by the Bill
  // Summary section rendered after the Notes field.
  const receivedNow =
    paymentMethod === "mixed"
      ? toNum(cashAmount) + toNum(phonePeAmount) + toNum(razorpayAmount)
      : toNum(amountReceived);

  const totalCollectedNow = toNum(bookingAmountPaid) + receivedNow;

  useEffect(() => {
    if (!selectedVehicle) return;

    const days = toNum(numberOfDays, 0);
    const price = toNum(selectedVehicle?.pricePerDay, 0);

    if (days <= 0 || price <= 0) {
      setTotalFare("");
      return;
    }

    setTotalFare(String(days * price));
  }, [selectedVehicle, numberOfDays]);

  useEffect(() => {
    if (!bookingData) return;

    try {
      // Customer
      setCustomerName(bookingData.customerName ?? "");
      setContactNumber(bookingData.mobileNumber ?? "");
      setAlternateNumber(bookingData.alternateMobileNumber ?? "");
      setOccupation(bookingData.occupation ?? "");
      setDestination(bookingData.destination ?? "");

      // Identity
      setAadhaarNumber(bookingData.aadhaarNumber ?? "");
      setDrivingLicenseNumber(bookingData.drivingLicenseNumber ?? "");

      // Trip
      setTripType(bookingData.tripType || "local");

      if (bookingData.tripDays) {
        setNumberOfDays(String(bookingData.tripDays));
      }

      // Dates
      const parseTime = (timeStr) => {
        const d = new Date();
        if (!timeStr || typeof timeStr !== "string") return d;

        const match = timeStr.match(/(\d+):(\d+)\s?(AM|PM)/i);
        if (!match) return d;

        let [, hour, minute, period] = match;
        hour = parseInt(hour, 10);
        minute = parseInt(minute, 10);

        if (Number.isNaN(hour) || Number.isNaN(minute)) return d;

        if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
        if (period.toUpperCase() === "AM" && hour === 12) hour = 0;

        d.setHours(hour, minute, 0, 0);
        return d;
      };

      // Pickup
      const parsedPickupDate = safeDate(bookingData.fromDate);
      if (parsedPickupDate) setPickupDate(parsedPickupDate);

      if (bookingData.pickupTime) {
        setPickupTime(parseTime(bookingData.pickupTime));
      }

      // Drop
      const parsedDropDate = safeDate(bookingData.toDate);
      if (parsedDropDate) {
        setDropDate(parsedDropDate);
        setIsDropDateEdited(true);
      }

      if (bookingData.dropTime) {
        setDropTime(parseTime(bookingData.dropTime));
        setIsDropTimeEdited(true);
      }

      const bookingPayment = bookingData.payment || null;

      setTotalFare(
        bookingPayment?.totalAmount != null
          ? String(bookingPayment.totalAmount)
          : bookingData.quotationAmount != null
            ? String(bookingData.quotationAmount)
            : "",
      );

      setBookingAmountPaid(
        bookingPayment?.bookingAmountPaid != null
          ? String(bookingPayment.bookingAmountPaid)
          : bookingData.bookingAmount != null
            ? String(bookingData.bookingAmount)
            : "",
      );

      setDiscountAmount(
        bookingPayment?.discountAmount != null
          ? String(bookingPayment.discountAmount)
          : bookingData.discountAmount != null
            ? String(bookingData.discountAmount)
            : "",
      );

      setFastTagPayable(
        bookingPayment?.fastagAmount != null
          ? String(bookingPayment.fastagAmount)
          : bookingData.fastagBalance != null
            ? String(bookingData.fastagBalance)
            : "",
      );

      setSecurityDeposit(
        bookingPayment?.securityDeposit != null
          ? String(bookingPayment.securityDeposit)
          : bookingData.securityDeposit != null
            ? String(bookingData.securityDeposit)
            : "",
      );
    } catch (err) {
      console.log("Error hydrating bookingData:", err?.message);
    }
  }, [bookingData]);

  useEffect(() => {
    if (!bookingData || !Array.isArray(vehicles) || vehicles.length === 0)
      return;

    try {
      const vehicleId =
        typeof bookingData.vehicleId === "object"
          ? bookingData.vehicleId?._id
          : bookingData.vehicleId;

      if (!vehicleId) return;

      const vehicle = vehicles.find((v) => String(v._id) === String(vehicleId));

      if (!vehicle) {
        Alert.alert(
          "Booked Vehicle Unavailable",
          `${
            bookingData.vehicleName || "This vehicle"
          } is currently on rent and cannot be assigned for handover.\n\nPlease wait until the vehicle is returned or select another available vehicle.`,
        );
        return;
      }

      setSelectedVehicle(vehicle);

      setHandoverKm(
        bookingData.handoverKm
          ? String(bookingData.handoverKm)
          : vehicle.currentKm
            ? String(vehicle.currentKm)
            : "",
      );
    } catch (err) {
      console.log("Error matching vehicle:", err?.message);
    }
  }, [bookingData, vehicles]);

  const formatDate = (date) => {
    const d = safeDate(date);
    if (!d) return "";
    try {
      return d.toLocaleDateString("en-IN");
    } catch {
      return "";
    }
  };

  const formatTime = (date) => {
    const d = safeDate(date);
    if (!d) return "";
    try {
      return d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const openPicker = (mode, field) => {
    setPickerMode(mode);
    setSelectedField(field);
    setShowPicker(true);
  };

  const closePicker = () => {
    setShowPicker(false);
    setSelectedField("");
  };

  const onDateChange = (event, selectedDate) => {
    // Android fires "dismissed" and closes itself; iOS spinner stays
    // open until the user taps Done (handled separately below).
    if (Platform.OS === "android") {
      setShowPicker(false);
    }

    if (event?.type === "dismissed") {
      closePicker();
      return;
    }

    const validDate = safeDate(selectedDate);
    if (!validDate) return;

    switch (selectedField) {
      case "pickupDate":
        setPickupDate(validDate);
        break;
      case "pickupTime":
        setPickupTime(validDate);
        break;
      case "dropDate":
        setDropDate(validDate);
        setIsDropDateEdited(true);
        break;
      case "dropTime":
        setDropTime(validDate);
        setIsDropTimeEdited(true);
        break;
      default:
        break;
    }
  };

  const getPickerValue = () => {
    switch (selectedField) {
      case "pickupDate":
        return safeDate(pickupDate) || new Date();
      case "pickupTime":
        return safeDate(pickupTime) || new Date();
      case "dropDate":
        return safeDate(dropDate) || new Date();
      case "dropTime":
        return safeDate(dropTime) || new Date();
      default:
        return new Date();
    }
  };

  const getDropDateHint = () => {
    const days = toNum(numberOfDays, 0);
    if (days > 0) return `⚡ Pickup + ${numberOfDays} day(s)`;
    return null;
  };

  useEffect(() => {
    if (initialized && token) {
      fetchAvailableVehicles();
    }
  }, [initialized, token]);

  useEffect(() => {
    if (paymentMethod === "mixed") {
      const total =
        toNum(cashAmount) + toNum(phonePeAmount) + toNum(razorpayAmount);
      setAmountReceived(total.toString());
    }
  }, [cashAmount, phonePeAmount, razorpayAmount, paymentMethod]);

  const combineDateTime = (date, time) => {
    const d = safeDate(date);
    const t = safeDate(time);
    if (!d || !t) return null;

    const combined = new Date(d);
    combined.setHours(t.getHours(), t.getMinutes(), 0, 0);
    return combined;
  };

  const fetchAvailableVehicles = async () => {
    try {
      if (!token) return;
      setVehicleLoading(true);
      const res = await api.get("/vehicles/available", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = res?.data?.data;
      setVehicles(Array.isArray(list) ? list : []);
    } catch (error) {
      console.log(
        "Vehicle fetch error:",
        error?.response?.data || error?.message,
      );
      setVehicles([]);
      // Non-blocking: don't let a failed vehicle fetch take down the screen.
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to load vehicles",
      );
    } finally {
      setVehicleLoading(false);
    }
  };

  const handleSaveNext = async () => {
    try {
      if (!token) {
        Alert.alert("Session expired", "Please login again");
        return;
      }

      // Customer Validation
      if (!customerName.trim()) {
        return Alert.alert("Validation", "Customer name required");
      }

      if (!/^[0-9]{10}$/.test(contactNumber)) {
        return Alert.alert("Validation", "Contact number must be 10 digits");
      }

      if (!alternateNumber.trim()) {
        return Alert.alert("Validation", "Alternate number is required");
      }

      if (alternateNumber.length !== 10) {
        return Alert.alert("Validation", "Alternate number must be 10 digits");
      }

      if (!destination.trim()) {
        return Alert.alert("Validation", "Destination required");
      }

      // Vehicle Validation
      if (!selectedVehicle) {
        return Alert.alert("Validation", "Please select vehicle");
      }

      if (!handoverKm.trim()) {
        return Alert.alert("Validation", "Total KM at handover required");
      }

      if (!/^[0-9]{12}$/.test(aadhaarNumber)) {
        return Alert.alert("Validation", "Aadhaar number must be 12 digits");
      }

      if (!drivingLicenseNumber.trim()) {
        return Alert.alert("Validation", "Driving License Number is required");
      }

      // Spare & Toolkit Validation
      if (!spareAvailable) {
        return Alert.alert(
          "Validation",
          "Please select if spare tyre is available",
        );
      }

      if (!toolkitAvailable) {
        return Alert.alert(
          "Validation",
          "Please select if toolkit is available",
        );
      }

      // Trip Validation
      const pickup = combineDateTime(pickupDate, pickupTime);
      const drop = combineDateTime(dropDate, dropTime);

      if (!pickup || !drop) {
        return Alert.alert("Validation", "Pickup and drop date/time required");
      }

      if (fuelLevel < 0 || fuelLevel > 7) {
        return Alert.alert("Validation", "Please select fuel level");
      }

      // Payment Method Validation
      if (!paymentMethod) {
        return Alert.alert("Validation", "Please select payment method");
      }

      // UPI Last 4 Digits Validation — only for phonepe / mixed, only
      // validate slots the user actually filled in (empty extra slots
      // are simply dropped before sending to the backend).
      if (paymentMethod === "phonepe" || paymentMethod === "mixed") {
        const filledEntries = upiLast4List.filter((v) => v && v.trim());
        const invalidEntry = filledEntries.find((v) => v.trim().length !== 4);
        if (invalidEntry) {
          return Alert.alert(
            "Validation",
            "Each UPI reference must be exactly 4 digits",
          );
        }
      }

      // Fare Validation
      // `totalPayable` is the amount actually owed once Discount is applied
      // (Discount comes off here for cap-checking received amounts; Advance
      // is handled separately and reflected in Balance Due, not here).
      const totalPayable = Math.max(
        toNum(totalAmount) - toNum(discountAmount),
        0,
      );
      const received = toNum(amountReceived);

      if (totalPayable <= 0) {
        return Alert.alert(
          "Validation",
          "Total amount should be greater than 0",
        );
      }

      const fare = toNum(totalFare);

      if (toNum(totalFare) <= 0) {
        return Alert.alert("Validation", "Please enter total fare");
      }
      // Mixed Payment Validation
      let paymentBreakdown = {};
      let finalAmountReceived = received;

      if (paymentMethod === "mixed") {
        const cash = toNum(cashAmount);
        const phonePe = toNum(phonePeAmount);
        const razorpay = toNum(razorpayAmount);

        const mixedTotal = cash + phonePe + razorpay;

        if (mixedTotal <= 0) {
          return Alert.alert("Validation", "Please enter payment amounts");
        }

        if (mixedTotal > totalPayable) {
          return Alert.alert(
            "Validation",
            "Received amount cannot exceed total payable amount",
          );
        }

        paymentBreakdown = { cash, phonePe, razorpay };
        finalAmountReceived = mixedTotal;
        setAmountReceived(String(mixedTotal));
      } else {
        if (received <= 0) {
          return Alert.alert("Validation", "Please enter received amount");
        }

        if (received > totalPayable) {
          return Alert.alert(
            "Validation",
            "Received amount cannot exceed total payable amount",
          );
        }

        paymentBreakdown = {
          cash: paymentMethod === "cash" ? received : 0,
          phonePe: paymentMethod === "phonepe" ? received : 0,
          razorpay: paymentMethod === "razorpay" ? received : 0,
        };
      }

      if (drop.getTime() <= pickup.getTime()) {
        return Alert.alert("Validation", "Drop time must be after pickup time");
      }

      setLoading(true);

      // Only send filled, valid 4-digit UPI reference entries.
      const upiLast4Payload =
        paymentMethod === "phonepe" || paymentMethod === "mixed"
          ? upiLast4List
              .map((v) => (v || "").trim())
              .filter((v) => v.length === 4)
          : [];

      const payload = {
        bookingId: bookingData?._id,
        customer: {
          fullName: customerName.trim(),
          mobileNumber: contactNumber.trim(),
          alternateMobileNumber: alternateNumber?.trim() || "",
          occupation: occupation?.trim() || "",
          destination: destination.trim(),
        },

        identity: {
          aadhaarNumber: aadhaarNumber.trim(),
          drivingLicenseNumber: drivingLicenseNumber.trim(),
        },

        vehicle: {
          vehicleId: selectedVehicle._id,
          vehicleName: selectedVehicle.vehicleName,
          vehicleNumber: selectedVehicle.vehicleNumber,
          vehicleColor: selectedVehicle.color,
          handoverKm: toNum(handoverKm),
          spareAvailable: spareAvailable === "yes",
          toolkitAvailable: toolkitAvailable === "yes",
        },

        trip: {
          tripType: tripType || "outstation",
          numberOfDays: toNum(numberOfDays, 1) > 0 ? toNum(numberOfDays, 1) : 1,
          pickupDateTime: pickup,
          dropDateTime: drop,
        },

        payment: {
          fuelLevel,
          fastTagPayableAmount: toNum(fastTagPayable),
          totalFare: toNum(totalFare),
          securityDeposit: toNum(securityDeposit),
          extraCharges: toNum(extraCharges),
          discountAmount: toNum(discountAmount),
          totalAmount,
          bookingAmountPaid: toNum(bookingAmountPaid),
          amountReceivedNow: finalAmountReceived,
          balanceAmount: toNum(balanceAmount),
          paymentMethod,
          // Sent as an array — one entry per UPI reference the user added.
          upiLast4: upiLast4Payload,
          paymentBreakdown,
        },

        notes: notes?.trim() || "",
        bookingStatus: bookingStatus || "confirmed",
      };

      const res = await api.post("/handover/create", payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const handoverId = res?.data?.data?._id;

      if (!handoverId) {
        Alert.alert("Error", "Failed to create handover");
        return;
      }

      Alert.alert("Success", "Handover created successfully", [
        {
          text: "OK",
          onPress: () =>
            router.push({
              pathname: "/components/handover/image",
              params: { handoverId },
            }),
        },
      ]);
    } catch (error) {
      console.log("Handover Create Error:", error?.response?.data?.message || error?.message);
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Something went wrong",
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredVehicles = (Array.isArray(vehicles) ? vehicles : []).filter(
    (vehicle) => {
      const search = vehicleSearch.toLowerCase();
      return (
        vehicle?.vehicleName?.toLowerCase().includes(search) ||
        vehicle?.vehicleNumber?.toLowerCase().includes(search) ||
        vehicle?.color?.toLowerCase().includes(search)
      );
    },
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#001B45" barStyle="light-content" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <LinearGradient colors={["#001B45", "#002B6B"]} style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.sideBtn}
            >
              <Ionicons name="chevron-back" size={26} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Car Handover</Text>
          </View>

          <View style={styles.headerSummary}>
            <View style={styles.headerSummaryItem}>
              <Text style={styles.headerSummaryLabel}>Total</Text>
              <Text style={styles.headerSummaryValue}>₹{totalAmount}</Text>
            </View>

            <View style={styles.headerSummaryDivider} />

            <View style={styles.headerSummaryItem}>
              <Text style={styles.headerSummaryLabel}>Service</Text>
              <Text
                style={[
                  styles.headerSummaryValue,
                  {
                    color: toNum(pickupDropCharge) > 0 ? "#FBBF24" : "#FFFFFF",
                  },
                ]}
              >
                ₹{pickupDropCharge || 0}
              </Text>
            </View>

            <View style={styles.headerSummaryDivider} />

            <View style={styles.headerSummaryItem}>
              <Text style={styles.headerSummaryLabel}>Balance</Text>
              <Text
                style={[
                  styles.headerSummaryValue,
                  { color: toNum(balanceAmount) > 0 ? "#FCA5A5" : "#86EFAC" },
                ]}
              >
                ₹{balanceAmount || 0}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            {/* ── Customer Details ── */}
            <SectionTitle title="Customer Details" />

            <View style={styles.row}>
              <InputField
                label="Customer Name"
                placeholder="Enter customer name"
                icon="person-outline"
                required
                value={customerName}
                onChangeText={setCustomerName}
                editable={false}
              />
              <InputField
                label="Contact No."
                placeholder="Enter contact number"
                icon="call-outline"
                required
                keyboardType="phone-pad"
                value={contactNumber}
                onChangeText={(text) =>
                  setContactNumber(text.replace(/[^0-9]/g, "").slice(0, 10))
                }
                editable={false}
              />
            </View>

            <View style={styles.row}>
              <InputField
                label="Alternate Contact No."
                placeholder="Enter alternate number"
                icon="call-outline"
                required
                keyboardType="phone-pad"
                value={alternateNumber}
                onChangeText={(text) =>
                  setAlternateNumber(text.replace(/[^0-9]/g, "").slice(0, 10))
                }
              />
              <InputField
                label="Occupation"
                placeholder="Enter occupation"
                icon="briefcase-outline"
                value={occupation}
                onChangeText={setOccupation}
              />
            </View>

            <InputField
              label="Destination"
              placeholder="Enter destination"
              icon="location-outline"
              required
              fullWidth
              value={destination}
              onChangeText={setDestination}
            />

            {/* ── ID Details ── */}
            <SectionTitle title="ID Details" />

            <View style={styles.row}>
              <InputField
                label="Aadhaar Number"
                placeholder="Enter Aadhaar Number"
                icon="card-outline"
                required
                keyboardType="numeric"
                value={aadhaarNumber}
                onChangeText={(text) =>
                  setAadhaarNumber(text.replace(/[^0-9]/g, "").slice(0, 12))
                }
              />

              <InputField
                label="Driving License No."
                placeholder="Enter License Number"
                icon="car-outline"
                required
                value={drivingLicenseNumber}
                onChangeText={setDrivingLicenseNumber}
              />
            </View>

            {/* ── Vehicle Details ── */}
            <SectionTitle title="Leased Vehicle Details" />

            <View style={styles.roleWrapper}>
              <Text style={styles.label}>
                Select Vehicle<Text style={styles.required}> *</Text>
              </Text>

              <TouchableOpacity
                style={[styles.inputBox, styles.inputBoxLocked]}
                activeOpacity={1}
                disabled
              >
                <Ionicons name="car-sport-outline" size={18} color="#94A3B8" />
                <Text
                  style={[
                    styles.placeholder,
                    selectedVehicle && { color: "#6366F1" },
                  ]}
                >
                  {selectedVehicle
                    ? `${selectedVehicle.vehicleName} • ${selectedVehicle.vehicleNumber}`
                    : "No vehicle selected"}
                </Text>
                <Ionicons name="lock-closed" size={14} color="#6366F1" />
              </TouchableOpacity>

              {selectedVehicle ? (
                <View
                  style={{
                    backgroundColor: "#ECFDF5",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: "#BBF7D0",
                  }}
                >
                  <Text style={{ fontWeight: "700", color: "#15803D" }}>
                    Vehicle Price : ₹{selectedVehicle.pricePerDay}/day
                  </Text>

                  <Text style={{ marginTop: 4, color: "#166534" }}>
                    {numberOfDays || 0} Day × ₹{selectedVehicle.pricePerDay} = ₹
                    {totalFare || 0}
                  </Text>
                </View>
              ) : null}

              {/* Vehicle Modal */}
              <Modal
                visible={showVehicleModal}
                animationType="slide"
                transparent={false}
              >
                <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: "#E5E7EB",
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 20,
                        fontWeight: "800",
                        color: "#111827",
                      }}
                    >
                      Select Vehicle
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setVehicleSearch("");
                        setShowVehicleModal(false);
                      }}
                    >
                      <Ionicons name="close" size={28} color="#111827" />
                    </TouchableOpacity>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: "#F1F5F9",
                        borderRadius: 14,
                        paddingHorizontal: 14,
                        height: 52,
                      }}
                    >
                      <Ionicons name="search" size={20} color="#64748B" />
                      <TextInput
                        placeholder="Search by name, number or color..."
                        placeholderTextColor="#94A3B8"
                        value={vehicleSearch}
                        onChangeText={setVehicleSearch}
                        style={{
                          flex: 1,
                          marginLeft: 10,
                          fontSize: 15,
                          color: "#111827",
                        }}
                      />
                      {vehicleSearch.length > 0 && (
                        <TouchableOpacity onPress={() => setVehicleSearch("")}>
                          <Ionicons
                            name="close-circle"
                            size={20}
                            color="#94A3B8"
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                    <Text
                      style={{
                        color: "#64748B",
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {filteredVehicles.length} Vehicle(s) Found
                    </Text>
                  </View>

                  {vehicleLoading ? (
                    <View
                      style={{
                        flex: 1,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <ActivityIndicator size="large" />
                    </View>
                  ) : (
                    <ScrollView
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ paddingBottom: 30 }}
                    >
                      {filteredVehicles.length === 0 ? (
                        <View style={{ alignItems: "center", marginTop: 80 }}>
                          <Ionicons
                            name="car-outline"
                            size={60}
                            color="#CBD5E1"
                          />
                          <Text
                            style={{
                              marginTop: 12,
                              fontSize: 16,
                              fontWeight: "700",
                              color: "#475569",
                            }}
                          >
                            No Vehicle Found
                          </Text>
                          <Text style={{ marginTop: 4, color: "#94A3B8" }}>
                            Try another search keyword
                          </Text>
                        </View>
                      ) : (
                        filteredVehicles.map((vehicle) => (
                          <TouchableOpacity
                            key={vehicle._id}
                            activeOpacity={0.8}
                            style={{
                              backgroundColor: "#FFFFFF",
                              marginHorizontal: 16,
                              marginTop: 12,
                              padding: 16,
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor:
                                selectedVehicle?._id === vehicle._id
                                  ? "#2563EB"
                                  : "#E5E7EB",
                            }}
                            onPress={() => {
                              setSelectedVehicle(vehicle);
                              if (vehicle.currentKm) {
                                setHandoverKm(String(vehicle.currentKm));
                              }
                              setVehicleSearch("");
                              setShowVehicleModal(false);
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                              }}
                            >
                              <View
                                style={{
                                  width: 50,
                                  height: 50,
                                  borderRadius: 12,
                                  backgroundColor: "#EFF6FF",
                                  justifyContent: "center",
                                  alignItems: "center",
                                }}
                              >
                                <Ionicons
                                  name="car-sport"
                                  size={26}
                                  color="#2563EB"
                                />
                              </View>
                              <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text
                                  style={{
                                    fontSize: 16,
                                    fontWeight: "700",
                                    color: "#111827",
                                  }}
                                >
                                  {vehicle.vehicleName}
                                </Text>
                                <Text
                                  style={{ color: "#64748B", marginTop: 4 }}
                                >
                                  {vehicle.vehicleNumber}
                                  {"  "}
                                  <Text
                                    style={{
                                      color: "#16A34A",
                                      fontWeight: "700",
                                    }}
                                  >
                                    ₹{vehicle.pricePerDay}/day
                                  </Text>
                                </Text>
                                <Text
                                  style={{ color: "#94A3B8", marginTop: 2 }}
                                >
                                  Color: {vehicle.color}
                                </Text>
                              </View>
                              <Ionicons
                                name="chevron-forward"
                                size={20}
                                color="#94A3B8"
                              />
                            </View>
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>
                  )}
                </SafeAreaView>
              </Modal>
            </View>

            {/* ── Trip Schedule ── */}
            <SectionTitle
              title="Trip Schedule"
              subtitle={
                tripType === "outstation"
                  ? "8 AM → 8 AM"
                  : tripType === "local"
                    ? "Same time next day(s)"
                    : null
              }
            />

            <View style={styles.row}>
              <InputField
                label="No. of Days"
                placeholder="Enter total days"
                icon="calendar-number-outline"
                required
                value={numberOfDays}
                onChangeText={(text) =>
                  setNumberOfDays(text.replace(/[^0-9]/g, ""))
                }
                keyboardType="numeric"
                editable={false}
                hint={
                  numberOfDays
                    ? `Return: ${numberOfDays} day(s) from pickup`
                    : null
                }
              />
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Trip Type</Text>
                <View style={styles.pickerBox}>
                  <Picker
                    selectedValue={tripType}
                    onValueChange={(value) => setTripType(value)}
                  >
                    <Picker.Item label="Select Trip Type" value="" />
                    <Picker.Item label="Local" value="local" />
                    <Picker.Item label="Outstation" value="outstation" />
                  </Picker>
                </View>
              </View>
            </View>

            <View style={styles.row}>
              {/* Pickup Date — auto-filled with today, freely editable */}
              <SelectField
                label="Pick Up Date"
                placeholder="Select date"
                icon="calendar-outline"
                required
                value={formatDate(pickupDate)}
                onPress={() => openPicker("date", "pickupDate")}
                hint="Auto-set to today (tap to change)"
              />
              {/* Pickup Time — auto-filled with now, freely editable */}
              <SelectField
                label="Pick Up Time"
                placeholder="Select time"
                icon="time-outline"
                required
                value={formatTime(pickupTime)}
                locked
                hint="Automatically set to the current time"
              />
            </View>

            <View style={styles.row}>
              {/* Drop Date — auto-calculated, editable for manual override */}
              <SelectField
                label="Drop Date"
                placeholder={
                  numberOfDays ? "Auto-calculated" : "Enter days first"
                }
                icon="calendar-outline"
                required
                value={formatDate(dropDate)}
                onPress={() => openPicker("date", "dropDate")}
                hint={
                  isDropDateEdited
                    ? "Manually adjusted"
                    : getDropDateHint() || "Auto-calculated (editable)"
                }
              />
              {/* Drop Time — auto-calculated, editable */}
              <SelectField
                label="Drop Time"
                placeholder="Select time"
                icon="time-outline"
                required
                value={formatTime(dropTime)}
                onPress={() => openPicker("time", "dropTime")}
                hint={
                  isDropTimeEdited
                    ? "Manually adjusted"
                    : "Auto-calculated (editable)"
                }
              />
            </View>

            {/* ── Additional Details ── */}
            <SectionTitle title="Additional Details" />

            <View style={styles.inputContainer}>
              <InputField
                label="Total KM at Handover"
                placeholder="Enter current odometer reading"
                icon="speedometer-outline"
                required
                keyboardType="numeric"
                value={handoverKm}
                onChangeText={(text) =>
                  setHandoverKm(text.replace(/[^0-9]/g, ""))
                }
              />
              <Text style={styles.label}>
                Fuel Level<Text style={styles.required}> *</Text>
              </Text>

              <View
                style={[
                  styles.pickerBox,
                  styles.fuelPickerBox,
                  {
                    borderColor:
                      fuelLevel <= 2
                        ? "#FCA5A5"
                        : fuelLevel <= 5
                          ? "#FCD34D"
                          : "#86EFAC",
                  },
                ]}
              >
                <Ionicons
                  name="speedometer-outline"
                  size={18}
                  color={
                    fuelLevel <= 2
                      ? "#EF4444"
                      : fuelLevel <= 5
                        ? "#F59E0B"
                        : "#22C55E"
                  }
                  style={{ marginLeft: 12 }}
                />
                <Picker
                  selectedValue={fuelLevel}
                  onValueChange={(value) => setFuelLevel(value)}
                  style={{ flex: 1 }}
                >
                  {fuelOptions.map((item) => (
                    <Picker.Item
                      key={item.value}
                      label={item.label}
                      value={item.value}
                    />
                  ))}
                </Picker>
              </View>
            </View>

            {/* ── Spare & Toolkit Check (highlighted section) ── */}
            <View style={styles.highlightSection}>
              <View style={styles.highlightHeaderRow}>
                <Ionicons name="construct-outline" size={18} color="#B45309" />
                <Text style={styles.highlightTitle}>Spare & Toolkit Check</Text>
              </View>

              <RadioField
                label="Is spare tyre available?"
                required
                value={spareAvailable}
                onChange={setSpareAvailable}
              />

              <RadioField
                label="Is toolkit available?"
                required
                value={toolkitAvailable}
                onChange={setToolkitAvailable}
              />
            </View>

            <SectionTitle title="Payments Details" />

            <View style={styles.row}>
              <InputField
                label="Total Fare (₹)"
                placeholder="Auto Calculated"
                icon="cash-outline"
                required
                keyboardType="numeric"
                value={totalFare}
                editable={false}
              />

              <InputField
                label="Fastag Payable (₹)"
                placeholder="Enter amount"
                icon="card-outline"
                required
                keyboardType="numeric"
                value={fastTagPayable}
                onChangeText={setFastTagPayable}
              />
            </View>

            <View style={styles.row}>
              <InputField
                label="Security Amount (₹)"
                placeholder="Enter amount"
                icon="shield-checkmark-outline"
                keyboardType="numeric"
                value={securityDeposit}
                onChangeText={setSecurityDeposit}
              />

              <InputField
                label="Extra Charges (₹)"
                placeholder="Enter amount"
                icon="add-circle-outline"
                keyboardType="numeric"
                value={extraCharges}
                onChangeText={setExtraCharges}
              />
            </View>

            <InputField
              label="Discount Amount (₹)"
              placeholder="Enter discount amount"
              icon="pricetag-outline"
              keyboardType="numeric"
              value={discountAmount}
              onChangeText={setDiscountAmount}
              editable={false}
              hint={
                toNum(discountAmount) > 0
                  ? "Deducted from the balance due, not the total amount"
                  : null
              }
            />

            <View style={styles.row}>
              <InputField
                label="Booking Amount Paid (₹)"
                placeholder="Enter amount"
                icon="wallet-outline"
                required
                keyboardType="numeric"
                value={bookingAmountPaid}
                onChangeText={setBookingAmountPaid}
                editable={false}
              />

              <InputField
                label="Amount Received Now (₹)"
                placeholder="Enter amount"
                icon="cash-outline"
                required
                keyboardType="numeric"
                value={amountReceived}
                onChangeText={setAmountReceived}
                editable={paymentMethod !== "mixed"}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>
                Payment Method<Text style={styles.required}> *</Text>
              </Text>

              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={paymentMethod}
                  onValueChange={setPaymentMethod}
                >
                  <Picker.Item label="Select Payment Method" value="" />
                  <Picker.Item label="Cash" value="cash" />
                  <Picker.Item label="PhonePe" value="phonepe" />
                  <Picker.Item label="Razorpay" value="razorpay" />
                  <Picker.Item label="Mixed" value="mixed" />
                </Picker>
              </View>
            </View>

            {paymentMethod === "mixed" ? (
              <View style={styles.row}>
                <InputField
                  label="Cash (₹)"
                  placeholder="0"
                  icon="cash-outline"
                  keyboardType="numeric"
                  value={cashAmount}
                  onChangeText={setCashAmount}
                />
                <InputField
                  label="PhonePe (₹)"
                  placeholder="0"
                  icon="phone-portrait-outline"
                  keyboardType="numeric"
                  value={phonePeAmount}
                  onChangeText={setPhonePeAmount}
                />
              </View>
            ) : null}

            {paymentMethod === "mixed" ? (
              <InputField
                label="Razorpay (₹)"
                placeholder="0"
                icon="card-outline"
                keyboardType="numeric"
                value={razorpayAmount}
                onChangeText={setRazorpayAmount}
              />
            ) : null}

            {/* ── UPI Last 4 Digits — supports multiple entries ── */}
            {paymentMethod === "phonepe" || paymentMethod === "mixed" ? (
              <View style={styles.inputContainer}>
                <Text style={styles.label}>UPI Last 4 Digits</Text>

                {upiLast4List.map((val, index) => {
                  const isLast = index === upiLast4List.length - 1;
                  return (
                    <View key={index} style={styles.upiRow}>
                      <View style={[styles.inputBox, { flex: 1 }]}>
                        <Ionicons
                          name="phone-portrait-outline"
                          size={18}
                          color="#64748B"
                        />
                        <TextInput
                          placeholder={
                            upiLast4List.length > 1
                              ? `UPI ref ${index + 1} - last 4 digits`
                              : "Enter last 4 digits"
                          }
                          placeholderTextColor="#94A3B8"
                          style={styles.input}
                          keyboardType="numeric"
                          maxLength={4}
                          value={val}
                          onChangeText={(text) => updateUpiLast4(index, text)}
                        />
                      </View>

                      {upiLast4List.length > 1 && (
                        <TouchableOpacity
                          style={styles.upiIconBtn}
                          onPress={() => removeUpiLast4Field(index)}
                        >
                          <Ionicons
                            name="remove-circle-outline"
                            size={26}
                            color="#EF4444"
                          />
                        </TouchableOpacity>
                      )}

                      {isLast && (
                        <TouchableOpacity
                          style={styles.upiIconBtn}
                          onPress={addUpiLast4Field}
                        >
                          <Ionicons
                            name="add-circle-outline"
                            size={26}
                            color="#2563EB"
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : null}

            <InputField
              label="Notes (Optional)"
              placeholder="Enter notes"
              icon="document-text-outline"
              multiline
              fullWidth
              value={notes}
              onChangeText={setNotes}
            />

            <Text style={styles.counter}>{notes.length}/200</Text>

            {/* ── Bill Summary / Invoice (Zomato-style expandable bill) ── */}
            <View style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.billSummaryHeaderRow}
                onPress={() => setShowBillSummary((prev) => !prev)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Bill Summary</Text>
                  {!showBillSummary && (
                    <Text style={styles.billSummarySubtext}>
                      Tap to view full bill
                    </Text>
                  )}
                </View>

                <Text style={styles.billSummaryHeaderAmount}>
                  ₹{totalAmount.toLocaleString()}
                </Text>
                <Ionicons
                  name={showBillSummary ? "chevron-up" : "chevron-down"}
                  size={20}
                  color="#64748B"
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>

              {showBillSummary && (
                <View style={styles.invoiceBox}>
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>
                      Total Fare
                      {selectedVehicle && numberOfDays
                        ? ` (₹${toNum(
                            selectedVehicle.pricePerDay,
                          ).toLocaleString()} × ${numberOfDays} day${
                            toNum(numberOfDays) > 1 ? "s" : ""
                          })`
                        : ""}
                    </Text>
                    <Text style={styles.invoiceValue}>
                      ₹{toNum(totalFare).toLocaleString()}
                    </Text>
                  </View>

                  {toNum(fastTagPayable) > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>FASTag Payable</Text>
                      <Text style={styles.invoiceValue}>
                        ₹{toNum(fastTagPayable).toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {toNum(pickupDropCharge) > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>
                        Pickup & Drop Charge
                      </Text>
                      <Text style={styles.invoiceValue}>
                        ₹{toNum(pickupDropCharge).toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {toNum(securityDeposit) > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>Security Deposit</Text>
                      <Text style={styles.invoiceValue}>
                        ₹{toNum(securityDeposit).toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {toNum(extraCharges) > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>Extra Charges</Text>
                      <Text style={styles.invoiceValue}>
                        ₹{toNum(extraCharges).toLocaleString()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.invoiceDivider} />

                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceGrandLabel}>Total Amount</Text>
                    <Text style={styles.invoiceGrandValue}>
                      ₹{totalAmount.toLocaleString()}
                    </Text>
                  </View>

                  {toNum(bookingAmountPaid) > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>Advance Paid</Text>
                      <Text style={[styles.invoiceValue, { color: "#16A34A" }]}>
                        − ₹{toNum(bookingAmountPaid).toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {toNum(discountAmount) > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>Discount</Text>
                      <Text style={[styles.invoiceValue, { color: "#16A34A" }]}>
                        − ₹{toNum(discountAmount).toLocaleString()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceBalanceLabel}>
                      {toNum(balanceAmount) > 0 ? "Balance Due" : "Fully Paid"}
                    </Text>
                    <Text
                      style={[
                        styles.invoiceBalanceValue,
                        {
                          color:
                            toNum(balanceAmount) > 0 ? "#B45309" : "#16A34A",
                        },
                      ]}
                    >
                      ₹{toNum(balanceAmount).toLocaleString()}
                    </Text>
                  </View>

                  {receivedNow > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>Received Now</Text>
                      <Text style={styles.invoiceValue}>
                        ₹{receivedNow.toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {totalCollectedNow > 0 && (
                    <>
                      <View style={styles.invoiceDivider} />
                      <View style={styles.invoiceRow}>
                        <Text style={styles.invoiceTotalLabel}>
                          Total Collected Today
                        </Text>
                        <Text style={styles.invoiceTotalValue}>
                          ₹{totalCollectedNow.toLocaleString()}
                        </Text>
                      </View>
                    </>
                  )}

                  <TouchableOpacity
                    style={styles.billSummaryCloseButton}
                    onPress={() => setShowBillSummary(false)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chevron-up" size={16} color="#2563EB" />
                    <Text style={styles.billSummaryCloseText}>Close bill</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.bottomButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => router.back()}
                disabled={loading}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveNext}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#111827" />
                ) : (
                  <Text style={styles.saveText}>Save & Next</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* ── Date/Time Picker ── */}
        {showPicker &&
          (Platform.OS === "ios" ? (
            <Modal
              transparent
              animationType="slide"
              visible={showPicker}
              onRequestClose={closePicker}
            >
              <TouchableOpacity
                style={styles.pickerOverlay}
                activeOpacity={1}
                onPress={closePicker}
              >
                <TouchableOpacity activeOpacity={1} style={styles.pickerSheet}>
                  <View style={styles.pickerHeader}>
                    <TouchableOpacity onPress={closePicker}>
                      <Text style={styles.pickerCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={closePicker}>
                      <Text style={styles.pickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={getPickerValue()}
                    mode={pickerMode}
                    display="spinner"
                    onValueChange={onDateChange}
                    onDismiss={() => onDateChange({type: "dismissed"})}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          ) : (
            <DateTimePicker
              value={getPickerValue()}
              mode={pickerMode}
              display="default"
              onValueChange={onDateChange}
              onDismiss={() => onDateChange({type: "dismissed"})}
            />
          ))}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ==========================================
// 5. EXPORTED SCREEN (wrapped in error boundary)
// ==========================================

export default function NewBookingScreen() {
  const router = useRouter();
  return (
    <ScreenErrorBoundary onGoBack={() => router.back()}>
      <NewBookingScreenInner />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    paddingTop: Platform.OS === "android" ? 42 : 14,
    paddingBottom: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  sideBtn: {
    width: 32,
    alignItems: "flex-start",
  },
  headerTitle: {
    color: "white",
    fontSize: 17,
    fontWeight: "800",
    marginLeft: 2,
  },
  headerSummary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  headerSummaryItem: {
    alignItems: "flex-end",
    paddingHorizontal: 6,
  },
  headerSummaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginHorizontal: 2,
  },
  headerSummaryLabel: {
    fontSize: 9.5,
    color: "#93A5D1",
    fontWeight: "700",
  },
  headerSummaryValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 1,
  },
  form: {
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#6366F1",
    fontWeight: "600",
    marginTop: 2,
  },
  yellowLine: {
    width: 30,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#FFC107",
    marginTop: 6,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  inputContainer: {
    flex: 1,
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 7,
  },
  required: {
    color: "#EF4444",
  },
  inputBox: {
    height: 52,
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  inputBoxDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  inputBoxLocked: {
    backgroundColor: "#F5F3FF",
    borderColor: "#C4B5FD",
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#111827",
  },
  placeholder: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#94A3B8",
  },
  pickerBox: {
    height: 52,
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    overflow: "hidden",
  },
  notesBox: {
    height: 100,
    alignItems: "flex-start",
    paddingTop: 14,
  },
  notesInput: {
    textAlignVertical: "top",
  },
  counter: {
    textAlign: "right",
    fontSize: 12,
    color: "#94A3B8",
    marginTop: -4,
    marginBottom: 16,
  },
  bottomButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: "#002B6B",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  cancelText: {
    color: "#002B6B",
    fontSize: 15,
    fontWeight: "700",
  },
  saveBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#FFC107",
    justifyContent: "center",
    alignItems: "center",
  },
  saveText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800",
  },
  roleWrapper: {
    position: "relative",
    marginBottom: 12,
    zIndex: 9999,
  },
  hintText: {
    fontSize: 11,
    color: "#F59E0B",
    fontWeight: "600",
    marginTop: 4,
    marginLeft: 2,
  },
  fuelPickerBox: {
    flexDirection: "row",
    alignItems: "center",
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: "white",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 20,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  pickerCancel: {
    color: "#64748B",
    fontWeight: "600",
    fontSize: 15,
  },
  pickerDone: {
    color: "#2563EB",
    fontWeight: "800",
    fontSize: 15,
  },

  // ── Spare & Toolkit Check (highlighted section) ──
  highlightSection: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1.5,
    borderColor: "#FDE68A",
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    marginBottom: 6,
  },
  highlightHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  highlightTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#92400E",
  },
  radioFieldContainer: {
    marginBottom: 12,
  },
  radioQuestionLabel: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#78350F",
    marginBottom: 8,
  },
  radioOptionsRow: {
    flexDirection: "row",
    gap: 20,
  },
  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#D97706",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  radioCircleSelected: {
    borderColor: "#D97706",
    backgroundColor: "#FFFFFF",
  },
  radioCircleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#D97706",
  },
  radioOptionText: {
    fontSize: 14,
    color: "#78350F",
    fontWeight: "600",
  },
  radioOptionTextSelected: {
    color: "#92400E",
    fontWeight: "800",
  },

  // ── UPI Last 4 Digits (multi-entry row with add/remove icons) ──
  upiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  upiIconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Bill Summary / Invoice (Zomato-style) ──
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  billSummaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  billSummarySubtext: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  billSummaryHeaderAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#16A34A",
  },
  invoiceBox: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 12,
  },
  invoiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 12,
  },
  invoiceLabel: {
    flex: 1,
    fontSize: 13,
    color: "#475569",
  },
  invoiceValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
  },
  invoiceDivider: {
    borderStyle: "dashed",
    borderWidth: 0.75,
    borderColor: "#CBD5E1",
    marginVertical: 8,
  },
  invoiceTotalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  invoiceTotalValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  invoiceGrandLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  invoiceGrandValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#16A34A",
  },
  invoiceBalanceLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#B45309",
  },
  invoiceBalanceValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#B45309",
  },
  billSummaryCloseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 6,
    paddingVertical: 8,
  },
  billSummaryCloseText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
});
