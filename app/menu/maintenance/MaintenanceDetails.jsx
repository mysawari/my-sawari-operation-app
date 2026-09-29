import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ImageView from "react-native-image-viewing";
import api from "../../../services/api";
const { width } = Dimensions.get("window");
// --- THEME CONSTANTS (matches list screen) ---
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

const PLACEHOLDER_VEHICLE_IMAGE =
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=400&q=80";

const STATUS_OPTIONS = [
  {
    value: "Scheduled",
    label: "Pending",
    icon: "clock-outline",
    color: COLORS.danger,
  },
  {
    value: "In Progress",
    label: "Ongoing",
    icon: "progress-wrench",
    color: COLORS.warning,
  },
  {
    value: "Completed",
    label: "Completed",
    icon: "check-circle-outline",
    color: COLORS.success,
  },
  {
    value: "Cancelled",
    label: "Cancelled",
    icon: "close-circle-outline",
    color: COLORS.textMuted,
  },
];

// --- FORMATTING HELPERS ---
const formatINR = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `₹${Number(n).toLocaleString("en-IN")}`;
};

const formatKm = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Number(n).toLocaleString("en-IN")} km`;
};

const formatDate = (dateLike) => {
  if (!dateLike) return "—";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Uploads a local image URI to the maintenance photo endpoint and returns
// the hosted Cloudinary URL. Matches the backend route:
//   POST /vehicles/upload-maintenance-image  (multer field name: "image")
const uploadImage = async (localUri) => {
  const filename = localUri.split("/").pop() || `photo-${Date.now()}.jpg`;
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : "image/jpeg";

  const formData = new FormData();
  formData.append("image", {
    uri: localUri,
    name: filename,
    type,
  });

  const response = await api.post(
    "/vehicles/upload-maintenance-image",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );

  if (!response.data?.success || !response.data?.url) {
    throw new Error(response.data?.message || "Upload failed");
  }

  return response.data.url;
};

// --- SUB-COMPONENTS ---

const Header = React.memo(({ title }) => (
  <View style={styles.headerContainer}>
    <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
    <TouchableOpacity
      style={styles.backButton}
      activeOpacity={0.7}
      onPress={() => router.back()}
    >
      <Ionicons name="chevron-back" size={22} color={COLORS.textDark} />
    </TouchableOpacity>
    <Text style={styles.headerTitle} numberOfLines={1}>
      {title}
    </Text>
    <View style={styles.headerRightSpacer} />
  </View>
));

const StatusBadge = ({ status }) => {
  const getStyle = () => {
    switch (status) {
      case "Completed":
        return { bg: COLORS.successLight, text: COLORS.success };
      case "In Progress":
        return { bg: COLORS.warningLight, text: COLORS.warning };
      case "Cancelled":
        return { bg: COLORS.dangerLight, text: COLORS.danger };
      default: // "Scheduled"
        return { bg: COLORS.dangerLight, text: COLORS.danger };
    }
  };

  const label =
    status === "Scheduled"
      ? "Pending"
      : status === "In Progress"
        ? "Ongoing"
        : status;

  const s = getStyle();

  return (
    <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: s.text }]} />
      <Text style={[styles.statusBadgeText, { color: s.text }]}>{label}</Text>
    </View>
  );
};

const InfoRow = ({ label, value, valueColor }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoRowLabel}>{label}</Text>
    <Text
      style={[styles.infoRowValue, valueColor && { color: valueColor }]}
      numberOfLines={2}
    >
      {value ?? "—"}
    </Text>
  </View>
);

const SectionCard = ({ title, children, icon }) => (
  <View style={styles.sectionCard}>
    <View style={styles.sectionHeader}>
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={16}
          color={COLORS.primary}
          style={{ marginRight: 6 }}
        />
      )}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

const StatusUpdateCard = ({ currentStatus, updating, onSelect }) => (
  <View style={styles.sectionCard}>
    <View style={styles.sectionHeader}>
      <MaterialCommunityIcons
        name="pencil-outline"
        size={16}
        color={COLORS.primary}
        style={{ marginRight: 6 }}
      />
      <Text style={styles.sectionTitle}>Update Status</Text>
    </View>
    <Text style={styles.statusHelperText}>
      Tap a status to update this maintenance record for the team.
    </Text>
    <View style={styles.statusOptionsGrid}>
      {STATUS_OPTIONS.map((opt) => {
        const isActive = opt.value === currentStatus;
        return (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.8}
            disabled={updating || isActive}
            onPress={() => onSelect(opt.value)}
            style={[
              styles.statusOption,
              isActive && {
                backgroundColor: COLORS.primaryLight,
                borderColor: COLORS.primary,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={opt.icon}
              size={18}
              color={isActive ? COLORS.primary : opt.color}
            />
            <Text
              style={[
                styles.statusOptionText,
                isActive && { color: COLORS.primary, fontWeight: "800" },
              ]}
            >
              {opt.label}
            </Text>
            {isActive && (
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={COLORS.primary}
                style={{ marginLeft: "auto" }}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
    {updating && (
      <View style={styles.statusUpdatingRow}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.statusUpdatingText}>Updating status…</Text>
      </View>
    )}
  </View>
);

// photo: { uri (local), url (remote, null until uploaded), uploading, error }
const PhotoPickerBox = ({ label, photo, onPick, onRemove, onRetry }) => (
  <View style={styles.photoPickerBox}>
    <Text style={styles.photoPickerLabel}>{label}</Text>
    {photo?.uri ? (
      <View style={styles.photoPickerPreviewWrap}>
        <Image source={{ uri: photo.uri }} style={styles.photoPickerPreview} />

        {photo.uploading ? (
          <View style={styles.photoPickerOverlay}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.photoPickerOverlayText}>Uploading...</Text>
          </View>
        ) : photo.error ? (
          <TouchableOpacity
            style={[styles.photoPickerOverlay, styles.photoPickerOverlayError]}
            activeOpacity={0.85}
            onPress={onRetry}
          >
            <Ionicons name="refresh" size={16} color="#FFFFFF" />
            <Text style={styles.photoPickerOverlayText}>Retry</Text>
          </TouchableOpacity>
        ) : photo.url ? (
          <View style={styles.photoPickerUploadedBadge}>
            <Ionicons
              name="checkmark-circle"
              size={12}
              color={COLORS.success}
            />
            <Text style={styles.photoPickerUploadedText}>Uploaded</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.photoPickerRemove} onPress={onRemove}>
          <Ionicons name="close" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    ) : (
      <TouchableOpacity
        style={styles.photoPickerEmpty}
        activeOpacity={0.7}
        onPress={onPick}
      >
        <Ionicons name="camera-outline" size={22} color={COLORS.textLight} />
        <Text style={styles.photoPickerEmptyText}>Add Photo</Text>
      </TouchableOpacity>
    )}
  </View>
);

const EMPTY_PHOTO = { uri: null, url: null, uploading: false, error: null };

const CompletionProofModal = ({ visible, submitting, onClose, onSubmit }) => {
  const [bill, setBill] = useState(EMPTY_PHOTO);
  const [card, setCard] = useState(EMPTY_PHOTO);
  const [note, setNote] = useState("");

  const resetForm = () => {
    setBill(EMPTY_PHOTO);
    setCard(EMPTY_PHOTO);
    setNote("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Uploads a picked/captured asset, tracking per-field state via the
  // setter (setBill / setCard).
  const uploadPicked = async (localUri, setter) => {
    setter({ uri: localUri, url: null, uploading: true, error: null });
    try {
      const url = await uploadImage(localUri);
      setter({ uri: localUri, url, uploading: false, error: null });
    } catch (err) {
      console.log("Photo upload error:", err);
      setter({
        uri: localUri,
        url: null,
        uploading: false,
        error: "Upload failed",
      });
    }
  };

  const captureFromCamera = async (setter) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission Needed",
        "Please allow camera access to take a photo.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    await uploadPicked(result.assets[0].uri, setter);
  };

  const pickFromGallery = async (setter) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission Needed",
        "Please allow photo library access to attach a photo.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    await uploadPicked(result.assets[0].uri, setter);
  };

  // Lets the user choose Camera or Gallery, then routes to the right
  // picker + upload flow for that field (bill or vehicle photo).
  const pickAndUpload = (setter) => {
    Alert.alert(
      "Add Photo",
      "Choose a source for this photo",
      [
        { text: "Take Photo", onPress: () => captureFromCamera(setter) },
        { text: "Choose from Gallery", onPress: () => pickFromGallery(setter) },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  };

  const retryUpload = async (photo, setter) => {
    if (!photo?.uri) return;
    setter({ ...photo, uploading: true, error: null });
    try {
      const url = await uploadImage(photo.uri);
      setter({ ...photo, url, uploading: false, error: null });
    } catch (err) {
      console.log("Photo retry upload error:", err);
      setter({ ...photo, uploading: false, error: "Upload failed" });
    }
  };

  const isUploadingAny = bill.uploading || card.uploading;
  const canSubmit = !!bill.url && !!card.url && !isUploadingAny && !submitting;

  const handleSubmit = async () => {
    if (!bill.url || !card.url) {
      Alert.alert(
        "Missing Photos",
        "Please attach both the bill photo and the vehicle photo, and wait for them to finish uploading, to mark this as completed.",
      );
      return;
    }
    await onSubmit({ billImage: bill.url, cardImage: card.url, note });
    resetForm();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Complete Maintenance</Text>
            <TouchableOpacity onPress={handleClose} disabled={submitting}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle}>
            Attach the bill and vehicle photos, plus any notes, to mark this job
            as completed.
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 420 }}
          >
            <View style={styles.photoPickerRow}>
              <PhotoPickerBox
                label="Bill Photo"
                photo={bill}
                onPick={() => pickAndUpload(setBill)}
                onRemove={() => setBill(EMPTY_PHOTO)}
                onRetry={() => retryUpload(bill, setBill)}
              />
              <PhotoPickerBox
                label="Vehicle Photo"
                photo={card}
                onPick={() => pickAndUpload(setCard)}
                onRemove={() => setCard(EMPTY_PHOTO)}
                onRetry={() => retryUpload(card, setCard)}
              />
            </View>

            <Text style={styles.modalFieldLabel}>Note (optional)</Text>
            <TextInput
              style={styles.modalNoteInput}
              placeholder="Any additional details about the completed job..."
              placeholderTextColor={COLORS.textLight}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={4}
            />
          </ScrollView>

          <TouchableOpacity
            style={[styles.modalSubmitButton, !canSubmit && { opacity: 0.5 }]}
            activeOpacity={0.85}
            disabled={!canSubmit}
            onPress={handleSubmit}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.modalSubmitText}>
                {isUploadingAny ? "Uploading Photos..." : "Mark as Completed"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const LoadingState = () => (
  <SafeAreaView style={styles.container}>
    <Header title="Maintenance Details" />
    <View style={styles.centerFill}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  </SafeAreaView>
);

const ErrorState = ({ onRetry }) => (
  <SafeAreaView style={styles.container}>
    <Header title="Maintenance Details" />
    <View style={styles.centerFill}>
      <MaterialCommunityIcons
        name="alert-circle-outline"
        size={48}
        color={COLORS.textLight}
      />
      <Text style={styles.errorTitle}>Couldn't Load Details</Text>
      <Text style={styles.errorSubtitle}>
        Something went wrong while fetching this maintenance record.
      </Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  </SafeAreaView>
);

// --- MAIN SCREEN ---
export default function MaintenanceDetails() {
  const { id } = useLocalSearchParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [completionModalVisible, setCompletionModalVisible] = useState(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      setError(false);
      const response = await api.get(`/vehicles/maintenance/${id}`);
      if (response.data.success) {
        setItem(response.data.data);
      } else {
        setError(true);
      }
    } catch (err) {
      console.log("Maintenance Details Error", err);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    fetchDetails();
  }, [fetchDetails]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDetails();
  }, [fetchDetails]);

  const handleCallGarage = () => {
    if (item?.garage?.contact) {
      Linking.openURL(`tel:${item.garage.contact}`);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!item || newStatus === item.status) return;

    // Completing requires proof photos + note — open the modal instead
    // of updating immediately.
    if (newStatus === "Completed") {
      setCompletionModalVisible(true);
      return;
    }

    setUpdatingStatus(true);
    try {
      const response = await api.patch(`/vehicles/maintenance/${id}/status`, {
        status: newStatus,
      });

      if (response.data.success) {
        setItem(response.data.data);
      } else {
        Alert.alert("Update Failed", "Could not update the status. Try again.");
      }
    } catch (err) {
      console.log("Update Status Error", err);
      Alert.alert(
        "Update Failed",
        err?.response?.data?.message ||
          "Something went wrong updating the status.",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Photos are already uploaded to Cloudinary by the time this fires
  // (the modal uploads on pick), so billImage/cardImage here are already
  // hosted URLs — this call just persists the status change.
  const handleCompleteSubmit = async ({ billImage, cardImage, note }) => {
    setUpdatingStatus(true);
    try {
      const response = await api.patch(`/vehicles/maintenance/${id}/status`, {
        status: "Completed",
        billImage,
        cardImage,
        note,
      });

      if (response.data.success) {
        setItem(response.data.data);
        setCompletionModalVisible(false);
      } else {
        Alert.alert("Update Failed", "Could not mark this as completed.");
      }
    } catch (err) {
      console.log("Complete Maintenance Error", err);
      Alert.alert(
        "Update Failed",
        err?.response?.data?.message ||
          "Something went wrong while completing this record.",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error || !item) return <ErrorState onRetry={fetchDetails} />;

  const isMajor = item.maintenanceType === "Major";
  const isCompleted = item.status === "Completed";
  const vehicleImage =
    item.vehicle?.images?.[0]?.url || PLACEHOLDER_VEHICLE_IMAGE;

  return (
    <SafeAreaView style={styles.container}>
      <Header title={item.title} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Vehicle Hero Card */}
        <View style={styles.heroCard}>
          <Image source={{ uri: vehicleImage }} style={styles.heroImage} />
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <Text style={styles.heroVehicleName} numberOfLines={1}>
              {item.vehicle?.vehicleName || "Unknown Vehicle"}
            </Text>
            <View style={styles.heroNumberBadge}>
              <Text style={styles.heroNumberText}>
                {item.vehicle?.vehicleNumber || "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* Title + Badges */}
        <View style={styles.titleSection}>
          <Text style={styles.maintenanceTitle}>{item.title}</Text>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor: isMajor
                    ? COLORS.dangerLight
                    : COLORS.primaryLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.typeBadgeText,
                  { color: isMajor ? COLORS.danger : COLORS.primary },
                ]}
              >
                {item.maintenanceType} Repair
              </Text>
            </View>
            <StatusBadge status={item.status} />
          </View>
        </View>

        {/* Status Update (Team Action) */}
        <StatusUpdateCard
          currentStatus={item.status}
          updating={updatingStatus}
          onSelect={handleStatusChange}
        />

        {/* Description */}
        {item.description && (
          <SectionCard title="Description" icon="text-box-outline">
            <Text style={styles.descriptionText}>{item.description}</Text>
          </SectionCard>
        )}

        {/* Cost Breakdown */}
        <SectionCard title="Cost Breakdown" icon="cash-multiple">
          <InfoRow
            label="Parts Cost"
            value={formatINR(item.costs?.partsCost)}
          />
          <InfoRow
            label="Labour Cost"
            value={formatINR(item.costs?.labourCost)}
          />
          <View style={styles.divider} />
          <InfoRow
            label={isCompleted ? "Final Cost" : "Estimated Total"}
            value={formatINR(item.costs?.totalCost)}
            valueColor={isCompleted ? COLORS.success : COLORS.textDark}
          />
        </SectionCard>

        {/* Vehicle & Schedule Info */}
        <SectionCard title="Vehicle & Schedule" icon="calendar-clock">
          <InfoRow label="Odometer Reading" value={formatKm(item.odometer)} />
          <InfoRow
            label={isCompleted ? "Completed Date" : "Expected Completion"}
            value={
              isCompleted
                ? formatDate(item.completedDate || item.updatedAt)
                : formatDate(item.expectedCompletionDate)
            }
          />
          <InfoRow label="Created On" value={formatDate(item.createdAt)} />
        </SectionCard>

        {/* Garage Info */}
        <SectionCard title="Garage Details" icon="garage">
          <InfoRow label="Garage Name" value={item.garage?.name} />
          {item.garage?.address ? (
            <InfoRow label="Address" value={item.garage.address} />
          ) : null}
          {item.garage?.gstin ? (
            <InfoRow label="GSTIN" value={item.garage.gstin} />
          ) : null}
          {item.garage?.contact ? (
            <TouchableOpacity
              style={styles.callButton}
              activeOpacity={0.8}
              onPress={handleCallGarage}
            >
              <Ionicons name="call-outline" size={16} color={COLORS.primary} />
              <Text style={styles.callButtonText}>{item.garage.contact}</Text>
            </TouchableOpacity>
          ) : null}
        </SectionCard>

        {/* Photos */}
        {item.images?.length > 0 && (
          <SectionCard
            title={`Photos (${item.images.length})`}
            icon="camera-outline"
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.photoRow}>
                {item.images.map((uri, index) => (
                  <TouchableOpacity
                    key={index}
                    activeOpacity={0.9}
                    onPress={() => {
                      setSelectedImage(index);
                      setViewerVisible(true);
                    }}
                  >
                    <Image source={{ uri }} style={styles.photoThumb} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </SectionCard>
        )}

        {/* Completion Proof (bill + vehicle photo shown once completed) */}
        {isCompleted &&
        (item.completionProof?.billImage || item.completionProof?.cardImage) ? (
          <SectionCard title="Completion Proof" icon="file-check-outline">
            <View style={styles.photoRow}>
              {item.completionProof?.billImage ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    setSelectedImage(0);
                    setViewerVisible(true);
                  }}
                >
                  <Image
                    source={{ uri: item.completionProof.billImage }}
                    style={styles.photoThumb}
                  />
                  <Text style={styles.proofLabel}>Bill</Text>
                </TouchableOpacity>
              ) : null}
              {item.completionProof?.cardImage ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    setSelectedImage(item.completionProof?.billImage ? 1 : 0);
                    setViewerVisible(true);
                  }}
                >
                  <Image
                    source={{ uri: item.completionProof.cardImage }}
                    style={styles.photoThumb}
                  />
                  <Text style={styles.proofLabel}>Vehicle</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {item.completionProof?.note ? (
              <Text style={[styles.descriptionText, { marginTop: 10 }]}>
                {item.completionProof.note}
              </Text>
            ) : null}
          </SectionCard>
        ) : null}

        {/* Additional Notes */}
        {item.additionalNotes ? (
          <SectionCard title="Additional Notes" icon="note-text-outline">
            <Text style={styles.descriptionText}>{item.additionalNotes}</Text>
          </SectionCard>
        ) : null}

        {/* Created By */}
        <SectionCard title="Logged By" icon="account-outline">
          <View style={styles.creatorRow}>
            <View style={styles.creatorAvatar}>
              <Feather name="user" size={16} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.creatorName}>
                {item.createdBy?.fullName || item.createdBy?.name || "Unknown"}
              </Text>
              {item.createdBy?.email ? (
                <Text style={styles.creatorEmail}>{item.createdBy.email}</Text>
              ) : null}
            </View>
          </View>
        </SectionCard>

        <View style={{ height: 30 }} />
      </ScrollView>

      <CompletionProofModal
        visible={completionModalVisible}
        submitting={updatingStatus}
        onClose={() => setCompletionModalVisible(false)}
        onSubmit={handleCompleteSubmit}
      />
      <ImageView
        images={(
          item.images ||
          [
            item.completionProof?.billImage,
            item.completionProof?.cardImage,
          ].filter(Boolean)
        ).map((uri) => ({ uri }))}
        imageIndex={selectedImage}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
      />
    </SafeAreaView>
  );
}

// --- STYLESHEET ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerFill: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },

  // Header
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingHorizontal: 12,
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
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textDark,
    textAlign: "center",
    marginHorizontal: 8,
  },
  headerRightSpacer: {
    width: 38,
  },

  // Scroll content
  scrollContent: {
    paddingBottom: 20,
  },

  // Hero
  heroCard: {
    height: 180,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 20,
    overflow: "hidden",
  },
  heroImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  heroOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "60%",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  heroContent: {
    position: "absolute",
    left: 16,
    bottom: 14,
    right: 16,
  },
  heroVehicleName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroNumberBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  heroNumberText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },

  // Title section
  titleSection: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  maintenanceTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textDark,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // Section Card
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  descriptionText: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
  },

  // Info Row
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 7,
  },
  infoRowLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
  infoRowValue: {
    fontSize: 13,
    color: COLORS.textDark,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 12,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },

  // Status Update
  statusHelperText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 12,
    marginTop: -6,
  },
  statusOptionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "47%",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  statusOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  statusUpdatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  statusUpdatingText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // Call button
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  callButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
  },

  // Photos
  photoRow: {
    flexDirection: "row",
    gap: 10,
  },
  photoThumb: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  proofLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: "center",
  },

  // Creator
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  creatorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  creatorName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  creatorEmail: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // Error state
  errorTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.textDark,
    marginTop: 14,
  },
  errorSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 18,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },

  // Completion Modal
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.textDark,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
  },

  // Photo pickers
  photoPickerRow: {
    flexDirection: "row",
    gap: 12,
  },
  photoPickerBox: {
    flex: 1,
  },
  photoPickerLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textDark,
    marginBottom: 8,
  },
  photoPickerEmpty: {
    height: 110,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  photoPickerEmptyText: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: "600",
  },
  photoPickerPreviewWrap: {
    height: 110,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  photoPickerPreview: {
    width: "100%",
    height: "100%",
  },
  photoPickerRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoPickerOverlay: {
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
  photoPickerOverlayError: {
    backgroundColor: "rgba(239, 68, 68, 0.78)",
  },
  photoPickerOverlayText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  photoPickerUploadedBadge: {
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
  photoPickerUploadedText: {
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.textDark,
  },

  // Modal note field
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textDark,
    marginTop: 18,
    marginBottom: 8,
  },
  modalNoteInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: COLORS.textDark,
    minHeight: 90,
    textAlignVertical: "top",
    backgroundColor: COLORS.background,
  },

  // Modal submit
  modalSubmitButton: {
    marginTop: 18,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubmitText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
});
