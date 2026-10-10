import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking, // FIX: was used for "Track Location" but never imported
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import api from "../../../services/api";
import useAuthStore from "../../../store/authStore";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

const formatTime = (date) =>
  new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

const sanitizeAmountInput = (text) => {
  let cleaned = text.replace(/[^0-9.]/g, "");

  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, "");
  }

  return cleaned;
};

const makeAmountHandler = (setter) => (text) =>
  setter(sanitizeAmountInput(text));

const isValidDate = (value) => {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
};

export default function EditRentalScreen() {
  const router = useRouter();
  const {
    rentalId,
    customerName: navCustomerName,
    customerPhone: navCustomerPhone,
    vehicleModel: navVehicleModel,
    plateNumber: navPlateNumber,
    pickupDateTime: navPickupDateTime,
    newDropDate,
    extensionId,
  } = useLocalSearchParams();
  const { token } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [showBillSummary, setShowBillSummary] = useState(true);
  const [showRecapSummary, setShowRecapSummary] = useState(true);

  const [customerInfo, setCustomerInfo] = useState({
    name: navCustomerName || "",
    phone: navCustomerPhone || "",
    location: null,
  });
  const [vehicleInfo, setVehicleInfo] = useState({
    model: navVehicleModel || "",
    plateNumber: navPlateNumber || "",
  });
  const [bookingCode, setBookingCode] = useState("");
  const [pickupDate, setPickupDate] = useState(
    isValidDate(navPickupDateTime) ? new Date(navPickupDateTime) : new Date(),
  );

  const [originalDropDateTime, setOriginalDropDateTime] = useState(new Date());
  const [originalNumberOfDays, setOriginalNumberOfDays] = useState(1);
  const [dropDateTime, setDropDateTime] = useState(new Date());

  const [baseFare, setBaseFare] = useState(0);
  const [previousBillTotal, setPreviousBillTotal] = useState(0);
  const [extensionPrice, setExtensionPrice] = useState("0");
  const [fastagPayable, setFastagPayable] = useState("0");
  const [securityDeposit, setSecurityDeposit] = useState("0");
  const [extraCharges, setExtraCharges] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [membershipDiscount, setMembershipDiscount] = useState("0");
  const [sawariCashUsed, setSawariCashUsed] = useState("0");
  const [amountReceivedNow, setAmountReceivedNow] = useState("0");
  const [reasonForChange, setReasonForChange] = useState("");

  const [paymentType, setPaymentType] = useState("cash");
  const [phonePeLastFour, setPhonePeLastFour] = useState([""]);

  // NEW: refund given back to the customer (when rental is shortened)
  const [amountRefundedNow, setAmountRefundedNow] = useState("0");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [amountRefundedPreviously, setAmountRefundedPreviously] = useState(0);

  const onExtensionPriceChange = makeAmountHandler(setExtensionPrice);
  const onFastagChange = makeAmountHandler(setFastagPayable);
  const onSecurityDepositChange = makeAmountHandler(setSecurityDeposit);
  const onExtraChargesChange = makeAmountHandler(setExtraCharges);
  const onDiscountChange = makeAmountHandler(setDiscountAmount);
  const onAmountReceivedNowChange = makeAmountHandler(setAmountReceivedNow);
  const onAmountRefundedNowChange = makeAmountHandler(setAmountRefundedNow);

  const [pickupCharge, setPickupCharge] = useState(0);
  const [dropCharge, setDropCharge] = useState(0);

  const [bookingAmountPaid, setBookingAmountPaid] = useState(0);
  const [amountReceivedPreviously, setAmountReceivedPreviously] = useState(0);

  const [billSummary, setBillSummary] = useState(null);

  const [vehicles, setVehicles] = useState([]);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleSearch, setVehicleSearch] = useState("");

  const [exchangePhotos, setExchangePhotos] = useState({
    vehicleFront: null,
    vehicleRear: null,
    vehicleLeft: null,
    vehicleRight: null,
    additional: null,
  });
  const [originalVehicleId, setOriginalVehicleId] = useState(null);

  const filteredVehicles = vehicles.filter((vehicle) => {
    const search = vehicleSearch.toLowerCase();
    return (
      vehicle?.vehicleName?.toLowerCase().includes(search) ||
      vehicle?.vehicleNumber?.toLowerCase().includes(search) ||
      vehicle?.color?.toLowerCase().includes(search)
    );
  });

  const handlePhonePeLastFourChange = (index, text) => {
    const value = text.replace(/[^0-9]/g, "").slice(0, 4);
    setPhonePeLastFour((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };
  const addPhonePeReference = () => setPhonePeLastFour((prev) => [...prev, ""]);
  const removePhonePeReference = (index) =>
    setPhonePeLastFour((prev) => prev.filter((_, i) => i !== index));

  useEffect(() => {
    fetchRentalDetails();
  }, [rentalId]);

  const dropChanged = useMemo(
    () =>
      new Date(dropDateTime).getTime() !==
      new Date(originalDropDateTime).getTime(),
    [dropDateTime, originalDropDateTime],
  );

  // NEW: direction of the change (compared by time, not day count)
  const isShortened =
    dropChanged &&
    new Date(dropDateTime).getTime() < new Date(originalDropDateTime).getTime();
  const isExtended = dropChanged && !isShortened;

  const isVehicleExchange =
    Boolean(originalVehicleId) &&
    Boolean(selectedVehicle?._id) &&
    originalVehicleId !== selectedVehicle._id.toString();

  const newNumberOfDays = useMemo(() => {
    const days = Math.ceil(
      (new Date(dropDateTime) - new Date(pickupDate)) / (1000 * 60 * 60 * 24),
    );
    return Math.max(1, days);
  }, [dropDateTime, pickupDate]);

  const extraDays = newNumberOfDays - originalNumberOfDays;

  const currentExtensionAmount = parseFloat(extensionPrice) || 0;

  // CHANGED: extension adds, reduction subtracts
  const liveTotalFare = useMemo(() => {
    if (!dropChanged) return previousBillTotal;
    if (isShortened) {
      return Math.max(0, previousBillTotal - currentExtensionAmount);
    }
    return previousBillTotal + currentExtensionAmount;
  }, [previousBillTotal, currentExtensionAmount, dropChanged, isShortened]);

  const fastag = parseFloat(fastagPayable) || 0;
  const deposit = parseFloat(securityDeposit) || 0;
  const extra = parseFloat(extraCharges) || 0;
    const discount = parseFloat(discountAmount) || 0;
    const sawariCash = parseFloat(sawariCashUsed) || 0;
    const currentReceived = parseFloat(amountReceivedNow) || 0;
    const currentRefund = parseFloat(amountRefundedNow) || 0;

    const liveBillSummary = useMemo(() => {
      const totalAmount = Math.max(
        0,
        liveTotalFare +
          fastag +
          pickupCharge +
          dropCharge +
          deposit +
          extra -
          discount -
          sawariCash -
          (Number(membershipDiscount) || 0),
      );

    const amountReceivedNowCumulative =
      amountReceivedPreviously + currentReceived;

    // What the company holds BEFORE this refund
    const netBeforeRefund =
      bookingAmountPaid +
      amountReceivedNowCumulative -
      amountRefundedPreviously;

    // Max that can be refunded right now
    const refundable = Math.max(0, netBeforeRefund - totalAmount);

    const refundedTotal = amountRefundedPreviously + currentRefund;

    const totalCollected =
      bookingAmountPaid + amountReceivedNowCumulative - refundedTotal;

    const balanceAmount = Math.max(0, totalAmount - totalCollected);
    const refundDue = Math.max(0, totalCollected - totalAmount);

    return {
      totalFare: liveTotalFare,
      fastTagPayable: fastag,
      pickupCharge,
      dropCharge,
      securityDeposit: deposit,
      extraCharges: extra,
      discountAmount: discount,
      membershipDiscount: Number(membershipDiscount) || 0,
      sawariCashUsed: sawariCash,
      totalAmount,
      bookingAmountPaid,
      amountReceivedNow: amountReceivedNowCumulative,
      refundedAmount: refundedTotal,
      refundable,
      totalCollected,
      balanceAmount,
      refundDue,
    };
  }, [
    liveTotalFare,
    fastag,
    pickupCharge,
    dropCharge,
    deposit,
    extra,
    discount,
    bookingAmountPaid,
    amountReceivedPreviously,
    currentReceived,
    amountRefundedPreviously,
    currentRefund,
  ]);

  const grandTotal = liveBillSummary.totalAmount;
  const balanceAmount = liveBillSummary.balanceAmount;
  const refundDue = liveBillSummary.refundDue;
  const refundable = liveBillSummary.refundable;

  // Show refund section when customer has overpaid or a refund is typed
  const showRefundSection = refundable > 0 || currentRefund > 0;

  const fetchRentalDetails = async () => {
    try {
      setLoading(true);
      const cleanId = Array.isArray(rentalId) ? rentalId[0] : rentalId;
      if (!cleanId) return;

      const response = await api.get(`/handover/rentals/${cleanId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = response.data.data;
      const serverBillSummary = data.billSummary || null;

      setCustomerInfo({
        name: data.customerName,
        phone: data.customerPhone,
        location: data.customerLocation,
      });
      setBookingCode(data.bookingCode || "");
      setVehicleInfo({
        model: data.vehicleModel,
        plateNumber: data.plateNumber,
      });

      const currentVehicleId = data.vehicleId?.toString();
      setOriginalVehicleId(currentVehicleId);

      setSelectedVehicle({
        _id: data.vehicleId,
        vehicleName: data.vehicleModel,
        vehicleNumber: data.plateNumber,
        color: data.vehicleColor,
      });

      setPickupDate(new Date(data.pickupDateTime));
      setOriginalDropDateTime(new Date(data.dropDateTime));
      if (newDropDate && isValidDate(newDropDate)) {
        setDropDateTime(new Date(newDropDate));
      } else {
        setDropDateTime(new Date(data.dropDateTime));
      }

      setOriginalNumberOfDays(
        serverBillSummary?.originalBill?.numberOfDays || data.numberOfDays || 1,
      );

      setBaseFare(Number(data.baseFare) || 0);
      setPreviousBillTotal(
        Number(serverBillSummary?.previousBillTotal ?? data.totalFare) || 0,
      );
      setExtensionPrice("0");

      setFastagPayable(String(data.fastagCharges || 0));
      setSecurityDeposit(String(data.securityDeposit || 0));
      setExtraCharges(String(data.extraCharges || 0));
      setDiscountAmount(String(data.discountAmount || 0));
      setMembershipDiscount(String(data.membershipDiscount || 0));

      setBookingAmountPaid(data.bookingAmountPaid || 0);
      setAmountReceivedPreviously(data.amountReceivedPreviously || 0);

      // NEW: needs the GET endpoint to send this (see notes)
      setAmountRefundedPreviously(
        Number(
          data.amountRefundedPreviously ?? serverBillSummary?.refundedAmount,
        ) || 0,
      );

      setPickupCharge(
        Number(serverBillSummary?.pickupCharge ?? data.pickupCharge) || 0,
      );
      setDropCharge(
        Number(serverBillSummary?.dropCharge ?? data.dropCharge) || 0,
      );

      setBillSummary(serverBillSummary);

      setExchangePhotos({
        vehicleFront: null,
        vehicleRear: null,
        vehicleLeft: null,
        vehicleRight: null,
        additional: null,
      });

      setPaymentType("cash");
      setPhonePeLastFour([""]);
      setAmountRefundedNow("0");
      setRefundMethod("cash");
    } catch (error) {
      Alert.alert("Error", "Failed to load rental details.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableVehicles = async () => {
    try {
      setVehicleLoading(true);
      const res = await api.get("/vehicles/available", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVehicles(res.data.data || []);
    } finally {
      setVehicleLoading(false);
    }
  };

  const openVehicleModal = () => {
    setShowVehicleModal(true);
    if (vehicles.length === 0 && !vehicleLoading) {
      fetchAvailableVehicles();
    }
  };

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const current = new Date(dropDateTime);
      current.setFullYear(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
      );
      setDropDateTime(current);
    }
  };
  const IST_OFFSET_MINUTES = 5 * 60 + 30;

  const istWallClockToUtcIso = (date) => {
    const utcMillis = Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    );
    return new Date(utcMillis - IST_OFFSET_MINUTES * 60 * 1000).toISOString();
  };

  const onTimeChange = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const current = new Date(dropDateTime);
      current.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setDropDateTime(current);
    }
  };

  const toggleHistory = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowHistory((prev) => !prev);
  };

  const toggleBillSummary = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowBillSummary((prev) => !prev);
  };

  const toggleRecapSummary = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowRecapSummary((prev) => !prev);
  };

  const pickExchangePhoto = async (field) => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow photo library access.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      setExchangePhotos((prev) => ({
        ...prev,
        [field]: result.assets[0],
      }));
    } catch (error) {
      Alert.alert("Error", "Unable to select the image.");
    }
  };

  const captureExchangePhoto = async (field) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please allow camera access.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      setExchangePhotos((prev) => ({
        ...prev,
        [field]: result.assets[0],
      }));
    } catch (error) {
      Alert.alert("Error", "Unable to capture the image.");
    }
  };

  const selectExchangePhoto = (field, label) => {
    Alert.alert(`${label} Photo`, "Choose how you want to add the photo.", [
      { text: "Camera", onPress: () => captureExchangePhoto(field) },
      { text: "Gallery", onPress: () => pickExchangePhoto(field) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const removeExchangePhoto = (field) => {
    setExchangePhotos((prev) => ({ ...prev, [field]: null }));
  };

  const validateExchangePhotos = () => {
    if (!isVehicleExchange) return true;

    const requiredPhotos = [
      { key: "vehicleFront", label: "Front" },
      { key: "vehicleRear", label: "Rear" },
      { key: "vehicleLeft", label: "Left" },
      { key: "vehicleRight", label: "Right" },
    ];

    const missingPhotos = requiredPhotos
      .filter(({ key }) => !exchangePhotos[key])
      .map(({ label }) => label);

    if (missingPhotos.length > 0) {
      Alert.alert(
        "Vehicle Photos Required",
        `Please add the following photos:\n\n${missingPhotos.join("\n")}`,
      );
      return false;
    }
    return true;
  };

  const handleSaveChanges = async () => {
    if (!reasonForChange.trim()) {
      Alert.alert(
        "Validation Error",
        "Please provide a reason for modification.",
      );
      return;
    }

    // NEW: drop must stay after pickup
    if (
      dropChanged &&
      new Date(dropDateTime).getTime() <= new Date(pickupDate).getTime()
    ) {
      Alert.alert(
        "Invalid Drop Date",
        "Drop date and time must be after the pickup date and time.",
      );
      return;
    }

    // CHANGED: only extensions require a charge
    if (isExtended && currentExtensionAmount <= 0) {
      Alert.alert(
        "Extension Amount Required",
        "You extended the drop date — please enter the extension charge for this new bill.",
      );
      return;
    }

    // NEW: reduction cannot be more than the fare so far
    if (isShortened && currentExtensionAmount > previousBillTotal) {
      Alert.alert(
        "Invalid Reduction",
        `Fare reduction cannot be more than the current total fare (${formatMoney(previousBillTotal)}).`,
      );
      return;
    }

    if (currentReceived > 0) {
      if (
        paymentType === "phonepe" &&
        (phonePeLastFour.length === 0 ||
          phonePeLastFour.some((value) => value.length !== 4))
      ) {
        Alert.alert(
          "Payment Details Required",
          "Please enter valid 4-digit PhonePe reference numbers.",
        );
        return;
      }
    }

    // NEW: refund cannot exceed the overpaid amount
    if (currentRefund > 0 && currentRefund > refundable + 0.001) {
      Alert.alert(
        "Invalid Refund",
        `You can refund at most ${formatMoney(refundable)}.`,
      );
      return;
    }

    if (!validateExchangePhotos()) return;

    try {
      setSubmitting(true);
      const cleanId = Array.isArray(rentalId) ? rentalId[0] : rentalId;
      const formData = new FormData();

      formData.append("vehicleId", selectedVehicle?._id?.toString() || "");
      formData.append("dropDateTime", istWallClockToUtcIso(dropDateTime));
      // Positive number for both cases — the server decides +/− by
      // comparing the new drop with the current one.
      formData.append(
        "extensionPrice",
        String(dropChanged ? Number(extensionPrice) || 0 : 0),
      );
      formData.append("fastagCharges", String(Number(fastagPayable)));
      formData.append("securityDeposit", String(Number(securityDeposit)));
      formData.append("extraCharges", String(Number(extraCharges)));
      formData.append("discountAmount", String(Number(discountAmount)));
      formData.append("amountReceivedNow", String(Number(amountReceivedNow)));
      formData.append("paymentMethod", currentReceived > 0 ? paymentType : "");
      formData.append(
        "upiLast4",
        currentReceived > 0 && paymentType === "phonepe"
          ? JSON.stringify(phonePeLastFour.filter(Boolean))
          : "",
      );
      // NEW
      formData.append("amountRefundedNow", String(currentRefund));
      formData.append("refundMethod", currentRefund > 0 ? refundMethod : "");
      formData.append("reasonForChange", reasonForChange);

      if (isVehicleExchange) {
        const photoFields = [
          "vehicleFront",
          "vehicleRear",
          "vehicleLeft",
          "vehicleRight",
          "additional",
        ];
        photoFields.forEach((field) => {
          const photo = exchangePhotos[field];
          if (photo?.uri) {
            formData.append(field, {
              uri: photo.uri,
              name: `${field}.jpg`,
              type: photo.mimeType || "image/jpeg",
            });
          }
        });
      }

      const response = await api.put(
        `/handover/rentals/edit/${cleanId}`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        },
      );

      if (extensionId) {
        try {
          await api.put(`/extensions/${extensionId}/status`, {
            status: "approved",
          });
        } catch (extError) {
          console.warn("Could not mark extension as approved:", extError);
        }
      }

      Alert.alert(
        "Success",
        response?.data?.message || "Rental updated successfully",
        [{ text: "OK", onPress: () => router.replace("/(tabs)/home") }],
      );
    } catch (error) {
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to update changes.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderExchangePhoto = (field, label) => {
    const photo = exchangePhotos[field];
    return (
      <View style={styles.exchangePhotoItem} key={field}>
        <Text style={styles.exchangePhotoLabel}>
          {label}
          <Text style={styles.requiredText}> *</Text>
        </Text>
        <TouchableOpacity
          style={[
            styles.exchangePhotoBox,
            photo && styles.exchangePhotoBoxFilled,
          ]}
          onPress={() => selectExchangePhoto(field, label)}
          activeOpacity={0.8}
        >
          {photo?.uri ? (
            <>
              <Image
                source={{ uri: photo.uri }}
                style={styles.exchangePhotoPreview}
              />
              <TouchableOpacity
                style={styles.removeExchangePhotoButton}
                onPress={() => removeExchangePhoto(field)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.removeExchangePhotoText}>×</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.exchangePhotoPlaceholder}>
              <Text style={styles.exchangePhotoIcon}>+</Text>
              <Text style={styles.exchangePhotoPlaceholderText}>Add Photo</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const hasHistory = (billSummary?.extensionBills?.length || 0) > 0;

  return (
    <SafeAreaView style={styles.rootSafeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <StatusBar backgroundColor="#001B45" barStyle="light-content" />

        <LinearGradient colors={["#001B45", "#002B6B"]} style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.sideBtn}
          >
            <Ionicons name="chevron-back" size={26} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modify Rental Contract</Text>
          <View style={styles.sideBtn} />
        </LinearGradient>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.formContainer}>
            <View style={styles.readOnlyCard}>
              <Text style={styles.cardHeaderLabel}>Account Reference</Text>
              {bookingCode ? (
                <Text style={styles.readOnlyText}>
                  <Text style={{ fontWeight: "700" }}>Booking ID </Text>
                  {bookingCode}
                </Text>
              ) : null}
              <Text style={styles.readOnlyText}>
                <Text style={{ fontWeight: "700" }}>Customer </Text>
                {customerInfo.name} • {customerInfo.phone}
              </Text>
              {customerInfo.location?.coordinates &&
                customerInfo.location.coordinates.length === 2 && (
                  <TouchableOpacity
                    onPress={() => {
                      const [lng, lat] = customerInfo.location.coordinates;
                      Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
                      );
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 8,
                      padding: 8,
                      backgroundColor: "#EFF6FF",
                      borderRadius: 8,
                      alignSelf: "flex-start",
                    }}
                  >
                    <Ionicons name="location" size={16} color="#2563EB" />
                    <Text
                      style={{
                        color: "#2563EB",
                        marginLeft: 6,
                        fontWeight: "600",
                        fontSize: 13,
                      }}
                    >
                      Track Location
                    </Text>
                  </TouchableOpacity>
                )}
              <View style={{ height: 12 }} />
              <Text style={styles.readOnlyText}>
                <Text style={{ fontWeight: "700" }}>Vehicle </Text>
                {vehicleInfo.model} · {vehicleInfo.plateNumber}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Vehicle</Text>
            <TouchableOpacity
              style={styles.inputField}
              onPress={openVehicleModal}
            >
              <Ionicons name="car-sport-outline" size={18} color="#64748B" />
              <Text style={{ flex: 1, marginLeft: 10 }}>
                {selectedVehicle
                  ? `${selectedVehicle.vehicleName} • ${selectedVehicle.vehicleNumber}${
                      selectedVehicle.pricePerDay
                        ? ` • ₹${selectedVehicle.pricePerDay}/day`
                        : ""
                    }`
                  : vehicleInfo.model
                    ? `${vehicleInfo.model} • ${vehicleInfo.plateNumber}`
                    : "Select Vehicle"}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>

            {isVehicleExchange && (
              <View style={styles.exchangePhotoSection}>
                <View style={styles.exchangePhotoHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exchangePhotoTitle}>
                      Vehicle Exchange Photos
                    </Text>
                    <Text style={styles.exchangePhotoSubtitle}>
                      New vehicle photos are required for the exchange record.
                    </Text>
                  </View>
                </View>
                <View style={styles.exchangeVehicleInfo}>
                  <Text style={styles.exchangeVehicleInfoLabel}>
                    New Vehicle
                  </Text>
                  <Text style={styles.exchangeVehicleInfoValue}>
                    {selectedVehicle?.vehicleName || "—"}
                    {selectedVehicle?.vehicleNumber
                      ? ` • ${selectedVehicle.vehicleNumber}`
                      : ""}
                  </Text>
                </View>
                <View style={styles.exchangePhotoGrid}>
                  {renderExchangePhoto("vehicleFront", "Front")}
                  {renderExchangePhoto("vehicleRear", "Rear")}
                  {renderExchangePhoto("vehicleLeft", "Left")}
                  {renderExchangePhoto("vehicleRight", "Right")}
                  {renderExchangePhoto("additional", "Additional")}
                </View>
                <Text style={styles.exchangePhotoHint}>
                  Capture clear photos of all four sides of the new vehicle.
                </Text>
              </View>
            )}

            <SectionHeader title="Trip Management" />

            <View style={styles.row}>
              <LabeledBox
                label="Pickup Date (Fixed)"
                value={formatDate(pickupDate)}
                disabled
              />
              <LabeledBox
                label="Pickup Time (Fixed)"
                value={formatTime(pickupDate)}
                disabled
              />
            </View>

            <View style={styles.row}>
              <View style={styles.flexSplit}>
                <Text style={styles.fieldLabel}>Drop Date</Text>
                <TouchableOpacity
                  style={styles.inputField}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={styles.inputText}>
                    {formatDate(dropDateTime)}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>
              <View style={styles.flexSplit}>
                <Text style={styles.fieldLabel}>Drop Time</Text>
                <TouchableOpacity
                  style={styles.inputField}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Text style={styles.inputText}>
                    {formatTime(dropDateTime)}
                  </Text>
                  <Ionicons name="time-outline" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>

            {dropChanged && (
              <View
                style={[
                  styles.extensionNoticeBanner,
                  isShortened && styles.reductionNoticeBanner,
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={isShortened ? "#B91C1C" : "#B45309"}
                />
                <Text
                  style={[
                    styles.extensionNoticeText,
                    isShortened && styles.reductionNoticeText,
                  ]}
                >
                  {isShortened
                    ? `Shortened by ${Math.abs(extraDays)} day${Math.abs(extraDays) === 1 ? "" : "s"} — enter the fare reduction below.`
                    : `Extended by ${extraDays} day${extraDays === 1 ? "" : "s"} — a new extension bill will be added below.`}
                </Text>
              </View>
            )}

            <SectionHeader
              title="Bill Summary"
              collapsible
              isOpen={showBillSummary}
              onToggle={toggleBillSummary}
            />

            {showBillSummary &&
              (loading ? (
                <BillCardSkeleton />
              ) : (
                <View style={styles.billCard}>
                  <View style={styles.billRow}>
                    <Text style={styles.billRowLabel}>
                      Original Booking{" "}
                      <Text style={styles.billRowSub}>
                        (
                        {billSummary?.originalBill?.numberOfDays ||
                          originalNumberOfDays}{" "}
                        day
                        {(billSummary?.originalBill?.numberOfDays ||
                          originalNumberOfDays) === 1
                          ? ""
                          : "s"}
                        )
                      </Text>
                    </Text>
                    <Text style={styles.billRowValue}>
                      {formatMoney(
                        billSummary?.originalBill?.baseFare ?? baseFare,
                      )}
                    </Text>
                  </View>

                  <View style={styles.billRow}>
                    <Text style={styles.billRowLabel}>Total Fare</Text>
                    <Text style={styles.billRowValue}>
                      {formatMoney(liveTotalFare)}
                    </Text>
                  </View>

                  {hasHistory && (
                    <>
                      <TouchableOpacity
                        style={styles.historyToggle}
                        onPress={toggleHistory}
                      >
                        <Ionicons
                          name="receipt-outline"
                          size={15}
                          color="#2563EB"
                        />
                        <Text style={styles.historyToggleText}>
                          {billSummary.extensionBills.length} previous change
                          {billSummary.extensionBills.length === 1 ? "" : "s"}
                        </Text>
                        <Ionicons
                          name={showHistory ? "chevron-up" : "chevron-down"}
                          size={15}
                          color="#2563EB"
                        />
                      </TouchableOpacity>

                      {showHistory &&
                        billSummary.extensionBills.map((bill) => {
                          const isReductionBill = bill.billType === "reduction";
                          return (
                            <View
                              key={bill.billNumber}
                              style={styles.pastBillCard}
                            >
                              <View style={styles.billRow}>
                                <Text style={styles.billRowLabel}>
                                  {isReductionBill ? "Reduction" : "Extension"}{" "}
                                  #{bill.billNumber}{" "}
                                  <Text style={styles.billRowSub}>
                                    ({bill.extraDays >= 0 ? "+" : ""}
                                    {bill.extraDays}d •{" "}
                                    {formatDate(bill.previousDropDateTime)} →{" "}
                                    {formatDate(bill.newDropDateTime)})
                                  </Text>
                                </Text>
                                <Text
                                  style={[
                                    styles.billRowValue,
                                    isReductionBill && styles.reductionValue,
                                  ]}
                                >
                                  {isReductionBill ? "− " : ""}
                                  {formatMoney(bill.extensionAmount)}
                                </Text>
                              </View>
                              <View style={styles.pastBillMetaRow}>
                                <Text style={styles.pastBillMetaText}>
                                  Collected then:{" "}
                                  {formatMoney(bill.amountCollected)}
                                </Text>
                                <Text style={styles.pastBillMetaText}>
                                  Running total:{" "}
                                  {formatMoney(bill.totalFareAfterThisBill)}
                                </Text>
                              </View>
                              {Number(bill.amountRefunded) > 0 && (
                                <Text style={styles.pastBillMetaText}>
                                  Refunded then:{" "}
                                  {formatMoney(bill.amountRefunded)}
                                </Text>
                              )}
                              {!!bill.reason && (
                                <Text style={styles.pastBillReason}>
                                  "{bill.reason}"
                                </Text>
                              )}
                              {!!bill.createdAt && (
                                <Text style={styles.pastBillDate}>
                                  {formatDate(bill.createdAt)} at{" "}
                                  {formatTime(bill.createdAt)}
                                </Text>
                              )}
                            </View>
                          );
                        })}

                      <View
                        style={[styles.billRow, styles.previousBillTotalRow]}
                      >
                        <Text style={styles.previousBillTotalLabel}>
                          Previous Bill Total
                        </Text>
                        <Text style={styles.previousBillTotalValue}>
                          {formatMoney(previousBillTotal)}
                        </Text>
                      </View>
                    </>
                  )}

                  {dropChanged && (
                    <View
                      style={[
                        styles.billRow,
                        styles.pendingBillRow,
                        isShortened && styles.pendingReductionRow,
                      ]}
                    >
                      <Text
                        style={[
                          styles.billRowLabel,
                          styles.pendingLabel,
                          isShortened && styles.pendingReductionLabel,
                        ]}
                      >
                        {isShortened ? "Fare Reduction" : "New Extension"}{" "}
                        <Text style={styles.billRowSub}>
                          ({extraDays >= 0 ? "+" : ""}
                          {extraDays}d → {formatDate(dropDateTime)})
                        </Text>
                      </Text>
                      <View
                        style={[
                          styles.pendingAmountInput,
                          isShortened && styles.pendingReductionInput,
                        ]}
                      >
                        <Text
                          style={[
                            styles.pendingCurrency,
                            isShortened && styles.pendingReductionLabel,
                          ]}
                        >
                          {isShortened ? "−₹" : "₹"}
                        </Text>
                        <TextInput
                          style={[
                            styles.pendingAmountText,
                            isShortened && styles.pendingReductionLabel,
                          ]}
                          keyboardType="numeric"
                          placeholder="0"
                          value={extensionPrice}
                          onChangeText={onExtensionPriceChange}
                        />
                      </View>
                    </View>
                  )}

                  <View style={styles.billRow}>
                    <Text style={styles.billRowLabel}>Pickup Charge</Text>
                    <Text style={styles.billRowValue}>
                      {formatMoney(pickupCharge)}
                    </Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text style={styles.billRowLabel}>Drop Charge</Text>
                    <Text style={styles.billRowValue}>
                      {formatMoney(dropCharge)}
                    </Text>
                  </View>

                  <View style={styles.billDivider} />

                  <View style={styles.billRow}>
                    <Text style={styles.billRowLabel}>FASTag Charges</Text>
                    <View style={styles.inlineEditField}>
                      <TextInput
                        style={styles.inlineEditText}
                        keyboardType="numeric"
                        value={fastagPayable}
                        onChangeText={onFastagChange}
                      />
                    </View>
                  </View>

                  <View style={styles.billRow}>
                    <Text style={styles.billRowLabel}>Security Deposit</Text>
                    <View style={styles.inlineEditField}>
                      <TextInput
                        style={styles.inlineEditText}
                        keyboardType="numeric"
                        value={securityDeposit}
                        onChangeText={onSecurityDepositChange}
                      />
                    </View>
                  </View>

                  <View style={styles.billRow}>
                    <Text style={styles.billRowLabel}>Extra Charges</Text>
                    <View style={styles.inlineEditField}>
                      <TextInput
                        style={styles.inlineEditText}
                        keyboardType="numeric"
                        value={extraCharges}
                        onChangeText={onExtraChargesChange}
                      />
                    </View>
                  </View>

                  <View style={styles.billRow}>
                    <Text style={styles.billRowLabel}>Discount</Text>
                    <View
                      style={[styles.inlineEditField, styles.discountField]}
                    >
                      <Text style={styles.discountMinus}>−</Text>
                      <TextInput
                        style={styles.inlineEditText}
                        keyboardType="numeric"
                        value={discountAmount}
                        onChangeText={onDiscountChange}
                      />
                    </View>
                  </View>

                  <View style={styles.billDividerDashed} />

                  <View style={styles.billRow}>
                    <Text style={styles.grandTotalLabel}>Grand Total</Text>
                    <Text style={styles.grandTotalValue}>
                      {formatMoney(grandTotal)}
                    </Text>
                  </View>
                </View>
              ))}

            <View style={styles.recapCard}>
              <TouchableOpacity
                style={styles.recapHeaderRow}
                onPress={toggleRecapSummary}
                activeOpacity={0.7}
              >
                <Text style={styles.recapTitle}>Updated Bill Summary</Text>
                <View
                  style={[
                    styles.iconCircle,
                    showRecapSummary && styles.iconCircleActive,
                  ]}
                >
                  <Ionicons
                    name={showRecapSummary ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={showRecapSummary ? "#2563EB" : "#64748B"}
                  />
                </View>
              </TouchableOpacity>

              {showRecapSummary &&
                (loading ? (
                  <>
                    <View style={[styles.skeletonLine, { width: "70%" }]} />
                    <View style={[styles.skeletonLine, { width: "50%" }]} />
                    <View style={[styles.skeletonLine, { width: "65%" }]} />
                  </>
                ) : (
                  <>
                    <RecapRow
                      label="Total Fare"
                      value={liveBillSummary.totalFare}
                    />
                    <RecapRow
                      label="FASTag Payable"
                      value={liveBillSummary.fastTagPayable}
                    />
                    <RecapRow
                      label="Pickup Charge"
                      value={liveBillSummary.pickupCharge}
                    />
                    <RecapRow
                      label="Drop Charge"
                      value={liveBillSummary.dropCharge}
                    />
                    <RecapRow
                      label="Security Deposit"
                      value={liveBillSummary.securityDeposit}
                    />
                    <RecapRow
                      label="Extra Charges"
                      value={liveBillSummary.extraCharges}
                    />
                    <RecapRow
                      label="Discount (Coupon)"
                      value={Math.max(0, liveBillSummary.discountAmount - liveBillSummary.membershipDiscount)}
                      negative
                    />
                    {liveBillSummary.membershipDiscount > 0 && (
                      <RecapRow
                        label="Membership Discount"
                        value={liveBillSummary.membershipDiscount}
                        negative
                      />
                    )}
                    <View style={styles.recapDivider} />
                    <RecapRow
                      label="Total Amount"
                      value={liveBillSummary.totalAmount}
                      emphasize
                    />
                    <RecapRow
                      label="Booking Amount Paid"
                      value={liveBillSummary.bookingAmountPaid}
                    />
                    <RecapRow
                      label="Amount Received (Total)"
                      value={liveBillSummary.amountReceivedNow}
                    />
                    {liveBillSummary.refundedAmount > 0 && (
                      <RecapRow
                        label="Refunded (Total)"
                        value={liveBillSummary.refundedAmount}
                        negative
                      />
                    )}
                    <RecapRow
                      label="Total Collected"
                      value={liveBillSummary.totalCollected}
                    />
                    <View style={styles.recapDivider} />
                    {refundDue > 0 ? (
                      <RecapRow
                        label="Refund Due to Customer"
                        value={refundDue}
                        emphasize
                      />
                    ) : (
                      <RecapRow
                        label="Balance Amount"
                        value={liveBillSummary.balanceAmount}
                        emphasize
                      />
                    )}
                  </>
                ))}
            </View>

            <SectionHeader title="Payment Collection" />

            <View style={styles.row}>
              <LabeledBox
                label="Booking Amount"
                value={formatMoney(bookingAmountPaid)}
                disabled
              />
              <LabeledBox
                label="Collected Previously"
                value={formatMoney(amountReceivedPreviously)}
                disabled
              />
            </View>

            <Text style={styles.fieldLabel}>Collect Payment Now</Text>
            <View style={[styles.inputField, styles.highlightedInput]}>
              <TextInput
                style={styles.textInputBox}
                keyboardType="numeric"
                placeholder="Enter amount collected now"
                value={amountReceivedNow}
                onChangeText={onAmountReceivedNowChange}
              />
            </View>

            {currentReceived > 0 && (
              <>
                <Text style={styles.fieldLabel}>Payment Mode</Text>
                <View style={styles.paymentTypeRow}>
                  <TouchableOpacity
                    style={[
                      styles.paymentTypeBtn,
                      paymentType === "cash" && styles.paymentTypeBtnActive,
                    ]}
                    onPress={() => setPaymentType("cash")}
                  >
                    <Ionicons
                      name="cash-outline"
                      size={18}
                      color={paymentType === "cash" ? "#111827" : "#64748B"}
                    />
                    <Text
                      style={[
                        styles.paymentTypeText,
                        paymentType === "cash" && styles.paymentTypeTextActive,
                      ]}
                    >
                      Cash
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.paymentTypeBtn,
                      paymentType === "phonepe" && styles.paymentTypeBtnActive,
                    ]}
                    onPress={() => setPaymentType("phonepe")}
                  >
                    <Ionicons
                      name="phone-portrait-outline"
                      size={18}
                      color={paymentType === "phonepe" ? "#111827" : "#64748B"}
                    />
                    <Text
                      style={[
                        styles.paymentTypeText,
                        paymentType === "phonepe" &&
                          styles.paymentTypeTextActive,
                      ]}
                    >
                      PhonePe
                    </Text>
                  </TouchableOpacity>
                </View>

                {paymentType === "phonepe" && (
                  <View style={styles.phonePeSection}>
                    <Text style={styles.fieldLabel}>
                      PhonePe Reference Number
                      {phonePeLastFour.length > 1 ? "s" : ""}
                    </Text>
                    <Text style={styles.phonePeHint}>
                      Enter the last 4 digits of each PhonePe transaction
                      reference.
                    </Text>

                    {phonePeLastFour.map((value, index) => {
                      const isComplete = value.length === 4;
                      const isPartial = value.length > 0 && value.length < 4;

                      return (
                        <View key={index} style={styles.phonePeRow}>
                          <View style={styles.phonePeIndexBadge}>
                            <Text style={styles.phonePeIndexText}>
                              {index + 1}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.phonePeInputWrap,
                              isComplete && styles.phonePeInputWrapValid,
                              isPartial && styles.phonePeInputWrapPartial,
                            ]}
                          >
                            <TextInput
                              style={styles.phonePeInput}
                              value={value}
                              keyboardType="number-pad"
                              maxLength={4}
                              onChangeText={(text) =>
                                handlePhonePeLastFourChange(index, text)
                              }
                              placeholder="0000"
                              placeholderTextColor="#CBD5E1"
                            />
                            {isComplete && (
                              <Ionicons
                                name="checkmark-circle"
                                size={18}
                                color="#16A34A"
                              />
                            )}
                            {isPartial && (
                              <Text style={styles.phonePeCounter}>
                                {value.length}/4
                              </Text>
                            )}
                          </View>

                          {phonePeLastFour.length > 1 && (
                            <TouchableOpacity
                              style={styles.phonePeRemoveBtn}
                              onPress={() => removePhonePeReference(index)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons
                                name="close"
                                size={16}
                                color="#DC2626"
                              />
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}

                    <TouchableOpacity
                      style={styles.phonePeAddBtn}
                      onPress={addPhonePeReference}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={18}
                        color="#2563EB"
                      />
                      <Text style={styles.phonePeAddText}>
                        Add another reference
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {/* ---------- NEW: REFUND SECTION ---------- */}
            {showRefundSection && (
              <View style={styles.refundSection}>
                <View style={styles.refundHeaderRow}>
                  <Ionicons
                    name="return-down-back-outline"
                    size={18}
                    color="#B91C1C"
                  />
                  <Text style={styles.refundTitle}>Refund to Customer</Text>
                </View>
                <Text style={styles.refundHint}>
                  Customer has paid {formatMoney(refundable)} more than the new
                  total. Enter the amount you are returning now.
                </Text>

                <View style={[styles.inputField, styles.refundInput]}>
                  <Text style={styles.refundCurrency}>₹</Text>
                  <TextInput
                    style={styles.textInputBox}
                    keyboardType="numeric"
                    placeholder="0"
                    value={amountRefundedNow}
                    onChangeText={onAmountRefundedNowChange}
                  />
                  <TouchableOpacity
                    onPress={() => setAmountRefundedNow(String(refundable))}
                    style={styles.refundFullBtn}
                  >
                    <Text style={styles.refundFullText}>Full</Text>
                  </TouchableOpacity>
                </View>

                {currentRefund > 0 && (
                  <>
                    <Text style={styles.fieldLabel}>Refund Mode</Text>
                    <View style={styles.paymentTypeRow}>
                      {[
                        { key: "cash", label: "Cash", icon: "cash-outline" },
                        {
                          key: "phonepe",
                          label: "PhonePe",
                          icon: "phone-portrait-outline",
                        },
                      ].map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[
                            styles.paymentTypeBtn,
                            refundMethod === opt.key &&
                              styles.paymentTypeBtnActive,
                          ]}
                          onPress={() => setRefundMethod(opt.key)}
                        >
                          <Ionicons
                            name={opt.icon}
                            size={18}
                            color={
                              refundMethod === opt.key ? "#111827" : "#64748B"
                            }
                          />
                          <Text
                            style={[
                              styles.paymentTypeText,
                              refundMethod === opt.key &&
                                styles.paymentTypeTextActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </View>
            )}

            <View
              style={[
                styles.calculationBanner,
                refundDue > 0
                  ? styles.creditBanner
                  : balanceAmount > 0
                    ? styles.alertBanner
                    : styles.settledBanner,
              ]}
            >
              <Text style={styles.bannerLabel}>
                {refundDue > 0 ? "Credit Due to Customer" : "Remaining Balance"}
              </Text>
              <Text style={styles.bannerValue}>
                {formatMoney(refundDue > 0 ? refundDue : balanceAmount)}
              </Text>
            </View>

            <SectionHeader />
            <Text style={styles.fieldLabel}>Reason</Text>
            <View style={[styles.inputField, styles.textAreaContainer]}>
              <TextInput
                style={[styles.textInputBox, styles.textArea]}
                multiline
                numberOfLines={3}
                placeholder="Describe the reason for this modification..."
                value={reasonForChange}
                onChangeText={setReasonForChange}
              />
            </View>

            <View style={styles.actionRowGrid}>
              <TouchableOpacity
                style={styles.backCancelButton}
                onPress={() => router.back()}
              >
                <Text style={styles.backButtonText}>Dismiss</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveSubmitButton}
                onPress={handleSaveChanges}
                disabled={submitting || loading}
              >
                {submitting ? (
                  <ActivityIndicator color="#111827" />
                ) : (
                  <Text style={styles.saveButtonText}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {showDatePicker && (
        <DateTimePicker
          value={dropDateTime}
          mode="date"
          display="default"
          minimumDate={pickupDate}
          onValueChange={onDateChange}
          onDismiss={() => onDateChange({ type: "dismissed" })}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={dropDateTime}
          mode="time"
          is24Hour={false}
          display="default"
          onValueChange={onTimeChange}
          onDismiss={() => onTimeChange({ type: "dismissed" })}
        />
      )}

      <VehiclePickerModal
        visible={showVehicleModal}
        onClose={() => {
          setVehicleSearch("");
          setShowVehicleModal(false);
        }}
        vehicleLoading={vehicleLoading}
        vehicleSearch={vehicleSearch}
        setVehicleSearch={setVehicleSearch}
        filteredVehicles={filteredVehicles}
        selectedVehicle={selectedVehicle}
        onSelect={(vehicle) => {
          setSelectedVehicle(vehicle);
          setVehicleInfo({
            model: vehicle.vehicleName,
            plateNumber: vehicle.vehicleNumber,
          });
          setVehicleSearch("");
          setShowVehicleModal(false);

          if (
            originalVehicleId &&
            vehicle?._id?.toString() === originalVehicleId
          ) {
            setExchangePhotos({
              vehicleFront: null,
              vehicleRear: null,
              vehicleLeft: null,
              vehicleRight: null,
              additional: null,
            });
          }
        }}
      />
    </SafeAreaView>
  );
}

/* ============================================================
   SMALL PRESENTATIONAL COMPONENTS
============================================================ */

function SectionHeader({ title, collapsible, isOpen, onToggle }) {
  const headerContent = (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {collapsible && (
        <View style={[styles.iconCircle, isOpen && styles.iconCircleActive]}>
          <Ionicons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={18}
            color={isOpen ? "#2563EB" : "#64748B"}
          />
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.sectionHeader}>
      {collapsible ? (
        <TouchableOpacity
          onPress={onToggle}
          activeOpacity={0.7}
          style={styles.sectionHeaderClickable}
        >
          {headerContent}
        </TouchableOpacity>
      ) : (
        headerContent
      )}
      <View style={styles.yellowLine} />
    </View>
  );
}

function RecapRow({ label, value, negative, emphasize }) {
  return (
    <View style={styles.recapRow}>
      <Text style={[styles.recapLabel, emphasize && styles.recapLabelBold]}>
        {label}
      </Text>
      <Text
        style={[
          styles.recapValue,
          emphasize && styles.recapValueBold,
          negative && value > 0 && styles.recapValueNegative,
        ]}
      >
        {negative && value > 0 ? "− " : ""}
        {formatMoney(value)}
      </Text>
    </View>
  );
}

function LabeledBox({ label, value, disabled }) {
  return (
    <View style={styles.flexSplit}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputField, disabled && styles.disabledInput]}>
        <Text style={disabled ? styles.disabledText : styles.inputText}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function BillCardSkeleton() {
  return (
    <View style={styles.billCard}>
      <View style={[styles.skeletonLine, { width: "55%" }]} />
      <View style={[styles.skeletonLine, { width: "35%" }]} />
      <View style={[styles.skeletonLine, { width: "45%" }]} />
      <View style={styles.billDividerDashed} />
      <View style={[styles.skeletonLine, { width: "60%", height: 22 }]} />
    </View>
  );
}

function VehiclePickerModal({
  visible,
  onClose,
  vehicleLoading,
  vehicleSearch,
  setVehicleSearch,
  filteredVehicles,
  selectedVehicle,
  onSelect,
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View style={modalStyles.header}>
          <Text style={modalStyles.headerTitle}>Select Vehicle</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={modalStyles.searchWrap}>
          <View style={modalStyles.searchBar}>
            <Ionicons name="search" size={20} color="#64748B" />
            <TextInput
              placeholder="Search by name, number or color..."
              placeholderTextColor="#94A3B8"
              value={vehicleSearch}
              onChangeText={setVehicleSearch}
              style={modalStyles.searchInput}
            />
          </View>
        </View>

        {vehicleLoading ? (
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
            {filteredVehicles.map((vehicle) => (
              <TouchableOpacity
                key={vehicle._id}
                style={[
                  modalStyles.vehicleCard,
                  {
                    borderColor:
                      selectedVehicle?._id === vehicle._id
                        ? "#2563EB"
                        : "#E5E7EB",
                  },
                ]}
                onPress={() => onSelect(vehicle)}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={modalStyles.vehicleIconWrap}>
                    <Ionicons name="car-sport" size={26} color="#2563EB" />
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={modalStyles.vehicleName}>
                      {vehicle.vehicleName}
                    </Text>
                    <Text style={modalStyles.vehicleNumber}>
                      {vehicle.vehicleNumber}
                    </Text>
                    <Text style={modalStyles.vehicleColor}>
                      Color: {vehicle.color}
                    </Text>
                    {vehicle.pricePerDay ? (
                      <Text style={modalStyles.vehiclePrice}>
                        ₹{vehicle.pricePerDay}/day
                      </Text>
                    ) : null}
                  </View>

                  <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
                </View>
              </TouchableOpacity>
            ))}

            {filteredVehicles.length === 0 && (
              <View style={{ alignItems: "center", marginTop: 60 }}>
                <Ionicons name="car-outline" size={60} color="#CBD5E1" />
                <Text style={modalStyles.emptyText}>No Vehicle Found</Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

/* ============================================================
   STYLES
============================================================ */

const styles = StyleSheet.create({
  rootSafeArea: { flex: 1, backgroundColor: "#001B45" },
  keyboardAvoidingView: { flex: 1, backgroundColor: "#F8FAFC" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight + 16 : 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sideBtn: { width: 42 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "white",
    fontSize: 18,
    fontWeight: "800",
  },
  scrollContent: { flexGrow: 1, paddingBottom: 60 },
  formContainer: { paddingHorizontal: 16, paddingTop: 16 },

  readOnlyCard: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  cardHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E40AF",
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  readOnlyText: { fontSize: 14, color: "#1E3A8A", marginBottom: 4 },

  sectionHeader: { marginTop: 24, marginBottom: 12 },
  sectionHeaderClickable: { paddingVertical: 4 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  yellowLine: {
    width: 40,
    height: 3,
    borderRadius: 99,
    backgroundColor: "#FFC107",
    marginTop: 4,
  },

  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleActive: {
    backgroundColor: "#DBEAFE",
  },

  row: { flexDirection: "row", gap: 10, marginBottom: 4 },
  flexSplit: { flex: 1 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    marginTop: 10,
    marginBottom: 4,
  },

  inputField: {
    backgroundColor: "white",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  textInputBox: {
    flex: 1,
    height: "100%",
    color: "#0F172A",
    fontSize: 14,
    padding: 0,
  },
  inputText: { color: "#0F172A", fontSize: 14 },
  disabledInput: { backgroundColor: "#F1F5F9", borderColor: "#E2E8F0" },
  disabledText: { color: "#64748B", fontSize: 14 },
  highlightedInput: { borderColor: "#2563EB", borderWidth: 1.5 },
  textAreaContainer: { height: 80, alignItems: "flex-start", paddingTop: 8 },
  textArea: { textAlignVertical: "top" },

  extensionNoticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  extensionNoticeText: {
    flex: 1,
    fontSize: 12.5,
    color: "#92400E",
    fontWeight: "600",
  },
  reductionNoticeBanner: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  reductionNoticeText: { color: "#991B1B" },

  /* ---------- VEHICLE EXCHANGE PHOTOS ---------- */
  exchangePhotoSection: {
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  exchangePhotoHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  exchangePhotoTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  exchangePhotoSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
  },
  exchangeVehicleInfo: {
    padding: 12,
    marginBottom: 16,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  exchangeVehicleInfoLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  exchangeVehicleInfoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  exchangePhotoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  exchangePhotoItem: { width: "48%", marginBottom: 14 },
  exchangePhotoLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 7,
  },
  requiredText: { color: "#DC2626" },
  exchangePhotoBox: {
    width: "100%",
    aspectRatio: 1.25,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  exchangePhotoBoxFilled: { borderStyle: "solid", borderColor: "#CBD5E1" },
  exchangePhotoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  exchangePhotoIcon: { fontSize: 28, fontWeight: "300", color: "#64748B" },
  exchangePhotoPlaceholderText: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
  },
  exchangePhotoPreview: { width: "100%", height: "100%", resizeMode: "cover" },
  removeExchangePhotoButton: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  removeExchangePhotoText: {
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "400",
  },
  exchangePhotoHint: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },

  /* ---------- BILL CARD ---------- */
  billCard: {
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  billRowLabel: {
    fontSize: 14,
    color: "#334155",
    fontWeight: "600",
    flexShrink: 1,
  },
  billRowSub: { fontSize: 12, color: "#94A3B8", fontWeight: "500" },
  billRowValue: { fontSize: 14, color: "#0F172A", fontWeight: "700" },
  reductionValue: { color: "#DC2626" },

  historyToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  historyToggleText: {
    flex: 1,
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "700",
  },
  pastBillCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingBottom: 8,
    marginBottom: 6,
  },
  pastBillMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
    marginBottom: 4,
  },
  pastBillMetaText: {
    fontSize: 11.5,
    color: "#64748B",
    fontWeight: "600",
  },
  pastBillReason: {
    fontSize: 11.5,
    color: "#94A3B8",
    fontStyle: "italic",
    marginBottom: 4,
  },
  pastBillDate: {
    fontSize: 10.5,
    color: "#CBD5E1",
    fontWeight: "600",
  },
  previousBillTotalRow: {
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  previousBillTotalLabel: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#334155",
  },
  previousBillTotalValue: { fontSize: 15, fontWeight: "800", color: "#0F172A" },

  pendingBillRow: {
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingHorizontal: 10,
    marginVertical: 2,
  },
  pendingLabel: { color: "#1D4ED8" },
  pendingReductionRow: { backgroundColor: "#FEF2F2" },
  pendingReductionLabel: { color: "#B91C1C" },
  pendingAmountInput: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 34,
    minWidth: 90,
  },
  pendingReductionInput: { borderColor: "#FCA5A5" },
  pendingCurrency: {
    fontSize: 13,
    color: "#1D4ED8",
    fontWeight: "700",
    marginRight: 2,
  },
  pendingAmountText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#1D4ED8",
    padding: 0,
  },

  inlineEditField: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 34,
    minWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  discountField: { borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" },
  discountMinus: { color: "#DC2626", fontWeight: "800", marginRight: 2 },
  inlineEditText: {
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
    padding: 0,
    textAlign: "right",
  },

  billDivider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 6 },
  billDividerDashed: {
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    marginVertical: 10,
  },
  grandTotalLabel: { fontSize: 15, fontWeight: "800", color: "#111827" },
  grandTotalValue: { fontSize: 20, fontWeight: "900", color: "#001B45" },

  /* ---------- Bill summary recap panel ---------- */
  recapCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginTop: 14,
  },
  recapHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingVertical: 4,
  },
  recapTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recapRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  recapLabel: { fontSize: 13, color: "#475569" },
  recapLabelBold: { fontWeight: "800", color: "#111827" },
  recapValue: { fontSize: 13, color: "#334155", fontWeight: "600" },
  recapValueBold: { fontSize: 15, fontWeight: "900", color: "#001B45" },
  recapValueNegative: { color: "#DC2626" },
  recapDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 6,
  },

  skeletonLine: {
    height: 14,
    borderRadius: 6,
    backgroundColor: "#E2E8F0",
    marginVertical: 6,
  },

  /* ---------- Payment mode selector ---------- */
  paymentTypeRow: { flexDirection: "row", gap: 10 },
  paymentTypeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "white",
  },
  paymentTypeBtnActive: { backgroundColor: "#FFF7D6", borderColor: "#FFC107" },
  paymentTypeText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
  paymentTypeTextActive: { color: "#111827", fontWeight: "800" },

  phonePeSection: { marginTop: 14 },
  phonePeHint: {
    fontSize: 12,
    color: "#64748B",
    marginTop: -2,
    marginBottom: 10,
    lineHeight: 16,
  },
  phonePeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  phonePeIndexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  phonePeIndexText: { fontSize: 12, fontWeight: "800", color: "#1D4ED8" },
  phonePeInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "white",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
  },
  phonePeInputWrapValid: { borderColor: "#86EFAC", backgroundColor: "#F0FDF4" },
  phonePeInputWrapPartial: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  phonePeInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 6,
    color: "#0F172A",
    padding: 0,
  },
  phonePeCounter: {
    fontSize: 11,
    fontWeight: "700",
    color: "#DC2626",
    marginLeft: 6,
  },
  phonePeRemoveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
  phonePeAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 6,
    marginTop: 2,
  },
  phonePeAddText: { fontSize: 13.5, fontWeight: "700", color: "#2563EB" },

  /* ---------- Refund section (NEW) ---------- */
  refundSection: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  refundHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  refundTitle: { fontSize: 15, fontWeight: "800", color: "#991B1B" },
  refundHint: {
    fontSize: 12,
    color: "#7F1D1D",
    marginTop: 4,
    marginBottom: 10,
    lineHeight: 16,
  },
  refundInput: { borderColor: "#FCA5A5", borderWidth: 1.5 },
  refundCurrency: {
    fontSize: 14,
    fontWeight: "700",
    color: "#B91C1C",
    marginRight: 4,
  },
  refundFullBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
  },
  refundFullText: { fontSize: 12, fontWeight: "800", color: "#B91C1C" },

  calculationBanner: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  alertBanner: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  settledBanner: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  creditBanner: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  bannerLabel: { fontSize: 13, fontWeight: "700", color: "#334155" },
  bannerValue: { fontSize: 16, fontWeight: "800", color: "#0F172A" },

  actionRowGrid: { flexDirection: "row", gap: 10, marginTop: 24 },
  backCancelButton: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: "#002B6B",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  backButtonText: { color: "#002B6B", fontSize: 15, fontWeight: "700" },
  saveSubmitButton: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#FFC107",
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: { color: "#111827", fontSize: 15, fontWeight: "800" },
});

const modalStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFF",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: "#111827" },
  vehicleCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  vehicleIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  vehicleName: { fontSize: 16, fontWeight: "700", color: "#111827" },
  vehicleNumber: { color: "#64748B", marginTop: 4 },
  vehicleColor: { color: "#94A3B8", marginTop: 2 },
  vehiclePrice: {
    color: "#16A34A",
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
  },
  emptyText: { marginTop: 12, fontSize: 16, fontWeight: "700" },
});
