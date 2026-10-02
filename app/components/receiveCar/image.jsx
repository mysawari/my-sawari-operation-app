import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../../services/api";
import useAuthStore from "../../../store/authStore";

/* ==========================
   CAR PHOTOS (all required)
========================== */

const CAR_EXTERIOR_SHOTS = [
  {
    key: "vehicleFront",
    label: "Front View",
    icon: "car-outline",
    detail: "Capture plate & bumper",
  },
  {
    key: "vehicleRear",
    label: "Rear View",
    icon: "car-outline",
    detail: "Capture plate & trunk",
  },
  {
    key: "vehicleLeft",
    label: "Left Side",
    icon: "car-side",
    detail: "Full length left body",
  },
  {
    key: "vehicleRight",
    label: "Right Side",
    icon: "car-side",
    detail: "Full length right body",
  },
];

const CAR_TYRE_TOOLKIT_SHOTS = [
  {
    key: "tyreFrontLeft",
    label: "Front Left Tyre",
    icon: "car-tire-alert",
    detail: "Tread & condition",
  },
  {
    key: "tyreFrontRight",
    label: "Front Right Tyre",
    icon: "car-tire-alert",
    detail: "Tread & condition",
  },
  {
    key: "tyreRearLeft",
    label: "Rear Left Tyre",
    icon: "car-tire-alert",
    detail: "Tread & condition",
  },
  {
    key: "tyreRearRight",
    label: "Rear Right Tyre",
    icon: "car-tire-alert",
    detail: "Tread & condition",
  },
  {
    key: "spareTyre",
    label: "Spare Tyre",
    icon: "car-tire-alert",
    detail: "Presence & condition",
  },
  {
    key: "toolkit",
    label: "Toolkit",
    icon: "toolbox",
    detail: "Verify completeness",
  },
];

/* ==========================
   BIKE PHOTOS
   Only the 4 exterior photos are required; the rest are optional.
   Field names match the backend (tyreFront / tyreRear / helmet).
========================== */

const BIKE_EXTERIOR_SHOTS = [
  {
    key: "vehicleFront",
    label: "Front View",
    icon: "motorbike",
    detail: "Headlight & number plate",
  },
  {
    key: "vehicleRear",
    label: "Rear View",
    icon: "motorbike",
    detail: "Tail light & number plate",
  },
  {
    key: "vehicleLeft",
    label: "Left Side",
    icon: "motorbike",
    detail: "Full left side",
  },
  {
    key: "vehicleRight",
    label: "Right Side",
    icon: "motorbike",
    detail: "Full right side",
  },
];

const BIKE_OPTIONAL_SHOTS = [
  {
    key: "tyreFront",
    label: "Front Tyre",
    icon: "tire",
    detail: "Tread & condition",
  },
  {
    key: "tyreRear",
    label: "Rear Tyre",
    icon: "tire",
    detail: "Tread & condition",
  },
  {
    key: "helmet",
    label: "Helmet",
    icon: "racing-helmet",
    detail: "Returned & condition",
  },
  {
    key: "toolkit",
    label: "Toolkit",
    icon: "toolbox",
    detail: "If provided",
  },
];

const toFormFile = (uri, fallbackName) => {
  const cleanUri = Platform.OS === "ios" ? uri.replace("file://", "") : uri;
  const filename = uri.split("/").pop() || `${fallbackName}.jpg`;
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : "jpg";
  const type = ext === "png" ? "image/png" : "image/jpeg";

  return {
    uri: Platform.OS === "ios" ? uri : cleanUri,
    name: filename,
    type,
  };
};

export default function ReceiveCarImageScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const params = useLocalSearchParams();

  const {
    handoverId,
    vehicleCategory,
    isBike: isBikeParam,
    fuelLevel,
    kilometersAtReturn,
    hasDamage,
    damageNotes,
    damageImages,
    repairEstimate,
    repairDays,
    lateReturnFine,
    extraKmFine,
    fuelUsageAmount,
    amountCollected,
    paymentMode,
    paymentBreakdown,
    upiLast4,
    balanceReason,
    needsMaintenance,
    maintenanceReason,
    maintenanceDays,
    inspection,
  } = params;

  // Category comes from the previous screen, which read it from
  // vehicle.category in the /handover/single/:id response.
  const isBike =
    String(vehicleCategory || "").toLowerCase() === "bike" ||
    isBikeParam === "yes";

  // Required photos block submit; optional photos are sent only if taken.
  const exteriorShots = isBike ? BIKE_EXTERIOR_SHOTS : CAR_EXTERIOR_SHOTS;
  const secondaryShots = isBike ? BIKE_OPTIONAL_SHOTS : CAR_TYRE_TOOLKIT_SHOTS;
  const secondaryRequired = !isBike;

  const requiredShots = secondaryRequired
    ? [...exteriorShots, ...secondaryShots]
    : exteriorShots;
  const optionalShots = secondaryRequired ? [] : secondaryShots;

  const [shots, setShots] = useState({});

  const [additionalImages, setAdditionalImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Guards against a photo tile being tapped again while the camera from
  // the previous tap is still opening/resolving (double-tap crash).
  const [capturingKey, setCapturingKey] = useState(null);
  const isCapturing = capturingKey !== null;

  const capturedDamageImages = (() => {
    try {
      return damageImages ? JSON.parse(damageImages) : [];
    } catch {
      return [];
    }
  })();

  const isDamaged = hasDamage === "yes";

  const openCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission Required",
        "Camera access is required to take vehicle photos.",
      );
      return null;
    }
    // Straight to capture, no crop screen, default camera ratio.
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.length) {
      return result.assets[0].uri;
    }
    return null;
  };

  const captureShot = async (key) => {
    if (isCapturing) return;

    try {
      setCapturingKey(key);
      const uri = await openCamera();
      if (uri) setShots((prev) => ({ ...prev, [key]: uri }));
    } catch (error) {
      Alert.alert("Error", "Unable to capture the photo. Please try again.");
    } finally {
      setCapturingKey(null);
    }
  };

  const removeShot = (key) => {
    setShots((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const captureAdditionalImage = async () => {
    if (isCapturing) return;

    try {
      setCapturingKey("additional");
      const uri = await openCamera();
      if (uri) setAdditionalImages((prev) => [...prev, uri]);
    } catch (error) {
      Alert.alert("Error", "Unable to capture the photo. Please try again.");
    } finally {
      setCapturingKey(null);
    }
  };

  const removeAdditionalImage = (index) => {
    setAdditionalImages((prev) => prev.filter((_, i) => i !== index));
  };

  const requiredCompletedCount = requiredShots.filter(
    (s) => !!shots[s.key],
  ).length;
  const allRequiredCaptured = requiredCompletedCount === requiredShots.length;

  const exteriorCompletedCount = exteriorShots.filter(
    (s) => !!shots[s.key],
  ).length;
  const secondaryCompletedCount = secondaryShots.filter(
    (s) => !!shots[s.key],
  ).length;

  const handleSubmit = async () => {
    if (!allRequiredCaptured) {
      Alert.alert(
        "Missing Photos",
        isBike
          ? "Please capture the front, rear, left and right photos of the bike before submitting."
          : "Please capture all mandatory vehicle photos (exterior angles, tyres, and toolkit) before submitting.",
      );
      return;
    }

    if (isDamaged && capturedDamageImages.length === 0) {
      Alert.alert(
        "Missing Evidence",
        "Damage photos are required when damage is marked on the return form.",
      );
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();

      formData.append("fuelLevel", String(fuelLevel ?? ""));
      formData.append("kilometersAtReturn", String(kilometersAtReturn ?? ""));
      formData.append("hasDamage", String(isDamaged));
      formData.append("damageNotes", damageNotes || "");
      formData.append("inspection", inspection || "[]");

      formData.append("repairEstimate", String(repairEstimate ?? ""));
      formData.append("repairDays", String(repairDays ?? ""));

      formData.append("lateReturnFine", String(lateReturnFine ?? ""));
      formData.append("extraKmFine", String(extraKmFine ?? ""));
      formData.append("fuelUsageAmount", String(fuelUsageAmount ?? ""));
      formData.append("amountCollected", String(amountCollected ?? ""));
      formData.append("paymentMode", paymentMode || "Cash");
      formData.append("paymentBreakdown", paymentBreakdown || "{}");
      formData.append("balanceReason", balanceReason || "");
      formData.append("upiLast4", upiLast4 || "[]");

      formData.append("needsMaintenance", String(needsMaintenance === "yes"));
      formData.append("maintenanceReason", maintenanceReason || "");
      formData.append("maintenanceDays", String(maintenanceDays ?? ""));

      // Required photos — all present (checked above).
      requiredShots.forEach(({ key }) => {
        formData.append(key, toFormFile(shots[key], key));
      });

      // Optional photos — only the ones actually taken.
      optionalShots.forEach(({ key }) => {
        if (shots[key]) {
          formData.append(key, toFormFile(shots[key], key));
        }
      });

      if (isDamaged) {
        capturedDamageImages.forEach((uri, index) => {
          formData.append("damageImages", toFormFile(uri, `damage_${index}`));
        });
      }

      additionalImages.forEach((uri, index) => {
        formData.append(
          "additionalImages",
          toFormFile(uri, `additional_${index}`),
        );
      });

      await api.post(`/vehicle-return/receive/${handoverId}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      Alert.alert(
        "Return Completed",
        isBike
          ? "Bike return has been recorded successfully."
          : "Vehicle return has been recorded successfully.",
        [
          {
            text: "Done",
            onPress: () => router.replace("/components/receiveCar/list"),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Submission Error",
        error?.response?.data?.message ||
          "Failed to process vehicle return. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderShotGrid = (shotList, { optional = false } = {}) => (
    <View style={styles.shotGrid}>
      {shotList.map(({ key, label, icon, detail }) => {
        const uri = shots[key];
        const tileCapturing = capturingKey === key;
        return (
          <View key={key} style={styles.shotCardWrapper}>
            {uri ? (
              <View style={styles.imageCard}>
                <Image source={{ uri }} style={styles.shotImage} />
                <View style={styles.imageOverlayTop}>
                  <View style={styles.completedBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#16A34A"
                    />
                    <Text style={styles.completedBadgeText}>Captured</Text>
                  </View>
                  {optional && (
                    <TouchableOpacity
                      style={styles.removeShotBadge}
                      onPress={() => removeShot(key)}
                      disabled={isCapturing}
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    styles.retakeButton,
                    tileCapturing && { opacity: 0.6 },
                  ]}
                  activeOpacity={0.8}
                  onPress={() => captureShot(key)}
                  disabled={isCapturing}
                >
                  {tileCapturing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="camera-reverse" size={16} color="#FFFFFF" />
                  )}
                  <Text style={styles.retakeButtonText}>Retake</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.placeholderCard,
                  optional && styles.placeholderCardOptional,
                  tileCapturing && { opacity: 0.6 },
                ]}
                activeOpacity={0.7}
                onPress={() => captureShot(key)}
                disabled={isCapturing}
              >
                {tileCapturing ? (
                  <ActivityIndicator size="small" color="#2563EB" />
                ) : (
                  <View style={styles.placeholderIconContainer}>
                    <MaterialCommunityIcons
                      name={icon}
                      size={28}
                      color={optional ? "#64748B" : "#2563EB"}
                    />
                    <View
                      style={[
                        styles.cameraBadgeIcon,
                        optional && { backgroundColor: "#64748B" },
                      ]}
                    >
                      <Ionicons name="camera" size={12} color="#FFFFFF" />
                    </View>
                  </View>
                )}
                <Text
                  style={[
                    styles.placeholderLabel,
                    optional && { color: "#334155" },
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    styles.placeholderDetail,
                    optional && { color: "#94A3B8" },
                  ]}
                >
                  {optional ? `Optional · ${detail}` : detail}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#08142E" barStyle="light-content" />

      {/* Header Bar */}
      <LinearGradient colors={["#08142E", "#0F2963"]} style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>
            {isBike ? "Bike Photos" : "Vehicle Photos"}
          </Text>
          <Text style={styles.headerSubtitle}>
            Step 2 of 2 • Inspection Audit
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Exterior Photos Section (required for car & bike) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitleRow}>
              <MaterialCommunityIcons
                name="camera-outline"
                size={22}
                color="#1E40AF"
              />
              <Text style={styles.cardTitle}>Exterior Mandatory Photos</Text>
              <Text style={styles.requiredAsterisk}>*</Text>
            </View>
            <View
              style={[
                styles.progressBadge,
                exteriorCompletedCount === exteriorShots.length &&
                  styles.progressBadgeComplete,
              ]}
            >
              <Text
                style={[
                  styles.progressBadgeText,
                  exteriorCompletedCount === exteriorShots.length &&
                    styles.progressBadgeTextComplete,
                ]}
              >
                {exteriorCompletedCount}/{exteriorShots.length} Done
              </Text>
            </View>
          </View>

          <Text style={styles.cardDescription}>
            {isBike
              ? "Take clear photos of the front, rear, left and right of the bike to document return condition."
              : "Take clear photos of all four angles of the vehicle to document return condition."}
          </Text>

          {renderShotGrid(exteriorShots)}
        </View>

        {/* Car: Tyre & Toolkit (required) | Bike: Tyres, Helmet & Toolkit (optional) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitleRow}>
              <MaterialCommunityIcons
                name={isBike ? "tire" : "car-tire-alert"}
                size={22}
                color={secondaryRequired ? "#1E40AF" : "#475569"}
              />
              <Text style={styles.cardTitle}>
                {isBike ? "Tyres, Helmet & Toolkit" : "Tyre & Toolkit Photos"}
              </Text>
              {secondaryRequired ? (
                <Text style={styles.requiredAsterisk}>*</Text>
              ) : (
                <View style={styles.optionalPill}>
                  <Text style={styles.optionalPillText}>Optional</Text>
                </View>
              )}
            </View>
            {secondaryRequired ? (
              <View
                style={[
                  styles.progressBadge,
                  secondaryCompletedCount === secondaryShots.length &&
                    styles.progressBadgeComplete,
                ]}
              >
                <Text
                  style={[
                    styles.progressBadgeText,
                    secondaryCompletedCount === secondaryShots.length &&
                      styles.progressBadgeTextComplete,
                  ]}
                >
                  {secondaryCompletedCount}/{secondaryShots.length} Done
                </Text>
              </View>
            ) : (
              <View style={styles.progressBadge}>
                <Text style={styles.progressBadgeText}>
                  {secondaryCompletedCount} Added
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.cardDescription}>
            {isBike
              ? "Add these if useful — they're not needed to submit the return."
              : "Capture all four tyres, the spare tyre, and the toolkit to confirm they're present and in good condition."}
          </Text>

          {renderShotGrid(secondaryShots, { optional: !secondaryRequired })}
        </View>

        {/* Damage Evidence Section */}
        {isDamaged && (
          <View style={[styles.card, styles.damageCardBorder]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderTitleRow}>
                <MaterialCommunityIcons
                  name="alert-decagram-outline"
                  size={22}
                  color="#DC2626"
                />
                <Text style={[styles.cardTitle, { color: "#991B1B" }]}>
                  Damage Evidence
                </Text>
              </View>
              <View style={styles.damageBadge}>
                <Text style={styles.damageBadgeText}>
                  {capturedDamageImages.length} Saved
                </Text>
              </View>
            </View>

            {capturedDamageImages.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollList}
              >
                {capturedDamageImages.map((uri, index) => (
                  <View key={index} style={styles.damageImageContainer}>
                    <Image source={{ uri }} style={styles.damageThumb} />
                    <View style={styles.damageIndexBadge}>
                      <Text style={styles.damageIndexText}>#{index + 1}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.warningContainer}>
                <Ionicons name="warning-outline" size={18} color="#DC2626" />
                <Text style={styles.warningText}>
                  No damage images captured on step 1. Please return back to
                  capture evidence.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Additional Photos Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitleRow}>
              <MaterialCommunityIcons
                name="folder-multiple-image"
                size={20}
                color="#475569"
              />
              <Text style={styles.cardTitle}>Additional Photos</Text>
            </View>
          </View>

          {additionalImages.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScrollList}
            >
              {additionalImages.map((uri, index) => (
                <View key={index} style={styles.additionalImageWrap}>
                  <Image source={{ uri }} style={styles.additionalThumb} />
                  <TouchableOpacity
                    style={styles.removeImageBadge}
                    activeOpacity={0.8}
                    onPress={() => removeAdditionalImage(index)}
                  >
                    <Ionicons name="close" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            style={[styles.addMoreBtn, isCapturing && { opacity: 0.6 }]}
            activeOpacity={0.7}
            onPress={captureAdditionalImage}
            disabled={isCapturing}
          >
            {capturingKey === "additional" ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Ionicons name="add" size={20} color="#2563EB" />
            )}
            <Text style={styles.addMoreBtnText}>Add Extra Photo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      <View style={styles.bottomFooter}>
        <TouchableOpacity
          style={[
            styles.primarySubmitBtn,
            (!allRequiredCaptured || submitting) && styles.disabledSubmitBtn,
          ]}
          activeOpacity={0.85}
          onPress={handleSubmit}
          disabled={!allRequiredCaptured || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <View style={styles.submitBtnContent}>
              <Ionicons
                name="checkmark-done-circle"
                size={22}
                color="#FFFFFF"
              />
              <Text style={styles.primarySubmitBtnText}>
                {isBike ? "Submit Bike Return" : "Submit Vehicle Return"}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  header: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight || 40 : 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleContainer: {
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: "#93C5FD",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  damageCardBorder: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cardHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    flexShrink: 1,
  },
  requiredAsterisk: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: -4,
  },
  optionalPill: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  optionalPillText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748B",
  },
  cardDescription: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 16,
    lineHeight: 18,
  },
  progressBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  progressBadgeComplete: {
    backgroundColor: "#DCFCE7",
  },
  progressBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  progressBadgeTextComplete: {
    color: "#15803D",
  },
  shotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
  },
  shotCardWrapper: {
    width: "48%",
  },
  placeholderCard: {
    width: "100%",
    height: 124,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
  },
  placeholderCardOptional: {
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
  },
  placeholderIconContainer: {
    position: "relative",
    marginBottom: 6,
  },
  cameraBadgeIcon: {
    position: "absolute",
    bottom: -2,
    right: -6,
    backgroundColor: "#2563EB",
    borderRadius: 8,
    padding: 2,
  },
  placeholderLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E3A8A",
  },
  placeholderDetail: {
    fontSize: 10,
    color: "#60A5FA",
    textAlign: "center",
    marginTop: 2,
  },
  imageCard: {
    width: "100%",
    height: 124,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#0F172A",
  },
  shotImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imageOverlayTop: {
    position: "absolute",
    top: 6,
    left: 6,
    right: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  completedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },
  removeShotBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(239, 68, 68, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  retakeButton: {
    position: "absolute",
    bottom: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  retakeButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  damageBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  damageBadgeText: {
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "700",
  },
  horizontalScrollList: {
    gap: 12,
    paddingVertical: 6,
  },
  damageImageContainer: {
    position: "relative",
  },
  damageThumb: {
    width: 90,
    height: 90,
    borderRadius: 10,
    backgroundColor: "#CBD5E1",
  },
  damageIndexBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  damageIndexText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF5F5",
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  warningText: {
    fontSize: 12,
    color: "#991B1B",
    flex: 1,
  },
  additionalImageWrap: {
    position: "relative",
  },
  additionalThumb: {
    width: 86,
    height: 86,
    borderRadius: 10,
    backgroundColor: "#CBD5E1",
  },
  removeImageBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#EF4444",
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  addMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    marginTop: 8,
  },
  addMoreBtnText: {
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 13,
  },
  bottomFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 10,
  },
  primarySubmitBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
  },
  disabledSubmitBtn: {
    backgroundColor: "#94A3B8",
  },
  submitBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primarySubmitBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});