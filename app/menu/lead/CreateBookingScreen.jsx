import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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

/**
 * CreateBookingScreen
 *
 * Handles TWO distinct flows from a single screen:
 *
 *  1. Lead conversion flow  -> a `lead` param is present.
 *     The screen loads the lead's details, lets the user review / edit them,
 *     and submits with PUT /leads/:id/create-booking.
 *
 *  2. Fresh / walk-in booking flow -> no `lead` param is present.
 *     The screen starts with a blank, fully editable form and real vehicle
 *     availability data, and submits with POST /bookings/create.
 *
 * `mode` only controls copy/labels ("New Booking" vs "Create Booking") -
 * the actual submit target is decided by whether we have a loaded lead.
 *
 * RENTAL DAY RULE (business standard): 8AM -> 8AM cycle.
 * e.g. Pickup 18-Jul-2026 8:00 AM -> Drop 20-Jul-2026 8:00 AM = 2 days
 *
 * SCHEDULE UX: the user picks a Rental Type (Standard 8AM-8AM or Flexible
 * 24-hour) and types in the Number of Days directly. The Pickup Date/Time
 * are picked manually; the Drop Date/Time are auto-generated from Pickup
 * Date + Number of Days by default (locked to 8:00 AM for Standard, mirrored
 * to Pickup Time for Flexible). The user can still tap the Drop Date/Time
 * pickers to override manually - once they do, auto-calculation stops
 * overwriting that field until reset.
 *
 * PRICING NOTE: Discount is captured and sent to the backend. It does NOT
 * reduce the headline Total / Final Payable Amount shown in the header or
 * bill summary — it only reduces the Balance Due, exactly like Advance
 * does. Balance Due = Final Amount − Advance − Discount.
 */
export default function CreateBookingScreen() {
  const { lead, mode = "create" } = useLocalSearchParams();
  const router = useRouter();
  const { token } = useAuthStore();

  const isFreshBooking = !lead; // true when there's no lead to attach to

  // Screen Loading & Refresh states
  const [screenLoading, setScreenLoading] = useState(!isFreshBooking);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Core Lead state (only populated when we came from a lead)
  const [leadData, setLeadData] = useState(null);

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
  const [residents, setResidents] = useState("1");
  const [securityDeposit, setSecurityDeposit] = useState("");

  // SCHEDULE STATES - Localized formatting: "DD-MMM-YYYY"
  const [rentalType, setRentalType] = useState("standard");
  // standard | flexible

  const [totalDays, setTotalDays] = useState("");

  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");

  const [dropDate, setDropDate] = useState("");
  const [dropTime, setDropTime] = useState("");

  // Native Picker Control States
  const [pickerMode, setPickerMode] = useState("date");
  const [currentPickerTarget, setCurrentPickerTarget] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerDateValue, setPickerDateValue] = useState(new Date());
  const [dropDateEdited, setDropDateEdited] = useState(false);
  const [dropTimeEdited, setDropTimeEdited] = useState(false);

  const [vehicleInfo, setVehicleInfo] = useState({
    model: "",
    plateNumber: "",
  });

  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
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
  const [fastagBalance, setFastagBalance] = useState("");

  const [pickupDropNotes, setPickupDropNotes] = useState("");

  // Bill Summary (invoice-style breakdown) - collapsed by default, tap to
  // expand/close, Zomato-style.
  const [showBillSummary, setShowBillSummary] = useState(false);

  // ---- Date/Time parsing & formatting helpers ----

  // Parses "08:00 AM" / "8:00 PM" style strings into 24hr {hours, minutes}
  const parseTimeToHM = (timeStr) => {
    if (!timeStr) return { hours: 8, minutes: 0 };
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return { hours: 8, minutes: 0 };
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return { hours, minutes };
  };

  // Convert UI readable format (e.g., "15-Jul-2026") back to a safe JS Date object
  const parseCustomDate = (dateStr) => {
    if (!dateStr) return new Date();
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const months = [
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
      const monthIndex = months.indexOf(parts[1]);
      const year = parseInt(parts[2], 10);
      if (monthIndex !== -1 && !isNaN(day) && !isNaN(year)) {
        return new Date(year, monthIndex, day);
      }
    }
    const parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }
    return new Date();
  };

  // Adds `days` to a "DD-MMM-YYYY" date string and returns the same format.
  // Used to auto-generate the Drop Date from Pickup Date + Number of Days.
  const addDays = (dateStr, days) => {
    const numDays = Number(days);
    if (!dateStr || !numDays || isNaN(numDays)) return "";

    const date = parseCustomDate(dateStr);
    date.setDate(date.getDate() + numDays);

    return date
      .toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(/ /g, "-");
  };

  // Combines a "DD-MMM-YYYY" date string with a "HH:MM AM/PM" time string
  // into a single real Date object carrying both.
  const combineDateAndTime = (dateStr, timeStr) => {
    const dateObj = parseCustomDate(dateStr);
    const { hours, minutes } = parseTimeToHM(timeStr);
    dateObj.setHours(hours, minutes, 0, 0);
    return dateObj;
  };

  // Core 8AM->8AM rule: count full 24-hour blocks between two real
  // datetimes (rounding UP any partial block into a new day).
  // Only used to re-derive a day count from lead data on load; the user
  // otherwise enters Number of Days directly.
  const computeDaysBetween = (start, end) => {
    if (!start || !end || isNaN(start) || isNaN(end)) return 1;
    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) return 1; // drop at/before pickup -> minimum 1 day
    return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  };

  // Compute inclusive rental duration (8AM -> 8AM cycle) between the pickup
  // and drop date+time.
  const calculateTotalDays = (
    pickupDateStr,
    pickupTimeStr,
    dropDateStr,
    dropTimeStr,
  ) => {
    if (!pickupDateStr || !dropDateStr) return 1;
    const start = combineDateAndTime(pickupDateStr, pickupTimeStr);
    const end = combineDateAndTime(dropDateStr, dropTimeStr);
    return computeDaysBetween(start, end);
  };

  // Standardize ISO Dates into Kolkata (IST) locale display format
  const formatDateIST = (date) => {
    if (!date) return "";
    return new Date(date)
      .toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(/ /g, "-"); // Replace spacing with hyphens matching UI states
  };

  // Convert localized display layout back to backend-compliant international YYYY-MM-DD format
  const formatToBackendDate = (dateStr) => {
    if (!dateStr) return "";
    const dateObj = parseCustomDate(dateStr);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const filteredVehicles = vehicles.filter((vehicle) => {
    const search = vehicleSearch.toLowerCase();
    return (
      vehicle?.vehicleName?.toLowerCase().includes(search) ||
      vehicle?.vehicleNumber?.toLowerCase().includes(search) ||
      vehicle?.color?.toLowerCase().includes(search)
    );
  });

  // Fetch real, available vehicles from the backend
  const loadVehicles = useCallback(async () => {
    if (!token) return;
    setVehiclesLoading(true);
    try {
      const vehicleRes = await api.get("/vehicles/getAll", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVehicles(vehicleRes.data.data || []);
    } catch (err) {
      console.log("Vehicle Fetch Error:", err?.response?.data?.message || err?.message);
    } finally {
      setVehiclesLoading(false);
    }
  }, [token]);

  // Fetch lead details (only relevant for the lead-conversion flow)
  const loadLeadDetails = useCallback(
    async (isRefreshing = false) => {
      if (!token || !lead) return;

      if (isRefreshing) setRefreshing(true);
      else setScreenLoading(true);

      try {
        const parsedLead = JSON.parse(lead);
        const res = await api.get(`/leads/${parsedLead._id}/create-booking`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = res.data.data;
        setLeadData(data);

        setCustomerName(data.customerName || "");
        setMobileNumber(data.mobileNumber || "");

        // Incoming ISO dates (YYYY-MM-DD) converted to DD-MMM-YYYY layout
        const finalPickup = data.booking?.fromDate
          ? formatDateIST(data.booking.fromDate)
          : formatDateIST(data.fromDate);
        setPickupDate(finalPickup);

        const finalDrop = data.booking?.toDate
          ? formatDateIST(data.booking.toDate)
          : formatDateIST(data.toDate);
        setDropDate(finalDrop);

        // Default to the standard 8AM cycle whenever the lead doesn't
        // specify its own times.
        const finalPickupTime = data.booking?.pickupTime || "08:00 AM";
        const finalDropTime = data.booking?.dropTime || "08:00 AM";
        setPickupTime(finalPickupTime);
        setDropTime(finalDropTime);

        setAltNumber(data.booking?.alternateMobileNumber || "");
        setOccupation(data.booking?.occupation || "");
        setAadharCard(data.booking?.aadhaarNumber || "");
        setDlNumber(data.booking?.drivingLicenseNumber || "");
        setResidents(String(data.booking?.residents || 1));

        // Pickup / Drop service, prefilled from the lead's prior booking (if any)
        const priorPickupDrop = Boolean(data.booking?.pickupDropRequired);
        setNeedPickupDrop(priorPickupDrop);
        setServiceType(data.booking?.serviceType || "pickup_drop");
        setPickupLocation(data.booking?.pickup?.location || "");
        setPickupLandmark(data.booking?.pickup?.landmark || "");
        setPickupMapLink(data.booking?.pickup?.mapLink || "");
        setPickupCharge(
          data.booking?.pickup?.charge
            ? String(data.booking.pickup.charge)
            : "",
        );
        setDropLocation(data.booking?.drop?.location || "");
        setDropLandmark(data.booking?.drop?.landmark || "");
        setDropMapLink(data.booking?.drop?.mapLink || "");
        setDropCharge(
          data.booking?.drop?.charge ? String(data.booking.drop.charge) : "",
        );
        setPickupDropNotes(data.booking?.pickupDropNotes || "");

        if (mode === "new") {
          // Fresh booking against this lead: don't drag over the previous
          // destination / amounts / vehicle selection.
          setDestination("");
          setBookingAmount("");
          setDiscount("");
          setSelectedVehicle(null);
          setVehicleInfo({ model: "", plateNumber: "" });
        } else {
          setDestination(data.booking?.destination || "");
          setBookingAmount(
            data.booking?.bookingAmount
              ? String(data.booking.bookingAmount)
              : "",
          );
          setDiscount(
            data.booking?.discountAmount
              ? String(data.booking.discountAmount)
              : "",
          );

          if (data.booking?.vehicleId) {
            const vehicle = data.booking.vehicleId;
            setSelectedVehicle(vehicle);
            setVehicleInfo({
              model: vehicle.vehicleName,
              plateNumber: vehicle.vehicleNumber,
            });
          } else {
            setSelectedVehicle(null);
            setVehicleInfo({ model: "", plateNumber: "" });
          }
        }

        setTotalDays(
          calculateTotalDays(
            finalPickup,
            finalPickupTime,
            finalDrop,
            finalDropTime,
          ),
        );
      } catch (err) {
        console.log("Initialization Error:", err?.response?.data?.message || err?.message);
      } finally {
        setScreenLoading(false);
        setRefreshing(false);
      }
    },
    [lead, token, mode],
  );

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    if (!isFreshBooking) {
      loadLeadDetails();
    }
  }, [isFreshBooking, loadLeadDetails]);

  // Auto-derive Drop Date/Time from Pickup Date + Number of Days.
  useEffect(() => {
    if (!pickupDate || !totalDays) return;

    if (!dropDateEdited) {
      const returnDate = addDays(pickupDate, totalDays);
      if (returnDate) setDropDate(returnDate);
    }

    if (rentalType === "standard") {
      setPickupTime("08:00 AM");

      if (!dropTimeEdited) {
        setDropTime("08:00 AM");
      }
    } else {
      if (!dropTimeEdited) {
        setDropTime(pickupTime);
      }
    }
  }, [
    pickupDate,
    pickupTime,
    totalDays,
    rentalType,
    dropDateEdited,
    dropTimeEdited,
  ]);

  const handleRefresh = () => {
    loadVehicles();
    if (!isFreshBooking) loadLeadDetails(true);
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
      const targetVal = target === "pickupDate" ? pickupDate : dropDate;
      initialDate = parseCustomDate(targetVal);
    } else {
      const targetVal = target === "pickupTime" ? pickupTime : dropTime;
      if (targetVal) {
        const { hours, minutes } = parseTimeToHM(targetVal);
        initialDate = new Date();
        initialDate.setHours(hours, minutes, 0, 0);
      }
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
      const formattedDate = selectedDate
        .toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .replace(/ /g, "-");

      if (currentPickerTarget === "pickupDate") {
        setPickupDate(formattedDate);

        // Keep Number of Days in sync if a Drop Date already exists
        // (whether it was auto-calculated or manually overridden).
        if (dropDate) {
          const days = calculateTotalDays(
            formattedDate,
            pickupTime,
            dropDate,
            dropTime,
          );
          setTotalDays(String(days));
        }
      }

      if (currentPickerTarget === "dropDate") {
        setDropDate(formattedDate);
        setDropDateEdited(true);

        const days = calculateTotalDays(
          pickupDate,
          pickupTime,
          formattedDate,
          dropTime,
        );
        setTotalDays(String(days));
      }
    } else {
      // 12-Hour standard string formatting with AM/PM
      let hours = selectedDate.getHours();
      const minutes = String(selectedDate.getMinutes()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12;
      const formattedTime = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;

      if (currentPickerTarget === "pickupTime") {
        setPickupTime(formattedTime);

        if (pickupDate && dropDate) {
          const days = calculateTotalDays(
            pickupDate,
            formattedTime,
            dropDate,
            dropTime,
          );
          setTotalDays(String(days));
        }
      }
      if (currentPickerTarget === "dropTime") {
        setDropTime(formattedTime);
        setDropTimeEdited(true);

        if (pickupDate && dropDate) {
          const days = calculateTotalDays(
            pickupDate,
            pickupTime,
            dropDate,
            formattedTime,
          );
          setTotalDays(String(days));
        }
      }
    }
  };

  // Keep "Number of Days" numeric-only so downstream date math never
  // silently breaks on stray characters.
  const handleTotalDaysChange = (text) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    setTotalDays(cleaned);
  };

  const handleSubmitBooking = async () => {
    if (!customerName.trim()) return alert("Customer name is required");
    if (!mobileNumber.trim()) return alert("Mobile number is required");
    if (!selectedVehicle) return alert("Please select a vehicle");
    if (!pickupDate.trim()) return alert("Pickup date is required");
    if (!dropDate.trim()) return alert("Drop date is required");
    if (!totalDays || Number(totalDays) < 1) {
      return alert("Number of days must be at least 1");
    }

    if (needPickupDrop) {
      if (
        (serviceType === "pickup" || serviceType === "pickup_drop") &&
        !pickupLocation.trim()
      ) {
        return alert("Pickup location is required");
      }
      if (
        (serviceType === "drop" || serviceType === "pickup_drop") &&
        !dropLocation.trim()
      ) {
        return alert("Drop location is required");
      }
    }

    setSubmitting(true);
    try {
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
        bookingAmount: Number(bookingAmount) || 0,
        discountAmount: Number(discount) || 0,
        securityDeposit: Number(securityDeposit) || 0,
        residents: Number(residents) || 1,
        fromDate: formatToBackendDate(pickupDate),
        toDate: formatToBackendDate(dropDate),
        pickupTime,
        dropTime,
        totalDays: Number(totalDays) || 1,
        rentalType,
        fastagBalance: Number(fastagBalance) || 0,

        // Pickup / Drop service
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
      };

      if (leadData?._id) {
        // Lead-conversion flow
        await api.put(`/leads/${leadData._id}/create-booking`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        // Fresh / walk-in booking flow
        await api.post("/bookings/create", payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      alert(
        mode === "new"
          ? "New booking created successfully."
          : "Booking created successfully.",
      );
      router.back();
    } catch (err) {
      console.log("Error:", err?.response?.data?.message || err?.message);
      alert(err.response?.data?.message || "Unable to create booking");
    } finally {
      setSubmitting(false);
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

  const safeTotalDays = Number(totalDays) || 0;
  const vehicleAmount =
    Number(selectedVehicle?.pricePerDay || 0) * safeTotalDays;

  const pickupAmount =
    needPickupDrop &&
    (serviceType === "pickup" || serviceType === "pickup_drop")
      ? Number(pickupCharge || 0)
      : 0;

  const dropAmount =
    needPickupDrop && (serviceType === "drop" || serviceType === "pickup_drop")
      ? Number(dropCharge || 0)
      : 0;

  const fastagAmount = Number(fastagBalance || 0);

  const serviceAmount = pickupAmount + dropAmount;

  // Rental charges only
  const rentalAmount = vehicleAmount + serviceAmount + fastagAmount;

  const discountAmount = Number(discount || 0);
  const bookingAdvance = Number(bookingAmount || 0);
  const securityAmount = Number(securityDeposit || 0);

  // Customer payable (gross) — the headline "total" shown in the header and
  // as "Final Payable Amount" in the bill. Discount does NOT reduce this;
  // it only reduces what's still owed (see balanceAmount below).
  const finalAmount = Math.max(rentalAmount, 0);

  // Balance after advance AND discount — both come off here, not off the total.
  const balanceAmount = Math.max(
    finalAmount - bookingAdvance - discountAmount,
    0,
  );

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
          <Text style={styles.navBarTitle}>
            {isFreshBooking
              ? "New Booking"
              : mode === "new"
                ? "New Booking"
                : "Create Booking"}
          </Text>
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
              style={styles.input}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Enter full name"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.label}>Primary Mobile Number *</Text>
            <TextInput
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
              style={styles.input}
              value={occupation}
              onChangeText={setOccupation}
              placeholder="e.g., Business, Consultant"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.label}>Number of Residents / Travellers</Text>
            <TextInput
              style={styles.input}
              value={residents}
              onChangeText={setResidents}
              placeholder="1"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />
          </View>

          {/* Travel & Identity Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>Travel & Identity Proof</Text>
            <Text style={styles.label}>Destination</Text>
            <TextInput
              style={styles.input}
              value={destination}
              onChangeText={setDestination}
              placeholder="Enter travel destination"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.label}>Aadharcard Number</Text>
            <TextInput
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
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <Text style={styles.label}>Selected Vehicle *</Text>

              <TouchableOpacity
                onPress={loadVehicles}
                disabled={vehiclesLoading}
                style={styles.refreshButton}
              >
                {vehiclesLoading ? (
                  <ActivityIndicator size="small" color="#2563EB" />
                ) : (
                  <Ionicons name="refresh" size={18} color="#2563EB" />
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.selectorPressable}
              onPress={() => setShowVehicleModal(true)}
              disabled={vehiclesLoading}
            >
              <Text
                style={[
                  styles.selectorText,
                  !vehicleInfo.model && { color: "#94A3B8" },
                ]}
              >
                {vehiclesLoading
                  ? "Loading available vehicles..."
                  : vehicleInfo.model
                    ? `${vehicleInfo.model} ${vehicleInfo.plateNumber ? `(${vehicleInfo.plateNumber})` : ""}`
                    : "Tap to select an available fleet asset..."}
              </Text>
              {vehiclesLoading ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Ionicons name="car-sport-outline" size={20} color="#64748B" />
              )}
            </TouchableOpacity>
            {selectedVehicle && safeTotalDays > 0 && (
              <Text style={styles.helperText}>
                ₹{Number(selectedVehicle.pricePerDay || 0).toLocaleString()} ×{" "}
                {safeTotalDays} day{safeTotalDays > 1 ? "s" : ""} = ₹
                {vehicleAmount.toLocaleString()}
              </Text>
            )}

            <Text style={styles.label}>FASTag Amount(₹)</Text>
            <TextInput
              style={styles.input}
              value={fastagBalance}
              onChangeText={setFastagBalance}
              placeholder="Enter FASTag balance"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />

            <Text style={styles.label}>Security Deposit (₹)</Text>
            <TextInput
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

            <Text style={styles.label}>Rental Type</Text>
            <View style={styles.radioRow}>
              <TouchableOpacity
                style={styles.radioItem}
                onPress={() => setRentalType("standard")}
              >
                <Ionicons
                  name={
                    rentalType === "standard"
                      ? "radio-button-on"
                      : "radio-button-off"
                  }
                  size={22}
                  color="#2563EB"
                />
                <Text style={{ marginLeft: 8 }}>Standard (8AM - 8AM)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.radioItem}
                onPress={() => setRentalType("flexible")}
              >
                <Ionicons
                  name={
                    rentalType === "flexible"
                      ? "radio-button-on"
                      : "radio-button-off"
                  }
                  size={22}
                  color="#2563EB"
                />
                <Text style={{ marginLeft: 8 }}>Flexible (24 Hours)</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Number of Days *</Text>
            <TextInput
              style={styles.input}
              value={totalDays}
              onChangeText={handleTotalDaysChange}
              keyboardType="numeric"
              placeholder="Enter days"
              placeholderTextColor="#94A3B8"
            />

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
                <Text style={styles.label}>Drop Date</Text>
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
                <Text style={styles.label}>Drop Time</Text>
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

            {(dropDateEdited || dropTimeEdited) && (
              <TouchableOpacity
                onPress={() => {
                  setDropDateEdited(false);
                  setDropTimeEdited(false);
                }}
                style={{ alignSelf: "flex-start", marginTop: -2 }}
              >
                <Text style={styles.resetAutoText}>
                  Reset to auto-calculated drop date/time
                </Text>
              </TouchableOpacity>
            )}
          </View>

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

          {/* Android Picker Core */}
          {showPicker && Platform.OS === "android" && (
            <DateTimePicker
              value={pickerDateValue}
              mode={pickerMode}
              display="default"
              onValueChange={onPickerChange}
              onDismiss={() => setShowPicker(false)}
            />
          )}

          {/* Bill Summary / Invoice Section (Zomato-style expandable bill) */}
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
                    {safeTotalDays > 0
                      ? `${safeTotalDays} day${safeTotalDays > 1 ? "s" : ""} • `
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
                {selectedVehicle && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>
                      Vehicle Rent{" "}
                      {safeTotalDays > 0
                        ? `(₹${Number(
                            selectedVehicle.pricePerDay || 0,
                          ).toLocaleString()} × ${safeTotalDays} day${
                            safeTotalDays > 1 ? "s" : ""
                          })`
                        : ""}
                    </Text>
                    <Text style={styles.invoiceValue}>
                      ₹{vehicleAmount.toLocaleString()}
                    </Text>
                  </View>
                )}

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
                  (serviceType === "drop" || serviceType === "pickup_drop") && (
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
                  <Text style={styles.invoiceBalanceLabel}>Balance Due</Text>
                  <Text style={styles.invoiceBalanceValue}>
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

          <TouchableOpacity
            style={[styles.submitButton, submitting && { opacity: 0.7 }]}
            onPress={handleSubmitBooking}
            activeOpacity={0.8}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isFreshBooking || mode === "new"
                  ? "Create New Booking"
                  : "Confirm & Create Booking"}
              </Text>
            )}
          </TouchableOpacity>
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
                placeholder="Search by name, number or color..."
                placeholderTextColor="#94A3B8"
                value={vehicleSearch}
                onChangeText={setVehicleSearch}
                style={styles.searchInput}
                autoCorrect={false}
              />
            </View>
          </View>

          {vehiclesLoading ? (
            <View style={styles.centeredContainer}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.loadingText}>Loading vehicles...</Text>
            </View>
          ) : filteredVehicles.length === 0 ? (
            <View style={styles.centeredContainer}>
              <Ionicons name="car-sport-outline" size={40} color="#CBD5E1" />
              <Text style={styles.loadingText}>No vehicles found.</Text>
            </View>
          ) : (
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
                          ₹{Number(vehicle.pricePerDay || 0).toLocaleString()}
                          /Day
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
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color="#94A3B8"
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
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
  resetAutoText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
    marginTop: 2,
    marginBottom: 4,
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
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.2,
    borderColor: "#D6E0EA",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 10,
    minHeight: 56,
  },
  pickerTriggerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
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
  radioRow: {
    marginVertical: 10,
  },

  radioItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  refreshButton: {
    padding: 4,
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
