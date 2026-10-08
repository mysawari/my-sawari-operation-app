import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../../../services/api";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get("window");

const formatINR = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

// ─── Image helpers ────────────────────────────────────────────────
// Cloudinary on-the-fly transforms: small thumbnails for the grid,
// a resized (not original) image for the lightbox.
// Non-Cloudinary URLs are returned unchanged.
const THUMB_TRANSFORM = "w_400,h_300,c_fill,q_auto,f_auto";
const FULL_TRANSFORM = "w_1600,q_auto,f_auto";

const withTransform = (uri, transform) => {
  if (!uri || typeof uri !== "string") return uri;
  if (!uri.includes("res.cloudinary.com") || !uri.includes("/upload/"))
    return uri;
  return uri.replace("/upload/", `/upload/${transform}/`);
};
const thumbUrl = (uri) => withTransform(uri, THUMB_TRANSFORM);
const fullUrl = (uri) => withTransform(uri, FULL_TRANSFORM);

// Lets thumbnails open the lightbox without being defined inside the screen
// (defining components inside a component remounts them on every render).
const ImagePressContext = createContext(() => {});

const ImageThumbnail = memo(function ImageThumbnail({ label, uri }) {
  const onPress = useContext(ImagePressContext);
  if (!uri) return null;
  return (
    <TouchableOpacity
      style={styles.imageCard}
      onPress={() => onPress(uri, label)}
      activeOpacity={0.85}
    >
      <Image
        source={{ uri: thumbUrl(uri) }}
        style={styles.thumbnail}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={150}
      />
      <View style={styles.imageOverlay}>
        <Text style={styles.imageLabel} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="expand-outline" size={14} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
});

// Small header used between photo sub-groups (ID / DL / Customer / Vehicle / Damage)
const PhotoGroupHeader = memo(function PhotoGroupHeader({ icon, title }) {
  return (
    <View style={styles.photoGroupHeader}>
      <Ionicons name={icon} size={14} color="#64748B" />
      <Text style={styles.photoGroupTitle}>{title}</Text>
    </View>
  );
});

// Exchange photos only start loading when the user asks for them
const ExchangePhotos = ({ images }) => {
  const [open, setOpen] = useState(false);
  const count = [
    images.vehicleFront,
    images.vehicleRear,
    images.vehicleLeft,
    images.vehicleRight,
    images.additional,
  ].filter(Boolean).length;

  return (
    <>
      <TouchableOpacity
        style={styles.photoToggle}
        onPress={() => setOpen((p) => !p)}
        activeOpacity={0.7}
      >
        <Ionicons name="camera-outline" size={14} color="#2563EB" />
        <Text style={styles.photoToggleText}>
          {open ? "Hide" : "Show"} exchange photos ({count})
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={14}
          color="#2563EB"
        />
      </TouchableOpacity>

      {open && (
        <View style={styles.imageGrid}>
          <ImageThumbnail label="Front" uri={images.vehicleFront} />
          <ImageThumbnail label="Rear" uri={images.vehicleRear} />
          <ImageThumbnail label="Left" uri={images.vehicleLeft} />
          <ImageThumbnail label="Right" uri={images.vehicleRight} />
          <ImageThumbnail label="Additional" uri={images.additional} />
        </View>
      )}
    </>
  );
};

const StatusBadge = ({ status }) => {
  const isReturned = status?.toLowerCase() === "returned";
  return (
    <View
      style={[
        styles.statusBadge,
        { backgroundColor: isReturned ? "#DCFCE7" : "#DBEAFE" },
      ]}
    >
      <View
        style={[
          styles.statusDot,
          { backgroundColor: isReturned ? "#16A34A" : "#2563EB" },
        ]}
      />
      <Text
        style={[
          styles.statusText,
          { color: isReturned ? "#15803D" : "#1E40AF" },
        ]}
      >
        {status ? status.toUpperCase() : "PENDING"}
      </Text>
    </View>
  );
};

const Row = ({ icon, label, value, color = "#0F172A", isLast = false }) => (
  <View style={[styles.row, isLast && styles.rowLast]}>
    <View style={styles.rowLeft}>
      {icon && (
        <View style={styles.iconContainer}>
          <Ionicons name={icon} size={16} color="#3B82F6" />
        </View>
      )}
      <Text style={styles.label}>{label}</Text>
    </View>
    <Text style={[styles.value, { color }]} numberOfLines={2}>
      {value || "-"}
    </Text>
  </View>
);

const Section = ({ title, icon, children }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      {icon && (
        <Ionicons
          name={icon}
          size={20}
          color="#1E293B"
          style={styles.cardHeaderIcon}
        />
      )}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.cardBody}>{children}</View>
  </View>
);

/* ─────────────────────────────────────────────────────────────────────
   ZOOMABLE IMAGE
   Self-contained pinch-to-zoom + pan + double-tap, no external gesture
   library required. Two-finger pinch drives scale, single-finger drag
   pans while zoomed in, and a double-tap toggles between 1x and 2.5x.
   Resets automatically whenever a new image is opened.
   Shows the already-cached thumbnail instantly (previewUri) while the
   larger image loads on top of it.
───────────────────────────────────────────────────────────────────── */
const AnimatedImage = Animated.createAnimatedComponent(Image);

const ZoomableImage = ({ uri, previewUri, resetKey }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const lastScale = useRef(1);
  const lastTranslate = useRef({ x: 0, y: 0 });
  const lastDistance = useRef(null);
  const lastTapTime = useRef(0);
  const gestureStart = useRef({ x: 0, y: 0 });

  // Reset zoom/pan whenever a different image is shown
  useEffect(() => {
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    lastScale.current = 1;
    lastTranslate.current = { x: 0, y: 0 };
    lastDistance.current = null;
  }, [resetKey]);

  const getDistance = (touches) => {
    const [a, b] = touches;
    const dx = a.pageX - b.pageX;
    const dy = a.pageY - b.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const clampScale = (value) => Math.max(1, Math.min(value, 5));

  const animateTo = (toScale, toX, toY) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: toScale,
        useNativeDriver: true,
        friction: 7,
      }),
      Animated.spring(translateX, {
        toValue: toX,
        useNativeDriver: true,
        friction: 7,
      }),
      Animated.spring(translateY, {
        toValue: toY,
        useNativeDriver: true,
        friction: 7,
      }),
    ]).start();
    lastScale.current = toScale;
    lastTranslate.current = { x: toX, y: toY };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          lastDistance.current = getDistance(touches);
        } else {
          gestureStart.current = {
            x: lastTranslate.current.x,
            y: lastTranslate.current.y,
          };

          // Double-tap detection
          const now = Date.now();
          if (now - lastTapTime.current < 280) {
            if (lastScale.current > 1) {
              animateTo(1, 0, 0);
            } else {
              animateTo(2.5, 0, 0);
            }
          }
          lastTapTime.current = now;
        }
      },

      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length === 2) {
          // Pinch
          const distance = getDistance(touches);
          if (lastDistance.current) {
            const factor = distance / lastDistance.current;
            const newScale = clampScale(lastScale.current * factor);
            scale.setValue(newScale);
          }
        } else if (touches.length === 1 && lastScale.current > 1) {
          // Pan (only meaningful while zoomed in)
          translateX.setValue(gestureStart.current.x + gestureState.dx);
          translateY.setValue(gestureStart.current.y + gestureState.dy);
        }
      },

      onPanResponderRelease: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length < 2) {
          lastDistance.current = null;
        }

        // Commit whatever scale we ended up at (clamped)
        scale.stopAnimation((currentScale) => {
          const clamped = clampScale(currentScale);
          lastScale.current = clamped;

          if (clamped <= 1) {
            animateTo(1, 0, 0);
          } else {
            const finalX = gestureStart.current.x + gestureState.dx;
            const finalY = gestureStart.current.y + gestureState.dy;
            lastTranslate.current = { x: finalX, y: finalY };
            Animated.spring(scale, {
              toValue: clamped,
              useNativeDriver: true,
            }).start();
          }
        });
      },
    }),
  ).current;

  return (
    <View style={styles.zoomableContainer} {...panResponder.panHandlers}>
      <AnimatedImage
        source={{ uri }}
        placeholder={previewUri ? { uri: previewUri } : undefined}
        placeholderContentFit="contain"
        style={[
          styles.fullScreenImage,
          {
            transform: [{ translateX }, { translateY }, { scale }],
          },
        ]}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={150}
      />
    </View>
  );
};

export default function HandoverDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [handover, setHandover] = useState(null);
  const [loading, setLoading] = useState(true);

  // States for full-screen image modal
  const [activeImage, setActiveImage] = useState(null);
  const [activeImageLabel, setActiveImageLabel] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  // Collapsible bill summary state
  const [billExpanded, setBillExpanded] = useState(true);

  // Collapsible vehicle exchange history state — same open/close pattern
  // as the bill summary card.
  const [exchangeHistoryExpanded, setExchangeHistoryExpanded] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/handover/${id}`);
        if (response.data.success) {
          setHandover(response.data.data);
        }
      } catch (error) {
        console.log(
          "Handover Details Error:",
          error?.response?.data?.message || error?.message,
        );
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadData();
    }
  }, [id]);

  // Stable callback so memoized thumbnails don't re-render.
  // Prefetches the full-size image the moment the user taps a thumbnail.
  const handleImagePress = useCallback((uri, label) => {
    Image.prefetch(fullUrl(uri));
    setActiveImage(uri);
    setActiveImageLabel(label);
    setModalVisible(true);
  }, []);

  const toggleBill = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBillExpanded((prev) => !prev);
  };

  const toggleExchangeHistory = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExchangeHistoryExpanded((prev) => !prev);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Fetching handover details...</Text>
      </SafeAreaView>
    );
  }

  if (!handover) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={48} color="#94A3B8" />
        <Text style={styles.errorText}>Handover data not found.</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const paymentObj = handover.payment || {};
  const summaryObj = paymentObj.billSummary || {};
  const bill = {
    ...paymentObj,
    ...summaryObj,
    totalFare: summaryObj.totalFare || paymentObj.totalFare || 0,
    pickupCharge: summaryObj.pickupCharge || paymentObj.pickupCharge || 0,
    dropCharge: summaryObj.dropCharge || paymentObj.dropCharge || 0,
    fastTagPayable:
      summaryObj.fastTagPayable ||
      paymentObj.fastTagPayableAmount ||
      paymentObj.fastagAmount ||
      0,
    extraCharges: summaryObj.extraCharges || paymentObj.extraCharges || 0,
    securityDeposit:
      summaryObj.securityDeposit || paymentObj.securityDeposit || 0,
    discountAmount: summaryObj.discountAmount || paymentObj.discountAmount || 0,
    sawariCashUsed: summaryObj.sawariCashUsed || paymentObj.sawariCashUsed || 0,
    bookingAmountPaid:
      summaryObj.bookingAmountPaid || paymentObj.bookingAmountPaid || 0,
    amountReceivedNow:
      summaryObj.amountReceivedNow || paymentObj.amountReceivedNow || 0,
    totalAmount: summaryObj.totalAmount || paymentObj.totalAmount || 0,
    balanceAmount:
      summaryObj.balanceAmount !== undefined
        ? summaryObj.balanceAmount
        : paymentObj.balanceAmount,
  };
  const extensionSummary = handover.payment?.billSummary?.extensionSummary;

  const extensionBills = extensionSummary?.history || [];

  // Vehicle exchange history — each entry is a full vehicle swap made
  // during this rental, with its own before/after vehicle, reason,
  // who made the change, and the inspection photos taken of the
  // replacement vehicle at the time of the swap.
  const vehicleHistory = Array.isArray(handover.vehicleHistory)
    ? handover.vehicleHistory
    : [];
  const hasVehicleHistory = vehicleHistory.length > 0;

  const images = handover.images || {};
  const damageImages = Array.isArray(images.damageImages)
    ? images.damageImages
    : [];

  const hasIdentityPhotos = images.idCardFront || images.idCardBack;
  const hasDLPhotos = images.drivingLicenseFront || images.drivingLicenseBack;
  const hasCustomerPhotos =
    images.customerPhoto ||
    images.customerProfileImage ||
    images.customerWithVehicle;
  const hasVehiclePhotos =
    images.vehicleFront ||
    images.vehicleRear ||
    images.vehicleLeft ||
    images.vehicleRight;

  // The rest of the vehicle-condition shots captured at handover —
  // toolkit, spare tyre, odometer, fuel gauge, interior, roof top.
  const hasVehicleExtraPhotos =
    images.toolkit ||
    images.spareTyre ||
    images.odometer ||
    images.fuelGauge ||
    images.interior ||
    images.roofTop;

  const hasDamagePhotos = damageImages.length > 0;

  const hasAnyPhotos =
    hasIdentityPhotos ||
    hasDLPhotos ||
    hasCustomerPhotos ||
    hasVehiclePhotos ||
    hasVehicleExtraPhotos ||
    hasDamagePhotos;

  // ─────────────────────────────────────────────────────────────────────
  // BILL MATH — straight invoice order: add every charge first, show the
  // Total Amount, THEN deduct (discount, advance paid, received now) to
  // land on the Balance. Nothing is subtracted before the total is shown.
  //
  //   STEP 1 — Add: Total Fare + Pickup + Drop + FASTag + Extra Charges
  //            + Security Deposit  →  Total Amount
  //   STEP 2 — Deduct from Total Amount: Discount, Advance Paid,
  //            Received at Handover  →  Balance
  //
  // IMPORTANT: the balance is NOT clamped to zero. If deductions exceed
  // the Total Amount, that's a real, useful fact (the customer paid more
  // than owed) — clamping it to 0 and calling it "Fully Paid" hides an
  // overpayment/refund situation instead of surfacing it.
  const billTotal =
    (bill.totalFare || 0) +
    (bill.pickupCharge || 0) +
    (bill.dropCharge || 0) +
    (bill.fastTagPayable || 0) +
    (bill.extraCharges || 0) +
    (bill.securityDeposit || 0);

  // Prefer the server's computed total when present; fall back to the
  // locally-summed value otherwise so the screen never shows a blank.
  const finalPayable =
    bill.totalAmount !== undefined ? bill.totalAmount : billTotal;

  const totalDeductions =
    (bill.discountAmount || 0) +
    (bill.sawariCashUsed || 0) +
    (bill.bookingAmountPaid || 0) +
    (bill.amountReceivedNow || 0);

  // Prefer the server's balance when present; otherwise compute locally.
  const rawBalance =
    bill.balanceAmount !== undefined
      ? bill.balanceAmount
      : finalPayable - totalDeductions;

  const isOverpaid = rawBalance < 0;
  const isFullyPaid = rawBalance === 0;
  const finalBalanceDisplay = Math.abs(rawBalance);

  // Total actually received from the customer (advance + at handover).
  const totalReceived =
    (bill.bookingAmountPaid || 0) + (bill.amountReceivedNow || 0);

  return (
    <ImagePressContext.Provider value={handleImagePress}>
      <SafeAreaView style={styles.container}>
        {/* APP BAR HEADER */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.navIconButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>
            Handover #{id ? String(id).slice(-6) : ""}
          </Text>
          <StatusBadge status={handover.handoverStatus} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* HERO SUMMARY BOARD */}
          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View>
                <Text style={styles.heroSubText}>Vehicle Handover</Text>
                <Text style={styles.heroTitle}>
                  {handover.vehicle?.vehicleName || "Vehicle Details"}
                </Text>
                <Text style={styles.heroPlate}>
                  {handover.vehicle?.vehicleNumber || "N/A"}
                </Text>
              </View>
              <View style={styles.heroIconBadge}>
                <Ionicons name="car-sport" size={28} color="#2563EB" />
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroMetrics}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Handover Odometer</Text>
                <Text style={styles.metricValue}>
                  {handover.vehicle?.handoverKm || 0} km
                </Text>
              </View>
              <View style={styles.metricVerticalDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Net Payable</Text>
                <Text style={[styles.metricValue, { color: "#16A34A" }]}>
                  {formatINR(finalPayable)}
                </Text>
              </View>
            </View>
          </View>

          {/* BILL SUMMARY — itemized, collapsible, Zomato-style */}
          <View style={styles.billCard}>
            <TouchableOpacity
              style={styles.billHeaderRow}
              onPress={toggleBill}
              activeOpacity={0.7}
            >
              <View style={styles.billHeaderTitleWrap}>
                <Ionicons
                  name="receipt-outline"
                  size={20}
                  color="#1E293B"
                  style={styles.cardHeaderIcon}
                />
                <View>
                  <Text style={styles.billHeaderTitle}>Bill Summary</Text>
                  {!billExpanded && (
                    <Text style={styles.billHeaderSubtext}>
                      Tap to view full bill
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.billHeaderRight}>
                <Text style={styles.billHeaderAmount}>
                  {formatINR(finalPayable)}
                </Text>
                <Ionicons
                  name={billExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#64748B"
                />
              </View>
            </TouchableOpacity>

            {billExpanded && (
              <View style={styles.billBody}>
                <View style={styles.billDivider} />

                {/* ── STEP 1: ADD every charge ── */}
                <View style={styles.billLineRow}>
                  <Text style={styles.billLineLabel}>
                    Vehicle Rent
                    {handover.trip?.numberOfDays > 0 && bill.totalFare > 0 && (
                      <Text style={styles.billLineSub}>
                        {"  (for "}
                        {handover.trip.numberOfDays}{" "}
                        {handover.trip.numberOfDays === 1 ? "day" : "days"}
                        {")"}
                      </Text>
                    )}
                  </Text>
                  <Text style={styles.billLineValue}>
                    {formatINR(bill.totalFare)}
                  </Text>
                </View>

                {bill.pickupCharge > 0 && (
                  <View style={styles.billLineRow}>
                    <Text style={styles.billLineLabel}>Pickup Charge</Text>
                    <Text style={styles.billLineValue}>
                      {formatINR(bill.pickupCharge)}
                    </Text>
                  </View>
                )}

                {bill.dropCharge > 0 && (
                  <View style={styles.billLineRow}>
                    <Text style={styles.billLineLabel}>Drop Charge</Text>
                    <Text style={styles.billLineValue}>
                      {formatINR(bill.dropCharge)}
                    </Text>
                  </View>
                )}

                {bill.fastTagPayable > 0 && (
                  <View style={styles.billLineRow}>
                    <Text style={styles.billLineLabel}>FASTag Payable</Text>
                    <Text style={styles.billLineValue}>
                      {formatINR(bill.fastTagPayable)}
                    </Text>
                  </View>
                )}

                {bill.extraCharges > 0 && (
                  <View style={styles.billLineRow}>
                    <Text style={styles.billLineLabel}>Extra Charges</Text>
                    <Text style={styles.billLineValue}>
                      {formatINR(bill.extraCharges)}
                    </Text>
                  </View>
                )}

                {bill.securityDeposit > 0 && (
                  <View style={styles.billLineRow}>
                    <Text style={styles.billLineLabel}>Security Deposit</Text>
                    <Text style={styles.billLineValue}>
                      {formatINR(bill.securityDeposit)}
                    </Text>
                  </View>
                )}

                <View style={styles.billDividerDashed} />

                {/* ── STEP 2: TOTAL AMOUNT — single, unambiguous sum of every
                    itemized charge above. Nothing deducted yet. ── */}
                <View style={styles.billLineRow}>
                  <Text style={styles.billSubtotalLabel}>Total Amount</Text>
                  <Text style={styles.billSubtotalValue}>
                    {formatINR(finalPayable)}
                  </Text>
                </View>

                <View style={styles.billDivider} />

                {/* ── STEP 3: DEDUCT from the Total Amount above ── */}
                {bill.bookingAmountPaid > 0 && (
                  <View style={styles.billLineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.billLineLabel}>
                        Advance Paid
                      </Text>
                      {(handover?.payment?.paymentMethod === "phonepe" || handover?.payment?.paymentMethod === "mixed") && handover?.createdAt && (
                        <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
                          {new Date(handover.createdAt).toLocaleString("en-IN", {
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
                    <Text style={[styles.billLineValue, styles.paidText]}>
                      − {formatINR(bill.bookingAmountPaid)}
                    </Text>
                  </View>
                )}

                {bill.discountAmount > 0 && (
                  <View style={styles.billLineRow}>
                    <Text style={[styles.billLineLabel, styles.discountText]}>
                      Discount
                    </Text>
                    <Text style={[styles.billLineValue, styles.discountText]}>
                      − {formatINR(bill.discountAmount)}
                    </Text>
                  </View>
                )}

                {bill.sawariCashUsed > 0 && (
                  <View style={styles.billLineRow}>
                    <Text style={[styles.billLineLabel, styles.discountText]}>
                      Sawari Cash Used
                    </Text>
                    <Text style={[styles.billLineValue, styles.discountText]}>
                      − {formatINR(bill.sawariCashUsed)}
                    </Text>
                  </View>
                )}

                {bill.amountReceivedNow > 0 && (
                  <View style={styles.billLineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.billLineLabel}>
                        Received at Handover
                      </Text>
                      {(handover?.payment?.paymentMethod === "phonepe" || handover?.payment?.paymentMethod === "mixed") && handover?.createdAt && (
                        <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
                          {new Date(handover.createdAt).toLocaleString("en-IN", {
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
                    <Text style={[styles.billLineValue, styles.paidText]}>
                      − {formatINR(bill.amountReceivedNow)}
                    </Text>
                  </View>
                )}

                <View style={styles.billDividerDashed} />

                {/* ── STEP 4: THE ONE FINAL NUMBER — Total Amount minus every
                    deduction above. Three states (due / paid / overpaid) are
                    shown explicitly instead of clamping negatives to zero. ── */}
                <View style={styles.billLineRow}>
                  <Text
                    style={[
                      styles.billFinalLabel,
                      {
                        color: isOverpaid
                          ? "#2563EB"
                          : isFullyPaid
                            ? "#16A34A"
                            : "#B45309",
                      },
                    ]}
                  >
                    {isOverpaid
                      ? "Refund Due to Customer"
                      : isFullyPaid
                        ? "Fully Paid"
                        : "Balance Due"}
                  </Text>
                  <Text
                    style={[
                      styles.billFinalValue,
                      {
                        color: isOverpaid
                          ? "#2563EB"
                          : isFullyPaid
                            ? "#16A34A"
                            : "#B45309",
                      },
                    ]}
                  >
                    {formatINR(finalBalanceDisplay)}
                  </Text>
                </View>

                {totalReceived > 0 && (
                  <>
                    <View style={styles.billDividerDashed} />
                    <View style={styles.billLineRow}>
                      <Text style={styles.billLineLabel}>
                        Total Received (Advance + Handover)
                      </Text>
                      <Text style={styles.billLineValue}>
                        {formatINR(totalReceived)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            )}

            <TouchableOpacity
              style={styles.billToggleFooter}
              onPress={toggleBill}
            >
              <Ionicons
                name={billExpanded ? "chevron-up" : "chevron-down"}
                size={14}
                color="#2563EB"
              />
              <Text style={styles.billToggleFooterText}>
                {billExpanded ? "Close bill" : "View bill"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* VEHICLE EXCHANGE HISTORY — collapsible, same open/close pattern
              as the Bill Summary above. Exchange photos are loaded lazily
              (only when the user taps "Show exchange photos"). */}
          {hasVehicleHistory && (
            <View style={styles.billCard}>
              <TouchableOpacity
                style={styles.billHeaderRow}
                onPress={toggleExchangeHistory}
                activeOpacity={0.7}
              >
                <View style={styles.billHeaderTitleWrap}>
                  <Ionicons
                    name="swap-horizontal-outline"
                    size={20}
                    color="#1E293B"
                    style={styles.cardHeaderIcon}
                  />
                  <View>
                    <Text style={styles.billHeaderTitle}>
                      Vehicle Exchange History
                    </Text>
                    {!exchangeHistoryExpanded && (
                      <Text style={styles.billHeaderSubtext}>
                        {vehicleHistory.length} exchange
                        {vehicleHistory.length === 1 ? "" : "s"} • Tap to view
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.billHeaderRight}>
                  <View style={styles.exchangeCountBadge}>
                    <Text style={styles.exchangeCountBadgeText}>
                      {vehicleHistory.length}
                    </Text>
                  </View>
                  <Ionicons
                    name={
                      exchangeHistoryExpanded ? "chevron-up" : "chevron-down"
                    }
                    size={18}
                    color="#64748B"
                  />
                </View>
              </TouchableOpacity>

              {exchangeHistoryExpanded && (
                <View style={styles.billBody}>
                  <View style={styles.billDivider} />

                  {vehicleHistory.map((entry, index) => {
                    const exchangeImages = entry.exchangeImages || {};
                    const hasExchangeImages =
                      exchangeImages.vehicleFront ||
                      exchangeImages.vehicleRear ||
                      exchangeImages.vehicleLeft ||
                      exchangeImages.vehicleRight ||
                      exchangeImages.additional;

                    return (
                      <View
                        key={entry._id || index}
                        style={styles.exchangeEntryCard}
                      >
                        <View style={styles.exchangeVehicleRow}>
                          <View style={styles.exchangeVehicleBox}>
                            <Text style={styles.exchangeVehicleLabel}>
                              Old Vehicle
                            </Text>
                            <Text style={styles.exchangeVehicleName}>
                              {entry.oldVehicle?.vehicleName || "-"}
                            </Text>
                            <Text style={styles.exchangeVehicleNumber}>
                              {entry.oldVehicle?.vehicleNumber || "-"}
                            </Text>
                          </View>

                          <Ionicons
                            name="arrow-forward"
                            size={18}
                            color="#94A3B8"
                            style={styles.exchangeVehicleArrow}
                          />

                          <View style={styles.exchangeVehicleBox}>
                            <Text style={styles.exchangeVehicleLabel}>
                              New Vehicle
                            </Text>
                            <Text style={styles.exchangeVehicleName}>
                              {entry.newVehicle?.vehicleName || "-"}
                            </Text>
                            <Text style={styles.exchangeVehicleNumber}>
                              {entry.newVehicle?.vehicleNumber || "-"}
                            </Text>
                          </View>
                        </View>

                        {!!entry.reason && (
                          <View style={styles.reasonBox}>
                            <Text style={styles.reasonTitle}>Reason</Text>
                            <Text style={styles.reasonText}>
                              {entry.reason}
                            </Text>
                          </View>
                        )}

                        {hasExchangeImages && (
                          <ExchangePhotos images={exchangeImages} />
                        )}

                        <View style={styles.extensionFooter}>
                          <Text style={styles.extensionCreated}>
                            {entry.changedBy?.fullName || ""}
                          </Text>
                          <Text style={styles.extensionCreated}>
                            {entry.changedAt
                              ? new Date(entry.changedAt).toLocaleString(
                                  "en-IN",
                                )
                              : ""}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                style={styles.billToggleFooter}
                onPress={toggleExchangeHistory}
              >
                <Ionicons
                  name={exchangeHistoryExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color="#2563EB"
                />
                <Text style={styles.billToggleFooterText}>
                  {exchangeHistoryExpanded
                    ? "Close exchange history"
                    : "View exchange history"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {extensionBills.length > 0 && (
            <Section title="Extension History" icon="time-outline">
              <View style={styles.extensionSummaryCard}>
                <View style={styles.extensionStat}>
                  <Text style={styles.extensionStatLabel}>Extensions</Text>
                  <Text style={styles.extensionStatValue}>
                    {extensionSummary.totalExtensions}
                  </Text>
                </View>

                <View style={styles.extensionStat}>
                  <Text style={styles.extensionStatLabel}>
                    Extension Charges
                  </Text>
                  <Text style={styles.extensionStatValue}>
                    {formatINR(extensionSummary.totalExtensionAmount)}
                  </Text>
                </View>

                <View style={styles.extensionStat}>
                  <Text style={styles.extensionStatLabel}>Collected</Text>
                  <Text
                    style={[styles.extensionStatValue, { color: "#16A34A" }]}
                  >
                    {formatINR(extensionSummary.totalExtensionCollected)}
                  </Text>
                </View>

                <View style={styles.extensionStat}>
                  <Text style={styles.extensionStatLabel}>Outstanding</Text>
                  <Text
                    style={[styles.extensionStatValue, { color: "#DC2626" }]}
                  >
                    {formatINR(extensionSummary.totalOutstanding)}
                  </Text>
                </View>
              </View>

              {extensionBills.map((extBill) => (
                <View key={extBill._id} style={styles.extensionCard}>
                  <View style={styles.extensionHeader}>
                    <Text style={styles.extensionTitle}>
                      Extension #{extBill.billNumber}
                    </Text>

                    <Text style={styles.extensionAmount}>
                      + {formatINR(extBill.extensionAmount)}
                    </Text>
                  </View>

                  <View style={styles.extensionRow}>
                    <Text style={styles.extensionLabel}>Previous Duration</Text>
                    <Text style={styles.extensionValue}>
                      {extBill.previousNumberOfDays} Days
                    </Text>
                  </View>

                  <View style={styles.extensionRow}>
                    <Text style={styles.extensionLabel}>New Duration</Text>
                    <Text style={styles.extensionValue}>
                      {extBill.newNumberOfDays} Days
                    </Text>
                  </View>

                  <View style={styles.extensionRow}>
                    <Text style={styles.extensionLabel}>Extra Days</Text>
                    <Text style={[styles.extensionValue, { color: "#2563EB" }]}>
                      +{extBill.extraDays}
                    </Text>
                  </View>

                  <View style={styles.extensionRow}>
                    <Text style={styles.extensionLabel}>Amount Collected</Text>
                    <Text style={[styles.extensionValue, { color: "#16A34A" }]}>
                      {formatINR(extBill.amountCollected)}
                    </Text>
                  </View>

                  <View style={styles.extensionRow}>
                    <Text style={styles.extensionLabel}>Remaining</Text>
                    <Text style={[styles.extensionValue, { color: "#DC2626" }]}>
                      {formatINR(extBill.remainingAmount)}
                    </Text>
                  </View>

                  <View style={styles.extensionRow}>
                    <Text style={styles.extensionLabel}>Previous Return</Text>
                    <Text style={styles.extensionValue}>
                      {new Date(extBill.previousDropDateTime).toLocaleString(
                        "en-IN",
                      )}
                    </Text>
                  </View>

                  <View style={styles.extensionRow}>
                    <Text style={styles.extensionLabel}>New Return</Text>
                    <Text style={styles.extensionValue}>
                      {new Date(extBill.newDropDateTime).toLocaleString(
                        "en-IN",
                      )}
                    </Text>
                  </View>

                  <View style={styles.extensionRow}>
                    <Text style={styles.extensionLabel}>Updated Fare</Text>
                    <Text style={styles.extensionValue}>
                      {formatINR(extBill.totalFareAfterThisBill)}
                    </Text>
                  </View>

                  {extBill.reason ? (
                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonTitle}>Reason</Text>
                      <Text style={styles.reasonText}>{extBill.reason}</Text>
                    </View>
                  ) : null}

                  <View style={styles.extensionFooter}>
                    <Text style={styles.extensionCreated}>
                      {extBill.createdBy?.fullName}
                    </Text>
                    <Text style={styles.extensionCreated}>
                      {new Date(extBill.createdAt).toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>
              ))}
            </Section>
          )}

          {/* HANDOVER PERSON */}
          <Section title="Handover Person" icon="person-badge-outline">
            <Row
              icon="person-outline"
              label="Name"
              value={handover.createdBy?.fullName}
            />
            <Row
              icon="call-outline"
              label="Mobile"
              value={handover.createdBy?.mobileNumber}
            />
            <Row
              icon="mail-outline"
              label="Email"
              value={handover.createdBy?.email}
            />
            <Row
              icon="briefcase-outline"
              label="Role"
              value={handover.createdBy?.role}
              isLast
            />
          </Section>

          {/* CUSTOMER */}
          <Section title="Customer Details" icon="people-outline">
            <Row
              icon="person-circle-outline"
              label="Customer"
              value={handover.customer?.fullName}
            />
            <Row
              icon="call-outline"
              label="Mobile"
              value={handover.customer?.mobileNumber}
            />
            <Row
              icon="call-outline"
              label="Alternate"
              value={handover.customer?.alternateMobileNumber}
            />
            <Row
              icon="briefcase-outline"
              label="Occupation"
              value={handover.customer?.occupation}
            />
            <Row
              icon="location-outline"
              label="Destination"
              value={handover.customer?.destination}
              isLast
            />
          </Section>

          {/* IDENTITY */}
          <Section
            title="Identity Verification"
            icon="shield-checkmark-outline"
          >
            <Row
              icon="card-outline"
              label="Aadhaar Number"
              value={
                handover.identity?.aadhaarNumber ? "[Aadhaar Redacted]" : "-"
              }
            />
            <Row
              icon="document-text-outline"
              label="Driving License"
              value={handover.identity?.drivingLicenseNumber}
              isLast
            />
          </Section>

          {/* VEHICLE */}
          <Section title="Vehicle Details" icon="car-outline">
            <Row
              icon="car-sport-outline"
              label="Vehicle"
              value={handover.vehicle?.vehicleName}
            />
            <Row
              icon="pricetag-outline"
              label="Registration No."
              value={handover.vehicle?.vehicleNumber}
            />
            <Row
              icon="color-palette-outline"
              label="Color"
              value={handover.vehicle?.vehicleColor}
            />
            <Row
              icon="speedometer-outline"
              label="Handover Reading"
              value={`${handover.vehicle?.handoverKm || 0} km`}
              isLast
            />
          </Section>

          {/* TRIP */}
          <Section title="Trip & Duration" icon="calendar-outline">
            <Row
              icon="navigate-outline"
              label="Trip Type"
              value={handover.trip?.tripType}
            />
            <Row
              icon="time-outline"
              label="Duration"
              value={`${handover.trip?.numberOfDays || 0} Days`}
            />
            <Row
              icon="calendar-outline"
              label="Pickup Time"
              value={
                handover.trip?.pickupDateTime
                  ? new Date(handover.trip.pickupDateTime).toLocaleString(
                      "en-IN",
                    )
                  : "-"
              }
            />
            <Row
              icon="calendar-clear-outline"
              label="Scheduled Return"
              value={
                handover.trip?.dropDateTime
                  ? new Date(handover.trip.dropDateTime).toLocaleString("en-IN")
                  : "-"
              }
              isLast
            />
          </Section>

          {/* PAYMENT DETAILS */}
          <Section title="Payment Details" icon="wallet-outline">
            <Row
              icon="speedometer-outline"
              label="Fuel Level"
              value={`${handover.payment?.fuelLevel ?? 0}/7`}
            />
            <Row
              icon="card-outline"
              label="FASTag Balance"
              value={formatINR(handover.payment?.fastTagBalance)}
            />
            <Row
              icon="card-outline"
              label="FASTag Payable"
              value={formatINR(handover.payment?.fastTagPayableAmount)}
            />
            <Row
              icon="cash-outline"
              label="Total Fare"
              value={formatINR(handover.payment?.totalFare)}
            />
            <Row
              icon="shield-checkmark-outline"
              label="Security Deposit"
              value={formatINR(handover.payment?.securityDeposit)}
            />
            <Row
              icon="add-circle-outline"
              label="Extra Charges"
              value={formatINR(handover.payment?.extraCharges)}
            />
            <Row
              icon="pricetag-outline"
              label="Discount"
              value={formatINR(handover.payment?.discountAmount)}
            />
            <Row
              icon="wallet-outline"
              label="Total Amount"
              value={formatINR(handover.payment?.totalAmount)}
              color="#16A34A"
            />
            <Row
              icon="cash-outline"
              label="Booking Amount Paid"
              value={formatINR(handover.payment?.bookingAmountPaid)}
            />
            <Row
              icon="cash-outline"
              label="Amount Received"
              value={formatINR(handover.payment?.amountReceivedNow)}
            />
            <Row
              icon="alert-circle-outline"
              label="Balance Amount"
              value={formatINR(handover.payment?.balanceAmount)}
              color="#DC2626"
            />
            <Row
              icon="swap-horizontal-outline"
              label="Payment Method"
              value={handover.payment?.paymentMethod}
            />

            {handover.payment?.paymentMethod === "mixed" && (
              <>
                <Row
                  icon="cash-outline"
                  label="Cash"
                  value={formatINR(handover.payment?.paymentBreakdown?.cash)}
                />
                <Row
                  icon="phone-portrait-outline"
                  label="PhonePe"
                  value={formatINR(handover.payment?.paymentBreakdown?.phonePe)}
                />
                <Row
                  icon="card-outline"
                  label="Razorpay"
                  value={formatINR(
                    handover.payment?.paymentBreakdown?.razorpay,
                  )}
                />
              </>
            )}

            <Row
              icon="checkmark-circle-outline"
              label="Payment Status"
              value={handover.payment?.paymentStatus}
              isLast
            />
          </Section>

          {/* IMAGES SECTION — grouped by category, same order they're
              captured in on the upload screen, so nothing looks random */}
          {hasAnyPhotos && (
            <Section title="Photos & Documents" icon="images-outline">
              {hasIdentityPhotos && (
                <>
                  <PhotoGroupHeader
                    icon="card-outline"
                    title="Official ID Verification"
                  />
                  <View style={styles.imageGrid}>
                    <ImageThumbnail
                      label="ID Card Front"
                      uri={images.idCardFront}
                    />
                    <ImageThumbnail
                      label="ID Card Back"
                      uri={images.idCardBack}
                    />
                  </View>
                </>
              )}

              {hasDLPhotos && (
                <>
                  <PhotoGroupHeader
                    icon="document-text-outline"
                    title="Driving License"
                  />
                  <View style={styles.imageGrid}>
                    <ImageThumbnail
                      label="DL Front"
                      uri={images.drivingLicenseFront}
                    />
                    <ImageThumbnail
                      label="DL Back"
                      uri={images.drivingLicenseBack}
                    />
                  </View>
                </>
              )}

              {hasCustomerPhotos && (
                <>
                  <PhotoGroupHeader
                    icon="person-outline"
                    title="Customer Verification"
                  />
                  <View style={styles.imageGrid}>
                    <ImageThumbnail
                      label="Form Photo"
                      uri={images.customerPhoto}
                    />
                    <ImageThumbnail
                      label="Clear Face"
                      uri={images.customerProfileImage}
                    />
                    <ImageThumbnail
                      label="Customer w/ Vehicle"
                      uri={images.customerWithVehicle}
                    />
                  </View>
                </>
              )}

              {hasVehiclePhotos && (
                <>
                  <PhotoGroupHeader
                    icon="car-sport-outline"
                    title="Vehicle Inspection"
                  />
                  <View style={styles.imageGrid}>
                    <ImageThumbnail
                      label="Vehicle Front"
                      uri={images.vehicleFront}
                    />
                    <ImageThumbnail
                      label="Vehicle Right"
                      uri={images.vehicleRight}
                    />
                    <ImageThumbnail
                      label="Vehicle Rear"
                      uri={images.vehicleRear}
                    />
                    <ImageThumbnail
                      label="Vehicle Left"
                      uri={images.vehicleLeft}
                    />
                  </View>
                </>
              )}

              {/* Remaining condition shots — toolkit, spare tyre,
                  odometer, fuel gauge, interior, roof top. Each thumbnail
                  self-hides via ImageThumbnail when its uri is empty. */}
              {hasVehicleExtraPhotos && (
                <>
                  <PhotoGroupHeader
                    icon="construct-outline"
                    title="Vehicle Condition Extras"
                  />
                  <View style={styles.imageGrid}>
                    <ImageThumbnail label="Toolkit" uri={images.toolkit} />
                    <ImageThumbnail label="Spare Tyre" uri={images.spareTyre} />
                    <ImageThumbnail label="Odometer" uri={images.odometer} />
                    <ImageThumbnail label="Fuel Gauge" uri={images.fuelGauge} />
                    <ImageThumbnail label="Interior" uri={images.interior} />
                    <ImageThumbnail label="Roof Top" uri={images.roofTop} />
                  </View>
                </>
              )}

              {hasDamagePhotos && (
                <>
                  <PhotoGroupHeader
                    icon="alert-circle-outline"
                    title={`Damage Close-ups (${damageImages.length})`}
                  />
                  <View style={styles.imageGrid}>
                    {damageImages.map((uri, index) => (
                      <ImageThumbnail
                        key={`${uri}-${index}`}
                        label={`Damage ${index + 1}`}
                        uri={uri}
                      />
                    ))}
                  </View>
                </>
              )}
            </Section>
          )}

          {/* NOTES */}
          <Section title="Notes" icon="create-outline">
            <View style={styles.notesBox}>
              <Text style={styles.notesText}>
                {handover.notes || "No extra notes added for this handover."}
              </Text>
            </View>
          </Section>
        </ScrollView>

        {/* LIGHTBOX / ZOOM MODAL */}
        <Modal
          visible={modalVisible}
          transparent={true}
          onRequestClose={() => setModalVisible(false)}
          animationType="fade"
        >
          <View style={styles.modalBackground}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{activeImageLabel}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {activeImage && (
              <ZoomableImage
                uri={fullUrl(activeImage)}
                previewUri={thumbUrl(activeImage)}
                resetKey={activeImage}
              />
            )}

            <Text style={styles.zoomHint}>
              Pinch to zoom • Double-tap to zoom • Drag to pan
            </Text>
          </View>
        </Modal>
      </SafeAreaView>
    </ImagePressContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: "#64748B",
    fontWeight: "600",
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#2563EB",
    borderRadius: 8,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  /* TOP APP BAR */
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  navIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  /* SCROLL CONTENT */
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  /* HERO CARD */
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroSubText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 2,
  },
  heroPlate: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563EB",
    marginTop: 2,
  },
  heroIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  heroDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 14,
  },
  heroMetrics: {
    flexDirection: "row",
    alignItems: "center",
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 2,
  },
  metricVerticalDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 16,
  },
  /* SECTION CARD */
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  cardHeaderIcon: {
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardBody: {
    paddingHorizontal: 16,
  },
  /* LIST ROW */
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 8,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  label: {
    fontSize: 14,
    color: "#475569",
    fontWeight: "500",
  },
  value: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    textAlign: "right",
  },
  /* BILL SUMMARY CARD */
  billCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  billHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  billHeaderTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  billHeaderTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  billHeaderSubtext: { fontSize: 12, color: "#94A3B8", marginTop: 1 },
  billHeaderRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  billHeaderAmount: { fontSize: 20, fontWeight: "800", color: "#16A34A" },
  billBody: { marginTop: 4 },
  billLineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  billLineLabel: { fontSize: 14.5, color: "#475569", flexShrink: 1 },
  billLineSub: { fontSize: 12.5, color: "#94A3B8" },
  billLineValue: { fontSize: 14.5, fontWeight: "700", color: "#0F172A" },
  discountText: { color: "#16A34A" },
  paidText: { color: "#16A34A" },
  billSubtotalLabel: { fontSize: 15.5, fontWeight: "800", color: "#0F172A" },
  billSubtotalValue: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  billFinalLabel: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  billFinalValue: { fontSize: 18, fontWeight: "800", color: "#16A34A" },
  billBalanceLabel: { fontSize: 15.5, fontWeight: "800" },
  billBalanceValue: { fontSize: 18, fontWeight: "900" },
  billDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 4 },
  billDividerDashed: {
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginVertical: 10,
  },
  billToggleFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 12,
    marginTop: 4,
  },
  billToggleFooterText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
  },

  /* VEHICLE EXCHANGE HISTORY */
  exchangeCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  exchangeCountBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#2563EB",
  },
  exchangeEntryCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    backgroundColor: "#FFF",
  },
  exchangeVehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  exchangeVehicleBox: {
    flex: 1,
  },
  exchangeVehicleLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  exchangeVehicleName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  exchangeVehicleNumber: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  exchangeVehicleArrow: {
    marginHorizontal: 10,
  },

  /* NOTES */
  notesBox: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 8,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  notesText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
  },

  /* PHOTO GROUPS */
  photoGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    marginBottom: 4,
  },
  photoGroupTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  photoToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
  },
  photoToggleText: { fontSize: 12.5, fontWeight: "700", color: "#2563EB" },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    columnGap: "4%",
    paddingVertical: 8,
  },
  imageCard: {
    width: "48%",
    height: 130,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
    position: "relative",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingVertical: 6,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  imageLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
    marginRight: 4,
  },
  /* MODAL */
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 10,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  zoomableContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  fullScreenImage: {
    width: width,
    height: height * 0.75,
  },
  zoomHint: {
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    paddingBottom: 24,
    paddingTop: 8,
  },
  extensionSummaryCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  extensionStat: {
    width: "48%",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },

  extensionStatLabel: {
    fontSize: 12,
    color: "#64748B",
  },

  extensionStatValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 6,
  },

  extensionCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    backgroundColor: "#FFF",
  },

  extensionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  extensionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },

  extensionAmount: {
    fontSize: 17,
    fontWeight: "800",
    color: "#2563EB",
  },

  extensionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  extensionLabel: {
    color: "#64748B",
    fontSize: 13,
  },

  extensionValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },

  reasonBox: {
    marginTop: 10,
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 10,
  },

  reasonTitle: {
    fontWeight: "700",
    marginBottom: 4,
  },

  reasonText: {
    color: "#475569",
  },

  extensionFooter: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  extensionCreated: {
    fontSize: 11,
    color: "#94A3B8",
  },
});
