import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

export const statsData = [
  {
    id: 1,
    title: "Active Rentals",
    count: 12,
    icon: Ionicons,
    iconName: "calendar-outline",
    bg: "#EFF6FF",
    color: "#2563EB",
  },
  {
    id: 2,
    title: "Total Vehicles",
    count: 28,
    icon: MaterialCommunityIcons,
    iconName: "car",
    bg: "#F0FDF4",
    color: "#84CC16",
  },
  {
    id: 3,
    title: "Customers",
    count: 45,
    icon: Ionicons,
    iconName: "people-outline",
    bg: "#FFFBEB",
    color: "#F59E0B",
  },
  {
    id: 4,
    title: "Due Today",
    count: 5,
    icon: Feather,
    iconName: "clock",
    bg: "#F5F3FF",
    color: "#8B5CF6",
  },
];

export const quickActions = [
  {
    id: 1,
    title: "Car Handover",
    subtitle: "View cars handed over to customers",
    icon: MaterialCommunityIcons,
    iconName: "calendar-outline",
    bg: "#FFFBEB",
    color: "#F59E0B",
    route: "/screens/handoverScreen",
  },
  {
    id: 6,
    title: "Pending Returns",
    subtitle: "View cars to be returned",
    icon: Ionicons,
    iconName: "stats-chart-outline",
    bg: "#ECFEFF",
    color: "#14B8A6",
    route: "/screens/Received",
  },
  {
    id: 8,
    title: "Pickup & Drop",
    subtitle: "Assign drivers, start trips & track arrivals",
    icon: MaterialCommunityIcons,
    iconName: "car-clock",
    bg: "#F5F3FF",
    color: "#7C3AED",
    route: "/screens/PickupDrop",
  },
  // NEW TAB
  {
    id: 7,
    title: "Extension Requests",
    subtitle: "Approve or decline rental extensions",
    icon: MaterialCommunityIcons,
    iconName: "calendar-clock",
    bg: "#FDF2F8",
    color: "#DB2777",
    route: "/screens/ExtensionRequests",
    badge: 3, // optional: show pending count on the tile
  },
  {
    id: 2,
    title: "Active Rentals",
    subtitle: "View all ongoing rentals",
    icon: Ionicons,
    iconName: "calendar-outline",
    bg: "#EFF6FF",
    color: "#2563EB",
    route: "/screens/ActiveRentals",
  },
  {
    id: 4,
    title: "Vehicles",
    subtitle: "Manage your vehicle fleet",
    icon: MaterialCommunityIcons,
    iconName: "car",
    bg: "#FFF7ED",
    color: "#F97316",
    route: "/screens/ManageVehicles",
  },
  {
    id: 3,
    title: "Return Vehicles",
    subtitle: "Vehicle already return",
    icon: Ionicons,
    iconName: "people-outline",
    bg: "#F0FDF4",
    color: "#84CC16",
    route: "../components/return/vehicleReturn",
  },
];

export const returnsData = [
  {
    id: 1,
    car: "Mahindra Scorpio",
    plate: "AS01AB1234",
    customer: "Rahul Kumar",
    time: "Today, 04:30 PM",
    remaining: "6h 15m remaining",
    image:
      "https://imgd.aeplcdn.com/664x374/n/cw/ec/40432/scorpio-classic-exterior-right-front-three-quarter-47.jpeg",
  },
  {
    id: 2,
    car: "Toyota Innova Crysta",
    plate: "AS01CD5678",
    customer: "Priya Singh",
    time: "Today, 06:00 PM",
    remaining: "7h 45m remaining",
    image:
      "https://imgd.aeplcdn.com/664x374/n/cw/ec/51435/innova-crysta-exterior-right-front-three-quarter-2.jpeg",
  },
];

// NEW: extension requests (replace with API data later)
export const extensionRequestsData = [
  {
    id: "EXT-1042",
    status: "pending", // pending | accepted | declined
    requestedAt: "Today, 10:20 AM",
    fromDate: "28 Sep 2026",
    fromTime: "04:30 PM",
    toDate: "30 Sep 2026",
    toTime: "04:30 PM",
    extraDays: 2,
    extraAmount: 5000,
    customer: {
      name: "Rahul Kumar",
      phone: "+91 98640 12345",
      bookingId: "BK-2291",
    },
    vehicle: {
      name: "Mahindra Scorpio",
      plate: "AS01AB1234",
      type: "SUV · Diesel",
      image:
        "https://imgd.aeplcdn.com/664x374/n/cw/ec/40432/scorpio-classic-exterior-right-front-three-quarter-47.jpeg",
    },
    reason:
      "Family function in Jorhat got extended by two days. Need the car to drive my parents back.",
  },
  {
    id: "EXT-1041",
    status: "pending",
    requestedAt: "Today, 08:05 AM",
    fromDate: "27 Sep 2026",
    fromTime: "06:00 PM",
    toDate: "28 Sep 2026",
    toTime: "06:00 PM",
    extraDays: 1,
    extraAmount: 3200,
    customer: {
      name: "Priya Singh",
      phone: "+91 70020 56789",
      bookingId: "BK-2287",
    },
    vehicle: {
      name: "Toyota Innova Crysta",
      plate: "AS01CD5678",
      type: "MPV · Diesel",
      image:
        "https://imgd.aeplcdn.com/664x374/n/cw/ec/51435/innova-crysta-exterior-right-front-three-quarter-2.jpeg",
    },
    reason: "Flight got rescheduled to tomorrow evening.",
  },
  {
    id: "EXT-1039",
    status: "pending",
    requestedAt: "Yesterday, 07:40 PM",
    fromDate: "29 Sep 2026",
    fromTime: "11:00 AM",
    toDate: "02 Oct 2026",
    toTime: "11:00 AM",
    extraDays: 3,
    extraAmount: 6600,
    customer: {
      name: "Ankur Das",
      phone: "+91 91010 44321",
      bookingId: "BK-2279",
    },
    vehicle: {
      name: "Maruti Swift Dzire",
      plate: "AS01EF9012",
      type: "Sedan · Petrol",
      image: null,
    },
    reason: "Planning a trip to Shillong over the Gandhi Jayanti weekend.",
  },
  {
    id: "EXT-1035",
    status: "accepted",
    requestedAt: "25 Sep, 02:15 PM",
    fromDate: "26 Sep 2026",
    fromTime: "10:00 AM",
    toDate: "27 Sep 2026",
    toTime: "10:00 AM",
    extraDays: 1,
    extraAmount: 2200,
    customer: {
      name: "Meera Baruah",
      phone: "+91 88110 22334",
      bookingId: "BK-2270",
    },
    vehicle: {
      name: "Hyundai Creta",
      plate: "AS01GH3456",
      type: "SUV · Petrol",
      image: null,
    },
    reason: "Work trip extended.",
  },
];
