import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../services/api";

const TABS = [
  { key: "yesterday", label: "Yesterday" },
  { key: "today", label: "Today" },
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
];

// Initial cards shown, and how many more to load each time the user
// scrolls near the end of the list.
const PAGE_SIZE = 7;

// Safety cap on how many cards we'll force-render at once when restoring
// a deep scroll position. Without SOME cap, a user who scrolled through
// hundreds of cards could force a huge synchronous render on return.
const MAX_INITIAL_RENDER = 80;

// ---------------------------------------------------------------------------
// Module-level persistence (lives outside the component, so it survives
// this screen being unmounted while the detail screen is on top of the
// stack, and is read back when the screen is recreated on "back").
// ---------------------------------------------------------------------------
const scrollPositionCache = {
  yesterday: 0,
  today: 0,
  all: 0,
  draft: 0,
};

let lastActiveTabCache = "today";

const handoversCache = {
  yesterday: null,
  today: null,
  all: null,
  draft: null,
};

// How many cards were "unlocked" (via pagination) per tab. Restoring the
// scroll OFFSET is useless if the list underneath has shrunk back to
// page 1 and doesn't have enough content to scroll that far.
const visibleCountCache = {
  yesterday: PAGE_SIZE,
  today: PAGE_SIZE,
  all: PAGE_SIZE,
  draft: PAGE_SIZE,
};

const timeAgo = (value) => {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (isNaN(then)) return null;

  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;

  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
};

const getRecordDate = (item) => {
  const raw = item.createdAt || item.updatedAt;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

const formatDateAndTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;

  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const getInitials = (name) => {
  if (!name || !name.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const formatCompactDateTime = (dateString) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const openDialer = (phoneNumber) => {
  if (!phoneNumber) return;
  Linking.openURL(`tel:${phoneNumber}`).catch((err) =>
    console.log("Error launching phone dialer:", err),
  );
};

// ---------------------------------------------------------------------------
// Card component, memoized so cards that haven't changed skip re-render
// when the parent re-renders (typing in search, tab switches, etc).
// ---------------------------------------------------------------------------
const HandoverCard = memo(function HandoverCard({
  item,
  onPress,
  onDiscard,
  onResume,
}) {
  const isDraft = item.bookingStatus === "draft";

  const hasStepData =
    isDraft &&
    Number.isFinite(item.draftStep) &&
    Number.isFinite(item.totalSteps) &&
    item.totalSteps > 0;

  const progressPct = hasStepData
    ? Math.min(100, Math.round((item.draftStep / item.totalSteps) * 100))
    : 0;

  const lastSavedDisplay =
    item.lastSaved || timeAgo(item.updatedAt || item.createdAt);

  const handoverTimeDisplay =
    item.handoverTime || formatDateAndTime(item.createdAt) || null;

  const balanceDue = (item.balanceAmount || 0) > 0;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => onPress(item._id)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {getInitials(item.customerName)}
          </Text>
        </View>

        <View style={styles.customerContext}>
          <Text numberOfLines={1} ellipsizeMode="tail">
            <Text style={styles.customerName}>
              {item.customerName || "Unnamed customer"}
            </Text>
            {item.mobileNumber ? (
              <Text style={styles.customerPhone}> • {item.mobileNumber}</Text>
            ) : null}
          </Text>
          {!!handoverTimeDisplay && (
            <Text style={styles.handoverTimeText} numberOfLines={1}>
              <Ionicons name="time-outline" size={10} color="#94A3B8" />{" "}
              Handover: {handoverTimeDisplay}
            </Text>
          )}
        </View>

        <View style={styles.headerActions}>
          <View
            style={[
              styles.statusBadge,
              isDraft ? styles.statusBadgeDraft : styles.statusBadgeConfirmed,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                isDraft
                  ? styles.statusBadgeTextDraft
                  : styles.statusBadgeTextConfirmed,
              ]}
            >
              {isDraft ? "Draft" : "Confirmed"}
            </Text>
          </View>

          {item.mobileNumber ? (
            <TouchableOpacity
              style={styles.callButton}
              onPress={() => openDialer(item.mobileNumber)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="call" size={12} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.infoRow}>
        <View style={styles.infoCol}>
          <Text style={styles.infoLabel}>Car</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {item.vehicleName || "Vehicle not set"}
            {item.vehicleNumber ? ` • ${item.vehicleNumber}` : ""}
          </Text>
        </View>

        <View style={[styles.infoCol, { alignItems: "flex-end" }]}>
          <Text style={styles.infoLabel}>Destination</Text>
          <Text
            style={[styles.infoValue, { textAlign: "right" }]}
            numberOfLines={1}
          >
            {item.destination || "Destination not set"}
          </Text>
        </View>
      </View>

      <View style={[styles.infoRow, { marginTop: 10 }]}>
        <View style={styles.infoCol}>
          <Text style={styles.infoLabel}>Pickup</Text>
          <Text style={styles.infoValue}>
            {formatCompactDateTime(item.pickupDateTime)}
          </Text>
        </View>

        <View style={[styles.infoCol, { alignItems: "flex-end" }]}>
          <Text style={styles.infoLabel}>Drop</Text>
          <Text style={[styles.infoValue, { textAlign: "right" }]}>
            {formatCompactDateTime(item.dropDateTime)}
          </Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <Text style={styles.financeInline} numberOfLines={1}>
          <Text style={styles.financeLabelInline}>
            {balanceDue ? "Due " : "Bal "}
          </Text>
          <Text
            style={[
              styles.financeValueInline,
              balanceDue ? styles.financeValueDue : styles.financeValueClear,
            ]}
          >
            ₹{Number(item.balanceAmount || 0).toLocaleString("en-IN")}
          </Text>
        </Text>

        {item.createdBy ? (
          <Text style={styles.creatorInline} numberOfLines={1}>
            by {item.createdBy}
          </Text>
        ) : null}
      </View>

      {isDraft && (
        <View style={styles.draftFooterContainer}>
          {hasStepData ? (
            <View style={styles.progressSection}>
              <View style={styles.progressMeta}>
                <Text style={styles.progressLabel}>Draft progress</Text>
                <Text style={styles.progressPercentage}>{progressPct}%</Text>
                {lastSavedDisplay && (
                  <Text style={styles.timestampText} numberOfLines={1}>
                    {" "}
                    • Saved {lastSavedDisplay}
                  </Text>
                )}
              </View>
              <View style={styles.progressBarTrack}>
                <View
                  style={[styles.progressBarFill, { width: `${progressPct}%` }]}
                />
              </View>
            </View>
          ) : (
            lastSavedDisplay && (
              <Text style={[styles.timestampText, { marginBottom: 8 }]}>
                Saved {lastSavedDisplay}
              </Text>
            )
          )}

          <View style={styles.draftActionsRow}>
            <TouchableOpacity
              style={styles.resumeActionBtn}
              activeOpacity={0.75}
              onPress={() => onResume(item._id)}
            >
              <Ionicons name="play" size={12} color="#FFF" />
              <Text style={styles.resumeActionText}>Resume</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.discardActionBtn}
              activeOpacity={0.75}
              onPress={() => onDiscard(item._id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={12} color="#DC2626" />
              <Text style={styles.discardActionText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
});

export default function HandoverDraftScreen() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState(lastActiveTabCache);
  const [loading, setLoading] = useState(true);
  const [handovers, setHandovers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Seeded from visibleCountCache so a remount reopens with exactly as
  // many cards unlocked as when the user left.
  const [visibleCount, setVisibleCount] = useState(
    () => visibleCountCache[lastActiveTabCache] || PAGE_SIZE,
  );

  const flatListRef = useRef(null);
  const isFirstVisibleCountRun = useRef(true);

  // Per-focus restore bookkeeping. targetOffsetRef holds what we're
  // trying to reach; doneRef stops us from fighting a user who starts
  // scrolling manually right after landing back on the screen; attemptsRef
  // caps how many times we'll retry via onContentSizeChange.
  const targetOffsetRef = useRef(0);
  const restoreDoneRef = useRef(true);
  const restoreAttemptsRef = useRef(0);

  useEffect(() => {
    const cached = handoversCache[activeTab];
    if (cached) {
      setHandovers(cached);
      setLoading(false);
      fetchHandovers(activeTab, { silent: true });
    } else {
      fetchHandovers(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Reset pagination on a deliberate tab/search change — never on mount,
  // since that would wipe out the restored visibleCount before the user
  // even sees the screen.
  useEffect(() => {
    if (isFirstVisibleCountRun.current) {
      isFirstVisibleCountRun.current = false;
      return;
    }
    setVisibleCount(PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, searchQuery]);

  useEffect(() => {
    visibleCountCache[activeTab] = visibleCount;
  }, [visibleCount, activeTab]);

  // Kick off a restore attempt whenever this screen regains focus.
  useFocusEffect(
    useCallback(() => {
      const savedOffset = scrollPositionCache[activeTab] || 0;
      targetOffsetRef.current = savedOffset;
      restoreAttemptsRef.current = 0;
      restoreDoneRef.current = savedOffset <= 0;

      if (savedOffset <= 0) return;

      // First attempt right away (covers the case where enough content
      // is already rendered, e.g. short lists).
      const raf = requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({
          offset: savedOffset,
          animated: false,
        });
      });

      // Final safety-net timeout in case onContentSizeChange never fires
      // again (e.g. list was already fully laid out).
      const safetyTimeout = setTimeout(() => {
        restoreDoneRef.current = true;
      }, 1000);

      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(safetyTimeout);
      };
    }, [activeTab]),
  );

  // Re-attempts the scroll restore every time the FlatList's content
  // actually grows. This is the key fix — a fixed timeout has no idea
  // whether the list is tall enough yet to scroll to the saved offset;
  // this does, because it's driven by the list's own layout events.
  const handleContentSizeChange = useCallback(() => {
    if (restoreDoneRef.current) return;
    if (restoreAttemptsRef.current >= 6) {
      restoreDoneRef.current = true;
      return;
    }
    restoreAttemptsRef.current += 1;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({
        offset: targetOffsetRef.current,
        animated: false,
      });
    });
  }, []);

  const fetchHandovers = async (tab = activeTab, { silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);

      const res = await api.get(`/handover/list?tab=${tab}`);

      if (res.data.success) {
        handoversCache[tab] = res.data.data;
        if (tab === activeTab) setHandovers(res.data.data);
      }
    } catch (e) {
      console.log(e.response?.data || e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleDiscard = useCallback(
    (id) => {
      Alert.alert(
        "Discard Draft?",
        "This draft will be permanently removed. This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: async () => {
              try {
                const res = await api.patch(`/handover/discard/${id}`);
                if (res.data.success) {
                  setHandovers((prev) => {
                    const updated = prev.filter((h) => h._id !== id);
                    handoversCache[activeTab] = updated;
                    return updated;
                  });
                }
              } catch (e) {
                console.log(e.response?.data || e.message);
                Alert.alert(
                  "Error",
                  "Unable to discard the draft. Please try again.",
                );
              }
            },
          },
        ],
        { cancelable: true },
      );
    },
    [activeTab],
  );

  const handleCardPress = useCallback(
    (id) => {
      router.push({
        pathname: "../components/handover/HandoverCardDetails",
        params: { id },
      });
    },
    [router],
  );

  const handleResume = useCallback(
    (id) => {
      router.push({
        pathname: "../components/handover/image",
        params: { handoverId: id, resume: true },
      });
    },
    [router],
  );

  const handleTabPress = (tabKey) => {
    if (tabKey === activeTab) return;
    setActiveTab(tabKey);
    lastActiveTabCache = tabKey;
    scrollPositionCache[tabKey] = 0;
    visibleCountCache[tabKey] = PAGE_SIZE;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const tabCounts = {
    [activeTab]: handovers.length,
  };

  const tabFiltered = handovers;
  const isSearching = searchQuery.trim().length > 0;

  const searched = useMemo(() => {
    if (!isSearching) return tabFiltered;

    const q = searchQuery.trim().toLowerCase();

    return tabFiltered.filter((i) => {
      const haystack = [
        i.customerName,
        i.mobileNumber,
        i.vehicleName,
        i.vehicleNumber,
        i.destination,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [tabFiltered, searchQuery, isSearching]);

  const displayList = useMemo(() => {
    return searched.slice(0, visibleCount);
  }, [searched, visibleCount]);

  const hasMore = visibleCount < searched.length;

  const handleLoadMore = () => {
    if (!hasMore) return;
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, searched.length));
  };

  const renderItem = useCallback(
    ({ item }) => (
      <HandoverCard
        item={item}
        onPress={handleCardPress}
        onDiscard={handleDiscard}
        onResume={handleResume}
      />
    ),
    [handleCardPress, handleDiscard, handleResume],
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.loadMoreFooter}>
        <ActivityIndicator size="small" color="#0F172A" />
        <Text style={styles.loadMoreText}>Loading more...</Text>
      </View>
    );
  };

  // Render enough cards up-front to cover the current visibleCount when
  // returning from the detail screen — this is what makes the restore
  // actually reach the saved offset, instead of clamping near the top
  // because only ~12 rows exist yet. Capped so a genuinely huge list
  // doesn't force an enormous first paint.
  const initialNumToRender = Math.min(
    Math.max(visibleCount, PAGE_SIZE),
    MAX_INITIAL_RENDER,
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={["#0F172A", "#1E293B"]} style={styles.header}>
        <Text style={styles.headerTitle}>Vehicle Handovers</Text>
        <Text style={styles.headerSubtitle}>{handovers.length} records</Text>
      </LinearGradient>

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, car, number, city..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color="#CBD5E1" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = tabCounts[tab.key] ?? 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.activeTab]}
              onPress={() => handleTabPress(tab.key)}
            >
              <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                {tab.label}
              </Text>
              {count > 0 && (
                <View
                  style={[
                    styles.tabCountPill,
                    isActive
                      ? styles.tabCountPillActive
                      : styles.tabCountPillInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      isActive
                        ? styles.tabCountTextActive
                        : styles.tabCountTextInactive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {searched.length > 0 && (
        <Text style={styles.resultHint}>
          {isSearching
            ? `${displayList.length} of ${searched.length} result${
                searched.length === 1 ? "" : "s"
              } for "${searchQuery.trim()}"`
            : `Showing ${displayList.length} of ${searched.length}`}
        </Text>
      )}

      <FlatList
        ref={flatListRef}
        data={displayList}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={fetchHandovers}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const offset = e.nativeEvent.contentOffset.y;
          scrollPositionCache[activeTab] = offset;
          // A real scroll from the user (as opposed to our own
          // scrollToOffset calls) means restore has effectively landed —
          // stop retrying so we don't yank the list while they're
          // browsing.
          if (Math.abs(offset - targetOffsetRef.current) < 4) {
            restoreDoneRef.current = true;
          }
        }}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        initialNumToRender={initialNumToRender}
        maxToRenderPerBatch={12}
        windowSize={12}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyState}>
              <Ionicons
                name={isSearching ? "search-outline" : "document-text-outline"}
                size={44}
                color="#CBD5E1"
              />
              <Text style={styles.emptyTitle}>
                {isSearching ? "No matches found" : "No matching handovers"}
              </Text>
              <Text style={styles.emptySub}>
                {isSearching
                  ? "Try a different name, car, or number."
                  : "Pull down to refresh or check other tabs."}
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingTop: 54,
    paddingBottom: 18,
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: "#0F172A",
    padding: 0,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderColor: "#F1F5F9",
  },
  tab: {
    flex: 1,
    marginHorizontal: 3,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingVertical: 8,
    gap: 4,
  },
  activeTab: {
    backgroundColor: "#0F172A",
  },
  tabText: {
    fontWeight: "600",
    color: "#64748B",
    fontSize: 13,
  },
  activeTabText: {
    color: "#FFFFFF",
  },
  tabCountPill: {
    height: 16,
    paddingHorizontal: 5,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountPillActive: {
    backgroundColor: "#334155",
  },
  tabCountPillInactive: {
    backgroundColor: "#E2E8F0",
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: "700",
  },
  tabCountTextActive: {
    color: "#FFFFFF",
  },
  tabCountTextInactive: {
    color: "#475569",
  },
  resultHint: {
    fontSize: 11.5,
    color: "#94A3B8",
    fontWeight: "500",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: "#F1F5F9",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#3730A3",
  },
  customerContext: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  customerName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.1,
  },
  customerPhone: {
    color: "#64748B",
    fontSize: 11.5,
    fontWeight: "500",
  },
  handoverTimeText: {
    fontSize: 10.5,
    color: "#94A3B8",
    fontWeight: "500",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeDraft: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  statusBadgeConfirmed: {
    backgroundColor: "#DCFCE7",
    borderColor: "#BBF7D0",
  },
  statusBadgeText: {
    fontWeight: "700",
    fontSize: 9,
    letterSpacing: 0.3,
  },
  statusBadgeTextDraft: {
    color: "#B45309",
  },
  statusBadgeTextConfirmed: {
    color: "#15803D",
  },
  callButton: {
    backgroundColor: "#0D9488",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  infoCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  compactCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  compactText: {
    flex: 1,
    fontSize: 11.5,
    color: "#334155",
    fontWeight: "500",
  },
  dateArrow: {
    color: "#94A3B8",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 7,
    paddingTop: 7,
    borderTopWidth: 1,
    borderColor: "#F1F5F9",
  },
  financeInline: {
    flexShrink: 1,
  },
  financeLabelInline: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#94A3B8",
  },
  financeValueInline: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0D9488",
  },
  financeSep: {
    fontSize: 9.5,
  },
  financeValueDue: {
    color: "#DC2626",
  },
  financeValueClear: {
    color: "#16A34A",
  },
  creatorInline: {
    fontSize: 10.5,
    color: "#94A3B8",
    marginLeft: 8,
    maxWidth: "38%",
  },
  draftFooterContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: "#F1F5F9",
  },
  progressSection: {
    marginBottom: 8,
  },
  progressMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  progressLabel: {
    fontWeight: "600",
    color: "#475569",
    fontSize: 10.5,
  },
  progressPercentage: {
    fontWeight: "700",
    color: "#D97706",
    fontSize: 10.5,
    marginLeft: 4,
  },
  progressBarTrack: {
    marginTop: 5,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FEF3C7",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#D97706",
    borderRadius: 2,
  },
  timestampText: {
    fontSize: 10.5,
    color: "#64748B",
    fontWeight: "500",
  },
  resumeActionBtn: {
    flex: 4,
    backgroundColor: "#0F172A",
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    paddingVertical: 8,
    gap: 5,
  },
  resumeActionText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 90,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
    textAlign: "center",
  },
  loadMoreFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  loadMoreText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  draftActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  discardActionBtn: {
    flex: 1,
    backgroundColor: "#FEE2E2",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#FECACA",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    paddingVertical: 8,
    gap: 4,
  },
  discardActionText: {
    color: "#DC2626",
    fontWeight: "600",
    fontSize: 11.5,
  },
});
