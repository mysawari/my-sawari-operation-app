import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
  { key: "toolkit", label: "Toolkit", icon: "toolbox", detail: "If provided" },
];

const MAX_ADDITIONAL = 20;

// Where to go after a successful return. Change this if your home
// screen lives at a different route (e.g. "/(tabs)/home").
const HOME_ROUTE = "/";

/* ==========================
   PHOTO UPLOAD HELPERS
   take photo -> uploadReturnImage() -> Cloudinary -> { url, publicId }
========================== */

const UPLOAD_TIMEOUT_MS = 60000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makeLocalId = () =>
  `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const toUploadFile = (uri, field) => {
  const fromUri = uri.split("/").pop() || "";
  const ext = (/\.(\w+)$/.exec(fromUri)?.[1] || "jpg").toLowerCase();
  return {
    uri,
    name: `${field}_${Date.now()}.${ext}`,
    type:
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg",
  };
};

const getUploadErrorMessage = (
  error,
  fallback = "Upload failed. Check your connection and retry.",
) => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.code === "ECONNABORTED") return "Upload timed out. Please retry.";
  if (error?.message === "Network Error")
    return "No internet connection. Please retry.";
  return fallback;
};

// Network errors and 5xx get one automatic retry; 4xx don't.
const isRetryable = (error) => !error?.response || error.response.status >= 500;

// Upload ONE photo. Resolves to { field, url, publicId }.
const uploadReturnImage = async ({ handoverId, field, uri, token }) => {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const formData = new FormData();
      formData.append("image", toUploadFile(uri, field));
      const res = await api.post(
        `/vehicle-return/images/${handoverId}/${field}`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
          timeout: UPLOAD_TIMEOUT_MS,
        },
      );
      return res.data.data;
    } catch (error) {
      lastError = error;
      if (attempt === 1 || !isRetryable(error)) break;
      await sleep(1500);
    }
  }
  throw lastError;
};

// Remove an old photo from Cloudinary (retake / remove). Never throws.
const deleteReturnImage = ({ handoverId, field, publicId, token }) => {
  if (!publicId) return Promise.resolve();
  return api
    .delete(`/vehicle-return/images/${handoverId}/${field}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { publicId },
    })
    .catch(() => {});
};

const toUploadedItem = ({ url, publicId }) => ({
  id: publicId,
  url,
  publicId,
  localUri: null,
  status: "uploaded",
  error: null,
});

const toImagePayload = (item) =>
  item?.status === "uploaded" && item.url && item.publicId
    ? { url: item.url, publicId: item.publicId }
    : null;

const safeParse = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
    damageImages: damageImagesParam,
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

  const isBike =
    String(vehicleCategory || "").toLowerCase() === "bike" ||
    isBikeParam === "yes";

  const exteriorShots = isBike ? BIKE_EXTERIOR_SHOTS : CAR_EXTERIOR_SHOTS;
  const secondaryShots = isBike ? BIKE_OPTIONAL_SHOTS : CAR_TYRE_TOOLKIT_SHOTS;
  const secondaryRequired = !isBike;
  const requiredShots = secondaryRequired
    ? [...exteriorShots, ...secondaryShots]
    : exteriorShots;

  const isDamaged = hasDamage === "yes";

  // shots[key] = { url, publicId, localUri, status: uploaded|uploading|failed, error }
  const [shots, setShots] = useState({});
  // [{ id, url, publicId, localUri, status, error }]
  const [additionalImages, setAdditionalImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Damage photos taken on step 1 arrive as local URIs and are uploaded
  // as soon as this screen opens: [{ id, url, publicId, localUri, status }]
  const [damageImages, setDamageImages] = useState(() => {
    if (!isDamaged) return [];
    const list = safeParse(damageImagesParam, []);
    return (Array.isArray(list) ? list : [])
      .filter((uri) => typeof uri === "string" && uri)
      .map((uri) => ({
        id: makeLocalId(),
        url: null,
        publicId: null,
        localUri: uri,
        status: "uploading",
        error: null,
      }));
  });

  // Guards the camera against double taps (only one camera at a time).
  // Uploads themselves run in parallel in the background.
  const [capturingKey, setCapturingKey] = useState(null);
  const isCapturing = capturingKey !== null;

  /* ---------- Damage photos (from step 1) ---------- */

  const uploadDamage = async (id, localUri) => {
    setDamageImages((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, status: "uploading", error: null } : i,
      ),
    );
    try {
      const image = await uploadReturnImage({
        handoverId,
        field: "damageImages",
        uri: localUri,
        token,
      });
      setDamageImages((prev) =>
        prev.map((i) => (i.id === id ? toUploadedItem(image) : i)),
      );
    } catch (error) {
      setDamageImages((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, status: "failed", error: getUploadErrorMessage(error) }
            : i,
        ),
      );
    }
  };

  // Start uploading step-1 damage photos once, when the screen opens.
  const damageStartedRef = useRef(false);
  useEffect(() => {
    if (damageStartedRef.current || !handoverId || !token) return;
    damageStartedRef.current = true;
    damageImages.forEach((item) => uploadDamage(item.id, item.localUri));
  }, [handoverId, token]);

  /* ---------- Camera ---------- */

  const openCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission Required",
        "Camera access is required to take vehicle photos.",
      );
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.length) {
      return result.assets[0].uri;
    }
    return null;
  };

  const takePhoto = async (captureKey) => {
    if (isCapturing) return null;
    setCapturingKey(captureKey);
    try {
      return await openCamera();
    } catch {
      Alert.alert("Error", "Unable to capture the photo. Please try again.");
      return null;
    } finally {
      setCapturingKey(null);
    }
  };

  /* ---------- Single-slot shots ---------- */

  const uploadShot = async (key, localUri) => {
    // Photo currently in this slot (for a retake) — removed from
    // Cloudinary once the new one is safely uploaded.
    const oldPublicId = shots[key]?.publicId;

    setShots((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        localUri,
        status: "uploading",
        error: null,
      },
    }));

    try {
      const image = await uploadReturnImage({
        handoverId,
        field: key,
        uri: localUri,
        token,
      });
      setShots((prev) => ({ ...prev, [key]: toUploadedItem(image) }));
      if (oldPublicId && oldPublicId !== image.publicId) {
        deleteReturnImage({
          handoverId,
          field: key,
          publicId: oldPublicId,
          token,
        });
      }
    } catch (error) {
      setShots((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          localUri,
          status: "failed",
          error: getUploadErrorMessage(error),
        },
      }));
    }
  };

  const captureShot = async (key) => {
    if (shots[key]?.status === "uploading") return;
    const uri = await takePhoto(key);
    if (uri) uploadShot(key, uri);
  };

  const retryShot = (key) => {
    const localUri = shots[key]?.localUri;
    if (localUri) uploadShot(key, localUri);
  };

  const removeShot = (key) => {
    const current = shots[key];
    if (!current || current.status === "uploading") return;

    setShots((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    deleteReturnImage({
      handoverId,
      field: key,
      publicId: current.publicId,
      token,
    });
  };

  /* ---------- Additional photos (list) ---------- */

  const uploadAdditional = async (id, localUri) => {
    setAdditionalImages((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "uploading", error: null } : item,
      ),
    );

    try {
      const image = await uploadReturnImage({
        handoverId,
        field: "additionalImages",
        uri: localUri,
        token,
      });
      setAdditionalImages((prev) =>
        prev.map((item) => (item.id === id ? toUploadedItem(image) : item)),
      );
    } catch (error) {
      setAdditionalImages((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: "failed", error: getUploadErrorMessage(error) }
            : item,
        ),
      );
    }
  };

  const captureAdditionalImage = async () => {
    if (additionalImages.length >= MAX_ADDITIONAL) {
      Alert.alert(
        "Limit reached",
        `You can add up to ${MAX_ADDITIONAL} extra photos.`,
      );
      return;
    }
    const uri = await takePhoto("additional");
    if (!uri) return;

    const id = makeLocalId();
    setAdditionalImages((prev) => [
      ...prev,
      {
        id,
        url: null,
        publicId: null,
        localUri: uri,
        status: "uploading",
        error: null,
      },
    ]);
    uploadAdditional(id, uri);
  };

  const removeAdditionalImage = (item) => {
    if (item.status === "uploading") return;

    setAdditionalImages((prev) => prev.filter((i) => i.id !== item.id));
    deleteReturnImage({
      handoverId,
      field: "additionalImages",
      publicId: item.publicId,
      token,
    });
  };

  /* ---------- Derived state ---------- */

  const isDone = (key) => shots[key]?.status === "uploaded";

  const requiredCompletedCount = requiredShots.filter((s) =>
    isDone(s.key),
  ).length;
  const allRequiredCaptured = requiredCompletedCount === requiredShots.length;
  const exteriorCompletedCount = exteriorShots.filter((s) =>
    isDone(s.key),
  ).length;
  const secondaryCompletedCount = secondaryShots.filter((s) =>
    isDone(s.key),
  ).length;

  const allItems = [
    ...Object.values(shots),
    ...additionalImages,
    ...damageImages,
  ];
  const uploadingCount = allItems.filter(
    (i) => i.status === "uploading",
  ).length;
  const failedCount = allItems.filter((i) => i.status === "failed").length;

  /* ---------- Submit ---------- */

  // Clears the whole receive flow (list -> detail -> photos) from the
  // stack, so Back from Home can't reopen an already-submitted return.
  const goHome = () => {
    if (router.canDismiss()) router.dismissAll();
    router.replace(HOME_ROUTE);
  };

  const handleSubmit = async () => {
    if (uploadingCount > 0) {
      Alert.alert("Please wait", "Some photos are still uploading.");
      return;
    }

    if (failedCount > 0) {
      Alert.alert(
        "Upload failed",
        "Some photos didn't upload. Tap Retry on them, or remove them, before submitting.",
      );
      return;
    }

    if (!allRequiredCaptured) {
      Alert.alert(
        "Missing Photos",
        isBike
          ? "Please capture the front, rear, left and right photos of the bike before submitting."
          : "Please capture all mandatory vehicle photos (exterior angles, tyres, and toolkit) before submitting.",
      );
      return;
    }

    if (
      isDamaged &&
      damageImages.filter((i) => i.status === "uploaded").length === 0
    ) {
      Alert.alert(
        "Missing Evidence",
        "Damage photos are required when damage is marked on the return form. Go back and add them.",
      );
      return;
    }

    try {
      setSubmitting(true);

      const imagesPayload = {};
      Object.entries(shots).forEach(([key, item]) => {
        const payload = toImagePayload(item);
        if (payload) imagesPayload[key] = payload;
      });

      // Photos are already on Cloudinary — this is a small JSON request.
      await api.post(
        `/vehicle-return/receive/${handoverId}`,
        {
          fuelLevel: fuelLevel ?? "",
          kilometersAtReturn: kilometersAtReturn ?? "",
          hasDamage: isDamaged,
          damageNotes: damageNotes || "",
          inspection: safeParse(inspection, []),
          repairEstimate: repairEstimate ?? "",
          repairDays: repairDays ?? "",
          lateReturnFine: lateReturnFine ?? "",
          extraKmFine: extraKmFine ?? "",
          fuelUsageAmount: fuelUsageAmount ?? "",
          amountCollected: amountCollected ?? "",
          paymentMode: paymentMode || "Cash",
          paymentBreakdown: safeParse(paymentBreakdown, {}),
          upiLast4: safeParse(upiLast4, []),
          balanceReason: balanceReason || "",
          needsMaintenance: needsMaintenance === "yes",
          maintenanceReason: maintenanceReason || "",
          maintenanceDays: maintenanceDays ?? "",

          images: imagesPayload,
          damageImages: isDamaged
            ? damageImages.map(toImagePayload).filter(Boolean)
            : [],
          additionalImages: additionalImages
            .map(toImagePayload)
            .filter(Boolean),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      Alert.alert(
        "Return Completed",
        isBike
          ? "Bike return has been recorded successfully."
          : "Vehicle return has been recorded successfully.",
        [{ text: "Done", onPress: goHome }],
        { cancelable: false },
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

  /* ---------- Render ---------- */

  const renderShotGrid = (shotList, { optional = false } = {}) => (
    <View style={styles.shotGrid}>
      {shotList.map(({ key, label, icon, detail }) => {
        const shot = shots[key];
        const tileCapturing = capturingKey === key;
        const previewUri =
          shot?.status === "uploaded" ? shot.url : shot?.localUri || shot?.url;

        return (
          <View key={key} style={styles.shotCardWrapper}>
            {shot && previewUri ? (
              <View style={styles.imageCard}>
                <Image source={{ uri: previewUri }} style={styles.shotImage} />

                {shot.status === "uploading" && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.overlayText}>Uploading…</Text>
                  </View>
                )}

                <View style={styles.imageOverlayTop}>
                  {shot.status === "uploaded" && (
                    <View style={styles.completedBadge}>
                      <Ionicons name="cloud-done" size={14} color="#16A34A" />
                      <Text style={styles.completedBadgeText}>Uploaded</Text>
                    </View>
                  )}
                  {shot.status === "failed" && (
                    <View style={[styles.completedBadge, styles.failedBadge]}>
                      <Ionicons name="alert-circle" size={14} color="#DC2626" />
                      <Text
                        style={[
                          styles.completedBadgeText,
                          { color: "#DC2626" },
                        ]}
                      >
                        Not uploaded
                      </Text>
                    </View>
                  )}
                  {shot.status === "uploading" && <View />}

                  {optional && shot.status !== "uploading" && (
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

                {shot.status === "failed" && (
                  <TouchableOpacity
                    style={[styles.retakeButton, styles.retryButton]}
                    activeOpacity={0.8}
                    onPress={() => retryShot(key)}
                  >
                    <Ionicons name="refresh" size={15} color="#FFFFFF" />
                    <Text style={styles.retakeButtonText}>Retry</Text>
                  </TouchableOpacity>
                )}

                {shot.status !== "uploading" && (
                  <TouchableOpacity
                    style={[
                      styles.retakeButton,
                      shot.status === "failed" && styles.retakeButtonLeft,
                      tileCapturing && { opacity: 0.6 },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => captureShot(key)}
                    disabled={isCapturing}
                  >
                    {tileCapturing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons
                        name="camera-reverse"
                        size={16}
                        color="#FFFFFF"
                      />
                    )}
                    <Text style={styles.retakeButtonText}>Retake</Text>
                  </TouchableOpacity>
                )}
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

  const submitDisabled =
    !allRequiredCaptured || submitting || uploadingCount > 0;

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
        {/* Exterior Photos */}
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

        {/* Car: Tyre & Toolkit (required) | Bike: optional */}
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

        {/* Damage Evidence (uploaded on step 1) */}
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
                  {damageImages.filter((i) => i.status === "uploaded").length}/
                  {damageImages.length} Uploaded
                </Text>
              </View>
            </View>

            {damageImages.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollList}
              >
                {damageImages.map((item, index) => (
                  <View key={item.id} style={styles.damageImageContainer}>
                    <Image
                      source={{ uri: item.url || item.localUri }}
                      style={styles.damageThumb}
                    />
                    {item.status === "uploading" && (
                      <View
                        style={[styles.uploadingOverlay, { borderRadius: 10 }]}
                      >
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      </View>
                    )}
                    {item.status === "failed" && (
                      <TouchableOpacity
                        style={[
                          styles.uploadingOverlay,
                          styles.failedOverlay,
                          { borderRadius: 10 },
                        ]}
                        onPress={() => uploadDamage(item.id, item.localUri)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="refresh" size={18} color="#FFFFFF" />
                        <Text style={styles.overlayText}>Retry</Text>
                      </TouchableOpacity>
                    )}
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
                  No damage images captured on step 1. Please go back to capture
                  evidence.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Additional Photos */}
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
              {additionalImages.map((item) => (
                <View key={item.id} style={styles.additionalImageWrap}>
                  <Image
                    source={{ uri: item.url || item.localUri }}
                    style={styles.additionalThumb}
                  />
                  {item.status === "uploading" && (
                    <View
                      style={[styles.uploadingOverlay, { borderRadius: 10 }]}
                    >
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    </View>
                  )}
                  {item.status === "failed" && (
                    <TouchableOpacity
                      style={[
                        styles.uploadingOverlay,
                        styles.failedOverlay,
                        { borderRadius: 10 },
                      ]}
                      onPress={() => uploadAdditional(item.id, item.localUri)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={18} color="#FFFFFF" />
                      <Text style={styles.overlayText}>Retry</Text>
                    </TouchableOpacity>
                  )}
                  {item.status !== "uploading" && (
                    <TouchableOpacity
                      style={styles.removeImageBadge}
                      activeOpacity={0.8}
                      onPress={() => removeAdditionalImage(item)}
                    >
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
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
        {(uploadingCount > 0 || failedCount > 0) && (
          <Text
            style={[styles.footerHint, failedCount > 0 && { color: "#DC2626" }]}
          >
            {uploadingCount > 0
              ? `Uploading ${uploadingCount} photo${uploadingCount > 1 ? "s" : ""}…`
              : `${failedCount} photo${failedCount > 1 ? "s" : ""} failed — tap Retry`}
          </Text>
        )}
        <TouchableOpacity
          style={[
            styles.primarySubmitBtn,
            submitDisabled && styles.disabledSubmitBtn,
          ]}
          activeOpacity={0.85}
          onPress={handleSubmit}
          disabled={submitDisabled}
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
  container: { flex: 1, backgroundColor: "#F1F5F9" },
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
  headerTitleContainer: { alignItems: "center" },
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
  scrollContent: { padding: 16, paddingBottom: 120 },
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
  damageCardBorder: { borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" },
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
  optionalPillText: { fontSize: 10.5, fontWeight: "700", color: "#64748B" },
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
  progressBadgeComplete: { backgroundColor: "#DCFCE7" },
  progressBadgeText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  progressBadgeTextComplete: { color: "#15803D" },
  shotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
  },
  shotCardWrapper: { width: "48%" },
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
  placeholderIconContainer: { position: "relative", marginBottom: 6 },
  cameraBadgeIcon: {
    position: "absolute",
    bottom: -2,
    right: -6,
    backgroundColor: "#2563EB",
    borderRadius: 8,
    padding: 2,
  },
  placeholderLabel: { fontSize: 13, fontWeight: "700", color: "#1E3A8A" },
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
  shotImage: { width: "100%", height: "100%", resizeMode: "cover" },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  failedOverlay: { backgroundColor: "rgba(220, 38, 38, 0.6)" },
  overlayText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
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
  failedBadge: { backgroundColor: "rgba(254, 242, 242, 0.97)" },
  completedBadgeText: { fontSize: 11, fontWeight: "700", color: "#15803D" },
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
  retakeButtonLeft: { right: undefined, left: 6 },
  retryButton: { backgroundColor: "#DC2626" },
  retakeButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
  damageBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  damageBadgeText: { color: "#991B1B", fontSize: 12, fontWeight: "700" },
  horizontalScrollList: { gap: 12, paddingVertical: 6 },
  damageImageContainer: { position: "relative" },
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
  damageIndexText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF5F5",
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  warningText: { fontSize: 12, color: "#991B1B", flex: 1 },
  additionalImageWrap: { position: "relative" },
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
  addMoreBtnText: { color: "#2563EB", fontWeight: "700", fontSize: 13 },
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
  footerHint: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
    textAlign: "center",
    marginBottom: 8,
  },
  primarySubmitBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
  },
  disabledSubmitBtn: { backgroundColor: "#94A3B8" },
  submitBtnContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  primarySubmitBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
