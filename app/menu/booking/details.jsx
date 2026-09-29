import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
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

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ==========================================
// THEME
// ==========================================
const THEME = {
  primary: "#0F172A",
  secondary: "#2563EB",
  accent: "#3B82F6",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#DC2626",
  teal: "#0D9488",
  background: "#F8FAFC",
  card: "#FFFFFF",
  border: "#E2E8F0",
  textMuted: "#64748B",
  textDark: "#0F172A",
  divider: "#F1F5F9",
};

const STATUS_CONFIG = {
  "Booking Confirmed": { color: THEME.success, bg: "#DCFCE7" },
  confirmed: { color: THEME.success, bg: "#DCFCE7" },
  "Today's Pickup": { color: THEME.secondary, bg: "#DBEAFE" },
  "Tomorrow's Pickup": { color: THEME.warning, bg: "#FEF3C7" },
  "Pending Handover": { color: "#7C3AED", bg: "#F3E8FF" },
  handover_pending: { color: "#7C3AED", bg: "#F3E8FF" },
  vehicle_handover: { color: "#7C3AED", bg: "#F3E8FF" },
  "Active Rental": { color: THEME.teal, bg: "#CCFBF1" },
  active: { color: THEME.teal, bg: "#CCFBF1" },
  Completed: { color: "#475569", bg: "#E2E8F0" },
  completed: { color: "#475569", bg: "#E2E8F0" },
  Cancelled: { color: THEME.danger, bg: "#FEE2E2" },
  cancelled: { color: THEME.danger, bg: "#FEE2E2" },
};

const PAYMENT_STATUS_CONFIG = {
  paid: {
    color: THEME.success,
    bg: "#DCFCE7",
    label: "Fully Paid",
    icon: "checkmark-circle",
  },
  partial: {
    color: THEME.warning,
    bg: "#FEF3C7",
    label: "Partially Paid",
    icon: "time",
  },
  pending: {
    color: THEME.danger,
    bg: "#FEE2E2",
    label: "Payment Pending",
    icon: "alert-circle",
  },
};

const PAYMENT_METHOD_META = {
  cash: { icon: "cash", color: THEME.success, label: "Cash" },
  phonepe: { icon: "cellphone", color: THEME.secondary, label: "PhonePe" },
  razorpay: {
    icon: "credit-card-outline",
    color: THEME.accent,
    label: "Razorpay",
  },
  mixed: { icon: "swap-horizontal", color: THEME.primary, label: "Mixed" },
};

// ==========================================
// HELPERS
// ==========================================
const money = (val) => {
  const n = Number(val) || 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

const formatDate = (value, withTime = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  const opts = withTime
    ? {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }
    : { day: "numeric", month: "short", year: "numeric" };
  return date.toLocaleDateString("en-IN", opts);
};

const getInitials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

// ==========================================
// SMALL REUSABLE UI PIECES
// ==========================================
const SectionCard = ({ title, icon, children, style, noPadding }) => (
  <View style={[styles.card, noPadding && { padding: 0 }, style]}>
    {!!title && (
      <View
        style={[
          styles.cardTitleRow,
          noPadding && { paddingHorizontal: 14, paddingTop: 14 },
        ]}
      >
        {!!icon && icon}
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
    )}
    {children}
  </View>
);

const InfoRow = ({ label, value, onCopy, mono }) => {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueWrap}>
        <Text
          style={[styles.infoValue, mono && styles.monoText]}
          numberOfLines={1}
        >
          {value}
        </Text>
        {!!onCopy && (
          <TouchableOpacity
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            onPress={onCopy}
            style={styles.copyBtn}
          >
            <Ionicons name="copy-outline" size={14} color={THEME.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// Receipt-style perforated divider (Zomato/Swiggy bill look)
const PerforatedDivider = () => (
  <View style={styles.perforatedWrap}>
    <View style={styles.perforatedNotchLeft} />
    <View style={styles.dashedRow}>
      {Array.from({ length: 34 }).map((_, i) => (
        <View key={i} style={styles.dash} />
      ))}
    </View>
    <View style={styles.perforatedNotchRight} />
  </View>
);

const DashedDivider = () => (
  <View style={styles.dashedRow}>
    {Array.from({ length: 40 }).map((_, i) => (
      <View key={i} style={styles.dash} />
    ))}
  </View>
);

// ==========================================
// PREMIUM RECEIPT BILL CARD (Zomato-style)
// ==========================================
const ReceiptLineItem = ({ label, sublabel, value, muted, deduction }) => (
  <View style={styles.receiptLineItem}>
    <View style={{ flex: 1, paddingRight: 10 }}>
      <Text
        style={[styles.receiptItemLabel, muted && styles.receiptItemLabelMuted]}
      >
        {label}
      </Text>
      {!!sublabel && <Text style={styles.receiptItemSub}>{sublabel}</Text>}
    </View>
    <Text
      style={[
        styles.receiptItemValue,
        muted && styles.receiptItemLabelMuted,
        deduction && styles.receiptItemDeduction,
      ]}
    >
      {deduction && value !== "₹0" ? `− ${value}` : value}
    </Text>
  </View>
);

function BillSummaryCard({ bill }) {
  const payStyle =
    PAYMENT_STATUS_CONFIG[bill.paymentStatus] || PAYMENT_STATUS_CONFIG.pending;
  const methodMeta = bill.paymentMethod
    ? PAYMENT_METHOD_META[bill.paymentMethod] || PAYMENT_METHOD_META.cash
    : null;

  // bill.total from the backend is the pre-discount subtotal (Vehicle Fare
  // + Pickup + Drop + Extra Charges + FASTag) — discount is applied later,
  // same convention as the edit screen. bill.balance / bill.totalCollected
  // still come straight from the backend (billSummary) and are NOT
  // recomputed here, only displayed.
  const subtotal = bill.total || 0;
  const netPayable = Math.max(subtotal - (bill.discount || 0), 0);

  return (
    <SectionCard
      title="Bill Summary"
      icon={
        <Ionicons name="receipt-outline" size={16} color={THEME.secondary} />
      }
    >
      <View style={styles.billStatusRow}>
        <View style={[styles.billStatusChip, { backgroundColor: payStyle.bg }]}>
          <Ionicons name={payStyle.icon} size={12} color={payStyle.color} />
          <Text style={[styles.billStatusChipText, { color: payStyle.color }]}>
            {payStyle.label}
          </Text>
        </View>
        <Text style={styles.billStatusCaption}>
          {bill.isFinal ? "Final Bill" : "Estimated Bill (booking stage)"}
        </Text>
      </View>

      <View style={styles.invoiceRow}>
        <Text style={styles.invoiceLabel}>Vehicle / Trip Fare</Text>
        <Text style={styles.invoiceValue}>{money(bill.vehicleFare)}</Text>
      </View>

      {bill.pickupCharge > 0 && (
        <View style={styles.invoiceRow}>
          <Text style={styles.invoiceLabel}>Pickup Charge</Text>
          <Text style={styles.invoiceValue}>{money(bill.pickupCharge)}</Text>
        </View>
      )}

      {bill.dropCharge > 0 && (
        <View style={styles.invoiceRow}>
          <Text style={styles.invoiceLabel}>Drop Charge</Text>
          <Text style={styles.invoiceValue}>{money(bill.dropCharge)}</Text>
        </View>
      )}

      {bill.extraCharges > 0 && (
        <View style={styles.invoiceRow}>
          <Text style={styles.invoiceLabel}>Extra Charges</Text>
          <Text style={styles.invoiceValue}>{money(bill.extraCharges)}</Text>
        </View>
      )}

      {bill.fastTagPayable > 0 && (
        <View style={styles.invoiceRow}>
          <Text style={styles.invoiceLabel}>FASTag Payable</Text>
          <Text style={styles.invoiceValue}>{money(bill.fastTagPayable)}</Text>
        </View>
      )}

      <View style={styles.invoiceDivider} />

      <View style={styles.invoiceRow}>
        <Text style={styles.invoiceTotalLabel}>Subtotal</Text>
        <Text style={styles.invoiceTotalValue}>{money(subtotal)}</Text>
      </View>

      {bill.discount > 0 && (
        <View style={styles.invoiceRow}>
          <Text style={styles.invoiceLabel}>Discount</Text>
          <Text style={[styles.invoiceValue, { color: THEME.success }]}>
            − {money(bill.discount)}
          </Text>
        </View>
      )}

      <View style={styles.invoiceDivider} />

      <View style={styles.invoiceRow}>
        <Text style={styles.invoiceGrandLabel}>Final Payable Amount</Text>
        <Text style={styles.invoiceGrandValue}>{money(netPayable)}</Text>
      </View>

      {bill.bookingAmountPaid > 0 && (
        <View style={styles.invoiceRow}>
          <Text style={styles.invoiceLabel}>Advance Paid</Text>
          <Text style={[styles.invoiceValue, { color: THEME.success }]}>
            − {money(bill.bookingAmountPaid)}
          </Text>
        </View>
      )}

      {bill.isFinal && bill.amountReceivedNow > 0 && (
        <View style={styles.invoiceRow}>
          <Text style={styles.invoiceLabel}>Received at Handover</Text>
          <Text style={[styles.invoiceValue, { color: THEME.success }]}>
            − {money(bill.amountReceivedNow)}
          </Text>
        </View>
      )}

      <View style={styles.invoiceRow}>
        <Text style={styles.invoiceBalanceLabel}>
          {bill.balance > 0 ? "Balance Due" : "Fully Paid"}
        </Text>
        <Text
          style={[
            styles.invoiceBalanceValue,
            { color: bill.balance > 0 ? THEME.danger : THEME.success },
          ]}
        >
          {money(bill.balance)}
        </Text>
      </View>

      {bill.securityDeposit > 0 && (
        <View style={styles.invoiceRow}>
          <Text style={styles.invoiceLabel}>Security Deposit (refundable)</Text>
          <Text style={styles.invoiceValue}>{money(bill.securityDeposit)}</Text>
        </View>
      )}

      {bill.totalCollected > 0 && (
        <>
          <View style={styles.invoiceDivider} />
          <View style={styles.invoiceRow}>
            <Text style={styles.invoiceTotalLabel}>Total Collected</Text>
            <Text style={styles.invoiceTotalValue}>
              {money(bill.totalCollected)}
            </Text>
          </View>
        </>
      )}

      {methodMeta && (
        <>
          <View style={styles.invoiceDivider} />
          <View style={styles.methodRow}>
            <View
              style={[
                styles.methodIconCircle,
                { backgroundColor: `${methodMeta.color}18` },
              ]}
            >
              <MaterialCommunityIcons
                name={methodMeta.icon}
                size={16}
                color={methodMeta.color}
              />
            </View>
            <Text style={styles.methodRowText}>
              Paid via {methodMeta.label}
            </Text>
          </View>

          {bill.paymentBreakdown && (
            <View style={styles.breakdownWrap}>
              {bill.paymentBreakdown.cash > 0 && (
                <View style={styles.breakdownChip}>
                  <MaterialCommunityIcons
                    name="cash"
                    size={12}
                    color={THEME.success}
                  />
                  <Text style={styles.breakdownChipText}>
                    Cash {money(bill.paymentBreakdown.cash)}
                  </Text>
                </View>
              )}
              {bill.paymentBreakdown.phonePe > 0 && (
                <View style={styles.breakdownChip}>
                  <MaterialCommunityIcons
                    name="cellphone"
                    size={12}
                    color={THEME.secondary}
                  />
                  <Text style={styles.breakdownChipText}>
                    PhonePe {money(bill.paymentBreakdown.phonePe)}
                  </Text>
                </View>
              )}
              {bill.paymentBreakdown.razorpay > 0 && (
                <View style={styles.breakdownChip}>
                  <MaterialCommunityIcons
                    name="credit-card-outline"
                    size={12}
                    color={THEME.accent}
                  />
                  <Text style={styles.breakdownChipText}>
                    Razorpay {money(bill.paymentBreakdown.razorpay)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </>
      )}

      {!bill.isFinal && (
        <View style={styles.estimateNotice}>
          <Ionicons
            name="information-circle-outline"
            size={13}
            color={THEME.warning}
          />
          <Text style={styles.estimateNoticeText}>
            Handover not completed yet — figures shown are the booking estimate.
          </Text>
        </View>
      )}
    </SectionCard>
  );
}

// ==========================================
// EXTENSION HISTORY CARD (per-extension bill breakdown)
// ==========================================
function ExtensionHistoryCard({ bills }) {
  if (!bills?.length) return null;

  const totalCharged = bills.reduce((s, b) => s + (b.extensionAmount || 0), 0);
  const totalCollected = bills.reduce(
    (s, b) => s + (b.amountCollected || 0),
    0,
  );

  return (
    <SectionCard
      title="Extension History"
      icon={<Ionicons name="time-outline" size={16} color={THEME.secondary} />}
    >
      <View style={styles.extensionSummaryRow}>
        <View>
          <Text style={styles.extensionSummaryLabel}>
            Total Extension Charges
          </Text>
          <Text style={styles.extensionSummaryValue}>
            {money(totalCharged)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.extensionSummaryLabel}>Total Collected</Text>
          <Text
            style={[styles.extensionSummaryValue, { color: THEME.success }]}
          >
            {money(totalCollected)}
          </Text>
        </View>
      </View>

      <DashedDivider />

      {bills.map((bill, idx) => {
        const isExtension = bill.extraDays >= 0;
        const pending =
          (bill.extensionAmount || 0) - (bill.amountCollected || 0);
        return (
          <View key={bill._id || idx} style={styles.extensionItem}>
            <View style={styles.extensionHeaderRow}>
              <View style={styles.extensionBadge}>
                <Text style={styles.extensionBadgeText}>
                  Bill #{bill.billNumber}
                </Text>
              </View>
              <View
                style={[
                  styles.extensionDaysTag,
                  { backgroundColor: isExtension ? "#CCFBF1" : "#FEE2E2" },
                ]}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "800",
                    color: isExtension ? THEME.teal : THEME.danger,
                  }}
                >
                  {isExtension ? "+" : ""}
                  {bill.extraDays} day
                  {Math.abs(bill.extraDays) !== 1 ? "s" : ""}
                </Text>
              </View>
            </View>

            <View style={styles.extensionDateRow}>
              <Text style={styles.extensionDateText}>
                {formatDate(bill.previousDropDateTime, true)}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={11}
                color={THEME.textMuted}
              />
              <Text
                style={[
                  styles.extensionDateText,
                  { fontWeight: "700", color: THEME.textDark },
                ]}
              >
                {formatDate(bill.newDropDateTime, true)}
              </Text>
            </View>

            <View style={styles.extensionAmountsRow}>
              <View style={styles.extensionAmountCol}>
                <Text style={styles.extensionAmountLabel}>Charge</Text>
                <Text style={styles.extensionAmountValue}>
                  {money(bill.extensionAmount)}
                </Text>
              </View>
              <View style={styles.extensionAmountCol}>
                <Text style={styles.extensionAmountLabel}>Collected</Text>
                <Text
                  style={[
                    styles.extensionAmountValue,
                    { color: THEME.success },
                  ]}
                >
                  {money(bill.amountCollected)}
                </Text>
              </View>
              <View style={styles.extensionAmountCol}>
                <Text style={styles.extensionAmountLabel}>Fare After</Text>
                <Text style={styles.extensionAmountValue}>
                  {money(bill.totalFareAfterThisBill)}
                </Text>
              </View>
            </View>

            {pending > 0 && (
              <View style={styles.extensionPendingChip}>
                <Ionicons
                  name="alert-circle-outline"
                  size={11}
                  color={THEME.warning}
                />
                <Text style={styles.extensionPendingText}>
                  {money(pending)} pending from this extension
                </Text>
              </View>
            )}

            {!!bill.reason && (
              <Text style={styles.extensionReason}>Reason: {bill.reason}</Text>
            )}

            <Text style={styles.extensionMeta}>
              {formatDate(bill.createdAt, true)}
              {bill.createdBy?.fullName
                ? ` • by ${bill.createdBy.fullName}`
                : ""}
            </Text>

            {idx < bills.length - 1 && <DashedDivider />}
          </View>
        );
      })}
    </SectionCard>
  );
}

// ==========================================
// LOADING SKELETON
// ==========================================
const SkeletonBlock = ({ w, h, style }) => (
  <View
    style={[
      { width: w, height: h, backgroundColor: "#E5E9F0", borderRadius: 6 },
      style,
    ]}
  />
);

const DetailsSkeleton = () => (
  <View style={{ padding: 14 }}>
    <View style={[styles.card, { gap: 10 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <SkeletonBlock w={52} h={52} style={{ borderRadius: 26 }} />
        <View style={{ gap: 6, flex: 1 }}>
          <SkeletonBlock w="70%" h={16} />
          <SkeletonBlock w="40%" h={12} />
        </View>
      </View>
    </View>
    {[1, 2, 3].map((i) => (
      <View key={i} style={[styles.card, { gap: 10, marginTop: 12 }]}>
        <SkeletonBlock w="35%" h={14} />
        <SkeletonBlock w="100%" h={12} />
        <SkeletonBlock w="80%" h={12} />
        <SkeletonBlock w="60%" h={12} />
      </View>
    ))}
  </View>
);

const getPickupDelay = (scheduledDate, scheduledTime, actualTime) => {
  if (!scheduledDate || !scheduledTime || !actualTime) return "—";

  const scheduled = new Date(`${scheduledDate}T${scheduledTime}`);
  const actual = new Date(actualTime);

  if (isNaN(scheduled) || isNaN(actual)) return "—";

  const diff = actual - scheduled;
  const abs = Math.abs(diff);

  // Within 5 minutes = On Time
  if (abs <= 5 * 60 * 1000) {
    return "On Time";
  }

  const days = Math.floor(abs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((abs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((abs % (1000 * 60 * 60)) / (1000 * 60));

  const parts = [];

  if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hr${hours > 1 ? "s" : ""}`);
  if (minutes > 0) parts.push(`${minutes} min`);

  return diff > 0
    ? `Late by ${parts.join(" ")}`
    : `Early by ${parts.join(" ")}`;
};

// ==========================================
// MAIN SCREEN
// ==========================================
export default function BookingDetailsScreen() {
  const router = useRouter();
  // NEW: read `returnTo` — the exact path the list screen was on when it
  // pushed us here. This is what makes "back" reliable, since a plain
  // router.back() can fall through to the tab's default/home screen
  // whenever this details screen was pushed across a route-group
  // boundary (its own stack history doesn't actually contain the
  // bookings list in that case).
  const { id, returnTo } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);
  const [imageViewer, setImageViewer] = useState({
    visible: false,
    uri: null,
    label: "",
  });

  const fetchDetails = useCallback(
    async (opts = {}) => {
      const silent = opts.silent ?? false;
      if (!id) {
        setError("Missing booking id.");
        setLoading(false);
        return;
      }
      try {
        if (!silent) setLoading(true);
        setError(null);
        const res = await api.get(`/bookings/${id}/details`);
        if (res?.data?.success) {
          setBooking(res.data.booking);
        } else {
          setError(res?.data?.message || "Failed to load booking.");
        }
      } catch (err) {
        console.log("booking details fetch error:", err?.message);
        setError(
          err?.response?.data?.message ||
            "Network error. Pull down to try again.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDetails({ silent: true });
  }, [fetchDetails]);

  // NEW: single source of truth for "go back to the bookings list".
  // 1) If we know exactly where we came from (returnTo), go there —
  //    this is the reliable path and covers the "back sends me home"
  //    bug regardless of navigator/group structure.
  // 2) Otherwise fall back to router.back() only if there really is
  //    history to go back to.
  // 3) Last resort: replace with the bookings tab route so we never
  //    strand the user on a dead end. Adjust "/menu/booking" below if
  //    your bookings list actually lives at a different path.
  const handleBack = useCallback(() => {
    if (returnTo && typeof returnTo === "string") {
      router.replace(returnTo);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/menu/booking");
  }, [router, returnTo]);

  // ---- Derived / merged view-model (booking first, handover fallback) ----
  const vm = useMemo(() => {
    if (!booking) return null;
    const handover = booking.handoverRecord || null;
    const pickupDelay = getPickupDelay(
      booking.fromDate,
      booking.pickupTime,
      handover?.createdAt,
    );
    const payment = booking.payment || null; // normalized in backend, sourced from billSummary

    const statusLabel =
      {
        confirmed: "Booking Confirmed",
        handover_pending: "Pending Handover",
        vehicle_handover: "Pending Handover",
        active: "Active Rental",
        completed: "Completed",
        cancelled: "Cancelled",
      }[booking.status] || booking.status;

    // FIX: vehicleFare is read straight from the normalized payment object
    // the backend already sends (payment.vehicleFare), which itself maps
    // to billSummary.totalFare — the real, saved bill figure. No local
    // guessing chain, no subtraction fallback.
    const vehicleFare = payment?.vehicleFare || 0;

    // FIX: pickupCharge / dropCharge / totalCollected now come from the
    // normalized `payment` object (i.e. from the stored billSummary),
    // instead of booking.pickup?.charge / booking.drop?.charge and a
    // frontend addition. This keeps every figure on the bill card
    // sourced from the same single billSummary snapshot, so it can't
    // drift out of sync the way it did before.
    const bill = payment
      ? {
          isFinal: !!payment.isFinal,
          extraCharges: payment.extraCharges || 0,
          discount: payment.discountAmount || 0,
          securityDeposit: payment.securityDeposit || 0,
          fastTagBalance: 0,
          fastTagPayable: payment.fastTagPayableAmount || 0,
          pickupCharge: payment.pickupCharge || 0,
          dropCharge: payment.dropCharge || 0,
          vehicleFare,
          total: payment.totalAmount || 0,
          bookingAmountPaid: payment.bookingAmountPaid || 0,
          amountReceivedNow: payment.amountReceivedNow || 0,
          totalCollected: payment.totalCollected || 0,
          balance: payment.balanceAmount || 0,
          paymentMethod: payment.paymentMethod,
          paymentBreakdown: payment.paymentBreakdown,
          paymentStatus: payment.paymentStatus || "pending",
        }
      : {
          isFinal: false,
          extraCharges: 0,
          discount: 0,
          securityDeposit: 0,
          fastTagBalance: 0,
          fastTagPayable: 0,
          pickupCharge: 0,
          dropCharge: 0,
          vehicleFare,
          total: vehicleFare || 0,
          bookingAmountPaid: 0,
          amountReceivedNow: 0,
          totalCollected: 0,
          balance: 0,
          paymentMethod: null,
          paymentBreakdown: null,
          paymentStatus: "pending",
        };

    // Extension bills come from the backend as `extensionHistory`
    // (sorted, populated createdBy), falling back to the raw
    // handover.extensionBills array if the backend hasn't been
    // updated to expose the normalized field yet.
    const extensionHistory =
      booking.extensionHistory || handover?.extensionBills || [];

    const photos = booking.images
      ? [
          {
            key: "customerPhoto",
            label: "Customer Photo",
            uri: booking.images.customerPhoto,
          },
          {
            key: "customerWithVehicle",
            label: "With Vehicle",
            uri: booking.images.customerWithVehicle,
          },
          {
            key: "idCardFront",
            label: "ID Front",
            uri: booking.images.idCardFront,
          },
          {
            key: "idCardBack",
            label: "ID Back",
            uri: booking.images.idCardBack,
          },
          {
            key: "vehicleFront",
            label: "Vehicle Front",
            uri: booking.images.vehicleFront,
          },
          {
            key: "vehicleRear",
            label: "Vehicle Rear",
            uri: booking.images.vehicleRear,
          },
          {
            key: "vehicleLeft",
            label: "Vehicle Left",
            uri: booking.images.vehicleLeft,
          },
          {
            key: "vehicleRight",
            label: "Vehicle Right",
            uri: booking.images.vehicleRight,
          },
        ].filter((p) => !!p.uri)
      : [];

    return {
      handover,
      statusLabel,
      bill,
      extensionHistory,
      photos,
      pickupDelay,
    };
  }, [booking]);

  const handleCall = useCallback(async () => {
    const phone = booking?.mobileNumber;
    if (!phone)
      return Alert.alert("Missing Contact", "No phone number on this booking.");
    const url = `tel:${phone.replace(/[^\d+]/g, "")}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert("Error", "Calls are not supported on this device.");
    } catch {
      Alert.alert("Error", "Unable to initiate the call.");
    }
  }, [booking]);

  const handleWhatsApp = useCallback(async () => {
    const phone = booking?.mobileNumber;
    if (!phone)
      return Alert.alert("Missing Contact", "No phone number on this booking.");
    const url = `https://wa.me/91${phone.replace(/[^\d]/g, "")}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert("WhatsApp", "WhatsApp is not installed.");
    } catch {
      Alert.alert("Error", "Unable to open WhatsApp.");
    }
  }, [booking]);

  const copyToClipboard = useCallback(async (value, label) => {
    if (!value) return;
    await Clipboard.setStringAsync(String(value));
    Alert.alert("Copied", `${label} copied to clipboard.`);
  }, []);

  const openImage = useCallback((uri, label) => {
    setImageViewer({ visible: true, uri, label });
  }, []);

  const closeImage = useCallback(() => {
    setImageViewer({ visible: false, uri: null, label: "" });
  }, []);

  // ================= RENDER STATES =================

  if (error && !booking) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar barStyle="dark-content" backgroundColor={THEME.card} />
        <HeaderBar onBack={handleBack} title="Booking Details" />
        <View style={styles.centerFill}>
          <Ionicons
            name="cloud-offline-outline"
            size={44}
            color={THEME.textMuted}
          />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchDetails()}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading || !vm) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar barStyle="dark-content" backgroundColor={THEME.card} />
        <HeaderBar onBack={handleBack} title="Booking Details" />
        <DetailsSkeleton />
      </SafeAreaView>
    );
  }

  const statusStyle = STATUS_CONFIG[vm.statusLabel] ||
    STATUS_CONFIG[booking.status] || {
      color: THEME.primary,
      bg: THEME.border,
    };

  const showPickup =
    booking.pickupDropRequired &&
    (booking.serviceType === "pickup" || booking.serviceType === "pickup_drop");
  const showDrop =
    booking.pickupDropRequired &&
    (booking.serviceType === "drop" || booking.serviceType === "pickup_drop");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={THEME.card} />
      <HeaderBar
        onBack={handleBack}
        title="Booking Details"
        subtitle={booking.bookingCode}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.secondary}
          />
        }
      >
        {error && (
          <View style={styles.inlineErrorBanner}>
            <Ionicons
              name="alert-circle-outline"
              size={14}
              color={THEME.danger}
            />
            <Text style={styles.inlineErrorText}>
              {error} — showing last loaded data.
            </Text>
          </View>
        )}

        {/* ---- Customer Header Card ---- */}
        <SectionCard>
          <View style={styles.customerHeaderRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {getInitials(booking.customerName)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerNameLg} numberOfLines={1}>
                {booking.customerName}
              </Text>
              <Text style={styles.customerPhoneLg}>{booking.mobileNumber}</Text>
            </View>
          </View>

          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={styles.quickActionBtn}
              onPress={handleCall}
            >
              <Ionicons name="call" size={16} color={THEME.primary} />
              <Text style={styles.quickActionText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionBtn}
              onPress={handleWhatsApp}
            >
              <Ionicons name="logo-whatsapp" size={17} color="#25D366" />
              <Text style={styles.quickActionText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionBtn}
              onPress={() =>
                router.push({
                  pathname: "../menu/booking/booking-details",
                  params: {
                    id: booking._id || booking.id,
                    mode: "edit",
                    returnTo,
                  },
                })
              }
            >
              <Ionicons
                name="create-outline"
                size={16}
                color={THEME.secondary}
              />
              <Text
                style={[styles.quickActionText, { color: THEME.secondary }]}
              >
                Edit
              </Text>
            </TouchableOpacity>
          </View>
        </SectionCard>

        {booking.handoverInfo && (
          <SectionCard
            title="Handover Details"
            icon={
              <Ionicons
                name="person-circle-outline"
                size={16}
                color={THEME.secondary}
              />
            }
          >
            <InfoRow
              label="Handover By"
              value={booking.handoverInfo.fullName}
            />

            <InfoRow label="Email" value={booking.handoverInfo.email} />

            <InfoRow
              label="Date & Time"
              value={formatDate(booking.handoverInfo.handoverDateTime, true)}
            />
            <InfoRow
              label="Pickup Delay"
              value={getPickupDelay(
                booking.fromDate,
                booking.pickupTime,
                booking.handoverInfo?.handoverDateTime,
              )}
            />
          </SectionCard>
        )}

        {/* ---- Trip Overview ---- */}
        <SectionCard
          title="Trip Overview"
          icon={
            <Ionicons name="map-outline" size={16} color={THEME.secondary} />
          }
        >
          <View style={styles.timelineRow}>
            <View style={styles.timelineDotCol}>
              <View
                style={[styles.timelineDot, { backgroundColor: THEME.success }]}
              />
              <View style={styles.timelineLine} />
              <View
                style={[styles.timelineDot, { backgroundColor: THEME.danger }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.timelinePoint}>
                <Text style={styles.timelinePointLabel}>PICKUP</Text>
                <Text style={styles.timelinePointValue}>
                  {formatDate(booking.fromDate)} • {booking.pickupTime}
                </Text>
              </View>
              <View style={[styles.timelinePoint, { marginTop: 18 }]}>
                <Text style={styles.timelinePointLabel}>RETURN</Text>
                <Text style={styles.timelinePointValue}>
                  {formatDate(booking.toDate)} • {booking.dropTime}
                </Text>
              </View>
            </View>
            <View style={styles.durationPill}>
              <Text style={styles.durationPillText}>{booking.totalDays}d</Text>
            </View>
          </View>

          <DashedDivider />

          <InfoRow label="Destination" value={booking.destination} />
          <InfoRow
            label="Trip Type"
            value={
              booking.tripType
                ? booking.tripType[0].toUpperCase() + booking.tripType.slice(1)
                : "—"
            }
          />
          <InfoRow
            label="Passengers"
            value={booking.residents ? `${booking.residents} Person(s)` : null}
          />
        </SectionCard>

        {/* ---- Pickup / Drop Service ---- */}
        {(showPickup || showDrop) && (
          <SectionCard
            title="Pickup & Drop Service"
            icon={
              <Ionicons
                name="navigate-outline"
                size={16}
                color={THEME.secondary}
              />
            }
          >
            {showPickup && (
              <>
                <InfoRow
                  label="Pickup Location"
                  value={booking.pickup?.location}
                />
                <InfoRow label="Landmark" value={booking.pickup?.landmark} />
                <InfoRow
                  label="Pickup Charge"
                  value={
                    vm.bill.pickupCharge ? money(vm.bill.pickupCharge) : null
                  }
                />
              </>
            )}
            {showDrop && (
              <>
                <InfoRow label="Drop Location" value={booking.drop?.location} />
                <InfoRow label="Landmark" value={booking.drop?.landmark} />
                <InfoRow
                  label="Drop Charge"
                  value={vm.bill.dropCharge ? money(vm.bill.dropCharge) : null}
                />
              </>
            )}
            <InfoRow label="Notes" value={booking.pickupDropNotes} />
          </SectionCard>
        )}

        {/* ---- Vehicle ---- */}
        <SectionCard
          title="Vehicle Details"
          icon={
            <Ionicons
              name="car-sport-sharp"
              size={16}
              color={THEME.secondary}
            />
          }
        >
          <InfoRow label="Vehicle" value={booking.vehicleName} />
          <InfoRow
            label="Reg. Number"
            value={booking.vehicleNumber}
            mono
            onCopy={() =>
              copyToClipboard(booking.vehicleNumber, "Vehicle number")
            }
          />
          <InfoRow label="Colour" value={booking.vehicleColor} />
          <InfoRow
            label="Handover Odometer"
            value={
              booking.handoverKm != null && booking.handoverKm !== ""
                ? `${booking.handoverKm} km`
                : null
            }
          />
          {vm.handover?.payment?.fuelLevel != null && (
            <InfoRow
              label="Fuel Level"
              value={`${vm.handover.payment.fuelLevel}/7 bars`}
            />
          )}
        </SectionCard>

        {/* ---- Customer & Documents ---- */}
        <SectionCard
          title="Customer & Documents"
          icon={
            <Ionicons name="person-outline" size={16} color={THEME.secondary} />
          }
        >
          <InfoRow label="Full Name" value={booking.customerName} />
          <InfoRow
            label="Mobile"
            value={booking.mobileNumber}
            mono
            onCopy={() =>
              copyToClipboard(booking.mobileNumber, "Mobile number")
            }
          />
          <InfoRow
            label="Alternate Mobile"
            value={booking.alternateMobileNumber}
            mono
          />
          <InfoRow label="Occupation" value={booking.occupation} />
          <InfoRow
            label="Aadhaar No."
            value={booking.aadhaarNumber}
            mono
            onCopy={() =>
              copyToClipboard(booking.aadhaarNumber, "Aadhaar number")
            }
          />
          <InfoRow
            label="Driving Licence"
            value={booking.drivingLicenseNumber}
            mono
            onCopy={() =>
              copyToClipboard(booking.drivingLicenseNumber, "DL number")
            }
          />
        </SectionCard>

        {/* ---- Bill Summary (premium Zomato-style receipt) ---- */}
        <BillSummaryCard bill={vm.bill} />

        {/* ---- Extension History ---- */}
        <ExtensionHistoryCard bills={vm.extensionHistory} />

        {/* ---- Vehicle Change History ---- */}
        {!!vm.handover?.vehicleHistory?.length && (
          <SectionCard
            title="Vehicle Change History"
            icon={
              <Ionicons
                name="swap-horizontal-outline"
                size={16}
                color={THEME.secondary}
              />
            }
          >
            {vm.handover.vehicleHistory.map((h, idx) => (
              <View key={idx} style={styles.historyItem}>
                <Text style={styles.historyText}>
                  {h.oldVehicle?.vehicleName || "Unknown"} (
                  {h.oldVehicle?.vehicleNumber || "—"}) →{" "}
                  {h.newVehicle?.vehicleName || "Unknown"} (
                  {h.newVehicle?.vehicleNumber || "—"})
                </Text>
                {!!h.reason && (
                  <Text style={styles.historyReason}>Reason: {h.reason}</Text>
                )}
                <Text style={styles.historyDate}>
                  {formatDate(h.changedAt, true)}
                </Text>
              </View>
            ))}
          </SectionCard>
        )}

        {/* ---- Return Details ---- */}
        {vm.handover?.returnDetails?.returnedAt && (
          <SectionCard
            title="Return Details"
            icon={
              <Ionicons
                name="checkmark-done-circle-outline"
                size={16}
                color={THEME.success}
              />
            }
          >
            <InfoRow
              label="Returned At"
              value={formatDate(vm.handover.returnDetails.returnedAt, true)}
            />
            <InfoRow
              label="Vehicle Condition"
              value={vm.handover.returnDetails.vehicleCondition}
            />
            <InfoRow
              label="Remarks"
              value={vm.handover.returnDetails.remarks}
            />
          </SectionCard>
        )}

        {/* ---- Photos ---- */}
        {vm.photos.length > 0 && (
          <SectionCard
            title="Handover Photos"
            icon={
              <Ionicons
                name="images-outline"
                size={16}
                color={THEME.secondary}
              />
            }
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            >
              {vm.photos.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={styles.photoThumbWrap}
                  onPress={() => openImage(p.uri, p.label)}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: p.uri }}
                    style={styles.photoThumb}
                    resizeMode="cover"
                  />
                  <Text style={styles.photoLabel} numberOfLines={1}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SectionCard>
        )}

        {/* ---- Notes / Remarks ---- */}
        {(booking.remarks || vm.handover?.notes) && (
          <SectionCard
            title="Notes"
            icon={
              <Ionicons
                name="document-text-outline"
                size={16}
                color={THEME.secondary}
              />
            }
          >
            {!!booking.remarks && (
              <View style={{ marginBottom: vm.handover?.notes ? 10 : 0 }}>
                <Text style={styles.noteTag}>Booking Note</Text>
                <Text style={styles.noteText}>{booking.remarks}</Text>
              </View>
            )}
            {!!vm.handover?.notes && (
              <View>
                <Text style={styles.noteTag}>Handover Note</Text>
                <Text style={styles.noteText}>{vm.handover.notes}</Text>
              </View>
            )}
          </SectionCard>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ---- Fullscreen Image Viewer ---- */}
      <Modal
        visible={imageViewer.visible}
        transparent
        animationType="fade"
        onRequestClose={closeImage}
      >
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity
            style={styles.imageViewerCloseBtn}
            onPress={closeImage}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          {!!imageViewer.label && (
            <Text style={styles.imageViewerLabel}>{imageViewer.label}</Text>
          )}
          {imageViewer.uri && (
            <Image
              source={{ uri: imageViewer.uri }}
              style={styles.imageViewerImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ==========================================
// HEADER BAR
// ==========================================
// CHANGED: now takes `onBack` directly instead of `router`, so the caller
// controls exactly what "back" means (see handleBack above) instead of
// this component always calling the raw router.back().
function HeaderBar({ onBack, title, subtitle }) {
  return (
    <View style={styles.headerBar}>
      <TouchableOpacity
        style={styles.headerBackBtn}
        onPress={onBack}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="arrow-back" size={22} color={THEME.textDark} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerBarTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.headerBarSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  centerFill: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 6,
  },

  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: THEME.card,
    borderBottomWidth: 1,
    borderColor: THEME.border,
  },
  headerBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: THEME.background,
  },
  headerBarTitle: { fontSize: 15, fontWeight: "700", color: THEME.textDark },
  headerBarSubtitle: { fontSize: 11, color: THEME.textMuted, marginTop: 1 },

  scrollContent: { padding: 12, paddingBottom: 24 },

  inlineErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
    marginBottom: 10,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: THEME.danger,
  },

  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.textDark,
    marginTop: 4,
  },
  errorSubtitle: { fontSize: 12, color: THEME.textMuted, textAlign: "center" },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: THEME.primary,
  },
  retryButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  card: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 13, fontWeight: "700", color: THEME.textDark },

  // Customer header
  customerHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: THEME.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  customerNameLg: { fontSize: 16, fontWeight: "700", color: THEME.textDark },
  customerPhoneLg: { fontSize: 12, color: THEME.textMuted, marginTop: 2 },
  statusBadgeLg: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 },
  statusTextLg: { fontSize: 10, fontWeight: "700" },

  quickActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: THEME.divider,
    paddingTop: 12,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 36,
    borderRadius: 8,
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  quickActionText: { fontSize: 12, fontWeight: "600", color: THEME.textDark },

  // Info rows
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 12,
    color: THEME.textMuted,
    fontWeight: "500",
    flex: 1,
  },
  infoValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1.4,
    justifyContent: "flex-end",
  },
  infoValue: {
    fontSize: 12.5,
    color: THEME.textDark,
    fontWeight: "600",
    textAlign: "right",
  },
  monoText: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  copyBtn: { padding: 2 },

  // Trip timeline
  timelineRow: { flexDirection: "row", alignItems: "flex-start" },
  timelineDotCol: {
    alignItems: "center",
    width: 16,
    marginRight: 10,
    marginTop: 3,
  },
  timelineDot: { width: 9, height: 9, borderRadius: 5 },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 26,
    backgroundColor: THEME.border,
    marginVertical: 3,
  },
  timelinePoint: {},
  timelinePointLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: THEME.textMuted,
    letterSpacing: 0.3,
  },
  timelinePointValue: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textDark,
    marginTop: 2,
  },
  durationPill: {
    backgroundColor: "#EFF6FF",
    borderWidth: 0.5,
    borderColor: "#BFDBFE",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  durationPillText: { fontSize: 11, fontWeight: "700", color: THEME.secondary },

  dashedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 8,
    overflow: "hidden",
    flex: 1,
  },
  dash: { width: 4, height: 1, backgroundColor: THEME.border },

  // History
  historyItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.divider,
  },
  historyText: { fontSize: 12.5, fontWeight: "600", color: THEME.textDark },
  historyReason: { fontSize: 11, color: THEME.textMuted, marginTop: 2 },
  historyDate: { fontSize: 10, color: THEME.textMuted, marginTop: 2 },

  // Photos
  photoThumbWrap: { width: 84 },
  photoThumb: {
    width: 84,
    height: 84,
    borderRadius: 10,
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  photoLabel: {
    fontSize: 10,
    color: THEME.textMuted,
    marginTop: 4,
    textAlign: "center",
  },

  // Notes
  noteTag: {
    fontSize: 10,
    fontWeight: "700",
    color: THEME.textMuted,
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  noteText: { fontSize: 12.5, color: THEME.textDark, lineHeight: 18 },

  // Image viewer
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageViewerCloseBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 24,
    right: 18,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageViewerLabel: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 28,
    left: 18,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  imageViewerImage: { width: SCREEN_WIDTH, height: "80%" },

  // ==========================================
  // PREMIUM RECEIPT / BILL CARD
  // ==========================================
  billStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  billStatusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  billStatusChipText: {
    fontSize: 10,
    fontWeight: "800",
  },
  billStatusCaption: {
    fontSize: 11,
    color: THEME.textMuted,
    fontWeight: "600",
  },

  invoiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 8,
    gap: 12,
  },
  invoiceLabel: {
    flex: 1,
    fontSize: 13,
    color: THEME.textMuted,
  },
  invoiceValue: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textDark,
  },
  invoiceDivider: {
    borderStyle: "dashed",
    borderWidth: 0.75,
    borderColor: THEME.border,
    marginTop: 12,
  },
  invoiceTotalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textDark,
  },
  invoiceTotalValue: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textDark,
  },
  invoiceGrandLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: THEME.textDark,
  },
  invoiceGrandValue: {
    fontSize: 16,
    fontWeight: "800",
    color: THEME.success,
  },
  invoiceBalanceLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.warning,
  },
  invoiceBalanceValue: {
    fontSize: 14,
    fontWeight: "800",
  },

  estimateNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    padding: 10,
    marginTop: 12,
    borderRadius: 8,
  },
  estimateNoticeText: {
    flex: 1,
    fontSize: 11,
    color: "#92400E",
    fontWeight: "600",
  },

  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  methodIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  methodRowText: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textDark,
  },

  breakdownWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  breakdownChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  breakdownChipText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: THEME.textDark,
  },

  // ==========================================
  // EXTENSION HISTORY CARD
  // ==========================================
  extensionSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  extensionSummaryLabel: {
    fontSize: 11,
    color: THEME.textMuted,
    fontWeight: "600",
  },
  extensionSummaryValue: {
    fontSize: 16,
    fontWeight: "800",
    color: THEME.textDark,
    marginTop: 2,
  },
  extensionItem: {
    paddingVertical: 8,
  },
  extensionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  extensionBadge: {
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  extensionBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: THEME.textDark,
  },
  extensionDaysTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  extensionDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  extensionDateText: {
    fontSize: 11.5,
    color: THEME.textMuted,
    fontWeight: "600",
  },
  extensionAmountsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    backgroundColor: THEME.background,
    borderRadius: 8,
    padding: 10,
  },
  extensionAmountCol: { alignItems: "flex-start" },
  extensionAmountLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    color: THEME.textMuted,
    letterSpacing: 0.3,
  },
  extensionAmountValue: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textDark,
    marginTop: 3,
  },
  extensionPendingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  extensionPendingText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#92400E",
  },
  extensionReason: {
    fontSize: 11.5,
    color: THEME.textMuted,
    marginTop: 6,
  },
  extensionMeta: {
    fontSize: 10,
    color: THEME.textMuted,
    marginTop: 4,
  },
});
