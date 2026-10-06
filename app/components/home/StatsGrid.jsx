import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import api from "../../../services/api";

/* ---------------------------------------------------------------------- */
/*  Endpoint — change the prefix to wherever the stats router is mounted  */
/*  e.g. app.use("/dashboard", dashboardRoutes) -> "/dashboard/stats"     */
/* ---------------------------------------------------------------------- */
const STATS_ENDPOINT = "/dashboard/stats";
// v2: data shape changed (now includes car/bike breakdown)
const DISK_CACHE_KEY = "home_stats_grid_cache_v2";

const memoryCache = {
  statsData: null,
  staleCount: 0,
  fetchedAt: null,
};

let hydrationPromise = null;
const hydrateCacheFromDisk = () => {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = AsyncStorage.getItem(DISK_CACHE_KEY)
    .then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (memoryCache.statsData == null && Array.isArray(parsed?.statsData)) {
        memoryCache.statsData = parsed.statsData;
        memoryCache.staleCount = Number(parsed.staleCount) || 0;
      }
    })
    .catch(() => {});
  return hydrationPromise;
};

const persistCacheToDisk = (statsData, staleCount) => {
  AsyncStorage.setItem(
    DISK_CACHE_KEY,
    JSON.stringify({ statsData, staleCount, fetchedAt: Date.now() }),
  ).catch(() => {});
};

/* ---------------------------------------------------------------------- */
/*  Design tokens                                                          */
/* ---------------------------------------------------------------------- */
const COLORS = {
  surface: "#FFFFFF",
  border: "#EEF0F4",
  ink: "#151726",
  inkSoft: "#6B7086",
  inkFaint: "#A6AAB8",
  skeleton: "#EEF0F4",
  warn: "#B45309",
  warnSoft: "#FEF3E2",
};

const STAT_META = {
  onRent: { title: "On Rent", tint: "#2563EB" },
  booked: { title: "Booked", tint: "#7C3AED" },
  unbooked: { title: "Free", tint: "#16A34A" },
  maintenance: { title: "Service", tint: "#DC2626" },
  total: { title: "Total", tint: "#151726" },
};

const STAT_ORDER = ["onRent", "booked", "unbooked", "maintenance", "total"];

// Maps the /stats response to the grid items
const buildStatsData = (data) => {
  const stats = data?.stats || {};
  const breakdown = data?.breakdown || {};

  const pick = (id, statKey) => ({
    id,
    title: STAT_META[id].title,
    count: Number(stats[statKey]) || 0,
    car: Number(breakdown[statKey]?.car) || 0,
    bike: Number(breakdown[statKey]?.bike) || 0,
  });

  return [
    pick("onRent", "onRentToday"),
    pick("booked", "bookedToday"),
    pick("unbooked", "unbookedToday"),
    pick("maintenance", "maintenanceToday"),
    pick("total", "totalVehicles"),
  ];
};

/* Skeleton placeholder — same dimensions as the real block, no layout jump */
function SkeletonBlock({ isLast, pulse }) {
  return (
    <View style={[styles.statBlock, !isLast && styles.borderRight]}>
      <Animated.View style={[styles.skeletonCount, { opacity: pulse }]} />
      <Animated.View style={[styles.skeletonLabel, { opacity: pulse }]} />
      <Animated.View style={[styles.skeletonSplit, { opacity: pulse }]} />
    </View>
  );
}

function StatBlock({ item, isLast }) {
  const meta = STAT_META[item.id] || STAT_META.total;

  return (
    <View style={[styles.statBlock, !isLast && styles.borderRight]}>
      <Text style={[styles.count, { color: meta.tint }]}>{item.count}</Text>

      <Text style={styles.label} numberOfLines={1}>
        {item.title}
      </Text>

      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Ionicons name="car-outline" size={10} color={COLORS.inkFaint} />
          <Text style={styles.splitText}>{item.car}</Text>
        </View>
        <View style={styles.splitItem}>
          <Ionicons name="bicycle-outline" size={10} color={COLORS.inkFaint} />
          <Text style={styles.splitText}>{item.bike}</Text>
        </View>
      </View>
    </View>
  );
}

export default function StatsGrid() {
  // Seed from memory so a remount in the same session paints instantly
  const [statsData, setStatsData] = useState(memoryCache.statsData || []);
  const [staleCount, setStaleCount] = useState(memoryCache.staleCount || 0);
  const [loading, setLoading] = useState(memoryCache.statsData == null);

  const pulse = useRef(new Animated.Value(0.4)).current;
  const fadeIn = useRef(
    new Animated.Value(memoryCache.statsData ? 1 : 0),
  ).current;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ---- Disk hydration (cold start only) + background fetch ----
  useEffect(() => {
    let cancelled = false;

    if (memoryCache.statsData != null) {
      fetchDashboardStats({ silent: true });
    } else {
      hydrateCacheFromDisk().then(() => {
        if (cancelled) return;
        if (memoryCache.statsData != null) {
          setStatsData(memoryCache.statsData);
          setStaleCount(memoryCache.staleCount || 0);
          setLoading(false);
          fetchDashboardStats({ silent: true });
        } else {
          fetchDashboardStats({ silent: false });
        }
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Skeleton pulse, only while loading ----
  useEffect(() => {
    let loop;
    if (loading) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 650,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0.4,
            duration: 650,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    }
    return () => loop && loop.stop();
  }, [loading, pulse]);

  // ---- Fade in only the first time real data replaces the skeleton ----
  const hasFadedInRef = useRef(!loading);
  useEffect(() => {
    if (!loading && !hasFadedInRef.current) {
      hasFadedInRef.current = true;
      fadeIn.setValue(0);
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [loading, fadeIn]);

  const fetchDashboardStats = async ({ silent } = {}) => {
    if (!silent) setLoading(true);

    try {
      const res = await api.get(STATS_ENDPOINT);

      if (!res.data?.success) {
        throw new Error(res.data?.message || "Failed to load stats");
      }

      const nextStatsData = buildStatsData(res.data);
      const nextStale = Number(res.data?.diagnostics?.staleActiveBookings) || 0;

      memoryCache.statsData = nextStatsData;
      memoryCache.staleCount = nextStale;
      memoryCache.fetchedAt = Date.now();
      persistCacheToDisk(nextStatsData, nextStale);

      if (mountedRef.current) {
        setStatsData(nextStatsData);
        setStaleCount(nextStale);
      }
    } catch (error) {
      console.log("STATS ERROR:", error?.response?.data || error.message);
      // Keep whatever is already on screen on a failed refresh
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.wrapper}>
        {STAT_ORDER.map((id, index) => (
          <SkeletonBlock
            key={id}
            isLast={index === STAT_ORDER.length - 1}
            pulse={pulse}
          />
        ))}
      </View>
    );
  }

  return (
    <View>
      <Animated.View style={[styles.wrapper, { opacity: fadeIn }]}>
        {statsData.map((item, index) => (
          <StatBlock
            key={item.id}
            item={item}
            isLast={index === statsData.length - 1}
          />
        ))}
      </Animated.View>

      {staleCount > 0 && (
        <View style={styles.staleBanner}>
          <Ionicons name="alert-circle-outline" size={13} color={COLORS.warn} />
          <Text style={styles.staleText}>
            {staleCount} old rental{staleCount > 1 ? "s" : ""} still marked
            active — close {staleCount > 1 ? "them" : "it"} to keep counts
            correct
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#151726",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  statBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  borderRight: {
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  count: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 2,
  },
  label: {
    fontSize: 9.5,
    color: COLORS.inkSoft,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  split: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    gap: 6,
  },
  splitItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  splitText: {
    fontSize: 10,
    color: COLORS.inkFaint,
    fontWeight: "600",
  },
  staleBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.warnSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  staleText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.warn,
    fontWeight: "500",
  },
  /* Skeletons — sized like count / label / split so height never shifts */
  skeletonCount: {
    width: 22,
    height: 17,
    borderRadius: 4,
    backgroundColor: COLORS.skeleton,
    marginBottom: 2,
  },
  skeletonLabel: {
    width: 40,
    height: 10,
    borderRadius: 3,
    backgroundColor: COLORS.skeleton,
  },
  skeletonSplit: {
    width: 34,
    height: 10,
    borderRadius: 3,
    backgroundColor: COLORS.skeleton,
    marginTop: 5,
  },
});
