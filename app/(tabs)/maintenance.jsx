import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  FlatList,
  Image,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../services/api";

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

const FILTERS = [
  "All",
  "Pending",
  "Ongoing",
  "Completed",
  "Major",
  "Minor",
  "This Month",
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

const PLACEHOLDER_VEHICLE_IMAGE =
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=400&q=80";

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

// --- REUSABLE SUB-COMPONENTS ---

const Header = React.memo(({ opacity }) => (
  <Animated.View style={[styles.headerContainer, { shadowOpacity: opacity }]}>
    <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
    <View style={styles.headerLeft}>
      <Text style={styles.headerSubtitle}>MY SAWARI FLEET</Text>
      <Text style={styles.headerTitle}>Vehicle Maintenance</Text>
    </View>
  </Animated.View>
));

const FilterChip = React.memo(({ label, isSelected, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    style={[styles.filterChip, isSelected && styles.filterChipActive]}
  >
    <Text
      style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}
    >
      {label}
    </Text>
  </TouchableOpacity>
));

const MaintenanceCard = React.memo(({ item, onPress }) => {
  const isMajor = item.maintenanceType === "Major";
  const isCompleted = item.status === "Completed";

  // Badge Status Styles - matches schema enum: Scheduled, In Progress, Completed, Cancelled
  const getStatusStyle = () => {
    switch (item.status) {
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

  const statusStyle = getStatusStyle();

  // "Pending" label in UI maps to "Scheduled" in DB; "Ongoing" maps to "In Progress"
  const statusLabel =
    item.status === "Scheduled"
      ? "Pending"
      : item.status === "In Progress"
        ? "Ongoing"
        : item.status;

  const completedOrExpectedDate = isCompleted
    ? formatDate(item.completedDate || item.updatedAt)
    : formatDate(item.expectedCompletionDate);

  return (
    <Animated.View
      style={[styles.card, isMajor ? styles.majorCard : styles.minorCard]}
    >
      {/* Top Section: Vehicle Info & Image */}
      <View style={styles.cardHeader}>
        <Image
          source={{
            uri: item.vehicle?.images?.[0]?.url || PLACEHOLDER_VEHICLE_IMAGE,
          }}
          style={styles.vehicleImage}
        />
        <View style={styles.vehicleDetails}>
          <View style={styles.titleRow}>
            <Text style={styles.vehicleName} numberOfLines={1}>
              {item.vehicle?.vehicleName || "Unknown Vehicle"}
            </Text>
          </View>
          <View style={styles.numberBadge}>
            <Text style={styles.vehicleNumber}>
              {item.vehicle?.vehicleNumber || "—"}
            </Text>
          </View>
          <Text style={styles.maintenanceTitle} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
      </View>

      {/* Badges Row */}
      <View style={styles.badgeRow}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: isMajor
                ? COLORS.dangerLight
                : COLORS.primaryLight,
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: isMajor ? COLORS.danger : COLORS.primary },
            ]}
          >
            {item.maintenanceType} Repair
          </Text>
        </View>

        <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
          <View
            style={[styles.statusDot, { backgroundColor: statusStyle.text }]}
          />
          <Text style={[styles.badgeText, { color: statusStyle.text }]}>
            {statusLabel}
          </Text>
        </View>

        <View style={styles.photoCountBadge}>
          <Ionicons name="camera-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.photoCountText}>{item.images?.length || 0}</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <View style={styles.creatorInfo}>
          <Feather name="user" size={12} color={COLORS.textLight} />
          <Text style={styles.footerText}>
            {item.createdBy?.fullName || item.createdBy?.name || "Unknown"} •{" "}
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.arrowButton}
          activeOpacity={0.7}
          onPress={() =>
            router.push({
              pathname: "/menu/maintenance/MaintenanceDetails",
              params: {
                id: item._id,
              },
            })
          }
        >
          <Text style={styles.viewDetailsText}>Details</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

const EmptyComponent = React.memo(({ onReset, hasSearch }) => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyIconBg}>
      <MaterialCommunityIcons
        name="wrench-outline"
        size={48}
        color={COLORS.textLight}
      />
    </View>
    <Text style={styles.emptyTitle}>No Maintenance Found</Text>
    <Text style={styles.emptySubtitle}>
      {hasSearch
        ? "No records match your search and filter. Try a different vehicle number, name or garage."
        : "We couldn't find any vehicle maintenance records matching your current filter choices."}
    </Text>
    <TouchableOpacity style={styles.emptyButton} onPress={onReset}>
      <Text style={styles.emptyButtonText}>Clear Filters</Text>
    </TouchableOpacity>
  </View>
));

const LoadingSkeleton = React.memo(() => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [opacity]);

  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((key) => (
        <Animated.View key={key} style={[styles.skeletonCard, { opacity }]}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={styles.skeletonBoxSquare} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={[styles.skeletonLine, { width: "70%" }]} />
              <View style={[styles.skeletonLine, { width: "40%" }]} />
              <View style={[styles.skeletonLine, { width: "90%" }]} />
            </View>
          </View>
        </Animated.View>
      ))}
    </View>
  );
});

const FloatingButton = React.memo(({ onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.fabContainer, { transform: [{ scale }] }]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </Animated.View>
  );
});

// --- MAIN SCREEN COMPONENT ---
export default function VehicleMaintenanceScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [refreshing, setRefreshing] = useState(false);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);

  const scrollY = useRef(new Animated.Value(0)).current;

  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [0, 0.1],
    extrapolate: "clamp",
  });

  useEffect(() => {
    getMaintenances();
  }, []);

  const getMaintenances = async () => {
    try {
      setLoading(true);

      const response = await api.get("/vehicles/list-maintenance");

      if (response.data.success) {
        setMaintenance(response.data.data || []);
      }
    } catch (error) {
      console.log("Maintenance Error", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    getMaintenances();
  }, []);

  // Filter Logic
  const filteredData = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return maintenance.filter((item) => {
      const vehicle = item.vehicle || {};

      const matchesSearch =
        !query ||
        vehicle.vehicleName?.toLowerCase().includes(query) ||
        vehicle.vehicleNumber?.toLowerCase().includes(query) ||
        item.garage?.name?.toLowerCase().includes(query) ||
        item.title?.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      switch (selectedFilter) {
        case "All":
          return true;
        case "Pending":
          return item.status === "Scheduled";
        case "Ongoing":
          return item.status === "In Progress";
        case "Completed":
          return item.status === "Completed";
        case "Major":
          return item.maintenanceType === "Major";
        case "Minor":
          return item.maintenanceType === "Minor";
        case "This Month": {
          const now = new Date();
          const created = new Date(item.createdAt);
          return (
            created.getMonth() === now.getMonth() &&
            created.getFullYear() === now.getFullYear()
          );
        }
        default:
          return true;
      }
    });
  }, [maintenance, searchQuery, selectedFilter]);

  const renderItem = useCallback(
    ({ item }) => (
      <MaintenanceCard
        item={item}
        onPress={() =>
          router.push({
            pathname: "/menu/maintenance/MaintenanceDetails",
            params: { id: item._id },
          })
        }
      />
    ),
    [],
  );

  const renderChip = useCallback(
    ({ item }) => (
      <FilterChip
        label={item}
        isSelected={selectedFilter === item}
        onPress={() => setSelectedFilter(item)}
      />
    ),
    [selectedFilter],
  );

  const handleReset = useCallback(() => {
    setSelectedFilter("All");
    setSearchQuery("");
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Header opacity={headerShadowOpacity} />

      {/*
        Search bar + filter chips live OUTSIDE the list.
        Previously they were rendered through `ListHeaderComponent={renderHeader}`
        where renderHeader was a new function on every render. React treats
        that as a brand-new component type each time, so the whole header —
        including the TextInput — was unmounted and remounted after every
        keystroke, which is what closed the keyboard after one letter.
        Rendered here as plain JSX in a fixed position, the TextInput is
        never remounted, so typing (and the keyboard) stays uninterrupted.
      */}
      <View style={styles.searchArea}>
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Ionicons
              name="search-outline"
              size={18}
              color={COLORS.textLight}
              style={styles.searchIcon}
            />
            <TextInput
              placeholder="Search vehicle number, name or garage..."
              placeholderTextColor={COLORS.textLight}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              blurOnSubmit
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={COLORS.textLight}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
          data={FILTERS}
          extraData={selectedFilter}
          renderItem={renderChip}
          keyExtractor={(item) => item}
          keyboardShouldPersistTaps="handled"
        />
      </View>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <Animated.FlatList
          data={filteredData}
          renderItem={renderItem}
          keyExtractor={(item) => item._id}
          ListEmptyComponent={
            <EmptyComponent
              onReset={handleReset}
              hasSearch={searchQuery.trim().length > 0}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false },
          )}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        />
      )}
      <FloatingButton
        onPress={() => router.push("/menu/maintenance/AddMaintenance")}
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

  // Header
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  headerLeft: {
    justifyContent: "center",
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primary,
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textDark,
  },

  // List Layout
  listContent: {
    paddingTop: 4,
    paddingBottom: 90,
  },

  // Fixed search + filters area
  searchArea: {
    backgroundColor: COLORS.background,
    paddingTop: 14,
  },

  // Search Section
  searchSection: {
    paddingHorizontal: 20,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textDark,
  },

  // Filter Chips
  filterScroll: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },

  // Card Component
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.05,
    elevation: 2,
  },
  majorCard: {
    borderColor: "#FECACA",
    borderLeftWidth: 4,
    borderLeftColor: COLORS.danger,
  },
  minorCard: {
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: "row",
    gap: 12,
  },
  vehicleImage: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: COLORS.background,
  },
  vehicleDetails: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  numberBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  vehicleNumber: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  maintenanceTitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
    fontWeight: "500",
  },

  // Badges
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  photoCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  photoCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textMuted,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },

  // Info Grid
  infoGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoColumn: {
    flex: 1,
  },
  infoColumnRight: {
    alignItems: "flex-end",
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textLight,
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textDark,
    marginTop: 2,
  },
  costValue: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.textDark,
    marginTop: 2,
  },

  // Card Footer
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  creatorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  arrowButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewDetailsText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },

  // FAB
  fabContainer: {
    position: "absolute",
    bottom: 24,
    right: 20,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },

  // Empty State
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textDark,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },

  // Loading Skeleton
  skeletonContainer: {
    padding: 20,
    gap: 16,
  },
  skeletonCard: {
    height: 120,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
  },
  skeletonBoxSquare: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: COLORS.border,
  },
  skeletonLine: {
    height: 12,
    backgroundColor: COLORS.border,
    borderRadius: 6,
  },
});
