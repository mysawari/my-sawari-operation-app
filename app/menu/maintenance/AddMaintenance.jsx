import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
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

const { width } = Dimensions.get("window");

// --- THEME CONSTANTS ---
const COLORS = {
  primary: "#2563EB",
  primaryLight: "#EFF6FF",
  primaryBorder: "#BFDBFE",
  success: "#22C55E",
  successLight: "#DCFCE7",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  danger: "#EF4444",
  dangerLight: "#FEE2E2",
  background: "#F8FAFC",
  cardBg: "#FFFFFF",
  textDark: "#0F172A",
  textMuted: "#64748B",
  textLight: "#94A3B8",
  border: "#E2E8F0",
};

// Backend statuses are free-form strings (e.g. "available", "on_trip",
// "in_service"), so match on substring, case-insensitively, instead of
// an exact switch that would silently fall through to the default style
// for any casing/wording the API happens to use.
const normalizeStatus = (status) =>
  (status || "").toString().trim().toLowerCase();

const getStatusColor = (status) => {
  const s = normalizeStatus(status);
  if (s.includes("available"))
    return { bg: COLORS.successLight, text: COLORS.success };
  if (s.includes("trip") || s.includes("rent") || s.includes("book"))
    return { bg: COLORS.warningLight, text: COLORS.warning };
  if (
    s.includes("service") ||
    s.includes("maintenance") ||
    s.includes("repair")
  )
    return { bg: COLORS.dangerLight, text: COLORS.danger };
  return { bg: COLORS.background, text: COLORS.textMuted };
};

const formatStatusLabel = (status) => {
  if (!status) return "Unknown";
  const s = status.toString().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Formats a JS Date for display, e.g. "15 Aug 2026". Returns "" for
// null/invalid so callers can fall back to a placeholder easily.
const formatExpectedDate = (date) => {
  if (!date || Number.isNaN(new Date(date).getTime())) return "";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// --- REUSABLE SUB-COMPONENTS ---

const Header = React.memo(({ onBackPress }) => (
  <View style={styles.headerContainer}>
    <TouchableOpacity
      style={styles.backButton}
      activeOpacity={0.7}
      onPress={onBackPress}
    >
      <Ionicons name="arrow-back" size={20} color={COLORS.textDark} />
    </TouchableOpacity>
    <View style={styles.headerTitleContainer}>
      <Text style={styles.headerTitle}>Add Maintenance</Text>
      <Text style={styles.headerSubtitle}>
        Create a new maintenance request for a vehicle.
      </Text>
    </View>
  </View>
));

// The API currently returns no `image` field for a vehicle, so this
// renders a fallback icon instead of an <Image> pointed at `undefined`
// (which would just show a broken image / blank box).
const VehicleThumbnail = React.memo(({ uri, size = 60, style }) => {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          {
            width: size,
            height: size,
            borderRadius: 12,
            backgroundColor: COLORS.background,
          },
          style,
        ]}
      />
    );
  }
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 12,
          backgroundColor: COLORS.primaryLight,
          justifyContent: "center",
          alignItems: "center",
        },
        style,
      ]}
    >
      <Ionicons
        name="car-sport-outline"
        size={size * 0.45}
        color={COLORS.primary}
      />
    </View>
  );
});

const VehicleSelector = React.memo(({ selectedVehicle, onPress, error }) => {
  const statusColors = getStatusColor(selectedVehicle?.status);

  // The API doesn't return an odometer/"currentKm" field on the vehicle
  // list, so show the vehicle's actual specs (transmission, fuel type,
  // seating) and its day rate instead of a field that doesn't exist.
  const specLine = selectedVehicle
    ? [
        selectedVehicle.transmission,
        selectedVehicle.fuelType,
        selectedVehicle.seatingCapacity
          ? `${selectedVehicle.seatingCapacity} seats`
          : null,
      ]
        .filter(Boolean)
        .join(" • ")
    : "";

  const priceLine = selectedVehicle?.pricing?.pricePerDay
    ? `₹${Number(selectedVehicle.pricing.pricePerDay).toLocaleString("en-IN")} / day`
    : null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>1. Vehicle Information</Text>
        <Text style={styles.requiredTag}>* Required</Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[styles.vehicleCard, error && styles.inputErrorBorder]}
      >
        {selectedVehicle ? (
          <View style={styles.selectedVehicleContent}>
            <VehicleThumbnail
              uri={selectedVehicle.image}
              style={styles.vehicleThumbnail}
            />
            <View style={styles.vehicleInfo}>
              <View style={styles.vehicleNameRow}>
                <Text style={styles.vehicleName} numberOfLines={1}>
                  {selectedVehicle.vehicleName}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusColors.bg },
                  ]}
                >
                  <Text
                    style={[styles.statusText, { color: statusColors.text }]}
                  >
                    {formatStatusLabel(selectedVehicle.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.vehicleMetaRow}>
                <View style={styles.numberBadge}>
                  <Text style={styles.vehicleNumberText}>
                    {selectedVehicle.vehicleNumber}
                  </Text>
                </View>
                <Text style={styles.vehicleTypeMeta}>
                  {selectedVehicle.vehicleType}
                </Text>
              </View>

              {specLine ? (
                <View style={styles.kmMetaRow}>
                  <Ionicons
                    name="speedometer-outline"
                    size={14}
                    color={COLORS.textMuted}
                  />
                  <Text style={styles.kmMetaText}>{specLine}</Text>
                </View>
              ) : null}

              {priceLine ? (
                <View style={styles.kmMetaRow}>
                  <Ionicons
                    name="pricetag-outline"
                    size={14}
                    color={COLORS.textMuted}
                  />
                  <Text style={styles.kmMetaText}>{priceLine}</Text>
                </View>
              ) : null}
            </View>
            <Ionicons name="swap-vertical" size={20} color={COLORS.primary} />
          </View>
        ) : (
          <View style={styles.placeholderVehicleContent}>
            <View style={styles.placeholderIconBg}>
              <Ionicons name="car-outline" size={24} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.placeholderTitle}>Select Vehicle</Text>
              <Text style={styles.placeholderSubtitle}>
                Tap to search and pick a fleet vehicle
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={COLORS.textLight}
            />
          </View>
        )}
      </TouchableOpacity>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
});

const MaintenanceTypeCard = React.memo(
  ({
    type,
    title,
    subtitle,
    examples = [],
    isSelected,
    onSelect,
    activeColor,
  }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePress = () => {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.97,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
      onSelect(type);
    };

    return (
      <Animated.View style={[{ flex: 1, transform: [{ scale: scaleAnim }] }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handlePress}
          style={[
            styles.typeCard,
            isSelected && {
              borderColor: activeColor,
              backgroundColor: "#FFFFFF",
              shadowColor: activeColor,
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 4,
            },
          ]}
        >
          <View style={styles.typeCardHeader}>
            <View
              style={[
                styles.radioCircle,
                isSelected && { borderColor: activeColor },
              ]}
            >
              {isSelected && (
                <View
                  style={[styles.radioDot, { backgroundColor: activeColor }]}
                />
              )}
            </View>
            <Text
              style={[
                styles.typeTitle,
                isSelected && { color: activeColor, fontWeight: "800" },
              ]}
            >
              {title}
            </Text>
          </View>

          <Text style={styles.typeSubtitle}>{subtitle}</Text>

          {examples.length > 0 && (
            <View style={styles.exampleTagsContainer}>
              {examples.map((ex, i) => (
                <View key={i} style={styles.exampleChip}>
                  <Text style={styles.exampleChipText}>{ex}</Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  },
);

const InputField = React.memo(
  ({
    label,
    placeholder,
    value,
    onChangeText,
    required,
    multiline,
    keyboardType,
    icon,
    error,
  }) => (
    <View style={styles.inputContainer}>
      <View style={styles.inputLabelRow}>
        <Text style={styles.inputLabel}>{label}</Text>
        {required && <Text style={styles.requiredAsterisk}>*</Text>}
      </View>

      <View
        style={[
          styles.inputWrapper,
          multiline && styles.multilineWrapper,
          error && styles.inputErrorBorder,
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={18}
            color={COLORS.textMuted}
            style={styles.inputIcon}
          />
        )}
        <TextInput
          style={[styles.textInput, multiline && styles.multilineInput]}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textLight}
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          numberOfLines={multiline ? 3 : 1}
          keyboardType={keyboardType || "default"}
          textAlignVertical={multiline ? "top" : "center"}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  ),
);

// A tap-to-open field that looks like InputField but opens the native
// date picker instead of the keyboard. `value` is a JS Date | null.
const DateField = React.memo(
  ({ label, value, onPress, required, error, placeholder = "Select date" }) => (
    <View style={styles.inputContainer}>
      <View style={styles.inputLabelRow}>
        <Text style={styles.inputLabel}>{label}</Text>
        {required && <Text style={styles.requiredAsterisk}>*</Text>}
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={[styles.inputWrapper, error && styles.inputErrorBorder]}
      >
        <Ionicons
          name="calendar-outline"
          size={18}
          color={COLORS.textMuted}
          style={styles.inputIcon}
        />
        <Text style={[styles.textInput, !value && { color: COLORS.textLight }]}>
          {value ? formatExpectedDate(value) : placeholder}
        </Text>
      </TouchableOpacity>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  ),
);

// images: array of { id, uri (local device uri), url (remote Cloudinary url
// once uploaded), uploading (bool), error (string|null) }
const ImageUploader = React.memo(
  ({ images, onAddImage, onDeleteImage, onRetryImage, error }) => (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>6. Upload Photos</Text>
        <Text style={styles.sectionMetaText}>Before Service Photos</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.imageScrollContainer}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onAddImage}
          style={styles.uploadCard}
        >
          <View style={styles.uploadIconBg}>
            <Feather name="camera" size={22} color={COLORS.primary} />
          </View>
          <Text style={styles.uploadCardTitle}>Add Photo</Text>
          <Text style={styles.uploadCardSub}>Camera / Gallery</Text>
        </TouchableOpacity>

        {images.map((img) => (
          <View key={img.id} style={styles.previewImageContainer}>
            <Image source={{ uri: img.uri }} style={styles.previewImage} />

            {img.uploading ? (
              <View style={styles.imageUploadingOverlay}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.imageOverlayText}>Uploading...</Text>
              </View>
            ) : img.error ? (
              <TouchableOpacity
                style={styles.imageErrorOverlay}
                activeOpacity={0.85}
                onPress={() => onRetryImage(img.id)}
              >
                <Ionicons name="refresh" size={18} color="#FFFFFF" />
                <Text style={styles.imageOverlayText}>Retry</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.imageProgressBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={12}
                  color={COLORS.success}
                />
                <Text style={styles.imageProgressText}>Uploaded</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.deleteImageButton}
              activeOpacity={0.8}
              onPress={() => onDeleteImage(img.id)}
            >
              <Ionicons name="close" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  ),
);

const SummaryCard = React.memo(
  ({ vehicle, maintenanceType, garageName, totalCost, completionDate }) => {
    const isMajor = maintenanceType === "Major";
    const postStatus = isMajor ? "In Service" : "Available";
    const postStatusColor = isMajor ? COLORS.danger : COLORS.success;

    return (
      <View style={styles.summaryCardContainer}>
        <View style={styles.summaryHeader}>
          <MaterialCommunityIcons
            name="file-document-outline"
            size={22}
            color={COLORS.primary}
          />
          <Text style={styles.summaryTitle}>Maintenance Summary</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Selected Vehicle</Text>
          <Text style={styles.summaryValue}>
            {vehicle ? vehicle.vehicleName : "Not selected"}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Maintenance Type</Text>
          <View
            style={[
              styles.summaryBadge,
              {
                backgroundColor: isMajor
                  ? COLORS.dangerLight
                  : COLORS.primaryLight,
              },
            ]}
          >
            <Text
              style={[
                styles.summaryBadgeText,
                { color: isMajor ? COLORS.danger : COLORS.primary },
              ]}
            >
              {maintenanceType} Repair
            </Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Assigned Garage</Text>
          <Text style={styles.summaryValue}>
            {garageName || "AutoCare Guwahati"}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Expected Completion</Text>
          <Text style={styles.summaryValue}>{completionDate || "Not set"}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Estimated Total</Text>
          <Text style={styles.summaryCostHighlight}>
            ₹{totalCost ? Number(totalCost).toLocaleString("en-IN") : "0"}
          </Text>
        </View>

        <View style={styles.summaryStatusNotice}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={postStatusColor}
          />
          <Text style={styles.summaryNoticeText}>
            After saving, vehicle booking status will update to{" "}
            <Text style={{ fontWeight: "800", color: postStatusColor }}>
              "{postStatus}"
            </Text>
            .
          </Text>
        </View>
      </View>
    );
  },
);

const VehiclePickerModal = React.memo(
  ({
    visible,
    onClose,
    onSelectVehicle,
    vehicles,
    loading,
    error,
    onRetry,
  }) => {
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
      const q = search.trim().toLowerCase();
      if (!q) return vehicles;
      return vehicles.filter((v) => {
        const name = (v.vehicleName || "").toLowerCase();
        const number = (v.vehicleNumber || "").toLowerCase();
        return name.includes(q) || number.includes(q);
      });
    }, [vehicles, search]);

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={false}
        onRequestClose={onClose}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Fleet Vehicle</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <Ionicons name="close" size={22} color={COLORS.textDark} />
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <View style={styles.modalSearchBox}>
              <Ionicons
                name="search"
                size={18}
                color={COLORS.textLight}
                style={{ marginRight: 8 }}
              />
              <TextInput
                placeholder="Search by vehicle name or plate number..."
                value={search}
                onChangeText={setSearch}
                style={{ flex: 1, fontSize: 14, color: COLORS.textDark }}
              />
            </View>
          </View>

          {loading ? (
            <View style={styles.modalCenterState}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.modalCenterStateText}>
                Loading vehicles...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.modalCenterState}>
              <Ionicons
                name="alert-circle-outline"
                size={32}
                color={COLORS.danger}
              />
              <Text style={styles.modalCenterStateText}>{error}</Text>
              {onRetry ? (
                <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.modalCenterState}>
              <Ionicons name="car-outline" size={32} color={COLORS.textLight} />
              <Text style={styles.modalCenterStateText}>
                {vehicles.length === 0
                  ? "No vehicles found in fleet"
                  : "No vehicles match your search"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 30,
              }}
              renderItem={({ item }) => {
                const statusColors = getStatusColor(item.status);
                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={styles.modalVehicleCard}
                    onPress={() => {
                      onSelectVehicle(item);
                      onClose();
                    }}
                  >
                    <VehicleThumbnail
                      uri={item.image}
                      size={48}
                      style={styles.modalVehicleImg}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalVehicleName}>
                        {item.vehicleName}
                      </Text>
                      <Text style={styles.modalVehicleNumber}>
                        {item.vehicleNumber}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusColors.bg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: statusColors.text },
                        ]}
                      >
                        {formatStatusLabel(item.status)}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={COLORS.textLight}
                    />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
    );
  },
);

const SuccessModal = React.memo(
  ({ visible, vehicleName, onDone, onAddAnother }) => (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDone}
    >
      <View style={styles.successOverlay}>
        <View style={styles.successCard}>
          <View style={styles.successIconCircle}>
            <Ionicons name="checkmark" size={34} color="#FFFFFF" />
          </View>
          <Text style={styles.successTitle}>Maintenance Created!</Text>
          <Text style={styles.successSubtitle}>
            {vehicleName
              ? `Your maintenance request for ${vehicleName} has been saved successfully.`
              : "Your maintenance request has been saved successfully."}
          </Text>

          <View style={styles.successButtonsRow}>
            <TouchableOpacity
              style={styles.successSecondaryButton}
              activeOpacity={0.8}
              onPress={onAddAnother}
            >
              <Text style={styles.successSecondaryButtonText}>Add Another</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.successPrimaryButton}
              activeOpacity={0.85}
              onPress={onDone}
            >
              <Text style={styles.successPrimaryButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  ),
);

// --- MAIN SCREEN COMPONENT ---
export default function AddMaintenanceScreen() {
  // Form State
  const [maintenanceType, setMaintenanceType] = useState("Major"); // 'Major' | 'Minor'
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Garage Info State
  const [garageName, setGarageName] = useState("");
  const [garageContact, setGarageContact] = useState("");
  const [garageAddress, setGarageAddress] = useState("");
  const [garageGst, setGarageGst] = useState("");

  // Costs & Estimates
  const [partsCost, setPartsCost] = useState("");
  const [labourCost, setLabourCost] = useState("");
  const [odometer, setOdometer] = useState("");

  // Expected completion date is a JS Date (or null until picked), selected
  // via the native calendar picker instead of typed free-text.
  const [expectedDate, setExpectedDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [vehicleError, setVehicleError] = useState("");

  // Photos & Notes
  // Each image: { id, uri (local device uri), url (remote Cloudinary url,
  // null until upload completes), uploading (bool), error (string|null) }
  const [images, setImages] = useState([]);
  const [additionalNotes, setAdditionalNotes] = useState("");

  // UI Control States
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedVehicleName, setSavedVehicleName] = useState("");

  // Auto calculate total
  const calculatedTotal = useMemo(() => {
    const parts = parseFloat(partsCost) || 0;
    const labour = parseFloat(labourCost) || 0;
    return (parts + labour).toString();
  }, [partsCost, labourCost]);

  // Validation Logic
  const validateForm = () => {
    let newErrors = {};
    if (!selectedVehicle)
      newErrors.vehicle = "Please select a vehicle from fleet";
    if (!title.trim()) newErrors.title = "Maintenance title is required";
    if (!description.trim())
      newErrors.description = "Maintenance description is required";
    if (!garageName.trim()) newErrors.garageName = "Garage name is required";
    if (images.some((img) => img.uploading))
      newErrors.images = "Please wait for photos to finish uploading";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getVehicles = async () => {
    try {
      setLoadingVehicles(true);
      setVehicleError("");

      const response = await api.get("/vehicles/getAll");

      if (response.data.success) {
        setVehicles(response.data.data);
      } else {
        setVehicleError("Unable to load vehicles");
      }
    } catch (error) {
      console.log("Vehicle load error:", error?.message);
      setVehicleError("Unable to load vehicles");
    } finally {
      setLoadingVehicles(false);
    }
  };

  useEffect(() => {
    getVehicles();
  }, []);

  const resetForm = () => {
    setSelectedVehicle(null);
    setMaintenanceType("Major");
    setTitle("");
    setDescription("");
    setGarageName("");
    setGarageContact("");
    setGarageAddress("");
    setGarageGst("");
    setPartsCost("");
    setLabourCost("");
    setOdometer("");
    setExpectedDate(null);
    setShowDatePicker(false);
    setImages([]);
    setAdditionalNotes("");
    setErrors({});
    setSaveError("");
  };

  /* =========================================================
     EXPECTED COMPLETION DATE PICKER
  ========================================================= */

  const handleDateChange = (event, selectedDate) => {
    // On Android the picker is a dialog that closes itself; on iOS it's
    // inline/spinner so visibility is controlled manually via a Done button.
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (event.type === "dismissed") return;
    if (selectedDate) {
      setExpectedDate(selectedDate);
    }
  };

  /* =========================================================
     PHOTO CAPTURE + UPLOAD
     Flow: pick/capture asset -> show local preview immediately with
     an "uploading" overlay -> POST to /vehicles/upload-maintenance-image
     as multipart/form-data -> on success store the returned Cloudinary
     url on that image entry, on failure show a retry overlay.
  ========================================================= */

  const uploadImageAsset = async (asset, existingId) => {
    const localId =
      existingId ||
      `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (existingId) {
      setImages((prev) =>
        prev.map((img) =>
          img.id === existingId
            ? { ...img, uploading: true, error: null }
            : img,
        ),
      );
    } else {
      setImages((prev) => [
        ...prev,
        {
          id: localId,
          uri: asset.uri,
          url: null,
          uploading: true,
          error: null,
        },
      ]);
    }

    try {
      const filename =
        asset.fileName ||
        asset.uri.split("/").pop() ||
        `photo-${Date.now()}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const type =
        asset.mimeType || (match ? `image/${match[1]}` : "image/jpeg");

      const formData = new FormData();
      formData.append("image", {
        uri: asset.uri,
        name: filename,
        type,
      });

      const response = await api.post(
        "/vehicles/upload-maintenance-image",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      if (response.data.success && response.data.url) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === localId
              ? {
                  ...img,
                  url: response.data.url,
                  uploading: false,
                  error: null,
                }
              : img,
          ),
        );
      } else {
        throw new Error(response.data.message || "Upload failed");
      }
    } catch (error) {
      console.log("Image upload error:", error?.message);
      setImages((prev) =>
        prev.map((img) =>
          img.id === localId
            ? { ...img, uploading: false, error: "Upload failed" }
            : img,
        ),
      );
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Camera Permission Required",
          "Please allow camera access in Settings to take maintenance photos.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.length) return;

      await uploadImageAsset(result.assets[0]);
    } catch (error) {
      console.log("Camera error:", error?.message);
      Alert.alert("Error", "Unable to open camera. Please try again.");
    }
  };

  const handleChooseFromGallery = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Photo Library Permission Required",
          "Please allow photo library access in Settings to select maintenance photos.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.length) return;

      await uploadImageAsset(result.assets[0]);
    } catch (error) {
      console.log("Gallery error:", error?.message);
      Alert.alert("Error", "Unable to open photo library. Please try again.");
    }
  };

  const handleAddPhoto = () => {
    Alert.alert(
      "Add Photo",
      "Choose a source for the maintenance photo",
      [
        { text: "Take Photo", onPress: handleTakePhoto },
        { text: "Choose from Gallery", onPress: handleChooseFromGallery },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  };

  const handleDeletePhoto = (id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleRetryUpload = (id) => {
    const img = images.find((i) => i.id === id);
    if (img) uploadImageAsset({ uri: img.uri }, id);
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    setSaveError("");

    try {
      const payload = {
        vehicle: selectedVehicle._id,
        maintenanceType,
        title: title.trim(),
        description: description.trim(),
        garage: {
          name: garageName.trim(),
          contact: garageContact.trim(),
          address: garageAddress.trim(),
          gstin: garageGst.trim(),
        },
        costs: {
          partsCost: Number(partsCost) || 0,
          labourCost: Number(labourCost) || 0,
          totalCost: Number(calculatedTotal) || 0,
        },
        odometer: Number(odometer) || undefined,
        expectedCompletionDate: expectedDate
          ? expectedDate.toISOString()
          : undefined,
        images: images.filter((img) => img.url).map((img) => img.url),
        additionalNotes: additionalNotes.trim(),
      };

      const response = await api.post("/vehicles/create-maintenance", payload);

      if (response.data.success) {
        setSavedVehicleName(selectedVehicle?.vehicleName || "");
        setShowSuccessModal(true);
      } else {
        setSaveError(
          response.data.message || "Something went wrong. Please try again.",
        );
      }
    } catch (error) {
      console.log("Save maintenance error:", error?.message);
      setSaveError(
        error?.response?.data?.message ||
          "Unable to save maintenance request. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // On success "Done": leave the form and go back to wherever the user
  // came from (the vehicle/maintenance list), so they land back on a
  // screen that reflects the newly created record. Falls back to
  // replacing with the fleet list route if there's nothing to pop back to
  // (e.g. this screen was opened directly via a deep link).
  const handleSuccessDone = () => {
    setShowSuccessModal(false);
    resetForm();
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace("/vehicles");
    }
  };

  const handleSuccessAddAnother = () => {
    setShowSuccessModal(false);
    resetForm();
  };

  // Generic back button (header / cancel) — same logic, just without the
  // form reset since the user may be abandoning mid-edit intentionally.
  const handleBackPress = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace("/vehicles");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <Header onBackPress={handleBackPress} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* SECTION 1: Vehicle Selector */}
          <VehicleSelector
            selectedVehicle={selectedVehicle}
            onPress={() => setIsVehicleModalOpen(true)}
            error={errors.vehicle}
          />

          {/* SECTION 2: Maintenance Type */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>2. Maintenance Type</Text>

            <View style={styles.typeSelectionRow}>
              <MaintenanceTypeCard
                type="Major"
                title="Major"
                subtitle="Vehicle will become unavailable for rental bookings."
                examples={["Engine", "Transmission", "Clutch"]}
                isSelected={maintenanceType === "Major"}
                onSelect={setMaintenanceType}
                activeColor={COLORS.danger}
              />

              <MaintenanceTypeCard
                type="Minor"
                title="Minor"
                subtitle="Vehicle remains available for normal rental bookings."
                examples={["Oil Change", "Tire Rotation", "AC Service"]}
                isSelected={maintenanceType === "Minor"}
                onSelect={setMaintenanceType}
                activeColor={COLORS.primary}
              />
            </View>
          </View>

          {/* SECTION 3: Maintenance Details */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>3. Maintenance Details</Text>

            <InputField
              label="Maintenance Title"
              placeholder="e.g. Periodic Service & Brake Pads"
              value={title}
              onChangeText={setTitle}
              required
              error={errors.title}
              icon="construct-outline"
            />

            <InputField
              label="Detailed Description"
              placeholder="Describe work to be carried out..."
              value={description}
              onChangeText={setDescription}
              required
              multiline
              error={errors.description}
            />
          </View>

          {/* SECTION 4: Garage Information */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>4. Garage Information</Text>

            <InputField
              label="Garage Name"
              placeholder="e.g. AutoCare Workshop"
              value={garageName}
              onChangeText={setGarageName}
              required
              error={errors.garageName}
              icon="business-outline"
            />

            <View style={styles.twoColumnRow}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Contact Number"
                  placeholder="+91 98000 00000"
                  value={garageContact}
                  onChangeText={setGarageContact}
                  keyboardType="phone-pad"
                  icon="call-outline"
                />
              </View>
              <View style={{ flex: 1 }}>
                <InputField
                  label="GSTIN (Optional)"
                  placeholder="18AAAAA0000A1Z5"
                  value={garageGst}
                  onChangeText={setGarageGst}
                  icon="receipt-outline"
                />
              </View>
            </View>

            <InputField
              label="Garage Address"
              placeholder="Location or address of workshop"
              value={garageAddress}
              onChangeText={setGarageAddress}
              icon="location-outline"
            />

            <TouchableOpacity
              style={styles.mapPlaceholderButton}
              activeOpacity={0.7}
            >
              <Ionicons
                name="map-outline"
                size={16}
                color={COLORS.primary}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.mapPlaceholderText}>
                Pin Garage Location on Map (Future)
              </Text>
            </TouchableOpacity>
          </View>

          {/* SECTION 5: Estimated Costs */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>5. Estimates & Mileage</Text>

            <View style={styles.twoColumnRow}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Parts Cost (₹)"
                  placeholder="0"
                  value={partsCost}
                  onChangeText={setPartsCost}
                  keyboardType="numeric"
                  icon="hardware-chip-outline"
                />
              </View>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Labor Cost (₹)"
                  placeholder="0"
                  value={labourCost}
                  onChangeText={setLabourCost}
                  keyboardType="numeric"
                  icon="people-outline"
                />
              </View>
            </View>

            <View style={styles.calculatedCostBox}>
              <Text style={styles.calculatedLabel}>Estimated Total Cost</Text>
              <Text style={styles.calculatedValue}>
                ₹{Number(calculatedTotal).toLocaleString("en-IN")}
              </Text>
            </View>

            <View style={styles.twoColumnRow}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Current Odometer"
                  placeholder="128540 km"
                  value={odometer}
                  onChangeText={setOdometer}
                  keyboardType="numeric"
                  icon="speedometer-outline"
                />
              </View>
              <View style={{ flex: 1 }}>
                <DateField
                  label="Expected Completion"
                  value={expectedDate}
                  onPress={() => setShowDatePicker(true)}
                />
              </View>
            </View>
          </View>

          {/* SECTION 6: Photo Upload */}
          <ImageUploader
            images={images}
            onAddImage={handleAddPhoto}
            onDeleteImage={handleDeletePhoto}
            onRetryImage={handleRetryUpload}
            error={errors.images}
          />

          {/* SECTION 7: Additional Instructions */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>7. Additional Instructions</Text>

            <InputField
              label="Service Notes & Observations"
              placeholder="Write any driver complaints, special instructions, or notes for workshop..."
              value={additionalNotes}
              onChangeText={setAdditionalNotes}
              multiline
            />
          </View>

          {/* SECTION 8: Live Summary */}
          <SummaryCard
            vehicle={selectedVehicle}
            maintenanceType={maintenanceType}
            garageName={garageName}
            totalCost={calculatedTotal}
            completionDate={formatExpectedDate(expectedDate)}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* STICKY BOTTOM BAR */}
      <View style={styles.stickyWrapper}>
        {saveError ? (
          <View style={styles.saveErrorBanner}>
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={COLORS.danger}
            />
            <Text style={styles.saveErrorBannerText}>{saveError}</Text>
          </View>
        ) : null}

        <View style={styles.stickyBottomBar}>
          <TouchableOpacity
            style={styles.cancelButton}
            activeOpacity={0.7}
            onPress={handleBackPress}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, isSaving && { opacity: 0.8 }]}
            activeOpacity={0.85}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#FFFFFF"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.saveButtonText}>Save Maintenance</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* SEARCH VEHICLE MODAL */}
      <VehiclePickerModal
        visible={isVehicleModalOpen}
        onClose={() => setIsVehicleModalOpen(false)}
        onSelectVehicle={(veh) => setSelectedVehicle(veh)}
        vehicles={vehicles}
        loading={loadingVehicles}
        error={vehicleError}
        onRetry={getVehicles}
      />

      {/* SUCCESS MODAL */}
      <SuccessModal
        visible={showSuccessModal}
        vehicleName={savedVehicleName}
        onDone={handleSuccessDone}
        onAddAnother={handleSuccessAddAnother}
      />

      {/* EXPECTED COMPLETION DATE PICKER */}
      {showDatePicker && (
        <DateTimePicker
          value={expectedDate || new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={new Date()}
          onValueChange={handleDateChange}
          onDismiss={() => setShowDatePicker(false)}
        />
      )}
      {Platform.OS === "ios" && showDatePicker && (
        <TouchableOpacity
          style={styles.datePickerDoneRow}
          onPress={() => setShowDatePicker(false)}
        >
          <Text style={styles.datePickerDoneText}>Done</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

// --- STYLESHEET ---
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textDark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // Scroll Content
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 110,
  },

  // Section Layout
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.textDark,
    marginBottom: 12,
  },
  requiredTag: {
    fontSize: 11,
    color: COLORS.danger,
    fontWeight: "600",
  },
  sectionMetaText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // Vehicle Selector Card
  vehicleCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  selectedVehicleContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  vehicleThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textDark,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  vehicleMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  numberBadge: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  vehicleNumberText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  vehicleTypeMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  kmMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  kmMetaText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
  placeholderVehicleContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  placeholderIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  placeholderSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // Maintenance Type Cards
  typeSelectionRow: {
    flexDirection: "row",
    gap: 12,
  },
  typeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    minHeight: 160,
  },
  typeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.textLight,
    justifyContent: "center",
    alignItems: "center",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  typeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  typeSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 15,
    marginBottom: 10,
  },
  exampleTagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: "auto",
  },
  exampleChip: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  exampleChipText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: "500",
  },

  // Input Fields
  inputContainer: {
    marginBottom: 14,
  },
  inputLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  requiredAsterisk: {
    color: COLORS.danger,
    marginLeft: 3,
    fontSize: 13,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  multilineWrapper: {
    minHeight: 90,
    alignItems: "flex-start",
    paddingVertical: 10,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textDark,
  },
  multilineInput: {
    height: "100%",
  },
  inputErrorBorder: {
    borderColor: COLORS.danger,
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    fontSize: 11,
    color: COLORS.danger,
    marginTop: 4,
    fontWeight: "600",
  },

  // Two Column Inputs
  twoColumnRow: {
    flexDirection: "row",
    gap: 12,
  },

  // Map Button
  mapPlaceholderButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    marginTop: 4,
  },
  mapPlaceholderText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },

  // Calculated Cost Box
  calculatedCostBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    marginBottom: 14,
  },
  calculatedLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  calculatedValue: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.primary,
  },

  // Photo Uploader
  imageScrollContainer: {
    gap: 12,
  },
  uploadCard: {
    width: 100,
    height: 100,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  uploadIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  uploadCardTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
  uploadCardSub: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  previewImageContainer: {
    width: 100,
    height: 100,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  deleteImageButton: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  imageProgressBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  imageProgressText: {
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  imageUploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  imageErrorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(239, 68, 68, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  imageOverlayText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Summary Card
  summaryCardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 10,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textDark,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  summaryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  summaryBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  summaryCostHighlight: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.primary,
  },
  summaryStatusNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.background,
    padding: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  summaryNoticeText: {
    fontSize: 11,
    color: COLORS.textMuted,
    flex: 1,
  },

  // Sticky Bottom Bar
  stickyWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  saveErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.dangerLight,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  saveErrorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.danger,
  },
  stickyBottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  saveButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  // Modal
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textDark,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  modalSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalVehicleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  modalVehicleImg: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  modalVehicleName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  modalVehicleNumber: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  modalCenterState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  modalCenterStateText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Success Modal
  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  successCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.success,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textDark,
    marginBottom: 6,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 22,
  },
  successButtonsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  successSecondaryButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  successSecondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  successPrimaryButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  successPrimaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Date Picker (iOS Done button)
  datePickerDoneRow: {
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  datePickerDoneText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primary,
  },
});
