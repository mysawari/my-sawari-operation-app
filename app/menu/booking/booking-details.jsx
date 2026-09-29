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
  const [bookingAmount, setBookingAmount] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  const [fastagBalance, setFastagBalance] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  // SCHEDULE STATES
  // pickupDate/dropDate are DISPLAY-ONLY strings ("DD-MMM-YYYY"), always
  // derived from pickupDateObj/dropDateObj below — never parsed back into
  // a Date. pickupDateObj/dropDateObj are the actual source of truth used
  // for totalDays math and the backend payload.
  const [pickupDate, setPickupDate] = useState("15-Jul-2026");
  const [dropDate, setDropDate] = useState("20-Jul-2026");
  const [pickupDateObj, setPickupDateObj] = useState(new Date(2026, 6, 15));
  const [dropDateObj, setDropDateObj] = useState(new Date(2026, 6, 20));
  const [pickupTime, setPickupTime] = useState("09:00 AM");
  const [dropTime, setDropTime] = useState("06:00 PM");

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

  const [serviceType, setServiceType] = useState("pickup_drop");
  // pickup
  // drop
  // pickup_drop

  const [pickupLocation, setPickupLocation] = useState("");
  const [pickupLandmark, setPickupLandmark] = useState("");
  const [pickupMapLink, setPickupMapLink] = useState("");
  const [pickupCharge, setPickupCharge] = useState("");

  const [dropLocation, setDropLocation] = useState("");
  const [dropLandmark, setDropLandmark] = useState("");
  const [dropMapLink, setDropMapLink] = useState("");
  const [dropCharge, setDropCharge] = useState("");

  const [pickupDropNotes, setPickupDropNotes] = useState("");

  // Bill Summary (invoice-style breakdown) - collapsed by default, tap to
  // expand/close, Zomato-style. Matches the CreateBookingScreen pattern.
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
    return { day, month: month - 1, year }; // monthIndex is 0-based
  };

  // Build a plain local-midnight Date (safe for day-diff math) from IST
  // calendar parts.
  const dateFromParts = (parts) =>
    parts ? new Date(parts.year, parts.month, parts.day) : null;

  // Convert a Date object straight to backend-compliant "YYYY-MM-DD" — no
  // string parsing involved, just reading numbers off the object.
  const formatToBackendDate = (dateObj) => {
    if (!dateObj) return "";
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // ── LIVE "No. of Days" ──
  // Pure calendar-date difference between the two Date objects — both
  // already normalized to local midnight, so this is just a subtraction.
  // No parsing of any kind happens here, so there's nothing for Hermes'
  // Date.parse to get wrong.
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

    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    return diffDays < 1 ? 1 : diffDays;
  };

  const totalDays = useMemo(() => {
    return calculateTotalDays(pickupDateObj, dropDateObj);
  }, [pickupDateObj, dropDateObj]);

  // Main Initializer Function
  const initializeScreenData = useCallback(
    async (refresh = false) => {
      if (!token || !id) return;

      if (refresh) setRefreshing(true);
      else setScreenLoading(true);

      try {
        const [vehicleRes, bookingRes] = await Promise.all([
          api.get("/vehicles/getAll", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),

          api.get(`/leads/booking-details/${id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ]);

        setVehicles(vehicleRes.data.data || []);

        const data = bookingRes?.data?.booking;

        if (!data) {
          throw new Error("Booking not found");
        }

        setBooking(data);

        setBookingStatus(data.status);

        setCustomerName(data.customerName || "");

        setMobileNumber(data.mobileNumber || "");

        setAltNumber(data.alternateMobileNumber || "");

        setOccupation(data.occupation || "");

        setDestination(data.destination || "");

        setAadharCard(data.aadhaarNumber || "");

        setDlNumber(data.drivingLicenseNumber || "");

        // Pricing fields live under the nested `payment` object in the
        // schema, NOT as flat fields on the booking document.
        setBookingAmount(String(data.payment?.bookingAmountPaid || ""));

        setDiscount(String(data.payment?.discountAmount || ""));

        setSecurityDeposit(String(data.payment?.securityDeposit || ""));

        setFastagBalance(String(data.payment?.fastagAmount || ""));

        setPaymentMethod(data.payment?.paymentMethod || "cash");

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

        // Extract IST calendar parts once per date, then derive BOTH the
        // display string and the calculation Date object from the same
        // numbers — no re-parsing, so display and math can never disagree.
        const pickupParts = getISTDateParts(data.fromDate);
        const dropParts = getISTDateParts(data.toDate);

        const pickupObj = dateFromParts(pickupParts);
        const dropObj = dateFromParts(dropParts);

        setPickupDate(pickupObj ? formatLocalDate(pickupObj) : "");
        setDropDate(dropObj ? formatLocalDate(dropObj) : "");
        setPickupDateObj(pickupObj);
        setDropDateObj(dropObj);

        setPickupTime(data.pickupTime || "08:00 AM");

        setDropTime(data.dropTime || "08:00 AM");

        // totalDays is now derived automatically via useMemo above —
        // no manual set needed here.

        if (data.vehicleId) {
          setSelectedVehicle(data.vehicleId);

          setVehicleInfo({
            model: data.vehicleId.vehicleName,
            plateNumber: data.vehicleId.vehicleNumber,
          });
        }
      } catch (err) {
        console.log("===== BOOKING ERROR =====");
        console.log("Status:", err.response?.status);
        console.log("Data:", JSON.stringify(err.response?.data, null, 2));
        console.log("URL:", err.config?.url);
        console.log("Message:", err.message);

        Alert.alert(
          "Error",
          JSON.stringify(err.response?.data || err.message, null, 2),
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

  const handleRefresh = () => {
    initializeScreenData(true);
  };

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

  const openPicker = (type, target) => {
    setPickerMode(type);
    setCurrentPickerTarget(target);

    let initialDate = new Date();
    if (type === "date") {
      const targetVal = target === "pickupDate" ? pickupDateObj : dropDateObj;
      initialDate = targetVal || new Date();
    }

    setPickerDateValue(initialDate);
    setShowPicker(true);
  };

  const onPickerChange = (event, selectedDate) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }

    if (event.type === "dismissed" || !selectedDate) {
      return;
    }

    setPickerDateValue(selectedDate);

    if (pickerMode === "date") {
      const formattedDate = formatLocalDate(selectedDate);
      // Normalize to local midnight — this Date object is what totalDays
      // and the backend payload are built from, so keep it in lockstep
      // with the display string set right below it.
      const normalizedObj = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
      );

      // Updating pickupDate/pickupDateObj (or drop-) below automatically
      // recalculates `totalDays` (useMemo) on the very next render —
      // that's what gives the real-time "No. of Days" update.
      if (currentPickerTarget === "pickupDate") {
        setPickupDate(formattedDate);
        setPickupDateObj(normalizedObj);
      }

      if (currentPickerTarget === "dropDate") {
        setDropDate(formattedDate);
        setDropDateObj(normalizedObj);
      }
    } else {
      // 12-Hour standard string formatting with AM/PM
      let hours = selectedDate.getHours();
      const minutes = String(selectedDate.getMinutes()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12;
      const formattedTime = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;

      if (currentPickerTarget === "pickupTime") setPickupTime(formattedTime);
      if (currentPickerTarget === "dropTime") setDropTime(formattedTime);
    }
  };

  const handleUpdateBooking = async () => {
    if (!customerName.trim()) return alert("Customer name is required");
    if (!mobileNumber.trim()) return alert("Mobile number is required");
    if (!selectedVehicle) return alert("Please select a vehicle");

    setLoadingUpdate(true);

    try {
      // Recompute the bill breakdown right here, self-contained, so the
      // saved payload can never drift from what's on screen.
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

      // Vehicle + Pickup + Drop + FASTag = total billable amount
      const totalAmount =
        vehicleRent + appliedPickupCharge + appliedDropCharge + fastagAmount;

      const discountAmount = Number(discount || 0);
      const bookingAmountPaid = Number(bookingAmount || 0);
      const securityAmount = Number(securityDeposit || 0);

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

        // Nested under `payment` to match the schema. This is what the
        // pre-save hook reads to compute balanceAmount / totalCollected /
        // paymentStatus.
        payment: {
          vehicleRent,
          pickupCharge: appliedPickupCharge,
          dropCharge: appliedDropCharge,
          fastagAmount,
          totalAmount,
          discountAmount,
          securityDeposit: securityAmount,
          bookingAmountPaid,
          paymentMethod,
        },
      };

      await api.put(`/leads/booking-update/${id}`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      alert("Booking updated successfully.");

      initializeScreenData();
    } catch (err) {
      console.log(err.response?.data || err);

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
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      Alert.alert("Success", "Booking cancelled successfully.", [
        {
          text: "OK",
          onPress: () => {
            console.log("Going back...");
            router.back();
          },
        },
      ]);
    } catch (err) {
      console.log("Cancel Error:", err.response?.data || err);
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
        <Text style={styles.loadingText}>Fetching profile details...</Text>
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

  // Rental charges only (Vehicle + Pickup + Drop + FASTag)
  const rentalAmount = vehicleAmount + serviceAmount + fastagAmount;

  const discountAmount = Number(discount || 0);
  const bookingAdvance = Number(bookingAmount || 0);
  const securityAmount = Number(securityDeposit || 0);

  // Customer payable (gross) — the headline "total" shown in the header and
  // as "Final Payable Amount" in the bill. Discount is NOT subtracted here;
  // it only reduces what's still owed (see balanceAmount below), the same
  // way Advance reduces what's still owed.
  const finalAmount = Math.max(rentalAmount, 0);

  // Remaining balance — Advance AND Discount both come off here.
  const balanceAmount = Math.max(
    finalAmount - bookingAdvance - discountAmount,
    0,
  );

  // Total money collected today (advance + security deposit)
  const totalCollected = bookingAdvance + securityAmount;

  const editable = bookingStatus !== "cancelled";

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
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: "#16A34A",
                  marginTop: 2,
                }}
              >
                ₹{finalAmount.toLocaleString()}
              </Text>
              <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                Advance ₹{bookingAdvance.toLocaleString()} • Due ₹
                {balanceAmount.toLocaleString()}
              </Text>
            </>
          )}
          <View
            style={{
              marginTop: 6,
              backgroundColor:
                bookingStatus === "confirmed"
                  ? "#DCFCE7"
                  : bookingStatus === "cancelled"
                    ? "#FEE2E2"
                    : "#DBEAFE",

              alignSelf: "center",
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: 20,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color:
                  bookingStatus === "confirmed"
                    ? "#166534"
                    : bookingStatus === "cancelled"
                      ? "#B91C1C"
                      : "#1D4ED8",
                textTransform: "uppercase",
              }}
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

            <Text style={styles.label}>Identification Reference Number</Text>
            <TextInput
              editable={editable}
              style={styles.input}
              value={aadharCard}
              onChangeText={setAadharCard}
              placeholder="Enter unique identification code"
              placeholderTextColor="#94A3B8"
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
          {/* Pickup / Drop Service */}
          <View style={styles.sectionCard}>
            <View style={styles.serviceSectionHeaderRow}>
              <View>
                <Text style={styles.sectionHeader}>Pickup & Drop Service</Text>
              </View>
              {needPickupDrop && serviceAmount > 0 && (
                <View style={styles.serviceAmountPill}>
                  <Text style={styles.serviceAmountPillText}>
                    +₹{serviceAmount.toLocaleString()}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.label}>Need pickup or drop-off?</Text>

            <View style={styles.segmentedControl}>
              <TouchableOpacity
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
                    {
                      value: "pickup",
                      label: "Pickup",
                      icon: "car-outline",
                    },
                    {
                      value: "drop",
                      label: "Drop",
                      icon: "flag-outline",
                    },
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
            <View style={styles.serviceSectionHeaderRow}>
              <Text style={styles.sectionHeader}>Trip Schedule (IST)</Text>
            </View>

            {/* Live "No. of Days" indicator — recalculates instantly whenever
                either pickup or drop date is changed above/below */}
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

          {/* Bill Summary / Invoice Section (Zomato-style expandable bill) */}
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
                      {totalDays > 0
                        ? `${totalDays} day${totalDays > 1 ? "s" : ""} • `
                        : ""}
                      Tap to view full bill
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
                      Vehicle Rent{" "}
                      {totalDays > 0
                        ? `(₹${Number(
                            selectedVehicle.pricePerDay || 0,
                          ).toLocaleString()} × ${totalDays} day${
                            totalDays > 1 ? "s" : ""
                          })`
                        : ""}
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
                      <Text style={styles.invoiceLabel}>Advance Paid</Text>
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

                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceBalanceLabel}>
                      {balanceAmount > 0 ? "Balance Due" : "Fully Paid"}
                    </Text>
                    <Text
                      style={[
                        styles.invoiceBalanceValue,
                        {
                          color: balanceAmount > 0 ? "#B45309" : "#16A34A",
                        },
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
                          Total Collected Today
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

          {/* iOS Picker Wrap Sheet */}
          {showPicker && Platform.OS === "ios" && (
            <Modal
              transparent
              animated
              animationType="fade"
              visible={showPicker}
            >
              <View style={styles.iosPickerModalContainer}>
                <View style={styles.iosPickerContentCard}>
                  <DateTimePicker
                    value={pickerDateValue}
                    mode={pickerMode}
                    display="spinner"
                    onChange={onPickerChange}
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

          {/* Android Picker Core */}
          {showPicker && Platform.OS === "android" && (
            <DateTimePicker
              value={pickerDateValue}
              mode={pickerMode}
              display="default"
              onChange={onPickerChange}
            />
          )}

          <View
            style={{
              flexDirection: "row",
              gap: 10,
              marginTop: 20,
            }}
          >
            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  flex: 1,
                  backgroundColor: "#2563EB",
                },
              ]}
              onPress={handleUpdateBooking}
              disabled={loadingUpdate || !editable}
            >
              <Text style={styles.submitButtonText}>
                {loadingUpdate ? "Updating..." : "Update Booking"}
              </Text>
            </TouchableOpacity>

            {editable && (
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  {
                    backgroundColor: "#FEE2E2",
                    paddingHorizontal: 20,
                  },
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
                editable={editable}
                placeholder="Search by name, number or color..."
                placeholderTextColor="#94A3B8"
                value={vehicleSearch}
                onChangeText={setVehicleSearch}
                style={styles.searchInput}
                autoCorrect={false}
              />
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
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
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "800",
                          color: "#16A34A",
                        }}
                      >
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
  submitButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
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
  vehicleNameText: { fontSize: 16, fontWeight: "700", color: "#111827" },
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
  iosPickerCloseText: {
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 16,
  },
  optionRow: {
    flexDirection: "row",
    marginTop: 8,
  },

  optionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingVertical: 12,
    marginHorizontal: 4,
  },

  optionButtonActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },

  optionText: {
    marginLeft: 8,
    color: "#475569",
    fontWeight: "600",
  },

  optionTextActive: {
    color: "#2563EB",
  },

  optionColumn: {
    marginTop: 10,
  },

  sectionSubHeader: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 16,
    marginBottom: 8,
  },

  // ── Pickup & Drop Service: revamped ──
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
  serviceAmountPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16A34A",
  },

  // Segmented Yes/No control
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
  segmentedText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
  },
  segmentedTextActive: {
    color: "#0F172A",
  },

  // Service type: compact 3-up cards
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
  serviceTypeCardActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
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
  serviceTypeIconWrapActive: {
    backgroundColor: "#DBEAFE",
  },
  serviceTypeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  serviceTypeTextActive: {
    color: "#2563EB",
  },

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
  iconInput: {
    flex: 1,
    fontSize: 14,
    color: "#1E293B",
    paddingVertical: 11,
  },
  currencyPrefix: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },

  // Map location row with open-in-maps button
  mapInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
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

  // ── Live "No. of Days" summary box ──
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
  durationSummaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  durationSummaryLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
  },
  durationSummaryPill: {
    backgroundColor: "#2563EB",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  durationSummaryValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  // ── Bill Summary / Invoice (Zomato-style) ──
  billSummaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  billSummarySubtext: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: -8,
  },
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
