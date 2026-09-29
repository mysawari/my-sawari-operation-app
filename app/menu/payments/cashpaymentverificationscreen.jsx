import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

import api from "../../../services/api";

/* =========================================================
   CONFIG
========================================================= */

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

const COLLECT_CASH_ENDPOINT = (paymentId) =>
  `/payments/${paymentId}/collect-cash`;

const TABS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "pending", label: "Pending" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];

// Tabs whose data is server-paginated — search on these is sent to the
// server (so it can find matches on pages that aren't loaded yet).
// Today / Yesterday are loaded in full on the device, so they're searched
// locally.
const SERVER_SEARCH_TABS = new Set(["pending", "completed", "all"]);

const SECTION_COPY = {
  today: {
    title: "Today's Payments",
    subtitle: "Pending and collected cash payments for today",
  },
  yesterday: {
    title: "Yesterday's Payments",
    subtitle: "Pending and collected cash payments from yesterday",
  },
  pending: {
    title: "Pending Payments",
    subtitle: "Cash and mixed payments waiting for collection",
  },
  completed: {
    title: "All Completed Collections",
    subtitle: "Full history of collected cash payments",
  },
  all: {
    title: "All Cash & Mixed Payments",
    subtitle: "Every cash payment, pending or collected",
  },
};

const EMPTY_COPY = {
  today: {
    title: "No payments today",
    description: "Cash payments dated today will show up here.",
  },
  yesterday: {
    title: "No payments yesterday",
    description: "Cash payments dated yesterday will show up here.",
  },
  pending: {
    title: "No pending payments",
    description: "All cash payments have been collected.",
  },
  completed: {
    title: "No completed collections",
    description:
      "Collected cash payments will appear here once you start collecting.",
  },
  all: {
    title: "No cash payments found",
    description: "Cash and mixed payments will appear here as they're created.",
  },
};

/* =========================================================
   HELPERS
========================================================= */

const formatCurrency = (amount) => {
  const value = Number(amount) || 0;

  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
};

const formatDate = (dateValue) => {
  if (!dateValue) return "Date unavailable";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
};

const formatTime = (dateValue) => {
  if (!dateValue) return "";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const formatDateTime = (dateValue) => {
  const d = formatDate(dateValue);
  const t = formatTime(dateValue);
  return t ? `${d} · ${t}` : d;
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

const getCreatedByName = (item) => {
  return (
    item?.createdBy?.name ||
    item?.createdBy?.fullName ||
    item?.createdBy?.username ||
    item?.createdBy?.email ||
    "Unknown"
  );
};

const isMixedPayment = (payment) => {
  return String(payment?.paymentMethod || "").toLowerCase() === "mixed";
};

// The amount to actually display on a card: what's still owed for a
// pending payment, or what was collected for a completed one.
const getDisplayAmount = (payment) => {
  if (payment?.isCollected) {
    return Number(payment?.collectedAmount) || 0;
  }

  if (
    payment?.remainingAmount !== undefined &&
    payment?.remainingAmount !== null
  ) {
    return Number(payment.remainingAmount) || 0;
  }

  const method = String(payment?.paymentMethod || "").toLowerCase();

  const collectible =
    method === "mixed"
      ? Number(payment?.paymentBreakdown?.cash) || 0
      : Number(payment?.amount) || 0;

  const alreadyCollected = Number(payment?.collectedAmount) || 0;

  return Math.max(0, collectible - alreadyCollected);
};

/* =========================================================
   SEARCH HELPERS
   Every word typed must match somewhere in the row (order
   doesn't matter). Searchable: customer name, phone, vehicle,
   payment type, who recorded / collected it, amount, date,
   and status words ("pending", "collected", "mixed", "cash").
========================================================= */

const normalizeToken = (s) => s.replace(/[₹,]/g, "");
const compactText = (s) => s.replace(/[\s\-_.]/g, "");

const matchesSearch = (item, query) => {
  const displayAmount = getDisplayAmount(item);
  const rawAmount = Number(item?.amount) || 0;
  const collectedAmount = Number(item?.collectedAmount) || 0;

  const hay = [
    item?.customer?.fullName,
    item?.customer?.mobileNumber,
    item?.vehicle?.vehicleName,
    item?.vehicle?.vehicleNumber,
    item?.type,
    getPaymentTypeLabel(item?.type),
    getCreatedByName(item),
    item?.lastCollectedByName,
    item?.isCollected ? "collected" : "pending",
    isMixedPayment(item) ? "mixed" : "cash",
    String(displayAmount),
    String(rawAmount),
    String(collectedAmount),
    formatCurrency(displayAmount),
    formatDate(item?.createdAt),
    item?.lastCollectedAt ? formatDate(item.lastCollectedAt) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/,/g, "");

  const hayCompact = compactText(hay);

  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((rawToken) => {
      const token = normalizeToken(rawToken);
      return hay.includes(token) || hayCompact.includes(compactText(token));
    });
};

const normalizeStats = (raw) => ({
  pending: {
    count: Number.isFinite(Number(raw?.pending?.count))
      ? Number(raw.pending.count)
      : 0,
    amount: Number.isFinite(Number(raw?.pending?.amount))
      ? Number(raw.pending.amount)
      : 0,
  },
  collectedToday: {
    count: Number.isFinite(Number(raw?.collectedToday?.count))
      ? Number(raw.collectedToday.count)
      : 0,
    amount: Number.isFinite(Number(raw?.collectedToday?.amount))
      ? Number(raw.collectedToday.amount)
      : 0,
  },
  collectedTotal: {
    count: Number.isFinite(Number(raw?.collectedTotal?.count))
      ? Number(raw.collectedTotal.count)
      : 0,
    amount: Number.isFinite(Number(raw?.collectedTotal?.amount))
      ? Number(raw.collectedTotal.amount)
      : 0,
  },
  all: {
    count: Number.isFinite(Number(raw?.all?.count)) ? Number(raw.all.count) : 0,
  },
});

const computeLocalSummary = (items) => {
  let pendingCount = 0;
  let pendingAmount = 0;
  let collectedCount = 0;
  let collectedAmount = 0;

  (items || []).forEach((item) => {
    const amount = getDisplayAmount(item);

    if (item?.isCollected) {
      collectedCount += 1;
      collectedAmount += amount;
    } else {
      pendingCount += 1;
      pendingAmount += amount;
    }
  });

  return {
    pendingCount,
    pendingAmount: Number(pendingAmount.toFixed(2)),
    collectedCount,
    collectedAmount: Number(collectedAmount.toFixed(2)),
  };
};

// What the summary card shows depends on which tab is active — each
// tab surfaces the number that's most relevant to what you're looking
// at, with one supporting number for context.
const getSummaryConfig = (tab, stats, tabsData) => {
  const plural = (count) => (count === 1 ? "payment" : "payments");

  if (tab === "today") {
    const local = computeLocalSummary(tabsData?.today?.items);
    const totalToday = local.pendingCount + local.collectedCount;

    return {
      badgeLabel: `${totalToday} TODAY`,
      blocks: [
        {
          label: "COLLECTED TODAY",
          value: local.collectedAmount,
          sub: `${local.collectedCount} ${plural(local.collectedCount)}`,
          tone: "collected",
        },
        {
          label: "PENDING TODAY",
          value: local.pendingAmount,
          sub: `${local.pendingCount} ${plural(local.pendingCount)}`,
          tone: "pending",
        },
      ],
    };
  }

  if (tab === "yesterday") {
    const local = computeLocalSummary(tabsData?.yesterday?.items);
    const totalYesterday = local.pendingCount + local.collectedCount;

    return {
      badgeLabel: `${totalYesterday} YESTERDAY`,
      blocks: [
        {
          label: "COLLECTED YESTERDAY",
          value: local.collectedAmount,
          sub: `${local.collectedCount} ${plural(local.collectedCount)}`,
          tone: "collected",
        },
        {
          label: "PENDING YESTERDAY",
          value: local.pendingAmount,
          sub: `${local.pendingCount} ${plural(local.pendingCount)}`,
          tone: "pending",
        },
      ],
    };
  }

  const pending = stats.pending;
  const today = stats.collectedToday;
  const completed = stats.collectedTotal;
  const all = stats.all;

  if (tab === "pending") {
    return {
      badgeLabel: `${pending.count} PENDING`,
      blocks: [
        {
          label: "PENDING AMOUNT",
          value: pending.amount,
          sub: `${pending.count} ${plural(pending.count)}`,
          tone: "pending",
        },
        {
          label: "COLLECTED TODAY",
          value: today.amount,
          sub: `${today.count} ${plural(today.count)}`,
          tone: "collected",
        },
      ],
    };
  }

  if (tab === "completed") {
    return {
      badgeLabel: `${completed.count} COLLECTED`,
      blocks: [
        {
          label: "TOTAL COLLECTED",
          value: completed.amount,
          sub: `${completed.count} ${plural(completed.count)}`,
          tone: "collected",
        },
        {
          label: "COLLECTED TODAY",
          value: today.amount,
          sub: `${today.count} ${plural(today.count)}`,
          tone: "collected",
        },
      ],
    };
  }

  // "all" (default)
  return {
    badgeLabel: `${all.count} TOTAL`,
    blocks: [
      {
        label: "PENDING",
        value: pending.amount,
        sub: `${pending.count} ${plural(pending.count)}`,
        tone: "pending",
      },
      {
        label: "COLLECTED",
        value: completed.amount,
        sub: `${completed.count} ${plural(completed.count)}`,
        tone: "collected",
      },
    ],
  };
};

const startOfTodayIso = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const endOfTodayIso = () => {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
};

const startOfYesterdayIso = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const endOfYesterdayIso = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
};

// Safety cap on how many status="all" pages we'll scan while hunting
// for a day's worth of items. Matches the backend's own scale note
// ("hundreds/low thousands of records") — comfortably enough pages to
// walk past several days of activity even at a busy branch.
const DATE_SCAN_MAX_PAGES = 40;
const DATE_SCAN_PAGE_SIZE = 50;

// Walks status="all" pages (already sorted newest-first by createdAt
// on the server) and collects every item whose OWN createdAt falls
// within [rangeStartIso, rangeEndIso]. Items newer than the range are
// skipped but scanning continues (needed for "yesterday", since
// today's items come first); the scan stops as soon as an item older
// than the range start is seen, since nothing further back can match
// either. Returns the matched items plus whatever `stats` object came
// back on the last successful request (stats are exact/global on
// every response regardless of query).
const fetchDateScopedItems = async (rangeStartIso, rangeEndIso) => {
  const rangeStart = new Date(rangeStartIso).getTime();
  const rangeEnd = new Date(rangeEndIso).getTime();

  const collected = [];
  let stats = null;
  let page = 1;

  while (page <= DATE_SCAN_MAX_PAGES) {
    // eslint-disable-next-line no-await-in-loop
    const response = await api.get("/payments/pending", {
      params: { page, limit: DATE_SCAN_PAGE_SIZE, status: "all" },
    });

    if (!response.data?.success) {
      return {
        success: false,
        message: response.data?.message || "Failed to load payment data",
        items: collected,
        stats,
      };
    }

    if (response.data?.stats) {
      stats = response.data.stats;
    }

    const batch = Array.isArray(response.data?.data) ? response.data.data : [];

    let hitOlderThanRange = false;

    for (let i = 0; i < batch.length; i += 1) {
      const item = batch[i];
      const createdTime = new Date(item?.createdAt).getTime();

      if (!Number.isFinite(createdTime)) continue;

      if (createdTime > rangeEnd) {
        // Newer than the target day — keep scanning past it.
        continue;
      }

      if (createdTime < rangeStart) {
        // Older than the target day — everything after this in the
        // (newest-first) list is older still, so we're done.
        hitOlderThanRange = true;
        break;
      }

      collected.push(item);
    }

    if (hitOlderThanRange || !response.data?.hasMore) {
      break;
    }

    page += 1;
  }

  return { success: true, items: collected, stats };
};

const buildTabParams = (tab, page) => {
  const params = { page, limit: PAGE_SIZE };

  if (tab === "pending") {
    params.status = "pending";
  } else if (tab === "completed") {
    params.status = "collected";
  } else {
    // "all" (also used as the base query inside fetchDateScopedItems
    // for the today/yesterday tabs — see NOTE above)
    params.status = "all";
  }

  return params;
};

const createEmptyTabState = (initialLoading = false) => ({
  items: [],
  page: 1,
  hasMore: true,
  total: 0,
  loading: initialLoading,
  refreshing: false,
  loadingMore: false,
  error: "",
  loadedOnce: false,
});

// Server-search results live in their own state (separate from each
// tab's normal browse list), so searching never overwrites what's
// cached for a tab and clearing the search instantly restores it.
const createEmptySearchState = () => ({
  tab: null,
  query: "",
  items: [],
  page: 1,
  hasMore: false,
  total: 0,
  loading: false,
  refreshing: false,
  loadingMore: false,
  error: "",
  loaded: false,
});

/* =========================================================
   CURRENT USER
========================================================= */

const getCurrentUserName = async () => {
  /*
   * Tries a few common AsyncStorage keys used across the app.
   * If your auth system uses a different key, add it here.
   */

  const possibleKeys = [
    "user",
    "currentUser",
    "authUser",
    "userData",
    "profile",
  ];

  for (const key of possibleKeys) {
    try {
      const value = await AsyncStorage.getItem(key);

      if (!value) continue;

      try {
        const parsed = JSON.parse(value);

        const name =
          parsed?.name ||
          parsed?.fullName ||
          parsed?.username ||
          parsed?.user?.name ||
          parsed?.user?.fullName ||
          parsed?.user?.username;

        if (name) {
          return String(name);
        }
      } catch {
        // The stored value itself might just be a plain name string.
        if (value.trim()) {
          return value.trim();
        }
      }
    } catch (storageError) {
      console.log(
        `Unable to read AsyncStorage key "${key}":`,
        storageError?.message,
      );
    }
  }

  return "Current User";
};

/* =========================================================
   SCREEN
========================================================= */

const CashPaymentVerificationScreen = () => {
  /* =======================================================
     STATE
  ======================================================= */

  const [activeTab, setActiveTab] = useState("today");

  const [tabsData, setTabsData] = useState(() => ({
    today: createEmptyTabState(true),
    yesterday: createEmptyTabState(false),
    pending: createEmptyTabState(false),
    completed: createEmptyTabState(false),
    all: createEmptyTabState(false),
  }));

  const [stats, setStats] = useState(() => normalizeStats(null));

  const [currentUserName, setCurrentUserName] = useState("Current User");

  const [collectingId, setCollectingId] = useState(null);

  // ---- Search state ----
  // searchInput: what's typed (instant). debouncedQuery: the value that
  // actually goes to the server (only for server-paginated tabs).
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchState, setSearchState] = useState(createEmptySearchState);

  const fetchingRef = useRef({});

  const searchSeqRef = useRef(0);
  const searchFetchingRef = useRef(false);

  // Guards against out-of-order responses: if the user refreshes twice
  // fast, or switches tabs and back before the first request lands, a
  // late/slow response must never overwrite the result of a newer
  // request for the same tab.
  const requestSeqRef = useRef({
    today: 0,
    yesterday: 0,
    pending: 0,
    completed: 0,
    all: 0,
  });

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /* =======================================================
     LOAD CURRENT USER
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      const name = await getCurrentUserName();

      if (!cancelled && isMountedRef.current) {
        setCurrentUserName(name);
      }
    };

    loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =======================================================
     FETCH A TAB'S DATA
  ======================================================= */

  const updateTabState = useCallback((tab, updater) => {
    setTabsData((previous) => ({
      ...previous,
      [tab]: updater(previous[tab]),
    }));
  }, []);

  const fetchTab = useCallback(
    async (tab, { page = 1, isRefresh = false } = {}) => {
      if (fetchingRef.current[tab]) {
        return;
      }

      fetchingRef.current[tab] = true;

      const mySeq = ++requestSeqRef.current[tab];

      const isDateScoped = tab === "today" || tab === "yesterday";

      updateTabState(tab, (state) => ({
        ...state,
        loading: page === 1 && !isRefresh ? true : state.loading,
        refreshing: isRefresh,
        loadingMore: !isDateScoped && page > 1,
      }));

      try {
        if (isDateScoped) {
          // Today/Yesterday are small, bounded, single-shot loads —
          // no incremental "load more" pagination. Re-fetched in full
          // on every call (initial load, tab switch, or pull-to-refresh).
          const rangeStartIso =
            tab === "today" ? startOfTodayIso() : startOfYesterdayIso();
          const rangeEndIso =
            tab === "today" ? endOfTodayIso() : endOfYesterdayIso();

          const result = await fetchDateScopedItems(rangeStartIso, rangeEndIso);

          if (!isMountedRef.current) return;
          if (requestSeqRef.current[tab] !== mySeq) return;

          if (result.success) {
            updateTabState(tab, (state) => ({
              ...state,
              items: result.items,
              hasMore: false,
              total: result.items.length,
              page: 1,
              loading: false,
              refreshing: false,
              loadingMore: false,
              error: "",
              loadedOnce: true,
            }));

            if (result.stats) {
              setStats(normalizeStats(result.stats));
            }
          } else {
            updateTabState(tab, (state) => ({
              ...state,
              loading: false,
              refreshing: false,
              loadingMore: false,
              error: result.message || "Failed to load payment data",
              loadedOnce: true,
            }));
          }

          return;
        }

        const response = await api.get("/payments/pending", {
          params: buildTabParams(tab, page),
        });

        if (!isMountedRef.current) return;

        // A newer request for this same tab has already been fired
        // (and possibly already resolved) — this response is stale,
        // discard it so it can't clobber fresher data on screen.
        if (requestSeqRef.current[tab] !== mySeq) {
          return;
        }

        if (response.data?.success) {
          const newItems = Array.isArray(response.data?.data)
            ? response.data.data
            : [];

          const serverTotal = Number(response.data?.total);

          updateTabState(tab, (state) => ({
            ...state,
            items: page === 1 ? newItems : [...state.items, ...newItems],
            hasMore: Boolean(response.data?.hasMore),
            total: Number.isFinite(serverTotal) ? serverTotal : state.total,
            page,
            loading: false,
            refreshing: false,
            loadingMore: false,
            error: "",
            loadedOnce: true,
          }));

          if (response.data?.stats) {
            setStats(normalizeStats(response.data.stats));
          }
        } else {
          updateTabState(tab, (state) => ({
            ...state,
            loading: false,
            refreshing: false,
            loadingMore: false,
            error: response.data?.message || "Failed to load payment data",
            loadedOnce: true,
          }));
        }
      } catch (err) {
        console.error(
          "Cash Verification Fetch Error:",
          err?.response?.data || err?.message,
        );

        if (isMountedRef.current && requestSeqRef.current[tab] === mySeq) {
          updateTabState(tab, (state) => ({
            ...state,
            loading: false,
            refreshing: false,
            loadingMore: false,
            error:
              err?.response?.data?.message ||
              "Failed to load payment data. Pull down to retry.",
            loadedOnce: true,
          }));
        }
      } finally {
        fetchingRef.current[tab] = false;
      }
    },
    [updateTabState],
  );

  /* =======================================================
     SERVER SEARCH (pending / completed / all tabs)
     Kept separate from the tab's browse list so searching
     never overwrites cached pages. Summary stats are NOT
     updated from search responses (they may be query-scoped).
  ======================================================= */

  const fetchSearch = useCallback(
    async (tab, query, { page = 1, isRefresh = false } = {}) => {
      // "Load more" must not double-fire, but page-1 requests (new
      // query / refresh / retry) always supersede whatever is in flight.
      if (page > 1 && searchFetchingRef.current) return;

      const mySeq = ++searchSeqRef.current;
      searchFetchingRef.current = true;

      setSearchState((previous) => {
        const sameQuery = previous.tab === tab && previous.query === query;
        const base =
          page === 1 && !isRefresh && !sameQuery
            ? createEmptySearchState()
            : previous;

        return {
          ...base,
          tab,
          query,
          loading: page === 1 && !isRefresh,
          refreshing: isRefresh,
          loadingMore: page > 1,
          error: "",
        };
      });

      try {
        const response = await api.get("/payments/pending", {
          params: { ...buildTabParams(tab, page), search: query },
        });

        if (!isMountedRef.current) return;
        if (searchSeqRef.current !== mySeq) return;

        if (response.data?.success) {
          const newItems = Array.isArray(response.data?.data)
            ? response.data.data
            : [];

          const serverTotal = Number(response.data?.total);

          setSearchState((previous) => {
            const merged =
              page === 1 ? newItems : [...previous.items, ...newItems];

            return {
              ...previous,
              items: merged,
              hasMore: Boolean(response.data?.hasMore),
              total: Number.isFinite(serverTotal) ? serverTotal : merged.length,
              page,
              loading: false,
              refreshing: false,
              loadingMore: false,
              error: "",
              loaded: true,
            };
          });
        } else {
          setSearchState((previous) => ({
            ...previous,
            loading: false,
            refreshing: false,
            loadingMore: false,
            error: response.data?.message || "Search failed",
          }));
        }
      } catch (err) {
        console.error(
          "Cash Verification Search Error:",
          err?.response?.data || err?.message,
        );

        if (isMountedRef.current && searchSeqRef.current === mySeq) {
          setSearchState((previous) => ({
            ...previous,
            loading: false,
            refreshing: false,
            loadingMore: false,
            error:
              err?.response?.data?.message ||
              "Search failed. Check your connection and try again.",
          }));
        }
      } finally {
        if (searchSeqRef.current === mySeq) {
          searchFetchingRef.current = false;
        }
      }
    },
    [],
  );

  // Debounce the typed text into the query that hits the server.
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQuery(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Debounced query (or tab) changed → run / clear the server search.
  useEffect(() => {
    if (!debouncedQuery) {
      // Cancel any in-flight search and drop its results.
      searchSeqRef.current += 1;
      searchFetchingRef.current = false;
      setSearchState((previous) =>
        previous.tab === null ? previous : createEmptySearchState(),
      );
      return;
    }

    if (SERVER_SEARCH_TABS.has(activeTab)) {
      fetchSearch(activeTab, debouncedQuery, { page: 1 });
    }
  }, [debouncedQuery, activeTab, fetchSearch]);

  /* =======================================================
     INITIAL LOAD (Today tab only — others load lazily)
  ======================================================= */

  useEffect(() => {
    fetchTab("today", { page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =======================================================
     LAZY LOAD WHEN SWITCHING TABS
  ======================================================= */

  useEffect(() => {
    const state = tabsData[activeTab];

    if (state && !state.loadedOnce && !state.loading) {
      fetchTab(activeTab, { page: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /* =======================================================
     DERIVED SEARCH / LIST STATE
  ======================================================= */

  const tabsDataRef = useRef(tabsData);

  useEffect(() => {
    tabsDataRef.current = tabsData;
  }, [tabsData]);

  const activeState = tabsData[activeTab];

  const trimmedInput = searchInput.trim();
  const liveQuery = trimmedInput.toLowerCase();
  const isSearching = liveQuery.length > 0;
  const usesServerSearch = SERVER_SEARCH_TABS.has(activeTab);

  // Server results are "ready" once they've landed for exactly what's
  // currently typed, on the current tab.
  const serverResultsReady =
    isSearching &&
    usesServerSearch &&
    searchState.tab === activeTab &&
    searchState.query === trimmedInput &&
    searchState.loaded;

  const searchErrored =
    isSearching &&
    usesServerSearch &&
    searchState.tab === activeTab &&
    searchState.query === trimmedInput &&
    !!searchState.error;

  const searchInFlight =
    isSearching && usesServerSearch && !serverResultsReady && !searchErrored;

  // What the list actually shows:
  //  - not searching          → the tab's normal list
  //  - server results landed  → those results
  //  - otherwise              → instant on-device filter of the rows
  //                             already loaded (Today / Yesterday are
  //                             always fully loaded, so this is exact
  //                             for them)
  const displayItems = useMemo(() => {
    if (!isSearching) return activeState.items;
    if (serverResultsReady) return searchState.items;

    return activeState.items.filter((item) => matchesSearch(item, liveQuery));
  }, [
    isSearching,
    serverResultsReady,
    searchState.items,
    activeState.items,
    liveQuery,
  ]);

  const listRefreshing = serverResultsReady
    ? searchState.refreshing
    : activeState.refreshing;

  const listLoadingMore = serverResultsReady
    ? searchState.loadingMore
    : isSearching
      ? false
      : activeState.loadingMore;

  const showEndOfList =
    displayItems.length > 0 &&
    (isSearching
      ? serverResultsReady
        ? !searchState.hasMore
        : !usesServerSearch
      : !activeState.hasMore);

  /* =======================================================
     REFRESH / LOAD MORE (active tab)
  ======================================================= */

  const handleRefresh = useCallback(() => {
    if (isSearching && usesServerSearch) {
      fetchSearch(activeTab, trimmedInput, { page: 1, isRefresh: true });
      return;
    }

    fetchTab(activeTab, { page: 1, isRefresh: true });
  }, [
    activeTab,
    fetchTab,
    fetchSearch,
    isSearching,
    usesServerSearch,
    trimmedInput,
  ]);

  const handleLoadMore = useCallback(() => {
    if (isSearching) {
      if (
        serverResultsReady &&
        searchState.hasMore &&
        !searchState.loading &&
        !searchState.refreshing &&
        !searchState.loadingMore
      ) {
        fetchSearch(activeTab, searchState.query, {
          page: searchState.page + 1,
        });
      }

      return;
    }

    const state = tabsData[activeTab];

    if (
      !state ||
      state.loading ||
      state.refreshing ||
      state.loadingMore ||
      !state.hasMore ||
      fetchingRef.current[activeTab]
    ) {
      return;
    }

    fetchTab(activeTab, { page: state.page + 1 });
  }, [
    activeTab,
    tabsData,
    fetchTab,
    fetchSearch,
    isSearching,
    serverResultsReady,
    searchState,
  ]);

  const handleClearSearch = () => {
    setSearchInput("");
    setDebouncedQuery(""); // clear immediately, don't wait for the debounce
  };

  /* =======================================================
     COLLECT PAYMENT (real API call)
  ======================================================= */

  const collectPayment = useCallback(
    async (payment) => {
      const paymentId = payment?._id;
      const amount = getDisplayAmount(payment);

      if (!paymentId || amount <= 0) {
        return;
      }

      // Guard against double submission (e.g. fast double-tap).
      if (collectingId === paymentId) {
        return;
      }

      setCollectingId(paymentId);

      try {
        const response = await api.post(COLLECT_CASH_ENDPOINT(paymentId), {
          amount,
        });

        if (!isMountedRef.current) return;

        if (response?.data?.success) {
          const result = response.data?.data || {};

          const transactionAmount = Number(result.transactionAmount ?? amount);

          const collectedAt = result.collectedAt || new Date().toISOString();

          const collectedByName = result.collectedBy || currentUserName;

          const collectedItem = {
            ...payment,
            isCollected: true,
            remainingAmount: 0,
            collectedAmount: Number(
              result.totalCollectedAmount ?? transactionAmount,
            ),
            lastCollectedAt: collectedAt,
            lastCollectedByName: collectedByName,
          };

          // 1. "Today" tab shows both pending & collected — update the
          //    card in place (if it was loaded there) instead of
          //    removing it, so it flips to "Collected" without
          //    disappearing.
          updateTabState("today", (state) =>
            state.loadedOnce
              ? {
                  ...state,
                  items: state.items.map((p) =>
                    p?._id === paymentId ? { ...p, ...collectedItem } : p,
                  ),
                }
              : state,
          );

          // 2. Same for "Yesterday" — in case a same-day-collected but
          //    yesterday-created payment is being collected late.
          updateTabState("yesterday", (state) =>
            state.loadedOnce
              ? {
                  ...state,
                  items: state.items.map((p) =>
                    p?._id === paymentId ? { ...p, ...collectedItem } : p,
                  ),
                }
              : state,
          );

          // 3. "Pending" only ever shows still-pending payments, so a
          //    just-collected payment is removed from it outright
          //    (rather than updated in place, unlike Today/Yesterday/All).
          updateTabState("pending", (state) =>
            state.loadedOnce
              ? {
                  ...state,
                  items: state.items.filter((p) => p?._id !== paymentId),
                  total: Math.max(0, state.total - 1),
                }
              : state,
          );

          // 4. Prepend into "Completed", only if already loaded
          //    (otherwise it'll pick it up naturally on first visit /
          //    refresh).
          updateTabState("completed", (state) =>
            state.loadedOnce
              ? { ...state, items: [collectedItem, ...state.items] }
              : state,
          );

          // 5. Update it in place on the "All" tab if loaded.
          updateTabState("all", (state) =>
            state.loadedOnce
              ? {
                  ...state,
                  items: state.items.map((p) =>
                    p?._id === paymentId ? { ...p, ...collectedItem } : p,
                  ),
                }
              : state,
          );

          // 6. Keep any on-screen search results in sync too: on the
          //    Pending tab a collected payment drops out, elsewhere it
          //    flips to "Collected" in place.
          setSearchState((previous) => {
            if (!previous.items.length) return previous;

            return {
              ...previous,
              items:
                previous.tab === "pending"
                  ? previous.items.filter((p) => p?._id !== paymentId)
                  : previous.items.map((p) =>
                      p?._id === paymentId ? { ...p, ...collectedItem } : p,
                    ),
            };
          });

          // 7. Update summary stats immediately for snappy feedback.
          setStats((previous) => ({
            ...previous,
            pending: {
              count: Math.max(0, previous.pending.count - 1),
              amount: Math.max(
                0,
                Number(
                  (previous.pending.amount - transactionAmount).toFixed(2),
                ),
              ),
            },
            collectedToday: {
              count: previous.collectedToday.count + 1,
              amount: Number(
                (previous.collectedToday.amount + transactionAmount).toFixed(2),
              ),
            },
            collectedTotal: {
              count: previous.collectedTotal.count + 1,
              amount: Number(
                (previous.collectedTotal.amount + transactionAmount).toFixed(2),
              ),
            },
          }));
        } else {
          Alert.alert(
            "Couldn't collect payment",
            response?.data?.message || "Please try again.",
          );
        }
      } catch (err) {
        console.error(
          "Collect Cash Payment Error:",
          err?.response?.data || err?.message,
        );

        if (!isMountedRef.current) return;

        const isConflict = err?.response?.status === 409;

        if (isConflict) {
          // Someone else (another device/staff member) collected or
          // modified this payment between when it loaded on this
          // screen and when Collect was tapped. Don't retry — that
          // would just fail again. Instead, quietly resync the tabs
          // that would be affected, so the screen self-heals instead
          // of showing stale/wrong state.
          Alert.alert(
            "Already collected",
            err?.response?.data?.message ||
              "This payment was just collected by someone else. The list has been refreshed.",
          );

          fetchTab("today", { page: 1, isRefresh: true });

          if (tabsDataRef.current?.yesterday?.loadedOnce) {
            fetchTab("yesterday", { page: 1, isRefresh: true });
          }

          if (tabsDataRef.current?.pending?.loadedOnce) {
            fetchTab("pending", { page: 1, isRefresh: true });
          }

          if (tabsDataRef.current?.completed?.loadedOnce) {
            fetchTab("completed", { page: 1, isRefresh: true });
          }

          if (tabsDataRef.current?.all?.loadedOnce) {
            fetchTab("all", { page: 1, isRefresh: true });
          }

          if (debouncedQuery && SERVER_SEARCH_TABS.has(activeTab)) {
            fetchSearch(activeTab, debouncedQuery, {
              page: 1,
              isRefresh: true,
            });
          }
        } else {
          Alert.alert(
            "Couldn't collect payment",
            err?.response?.data?.message ||
              "Something went wrong. Check your connection and try again.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Retry",
                onPress: () => collectPayment(payment),
              },
            ],
          );
        }
      } finally {
        if (isMountedRef.current) {
          setCollectingId(null);
        }
      }
    },
    [
      currentUserName,
      collectingId,
      updateTabState,
      fetchTab,
      fetchSearch,
      activeTab,
      debouncedQuery,
    ],
  );

  const handleCollect = useCallback(
    (payment) => {
      if (!payment?._id) {
        Alert.alert("Unable to collect", "Payment ID is missing.");

        return;
      }

      const amount = getDisplayAmount(payment);

      if (amount <= 0) {
        Alert.alert(
          "Invalid amount",
          "This payment does not have a valid amount.",
        );

        return;
      }

      const mixedNote = isMixedPayment(payment)
        ? " (cash portion of a mixed payment)"
        : "";

      Alert.alert(
        "Confirm Cash Collection",
        `Are you sure you are collecting ${formatCurrency(amount)} in cash${mixedNote}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Yes, Collect",
            onPress: () => collectPayment(payment),
          },
        ],
      );
    },
    [collectPayment],
  );

  /* =======================================================
     HEADER
  ======================================================= */

  const Header = () => {
    return (
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
          <Text style={styles.headerTitle}>Cash Verification</Text>

          <Text style={styles.headerSubtitle}>
            Verify and collect cash payments
          </Text>
        </View>
      </View>
    );
  };

  /* =======================================================
     SUMMARY — always visible
  ======================================================= */

  const renderSummary = () => {
    const config = getSummaryConfig(activeTab, stats, tabsData);

    return (
      <View style={styles.summaryContainer}>
        <View style={styles.summaryTopRow}>
          <View>
            <Text style={styles.summaryTitle}>Cash Collection</Text>

            <Text style={styles.summaryDate}>
              {SECTION_COPY[activeTab]?.title || "Overview"}
            </Text>
          </View>

          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{config.badgeLabel}</Text>
          </View>
        </View>

        <View style={styles.amountsRow}>
          {config.blocks.map((block, index) => (
            <View key={block.label} style={styles.amountBlockWrapper}>
              {index > 0 && <View style={styles.amountsDivider} />}

              <View style={styles.amountBlock}>
                <Text style={styles.amountBlockLabel}>{block.label}</Text>

                <Text
                  style={[
                    styles.amountBlockValue,
                    block.tone === "pending"
                      ? styles.pendingAmountText
                      : styles.collectedAmountText,
                  ]}
                >
                  {formatCurrency(block.value)}
                </Text>

                <Text style={styles.amountBlockSub}>{block.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  /* =======================================================
     TAB BAR
  ======================================================= */

  const tabBadgeCount = (tabKey) => {
    if (tabKey === "pending") return stats.pending.count;
    if (tabKey === "completed") return stats.collectedTotal.count;
    if (tabKey === "all") return stats.all.count;
    if (tabKey === "today") return tabsData.today.total;
    if (tabKey === "yesterday") return tabsData.yesterday.total;
    return 0;
  };

  const renderTabBar = () => {
    return (
      <View style={styles.tabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
          keyboardShouldPersistTaps="handled"
        >
          {TABS.map((tab, index) => {
            const active = tab.key === activeTab;
            const badgeCount = tabBadgeCount(tab.key);
            const isLast = index === TABS.length - 1;

            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[
                  styles.tabItem,
                  active && styles.tabItemActive,
                  !isLast && styles.tabItemSpacing,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${tab.label} tab`}
              >
                <Text
                  style={[
                    styles.tabItemText,
                    active && styles.tabItemTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>

                {badgeCount > 0 && (
                  <View
                    style={[styles.tabBadge, active && styles.tabBadgeActive]}
                  >
                    <Text
                      style={[
                        styles.tabBadgeText,
                        active && styles.tabBadgeTextActive,
                      ]}
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  /* =======================================================
     COMPACT PAYMENT CARD
     Two blocks instead of four rows:
       1. name + amount / type · vehicle / phone (+ mixed tag)
       2. one footer: who + when (left)  ·  Collect / Collected (right)
     The redundant "Cash Payment" tag and "CASH" amount label are gone
     (this whole screen is cash-only), mixed payments get a small
     "MIXED · CASH PART" tag instead, and the amount isn't repeated
     inside the button.
  ======================================================= */

  const renderPaymentItem = useCallback(
    ({ item }) => {
      const mixed = isMixedPayment(item);

      const collected = Boolean(item?.isCollected);

      const amount = getDisplayAmount(item);

      const createdBy = getCreatedByName(item);

      const isCollecting = collectingId === item?._id;

      const phone = item?.customer?.mobileNumber;

      const subLine = [
        getPaymentTypeLabel(item?.type),
        item?.vehicle?.vehicleName,
      ]
        .filter(Boolean)
        .join(" · ");

      const metaText = collected
        ? `Collected by ${item?.lastCollectedByName || "Staff"} from ${createdBy}`
        : `Recorded by ${createdBy}`;

      const metaDate = formatDateTime(
        collected ? item?.lastCollectedAt : item?.createdAt,
      );

      return (
        <View style={styles.paymentCard}>
          <View style={styles.cardTopRow}>
            <View
              style={[styles.typeIcon, collected && styles.typeIconCollected]}
            >
              <Text
                style={[
                  styles.typeIconText,
                  collected && styles.typeIconTextCollected,
                ]}
              >
                {collected ? "✓" : getPaymentTypeIcon(item?.type)}
              </Text>
            </View>

            <View style={styles.cardMain}>
              <View style={styles.nameRow}>
                <Text style={styles.nameText} numberOfLines={1}>
                  {item?.customer?.fullName || "Customer"}
                </Text>

                <Text style={styles.amountText}>{formatCurrency(amount)}</Text>
              </View>

              <Text style={styles.subText} numberOfLines={1}>
                {subLine}
              </Text>

              {phone || mixed ? (
                <View style={styles.contactRow}>
                  {phone ? (
                    <Text style={styles.phoneText} numberOfLines={1}>
                      {phone}
                    </Text>
                  ) : null}

                  {mixed ? (
                    <View style={styles.mixedTag}>
                      <Text style={styles.mixedTagText}>MIXED · CASH PART</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.footerRow}>
            <View style={styles.footerMeta}>
              <Text style={styles.footerMetaText} numberOfLines={1}>
                {metaText}
              </Text>

              <Text style={styles.footerDate}>{metaDate}</Text>
            </View>

            {collected ? (
              <View style={styles.collectedBadge}>
                <Text style={styles.collectedBadgeText}>✓ Collected</Text>
              </View>
            ) : (
              <Pressable
                disabled={isCollecting}
                onPress={() => handleCollect(item)}
                style={[
                  styles.collectButton,
                  isCollecting && styles.collectButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Collect ${formatCurrency(amount)}`}
              >
                {isCollecting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.collectButtonText}>Collect</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>
      );
    },
    [collectingId, handleCollect],
  );

  /* =======================================================
     EMPTY / ERROR / FOOTER STATES (per active tab)
  ======================================================= */

  const renderEmpty = () => {
    if (isSearching) {
      if (searchInFlight) {
        return (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="small" color="#111827" />

            <Text style={[styles.emptyDescription, { marginTop: 10 }]}>
              Searching…
            </Text>
          </View>
        );
      }

      if (searchErrored) {
        return (
          <View style={styles.emptyContainer}>
            <View style={styles.errorIcon}>
              <Text style={styles.errorIconText}>!</Text>
            </View>

            <Text style={styles.emptyTitle}>Search failed</Text>

            <Text style={styles.emptyDescription}>{searchState.error}</Text>

            <Pressable
              onPress={() => fetchSearch(activeTab, trimmedInput, { page: 1 })}
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel="Retry search"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        );
      }

      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>?</Text>
          </View>

          <Text style={styles.emptyTitle}>No matching payments</Text>

          <Text style={styles.emptyDescription}>
            {`Nothing in "${TABS.find((t) => t.key === activeTab)?.label}" matches "${trimmedInput}". Try a customer name, phone number, vehicle or amount${
              activeTab !== "all" ? ", or switch to the All tab" : ""
            }.`}
          </Text>
        </View>
      );
    }

    if (activeState.loading) return null;

    const copy = EMPTY_COPY[activeTab];

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconText}>✓</Text>
        </View>

        <Text style={styles.emptyTitle}>{copy.title}</Text>

        <Text style={styles.emptyDescription}>{copy.description}</Text>
      </View>
    );
  };

  const renderErrorState = () => {
    if (!activeState.error) {
      return null;
    }

    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>

        <Text style={styles.errorTitle}>Unable to load payments</Text>

        <Text style={styles.errorDescription}>{activeState.error}</Text>

        <Pressable
          onPress={() => fetchTab(activeTab, { page: 1 })}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Retry loading payments"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  };

  const renderFooter = () => {
    if (listLoadingMore) {
      return (
        <View style={styles.footerLoading}>
          <ActivityIndicator size="small" color="#111827" />
        </View>
      );
    }

    if (showEndOfList) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {isSearching
              ? "End of search results"
              : "All payment transactions loaded"}
          </Text>
        </View>
      );
    }

    return null;
  };

  /* =======================================================
     SKELETON LOADER
  ======================================================= */

  const renderSkeleton = () => (
    <View style={styles.loadingContainer}>
      {[1, 2, 3, 4, 5].map((item) => (
        <View key={item} style={styles.skeletonPayment}>
          <View style={styles.skeletonCircle} />

          <View style={styles.skeletonPaymentContent}>
            <View style={styles.skeletonLineMedium} />

            <View style={styles.skeletonLineSmall} />

            <View style={styles.skeletonLineTiny} />
          </View>
        </View>
      ))}
    </View>
  );

  /* =======================================================
     MAIN SCREEN
  ======================================================= */

  const sectionCopy = SECTION_COPY[activeTab];

  const showInitialSkeleton =
    activeState.loading && !activeState.loadedOnce && !serverResultsReady;

  const activeTabLabel = TABS.find((t) => t.key === activeTab)?.label;

  return (
    <SafeAreaView style={styles.container}>
      <Header />

      {renderSummary()}

      {/* Search bar — rendered inline (not as an inner component) so the
          TextInput keeps focus while the list re-renders. */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Text style={styles.searchGlyph}>⌕</Text>

          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search customer, phone, vehicle or amount"
            placeholderTextColor="#9BA1AB"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />

          {searchInFlight ? (
            <ActivityIndicator size="small" color="#111827" />
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

      {renderTabBar()}

      {showInitialSkeleton ? (
        renderSkeleton()
      ) : !isSearching &&
        activeState.error &&
        activeState.items.length === 0 ? (
        <View style={styles.errorFullContainer}>{renderErrorState()}</View>
      ) : (
        <FlatList
          data={displayItems}
          keyExtractor={(item, index) => item?._id || `${activeTab}-${index}`}
          renderItem={renderPaymentItem}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.listContent,
            displayItems.length === 0 && styles.emptyListContent,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={listRefreshing}
              onRefresh={handleRefresh}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          initialNumToRender={PAGE_SIZE}
          maxToRenderPerBatch={PAGE_SIZE}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.sectionTitle}>
                  {isSearching ? "Search Results" : sectionCopy.title}
                </Text>

                <Text style={styles.sectionSubtitle}>
                  {isSearching
                    ? `In ${activeTabLabel}${
                        serverResultsReady && searchState.hasMore
                          ? " · scroll for more"
                          : ""
                      }`
                    : sectionCopy.subtitle}
                </Text>
              </View>

              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {isSearching ? displayItems.length : tabBadgeCount(activeTab)}
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
        />
      )}
    </SafeAreaView>
  );
};

/* =========================================================
   STYLES
   Card + summary spacing tightened so more payments fit on
   screen at once.
========================================================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },

  /* HEADER */

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

  headerContent: {
    flex: 1,
    marginTop: 24,
  },

  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },

  headerSubtitle: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },

  /* SEARCH */

  searchSection: {
    marginHorizontal: 12,
    marginBottom: 8,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
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
    fontSize: 13,
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
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 30,
  },

  emptyListContent: {
    flexGrow: 1,
  },

  /* SUMMARY — slightly tighter */

  summaryContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E7E9ED",
  },

  summaryTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  summaryTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },

  summaryDate: {
    fontSize: 10,
    color: "#9BA1AB",
    marginTop: 2,
  },

  pendingBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#FFF5E6",
  },

  pendingBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#B76B00",
    letterSpacing: 0.4,
  },

  amountsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F1F3",
  },

  amountBlockWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  amountBlock: {
    flex: 1,
    alignItems: "flex-start",
  },

  amountsDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#EEF0F2",
    marginHorizontal: 14,
  },

  amountBlockLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#9BA1AB",
    letterSpacing: 0.6,
  },

  amountBlockValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    marginTop: 3,
  },

  pendingAmountText: {
    color: "#B76B00",
  },

  collectedAmountText: {
    color: "#16834B",
  },

  amountBlockSub: {
    fontSize: 10,
    color: "#9BA1AB",
    marginTop: 2,
  },

  /* TAB BAR */

  tabBarWrapper: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 3,
    borderRadius: 13,
    backgroundColor: "#EDEFF2",
  },

  tabBarContent: {
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
  },

  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 9,
    minWidth: 64,
  },

  tabItemSpacing: {
    marginRight: 4,
  },

  tabItemActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },

  tabItemText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 0.1,
  },

  tabItemTextActive: {
    color: "#111827",
    fontWeight: "800",
  },

  tabBadge: {
    marginLeft: 5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D9DCE1",
  },

  tabBadgeActive: {
    backgroundColor: "#111827",
  },

  tabBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#4B5563",
  },

  tabBadgeTextActive: {
    color: "#FFFFFF",
  },

  /* SECTION HEADER */

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
    paddingHorizontal: 2,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },

  sectionSubtitle: {
    fontSize: 10,
    color: "#9BA1AB",
    marginTop: 1,
  },

  countBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
  },

  countBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  /* COMPACT PAYMENT CARD */

  paymentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 8,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: "#E7E9ED",
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  typeIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#FFF5E6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  typeIconCollected: {
    backgroundColor: "#EAF8F0",
  },

  typeIconText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#B76B00",
  },

  typeIconTextCollected: {
    fontSize: 14,
    color: "#16834B",
  },

  cardMain: {
    flex: 1,
    minWidth: 0,
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  nameText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginRight: 8,
  },

  amountText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#16834B",
  },

  subText: {
    fontSize: 10.5,
    color: "#7A818C",
    marginTop: 1,
  },

  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 4,
    columnGap: 10,
    rowGap: 3,
  },

  phoneText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
  },

  mixedTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "#FFF5E6",
    borderWidth: 1,
    borderColor: "#FDE3B8",
  },

  mixedTagText: {
    fontSize: 8.5,
    fontWeight: "800",
    color: "#B76B00",
    letterSpacing: 0.4,
  },

  /* CARD FOOTER — who/when on the left, action on the right */

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 7,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: "#F0F1F3",
  },

  footerMeta: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },

  footerMetaText: {
    fontSize: 10,
    color: "#7A818C",
  },

  footerDate: {
    fontSize: 9,
    color: "#9BA1AB",
    marginTop: 1,
  },

  collectButton: {
    minWidth: 76,
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
  },

  collectButtonDisabled: {
    opacity: 0.65,
  },

  collectButtonText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  collectedBadge: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF8F0",
  },

  collectedBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#16834B",
  },

  /* EMPTY */

  emptyContainer: {
    flex: 1,
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#EAF8F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  emptyIconText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#16834B",
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },

  emptyDescription: {
    fontSize: 11,
    lineHeight: 17,
    color: "#7A818C",
    textAlign: "center",
    marginTop: 6,
  },

  /* ERROR */

  errorFullContainer: {
    flex: 1,
    alignItems: "center",
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
    paddingVertical: 15,
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

  /* LOADING SKELETON (matches the compact card height) */

  loadingContainer: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 4,
  },

  skeletonPayment: {
    height: 92,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7E9ED",
    marginBottom: 7,
    padding: 10,
    flexDirection: "row",
  },

  skeletonCircle: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#E8EAED",
  },

  skeletonPaymentContent: {
    flex: 1,
    marginLeft: 9,
    justifyContent: "flex-start",
  },

  skeletonLineMedium: {
    width: "55%",
    height: 11,
    borderRadius: 6,
    backgroundColor: "#E8EAED",
  },

  skeletonLineSmall: {
    width: "38%",
    height: 9,
    borderRadius: 5,
    backgroundColor: "#E8EAED",
    marginTop: 7,
  },

  skeletonLineTiny: {
    width: "65%",
    height: 9,
    borderRadius: 5,
    backgroundColor: "#E8EAED",
    marginTop: 14,
  },
});

export default CashPaymentVerificationScreen;
