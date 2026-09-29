import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { router, useLocalSearchParams } from "expo-router";

import api from "../../../services/api";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

const formatCurrency = (amount) => {
  const value = Number(amount) || 0;

  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
};

const formatDate = (dateValue) => {
  if (!dateValue) return "Date unavailable";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
};

const formatTime = (dateValue) => {
  if (!dateValue) return "";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const getPaymentTypeLabel = (type) => {
  switch (type) {
    case "booking":
      return "Booking Payment";
    case "handover":
      return "Handover Payment";
    case "rental":
      return "Rental Payment";
    case "extension":
      return "Extension Payment";
    case "additional_charge":
      return "Additional Charge";
    case "receive":
      return "Vehicle Return Payment";
    case "refund":
      return "Refund";
    default:
      return "Payment";
  }
};

const getPaymentMethodLabel = (method) => {
  switch (String(method || "").toLowerCase()) {
    case "cash":
      return "Cash";
    case "phonepe":
      return "PhonePe";
    case "razorpay":
      return "Razorpay";
    case "mixed":
      return "Mixed";
    default:
      return "Cash";
  }
};

const getPaymentTypeIcon = (type) => {
  switch (type) {
    case "booking":
      return "BK";
    case "handover":
      return "HO";
    case "rental":
      return "RE";
    case "extension":
      return "EX";
    case "additional_charge":
      return "+";
    case "receive":
      return "RV";
    case "refund":
      return "RF";
    default:
      return "₹";
  }
};

/* =========================================================
   SEARCH HELPERS
   Every word typed must match somewhere in the row (order
   doesn't matter). Searchable: payment type, method, who
   collected it, vehicle, note, amount and date.
========================================================= */

const normalizeToken = (s) => s.replace(/[₹,]/g, "");

const matchesSearch = (item, query) => {
  const amount = Number(item?.amount) || 0;

  const breakdownLabels =
    String(item?.paymentMethod || "").toLowerCase() === "mixed"
      ? [
          Number(item?.paymentBreakdown?.cash) > 0 ? "cash" : "",
          Number(item?.paymentBreakdown?.phonePe) > 0 ? "phonepe" : "",
          Number(item?.paymentBreakdown?.razorpay) > 0 ? "razorpay" : "",
        ]
      : [];

  const hay = [
    item?.type,
    getPaymentTypeLabel(item?.type),
    getPaymentMethodLabel(item?.paymentMethod),
    ...breakdownLabels,
    item?.createdBy?.name,
    item?.createdBy?.fullName,
    item?.vehicle?.vehicleName,
    item?.vehicle?.vehicleId?.vehicleName,
    item?.vehicle?.vehicleNumber,
    item?.vehicle?.vehicleId?.vehicleNumber,
    item?.note,
    String(amount),
    formatCurrency(amount),
    formatDate(item?.createdAt),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/,/g, "");

  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(normalizeToken(token)));
};

/* =========================================================
   PAYMENT HISTORY SCREEN
========================================================= */

const PaymentHistoryScreen = () => {
  const { bookingId } = useLocalSearchParams();

  const normalizedBookingId = useMemo(() => {
    if (Array.isArray(bookingId)) return bookingId[0];
    return bookingId;
  }, [bookingId]);

  const [payments, setPayments] = useState([]);

  const [todaySummary, setTodaySummary] = useState({
    totalCollection: 0,
    cash: 0,
    phonePe: 0,
  });

  const [loading, setLoading] = useState(true); // first-page skeleton
  const [refreshing, setRefreshing] = useState(false); // pull-to-refresh
  const [loadingMore, setLoadingMore] = useState(false); // bottom spinner
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");

  // ---- Search state ----
  // searchInput: what's typed (instant). searchQuery: debounced value that
  // actually goes to the server.
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const searchQueryRef = useRef("");
  const isFirstSearchEffect = useRef(true);
  const listRef = useRef(null);

  // Guards against onEndReached firing multiple times for the same page
  // (FlatList can call it more than once during momentum scroll).
  const pageRef = useRef(1);
  const fetchingRef = useRef(false);
  // Lets a newer request (e.g. a new search) supersede an older in-flight
  // one, and drops the older response if it lands late.
  const requestIdRef = useRef(0);

  const fetchPage = async ({ page, isRefresh = false, search }) => {
    // "Load more" must not double-fire, but page-1 requests (refresh /
    // new search) are always allowed to supersede whatever is in flight.
    if (page > 1 && fetchingRef.current) return;

    const q = (search ?? searchQueryRef.current ?? "").trim();
    const myRequestId = ++requestIdRef.current;
    fetchingRef.current = true;

    try {
      if (page === 1 && !isRefresh && !q) setLoading(true);
      if (page === 1 && !isRefresh && q) setSearching(true);
      if (isRefresh) setRefreshing(true);
      if (page > 1) setLoadingMore(true);

      const response = await api.get("/payments", {
        params: { page, limit: PAGE_SIZE, ...(q ? { search: q } : {}) },
      });

      // A newer request has started — ignore this stale response.
      if (myRequestId !== requestIdRef.current) return;

      if (response.data?.success) {
        const newPayments = response.data.data || [];

        setPayments((prev) =>
          page === 1 ? newPayments : [...prev, ...newPayments],
        );

        setHasMore(Boolean(response.data.hasMore));
        pageRef.current = page;

        // Summary is only sent by the API for page 1 — keep whatever we
        // already have otherwise.
        if (response.data.todaySummary) {
          setTodaySummary(response.data.todaySummary);
        }

        setError("");
      }
    } catch (err) {
      if (myRequestId !== requestIdRef.current) return;

      console.error(
        "Payment History Error:",
        err?.response?.data || err?.message,
      );

      setError(
        err?.response?.data?.message || "Failed to load payment history",
      );
    } finally {
      if (myRequestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        setSearching(false);
        fetchingRef.current = false;
      }
    }
  };

  useEffect(() => {
    fetchPage({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Debounce the typed text into the query that hits the server ----
  useEffect(() => {
    const t = setTimeout(
      () => setSearchQuery(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [searchInput]);

  // ---- Debounced query changed: refetch page 1 with the new search ----
  useEffect(() => {
    if (isFirstSearchEffect.current) {
      isFirstSearchEffect.current = false;
      return;
    }

    searchQueryRef.current = searchQuery;
    setHasMore(true);
    listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
    fetchPage({ page: 1, search: searchQuery });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleRefresh = useCallback(() => {
    setHasMore(true);
    fetchPage({ page: 1, isRefresh: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadMore = useCallback(() => {
    if (
      loading ||
      refreshing ||
      loadingMore ||
      !hasMore ||
      fetchingRef.current
    ) {
      return;
    }

    fetchPage({ page: pageRef.current + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, refreshing, loadingMore, hasMore]);

  const handleClearSearch = () => {
    setSearchInput("");
    setSearchQuery(""); // clear immediately, don't wait for the debounce
  };

  // Instant, on-device filtering of whatever rows are already loaded —
  // results react to every keystroke, while the debounced server search
  // catches up in the background and brings in matches from pages that
  // haven't been loaded yet.
  const liveQuery = searchInput.trim().toLowerCase();
  const visiblePayments = useMemo(
    () =>
      liveQuery
        ? payments.filter((p) => matchesSearch(p, liveQuery))
        : payments,
    [payments, liveQuery],
  );

  /* =========================================================
     SUMMARY BAR — single compact card, 3 stats in a row
  ========================================================= */
  const renderSummary = () => {
    return (
      <View style={styles.summaryContainer}>
        <View style={styles.summaryTopRow}>
          <Text style={styles.summaryTitle}>Today's Collection</Text>

          <Text style={styles.todayDate}>
            {new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
            })}
          </Text>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>TOTAL</Text>

            <Text style={styles.statValue}>
              {formatCurrency(todaySummary.totalCollection)}
            </Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statCell}>
            <Text style={styles.statLabel}>CASH</Text>

            <Text style={[styles.statValue, styles.statValueCash]}>
              {formatCurrency(todaySummary.cash)}
            </Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statCell}>
            <Text style={styles.statLabel}>PHONEPE</Text>

            <Text style={[styles.statValue, styles.statValuePhonePe]}>
              {formatCurrency(todaySummary.phonePe)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  /* =========================================================
     SECONDARY LINE — method, mixed breakdown, collected by
  ========================================================= */

  const buildSecondaryLine = (item) => {
    const method = String(item?.paymentMethod || "").toLowerCase();
    const createdBy =
      item?.createdBy?.name || item?.createdBy?.fullName || "Unknown";

    if (method === "mixed") {
      const cash = Number(item?.paymentBreakdown?.cash) || 0;
      const phonePe = Number(item?.paymentBreakdown?.phonePe) || 0;
      const razorpay = Number(item?.paymentBreakdown?.razorpay) || 0;

      const parts = [];
      if (cash > 0) parts.push(`Cash ${formatCurrency(cash)}`);
      if (phonePe > 0) parts.push(`PhonePe ${formatCurrency(phonePe)}`);
      if (razorpay > 0) parts.push(`Razorpay ${formatCurrency(razorpay)}`);

      return parts.length ? parts.join("  ·  ") : "Mixed";
    }

    return `${getPaymentMethodLabel(item?.paymentMethod)}  ·  ${createdBy}`;
  };

  /* =========================================================
     PAYMENT ROW — dense, single card, single secondary line
  ========================================================= */

  const renderPaymentItem = useCallback(({ item }) => {
    const isRefund = item?.type === "refund";
    const paymentAmount = Number(item?.amount) || 0;
    const note = item?.note?.trim();

    return (
      <View style={styles.paymentCard}>
        <View style={[styles.typeIcon, isRefund && styles.refundIcon]}>
          <Text
            style={[styles.typeIconText, isRefund && styles.refundIconText]}
          >
            {getPaymentTypeIcon(item?.type)}
          </Text>
        </View>

        <View style={styles.paymentBody}>
          <View style={styles.paymentTopRow}>
            <Text style={styles.paymentType} numberOfLines={1}>
              {getPaymentTypeLabel(item?.type)}
            </Text>

            <Text
              style={[styles.paymentAmount, isRefund && styles.refundAmount]}
            >
              {isRefund ? "-" : ""}
              {formatCurrency(paymentAmount)}
            </Text>
          </View>

          <View style={styles.paymentBottomRow}>
            <Text style={styles.secondaryText} numberOfLines={1}>
              {buildSecondaryLine(item)}
            </Text>
            <Text style={styles.paymentType} numberOfLines={1}>
              {item?.vehicle?.vehicleName ||
                item?.vehicle?.vehicleId?.vehicleName ||
                "Vehicle"}
            </Text>
            <Text style={styles.dateText}>
              {formatDate(item?.createdAt)} · {formatTime(item?.createdAt)}
            </Text>
          </View>

          {!!note && (
            <Text style={styles.noteText} numberOfLines={2}>
              {note}
            </Text>
          )}
        </View>
      </View>
    );
  }, []);

  const renderEmptyState = () => {
    if (loading) return null;

    if (searching) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color="#4F46E5" />
          <Text style={[styles.emptyDescription, { marginTop: 10 }]}>
            Searching…
          </Text>
        </View>
      );
    }

    if (searchInput.trim()) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>?</Text>
          </View>

          <Text style={styles.emptyTitle}>No matching payments</Text>

          <Text style={styles.emptyDescription}>
            {`Nothing matches "${searchInput.trim()}". Try a vehicle name, amount, payment method or collector name.`}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconText}>₹</Text>
        </View>

        <Text style={styles.emptyTitle}>No payments yet</Text>

        <Text style={styles.emptyDescription}>
          Payment transactions for this booking will appear here.
        </Text>
      </View>
    );
  };

  const renderErrorState = () => {
    if (!error) return null;

    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>

        <Text style={styles.errorTitle}>Unable to load payment history</Text>

        <Text style={styles.errorDescription}>{error}</Text>

        <Pressable
          onPress={() => fetchPage({ page: 1 })}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Retry loading payment history"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  };

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerLoading}>
          <ActivityIndicator size="small" color="#4F46E5" />
        </View>
      );
    }

    if (visiblePayments.length > 0 && !hasMore) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {liveQuery
              ? "End of search results."
              : "All payment transactions are displayed above."}
          </Text>
        </View>
      );
    }

    return null;
  };

  const Header = () => (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.back()}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={styles.backButtonText}>‹</Text>
      </Pressable>

      <View style={styles.headerContent}>
        <Text style={styles.headerTitle}>Payment History</Text>
        <Text style={styles.headerSubtitle}>Booking Payment Ledger</Text>
      </View>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />

        <View style={styles.loadingContainer}>
          <View style={styles.skeletonSummary}>
            <View style={styles.skeletonLineLarge} />
            <View style={styles.skeletonStatRow}>
              <View style={styles.skeletonStatCell} />
              <View style={styles.skeletonStatCell} />
              <View style={styles.skeletonStatCell} />
            </View>
          </View>

          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonPayment}>
              <View style={styles.skeletonCircle} />
              <View style={styles.skeletonPaymentContent}>
                <View style={styles.skeletonLineMedium} />
                <View style={styles.skeletonLineSmall} />
              </View>
              <View style={styles.skeletonAmount} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header />

      {/* Search bar — rendered inline (not as an inner component) so the
          TextInput keeps focus while the list re-renders. */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Text style={styles.searchGlyph}>⌕</Text>

          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search vehicle, amount, method or collector"
            placeholderTextColor="#9BA1AB"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />

          {searching ? (
            <ActivityIndicator size="small" color="#4F46E5" />
          ) : searchInput.length > 0 ? (
            <Pressable
              onPress={handleClearSearch}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Text style={styles.searchClear}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {error && payments.length === 0 ? (
        <FlatList
          data={[]}
          keyExtractor={() => "empty"}
          ListHeaderComponent={renderErrorState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={styles.errorListContainer}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={visiblePayments}
          keyExtractor={(item, index) => item?._id || `payment-${index}`}
          renderItem={renderPaymentItem}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.listContent,
            visiblePayments.length === 0 && styles.emptyListContent,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          // Perf: avoid re-rendering/measuring off-screen rows unnecessarily
          initialNumToRender={PAGE_SIZE}
          maxToRenderPerBatch={PAGE_SIZE}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            <>
              {renderSummary()}

              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>
                  {liveQuery ? "Search results" : "Transactions"}
                </Text>
                <Text style={styles.historySubtitle}>
                  {visiblePayments.length}{" "}
                  {liveQuery
                    ? visiblePayments.length === 1
                      ? "result"
                      : "results"
                    : visiblePayments.length === 1
                      ? "entry"
                      : "entries"}
                  {liveQuery && hasMore ? " (scroll for more)" : ""}
                </Text>
              </View>
            </>
          }
          ListEmptyComponent={renderEmptyState}
          ListFooterComponent={renderFooter}
        />
      )}
    </SafeAreaView>
  );
};

export default PaymentHistoryScreen;

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },

  /* HEADER — slimmer */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E7E9ED",
  },

  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  backButtonText: {
    fontSize: 28,
    lineHeight: 30,
    color: "#111827",
    fontWeight: "300",
  },

  headerContent: { flex: 1, marginTop: 22 },

  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },

  headerSubtitle: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 1,
  },

  /* SEARCH */
  searchSection: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E7E9ED",
  },

  searchGlyph: {
    fontSize: 20,
    color: "#9BA1AB",
    marginRight: 8,
    marginTop: -2,
  },

  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: "#111827",
    paddingVertical: 0,
  },

  searchClear: {
    fontSize: 14,
    color: "#9BA1AB",
    fontWeight: "700",
    paddingLeft: 8,
  },

  /* LIST */
  listContent: {
    padding: 12,
    paddingBottom: 24,
  },

  emptyListContent: { flexGrow: 1 },

  /* SUMMARY — one compact card, no stacked boxes */
  summaryContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 13,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E7E9ED",
  },

  summaryTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  summaryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  statusBadgePaid: { backgroundColor: "#EAF8F0" },
  statusBadgePending: { backgroundColor: "#FFF5E6" },

  statusBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  statusTextPaid: { color: "#16834B" },
  statusTextPending: { color: "#B76B00" },

  statRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  statCell: {
    flex: 1,
    alignItems: "center",
  },

  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#EEF0F2",
  },

  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#9BA1AB",
    letterSpacing: 0.5,
  },

  statValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    marginTop: 4,
  },

  statValuePaid: { color: "#16834B" },
  statValueDue: { color: "#B76B00" },

  /* SECTION HEADER */
  historyHeader: {
    marginBottom: 8,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },

  historyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },

  historySubtitle: {
    fontSize: 11,
    color: "#9BA1AB",
  },

  /* PAYMENT ROW — dense, single line of metadata */
  paymentCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 13,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E7E9ED",
  },

  typeIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  typeIconText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#4F46E5",
  },

  refundIcon: { backgroundColor: "#FFF0F0" },
  refundIconText: { color: "#D63B3B" },

  paymentBody: { flex: 1 },

  paymentTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  paymentType: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    marginRight: 8,
  },

  paymentAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: "#16834B",
  },

  refundAmount: { color: "#D63B3B" },

  paymentBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 3,
  },

  secondaryText: {
    flex: 1,
    fontSize: 11,
    color: "#7A818C",
    marginRight: 8,
  },

  dateText: {
    fontSize: 10,
    color: "#9BA1AB",
  },

  noteText: {
    fontSize: 11,
    lineHeight: 15,
    color: "#6B7280",
    marginTop: 5,
    fontStyle: "italic",
  },

  /* EMPTY */
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 35,
    minHeight: 360,
  },

  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  emptyIconText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#4F46E5",
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },

  emptyDescription: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: "#7A818C",
    marginTop: 6,
  },

  /* ERROR */
  errorListContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },

  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  errorIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#FFF0F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  errorIconText: {
    fontSize: 23,
    fontWeight: "900",
    color: "#D63B3B",
  },

  errorTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },

  errorDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 6,
  },

  retryButton: {
    marginTop: 16,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#111827",
  },

  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  /* FOOTER */
  footer: {
    paddingVertical: 14,
    alignItems: "center",
  },

  footerLoading: {
    paddingVertical: 18,
    alignItems: "center",
  },

  footerText: {
    fontSize: 10,
    color: "#9CA3AF",
  },

  /* LOADING */
  loadingContainer: {
    flex: 1,
    padding: 12,
  },

  skeletonSummary: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: "#E7E9ED",
    marginBottom: 12,
  },

  skeletonLineLarge: {
    width: "40%",
    height: 13,
    borderRadius: 6,
    backgroundColor: "#E8EAED",
    marginBottom: 14,
  },

  skeletonStatRow: {
    flexDirection: "row",
    gap: 10,
  },

  skeletonStatCell: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#E8EAED",
  },

  skeletonPayment: {
    height: 62,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7E9ED",
    marginBottom: 8,
    padding: 10,
    flexDirection: "row",
  },

  skeletonCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#E8EAED",
  },

  skeletonPaymentContent: {
    flex: 1,
    marginLeft: 10,
    justifyContent: "center",
  },

  skeletonLineMedium: {
    width: "60%",
    height: 11,
    borderRadius: 6,
    backgroundColor: "#E8EAED",
  },

  skeletonLineSmall: {
    width: "40%",
    height: 9,
    borderRadius: 5,
    backgroundColor: "#E8EAED",
    marginTop: 7,
  },

  skeletonAmount: {
    width: 55,
    height: 13,
    borderRadius: 6,
    backgroundColor: "#E8EAED",
    alignSelf: "center",
  },
});
