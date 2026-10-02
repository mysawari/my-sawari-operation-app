import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
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

const currency = (amount = 0) =>
  `₹${Number(amount || 0).toLocaleString("en-IN")}`;

// ---------------------------------------------------------------------------
// Bill Summary Card — driven entirely by handover.payment.billSummary
// ---------------------------------------------------------------------------
const BillLineRow = ({ label, value, bold, color }) => (
  <View style={billStyles.row}>
    <Text style={[billStyles.label, bold && billStyles.labelBold]}>
      {label}
    </Text>
    <Text
      style={[
        billStyles.value,
        bold && billStyles.valueBold,
        color && { color },
      ]}
    >
      {value}
    </Text>
  </View>
);

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

  // "Total Rental Amount" = sum of the raw charge line items,
  // shown before any advance/discount is applied.
  const totalRentalAmount =
    totalFare + pickupCharge + dropCharge + fastTagPayable + extraCharges;

  const collectedToday = totalCollected || amountReceivedNow;

  return (
    <View style={billStyles.card}>
      <TouchableOpacity
        style={billStyles.headerRow}
        activeOpacity={0.7}
        onPress={() => setExpanded((prev) => !prev)}
      >
        <Text style={billStyles.headerTitle}>Bill Summary</Text>
        <View style={billStyles.headerRight}>
          <Text style={billStyles.headerAmount}>
            {currency(totalAmount || totalRentalAmount)}
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color="#64748B"
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <>
          <View style={billStyles.divider} />

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
          {securityDeposit > 0 && (
            <BillLineRow
              label="Security Deposit"
              value={currency(securityDeposit)}
            />
          )}
          {extraCharges > 0 && (
            <BillLineRow label="Extra Charges" value={currency(extraCharges)} />
          )}

          <View style={billStyles.dashedDivider} />

          <BillLineRow
            label="Total Rental Amount"
            value={currency(totalRentalAmount)}
            bold
          />

          <View style={billStyles.dashedDivider} />

          <BillLineRow
            label="Final Payable Amount"
            value={currency(totalAmount || totalRentalAmount)}
            bold
            color="#16A34A"
          />

          {bookingAmountPaid > 0 && (
            <BillLineRow
              label="Advance Paid"
              value={`- ${currency(bookingAmountPaid)}`}
              color="#16A34A"
            />
          )}

          {discountAmount > 0 && (
            <BillLineRow
              label="Discount"
              value={`- ${currency(discountAmount)}`}
              color="#16A34A"
            />
          )}

          <BillLineRow
            label="Balance Due"
            value={currency(balanceAmount)}
            bold
            color="#C2410C"
          />

          <View style={billStyles.dashedDivider} />

          <BillLineRow
            label="Total Collected Today"
            value={currency(collectedToday)}
            bold
          />
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
          color="#2563EB"
        />
        <Text style={billStyles.toggleLinkText}>
          {expanded ? "Close bill" : "View bill"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default function HandoverDetailsScreen() {
  const router = useRouter();
  const { handoverId } = useLocalSearchParams();
  const { token } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [handoverData, setHandoverData] = useState(null);

  // Fullscreen Image Viewer States
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    if (handoverId && token) {
      fetchHandoverDetails();
    }
  }, [handoverId, token]);

  const fetchHandoverDetails = async () => {
    try {
      setLoading(true);

      const res = await api.get(`/handover/single/${handoverId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setHandoverData(res.data.data);
    } catch (error) {
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to fetch handover details",
      );
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const vehicle = handoverData?.vehicle?.vehicleId || handoverData?.vehicle;
  const customer = handoverData?.customer;
  const identity = handoverData?.identity;
  const trip = handoverData?.trip;
  const payment = handoverData?.payment;
  const images = handoverData?.images;

  // Single source of truth for every money figure on this screen.
  const billSummary = payment?.billSummary || null;

  const pendingAmount = Number(billSummary?.balanceAmount || 0);
  const amountReceived = Number(
    billSummary?.totalCollected ||
      (billSummary?.bookingAmountPaid || 0) +
        (billSummary?.amountReceivedNow || 0) ||
      0,
  );

  const getStatusBadgeStyles = () => {
    if (pendingAmount <= 0) {
      return {
        text: "Paid",
        bg: "#DCFCE7",
        txt: "#16A34A",
      };
    }

    if (amountReceived > 0) {
      return {
        text: "Partially Paid",
        bg: "#FEF3C7",
        txt: "#D97706",
      };
    }

    return {
      text: "Pending",
      bg: "#FEE2E2",
      txt: "#DC2626",
    };
  };

  const statusStyle = getStatusBadgeStyles();

  // Explicitly mapping out all possible validation assets
  const photos = [
    {
      id: 1,
      title: "Front Photo",
      uri: images?.customerPhoto,
    },
    {
      id: 2,
      title: "Customer Profile",
      uri: images?.customerProfileImage,
    },
    {
      id: 3,
      title: "Customer With Vehicle",
      uri: images?.customerWithVehicle,
    },
    {
      id: 4,
      title: "ID Front",
      uri: images?.idCardFront,
    },
    {
      id: 5,
      title: "ID Back",
      uri: images?.idCardBack,
    },
    {
      id: 6,
      title: "Vehicle Front",
      uri: images?.vehicleFront,
    },
    {
      id: 7,
      title: "Vehicle Rear",
      uri: images?.vehicleRear,
    },
    {
      id: 8,
      title: "Vehicle Left",
      uri: images?.vehicleLeft,
    },
    {
      id: 9,
      title: "Vehicle Right",
      uri: images?.vehicleRight,
    },
    {
      id: 10,
      title: "DL Front",
      uri: images?.drivingLicenseFront,
    },
    {
      id: 11,
      title: "DL Back",
      uri: images?.drivingLicenseBack,
    },
    {
      id: 12,
      title: "Toolkit",
      uri: images?.toolkit,
    },
    {
      id: 13,
      title: "Spare Tyre",
      uri: images?.spareTyre,
    },
    {
      id: 14,
      title: "Odometer",
      uri: images?.odometer,
    },
    {
      id: 15,
      title: "Fuel Gauge",
      uri: images?.fuelGauge,
    },
    {
      id: 16,
      title: "Interior",
      uri: images?.interior,
    },
    {
      id: 17,
      title: "Roof Top",
      uri: images?.roofTop,
    },
    ...(Array.isArray(images?.damageImages)
      ? images.damageImages.map((uri, i) => ({
          id: `damage-${i}`,
          title: `Damage ${i + 1}`,
          uri,
        }))
      : []),
  ].filter((item) => item.uri);

  const openImageViewer = (targetPhotos, index) => {
    if (!targetPhotos || targetPhotos.length === 0) return;

    setViewerImages(
      targetPhotos.map((item) => ({
        url: item.uri,
      })),
    );
    setViewerIndex(index);
    setViewerVisible(true);
  };

  const DataRowItem = ({
    icon,
    label,
    value,
    valueColor = "#0F172A",
    isLast = false,
  }) => (
    <View style={[styles.dataItemRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={styles.miniIconWrapper}>
        <Ionicons name={icon} size={15} color="#2563EB" />
      </View>

      <View style={styles.dataTextContent}>
        <Text style={styles.dataItemLabel}>{label}</Text>
        <Text style={[styles.dataItemValue, { color: valueColor }]}>
          {value || "-"}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.loaderContainer]}>
        <ActivityIndicator size="large" color="#001B45" />
        <Text style={styles.loaderText}>Loading handover details...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#001B45" barStyle="light-content" />

      <LinearGradient colors={["#001B45", "#002B6B"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.sideBtn}>
          <Ionicons name="chevron-back" size={26} color="white" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Handover Details</Text>

        <View style={styles.sideBtn} />
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Main Vehicle Card Preview */}
        <View style={styles.heroCard}>
          <Image
            source={{
              uri: (() => {
                const url = vehicle?.images?.[0]?.url;
                if (!url || typeof url !== 'string') return "https://via.placeholder.com/400";
                if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
                  if (!url.includes('q_auto') && !url.includes('w_')) {
                    return url.replace('/upload/', '/upload/q_auto,f_auto,w_500,c_limit/');
                  }
                }
                return url;
              })(),
            }}
            style={styles.vehicleImage}
          />

          <View style={styles.heroDetails}>
            <View style={styles.heroTopMetaRow}>
              <Text style={styles.vehicleTitle}>
                {vehicle?.vehicleName || "Unknown Vehicle"}
              </Text>

              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusStyle.bg },
                ]}
              >
                <Text
                  style={[styles.statusBadgeText, { color: statusStyle.txt }]}
                >
                  {statusStyle.text}
                </Text>
              </View>
            </View>

            <View style={styles.badgeAndSpecsRow}>
              <View style={styles.vehicleTag}>
                <Text style={styles.vehicleTagText}>
                  {vehicle?.vehicleNumber || "-"}
                </Text>
              </View>

              <Text style={styles.vehicleSubText}>
                {vehicle?.vehicleColor || "-"} • {vehicle?.vehicleType || "-"} •{" "}
                {vehicle?.seatingCapacity || "-"} Seater
              </Text>
            </View>
          </View>
        </View>

        {/* Customer & Identifiers Block */}
        <Text style={styles.sectionHeadingTitle}>
          Customer & Identification
        </Text>

        <View style={styles.dashboardBlockCard}>
          <View style={styles.twoColumnGridRow}>
            <View style={styles.gridColumnCell}>
              <DataRowItem
                icon="person-outline"
                label="Customer Name"
                value={customer?.fullName}
              />
            </View>

            <View style={styles.gridColumnCell}>
              <DataRowItem
                icon="call-outline"
                label="Mobile Number"
                value={customer?.mobileNumber}
              />
            </View>
          </View>

          <View style={styles.twoColumnGridRow}>
            <View style={styles.gridColumnCell}>
              <DataRowItem
                icon="card-outline"
                label="Aadhaar Number"
                value={identity?.aadhaarNumber}
              />
            </View>

            <View style={styles.gridColumnCell}>
              <DataRowItem
                icon="car-outline"
                label="Driving License"
                value={identity?.drivingLicenseNumber}
              />
            </View>
          </View>

          <View style={styles.twoColumnGridRow}>
            <View style={styles.gridColumnCell}>
              <DataRowItem
                icon="briefcase-outline"
                label="Occupation"
                value={customer?.occupation}
                isLast
              />
            </View>

            <View style={styles.gridColumnCell}>
              <DataRowItem
                icon="location-outline"
                label="Destination"
                value={customer?.destination}
                isLast
              />
            </View>
          </View>
        </View>

        {/* Timeline Block */}
        <Text style={styles.sectionHeadingTitle}>Trip Timeline</Text>

        <View style={styles.dashboardBlockCard}>
          <View style={styles.twoColumnGridRow}>
            <View style={styles.gridColumnCell}>
              <DataRowItem
                icon="calendar-outline"
                label="Pickup"
                value={
                  trip?.pickupDateTime
                    ? new Date(trip.pickupDateTime).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true, // Forces 12-hour format with AM/PM
                      })
                    : "-"
                }
                isLast
              />
            </View>

            <View style={styles.gridColumnCell}>
              <DataRowItem
                icon="time-outline"
                label="Expected Return"
                value={
                  trip?.dropDateTime
                    ? new Date(trip.dropDateTime).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true, // Forces 12-hour format with AM/PM
                      })
                    : "-"
                }
                isLast
              />
            </View>
          </View>
        </View>

        {/* Bill Summary (from handover.payment.billSummary) */}
        <Text style={styles.sectionHeadingTitle}>Financial Summary</Text>

        <BillSummaryCard billSummary={billSummary} />

        {/* Extra payment-mode / fastTag info that doesn't belong on the
            bill itself but is still useful context for the desk. */}
        <View style={[styles.dashboardBlockCard, { marginTop: -8 }]}>
          <View style={styles.twoColumnGridRow}>
            <View style={styles.gridColumnCell}>
              <DataRowItem
                icon="swap-horizontal-outline"
                label="Payment Mode"
                value={payment?.paymentMethod}
                isLast
              />
            </View>

            <View style={styles.gridColumnCell}>
              <DataRowItem
                icon="pricetag-outline"
                label="FastTag Balance"
                value={`₹${payment?.fastTagBalance || 0}`}
                isLast
              />
            </View>
          </View>
        </View>

        {handoverData?.notes ? (
          <>
            <Text style={styles.sectionHeadingTitle}>Notes</Text>
            <View style={styles.notesBoxCard}>
              <Text style={styles.notesTextParagraph}>
                {handoverData.notes}
              </Text>
            </View>
          </>
        ) : null}

        {/* Dynamic Verification Photos Display Section */}
        <Text style={styles.sectionHeadingTitle}>Verification Photos</Text>

        <View style={styles.photoGridContainer}>
          {photos.length > 0 ? (
            photos.map((photo, index) => (
              <View key={photo.id} style={styles.photoGridCellCard}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => openImageViewer(photos, index)}
                >
                  <Image
                    source={{ uri: photo.uri }}
                    style={styles.photoRenderElement}
                  />
                </TouchableOpacity>
                <View style={styles.photoTitleTextLabelContainer}>
                  <Text style={styles.photoTitleTextLabel}>{photo.title}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.noPhotosText}>
              No verification photos attached.
            </Text>
          )}
        </View>

        {/* Bottom Submission Action Trigger */}
        <TouchableOpacity
          style={styles.primaryActionButtonSubmit}
          activeOpacity={0.9}
          onPress={() =>
            router.push({
              pathname: "/components/receiveCar/detail",
              params: { handoverId },
            })
          }
        >
          <MaterialCommunityIcons
            name="car-key"
            size={20}
            color="white"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.primaryActionButtonSubmitText}>
            Proceed to Receive Car
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Fullscreen Shared Image Zoom Lightbox Portal */}
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
          onSwipeDown={() => setViewerVisible(false)}
          onCancel={() => setViewerVisible(false)}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loaderContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
  },
  header: {
    paddingTop: Platform.select({ ios: 54, android: 42 }),
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sideBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "white",
    fontSize: 18,
    fontWeight: "800",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  heroCard: {
    backgroundColor: "white",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  vehicleImage: {
    width: "100%",
    height: 160,
    backgroundColor: "#F1F5F9",
  },
  heroDetails: {
    padding: 16,
  },
  heroTopMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  vehicleTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontWeight: "700",
    fontSize: 11,
  },
  badgeAndSpecsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 10,
  },
  vehicleTag: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  vehicleTagText: {
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 11,
  },
  vehicleSubText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  sectionHeadingTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 6,
  },
  dashboardBlockCard: {
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  twoColumnGridRow: {
    flexDirection: "row",
  },
  gridColumnCell: {
    flex: 1,
  },
  dataItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  miniIconWrapper: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  dataTextContent: {
    flex: 1,
  },
  dataItemLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  dataItemValue: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  notesBoxCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  notesTextParagraph: {
    color: "#475569",
    lineHeight: 20,
    fontSize: 13,
    fontWeight: "500",
  },
  photoGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  photoGridCellCard: {
    width: "48.5%",
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 12,
  },
  photoRenderElement: {
    width: "100%",
    height: 110,
    backgroundColor: "#F1F5F9",
  },
  photoTitleTextLabelContainer: {
    padding: 8,
    backgroundColor: "white",
    alignItems: "center",
  },
  photoTitleTextLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
  },
  noPhotosText: {
    width: "100%",
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 13,
    fontStyle: "italic",
    paddingVertical: 12,
  },
  primaryActionButtonSubmit: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    marginTop: 8,
  },
  primaryActionButtonSubmitText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
});

// ---------------------------------------------------------------------------
// Bill Summary styles — mirrors the reference design (card, header amount +
// chevron, line items, dashed dividers, colored totals, collapse toggle)
// ---------------------------------------------------------------------------
const billStyles = StyleSheet.create({
  card: {
    backgroundColor: "white",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#16A34A",
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginBottom: 4,
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderBottomColor: "#E2E8F0",
    marginVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
  },
  label: {
    fontSize: 13.5,
    color: "#64748B",
  },
  labelBold: {
    color: "#0F172A",
    fontWeight: "700",
  },
  value: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "#0F172A",
  },
  valueBold: {
    fontSize: 15,
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
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
});
