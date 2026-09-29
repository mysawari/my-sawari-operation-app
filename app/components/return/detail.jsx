import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import api from "../../../services/api";
import useAuthStore from "../../../store/authStore";

const COLORS = {
  background: "#F5F6FA",
  white: "#FFFFFF",
  primary: "#111827",
  secondary: "#6B7280",
  border: "#E5E7EB",
  teal: "#0E9384",
  tealSoft: "#E4F6F3",
  red: "#DC2626",
  redSoft: "#FEE2E2",
  amber: "#F59E0B",
  amberSoft: "#FEF3C7",
  green: "#16A34A",
  greenSoft: "#DCFCE7",
  orange: "#C2410C",
  orangeSoft: "#FFEDD5",
};

const SCREEN_WIDTH = Dimensions.get("window").width;

const currency = (amount = 0) =>
  `₹${Number(amount || 0).toLocaleString("en-IN")}`;

const formatDate = (date) => {
  if (!date) return "--";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatTime = (date) => {
  if (!date) return "--";
  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
const InfoRow = ({ label, value, valueStyle }) => (
  <View style={styles.infoRow}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, valueStyle]} numberOfLines={2}>
      {value ?? "--"}
    </Text>
  </View>
);

const SectionCard = ({ icon, iconColor = COLORS.teal, title, children }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <Ionicons name={icon} size={22} color={iconColor} />
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

// `images` accepts either a plain array of URIs, or an array of
// { label, uri } objects — labels render as a small caption under
// each thumbnail (e.g. "Front", "Rear", "Left Side").
const ImageGallery = ({ images, onPress }) => {
  const items = (images || [])
    .map((img) => (typeof img === "string" ? { uri: img, label: null } : img))
    .filter((img) => !!img.uri);

  if (!items.length) {
    return <Text style={styles.emptyText}>No images available.</Text>;
  }

  return (
    <View style={styles.gallery}>
      {items.map((img, index) => (
        <TouchableOpacity
          key={img.uri + index}
          onPress={() => onPress(img.uri, img.label)}
          activeOpacity={0.85}
          style={styles.galleryItem}
        >
          <Image source={{ uri: img.uri }} style={styles.galleryImage} />
          {img.label ? (
            <Text style={styles.galleryLabel} numberOfLines={1}>
              {img.label}
            </Text>
          ) : null}
        </TouchableOpacity>
      ))}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Zoomable image viewer — pinch to zoom, drag while zoomed, double-tap
// to reset. Built on PanResponder so it works reliably on both iOS and
// Android without extra native dependencies.
// ---------------------------------------------------------------------------
const MIN_SCALE = 1;
const MAX_SCALE = 4;

const ZoomableImage = ({ uri }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const lastScale = useRef(1);
  const lastDistance = useRef(0);
  const lastTranslate = useRef({ x: 0, y: 0 });
  const lastTapAt = useRef(0);

  const getDistance = (touches) => {
    const [a, b] = touches;
    const dx = a.pageX - b.pageX;
    const dy = a.pageY - b.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const resetZoom = () => {
    lastScale.current = MIN_SCALE;
    lastTranslate.current = { x: 0, y: 0 };
    Animated.parallel([
      Animated.spring(scale, { toValue: MIN_SCALE, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
  };

  const zoomInAtCenter = () => {
    lastScale.current = MAX_SCALE / 2;
    Animated.spring(scale, {
      toValue: lastScale.current,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) =>
        evt.nativeEvent.touches.length === 2 ||
        Math.abs(gestureState.dx) > 3 ||
        Math.abs(gestureState.dy) > 3,

      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          lastDistance.current = getDistance(evt.nativeEvent.touches);
        }
      },

      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length === 2) {
          const distance = getDistance(touches);
          if (lastDistance.current > 0) {
            const nextScale = Math.min(
              Math.max(
                lastScale.current * (distance / lastDistance.current),
                MIN_SCALE,
              ),
              MAX_SCALE,
            );
            scale.setValue(nextScale);
          }
        } else if (touches.length === 1 && lastScale.current > MIN_SCALE) {
          translateX.setValue(lastTranslate.current.x + gestureState.dx);
          translateY.setValue(lastTranslate.current.y + gestureState.dy);
        }
      },

      onPanResponderRelease: (evt, gestureState) => {
        scale.stopAnimation((currentScale) => {
          lastScale.current = currentScale;
          if (currentScale <= MIN_SCALE) {
            resetZoom();
          }
        });

        if (lastScale.current > MIN_SCALE) {
          lastTranslate.current = {
            x: lastTranslate.current.x + gestureState.dx,
            y: lastTranslate.current.y + gestureState.dy,
          };
        }
        lastDistance.current = 0;

        // Double-tap detection — only fires for a clean, small tap
        const wasTap =
          Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5;
        if (wasTap) {
          const now = Date.now();
          if (now - lastTapAt.current < 280) {
            lastScale.current > MIN_SCALE ? resetZoom() : zoomInAtCenter();
            lastTapAt.current = 0;
          } else {
            lastTapAt.current = now;
          }
        }
      },
    }),
  ).current;

  return (
    <View style={styles.zoomWrapper} {...panResponder.panHandlers}>
      <Animated.Image
        source={{ uri }}
        resizeMode="contain"
        style={[
          styles.zoomImage,
          {
            transform: [{ translateX }, { translateY }, { scale }],
          },
        ]}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// Bill Summary Card — Zomato-style itemized receipt
// (driven entirely by handover.payment.billSummary)
// ---------------------------------------------------------------------------
const BillLineRow = ({ label, value, bold, big, color, sub }) => (
  <View style={billStyles.row}>
    <View style={{ flex: 1 }}>
      <Text
        style={[
          billStyles.label,
          bold && billStyles.labelBold,
          big && billStyles.labelBig,
        ]}
      >
        {label}
      </Text>
      {sub ? <Text style={billStyles.subLabel}>{sub}</Text> : null}
    </View>
    <Text
      style={[
        billStyles.value,
        bold && billStyles.valueBold,
        big && billStyles.valueBig,
        color && { color },
      ]}
    >
      {value}
    </Text>
  </View>
);

const StatusBadge = ({ status }) => {
  const map = {
    paid: { bg: COLORS.greenSoft, text: COLORS.green, label: "PAID" },
    partial: {
      bg: COLORS.amberSoft,
      text: COLORS.amber,
      label: "PARTIALLY PAID",
    },
    pending: { bg: COLORS.redSoft, text: COLORS.red, label: "PENDING" },
  };
  const s = map[status] || map.pending;
  return (
    <View style={[billStyles.badge, { backgroundColor: s.bg }]}>
      <Text style={[billStyles.badgeText, { color: s.text }]}>{s.label}</Text>
    </View>
  );
};

const BillSummaryCard = ({ billSummary }) => {
  const [expanded, setExpanded] = useState(true);

  if (!billSummary) return null;

  const {
    totalFare = 0,
    fastTagPayable = 0,
    pickupCharge = 0,
    dropCharge = 0,
    securityDeposit = 0,
    extraCharges = 0,
    discountAmount = 0,
    totalAmount = 0,
    bookingAmountPaid = 0,
    amountReceivedNow = 0,
    totalCollected = 0,
    balanceAmount = 0,
  } = billSummary;

  // Subtotal — sum of the raw charge line items, before any
  // discount is applied. Not shown as a bold "total" so it can't
  // be confused with the one real total below it.
  const subtotal =
    totalFare + pickupCharge + dropCharge + fastTagPayable + extraCharges;

  // This is the ONLY number we call a "total" on screen — everything
  // else either builds up to it (items) or subtracts from it (payments).
  const billAmount = totalAmount || subtotal - discountAmount;

  const paidNow = totalCollected || amountReceivedNow;
  const totalPaid = bookingAmountPaid + paidNow;

  const paymentStatus =
    balanceAmount <= 0 ? "paid" : totalPaid > 0 ? "partial" : "pending";

  return (
    <View style={billStyles.card}>
      {/* Header */}
      <TouchableOpacity
        style={billStyles.headerRow}
        activeOpacity={0.7}
        onPress={() => setExpanded((prev) => !prev)}
      >
        <View>
          <Text style={billStyles.headerTitle}>Bill Details</Text>
          <StatusBadge status={paymentStatus} />
        </View>
        <View style={billStyles.headerRight}>
          <Text style={billStyles.headerAmount}>{currency(billAmount)}</Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={COLORS.secondary}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <>
          {/* ---- Charges (builds UP to the bill amount) ---- */}
          <View style={billStyles.sectionLabel}>
            <Text style={billStyles.sectionLabelText}>CHARGES</Text>
          </View>

          <BillLineRow label="Vehicle Rent" value={currency(totalFare)} />
          {pickupCharge > 0 && (
            <BillLineRow label="Pickup Charge" value={currency(pickupCharge)} />
          )}
          {dropCharge > 0 && (
            <BillLineRow label="Drop Charge" value={currency(dropCharge)} />
          )}
          {fastTagPayable > 0 && (
            <BillLineRow
              label="FASTag Amount"
              value={currency(fastTagPayable)}
            />
          )}
          {extraCharges > 0 && (
            <BillLineRow
              label="Extra Charges"
              value={currency(extraCharges)}
              sub="Damage, late fee, cleaning etc."
            />
          )}
          {discountAmount > 0 && (
            <BillLineRow
              label="Discount"
              value={`- ${currency(discountAmount)}`}
              color={COLORS.green}
            />
          )}

          <View style={billStyles.solidDivider} />

          {/* The one number that matters most — what the customer owes in total */}
          <BillLineRow
            label="Bill Amount"
            value={currency(billAmount)}
            bold
            big
            color={COLORS.primary}
          />

          {securityDeposit > 0 && (
            <View style={billStyles.noteBox}>
              <Ionicons
                name="information-circle"
                size={14}
                color={COLORS.secondary}
              />
              <Text style={billStyles.noteText}>
                {currency(securityDeposit)} security deposit collected
                separately — refundable, not included above.
              </Text>
            </View>
          )}

          {/* ---- Payments (subtracts DOWN from the bill amount) ---- */}
          <View style={billStyles.paymentBox}>
            <View style={billStyles.sectionLabel}>
              <Text style={billStyles.sectionLabelText}>AMOUNT PAID</Text>
            </View>

            <BillLineRow label="Bill Amount" value={currency(billAmount)} />

            {bookingAmountPaid > 0 && (
              <BillLineRow
                label="Advance Paid Earlier"
                value={`- ${currency(bookingAmountPaid)}`}
                color={COLORS.green}
              />
            )}
            {paidNow > 0 && (
              <BillLineRow
                label="Total amount paid"
                value={`- ${currency(paidNow)}`}
                color={COLORS.green}
              />
            )}

            <View style={billStyles.dashedDivider} />

            <BillLineRow
              label={balanceAmount > 0 ? "Balance Due" : "Fully Settled"}
              value={currency(balanceAmount)}
              bold
              big
              color={balanceAmount > 0 ? COLORS.red : COLORS.green}
            />
          </View>
        </>
      )}

      <TouchableOpacity
        style={billStyles.toggleLink}
        activeOpacity={0.7}
        onPress={() => setExpanded((prev) => !prev)}
      >
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={COLORS.teal}
        />
        <Text style={billStyles.toggleLinkText}>
          {expanded ? "Hide bill details" : "View bill details"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export default function VehicleReturnDetailsScreen() {
  const router = useRouter();
  const { handoverId } = useLocalSearchParams();
  const { token } = useAuthStore();

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [previewLabel, setPreviewLabel] = useState("");

  const openPreview = (image, label) => {
    setPreviewImage(image);
    setPreviewLabel(label || "");
    setPreviewVisible(true);
  };

  const closePreview = () => {
    setPreviewVisible(false);
    setPreviewImage("");
    setPreviewLabel("");
  };

  const fetchDetails = useCallback(
    async (refresh = false) => {
      try {
        refresh ? setRefreshing(true) : setLoading(true);

        const storageToken = await AsyncStorage.getItem("token");
        const authToken = token || storageToken;

        const res = await api.get(`/vehicle-return/details/${handoverId}`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (res.data?.success) {
          setDetails(res.data.data);
        } else {
          Alert.alert("Error", res.data?.message || "Failed to load details.");
        }
      } catch (err) {
        Alert.alert(
          "Error",
          err?.response?.data?.message || "Unable to fetch details.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handoverId, token],
  );

  useEffect(() => {
    if (handoverId) fetchDetails();
  }, [handoverId, fetchDetails]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </SafeAreaView>
    );
  }

  if (!details) {
    return (
      <SafeAreaView style={styles.loader}>
        <Ionicons
          name="alert-circle-outline"
          size={36}
          color={COLORS.secondary}
        />
        <Text style={styles.emptyText}>No details found.</Text>
      </SafeAreaView>
    );
  }

  // The API response is a VehicleReturn document with a populated
  // `handover` sub-document (see getReturnDetails). We normalize the
  // shapes here so the rest of the screen can keep using
  // `details.*` / `vehicle.*` / `handover.*` as before.
  const vehicle = details.vehicle || {};
  const handover = details.handover || {};
  const customer = handover.customer || {};
  const billSummary = handover.payment?.billSummary || null;
  const settlement = details.settlementDetails || {};
  const damage = details.damageCostDetails || {};

  // Photos captured AT RETURN TIME live at the top level of the
  // VehicleReturn doc as `images: { vehicleFront, vehicleRear, ... }`
  // — a keyed object, not an array. This is different from
  // `vehicle.images`, which is the Vehicle's own catalog/stock photos.
  const RETURN_IMAGE_LABELS = {
    vehicleFront: "Front",
    vehicleRear: "Rear",
    vehicleLeft: "Left Side",
    vehicleRight: "Right Side",
    tyreFrontLeft: "Front Left Tyre",
    tyreFrontRight: "Front Right Tyre",
    tyreRearLeft: "Rear Left Tyre",
    tyreRearRight: "Rear Right Tyre",
    spareTyre: "Spare Tyre",
    toolkit: "Toolkit",
    customerPhoto: "Customer",
    customerProfileImage: "Customer Profile",
    customerWithVehicle: "Customer With Vehicle",
    idCardFront: "ID Card (Front)",
    idCardBack: "ID Card (Back)",
  };

  const returnImages = details.images || {};
  const returnImageList = Object.entries(returnImages)
    .filter(([, uri]) => !!uri)
    .map(([key, uri]) => ({
      uri,
      label: RETURN_IMAGE_LABELS[key] || key,
    }));

  const vehicleCatalogImages = Array.isArray(vehicle.images)
    ? vehicle.images
    : [];

  // Damage photos are top-level `damageImages`, not nested inside
  // `damageCostDetails`.
  // Damage photos
  const damageImageList = Array.isArray(details.damageImages)
    ? details.damageImages
    : [];

  // Additional photos captured during vehicle return
  const additionalImageList = Array.isArray(details.additionalImages)
    ? details.additionalImages
    : [];

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>

        <Text style={styles.title}>Vehicle Return Details</Text>

        <TouchableOpacity onPress={() => fetchDetails(true)} hitSlop={10}>
          <Ionicons name="refresh" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Everything below lives INSIDE the ScrollView so the whole
          screen scrolls together instead of being clipped to one
          screen height. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchDetails(true)}
          />
        }
      >
        {/* Vehicle Information */}
        <SectionCard icon="car-sport" title="Vehicle Information">
          <InfoRow label="Vehicle" value={vehicle.vehicleName} />
          <InfoRow label="Manufacturer" value={vehicle.manufacturer} />
          <InfoRow label="Model" value={vehicle.model} />
          <InfoRow label="Variant" value={vehicle.variant} />
          <InfoRow label="Vehicle No." value={vehicle.vehicleNumber} />
          <InfoRow label="Color" value={vehicle.color} />
        </SectionCard>

        {/* Customer Information */}
        <SectionCard icon="person-circle" title="Customer Information">
          <InfoRow
            label="Name"
            value={details.customerName || customer.fullName}
          />
          <InfoRow
            label="Mobile Number"
            value={details.mobileNumber || customer.mobileNumber}
          />
        </SectionCard>

        {/* Return Information */}
        <SectionCard icon="key" title="Return Information">
          <InfoRow
            label="Fuel Level"
            value={details.fuelLevel != null ? `${details.fuelLevel}%` : "--"}
          />
          <InfoRow
            label="Kilometers at Return"
            value={
              details.kilometersAtReturn != null
                ? `${details.kilometersAtReturn} km`
                : "--"
            }
          />
          <InfoRow
            label="Scheduled Return"
            value={`${formatDate(details.scheduledReturnTime)} • ${formatTime(
              details.scheduledReturnTime,
            )}`}
          />
          <InfoRow
            label="Actual Return"
            value={`${formatDate(details.receivingTime)} • ${formatTime(
              details.receivingTime,
            )}`}
          />
          {details.delayText ? (
            <InfoRow
              label="Time Status"
              value={details.delayText}
              valueStyle={{ color: COLORS.amber }}
            />
          ) : null}
          <InfoRow label="Received By" value={details.receivedBy?.fullName} />
        </SectionCard>

        {/* Bill Summary (from handover.payment.billSummary) */}
        <BillSummaryCard billSummary={billSummary} />

        {/* Settlement Details */}
        <SectionCard icon="wallet" title="Settlement Details">
          <InfoRow
            label="Status"
            value={(settlement.status || "pending").toUpperCase()}
            valueStyle={{
              color:
                settlement.status === "completed" ? COLORS.green : COLORS.red,
            }}
          />
          <InfoRow
            label="Total Balance"
            value={currency(settlement.totalBalanceAmount)}
          />
          <InfoRow
            label="Amount Collected"
            value={currency(settlement.amountCollected)}
            valueStyle={{ color: COLORS.green }}
          />
          <InfoRow
            label="Pending Amount"
            value={currency(settlement.pendingAmount)}
            valueStyle={{
              color: settlement.pendingAmount > 0 ? COLORS.red : COLORS.green,
            }}
          />
          <InfoRow
            label="Final Balance"
            value={currency(settlement.finalBalance)}
            valueStyle={{
              fontSize: 18,
              fontWeight: "700",
              color: settlement.finalBalance > 0 ? COLORS.red : COLORS.green,
            }}
          />
          {settlement.paymentMode ? (
            <InfoRow label="Payment Mode" value={settlement.paymentMode} />
          ) : null}
        </SectionCard>

        {/* Damage Details */}
        {details.hasDamage ? (
          <SectionCard
            icon="warning"
            iconColor={COLORS.red}
            title="Damage Details"
          >
            <InfoRow
              label="Status"
              value={(damage.status || "reported").toUpperCase()}
              valueStyle={{ color: COLORS.red }}
            />
            <InfoRow
              label="Repair Estimate"
              value={currency(damage.repairEstimate)}
              valueStyle={{ color: COLORS.red }}
            />
            {damage.description ? (
              <InfoRow label="Description" value={damage.description} />
            ) : null}
          </SectionCard>
        ) : null}

        {/* Return Condition Photos — captured at handover time */}
        <SectionCard icon="images" title="Return Condition Photos">
          <ImageGallery images={returnImageList} onPress={openPreview} />
        </SectionCard>

        {/* Vehicle Catalog Photos — the vehicle's own listing photos */}
        {vehicleCatalogImages.length > 0 && (
          <SectionCard icon="car" title="Vehicle Catalog Photos">
            <ImageGallery images={vehicleCatalogImages} onPress={openPreview} />
          </SectionCard>
        )}
        {/* Additional Images */}
        {additionalImageList.length > 0 && (
          <SectionCard
            icon="images-outline"
            iconColor={COLORS.teal}
            title="Additional Images"
          >
            <ImageGallery images={additionalImageList} onPress={openPreview} />
          </SectionCard>
        )}

        {/* Damage Images */}
        {damageImageList.length > 0 && (
          <SectionCard
            icon="camera"
            iconColor={COLORS.red}
            title="Damage Images"
          >
            <ImageGallery images={damageImageList} onPress={openPreview} />
          </SectionCard>
        )}

        {/* Timeline */}
        <SectionCard icon="time" title="Timeline">
          <View style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Booking Created</Text>
              <Text style={styles.timelineSub}>
                {formatDate(handover.createdAt)} •{" "}
                {formatTime(handover.createdAt)}
              </Text>
            </View>
          </View>

          <View style={styles.timelineLine} />

          <View style={styles.timelineItem}>
            <View
              style={[styles.timelineDot, { backgroundColor: COLORS.amber }]}
            />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Scheduled Return</Text>
              <Text style={styles.timelineSub}>
                {formatDate(details.scheduledReturnTime)} •{" "}
                {formatTime(details.scheduledReturnTime)}
              </Text>
            </View>
          </View>

          <View style={styles.timelineLine} />

          <View style={styles.timelineItem}>
            <View
              style={[styles.timelineDot, { backgroundColor: COLORS.green }]}
            />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Vehicle Received</Text>
              <Text style={styles.timelineSub}>
                {formatDate(details.receivingTime)} •{" "}
                {formatTime(details.receivingTime)}
              </Text>
            </View>
          </View>
        </SectionCard>
      </ScrollView>

      {/* Fullscreen image preview modal — lives at the root of the
          screen (outside the ScrollView) so it overlays everything. */}
      <Modal visible={previewVisible} transparent animationType="fade">
        <View style={styles.previewContainer}>
          <View style={styles.previewHeader}>
            {previewLabel ? (
              <Text style={styles.previewLabel}>{previewLabel}</Text>
            ) : (
              <View />
            )}
            <TouchableOpacity onPress={closePreview} hitSlop={10}>
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
          </View>

          {previewVisible && previewImage ? (
            <ZoomableImage uri={previewImage} />
          ) : null}

          <Text style={styles.previewHint}>
            Pinch to zoom • Drag to pan • Double-tap to reset
          </Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primary,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primary,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 6,
    gap: 12,
  },
  label: {
    fontSize: 13,
    color: COLORS.secondary,
    flexShrink: 0,
  },
  value: {
    fontSize: 13.5,
    fontWeight: "600",
    color: COLORS.primary,
    textAlign: "right",
    flexShrink: 1,
  },

  gallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 12,
  },
  galleryItem: {
    alignItems: "center",
  },
  galleryImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: COLORS.border,
  },
  galleryLabel: {
    marginTop: 4,
    fontSize: 11.5,
    fontWeight: "600",
    color: COLORS.secondary,
    maxWidth: 100,
    textAlign: "center",
  },

  emptyText: {
    color: COLORS.secondary,
    textAlign: "center",
    paddingVertical: 20,
  },

  previewContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
  },
  previewHeader: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  previewHint: {
    position: "absolute",
    bottom: 36,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  zoomWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  zoomImage: {
    width: SCREEN_WIDTH,
    height: "90%",
  },

  timelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.teal,
    marginTop: 3,
  },
  timelineLine: {
    width: 2,
    height: 20,
    backgroundColor: COLORS.border,
    marginLeft: 5,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: COLORS.primary,
  },
  timelineSub: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 2,
  },
});

// ---------------------------------------------------------------------------
// Bill Summary styles — Zomato-style receipt layout
// ---------------------------------------------------------------------------
const billStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 6,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerAmount: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.primary,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  sectionLabel: {
    marginTop: 10,
    marginBottom: 4,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.secondary,
    letterSpacing: 0.6,
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderBottomColor: COLORS.border,
    marginVertical: 6,
  },
  solidDivider: {
    height: 1.5,
    backgroundColor: COLORS.primary,
    opacity: 0.08,
    marginVertical: 8,
  },
  paymentBox: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 10,
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: COLORS.tealSoft,
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 11.5,
    color: COLORS.secondary,
    lineHeight: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
    gap: 10,
  },
  label: {
    fontSize: 14.5,
    color: COLORS.secondary,
  },
  labelBold: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  labelBig: {
    fontSize: 15.5,
  },
  subLabel: {
    fontSize: 11.5,
    color: COLORS.secondary,
    opacity: 0.7,
    marginTop: 1,
  },
  value: {
    fontSize: 14.5,
    fontWeight: "600",
    color: COLORS.primary,
  },
  valueBold: {
    fontSize: 16,
    fontWeight: "700",
  },
  valueBig: {
    fontSize: 19,
    fontWeight: "800",
  },
  toggleLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 10,
    paddingBottom: 4,
  },
  toggleLinkText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.teal,
  },
});
