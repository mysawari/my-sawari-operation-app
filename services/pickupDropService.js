// =====================================================================
//  Pickup & Drop — local data + logic (frontend only, no backend)
//
//  Holds the sample bookings and handles assign / start / reach /
//  complete / undo in memory. Changes last until the app reloads.
//  The screen and the Quick Actions badge only use the exported
//  functions at the bottom, so swapping in an API later means
//  changing just this file.
// =====================================================================
import useAuthStore from "../store/authStore";

const currentUser = () => {
  const u = useAuthStore.getState?.()?.user;
  return {
    _id: u?._id || "me",
    fullName: u?.fullName || "You",
    mobileNumber: u?.mobileNumber || "",
    role: u?.role || "staff",
  };
};

/* ================================================================== */
/*  Local store                                                        */
/* ================================================================== */
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const CLOSED = ["completed", "cancelled"];

const MOCK_DRIVERS = [
  { _id: "d1", fullName: "Rahul Das", mobileNumber: "9864012345", role: "driver" },
  { _id: "d2", fullName: "Bikash Kalita", mobileNumber: "9706123456", role: "driver" },
  { _id: "d3", fullName: "Priyanka Sharma", mobileNumber: "9435098765", role: "staff" },
  { _id: "d4", fullName: "Amit Baruah", mobileNumber: "8011223344", role: "driver" },
  { _id: "d5", fullName: "Manoj Deka", mobileNumber: "7002556677", role: "manager" },
];

const delay = (signal, ms = 120 + Math.random() * 150) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener?.("abort", () => {
      clearTimeout(t);
      const err = new Error("canceled");
      err.name = "AbortError";
      reject(err);
    });
  });

const fail = (status, message) => {
  const err = new Error(message);
  err.response = { status, data: { success: false, message } };
  return err;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const fmtTimeStr = (date) => {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${m} ${ap}`;
};

const at = (dayOffset, hour, minute = 0) => {
  const d = new Date(startOfToday() + dayOffset * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const ev = (type, date, extra = {}) => ({ type, at: date.toISOString(), by: MOCK_DRIVERS[4], ...extra });

const loc = (lat, lng, address) => ({ lat, lng, accuracy: 12, address, capturedAt: new Date().toISOString() });

// One raw booking per row. `pickup` / `drop` hold the place + task state.
const seed = () => {
  const now = Date.now();
  const rows = [
    {
      code: "A1F3C201", customer: "Ankita Bora", phone: "9864700011", vehicle: "Maruti Swift Dzire", plate: "AS01 DK 4521",
      serviceType: "pickup_drop", from: at(0, 9, 30), to: at(2, 9, 30),
      pickup: { location: "Hotel Gateway Grandeur, GS Road, Ulubari", landmark: "Opp. Bora Service", mapLink: "https://www.google.com/maps/search/?api=1&query=26.1708,91.7570", charge: 300 },
      drop: { location: "LGBI Airport, Borjhar", landmark: "Departure gate 2", mapLink: "https://www.google.com/maps/search/?api=1&query=26.1061,91.5859", charge: 500 },
      pickupTask: { status: "assigned", driver: MOCK_DRIVERS[0], assignedAt: new Date(now - 90 * MIN).toISOString(), timeline: [ev("assigned", new Date(now - 90 * MIN), { driver: MOCK_DRIVERS[0] })] },
    },
    {
      code: "B7720E9A", customer: "Rohan Mehta", phone: "9101002233", vehicle: "Hyundai Creta", plate: "AS01 FB 7788",
      serviceType: "pickup", from: at(0, 11, 0), to: at(3, 11, 0),
      pickup: { location: "Guwahati Railway Station, Paltan Bazar", landmark: "Platform 1 exit", mapLink: "https://www.google.com/maps/search/?api=1&query=26.1817,91.7509", charge: 250 },
      pickupTask: {
        status: "on_the_way", driver: MOCK_DRIVERS[1],
        assignedAt: new Date(now - 60 * MIN).toISOString(), startedAt: new Date(now - 18 * MIN).toISOString(),
        startLocation: loc(26.1445, 91.7362, "Office, Christian Basti, Guwahati"),
        timeline: [ev("assigned", new Date(now - 60 * MIN), { driver: MOCK_DRIVERS[1] }), ev("started", new Date(now - 18 * MIN), { driver: MOCK_DRIVERS[1], by: MOCK_DRIVERS[1], location: loc(26.1445, 91.7362, "Office, Christian Basti, Guwahati") })],
      },
    },
    {
      code: "C0D19B44", customer: "Sneha Gogoi", phone: "7896541230", vehicle: "Mahindra Thar", plate: "AS01 GC 1029",
      serviceType: "pickup", from: at(0, 8, 0), to: at(1, 8, 0),
      pickup: { location: "Ganeshguri Flyover, Dispur", landmark: "Near Big Bazaar", mapLink: "", charge: 200 },
      pickupTask: {
        status: "reached", driver: MOCK_DRIVERS[3],
        assignedAt: new Date(now - 180 * MIN).toISOString(), startedAt: new Date(now - 75 * MIN).toISOString(), reachedAt: new Date(now - 40 * MIN).toISOString(),
        startLocation: loc(26.1445, 91.7362, "Office, Christian Basti"), reachLocation: loc(26.1499, 91.7853, "Ganeshguri, Dispur"),
        distanceFromTargetMeters: null,
        timeline: [ev("assigned", new Date(now - 180 * MIN), { driver: MOCK_DRIVERS[3] }), ev("started", new Date(now - 75 * MIN), { driver: MOCK_DRIVERS[3] }), ev("reached", new Date(now - 40 * MIN), { driver: MOCK_DRIVERS[3], location: loc(26.1499, 91.7853, "Ganeshguri, Dispur") })],
      },
    },
    {
      code: "D55A0F10", customer: "Imran Hussain", phone: "9954123987", vehicle: "Toyota Innova Crysta", plate: "AS01 HJ 3344",
      serviceType: "pickup_drop", from: at(0, 7, 0), to: at(1, 19, 0),
      pickup: { location: "Beltola Tiniali", landmark: "Near Petrol Pump", mapLink: "https://www.google.com/maps/search/?api=1&query=26.1209,91.7943", charge: 200 },
      drop: { location: "Beltola Tiniali", landmark: "Near Petrol Pump", mapLink: "https://www.google.com/maps/search/?api=1&query=26.1209,91.7943", charge: 200 },
      pickupTask: {
        status: "completed", driver: MOCK_DRIVERS[0],
        assignedAt: new Date(at(0, 6, 0)).toISOString(), startedAt: new Date(at(0, 6, 35)).toISOString(), reachedAt: new Date(at(0, 7, 8)).toISOString(), completedAt: new Date(at(0, 7, 25)).toISOString(),
        reachLocation: loc(26.121, 91.7941, "Beltola Tiniali"), distanceFromTargetMeters: 22, notes: "Fuel full, 23,410 km",
        timeline: [ev("assigned", at(0, 6, 0), { driver: MOCK_DRIVERS[0] }), ev("started", at(0, 6, 35)), ev("reached", at(0, 7, 8), { location: loc(26.121, 91.7941, "Beltola Tiniali") }), ev("completed", at(0, 7, 25), { note: "Fuel full, 23,410 km" })],
      },
    },
    {
      code: "E9B2C7D3", customer: "Pallavi Saikia", phone: "8822110099", vehicle: "Honda City", plate: "AS01 EQ 9001",
      serviceType: "drop", from: at(-2, 10, 0), to: at(0, 18, 0),
      drop: { location: "Zoo Road Tiniali", landmark: "Opp. Assam Sahitya Sabha", mapLink: "", charge: 250 },
    },
    {
      code: "F31D8E62", customer: "Karan Agarwal", phone: "9435777888", vehicle: "Kia Seltos", plate: "AS01 JK 5566",
      serviceType: "pickup", from: at(1, 10, 0), to: at(4, 10, 0),
      pickup: { location: "Fancy Bazar, near Nepali Mandir", landmark: "", mapLink: "", charge: 200 },
    },
    {
      code: "G4A71B05", customer: "Deepjyoti Nath", phone: "6000123456", vehicle: "Maruti Ertiga", plate: "AS01 BC 2210",
      serviceType: "pickup_drop", from: at(-1, 15, 0), to: at(0, 15, 0),
      pickup: { location: "Six Mile, Khanapara", landmark: "Near Apollo Hospital", mapLink: "", charge: 250 },
      drop: { location: "Six Mile, Khanapara", landmark: "Near Apollo Hospital", mapLink: "", charge: 250 },
      pickupTask: { status: "completed", driver: MOCK_DRIVERS[2], assignedAt: at(-1, 13, 0).toISOString(), startedAt: at(-1, 14, 20).toISOString(), reachedAt: at(-1, 15, 12).toISOString(), completedAt: at(-1, 15, 30).toISOString(), timeline: [] },
      dropTask: { status: "assigned", driver: MOCK_DRIVERS[2], assignedAt: new Date(now - 30 * MIN).toISOString(), timeline: [ev("assigned", new Date(now - 30 * MIN), { driver: MOCK_DRIVERS[2] })] },
    },
    {
      code: "H8C0E3F7", customer: "Neha Choudhury", phone: "9706999000", vehicle: "Tata Nexon", plate: "AS01 KL 8890",
      serviceType: "pickup", from: at(-1, 9, 0), to: at(2, 9, 0),
      pickup: { location: "Maligaon Chariali", landmark: "Near NF Railway HQ", mapLink: "", charge: 200 },
    },
    {
      code: "J2E6A4B8", customer: "Vikram Singh", phone: "9101234567", vehicle: "Mahindra Scorpio N", plate: "AS01 MN 1212",
      serviceType: "drop", from: at(-3, 12, 0), to: at(1, 12, 0),
      drop: { location: "Radisson Blu, NH-37, Gotanagar", landmark: "Main lobby", mapLink: "https://www.google.com/maps/search/?api=1&query=26.1514,91.6853", charge: 400 },
    },
    {
      code: "K7F9D2C1", customer: "Ritu Kashyap", phone: "8133004455", vehicle: "Maruti Baleno", plate: "AS01 PQ 6677",
      serviceType: "pickup", from: at(0, 17, 30), to: at(1, 17, 30),
      pickup: { location: "Chandmari Flyover, near Commerce College", landmark: "", mapLink: "", charge: 150 },
    },
  ];

  return rows.map((r) => ({
    _id: `66f0a0000000000000${r.code}`.slice(-24).toLowerCase(),
    customerName: r.customer,
    mobileNumber: r.phone,
    alternateMobileNumber: "",
    vehicleName: r.vehicle,
    vehicleNumber: r.plate,
    pickupDropRequired: true,
    serviceType: r.serviceType,
    fromDate: r.from,
    toDate: r.to,
    pickupTime: fmtTimeStr(r.from),
    dropTime: fmtTimeStr(r.to),
    pickup: r.pickup || {},
    drop: r.drop || {},
    pickupDropNotes: "",
    serviceTasks: { pickup: r.pickupTask || null, drop: r.dropTask || null },
  }));
};

let DB = null;
const db = () => (DB ||= seed());

const parseMapCoords = (url) => {
  if (!url) return null;
  let s = String(url);
  try {
    s = decodeURIComponent(s);
  } catch {
    /* raw */
  }
  for (const re of [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination|daddr|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ]) {
    const m = s.match(re);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
};

const haversine = (a, b) => {
  if (!a || !b) return null;
  const R = 6371000;
  const r = (x) => (x * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

const mins = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / MIN) : null);

const statusOf = (task) => task?.status || (task?.driver ? "assigned" : "pending");

const toCard = (b, type) => {
  const task = b.serviceTasks[type] || {};
  const place = b[type] || {};
  const scheduledAt = type === "pickup" ? b.fromDate : b.toDate;
  return {
    id: `${b._id}:${type}`,
    bookingId: b._id,
    bookingCode: b._id.slice(-8).toUpperCase(),
    type,
    status: statusOf(task),
    customerName: b.customerName,
    mobileNumber: b.mobileNumber,
    alternateMobileNumber: b.alternateMobileNumber,
    vehicleName: b.vehicleName,
    vehicleNumber: b.vehicleNumber,
    vehicleImage: "",
    location: place.location || "",
    landmark: place.landmark || "",
    mapLink: place.mapLink || "",
    charge: Number(place.charge || 0),
    targetCoords: parseMapCoords(place.mapLink),
    serviceNotes: b.pickupDropNotes,
    scheduledAt: new Date(scheduledAt).toISOString(),
    scheduledTimeLabel: type === "pickup" ? b.pickupTime : b.dropTime,
    driver: task.driver || null,
    assignedAt: task.assignedAt || null,
    startedAt: task.startedAt || null,
    reachedAt: task.reachedAt || null,
    completedAt: task.completedAt || null,
    startLocation: task.startLocation || null,
    reachLocation: task.reachLocation || null,
    completeLocation: task.completeLocation || null,
    distanceFromTargetMeters: task.distanceFromTargetMeters ?? null,
    notes: task.notes || "",
    metrics: {
      travelMinutes: mins(task.startedAt, task.reachedAt),
      onSiteMinutes: mins(task.reachedAt, task.completedAt),
      totalMinutes: mins(task.startedAt, task.completedAt),
      arrivalDelayMinutes: mins(scheduledAt, task.reachedAt),
    },
    timeline: task.timeline || [],
  };
};

const matchesFilter = (b, type, filter) => {
  const s = statusOf(b.serviceTasks[type]);
  const when = new Date(type === "pickup" ? b.fromDate : b.toDate).getTime();
  const t0 = startOfToday();
  const t1 = t0 + DAY;
  const open = !CLOSED.includes(s);
  switch (filter) {
    case "today": return open && when >= t0 && when < t1;
    case "live": return s === "on_the_way" || s === "reached";
    case "upcoming": return open && when >= t1;
    case "overdue": return open && when < t0;
    case "completed": return s === "completed";
    case "open": return open;
    default: return true;
  }
};

const matchesSearch = (b, type, term) => {
  const q = term.toLowerCase();
  const compact = q.replace(/[\s-]/g, "");
  const driver = b.serviceTasks[type]?.driver;
  const hay = [
    b.customerName, b.mobileNumber, b.vehicleName, b.vehicleNumber, b._id,
    b[type]?.location, b[type]?.landmark, driver?.fullName, driver?.mobileNumber,
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q) || (!!compact && hay.replace(/[\s-]/g, "").includes(compact));
};

const ofType = (type) => db().filter((b) => b.serviceType === type || b.serviceType === "pickup_drop");

const isMine = (b, type) => b.serviceTasks[type]?.driver?._id === currentUser()._id;

const mock = {
  async list(params, { signal } = {}) {
    await delay(signal);
    const type = params.type === "drop" ? "drop" : "pickup";
    const filter = params.filter || "today";
    const term = String(params.search || "").trim();
    const mine = params.mine === "true";
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 10);

    let rows = ofType(type).filter((b) => (!mine || isMine(b, type)));
    rows = term ? rows.filter((b) => matchesSearch(b, type, term)) : rows.filter((b) => matchesFilter(b, type, filter));

    const effective = term ? "all" : filter;
    const whenOf = (b) => new Date(type === "pickup" ? b.fromDate : b.toDate).getTime();
    rows.sort((a, b) => {
      if (effective === "completed") {
        return new Date(b.serviceTasks[type]?.completedAt || 0) - new Date(a.serviceTasks[type]?.completedAt || 0);
      }
      return effective === "all" ? whenOf(b) - whenOf(a) : whenOf(a) - whenOf(b);
    });

    const slice = rows.slice((page - 1) * limit, page * limit);
    const out = {
      success: true,
      data: slice.map((b) => toCard(b, type)),
      page,
      hasMore: page * limit < rows.length,
      total: rows.length,
    };

    if (params.includeCounts === "true") {
      out.counts = {};
      for (const t of ["pickup", "drop"]) {
        const base = ofType(t).filter((b) => !mine || isMine(b, t));
        out.counts[t] = Object.fromEntries(
          ["open", "today", "live", "upcoming", "overdue", "completed"].map((f) => [f, base.filter((b) => matchesFilter(b, t, f)).length]),
        );
      }
    }
    return out;
  },

  async get(bookingId, type) {
    await delay();
    const b = db().find((x) => x._id === bookingId);
    if (!b) throw fail(404, "Booking not found.");
    return toCard(b, type);
  },

  async action(bookingId, type, action, body = {}) {
    await delay(undefined, 400);
    const b = db().find((x) => x._id === bookingId);
    if (!b) throw fail(404, "Booking not found.");

    const me = currentUser();
    const now = new Date().toISOString();
    const task = (b.serviceTasks[type] ||= { status: "pending", timeline: [] });
    task.timeline ||= [];
    const s = statusOf(task);
    const location = body.location || null;
    const push = (e) => task.timeline.push({ at: now, by: me, ...e });

    switch (action) {
      case "assign": {
        if (CLOSED.includes(s)) throw fail(400, `This ${type} is already ${s}.`);
        const driver = [...MOCK_DRIVERS, me].find((d) => d._id === body.driverId);
        if (!driver) throw fail(404, "Driver not found.");
        push({ type: task.driver ? "reassigned" : "assigned", driver });
        Object.assign(task, { driver, assignedAt: now, assignedBy: me, status: s === "pending" ? "assigned" : s });
        break;
      }
      case "start": {
        if (!["pending", "assigned"].includes(s)) throw fail(400, `Can't start — task is ${s.replace("_", " ")}.`);
        if (!task.driver) Object.assign(task, { driver: me, assignedAt: now, assignedBy: me });
        Object.assign(task, { status: "on_the_way", startedAt: now, startLocation: location });
        push({ type: "started", driver: task.driver, location });
        break;
      }
      case "reach": {
        if (s !== "on_the_way") throw fail(400, "Start the trip before marking reached.");
        const target = parseMapCoords(b[type]?.mapLink);
        Object.assign(task, {
          status: "reached",
          reachedAt: now,
          reachLocation: location,
          distanceFromTargetMeters: location && target ? haversine(location, target) : null,
        });
        push({ type: "reached", driver: task.driver, location });
        break;
      }
      case "complete": {
        if (s !== "reached") throw fail(400, "Mark reached before completing.");
        Object.assign(task, { status: "completed", completedAt: now, completeLocation: location, notes: body.notes || task.notes });
        push({ type: "completed", driver: task.driver, location, note: body.notes });
        break;
      }
      case "undo": {
        const steps = {
          on_the_way: ["assigned", ["startedAt", "startLocation"]],
          reached: ["on_the_way", ["reachedAt", "reachLocation", "distanceFromTargetMeters"]],
          completed: ["reached", ["completedAt", "completeLocation"]],
        };
        const step = steps[s];
        if (!step) throw fail(400, "Nothing to undo.");
        step[1].forEach((k) => delete task[k]);
        task.status = step[0];
        push({ type: "note", note: `Undo: ${s.replace("_", " ")} → ${step[0].replace("_", " ")}` });
        break;
      }
      default:
        throw fail(400, "Unknown action.");
    }
    return toCard(b, type);
  },

  async drivers() {
    await delay();
    const me = currentUser();
    return [...MOCK_DRIVERS.filter((d) => d._id !== me._id), me];
  },
};

/* ================================================================== */
/*  Public API — the screen and Quick Actions use only these           */
/* ================================================================== */
const impl = mock;

export const listServiceTasks = (params, opts) => impl.list(params, opts);
export const getServiceTask = (bookingId, type) => impl.get(bookingId, type);
export const runServiceAction = (bookingId, type, action, body) => impl.action(bookingId, type, action, body);
export const getServiceDrivers = () => impl.drivers();

// Open (not completed) pickups + drops, for the home-screen badge.
export const getOpenServiceCount = async () => {
  const res = await impl.list({ type: "pickup", filter: "open", limit: 1, includeCounts: "true" });
  return (res.counts?.pickup?.open || 0) + (res.counts?.drop?.open || 0);
};