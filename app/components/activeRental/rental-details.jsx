import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ImageViewer from "react-native-image-zoom-viewer";
import api from "../../../services/api";
import useAuthStore from "../../../store/authStore";

const money = (val) => `₹${(Number(val) || 0).toLocaleString("en-IN")}`;

// In-memory cache keyed by handover id — survives this screen unmounting and
// remounting for a DIFFERENT id (e.g. tapping into another booking and back),
// so revisiting the same booking within the app session paints instantly.
const detailsMemoryCache = {};

// Disk cache — survives a full app kill. We only ever store the raw
// `res.data.data` payload from THIS endpoint, keyed by id, so a cold app
// open straight into a booking's details still paints instantly before the
// network call resolves. Since this endpoint is shared with another screen,
// caching here is purely additive/read-side and doesn't touch the API
// contract at all.
const DISK_CACHE_PREFIX = "@rental_details_cache_v1:";

export default function RentalDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { token } = useAuthStore();

  const [handover, setHandover] = useState(
    () => (id && detailsMemoryCache[id]) || null,
  );
  const [loading, setLoading] = useState(() => !(id && detailsMemoryCache[id]));
  const [refreshing, setRefreshing] = useState(false);

  // Bill Summary (Zomato-style expandable bill) — collapsed by default
  const [showBillSummary, setShowBillSummary] = useState(false);

  // Fullscreen Image Viewer States
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const hydrateThenFetch = async () => {
      // Already have it in memory (revisited this id this session) — paint
      // is already done via useState initializer above, just refresh quietly.
      if (detailsMemoryCache[id]) {
        fetchDetails({ silent: true });
        return;
      }

      // Nothing in memory — try disk before hitting the network, so a cold
      // app start opened straight into this booking still paints instantly.
      try {
        const cachedRaw = await AsyncStorage.getItem(DISK_CACHE_PREFIX + id);
        if (cachedRaw && !cancelled) {
          const parsed = JSON.parse(cachedRaw);
          detailsMemoryCache[id] = parsed;
          setHandover(parsed);
          setLoading(false);
        }
      } catch (e) {
        // Corrupt/missing disk cache — no big deal, network will fill in.
      }

      if (!cancelled) {
        fetchDetails({ silent: !!detailsMemoryCache[id] });
      }
    };

    hydrateThenFetch();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchDetails = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get(`/handover/single/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = res.data.data;
      setHandover(data);
      detailsMemoryCache[id] = data;
      AsyncStorage.setItem(DISK_CACHE_PREFIX + id, JSON.stringify(data)).catch(
        () => {},
      );
    } catch (error) {
      console.log("Error fetching handover details:", error);
      if (!silent && !handover) {
        // Only alert if we truly have nothing to show — a silent background
        // refresh failing shouldn't interrupt someone reading cached data.
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDetails({ silent: true });
    setRefreshing(false);
  };

  const openImageViewer = (images, index) => {
    if (!images || images.length === 0) return;

    setViewerImages(
      images.map((item) => ({
        url: item.image,
      })),
    );
    setViewerIndex(index);
    setViewerVisible(true);
  };

  const handleCall = (phone) => {
    if (!phone) return Alert.alert("Error", "Contact number unavailable.");
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert("Error", "Unable to trigger system native call pipeline."),
    );
  };

  // Custom helper to format date precisely as "9 july 2026, 17:19"
  const formatCustomDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";

    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];

    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${day} ${month} ${year}, ${hours}:${minutes}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderWrap}>
        <SkeletonDetails />
      </SafeAreaView>
    );
  }

  if (!handover) {
    return (
      <SafeAreaView style={styles.loaderWrap}>
        <Ionicons name="alert-circle-outline" size={48} color="#94A3B8" />
        <Text style={styles.errorText}>No booking records found.</Text>
        <TouchableOpacity style={styles.errorBtn} onPress={() => router.back()}>
          <Text style={styles.errorBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Bill values — sourced entirely from payment.billSummary, which the
  // backend now always populates (falling back to flat payment fields only
  // for pre-billSummary documents). Nothing here is recalculated.
  const bill = handover.payment?.billSummary || {};

  const subtotal =
    (bill.totalFare || 0) +
    (bill.pickupCharge || 0) +
    (bill.dropCharge || 0) +
    (bill.extraCharges || 0) +
    (bill.fastTagPayable || 0);

  const netPayable = Math.max(subtotal - (bill.discountAmount || 0), 0);

  const paymentMethodMeta =
    {
      cash: { icon: "cash", color: "#16A34A", label: "Cash" },
      phonepe: { icon: "cellphone", color: "#2563EB", label: "PhonePe" },
      razorpay: {
        icon: "credit-card-outline",
        color: "#3B82F6",
        label: "Razorpay",
      },
      mixed: { icon: "swap-horizontal", color: "#0F172A", label: "Mixed" },
    }[handover.payment?.paymentMethod] || null;

  // ── Extension Payments — sorted oldest to newest so the timeline reads
  // chronologically regardless of how the backend ordered them.
  const extensionBills = [...(handover.extensionBills || [])].sort(
    (a, b) => (a.billNumber || 0) - (b.billNumber || 0),
  );

  const totalExtensionAmount = extensionBills.reduce(
    (sum, b) => sum + (Number(b.extensionAmount) || 0),
    0,
  );

  const totalExtensionCollected = extensionBills.reduce(
    (sum, b) => sum + (Number(b.amountCollected) || 0),
    0,
  );

  // ── Vehicle Info — the populated vehicle document. Rendered defensively
  // since field names can vary by vehicle schema; anything missing just
  // shows "-" rather than breaking the screen.
  // handover.vehicle carries a denormalized snapshot taken AT HANDOVER TIME
  // (vehicleName/vehicleNumber/vehicleColor/handoverKm/spareAvailable/
  // toolkitAvailable) — these can differ from the vehicle's CURRENT master
  // data in handover.vehicle.vehicleId (e.g. if the vehicle was renamed
  // since). We show the handover-time snapshot first since that's what was
  // actually true for this booking, falling back to the populated master
  // record for anything the snapshot doesn't carry (model, category, etc).
  const vehicleSnapshot = handover.vehicle || {};
  const vehicleMaster = handover.vehicle?.vehicleId || {};

  const returnImages = handover.gallery?.returnImages || [];
  const returnDamageImages = handover.gallery?.damageImages || [];
  const handoverDamageImages = handover.gallery?.handoverDamageImages || [];
  const vehicleExchanges = handover.gallery?.vehicleExchanges || [];
  const inspection = handover.vehicleReturn?.inspection || [];
  const damageCostDetails = handover.vehicleReturn?.damageCostDetails;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#0F2554"]}
            tintColor="#0F2554"
          />
        }
      >
        {/* ── HERO HEADER WITH IMAGE OVERLAY ── */}
        <View style={styles.heroContainer}>
          <Image
            source={{
              uri:
                handover.images?.vehicleFront ||
                "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=600",
            }}
            style={styles.mainImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={[
              "rgba(10,22,40,0.7)",
              "transparent",
              "rgba(248,250,252,1)",
            ]}
            style={styles.imageOverlay}
          />

          {/* Floating Header Actions */}
          <View style={styles.floatingHeader}>
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={22} color="#0F2554" />
            </TouchableOpacity>
            <Text style={styles.floatingTitle}>Booking Detail</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        {/* ── CARD CONTENT ── */}
        <View style={styles.content}>
          {/* Customer Profile Card Header */}
          <View style={styles.customerProfileCard}>
            <View style={styles.customerMeta}>
              <Text style={styles.customerName}>
                {handover.customer?.fullName}
              </Text>
              <Text style={styles.phone}>
                {handover.customer?.mobileNumber}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.actionCallCircle}
              onPress={() => handleCall(handover.customer?.mobileNumber)}
            >
              <Ionicons name="call" size={20} color="white" />
            </TouchableOpacity>
          </View>

          {/* Vehicle Info Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="car-side"
                size={20}
                color="#0F2554"
              />
              <Text style={styles.sectionTitle}>Vehicle Info</Text>
            </View>

            <Info
              label="Vehicle Name"
              value={vehicleSnapshot.vehicleName || vehicleMaster.vehicleName}
            />
            <Info
              label="Registration Number"
              value={
                vehicleSnapshot.vehicleNumber || vehicleMaster.vehicleNumber
              }
              highlighted
            />
            {(vehicleSnapshot.vehicleColor || vehicleMaster.color) && (
              <Info
                label="Color"
                value={vehicleSnapshot.vehicleColor || vehicleMaster.color}
              />
            )}
            {(vehicleMaster.model || vehicleMaster.vehicleModel) && (
              <Info
                label="Model"
                value={vehicleMaster.model || vehicleMaster.vehicleModel}
              />
            )}
            {(vehicleMaster.category || vehicleMaster.vehicleType) && (
              <Info
                label="Category"
                value={vehicleMaster.category || vehicleMaster.vehicleType}
              />
            )}
            {(vehicleMaster.fuelType || vehicleMaster.fuel) && (
              <Info
                label="Fuel Type"
                value={vehicleMaster.fuelType || vehicleMaster.fuel}
              />
            )}
            {vehicleMaster.seatingCapacity && (
              <Info
                label="Seating Capacity"
                value={vehicleMaster.seatingCapacity}
              />
            )}
            {(vehicleMaster.transmission || vehicleMaster.transmissionType) && (
              <Info
                label="Transmission"
                value={
                  vehicleMaster.transmission || vehicleMaster.transmissionType
                }
              />
            )}
            <Info
              label="Odometer at Handover"
              value={
                vehicleSnapshot.handoverKm !== undefined
                  ? `${vehicleSnapshot.handoverKm} km`
                  : undefined
              }
            />
            <Info
              label="Spare Tyre Available"
              value={vehicleSnapshot.spareAvailable ? "Yes" : "No"}
              success={vehicleSnapshot.spareAvailable}
              danger={!vehicleSnapshot.spareAvailable}
            />
            <Info
              label="Toolkit Available"
              value={vehicleSnapshot.toolkitAvailable ? "Yes" : "No"}
              success={vehicleSnapshot.toolkitAvailable}
              danger={!vehicleSnapshot.toolkitAvailable}
            />
          </View>

          {/* Identity Details Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text" size={20} color="#0F2554" />
              <Text style={styles.sectionTitle}>Identity Details</Text>
            </View>

            <Info
              label="Aadhaar Number"
              value={handover.identity?.aadhaarNumber}
            />

            <Info
              label="Driving License"
              value={handover.identity?.drivingLicenseNumber}
            />
          </View>
          <Info
            label="Handover By"
            value={handover.createdBy?.fullName || "-"}
          />
          {/* Journey Scheduling Info */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="map-marker-distance"
                size={20}
                color="#0F2554"
              />
              <Text style={styles.sectionTitle}>Journey Scheduling</Text>
            </View>
            <Info
              label="Target Destination"
              value={handover.customer?.destination}
            />
            <Info label="Category Type" value={handover.trip?.tripType} />
            <Info
              label="Rental Terms Allocation"
              value={`${handover.trip?.numberOfDays || 0} Days`}
            />
            <Info
              label="Pickup Timestamp"
              value={formatCustomDate(handover.trip?.pickupDateTime)}
            />
            <Info
              label="Return Timeline"
              value={formatCustomDate(handover.trip?.dropDateTime)}
            />
          </View>

          {/* ── Bill Summary (Zomato-style expandable bill) ── */}
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.billSummaryHeaderRow}
              onPress={() => setShowBillSummary((prev) => !prev)}
              activeOpacity={0.7}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
              >
                <Ionicons name="wallet" size={20} color="#0F2554" />
                <View style={{ marginLeft: 8 }}>
                  <Text style={styles.sectionTitleInline}>Bill Summary</Text>
                  {!showBillSummary && (
                    <Text style={styles.billSummarySubtext}>
                      Tap to view full bill
                    </Text>
                  )}
                </View>
              </View>

              <Text style={styles.billSummaryHeaderAmount}>
                {money(netPayable)}
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
                <View style={styles.invoiceRow}>
                  <Text style={styles.invoiceLabel}>Vehicle / Trip Fare</Text>
                  <Text style={styles.invoiceValue}>
                    {money(bill.totalFare)}
                  </Text>
                </View>

                {bill.pickupCharge > 0 && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>Pickup Charge</Text>
                    <Text style={styles.invoiceValue}>
                      {money(bill.pickupCharge)}
                    </Text>
                  </View>
                )}

                {bill.dropCharge > 0 && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>Drop Charge</Text>
                    <Text style={styles.invoiceValue}>
                      {money(bill.dropCharge)}
                    </Text>
                  </View>
                )}

                {bill.extraCharges > 0 && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>Extra Charges</Text>
                    <Text style={styles.invoiceValue}>
                      {money(bill.extraCharges)}
                    </Text>
                  </View>
                )}

                {bill.fastTagPayable > 0 && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>FASTag Payable</Text>
                    <Text style={styles.invoiceValue}>
                      {money(bill.fastTagPayable)}
                    </Text>
                  </View>
                )}

                {totalExtensionAmount > 0 && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>
                      Extension Charges ({extensionBills.length})
                    </Text>
                    <Text style={styles.invoiceValue}>
                      {money(totalExtensionAmount)}
                    </Text>
                  </View>
                )}

                <View style={styles.invoiceDivider} />

                <View style={styles.invoiceRow}>
                  <Text style={styles.invoiceTotalLabel}>Subtotal</Text>
                  <Text style={styles.invoiceTotalValue}>
                    {money(subtotal)}
                  </Text>
                </View>

                {bill.discountAmount > 0 && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>Discount</Text>
                    <Text style={[styles.invoiceValue, { color: "#16A34A" }]}>
                      − {money(bill.discountAmount)}
                    </Text>
                  </View>
                )}

                <View style={styles.invoiceDivider} />

                <View style={styles.invoiceRow}>
                  <Text style={styles.invoiceGrandLabel}>
                    Final Payable Amount
                  </Text>
                  <Text style={styles.invoiceGrandValue}>
                    {money(netPayable)}
                  </Text>
                </View>

                {bill.bookingAmountPaid > 0 && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>
                      Advance / Booking Amount
                    </Text>
                    <Text style={[styles.invoiceValue, { color: "#16A34A" }]}>
                      − {money(bill.bookingAmountPaid)}
                    </Text>
                  </View>
                )}

                {bill.amountReceivedNow > 0 && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>
                      Received at Handover
                    </Text>
                    <Text style={[styles.invoiceValue, { color: "#16A34A" }]}>
                      − {money(bill.amountReceivedNow)}
                    </Text>
                  </View>
                )}

                {totalExtensionCollected > 0 && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>
                      Received via Extensions
                    </Text>
                    <Text style={[styles.invoiceValue, { color: "#16A34A" }]}>
                      − {money(totalExtensionCollected)}
                    </Text>
                  </View>
                )}

                <View style={styles.invoiceRow}>
                  <Text style={styles.invoiceBalanceLabel}>
                    {bill.balanceAmount > 0 ? "Balance Due" : "Fully Paid"}
                  </Text>
                  <Text
                    style={[
                      styles.invoiceBalanceValue,
                      {
                        color: bill.balanceAmount > 0 ? "#DC2626" : "#16A34A",
                      },
                    ]}
                  >
                    {money(bill.balanceAmount)}
                  </Text>
                </View>

                {bill.securityDeposit > 0 && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>
                      Security Deposit (refundable)
                    </Text>
                    <Text style={styles.invoiceValue}>
                      {money(bill.securityDeposit)}
                    </Text>
                  </View>
                )}

                {bill.totalCollected > 0 && (
                  <>
                    <View style={styles.invoiceDivider} />
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceTotalLabel}>
                        Total Collected
                      </Text>
                      <Text style={styles.invoiceTotalValue}>
                        {money(bill.totalCollected)}
                      </Text>
                    </View>
                  </>
                )}

                {paymentMethodMeta && (
                  <>
                    <View style={styles.invoiceDivider} />
                    <View style={styles.methodRow}>
                      <View
                        style={[
                          styles.methodIconCircle,
                          { backgroundColor: `${paymentMethodMeta.color}18` },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={paymentMethodMeta.icon}
                          size={16}
                          color={paymentMethodMeta.color}
                        />
                      </View>
                      <Text style={styles.methodRowText}>
                        Paid via {paymentMethodMeta.label}
                      </Text>
                    </View>

                    {handover.payment?.paymentBreakdown && (
                      <View style={styles.breakdownWrap}>
                        {handover.payment.paymentBreakdown.cash > 0 && (
                          <View style={styles.breakdownChip}>
                            <MaterialCommunityIcons
                              name="cash"
                              size={12}
                              color="#16A34A"
                            />
                            <Text style={styles.breakdownChipText}>
                              Cash{" "}
                              {money(handover.payment.paymentBreakdown.cash)}
                            </Text>
                          </View>
                        )}
                        {handover.payment.paymentBreakdown.phonePe > 0 && (
                          <View style={styles.breakdownChip}>
                            <MaterialCommunityIcons
                              name="cellphone"
                              size={12}
                              color="#2563EB"
                            />
                            <Text style={styles.breakdownChipText}>
                              PhonePe{" "}
                              {money(handover.payment.paymentBreakdown.phonePe)}
                            </Text>
                          </View>
                        )}
                        {handover.payment.paymentBreakdown.razorpay > 0 && (
                          <View style={styles.breakdownChip}>
                            <MaterialCommunityIcons
                              name="credit-card-outline"
                              size={12}
                              color="#3B82F6"
                            />
                            <Text style={styles.breakdownChipText}>
                              Razorpay{" "}
                              {money(
                                handover.payment.paymentBreakdown.razorpay,
                              )}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
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

          {/* ── Extension Payments — history of trip extensions/shortenings ── */}
          {extensionBills.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons
                  name="calendar-plus"
                  size={20}
                  color="#0F2554"
                />
                <Text style={styles.sectionTitle}>Extension Payments</Text>
              </View>

              {extensionBills.map((extBill, index) => {
                const isLast = index === extensionBills.length - 1;
                const isExtended = (extBill.extraDays || 0) > 0;
                const isShortened = (extBill.extraDays || 0) < 0;

                return (
                  <View
                    key={extBill._id || index}
                    style={[
                      styles.extensionBillCard,
                      !isLast && styles.extensionBillDivider,
                    ]}
                  >
                    <View style={styles.extensionBillHeaderRow}>
                      <View style={styles.extensionBillNumberBadge}>
                        <Text style={styles.extensionBillNumberText}>
                          Bill #{extBill.billNumber}
                        </Text>
                      </View>
                      <Text style={styles.extensionBillDate}>
                        {formatCustomDate(extBill.createdAt)}
                      </Text>
                    </View>

                    {extBill.createdBy?.fullName && (
                      <Info
                        label="Extended By"
                        value={extBill.createdBy.fullName}
                      />
                    )}

                    <Info
                      label="Days Changed"
                      value={`${isExtended ? "+" : ""}${extBill.extraDays} day${
                        Math.abs(extBill.extraDays) === 1 ? "" : "s"
                      }`}
                      success={isExtended}
                      danger={isShortened}
                    />

                    <Info
                      label="Previous Return"
                      value={formatCustomDate(extBill.previousDropDateTime)}
                    />

                    <Info
                      label="New Return"
                      value={formatCustomDate(extBill.newDropDateTime)}
                    />

                    <Info
                      label="Rental Days"
                      value={`${extBill.previousNumberOfDays} → ${extBill.newNumberOfDays}`}
                    />

                    <Info
                      label="Extension Amount"
                      value={money(extBill.extensionAmount)}
                    />

                    <Info
                      label="Amount Collected"
                      value={money(extBill.amountCollected)}
                      success
                    />

                    <Info
                      label="Fare After This Bill"
                      value={money(extBill.totalFareAfterThisBill)}
                    />

                    {extBill.reason ? (
                      <Info label="Reason" value={extBill.reason} />
                    ) : null}
                  </View>
                );
              })}

              {extensionBills.length > 1 && (
                <>
                  <View style={styles.invoiceDivider} />
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceTotalLabel}>
                      Total Extension Amount
                    </Text>
                    <Text style={styles.invoiceTotalValue}>
                      {money(totalExtensionAmount)}
                    </Text>
                  </View>
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceTotalLabel}>
                      Total Collected (Extensions)
                    </Text>
                    <Text style={styles.invoiceTotalValue}>
                      {money(totalExtensionCollected)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}
          {/* Additional Info — fields not already covered in Bill Summary */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="card" size={20} color="#0F2554" />
              <Text style={styles.sectionTitle}>Additional Info</Text>
            </View>

            <Info
              label="Fuel Level"
              value={`${handover.payment?.fuelLevel ?? 0}/7`}
            />

            <Info
              label="FASTag Balance"
              value={money(handover.payment?.fastTagBalance)}
            />

            <Info
              label="Payment Status"
              value={handover.payment?.paymentStatus}
            />
          </View>

          {/* Vehicle Return Card (Conditionally Rendered) */}
          {handover.vehicleReturn && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="checkmark-done" size={20} color="#16A34A" />
                <Text style={styles.sectionTitle}>Vehicle Return</Text>
              </View>

              <Info
                label="Received By"
                value={handover.vehicleReturn?.receivedBy?.fullName}
              />

              <Info
                label="Time Status"
                value={handover.vehicleReturn?.timeStatus}
              />

              {handover.vehicleReturn?.delayText && (
                <Info
                  label="Delay"
                  value={handover.vehicleReturn.delayText}
                  danger={(handover.vehicleReturn.delayInMinutes || 0) > 0}
                />
              )}

              <Info
                label="Fuel Level"
                value={`${handover.vehicleReturn?.fuelLevel || 0}/7`}
              />

              <Info
                label="Return KM"
                value={`${handover.vehicleReturn?.kilometersAtReturn || 0}`}
              />

              <Info
                label="Amount Collected"
                value={`₹${handover.vehicleReturn?.settlementDetails?.amountCollected || 0}`}
                success
              />

              <Info
                label="Final Balance"
                value={`₹${handover.vehicleReturn?.settlementDetails?.finalBalance || 0}`}
                danger
              />

              <Info
                label="Settlement Status"
                value={handover.vehicleReturn?.settlementDetails?.status}
              />

              <Info
                label="Has Damage"
                value={handover.vehicleReturn?.hasDamage ? "Yes" : "No"}
                danger={handover.vehicleReturn?.hasDamage}
                success={!handover.vehicleReturn?.hasDamage}
              />
            </View>
          )}

          {/* Damage Details — only shown when the return flagged damage */}
          {handover.vehicleReturn?.hasDamage && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons
                  name="alert-decagram"
                  size={20}
                  color="#DC2626"
                />
                <Text style={[styles.sectionTitle, { color: "#DC2626" }]}>
                  Damage Details
                </Text>
              </View>

              {handover.vehicleReturn.damageNotes ? (
                <Info
                  label="Notes"
                  value={handover.vehicleReturn.damageNotes}
                />
              ) : null}

              {/* Rendered generically since exact damage-cost fields can vary
                  by vehicle/damage type — every key/value the backend sends
                  is shown rather than hardcoding a fixed set of fields. */}
              {damageCostDetails &&
                Object.entries(damageCostDetails).map(([key, value]) => {
                  if (value === null || value === undefined || value === "")
                    return null;
                  const label = key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (s) => s.toUpperCase());
                  const isMoneyField = /cost|amount|charge/i.test(key);
                  return (
                    <Info
                      key={key}
                      label={label}
                      value={
                        isMoneyField && typeof value === "number"
                          ? money(value)
                          : String(value)
                      }
                      danger
                    />
                  );
                })}
            </View>
          )}

          {/* Inspection Checklist — only shown if the backend sent items */}
          {inspection.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="clipboard" size={20} color="#0F2554" />
                <Text style={styles.sectionTitle}>Inspection Checklist</Text>
              </View>
              {inspection.map((item, idx) => {
                const label =
                  item.label || item.part || item.name || `Item ${idx + 1}`;
                const status =
                  item.status || (item.ok === false ? "Issue" : "OK");
                const isIssue = /issue|damage|fail/i.test(String(status));
                return (
                  <Info
                    key={idx}
                    label={label}
                    value={status}
                    danger={isIssue}
                    success={!isIssue}
                  />
                );
              })}
            </View>
          )}

          {/* Handover Gallery Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="images" size={20} color="#0F2554" />
              <Text style={styles.sectionTitle}>Handover Images</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {handover.gallery?.handover?.map((item, index) => (
                <View key={index} style={styles.galleryContainer}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() =>
                      openImageViewer(handover.gallery.handover, index)
                    }
                  >
                    <Image
                      source={{ uri: item.image }}
                      style={styles.galleryImage}
                    />
                    <View style={styles.zoomHintBadge}>
                      <Ionicons name="expand-outline" size={12} color="white" />
                    </View>
                  </TouchableOpacity>
                  <View style={styles.galleryLabelBadge}>
                    <Text style={styles.galleryBadgeText}>{item.label}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Return Images Gallery — shown whenever the vehicle has been
              returned; previously computed by the backend but never
              rendered here. */}
          {returnImages.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="return-down-back" size={20} color="#0F2554" />
                <Text style={styles.sectionTitle}>Return Images</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {returnImages.map((item, index) => (
                  <View key={index} style={styles.galleryContainer}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => openImageViewer(returnImages, index)}
                    >
                      <Image
                        source={{ uri: item.image }}
                        style={styles.galleryImage}
                      />
                      <View style={styles.zoomHintBadge}>
                        <Ionicons
                          name="expand-outline"
                          size={12}
                          color="white"
                        />
                      </View>
                    </TouchableOpacity>
                    <View style={styles.galleryLabelBadge}>
                      <Text style={styles.galleryBadgeText}>{item.label}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Return Damage Images Gallery — damage noted when the vehicle
              came BACK (from the VehicleReturn record). */}
          {returnDamageImages.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons
                  name="alert-octagon-outline"
                  size={20}
                  color="#DC2626"
                />
                <Text style={[styles.sectionTitle, { color: "#DC2626" }]}>
                  Return Damage Images
                </Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {returnDamageImages.map((item, index) => (
                  <View key={index} style={styles.galleryContainer}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => openImageViewer(returnDamageImages, index)}
                    >
                      <Image
                        source={{ uri: item.image }}
                        style={[styles.galleryImage, styles.damageImage]}
                      />
                      <View style={styles.zoomHintBadge}>
                        <Ionicons
                          name="expand-outline"
                          size={12}
                          color="white"
                        />
                      </View>
                    </TouchableOpacity>
                    <View
                      style={[
                        styles.galleryLabelBadge,
                        { backgroundColor: "rgba(220, 38, 38, 0.85)" },
                      ]}
                    >
                      <Text style={styles.galleryBadgeText}>{item.label}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Pre-existing Damage Images — damage noted AT HANDOVER TIME,
              before the customer took the vehicle out. Comes from
              handover.images.damageImages on the model, which was never
              rendered before. Kept visually distinct from return damage
              (amber vs red) since they mean different things. */}
          {handoverDamageImages.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons
                  name="alert-outline"
                  size={20}
                  color="#B45309"
                />
                <Text style={[styles.sectionTitle, { color: "#B45309" }]}>
                  Pre-existing Damage (at Handover)
                </Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {handoverDamageImages.map((item, index) => (
                  <View key={index} style={styles.galleryContainer}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() =>
                        openImageViewer(handoverDamageImages, index)
                      }
                    >
                      <Image
                        source={{ uri: item.image }}
                        style={[styles.galleryImage, styles.preDamageImage]}
                      />
                      <View style={styles.zoomHintBadge}>
                        <Ionicons
                          name="expand-outline"
                          size={12}
                          color="white"
                        />
                      </View>
                    </TouchableOpacity>
                    <View
                      style={[
                        styles.galleryLabelBadge,
                        { backgroundColor: "rgba(180, 83, 9, 0.85)" },
                      ]}
                    >
                      <Text style={styles.galleryBadgeText}>{item.label}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Vehicle Exchange History — every time the assigned vehicle was
              swapped mid-rental, with its own photo set. None of this was
              shown before even though the backend already stored it. */}
          {vehicleExchanges.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons
                  name="swap-horizontal-bold"
                  size={20}
                  color="#0F2554"
                />
                <Text style={styles.sectionTitle}>
                  Vehicle Exchange History
                </Text>
              </View>

              {vehicleExchanges.map((exchange, idx) => (
                <View
                  key={exchange.index ?? idx}
                  style={[
                    styles.extensionBillCard,
                    idx !== vehicleExchanges.length - 1 &&
                      styles.extensionBillDivider,
                  ]}
                >
                  <View style={styles.extensionBillHeaderRow}>
                    <View style={styles.extensionBillNumberBadge}>
                      <Text style={styles.extensionBillNumberText}>
                        Exchange #{idx + 1}
                      </Text>
                    </View>
                    <Text style={styles.extensionBillDate}>
                      {formatCustomDate(exchange.changedAt)}
                    </Text>
                  </View>

                  <Info
                    label="Old Vehicle"
                    value={`${exchange.oldVehicle?.vehicleName || "-"} (${
                      exchange.oldVehicle?.vehicleNumber || "-"
                    })`}
                  />
                  <Info
                    label="New Vehicle"
                    value={`${exchange.newVehicle?.vehicleName || "-"} (${
                      exchange.newVehicle?.vehicleNumber || "-"
                    })`}
                    success
                  />
                  {exchange.changedBy?.fullName && (
                    <Info
                      label="Changed By"
                      value={exchange.changedBy.fullName}
                    />
                  )}
                  {exchange.reason ? (
                    <Info label="Reason" value={exchange.reason} />
                  ) : null}

                  {exchange.images?.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginTop: 8 }}
                    >
                      {exchange.images.map((item, imgIdx) => (
                        <View key={imgIdx} style={styles.galleryContainer}>
                          <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() =>
                              openImageViewer(exchange.images, imgIdx)
                            }
                          >
                            <Image
                              source={{ uri: item.image }}
                              style={styles.galleryImage}
                            />
                            <View style={styles.zoomHintBadge}>
                              <Ionicons
                                name="expand-outline"
                                size={12}
                                color="white"
                              />
                            </View>
                          </TouchableOpacity>
                          <View style={styles.galleryLabelBadge}>
                            <Text style={styles.galleryBadgeText}>
                              {item.label}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Fullscreen Viewer Modal — pinch-to-zoom, swipe-down-to-dismiss,
          swipe left/right between images, page indicator. Reused for every
          gallery on this screen (handover / return / damage). */}
      <Modal
        visible={viewerVisible}
        transparent={true}
        onRequestClose={() => setViewerVisible(false)}
      >
        <ImageViewer
          imageUrls={viewerImages}
          index={viewerIndex}
          enableSwipeDown
          saveToLocalByLongPress={false}
          backgroundColor="rgba(0,0,0,0.95)"
          onSwipeDown={() => setViewerVisible(false)}
          onCancel={() => setViewerVisible(false)}
          renderIndicator={(currentIndex, allSize) =>
            allSize > 1 ? (
              <View style={styles.viewerIndicator}>
                <Text style={styles.viewerIndicatorText}>
                  {currentIndex} / {allSize}
                </Text>
              </View>
            ) : null
          }
          renderHeader={() => (
            <TouchableOpacity
              style={{
                position: "absolute",
                top: 50,
                right: 20,
                zIndex: 999,
              }}
              onPress={() => setViewerVisible(false)}
            >
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>
          )}
        />
      </Modal>
    </SafeAreaView>
  );
}

const Info = ({ label, value, highlighted, success, danger }) => {
  let valueStyle = styles.infoValue;
  if (highlighted) valueStyle = [styles.infoValue, styles.badgeValue];
  if (success) valueStyle = [styles.infoValue, { color: "#16A34A" }];
  if (danger) valueStyle = [styles.infoValue, { color: "#DC2626" }];

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={valueStyle} numberOfLines={1}>
        {value !== undefined && value !== null && value !== ""
          ? String(value)
          : "-"}
      </Text>
    </View>
  );
};

// Simple pulsing skeleton shown only on a true first-ever load (no memory
// or disk cache yet available) — keeps the screen feeling instant instead
// of a blank spinner.
function SkeletonDetails() {
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={{ opacity: pulse, width: "100%", padding: 20 }}>
      <View style={styles.skeletonHero} />
      <View
        style={[
          styles.skeletonBlock,
          { width: "70%", height: 20, marginTop: 20 },
        ]}
      />
      <View
        style={[
          styles.skeletonBlock,
          { width: "40%", height: 14, marginTop: 10 },
        ]}
      />
      <View
        style={[
          styles.skeletonBlock,
          { width: "100%", height: 100, marginTop: 20 },
        ]}
      />
      <View
        style={[
          styles.skeletonBlock,
          { width: "100%", height: 100, marginTop: 14 },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
  },
  errorText: {
    fontSize: 16,
    color: "#64748B",
    fontWeight: "700",
    marginTop: 12,
  },
  errorBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: "#0F2554",
    borderRadius: 12,
  },
  errorBtnText: {
    color: "white",
    fontWeight: "700",
  },
  heroContainer: {
    height: 280,
    position: "relative",
  },
  mainImage: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingHeader: {
    position: "absolute",
    top: Platform.OS === "android" ? 50 : 20,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  floatingTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "white",
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  content: {
    paddingHorizontal: 16,
    marginTop: -30,
  },
  customerProfileCard: {
    backgroundColor: "white",
    padding: 18,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    elevation: 4,
    shadowColor: "#0F2554",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  customerMeta: {
    flex: 1,
  },
  customerName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  phone: {
    color: "#64748B",
    fontWeight: "600",
    marginTop: 4,
  },
  actionCallCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },
  card: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F2554",
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  infoLabel: {
    color: "#64748B",
    fontWeight: "600",
    fontSize: 13,
  },
  infoValue: {
    color: "#0F172A",
    fontWeight: "700",
    maxWidth: "60%",
    fontSize: 13,
  },
  badgeValue: {
    backgroundColor: "#EFF6FF",
    color: "#2563EB",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  galleryContainer: {
    position: "relative",
    marginRight: 10,
  },
  galleryImage: {
    width: 130,
    height: 90,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },
  damageImage: {
    borderWidth: 2,
    borderColor: "#FCA5A5",
  },
  preDamageImage: {
    borderWidth: 2,
    borderColor: "#FCD34D",
  },
  zoomHintBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    borderRadius: 10,
    padding: 4,
  },
  galleryLabelBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  galleryBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "700",
  },
  viewerIndicator: {
    position: "absolute",
    top: 50,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  viewerIndicatorText: {
    color: "white",
    fontWeight: "700",
    fontSize: 12,
  },
  skeletonHero: {
    width: "100%",
    height: 180,
    borderRadius: 20,
    backgroundColor: "#E2E8F0",
  },
  skeletonBlock: {
    backgroundColor: "#E2E8F0",
    borderRadius: 8,
  },

  // ── Bill Summary (Zomato-style) ──
  billSummaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTitleInline: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F2554",
    letterSpacing: 0.3,
  },
  billSummarySubtext: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  billSummaryHeaderAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#16A34A",
  },
  invoiceBox: {
    marginTop: 12,
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
    color: "#64748B",
  },
  invoiceValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
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
  },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
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
    color: "#0F172A",
  },
  breakdownWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  breakdownChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  breakdownChipText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#0F172A",
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

  // ── Extension Payments ──
  extensionBillCard: {
    paddingVertical: 10,
  },
  extensionBillDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    marginBottom: 8,
  },
  extensionBillHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  extensionBillNumberBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  extensionBillNumberText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#2563EB",
  },
  extensionBillDate: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
  },
});
