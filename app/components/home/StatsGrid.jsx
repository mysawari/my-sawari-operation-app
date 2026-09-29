import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import api from "../../../services/api";

const DISK_CACHE_KEY = "home_stats_grid_cache_v1";

const memoryCache = {
  statsData: null,
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
      }
    })
    .catch(() => {});
  return hydrationPromise;
};

const persistCacheToDisk = (statsData) => {
  AsyncStorage.setItem(
    DISK_CACHE_KEY,
    JSON.stringify({ statsData, fetchedAt: Date.now() }),
  ).catch(() => {});
};

/* ---------------------------------------------------------------------- */
/*  Design tokens — keep in sync with the rest of the app if you already  */
/*  have a shared theme file; inlined here so this component stays drop-in */
/* ---------------------------------------------------------------------- */
const COLORS = {
  surface: "#FFFFFF",
  border: "#EEF0F4",
  ink: "#151726",
  inkSoft: "#6B7086",
  inkFaint: "#A6AAB8",
  skeleton: "#EEF0F4",
};

const STAT_META = {
  active: { icon: "sync-outline", tint: "#2563EB", tintSoft: "#EAF1FE" },
  vehicles: { icon: "car-sport-outline", tint: "#16A34A", tintSoft: "#E9F8EE" },
  available: {
    icon: "checkmark-circle-outline",
    tint: "#D97706",
    tintSoft: "#FDF1DF",
  },
  dueToday: { icon: "time-outline", tint: "#7C3AED", tintSoft: "#F2EBFE" },
};

const STAT_ORDER = ["active", "vehicles", "available", "dueToday"];

/* Skeleton placeholder — mirrors the real grid's dimensions exactly so    */
/* there's no layout shift / jump when the data pops in.                  */
function SkeletonBlock({ isLast, pulse }) {
  return (
    <View style={[styles.statBlock, !isLast && styles.borderRight]}>
      <Animated.View style={[styles.skeletonCount, { opacity: pulse }]} />
      <Animated.View style={[styles.skeletonLabel, { opacity: pulse }]} />
    </View>
  );
}

export default function StatsGrid() {
  const router = useRouter();

  // Seed state directly from the in-memory cache so a remount within the
  // same app session (e.g. navigating away and back to the home tab)
  // renders real numbers on the very first frame — no loading state at all.
  const [statsData, setStatsData] = useState(memoryCache.statsData || []);
  // Only block on the skeleton if we have truly nothing to show yet.
  const [loading, setLoading] = useState(memoryCache.statsData == null);

  const pulse = useRef(new Animated.Value(0.4)).current;
  const fadeIn = useRef(
    new Animated.Value(memoryCache.statsData ? 1 : 0),
  ).current;

  // Guards against a slow response landing after the component has
  // unmounted (e.g. user navigated away before the fetch resolved).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ---- Disk hydration (cold start only) + kick off a background fetch ----
  useEffect(() => {
    let cancelled = false;

    if (memoryCache.statsData != null) {
      // Already have something in memory (e.g. another mount this
      // session already loaded it) — just refresh silently in the
      // background, no disk read needed.
      fetchDashboardStats({ silent: true });
    } else {
      hydrateCacheFromDisk().then(() => {
        if (cancelled) return;
        if (memoryCache.statsData != null) {
          // Disk had something — paint it immediately, then refresh.
          setStatsData(memoryCache.statsData);
          setLoading(false);
          fetchDashboardStats({ silent: true });
        } else {
          // Genuine first-ever load: nothing in memory, nothing on disk.
          fetchDashboardStats({ silent: false });
        }
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Skeleton pulse animation, only runs while genuinely loading ----
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

  // Fade in only plays the first time real data replaces the skeleton;
  // silent background refreshes swap numbers in place with no animation
  // so live-updating counts don't flicker.
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
    // Only show the blocking skeleton when there's nothing on screen yet.
    if (!silent) setLoading(true);

    try {
      const [vehiclesRes, activeRes] = await Promise.all([
        api.get("/vehicles/all"),
        api.get("/handover/active-handovers"),
      ]);

      const totalVehicles = vehiclesRes.data?.total || 0;

      const availableVehicles =
        vehiclesRes.data?.stats?.find(
          (item) => item._id?.toLowerCase() === "available",
        )?.count || 0;

      const activeRentals = activeRes.data?.count || 0;

      const today = new Date();

      const dueToday =
        activeRes.data?.data?.filter((item) => {
          if (!item.trip?.dropDateTime) return false;
          const d = new Date(item.trip.dropDateTime);
          return (
            d.getDate() === today.getDate() &&
            d.getMonth() === today.getMonth() &&
            d.getFullYear() === today.getFullYear()
          );
        }).length || 0;

      const nextStatsData = [
        {
          id: "active",
          title: "Active",
          count: activeRentals,
          clickable: false,
        },
        {
          id: "vehicles",
          title: "Vehicles",
          count: totalVehicles,
          clickable: false,
        },
        {
          id: "available",
          title: "Available",
          count: availableVehicles,
          clickable: true,
          route: "../../screens/VehiclesAvailable",
          params: { filter: "available" },
        },
        {
          id: "dueToday",
          title: "Due Today",
          count: dueToday,
          clickable: false,
        },
      ];

      memoryCache.statsData = nextStatsData;
      memoryCache.fetchedAt = Date.now();
      persistCacheToDisk(nextStatsData);

      if (mountedRef.current) {
        setStatsData(nextStatsData);
      }
    } catch (error) {
      console.log("STATS ERROR:", error?.response?.data || error.message);
      // On a silent background refresh failure we deliberately keep
      // showing whatever's already on screen rather than clearing it.
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleCardPress = (item) => {
    if (!item.clickable || !item.route) return;
    router.push({
      pathname: item.route,
      params: item.params || {},
    });
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
    <Animated.View style={[styles.wrapper, { opacity: fadeIn }]}>
      {statsData.map((item, index) => {
        const meta = STAT_META[item.id] || STAT_META.active;
        const isLast = index === statsData.length - 1;
        const Block = item.clickable ? TouchableOpacity : View;

        return (
          <Block
            key={item.id}
            {...(item.clickable
              ? { activeOpacity: 0.7, onPress: () => handleCardPress(item) }
              : {})}
            style={[
              styles.statBlock,
              !isLast && styles.borderRight,
              item.clickable && styles.statBlockActive,
            ]}
          >
            <Text style={[styles.count, { color: meta.tint }]}>
              {item.count}
            </Text>

            <Text style={styles.label} numberOfLines={1}>
              {item.title}
            </Text>

            {item.clickable && (
              <View style={styles.tapHint}>
                <Ionicons name="chevron-forward" size={11} color={meta.tint} />
              </View>
            )}
          </Block>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 16,
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
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  statBlockActive: {
    transform: [{ scale: 1 }],
  },
  borderRight: {
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  count: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    color: COLORS.inkSoft,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tapHint: {
    position: "absolute",
    top: 2,
    right: 10,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Skeleton placeholders — sized to match .count and .label exactly so   */
  /* the grid's height never shifts between loading and loaded states.    */
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
});
