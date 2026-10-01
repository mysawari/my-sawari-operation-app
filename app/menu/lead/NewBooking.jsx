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

// Month lookup used for manual "DD-MMM-YYYY" formatting (see formatLocalDate).
// Building this string manually — instead of via toLocaleDateString().replace(" ", "-")
// — avoids a Hermes/Intl bug where en-IN date parts are joined with a narrow
// no-break space (U+202F) instead of a normal space (U+0020). That invisible
// character broke the previous `.replace(/ /g, "-")` call, which meant
// dropDate/pickupDate strings never actually contained hyphens, which meant
// parseCustomDate() silently fell back to `new Date()` (i.e. "today"), which
// meant total-day calculations silently collapsed to 1 day no matter what
// dates were picked.
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

// Midnight, local device time, for "today" comparisons (Pickup Date must be
// >= today; Drop Date must be >= Pickup Date). Kept as its own helper so
// every "is this in the past" check anchors to the same instant.
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

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
  const [paymentMethod, setPaymentMethod] = useState("phonepe");
  const [upiLast4, setUpiLast4] = useState("");
  const [residents, setResidents] = useState("1");
  const [securityDeposit, setSecurityDeposit] = useState("");

  // SCHEDULE STATES - Localized formatting: "DD-MMM-YYYY"
  const [rentalType, setRentalType] = useState("standard");
  // standard | flexible

  // Default to "1" (not "") so that picking a Pickup Date alone is enough
  // to derive a Drop Date immediately — see the auto-calc effect below,
  // which bails out early if totalDays is falsy.
  const [totalDays, setTotalDays] = useState("1");

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

  // Bill Summary (invoice-style breakdown) - collapsed by default, tap the
  // header total to expand/close it in place, Zomato-style.
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

  // Convert UI readable format (e.g., "15-Jul-2026") back to a safe JS Date object.
  // NOTE: dateStr is trimmed defensively before split — protects against any
  // stray whitespace (including non-standard Unicode spaces) sneaking back in
  // from a future edit, so a bad string fails loudly via Date.parse's own
  // fallback rather than silently resolving to "today".
  const parseCustomDate = (dateStr) => {
    if (!dateStr) return new Date();
    const parts = dateStr.trim().split("-");
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

    return formatLocalDate(date);
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
  // e.g. 18-Jul 8AM -> 20-Jul 8AM = exactly 48h = 2 days.
  //      18-Jul 8AM -> 19-Jul 9AM = 25h -> rounds up to 2 days.
  const computeDaysBetween = (start, end) => {
    if (!start || !end || isNaN(start) || isNaN(end)) return 1;
    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) return 1; // drop at/before pickup -> minimum 1 day
    return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  };

  // Compute inclusive rental duration (8AM -> 8AM cycle) between the pickup
  // and drop date+time. Both date strings ("DD-MMM-YYYY") and time strings
  // ("HH:MM AM/PM") are required to get an accurate day count. Called
  // whenever pickup/drop date OR pickup/drop time changes so that pushing
  // the drop time later in the day (e.g. 8:00 AM -> 9:00 AM) correctly
  // rounds up into an extra day.
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

  // Standardize ISO Dates (from the backend, in UTC) into Kolkata (IST)
  // locale display format "DD-MMM-YYYY".
  //
  // Uses Intl.DateTimeFormat#formatToParts instead of
  // toLocaleDateString().replace(" ", "-") — the previous approach broke
  // silently on Hermes because en-IN inserts a narrow no-break space
  // (U+202F) between date parts instead of a normal space, so the regex
  // replace never matched and the hyphens were never inserted.
  // formatToParts sidesteps this entirely by reading structured parts
  // instead of parsing/replacing a rendered string.
  const formatDateIST = (date) => {
    if (!date) return "";
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).formatToParts(new Date(date));

    const day = parts.find((p) => p.type === "day")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const year = parts.find((p) => p.type === "year")?.value;

    if (!day || !month || !year) return "";

    return `${day}-${month}-${year}`;
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

  // True if the given "DD-MMM-YYYY" string is strictly before today
  // (local device date, time stripped). Used to block past-dated bookings
  // both at the picker level (minimumDate) and again at submit time as a
  // defensive backstop, since some Android OEM picker builds allow
  // scrolling past the configured minimum.
  const isDateBeforeToday = (dateStr) => {
    if (!dateStr) return false;
    const d = parseCustomDate(dateStr);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < startOfToday().getTime();
  };

  // The floor a given picker target is allowed to go to:
  // - Pickup Date can't be before today.
  // - Drop Date can't be before the currently-selected Pickup Date (falls
  //   back to today if Pickup Date isn't set yet).
  const getPickerMinimumDate = () => {
    if (pickerMode !== "date") return undefined;
    if (currentPickerTarget === "pickupDate") return startOfToday();
    if (currentPickerTarget === "dropDate") {
      if (pickupDate) {
        const base = parseCustomDate(pickupDate);
        base.setHours(0, 0, 0, 0);
        return base;
      }
      return startOfToday();
    }
    return undefined;
  };

  const filteredVehicles = vehicles.filter((vehicle) => {
    const search = vehicleSearch.toLowerCase();
    return (
      vehicle?.vehicleName?.toLowerCase().includes(search) ||
      vehicle?.vehicleNumber?.toLowerCase().includes(search) ||
      vehicle?.color?.toLowerCase().includes(search)
    );
  });

  // Fetch real, available vehicles from the backend (replaces any mock data)
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

        // A lead may carry its own explicit dates - once both exist, trust
        // the actual computed gap between them rather than clobbering it
        // with the "1" default that new/fresh bookings start with.
        setTotalDays(
          String(
            calculateTotalDays(
              finalPickup,
              finalPickupTime,
              finalDrop,
              finalDropTime,
            ),
          ),
        );

        // The lead already carries an explicit Drop Date/Time, so don't let
        // the auto-calc effect below silently recompute and overwrite it.
        setDropDateEdited(Boolean(finalDrop));
        setDropTimeEdited(Boolean(data.booking?.dropTime));
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

  // Whenever Pickup Date, Pickup Time, or Number of Days changes, re-derive
  // the Drop Date/Time - UNLESS the user has manually overridden that
  // specific field via its own picker (dropDateEdited / dropTimeEdited), or
  // just typed a new day count directly (handleTotalDaysChange resets those
  // flags so this effect is allowed to take back over).
  useEffect(() => {
    if (!pickupDate || !totalDays) return;

    if (!dropDateEdited) {
      const returnDate = addDays(pickupDate, totalDays);
      if (returnDate) setDropDate(returnDate);
    }

    if (!dropTimeEdited) {
      if (rentalType === "standard") {
        // Follow pickup time
        setDropTime(pickupTime || "08:00 AM");
      } else {
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
      initialDate = targetVal ? parseCustomDate(targetVal) : new Date();

      // Never open the wheel pre-set to a moment that's already below the
      // floor we're about to enforce (e.g. opening Drop Date for the first
      // time with no prior value defaults to "now", which could be before
      // Pickup Date).
      const floor =
        target === "pickupDate"
          ? startOfToday()
          : pickupDate
            ? parseCustomDate(pickupDate)
            : startOfToday();
      if (initialDate.getTime() < floor.getTime()) {
        initialDate = new Date(floor);
      }
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
      const formattedDate = formatLocalDate(selectedDate);

      // Pickup Date is picked directly by the user. Drop Date is normally
      // auto-generated by the effect above, but the user can also tap it
      // to override manually - once they do, dropDateEdited stops the
      // auto-calculation from overwriting it again.
      if (currentPickerTarget === "pickupDate") {
        // Guard against past dates slipping through even if a particular
        // OEM's Android picker UI allows scrolling before minimumDate.
        if (isDateBeforeToday(formattedDate)) {
          alert("Pickup date cannot be in the past");
          return;
        }

        setPickupDate(formattedDate);

        // A new Pickup Date invalidates any manually-picked Drop Date that
        // now sits before it - fall back to auto-calculated so the
        // effect above can re-derive a valid Drop Date/Time.
        if (dropDate) {
          const dropObj = parseCustomDate(dropDate);
          const pickupObj = parseCustomDate(formattedDate);
          if (dropObj.getTime() < pickupObj.getTime()) {
            setDropDateEdited(false);
            setDropTimeEdited(false);
          } else {
            // Recalculate total days if drop date already exists and is
            // still valid relative to the new pickup date.
            const days = calculateTotalDays(
              formattedDate,
              pickupTime,
              dropDate,
              dropTime,
            );
            setTotalDays(String(days));
          }
        }

        // Default Standard bookings to 8:00 AM
        if (rentalType === "standard" && !pickupTime) {
          setPickupTime("08:00 AM");
        }
      }

      if (currentPickerTarget === "dropDate") {
        // Drop Date can never sit before Pickup Date.
        const dropObj = parseCustomDate(formattedDate);
        const pickupObj = pickupDate ? parseCustomDate(pickupDate) : null;
        if (pickupObj && dropObj.getTime() < pickupObj.getTime()) {
          alert("Drop date cannot be before pickup date");
          return;
        }

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

      // Pickup Time is picked directly (only enabled for Flexible rentals -
      // Standard keeps it locked to 8:00 AM). Drop Time is normally derived
      // by the effect above, but the user can tap it to override manually;
      // dropTimeEdited then stops the auto-calculation from resetting it.
      if (currentPickerTarget === "pickupTime") {
        setPickupTime(formattedTime);

        // Pickup time shifts the whole 8AM->8AM cycle, so if a Drop Date
        // is already set, re-check whether the gap now rounds up into an
        // extra day (or drops one) and keep Number of Days in sync.
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

        // Moving Drop Time later than Pickup Time's time-of-day (e.g.
        // 8:00 AM -> 9:00 AM) pushes the stay past a full 24-hour block,
        // which rounds up into one extra day under the 8AM->8AM rule -
        // recompute Number of Days to reflect that automatically.
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
  // silently breaks on stray characters. Typing a new day count is an
  // explicit request to re-derive Drop Date/Time from Pickup Date + days,
  // so hand back control to the auto-calc effect even if the user had
  // previously hand-picked a custom Drop Date/Time.
  const handleTotalDaysChange = (text) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    setTotalDays(cleaned);
    setDropDateEdited(false);
    setDropTimeEdited(false);
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

    // Past-booking guard: Pickup Date can't be before today, and Drop Date
    // can't be before Pickup Date. Re-checked here as a hard backstop even
    // though the pickers themselves are constrained, in case dates arrived
    // via a lead prefill or the picker's own minimumDate was bypassed.
    if (isDateBeforeToday(pickupDate)) {
      return alert("Pickup date cannot be in the past");
    }
    const pickupDateObj = parseCustomDate(pickupDate);
    const dropDateObj = parseCustomDate(dropDate);
    if (dropDateObj.getTime() < pickupDateObj.getTime()) {
      return alert("Drop date cannot be before pickup date");
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
        paymentMethod,
        upiLast4: paymentMethod === "phonepe" ? upiLast4 : "",
        fastagBalance: Number(fastagBalance) || 0,
        residents: Number(residents) || 1,
        fromDate: formatToBackendDate(pickupDate),
        toDate: formatToBackendDate(dropDate),
        pickupTime,
        dropTime,
        totalDays: Number(totalDays) || 1,

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
        // Fresh / walk-in booking flow -> hits the createBooking controller
        await api.post("/leads/create", payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      alert(
        mode === "new"
          ? "New booking created successfully."
          : "Booking created successfully.",
      );
      router.push("/(tabs)/new-booking");
    } catch (err) {
      console.log("Error:", err?.response?.data?.message || err?.message);
      alert(
        err.response?.data?.message
          ? `${customerName ? `Customer: ${customerName}\n\n` : ""}${err.response.data.message}`
          : "Unable to create booking",
      );
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

  const discountAmount = Number(discount || 0);
  const bookingAdvance = Number(bookingAmount || 0);
  const securityAmount = Number(securityDeposit || 0);

  const serviceAmount = pickupAmount + dropAmount;

  // Rental charges only
  const rentalAmount = vehicleAmount + serviceAmount + fastagAmount;

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

  // Total money collected today (optional)
  const totalCollected = bookingAdvance + securityAmount;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.customNavigationBar}>
        <View style={styles.navBarTopRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>

          <Text style={styles.navBarTitle}>
            {isFreshBooking
              ? "New Booking"
              : mode === "new"
                ? "New Booking"
                : "Create Booking"}
          </Text>

          <View style={{ width: 40 }} />
        </View>

        {/* Bill Summary now lives in the header - tap the total row to
            expand/close the full invoice breakdown in place, Zomato-style,
            instead of a separate section further down the form. */}
        {selectedVehicle && (
          <TouchableOpacity
            style={styles.headerBillToggleRow}
            onPress={() => setShowBillSummary((prev) => !prev)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTotalAmount}>
                ₹{finalAmount.toLocaleString()}
              </Text>
              <Text style={styles.headerAdvanceDue}>
                Advance ₹{bookingAdvance.toLocaleString()} • Due ₹
                {balanceAmount.toLocaleString()}
                {!showBillSummary ? "  •  Tap for bill summary" : ""}
              </Text>
            </View>
            <Ionicons
              name={showBillSummary ? "chevron-up" : "chevron-down"}
              size={20}
              color="#64748B"
            />
          </TouchableOpacity>
        )}

        {selectedVehicle && showBillSummary && (
          <View style={styles.headerInvoiceBox}>
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

            {needPickupDrop &&
              (serviceType === "pickup" || serviceType === "pickup_drop") && (
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
              <Text style={styles.invoiceTotalLabel}>Total Rental Amount</Text>
              <Text style={styles.invoiceTotalValue}>
                ₹{rentalAmount.toLocaleString()}
              </Text>
            </View>

            <View style={styles.invoiceDivider} />

            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceGrandLabel}>Final Payable Amount</Text>
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
            <Text style={styles.label}>FASTag Amount (₹)</Text>
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

          {/* Payment Method */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>Payment Method</Text>

            <Text style={styles.label}>Payment Type</Text>

            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[
                  styles.segmentedOption,
                  paymentMethod === "cash" && styles.segmentedOptionActive,
                ]}
                onPress={() => {
                  setPaymentMethod("cash");
                  setUpiLast4("");
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentedText,
                    paymentMethod === "cash" && styles.segmentedTextActive,
                  ]}
                >
                  Cash
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentedOption,
                  paymentMethod === "phonepe" && styles.segmentedOptionActive,
                ]}
                onPress={() => setPaymentMethod("phonepe")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentedText,
                    paymentMethod === "phonepe" && styles.segmentedTextActive,
                  ]}
                >
                  PhonePe
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentedOption,
                  paymentMethod === "razorpay" && styles.segmentedOptionActive,
                ]}
                onPress={() => {
                  setPaymentMethod("razorpay");
                  setUpiLast4("");
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentedText,
                    paymentMethod === "razorpay" && styles.segmentedTextActive,
                  ]}
                >
                  Razorpay
                </Text>
              </TouchableOpacity>
            </View>

            {paymentMethod === "phonepe" && (
              <>
                <Text style={styles.label}>UPI Last 4 Digits</Text>

                <TextInput
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
                    minimumDate={getPickerMinimumDate()}
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
              minimumDate={getPickerMinimumDate()}
              onValueChange={onPickerChange}
              onDismiss={() => setShowPicker(false)}
            />
          )}

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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  navBarTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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

  // ── Bill Summary / Invoice (now header-integrated, Zomato-style) ──
  headerBillToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  headerTotalAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#16A34A",
  },
  headerAdvanceDue: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  headerInvoiceBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
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
