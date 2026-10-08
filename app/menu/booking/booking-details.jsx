import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../../../services/api";
import useAuthStore from "../../../store/authStore";

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

// Same options as the Create Booking screen
const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "phonepe", label: "PhonePe" },
  { value: "razorpay", label: "Razorpay" },
];

// Format a Date's *local* wall-clock day as "DD-MMM-YYYY" with no Intl
// involvement at all, so there's no risk of locale-specific separators.
const formatLocalDate = (date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

export default function BookingDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { token } = useAuthStore();

  // Screen Loading & Refresh states
  const [screenLoading, setScreenLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [booking, setBooking] = useState(null);

  const [loadingUpdate, setLoadingUpdate] = useState(false);
  const [loadingCancel, setLoadingCancel] = useState(false);

  const [bookingStatus, setBookingStatus] = useState("");

  // Form Field States
  const [customerName, setCustomerName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [altNumber, setAltNumber] = useState("");
  const [destination, setDestination] = useState("");
  const [occupation, setOccupation] = useState("");
  const [aadharCard, setAadharCard] = useState("");
  const [dlNumber, setDlNumber] = useState("");
  const [discount, setDiscount] = useState("");
  const [sawariCashUsed, setSawariCashUsed] = useState("");
  const [bookingAmount, setBookingAmount] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  const [fastagBalance, setFastagBalance] = useState("");

  // Payment Method (same as Create Booking)
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [upiLast4, setUpiLast4] = useState("");

  // SCHEDULE STATES
  // pickupDate/dropDate are DISPLAY-ONLY strings ("DD-MMM-YYYY"), always
  // derived from pickupDateObj/dropDateObj — never parsed back into a Date.
  const [pickupDate, setPickupDate] = useState("");
  const [dropDate, setDropDate] = useState("");
  const [pickupDateObj, setPickupDateObj] = useState(null);
  const [dropDateObj, setDropDateObj] = useState(null);
  const [pickupTime, setPickupTime] = useState("08:00 AM");
  const [dropTime, setDropTime] = useState("08:00 AM");

  // Native Picker Control States
  const [pickerMode, setPickerMode] = useState("date");
  const [currentPickerTarget, setCurrentPickerTarget] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerDateValue, setPickerDateValue] = useState(new Date());

  const [vehicleInfo, setVehicleInfo] = useState({
    model: "",
    plateNumber: "",
  });

  const [vehicles, setVehicles] = useState([]);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleSearch, setVehicleSearch] = useState("");

  const [needPickupDrop, setNeedPickupDrop] = useState(false);
  const [serviceType, setServiceType] = useState("pickup_drop"); // pickup | drop | pickup_drop

  const [pickupLocation, setPickupLocation] = useState("");
  const [pickupLandmark, setPickupLandmark] = useState("");
  const [pickupMapLink, setPickupMapLink] = useState("");
  const [pickupCharge, setPickupCharge] = useState("");

  const [dropLocation, setDropLocation] = useState("");
  const [dropLandmark, setDropLandmark] = useState("");
  const [dropMapLink, setDropMapLink] = useState("");
  const [dropCharge, setDropCharge] = useState("");

  const [pickupDropNotes, setPickupDropNotes] = useState("");

  // Bill Summary (collapsed by default)
  const [showBillSummary, setShowBillSummary] = useState(false);

  const filteredVehicles = vehicles.filter((vehicle) => {
    const search = vehicleSearch.toLowerCase();
    return (
      vehicle?.vehicleName?.toLowerCase().includes(search) ||
      vehicle?.vehicleNumber?.toLowerCase().includes(search) ||
      vehicle?.color?.toLowerCase().includes(search)
    );
  });

  const getISTDateParts = (date) => {
    if (!date) return null;
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(new Date(date));

    const day = Number(parts.find((p) => p.type === "day")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value); // 1-12
    const year = Number(parts.find((p) => p.type === "year")?.value);

    if (!day || !month || !year) return null;
    return { day, month: month - 1, year };
  };

  // Local-midnight Date from IST calendar parts (safe for day-diff math)
  const dateFromParts = (parts) =>
    parts ? new Date(parts.year, parts.month, parts.day) : null;

  // Date object → "YYYY-MM-DD"
  const formatToBackendDate = (dateObj) => {
    if (!dateObj) return "";
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Calendar-day difference between two Date objects (minimum 1)
  const calculateTotalDays = (startObj, endObj) => {
    if (!startObj || !endObj) return 1;

    const start = new Date(
      startObj.getFullYear(),
      startObj.getMonth(),
      startObj.getDate(),
    );
    const end = new Date(
      endObj.getFullYear(),
      endObj.getMonth(),
      endObj.getDate(),
    );

    const diffDays = Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );

    return diffDays < 1 ? 1 : diffDays;
  };

  const totalDays = useMemo(
    () => calculateTotalDays(pickupDateObj, dropDateObj),
    [pickupDateObj, dropDateObj],
  );

  // Main Initializer Function
  const initializeScreenData = useCallback(
    async (refresh = false) => {
      if (!token || !id) return;

      if (refresh) setRefreshing(true);
      else setScreenLoading(true);

      try {
        const [vehicleRes, bookingRes] = await Promise.all([
          api.get("/vehicles/getAll", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          api.get(`/leads/booking-details/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        setVehicles(vehicleRes.data.data || []);

        const data = bookingRes?.data?.booking;
        if (!data) throw new Error("Booking not found");

        setBooking(data);
        setBookingStatus(data.status);

        setCustomerName(data.customerName || "");
        setMobileNumber(data.mobileNumber || "");
        setAltNumber(data.alternateMobileNumber || "");
        setOccupation(data.occupation || "");
        setDestination(data.destination || "");
        setAadharCard(data.aadhaarNumber || "");
        setDlNumber(data.drivingLicenseNumber || "");

        // Pricing fields live under the nested `payment` object
        setBookingAmount(String(data.payment?.bookingAmountPaid || ""));
        setDiscount(String(data.payment?.discountAmount || ""));
        setSawariCashUsed(String(data.payment?.sawariCashUsed || ""));
        setSecurityDeposit(String(data.payment?.securityDeposit || ""));
        setFastagBalance(String(data.payment?.fastagAmount || ""));

        // Payment method (+ UPI last 4 for PhonePe)
        const method = data.payment?.paymentMethod || "cash";
        setPaymentMethod(
          PAYMENT_METHODS.some((m) => m.value === method) ? method : "cash",
        );
        setUpiLast4(String(data.payment?.upiLast4 || data.upiLast4 || ""));

        setNeedPickupDrop(data.pickupDropRequired || false);
        setServiceType(data.serviceType || "pickup_drop");

        setPickupLocation(data.pickup?.location || "");
        setPickupLandmark(data.pickup?.landmark || "");
        setPickupMapLink(data.pickup?.mapLink || "");
        setPickupCharge(String(data.pickup?.charge || ""));

        setDropLocation(data.drop?.location || "");
        setDropLandmark(data.drop?.landmark || "");
        setDropMapLink(data.drop?.mapLink || "");
        setDropCharge(String(data.drop?.charge || ""));

        setPickupDropNotes(data.pickupDropNotes || "");

        const pickupObj = dateFromParts(getISTDateParts(data.fromDate));
        const dropObj = dateFromParts(getISTDateParts(data.toDate));

        setPickupDate(pickupObj ? formatLocalDate(pickupObj) : "");
        setDropDate(dropObj ? formatLocalDate(dropObj) : "");
        setPickupDateObj(pickupObj);
        setDropDateObj(dropObj);

        setPickupTime(data.pickupTime || "08:00 AM");
        setDropTime(data.dropTime || "08:00 AM");

        if (data.vehicleId) {
          setSelectedVehicle(data.vehicleId);
          setVehicleInfo({
            model: data.vehicleId.vehicleName,
            plateNumber: data.vehicleId.vehicleNumber,
          });
        }
      } catch (err) {
        console.log("BOOKING ERROR:", err.response?.status, err.message);
        Alert.alert(
          "Error",
          err.response?.data?.message || err.message || "Something went wrong",
        );
      } finally {
        setRefreshing(false);
        setScreenLoading(false);
      }
    },
    [id, token],
  );

  useEffect(() => {
    initializeScreenData();
  }, [initializeScreenData]);

  const openMapLink = async (url) => {
    if (!url || !url.trim()) {
      alert("Add a Google Maps link first");
      return;
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      Linking.openURL(url);
    } else {
      alert("That doesn't look like a valid link");
    }
  };

  // Parses "08:00 AM" style strings into {hours, minutes}
  const parseTimeToHM = (timeStr) => {
    const match = (timeStr || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return { hours: 8, minutes: 0 };
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return { hours, minutes };
  };

  const openPicker = (type, target) => {
    if (bookingStatus === "cancelled") return;

    setPickerMode(type);
    setCurrentPickerTarget(target);

    let initialDate = new Date();
    if (type === "date") {
      const targetVal = target === "pickupDate" ? pickupDateObj : dropDateObj;
      initialDate = targetVal ? new Date(targetVal) : new Date();
    } else {
      const { hours, minutes } = parseTimeToHM(
        target === "pickupTime" ? pickupTime : dropTime,
      );
      initialDate.setHours(hours, minutes, 0, 0);
    }

    setPickerDateValue(initialDate);
    setShowPicker(true);
  };

  const onPickerChange = (event, selectedDate) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }

    if (!selectedDate) return;

    setPickerDateValue(selectedDate);

    if (pickerMode === "date") {
      const formattedDate = formatLocalDate(selectedDate);
      const normalizedObj = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
      );

      if (currentPickerTarget === "pickupDate") {
        setPickupDate(formattedDate);
        setPickupDateObj(normalizedObj);
      }

      if (currentPickerTarget === "dropDate") {
        if (
          pickupDateObj &&
          normalizedObj.getTime() < pickupDateObj.getTime()
        ) {
          alert("Drop date cannot be before pickup date");
          return;
        }
        setDropDate(formattedDate);
        setDropDateObj(normalizedObj);
      }
    } else {
      let hours = selectedDate.getHours();
      const minutes = String(selectedDate.getMinutes()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      const formattedTime = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;

      if (currentPickerTarget === "pickupTime") setPickupTime(formattedTime);
      if (currentPickerTarget === "dropTime") setDropTime(formattedTime);
    }
  };

  const handleUpdateBooking = async () => {
    if (!customerName.trim()) return alert("Customer name is required");
    if (!mobileNumber.trim()) return alert("Mobile number is required");
    if (!selectedVehicle) return alert("Please select a vehicle");
    if (!pickupDateObj || !dropDateObj) {
      return alert("Pickup and drop dates are required");
    }
    if (dropDateObj.getTime() < pickupDateObj.getTime()) {
      return alert("Drop date cannot be before pickup date");
    }
    if (paymentMethod === "phonepe" && upiLast4 && upiLast4.length !== 4) {
      return alert("UPI last 4 digits must be exactly 4 numbers");
    }

    setLoadingUpdate(true);

    try {
      const vehicleRent = Number(selectedVehicle?.pricePerDay || 0) * totalDays;

      const appliedPickupCharge =
        needPickupDrop &&
        (serviceType === "pickup" || serviceType === "pickup_drop")
          ? Number(pickupCharge || 0)
          : 0;

      const appliedDropCharge =
        needPickupDrop &&
        (serviceType === "drop" || serviceType === "pickup_drop")
          ? Number(dropCharge || 0)
          : 0;

      const fastagAmount = Number(fastagBalance || 0);

      const totalAmount =
        vehicleRent + appliedPickupCharge + appliedDropCharge + fastagAmount;

      const finalUpiLast4 = paymentMethod === "phonepe" ? upiLast4 : "";

      const payload = {
        customerName,
        mobileNumber,
        alternateMobileNumber: altNumber,
        occupation,
        destination,
        aadhaarNumber: aadharCard,
        drivingLicenseNumber: dlNumber,

        vehicleId: selectedVehicle._id,
        vehicleName: selectedVehicle.vehicleName,

        tripType: "local",

        fromDate: formatToBackendDate(pickupDateObj),
        toDate: formatToBackendDate(dropDateObj),
        pickupTime,
        dropTime,
        totalDays,

        pickupDropRequired: needPickupDrop,
        serviceType,

        pickup: {
          location: pickupLocation,
          landmark: pickupLandmark,
          mapLink: pickupMapLink,
          charge: Number(pickupCharge || 0),
        },
        drop: {
          location: dropLocation,
          landmark: dropLandmark,
          mapLink: dropMapLink,
          charge: Number(dropCharge || 0),
        },

        pickupDropNotes,

        // Also sent at top level, same as the Create Booking payload
        paymentMethod,
        upiLast4: finalUpiLast4,

        payment: {
          vehicleRent,
          pickupCharge: appliedPickupCharge,
          dropCharge: appliedDropCharge,
          fastagAmount,
          totalAmount,
          discountAmount: Number(discount || 0),
          sawariCashUsed: Number(sawariCashUsed || 0),
          securityDeposit: Number(securityDeposit || 0),
          bookingAmountPaid: Number(bookingAmount || 0),
          paymentMethod,
          upiLast4: finalUpiLast4,
        },
      };

      await api.put(`/leads/booking-update/${id}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      alert("Booking updated successfully.");
      initializeScreenData(true);
    } catch (err) {
      console.log("Booking error:", err?.message);
      alert(err.response?.data?.message || "Unable to update booking");
    } finally {
      setLoadingUpdate(false);
    }
  };

  const cancelBooking = async () => {
    setLoadingCancel(true);
    try {
      await api.put(
        `/leads/${id}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      Alert.alert("Success", "Booking cancelled successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      console.log("Cancel Error:", err?.message);
      Alert.alert(
        "Error",
        err.response?.data?.message || "Unable to cancel booking.",
      );
    } finally {
      setLoadingCancel(false);
    }
  };

  if (screenLoading) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Fetching booking details...</Text>
      </SafeAreaView>
    );
  }

  const vehicleAmount = Number(selectedVehicle?.pricePerDay || 0) * totalDays;

  const pickupAmount =
    needPickupDrop &&
    (serviceType === "pickup" || serviceType === "pickup_drop")
      ? Number(pickupCharge || 0)
      : 0;

  const dropAmount =
    needPickupDrop && (serviceType === "drop" || serviceType === "pickup_drop")
      ? Number(dropCharge || 0)
      : 0;

  const serviceAmount = pickupAmount + dropAmount;
  const fastagAmount = Number(fastagBalance || 0);
  const rentalAmount = vehicleAmount + serviceAmount + fastagAmount;

  const discountAmount = Number(discount || 0);
  const sawariCashAmount = Number(sawariCashUsed || 0);
  const bookingAdvance = Number(bookingAmount || 0);
  const securityAmount = Number(securityDeposit || 0);

  const finalAmount = Math.max(rentalAmount, 0);
  const balanceAmount = Math.max(
    finalAmount - bookingAdvance - discountAmount - sawariCashAmount,
    0,
  );
  const totalCollected = bookingAdvance + securityAmount;

  const editable = bookingStatus !== "cancelled";

  const paymentLabel =
    PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label || "Cash";

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.customNavigationBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>

        <View style={{ alignItems: "center" }}>
          <Text style={styles.navBarTitle}>Booking Details</Text>
          {selectedVehicle && (
            <>
              <Text style={styles.headerAmount}>
                ₹{finalAmount.toLocaleString()}
              </Text>
              <Text style={styles.headerSub}>
                Advance ₹{bookingAdvance.toLocaleString()} • Due ₹
                {balanceAmount.toLocaleString()}
              </Text>
            </>
          )}
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor:
                  bookingStatus === "confirmed"
                    ? "#DCFCE7"
                    : bookingStatus === "cancelled"
                      ? "#FEE2E2"
                      : "#DBEAFE",
              },
            ]}
          >
            <Text
              style={[
                styles.statusPillText,
                {
                  color:
                    bookingStatus === "confirmed"
                      ? "#166534"
                      : bookingStatus === "cancelled"
                        ? "#B91C1C"
                        : "#1D4ED8",
                },
              ]}
            >
              {bookingStatus}
            </Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Customer Details Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>Customer Information</Text>
            <Text style={styles.label}>Customer Name *</Text>
            <TextInput
              editable={editable}
              style={styles.input}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Enter full name"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.label}>Primary Mobile Number *</Text>
            <TextInput
              editable={editable}
              style={styles.input}
              value={mobileNumber}
              onChangeText={setMobileNumber}
              placeholder="Enter 10-digit mobile number"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={styles.label}>Alternative Contact Number</Text>
            <TextInput
              editable={editable}
              style={styles.input}
              value={altNumber}
              onChangeText={setAltNumber}
              placeholder="Enter backup mobile number"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={styles.label}>Occupation</Text>
            <TextInput
              editable={editable}
              style={styles.input}
              value={occupation}
              onChangeText={setOccupation}
              placeholder="e.g., Business, Consultant"
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Travel & Identity Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>Travel & Identity Proof</Text>
            <Text style={styles.label}>Destination</Text>
            <TextInput
              editable={editable}
              style={styles.input}
              value={destination}
              onChangeText={setDestination}
              placeholder="Enter travel destination"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.label}>Aadhaar Card Number</Text>
            <TextInput
              editable={editable}
              style={styles.input}
              value={aadharCard}
              onChangeText={setAadharCard}
              placeholder="Enter unique identification code"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              maxLength={12}
            />

            <Text style={styles.label}>Driver's License (DL) Number</Text>
            <TextInput
              editable={editable}
              style={styles.input}
              value={dlNumber}
              onChangeText={setDlNumber}
              placeholder="Enter standard DL code"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
            />
          </View>

          {/* Vehicle Selection & Commercial Details Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>
              Vehicle & Financial Parameters
            </Text>
            <Text style={styles.label}>Selected Vehicle *</Text>
            <TouchableOpacity
              disabled={!editable}
              style={[styles.selectorPressable, !editable && { opacity: 0.6 }]}
              onPress={() => setShowVehicleModal(true)}
            >
              <Text
                style={[
                  styles.selectorText,
                  !vehicleInfo.model && { color: "#94A3B8" },
                ]}
              >
                {vehicleInfo.model
                  ? `${vehicleInfo.model} ${vehicleInfo.plateNumber ? `(${vehicleInfo.plateNumber})` : ""}`
                  : "Tap to select an available fleet asset..."}
              </Text>
              <Ionicons name="car-sport-outline" size={20} color="#64748B" />
            </TouchableOpacity>

            {selectedVehicle && totalDays > 0 && (
              <Text style={styles.helperText}>
                ₹{Number(selectedVehicle.pricePerDay || 0).toLocaleString()} ×{" "}
                {totalDays} day{totalDays > 1 ? "s" : ""} = ₹
                {vehicleAmount.toLocaleString()}
              </Text>
            )}

            <Text style={styles.label}>FASTag Amount (₹)</Text>
            <TextInput
              editable={editable}
              style={styles.input}
              value={fastagBalance}
              onChangeText={setFastagBalance}
              placeholder="Enter FASTag balance"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />

            <Text style={styles.label}>Security Deposit (₹)</Text>
            <TextInput
              editable={editable}
              style={styles.input}
              value={securityDeposit}
              onChangeText={setSecurityDeposit}
              placeholder="Enter security deposit"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>Discount (₹)</Text>
                <TextInput
                  editable={editable}
                  style={styles.input}
                  value={discount}
                  onChangeText={setDiscount}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />
                {discountAmount > 0 && (
                  <Text style={styles.helperTextMuted}>
                    Deducted from the balance due, not the total amount
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.label}>Booking Amount (₹)</Text>
                <TextInput
                  editable={editable}
                  style={styles.input}
                  value={bookingAmount}
                  onChangeText={setBookingAmount}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          {/* Payment Method (same as Create Booking) */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>Payment Method</Text>

            <Text style={styles.label}>Payment Type</Text>

            <View
              style={[styles.segmentedControl, !editable && { opacity: 0.6 }]}
            >
              {PAYMENT_METHODS.map((method) => {
                const active = paymentMethod === method.value;
                return (
                  <TouchableOpacity
                    key={method.value}
                    disabled={!editable}
                    style={[
                      styles.segmentedOption,
                      active && styles.segmentedOptionActive,
                    ]}
                    onPress={() => {
                      setPaymentMethod(method.value);
                      if (method.value !== "phonepe") setUpiLast4("");
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentedText,
                        active && styles.segmentedTextActive,
                      ]}
                    >
                      {method.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {paymentMethod === "phonepe" && (
              <>
                <Text style={styles.label}>UPI Last 4 Digits</Text>
                <TextInput
                  editable={editable}
                  style={styles.input}
                  value={upiLast4}
                  onChangeText={(text) =>
                    setUpiLast4(text.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="Enter last 4 digits"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </>
            )}
          </View>

          {/* Pickup / Drop Service */}
          <View style={styles.sectionCard}>
            <View style={styles.serviceSectionHeaderRow}>
              <Text style={styles.sectionHeader}>Pickup & Drop Service</Text>
              {needPickupDrop && serviceAmount > 0 && (
                <View style={styles.serviceAmountPill}>
                  <Text style={styles.serviceAmountPillText}>
                    +₹{serviceAmount.toLocaleString()}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.label}>Need pickup or drop-off?</Text>

            <View
              style={[styles.segmentedControl, !editable && { opacity: 0.6 }]}
            >
              <TouchableOpacity
                disabled={!editable}
                style={[
                  styles.segmentedOption,
                  !needPickupDrop && styles.segmentedOptionActive,
                ]}
                onPress={() => setNeedPickupDrop(false)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentedText,
                    !needPickupDrop && styles.segmentedTextActive,
                  ]}
                >
                  No, self pickup
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!editable}
                style={[
                  styles.segmentedOption,
                  needPickupDrop && styles.segmentedOptionActive,
                ]}
                onPress={() => setNeedPickupDrop(true)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentedText,
                    needPickupDrop && styles.segmentedTextActive,
                  ]}
                >
                  Yes, arrange it
                </Text>
              </TouchableOpacity>
            </View>

            {needPickupDrop && (
              <>
                <Text style={styles.label}>Service Type</Text>

                <View style={styles.serviceTypeRow}>
                  {[
                    { value: "pickup", label: "Pickup", icon: "car-outline" },
                    { value: "drop", label: "Drop", icon: "flag-outline" },
                    {
                      value: "pickup_drop",
                      label: "Both",
                      icon: "swap-horizontal-outline",
                    },
                  ].map((item) => {
                    const active = serviceType === item.value;
                    return (
                      <TouchableOpacity
                        key={item.value}
                        disabled={!editable}
                        style={[
                          styles.serviceTypeCard,
                          active && styles.serviceTypeCardActive,
                        ]}
                        onPress={() => setServiceType(item.value)}
                        activeOpacity={0.85}
                      >
                        {active && (
                          <View style={styles.serviceTypeCheck}>
                            <Ionicons
                              name="checkmark"
                              size={10}
                              color="#FFFFFF"
                            />
                          </View>
                        )}
                        <View
                          style={[
                            styles.serviceTypeIconWrap,
                            active && styles.serviceTypeIconWrapActive,
                          ]}
                        >
                          <Ionicons
                            name={item.icon}
                            size={20}
                            color={active ? "#2563EB" : "#64748B"}
                          />
                        </View>
                        <Text
                          style={[
                            styles.serviceTypeText,
                            active && styles.serviceTypeTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {(serviceType === "pickup" ||
                  serviceType === "pickup_drop") && (
                  <View style={styles.serviceDetailBlock}>
                    <View style={styles.serviceDetailHeaderRow}>
                      <Ionicons name="car-outline" size={15} color="#2563EB" />
                      <Text style={styles.serviceDetailHeaderText}>
                        Pickup Details
                      </Text>
                    </View>

                    <Text style={styles.label}>Pickup Location</Text>
                    <View style={styles.iconInputWrapper}>
                      <Ionicons
                        name="location-outline"
                        size={17}
                        color="#94A3B8"
                      />
                      <TextInput
                        editable={editable}
                        style={styles.iconInput}
                        value={pickupLocation}
                        onChangeText={setPickupLocation}
                        placeholder="Enter pickup address"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>

                    <Text style={styles.label}>Landmark</Text>
                    <View style={styles.iconInputWrapper}>
                      <Ionicons name="flag-outline" size={17} color="#94A3B8" />
                      <TextInput
                        editable={editable}
                        style={styles.iconInput}
                        value={pickupLandmark}
                        onChangeText={setPickupLandmark}
                        placeholder="Nearby landmark"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>

                    <Text style={styles.label}>Map Location</Text>
                    <View style={styles.mapInputRow}>
                      <View style={[styles.iconInputWrapper, { flex: 1 }]}>
                        <Ionicons
                          name="map-outline"
                          size={17}
                          color="#94A3B8"
                        />
                        <TextInput
                          editable={editable}
                          style={styles.iconInput}
                          value={pickupMapLink}
                          onChangeText={setPickupMapLink}
                          placeholder="Paste Google Maps link"
                          placeholderTextColor="#94A3B8"
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.mapOpenButton}
                        onPress={() => openMapLink(pickupMapLink)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="navigate" size={16} color="#2563EB" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>Pickup Charge (₹)</Text>
                    <View style={styles.iconInputWrapper}>
                      <Text style={styles.currencyPrefix}>₹</Text>
                      <TextInput
                        editable={editable}
                        style={styles.iconInput}
                        value={pickupCharge}
                        onChangeText={setPickupCharge}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </View>
                )}

                {(serviceType === "drop" || serviceType === "pickup_drop") && (
                  <View style={styles.serviceDetailBlock}>
                    <View style={styles.serviceDetailHeaderRow}>
                      <Ionicons name="flag-outline" size={15} color="#2563EB" />
                      <Text style={styles.serviceDetailHeaderText}>
                        Drop Details
                      </Text>
                    </View>

                    <Text style={styles.label}>Drop Location</Text>
                    <View style={styles.iconInputWrapper}>
                      <Ionicons
                        name="location-outline"
                        size={17}
                        color="#94A3B8"
                      />
                      <TextInput
                        editable={editable}
                        style={styles.iconInput}
                        value={dropLocation}
                        onChangeText={setDropLocation}
                        placeholder="Enter drop address"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>

                    <Text style={styles.label}>Landmark</Text>
                    <View style={styles.iconInputWrapper}>
                      <Ionicons name="flag-outline" size={17} color="#94A3B8" />
                      <TextInput
                        editable={editable}
                        style={styles.iconInput}
                        value={dropLandmark}
                        onChangeText={setDropLandmark}
                        placeholder="Nearby landmark"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>

                    <Text style={styles.label}>Map Location</Text>
                    <View style={styles.mapInputRow}>
                      <View style={[styles.iconInputWrapper, { flex: 1 }]}>
                        <Ionicons
                          name="map-outline"
                          size={17}
                          color="#94A3B8"
                        />
                        <TextInput
                          editable={editable}
                          style={styles.iconInput}
                          value={dropMapLink}
                          onChangeText={setDropMapLink}
                          placeholder="Paste Google Maps link"
                          placeholderTextColor="#94A3B8"
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.mapOpenButton}
                        onPress={() => openMapLink(dropMapLink)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="navigate" size={16} color="#2563EB" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>Drop Charge (₹)</Text>
                    <View style={styles.iconInputWrapper}>
                      <Text style={styles.currencyPrefix}>₹</Text>
                      <TextInput
                        editable={editable}
                        style={styles.iconInput}
                        value={dropCharge}
                        onChangeText={setDropCharge}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </View>
                )}

                <Text style={styles.label}>Additional Notes</Text>
                <View style={styles.iconInputWrapper}>
                  <Ionicons
                    name="document-text-outline"
                    size={17}
                    color="#94A3B8"
                    style={{ marginTop: 2, alignSelf: "flex-start" }}
                  />
                  <TextInput
                    editable={editable}
                    style={[styles.iconInput, { height: 80, paddingTop: 0 }]}
                    multiline
                    value={pickupDropNotes}
                    onChangeText={setPickupDropNotes}
                    placeholder="Any special instructions..."
                    placeholderTextColor="#94A3B8"
                    textAlignVertical="top"
                  />
                </View>
              </>
            )}
          </View>

          {/* Trip Schedule Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>Trip Schedule (IST)</Text>

            <View style={styles.durationSummaryBox}>
              <View style={styles.durationSummaryLeft}>
                <Ionicons
                  name="calendar-clear-outline"
                  size={18}
                  color="#2563EB"
                />
                <Text style={styles.durationSummaryLabel}>
                  Total Trip Duration
                </Text>
              </View>
              <View style={styles.durationSummaryPill}>
                <Text style={styles.durationSummaryValue}>
                  {totalDays} {totalDays === 1 ? "Day" : "Days"}
                </Text>
              </View>
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>Pickup Date *</Text>
                <TouchableOpacity
                  disabled={!editable}
                  style={styles.pickerTrigger}
                  onPress={() => openPicker("date", "pickupDate")}
                >
                  <Text style={styles.pickerTriggerText}>
                    {pickupDate || "DD-MMM-YYYY"}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.label}>Pickup Time *</Text>
                <TouchableOpacity
                  disabled={!editable}
                  style={styles.pickerTrigger}
                  onPress={() => openPicker("time", "pickupTime")}
                >
                  <Text style={styles.pickerTriggerText}>
                    {pickupTime || "HH:MM AM/PM"}
                  </Text>
                  <Ionicons name="time-outline" size={18} color="#2563EB" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>Drop Date *</Text>
                <TouchableOpacity
                  disabled={!editable}
                  style={styles.pickerTrigger}
                  onPress={() => openPicker("date", "dropDate")}
                >
                  <Text style={styles.pickerTriggerText}>
                    {dropDate || "DD-MMM-YYYY"}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.label}>Drop Time *</Text>
                <TouchableOpacity
                  disabled={!editable}
                  style={styles.pickerTrigger}
                  onPress={() => openPicker("time", "dropTime")}
                >
                  <Text style={styles.pickerTriggerText}>
                    {dropTime || "HH:MM AM/PM"}
                  </Text>
                  <Ionicons name="time-outline" size={18} color="#2563EB" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Bill Summary */}
          {selectedVehicle && (
            <View style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.billSummaryHeaderRow}
                onPress={() => setShowBillSummary((prev) => !prev)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionHeader}>Bill Summary</Text>
                  {!showBillSummary && (
                    <Text style={styles.billSummarySubtext}>
                      {totalDays} day{totalDays > 1 ? "s" : ""} • {paymentLabel}{" "}
                      • Tap to view full bill
                    </Text>
                  )}
                </View>

                <Text style={styles.billSummaryHeaderAmount}>
                  ₹{finalAmount.toLocaleString()}
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
                      Vehicle Rent (₹
                      {Number(
                        selectedVehicle.pricePerDay || 0,
                      ).toLocaleString()}{" "}
                      × {totalDays} day{totalDays > 1 ? "s" : ""})
                    </Text>
                    <Text style={styles.invoiceValue}>
                      ₹{vehicleAmount.toLocaleString()}
                    </Text>
                  </View>

                  {needPickupDrop &&
                    (serviceType === "pickup" ||
                      serviceType === "pickup_drop") && (
                      <View style={styles.invoiceRow}>
                        <Text style={styles.invoiceLabel}>Pickup Charge</Text>
                        <Text style={styles.invoiceValue}>
                          ₹{pickupAmount.toLocaleString()}
                        </Text>
                      </View>
                    )}

                  {needPickupDrop &&
                    (serviceType === "drop" ||
                      serviceType === "pickup_drop") && (
                      <View style={styles.invoiceRow}>
                        <Text style={styles.invoiceLabel}>Drop Charge</Text>
                        <Text style={styles.invoiceValue}>
                          ₹{dropAmount.toLocaleString()}
                        </Text>
                      </View>
                    )}

                  {fastagAmount > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>FASTag Amount</Text>
                      <Text style={styles.invoiceValue}>
                        ₹{fastagAmount.toLocaleString()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.invoiceDivider} />

                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceTotalLabel}>
                      Total Rental Amount
                    </Text>
                    <Text style={styles.invoiceTotalValue}>
                      ₹{rentalAmount.toLocaleString()}
                    </Text>
                  </View>

                  <View style={styles.invoiceDivider} />

                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceGrandLabel}>
                      Final Payable Amount
                    </Text>
                    <Text style={styles.invoiceGrandValue}>
                      ₹{finalAmount.toLocaleString()}
                    </Text>
                  </View>

                  {bookingAdvance > 0 && (
                    <View style={styles.invoiceRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invoiceLabel}>
                          Advance Paid ({paymentLabel}
                          {paymentMethod === "phonepe" && upiLast4
                            ? ` •••• ${upiLast4}`
                            : ""}
                          )
                        </Text>
                        {(paymentMethod === "phonepe" || paymentMethod === "mixed") && (booking?.payment?.customPaymentDate || booking?.createdAt) && (
                          <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
                            {new Date(booking?.payment?.customPaymentDate || booking.createdAt).toLocaleString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.invoiceValue, { color: "#16A34A" }]}>
                        − ₹{bookingAdvance.toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {discountAmount > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>Discount</Text>
                      <Text style={[styles.invoiceValue, { color: "#16A34A" }]}>
                        − ₹{discountAmount.toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {sawariCashAmount > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>Sawari Cash Used</Text>
                      <Text style={[styles.invoiceValue, { color: "#16A34A" }]}>
                        − ₹{sawariCashAmount.toLocaleString()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.invoiceRow}>
                    <Text
                      style={[
                        styles.invoiceBalanceLabel,
                        { color: balanceAmount > 0 ? "#B45309" : "#16A34A" },
                      ]}
                    >
                      {balanceAmount > 0 ? "Balance Due" : "Fully Paid"}
                    </Text>
                    <Text
                      style={[
                        styles.invoiceBalanceValue,
                        { color: balanceAmount > 0 ? "#B45309" : "#16A34A" },
                      ]}
                    >
                      ₹{balanceAmount.toLocaleString()}
                    </Text>
                  </View>

                  {securityAmount > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>
                        Security Deposit (refundable)
                      </Text>
                      <Text style={styles.invoiceValue}>
                        ₹{securityAmount.toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {totalCollected > 0 && (
                    <>
                      <View style={styles.invoiceDivider} />
                      <View style={styles.invoiceRow}>
                        <Text style={styles.invoiceTotalLabel}>
                          Total Collected
                        </Text>
                        <Text style={styles.invoiceTotalValue}>
                          ₹{totalCollected.toLocaleString()}
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
          )}

          {/* iOS Picker Sheet */}
          {showPicker && Platform.OS === "ios" && (
            <Modal transparent animationType="fade" visible={showPicker}>
              <View style={styles.iosPickerModalContainer}>
                <View style={styles.iosPickerContentCard}>
                  <DateTimePicker
                    value={pickerDateValue}
                    mode={pickerMode}
                    display="spinner"
                    onValueChange={onPickerChange}
                    onDismiss={() => setShowPicker(false)}
                  />
                  <TouchableOpacity
                    style={styles.iosPickerCloseButton}
                    onPress={() => setShowPicker(false)}
                  >
                    <Text style={styles.iosPickerCloseText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}

          {/* Android Picker */}
          {showPicker && Platform.OS === "android" && (
            <DateTimePicker
              value={pickerDateValue}
              mode={pickerMode}
              display="default"
              onValueChange={onPickerChange}
              onDismiss={() => setShowPicker(false)}
            />
          )}

          <View style={styles.footerButtons}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                { flex: 1 },
                (loadingUpdate || !editable) && { opacity: 0.6 },
              ]}
              onPress={handleUpdateBooking}
              disabled={loadingUpdate || !editable}
            >
              {loadingUpdate ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Update Booking</Text>
              )}
            </TouchableOpacity>

            {editable && (
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  { backgroundColor: "#FEE2E2", paddingHorizontal: 20 },
                ]}
                onPress={() =>
                  Alert.alert(
                    "Cancel Booking",
                    "Are you sure you want to cancel this booking? This cannot be undone.",
                    [
                      { text: "No", style: "cancel" },
                      {
                        text: "Yes, Cancel",
                        style: "destructive",
                        onPress: cancelBooking,
                      },
                    ],
                  )
                }
                disabled={loadingCancel}
              >
                <Text style={[styles.submitButtonText, { color: "#B91C1C" }]}>
                  {loadingCancel ? "Cancelling..." : "Cancel"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Vehicle Picker Modal */}
      <Modal
        visible={showVehicleModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setVehicleSearch("");
          setShowVehicleModal(false);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>Select Vehicle</Text>
            <TouchableOpacity
              onPress={() => {
                setVehicleSearch("");
                setShowVehicleModal(false);
              }}
              style={styles.modalCloseTouch}
            >
              <Ionicons name="close" size={26} color="#111827" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBarWrapper}>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#64748B" />
              <TextInput
                placeholder="Search by name, number or color..."
                placeholderTextColor="#94A3B8"
                value={vehicleSearch}
                onChangeText={setVehicleSearch}
                style={styles.searchInput}
                autoCorrect={false}
              />
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {filteredVehicles.map((vehicle) => (
              <TouchableOpacity
                key={vehicle._id}
                style={[
                  styles.vehicleCard,
                  selectedVehicle?._id === vehicle._id &&
                    styles.selectedVehicleCard,
                ]}
                onPress={() => {
                  setSelectedVehicle(vehicle);
                  setVehicleInfo({
                    model: vehicle.vehicleName,
                    plateNumber: vehicle.vehicleNumber,
                  });
                  setVehicleSearch("");
                  setShowVehicleModal(false);
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={styles.vehicleIconWrapper}>
                    <Ionicons name="car-sport" size={26} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={styles.vehicleNameText} numberOfLines={1}>
                        {vehicle.vehicleName}
                      </Text>
                      <Text style={styles.vehiclePriceText}>
                        ₹{Number(vehicle.pricePerDay || 0).toLocaleString()}/Day
                      </Text>
                    </View>
                    <Text style={styles.vehicleNumberText}>
                      {vehicle.vehicleNumber}
                    </Text>
                    <Text style={styles.vehicleMetaText}>
                      {vehicle.transmission || "N/A"} •{" "}
                      {vehicle.fuelType || "N/A"} •{" "}
                      {vehicle.seatingCapacity || 0} Seats
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  customNavigationBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: { padding: 4 },
  navBarTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  headerAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#16A34A",
    marginTop: 2,
  },
  headerSub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  statusPill: {
    marginTop: 6,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  scrollContainer: { padding: 16, paddingBottom: 40 },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 6,
    marginTop: 8,
  },
  helperText: {
    fontSize: 12,
    color: "#16A34A",
    marginBottom: 8,
    marginTop: -2,
  },
  helperTextMuted: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: -4,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1E293B",
    marginBottom: 8,
  },
  pickerTrigger: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
  },
  pickerTriggerText: { fontSize: 15, color: "#1E293B", fontWeight: "500" },
  selectorPressable: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  selectorText: { fontSize: 15, color: "#1E293B", flex: 1 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  footerButtons: { flexDirection: "row", gap: 10, marginTop: 8 },
  submitButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  submitButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFF",
  },
  modalHeaderTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },
  modalCloseTouch: { padding: 4 },
  searchBarWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: "#111827" },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  loadingText: { marginTop: 12, fontSize: 14, color: "#64748B" },
  vehicleCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  selectedVehicleCard: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  vehicleIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  vehicleNameText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginRight: 8,
  },
  vehiclePriceText: { fontSize: 14, fontWeight: "800", color: "#16A34A" },
  vehicleNumberText: { fontSize: 14, color: "#475569", marginTop: 2 },
  vehicleMetaText: { fontSize: 12, color: "#94A3B8", marginTop: 4 },
  iosPickerModalContainer: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  iosPickerContentCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
    paddingTop: 10,
  },
  iosPickerCloseButton: {
    alignSelf: "flex-end",
    marginRight: 20,
    padding: 10,
  },
  iosPickerCloseText: { color: "#2563EB", fontWeight: "700", fontSize: 16 },

  // ── Pickup & Drop Service ──
  serviceSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  serviceAmountPill: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: -2,
  },
  serviceAmountPillText: { fontSize: 12, fontWeight: "700", color: "#16A34A" },

  // Segmented control (payment method + pickup/drop toggle)
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    marginTop: 4,
  },
  segmentedOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
  },
  segmentedOptionActive: {
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 1 },
    }),
  },
  segmentedText: { fontSize: 13, fontWeight: "600", color: "#94A3B8" },
  segmentedTextActive: { color: "#0F172A" },

  // Service type cards
  serviceTypeRow: {
    flexDirection: "row",
    marginTop: 4,
    marginBottom: 4,
    gap: 10,
  },
  serviceTypeCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    position: "relative",
  },
  serviceTypeCardActive: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  serviceTypeCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceTypeIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#EEF2F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  serviceTypeIconWrapActive: { backgroundColor: "#DBEAFE" },
  serviceTypeText: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  serviceTypeTextActive: { color: "#2563EB" },

  // Pickup/Drop detail sub-cards
  serviceDetailBlock: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 3,
    borderLeftColor: "#2563EB",
    padding: 12,
    marginTop: 14,
  },
  serviceDetailHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  serviceDetailHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },

  // Icon-prefixed inputs
  iconInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  iconInput: { flex: 1, fontSize: 14, color: "#1E293B", paddingVertical: 11 },
  currencyPrefix: { fontSize: 14, fontWeight: "700", color: "#64748B" },

  // Map link row
  mapInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  mapOpenButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  // Trip duration box
  durationSummaryBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  durationSummaryLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  durationSummaryLabel: { fontSize: 13, fontWeight: "600", color: "#1E293B" },
  durationSummaryPill: {
    backgroundColor: "#2563EB",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  durationSummaryValue: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },

  // Bill Summary
  billSummaryHeaderRow: { flexDirection: "row", alignItems: "center" },
  billSummarySubtext: { fontSize: 12, color: "#94A3B8", marginTop: -8 },
  billSummaryHeaderAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#16A34A",
  },
  invoiceBox: {
    marginTop: 4,
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
  invoiceLabel: { flex: 1, fontSize: 13, color: "#475569" },
  invoiceValue: { fontSize: 13, fontWeight: "600", color: "#1E293B" },
  invoiceDivider: {
    borderStyle: "dashed",
    borderWidth: 0.75,
    borderColor: "#CBD5E1",
    marginVertical: 8,
  },
  invoiceTotalLabel: { fontSize: 13, fontWeight: "700", color: "#334155" },
  invoiceTotalValue: { fontSize: 13, fontWeight: "700", color: "#334155" },
  invoiceGrandLabel: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  invoiceGrandValue: { fontSize: 16, fontWeight: "800", color: "#16A34A" },
  invoiceBalanceLabel: { fontSize: 14, fontWeight: "700", color: "#B45309" },
  invoiceBalanceValue: { fontSize: 14, fontWeight: "800", color: "#B45309" },
  billSummaryCloseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 6,
    paddingVertical: 8,
  },
  billSummaryCloseText: { fontSize: 13, fontWeight: "700", color: "#2563EB" },
});
