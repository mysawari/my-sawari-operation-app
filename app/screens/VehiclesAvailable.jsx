import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width: SCREEN_W } = Dimensions.get("window");

/* ============================================================================
 * DESIGN TOKENS
 * ==========================================================================*/
const COLORS = {
  bg: "#F4F5F9",
  surface: "#FFFFFF",
  ink: "#151726",
  inkSoft: "#5B5E72",
  inkFaint: "#9497A8",
  border: "#E7E8F0",
  navy: "#12131C",
  navy2: "#20233A",
  gold: "#C9A24B",
  goldSoft: "#F3E7CC",
  success: "#1E9E63",
  successSoft: "#E4F7ED",
  warn: "#B8722A",
  warnSoft: "#FBEBD8",
  danger: "#D9483F",
};

const RADIUS = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 };

const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

const FONT = {
  h1: { fontSize: 24, fontWeight: "800", letterSpacing: 0.2 },
  h2: { fontSize: 17, fontWeight: "700" },
  body: { fontSize: 14.5, fontWeight: "500" },
  caption: { fontSize: 12.5, fontWeight: "600" },
  micro: { fontSize: 11, fontWeight: "700" },
};

/* ============================================================================
 * DATE UTILITIES  (kept dependency-free on purpose)
 * ==========================================================================*/
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const normalizeDate = (d) => {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const daysDiff = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000);

const isOverlapping = (aStart, aEnd, bStart, bEnd) =>
  aStart <= bEnd && bStart <= aEnd;

const formatShort = (d) => `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
const formatFull = (d) =>
  `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;

const formatRange = (from, to) => {
  if (isSameDay(from, to)) return formatShort(from);
  if (from.getMonth() === to.getMonth()) {
    return `${from.getDate()} - ${to.getDate()} ${MONTH_SHORT[to.getMonth()]}`;
  }
  return `${formatShort(from)} - ${formatShort(to)}`;
};

const TODAY = normalizeDate(new Date());

/* ============================================================================
 * MOCK FLEET DATA
 * `bookings` are date ranges the vehicle is already reserved for.
 * Swap this block for a real API response — the shape (id, name, type,
 * plate, seats, fuel, transmission, pricePerDay, bookings) is all the
 * matching engine below needs.
 * ==========================================================================*/
const VEHICLE_TYPES = {
  Sedan: { icon: "car", color: "#5B5FEF" },
  SUV: { icon: "car-estate", color: "#0EA5A4" },
  Van: { icon: "van-passenger", color: "#F59E0B" },
  Truck: { icon: "truck", color: "#D9483F" },
  Luxury: { icon: "car-sports", color: "#C9A24B" },
  Bike: { icon: "motorbike", color: "#8B5CF6" },
};

const MOCK_VEHICLES = [
  {
    id: "v1",
    name: "Toyota Camry",
    type: "Sedan",
    plate: "ABC 1234",
    seats: 5,
    fuel: "Petrol",
    transmission: "Auto",
    pricePerDay: 45,
    rating: 4.8,
    bookings: [],
  },
  {
    id: "v2",
    name: "Honda CR-V",
    type: "SUV",
    plate: "XYZ 5678",
    seats: 5,
    fuel: "Diesel",
    transmission: "Auto",
    pricePerDay: 62,
    rating: 4.6,
    bookings: [{ start: addDays(TODAY, 2), end: addDays(TODAY, 5) }],
  },
  {
    id: "v3",
    name: "Ford Transit",
    type: "Van",
    plate: "VAN 0012",
    seats: 12,
    fuel: "Diesel",
    transmission: "Manual",
    pricePerDay: 78,
    rating: 4.4,
    bookings: [{ start: addDays(TODAY, -1), end: addDays(TODAY, 1) }],
  },
  {
    id: "v4",
    name: "BMW 5 Series",
    type: "Luxury",
    plate: "LUX 7777",
    seats: 5,
    fuel: "Petrol",
    transmission: "Auto",
    pricePerDay: 130,
    rating: 4.9,
    bookings: [{ start: addDays(TODAY, 0), end: addDays(TODAY, 3) }],
  },
  {
    id: "v5",
    name: "Isuzu D-Max",
    type: "Truck",
    plate: "TRK 4444",
    seats: 3,
    fuel: "Diesel",
    transmission: "Manual",
    pricePerDay: 70,
    rating: 4.3,
    bookings: [],
  },
  {
    id: "v6",
    name: "Yamaha NMAX",
    type: "Bike",
    plate: "BIKE 0001",
    seats: 2,
    fuel: "Petrol",
    transmission: "Auto",
    pricePerDay: 18,
    rating: 4.5,
    bookings: [{ start: addDays(TODAY, 1), end: addDays(TODAY, 2) }],
  },
  {
    id: "v7",
    name: "Mercedes Sprinter",
    type: "Van",
    plate: "SPR 9999",
    seats: 15,
    fuel: "Diesel",
    transmission: "Auto",
    pricePerDay: 95,
    rating: 4.7,
    bookings: [{ start: addDays(TODAY, -6), end: addDays(TODAY, -2) }],
  },
  {
    id: "v8",
    name: "Kia Seltos",
    type: "SUV",
    plate: "SEL 3210",
    seats: 5,
    fuel: "Petrol",
    transmission: "Auto",
    pricePerDay: 58,
    rating: 4.5,
    bookings: [{ start: addDays(TODAY, 10), end: addDays(TODAY, 12) }],
  },
];

/* ============================================================================
 * MATCHING ENGINE
 * Returns one of:
 *   { status: 'exact',  matchFrom, matchTo }
 *   { status: 'near',   matchFrom, matchTo, diffDays }
 *   { status: 'none' }
 * ==========================================================================*/
const SEARCH_WINDOW_DAYS = 21;

function getAvailability(vehicle, fromDate, toDate) {
  const from = normalizeDate(fromDate);
  const to = normalizeDate(toDate);
  const duration = daysDiff(from, to);
  const bookings = vehicle.bookings.map((b) => ({
    start: normalizeDate(b.start),
    end: normalizeDate(b.end),
  }));

  const conflicts = (start, end) =>
    bookings.some((b) => isOverlapping(start, end, b.start, b.end));

  if (!conflicts(from, to)) {
    return { status: "exact", matchFrom: from, matchTo: to, diffDays: 0 };
  }

  for (let offset = 1; offset <= SEARCH_WINDOW_DAYS; offset += 1) {
    const afterFrom = addDays(from, offset);
    const afterTo = addDays(afterFrom, duration);
    if (!conflicts(afterFrom, afterTo)) {
      return {
        status: "near",
        matchFrom: afterFrom,
        matchTo: afterTo,
        diffDays: offset,
      };
    }

    const beforeFrom = addDays(from, -offset);
    if (beforeFrom >= TODAY) {
      const beforeTo = addDays(beforeFrom, duration);
      if (!conflicts(beforeFrom, beforeTo)) {
        return {
          status: "near",
          matchFrom: beforeFrom,
          matchTo: beforeTo,
          diffDays: offset,
        };
      }
    }
  }

  return { status: "none" };
}

/* ============================================================================
 * SMALL PRESENTATIONAL PIECES
 * ==========================================================================*/
function StatusBadge({ availability, fromDate }) {
  if (availability.status === "exact") {
    const label =
      isSameDay(fromDate, TODAY) && isSameDay(availability.matchFrom, TODAY)
        ? "Available Today"
        : "Available Now";
    return (
      <View style={[styles.badge, { backgroundColor: COLORS.successSoft }]}>
        <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
        <Text style={[styles.badgeText, { color: COLORS.success }]}>
          {label}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: COLORS.warnSoft }]}>
      <View style={[styles.dot, { backgroundColor: COLORS.warn }]} />
      <Text style={[styles.badgeText, { color: COLORS.warn }]}>
        In {availability.diffDays}d
      </Text>
    </View>
  );
}

function VehicleCard({ vehicle, fromDate, onSelect }) {
  const scale = useRef(new Animated.Value(1)).current;
  const typeMeta = VEHICLE_TYPES[vehicle.type] || VEHICLE_TYPES.Sedan;
  const { availability } = vehicle;

  const pressIn = () =>
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 40,
    }).start();
  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
    }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={() => onSelect(vehicle)}
        style={styles.card}
      >
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: `${typeMeta.color}1A` },
          ]}
        >
          <MaterialCommunityIcons
            name={typeMeta.icon}
            size={26}
            color={typeMeta.color}
          />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {vehicle.name}
            </Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={COLORS.gold} />
              <Text style={styles.ratingText}>{vehicle.rating}</Text>
            </View>
          </View>

          <Text style={styles.cardSubtitle}>
            {vehicle.type} &middot; {vehicle.plate}
          </Text>

          <View style={styles.specRow}>
            <View style={styles.specItem}>
              <Ionicons
                name="people-outline"
                size={13}
                color={COLORS.inkFaint}
              />
              <Text style={styles.specText}>{vehicle.seats}</Text>
            </View>
            <View style={styles.specItem}>
              <Ionicons
                name="speedometer-outline"
                size={13}
                color={COLORS.inkFaint}
              />
              <Text style={styles.specText}>{vehicle.transmission}</Text>
            </View>
            <View style={styles.specItem}>
              <Ionicons
                name="water-outline"
                size={13}
                color={COLORS.inkFaint}
              />
              <Text style={styles.specText}>{vehicle.fuel}</Text>
            </View>
          </View>

          <View style={styles.cardBottomRow}>
            <StatusBadge availability={availability} fromDate={fromDate} />
            {availability.status === "near" && (
              <Text style={styles.nearDateText}>
                from {formatShort(availability.matchFrom)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.priceText}>{vehicle.pricePerDay}</Text>
          <Text style={styles.priceUnit}>/ day</Text>
          <View style={styles.selectBtn}>
            <Ionicons name="chevron-forward" size={16} color={COLORS.navy} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function QuickChip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function DateField({ label, date, onPress, icon }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.dateField}
    >
      <View style={styles.dateFieldIcon}>
        <Ionicons name={icon} size={16} color={COLORS.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.dateFieldLabel}>{label}</Text>
        <Text style={styles.dateFieldValue}>{formatShort(date)}</Text>
      </View>
      <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.5)" />
    </TouchableOpacity>
  );
}

/* ============================================================================
 * MAIN SCREEN
 * ==========================================================================*/
export default function VehicleAvailabilityScreen() {
  const [fromDate, setFromDate] = useState(TODAY);
  const [toDate, setToDate] = useState(TODAY);
  const [activeChip, setActiveChip] = useState("today");
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // simulate a brief network round-trip whenever the requested range changes,
  // so the results transition feels intentional rather than instantaneous.
  useEffect(() => {
    setIsSearching(true);
    const t = setTimeout(() => setIsSearching(false), 380);
    return () => clearTimeout(t);
  }, [fromDate, toDate]);

  const applyRange = (from, to, chipKey) => {
    setFromDate(normalizeDate(from));
    setToDate(normalizeDate(to));
    setActiveChip(chipKey);
  };

  const handleFromChange = (event, selectedDate) => {
    if (Platform.OS !== "ios") setShowFromPicker(false);
    if (event.type === "dismissed" || !selectedDate) return;
    const nd = normalizeDate(selectedDate);
    setFromDate(nd);
    if (nd > toDate) setToDate(nd);
    setActiveChip(null);
  };

  const handleToChange = (event, selectedDate) => {
    if (Platform.OS !== "ios") setShowToPicker(false);
    if (event.type === "dismissed" || !selectedDate) return;
    setToDate(normalizeDate(selectedDate));
    setActiveChip(null);
  };

  const onSelectVehicle = (vehicle) => {
    Alert.alert(
      "Vehicle Selected",
      `${vehicle.name} (${vehicle.plate}) for ${formatRange(fromDate, toDate)}.`,
    );
  };

  const sections = useMemo(() => {
    const withAvailability = MOCK_VEHICLES.map((v) => ({
      ...v,
      availability: getAvailability(v, fromDate, toDate),
    }));

    const exact = withAvailability
      .filter((v) => v.availability.status === "exact")
      .sort((a, b) => a.name.localeCompare(b.name));

    const near = withAvailability
      .filter((v) => v.availability.status === "near")
      .sort((a, b) => a.availability.diffDays - b.availability.diffDays);

    const out = [];
    if (exact.length)
      out.push({
        key: "exact",
        title: "Perfect Match",
        subtitle: "Free for your full requested dates",
        data: exact,
        tint: COLORS.success,
      });
    if (near.length)
      out.push({
        key: "near",
        title: "Available Nearby",
        subtitle: "Closest open dates to your search",
        data: near,
        tint: COLORS.warn,
      });
    return out;
  }, [fromDate, toDate]);

  const totalCount = sections.reduce((n, s) => n + s.data.length, 0);
  const isDefaultToday = isSameDay(fromDate, TODAY) && isSameDay(toDate, TODAY);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.navy} />

      {/* ---------- HEADER ---------- */}
      <LinearGradient
        colors={[COLORS.navy, COLORS.navy2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Find an Available Vehicle</Text>
        <View style={styles.dateRow}>
          <DateField
            label="From"
            date={fromDate}
            icon="calendar-outline"
            onPress={() => setShowFromPicker(true)}
          />
          <View style={styles.dateDivider}>
            <Ionicons
              name="arrow-forward"
              size={14}
              color="rgba(255,255,255,0.4)"
            />
          </View>
          <DateField
            label="To"
            date={toDate}
            icon="calendar-outline"
            onPress={() => setShowToPicker(true)}
          />
        </View>

        <View style={styles.chipRow}>
          <QuickChip
            label="Today"
            active={activeChip === "today"}
            onPress={() => applyRange(TODAY, TODAY, "today")}
          />
          <QuickChip
            label="Tomorrow"
            active={activeChip === "tomorrow"}
            onPress={() =>
              applyRange(addDays(TODAY, 1), addDays(TODAY, 1), "tomorrow")
            }
          />
          <QuickChip
            label="This Weekend"
            active={activeChip === "weekend"}
            onPress={() => {
              const day = TODAY.getDay();
              const toSat = (6 - day + 7) % 7 || 7;
              const sat = addDays(TODAY, toSat);
              applyRange(sat, addDays(sat, 1), "weekend");
            }}
          />
        </View>
      </LinearGradient>

      {/* ---------- RESULTS SUMMARY BAR ---------- */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {isSearching
            ? "Searching fleet…"
            : `${totalCount} vehicle${totalCount === 1 ? "" : "s"} found`}
        </Text>
        <View style={styles.summaryDateChip}>
          <Ionicons
            name="calendar-clear-outline"
            size={12}
            color={COLORS.inkSoft}
          />
          <Text style={styles.summaryDateText}>
            {formatRange(fromDate, toDate)}
          </Text>
        </View>
      </View>

      {/* ---------- RESULTS ---------- */}
      {isSearching ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={COLORS.navy} />
          <Text style={styles.loadingText}>
            Checking today&apos;s bookings…
          </Text>
        </View>
      ) : totalCount === 0 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons
            name="car-off"
            size={40}
            color={COLORS.inkFaint}
          />
          <Text style={styles.emptyTitle}>No vehicles free nearby</Text>
          <Text style={styles.emptyBody}>
            Try widening your date range or check back later — the fleet updates
            as vehicles are returned.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <View
                  style={[styles.sectionBar, { backgroundColor: section.tint }]}
                />
                <View>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
                </View>
              </View>
              <View style={styles.sectionCount}>
                <Text style={styles.sectionCountText}>
                  {section.data.length}
                </Text>
              </View>
            </View>
          )}
          renderItem={({ item }) => (
            <VehicleCard
              vehicle={item}
              fromDate={fromDate}
              onSelect={onSelectVehicle}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: SPACE.md }} />}
          SectionSeparatorComponent={() => (
            <View style={{ height: SPACE.lg }} />
          )}
        />
      )}

      {/* ---------- DATE PICKERS ---------- */}
      <DatePickerModal
        visible={showFromPicker}
        value={fromDate}
        minimumDate={TODAY}
        onChange={handleFromChange}
        onClose={() => setShowFromPicker(false)}
        title="Select start date"
      />
      <DatePickerModal
        visible={showToPicker}
        value={toDate}
        minimumDate={fromDate}
        onChange={handleToChange}
        onClose={() => setShowToPicker(false)}
        title="Select end date"
      />
    </SafeAreaView>
  );
}

/* ============================================================================
 * DATE PICKER MODAL (cross-platform wrapper)
 * ==========================================================================*/
function DatePickerModal({
  visible,
  value,
  minimumDate,
  onChange,
  onClose,
  title,
}) {
  if (!visible) return null;

  if (Platform.OS === "android") {
    // Android shows its own native dialog; no custom modal chrome needed.
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        minimumDate={minimumDate}
        onChange={onChange}
      />
    );
  }

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <DateTimePicker
            value={value}
            mode="date"
            display="inline"
            minimumDate={minimumDate}
            onChange={onChange}
            themeVariant="light"
            accentColor={COLORS.gold}
            style={{ alignSelf: "stretch" }}
          />
          <TouchableOpacity
            style={styles.modalDoneBtn}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.modalDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ============================================================================
 * STYLES
 * ==========================================================================*/
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },

  /* Header */
  header: {
    paddingTop: SPACE.xl,
    paddingBottom: SPACE.xl,
    paddingHorizontal: SPACE.xl,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
  },
  eyebrow: {
    color: COLORS.gold,
    ...FONT.micro,
    letterSpacing: 1.6,
    marginBottom: SPACE.xs,
  },
  headerTitle: { color: "#FFFFFF", ...FONT.h1, marginBottom: 8, marginTop: 12 },
  headerSubtitle: {
    color: "rgba(255,255,255,0.62)",
    ...FONT.body,
    fontWeight: "500",
    marginBottom: SPACE.lg,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACE.md,
  },
  dateField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dateFieldIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(201,162,75,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACE.sm,
  },
  dateFieldLabel: {
    color: "rgba(255,255,255,0.5)",
    ...FONT.micro,
    marginBottom: 1,
  },
  dateFieldValue: { color: "#FFFFFF", ...FONT.h2, fontSize: 14.5 },
  dateDivider: { width: 26, alignItems: "center" },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  chipActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  chipText: { color: "rgba(255,255,255,0.75)", ...FONT.caption },
  chipTextActive: { color: COLORS.navy },

  /* Summary bar */
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.md,
  },
  summaryText: { color: COLORS.ink, ...FONT.h2, fontSize: 15 },
  summaryDateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  summaryDateText: {
    color: COLORS.inkSoft,
    ...FONT.caption,
    fontWeight: "600",
  },

  /* List */
  listContent: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xxl },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.bg,
    paddingVertical: SPACE.sm,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionBar: { width: 4, height: 30, borderRadius: 2 },
  sectionTitle: { color: COLORS.ink, ...FONT.h2 },
  sectionSubtitle: {
    color: COLORS.inkFaint,
    fontSize: 11.5,
    fontWeight: "500",
    marginTop: 1,
  },
  sectionCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCountText: { color: COLORS.ink, ...FONT.caption },

  /* Vehicle card */
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#12131C",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACE.md,
  },
  cardBody: { flex: 1 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    color: COLORS.ink,
    ...FONT.h2,
    fontSize: 15.5,
    flexShrink: 1,
    marginRight: 6,
  },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { color: COLORS.inkSoft, ...FONT.micro },
  cardSubtitle: {
    color: COLORS.inkFaint,
    ...FONT.caption,
    fontWeight: "500",
    marginTop: 2,
    marginBottom: 8,
  },

  specRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  specItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  specText: { color: COLORS.inkSoft, fontSize: 11.5, fontWeight: "600" },

  cardBottomRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  nearDateText: { color: COLORS.inkFaint, ...FONT.micro, fontWeight: "600" },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: RADIUS.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { ...FONT.micro },

  cardRight: { alignItems: "flex-end", marginLeft: SPACE.sm },
  priceText: { color: COLORS.ink, fontSize: 16, fontWeight: "800" },
  priceUnit: {
    color: COLORS.inkFaint,
    fontSize: 10.5,
    fontWeight: "600",
    marginBottom: 8,
  },
  selectBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Loading / empty */
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { color: COLORS.inkSoft, ...FONT.body },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyTitle: { color: COLORS.ink, ...FONT.h2, marginTop: 6 },
  emptyBody: {
    color: COLORS.inkFaint,
    ...FONT.body,
    textAlign: "center",
    lineHeight: 20,
  },

  /* Modal date picker (iOS) */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(18,19,28,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.xl,
    alignItems: "center",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SPACE.md,
  },
  modalTitle: {
    color: COLORS.ink,
    ...FONT.h2,
    marginBottom: SPACE.sm,
    alignSelf: "flex-start",
  },
  modalDoneBtn: {
    marginTop: SPACE.md,
    alignSelf: "stretch",
    backgroundColor: COLORS.navy,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalDoneText: { color: "#FFFFFF", ...FONT.h2, fontSize: 14.5 },
});
