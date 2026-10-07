// =====================================================================
//  Pickup & Drop — API calls
//
//  Backend base: /api/v1/service
//
//  Working now:
//    GET   /api/v1/service              → listTasks()
//    GET   /api/v1/service/:id          → getTask()
//    GET   /api/v1/service/team-members → getTeamMembers()   (leaders)
//    PATCH /api/v1/service/:id/assign   → assignTask()       (leaders)
//
//  Next step (functions ready, backend not yet):
//    PATCH /api/v1/service/:id/start | reach | complete → updateTaskStatus()
//    PATCH /api/v1/service/:id/cancel                  → cancelTask() (leaders)
//    GET   /api/v1/service?status=cancelled | all       (new list filters)
// =====================================================================
import useAuthStore from "../store/authStore";
import api from "./api"; // ← your axios instance (the one that sends the login token)

const BASE = "/service";

// Must match LEADER_ROLES in backend serviceTaskController.js
const LEADER_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH_MANAGER",
  "OPERATIONS",
  "FLEET_MANAGER",
  "DRIVER_COORDINATOR",
];

// Logged-in user
// Works whether the store keeps { user: {...} } or { user: { user: {...} } },
// and whether the id is called _id, id or userId.
export const currentUser = () => {
  const state = useAuthStore.getState?.() || {};
  const u = state.user?.user || state.user || {};
  return {
    _id: String(u._id || u.id || u.userId || ""),
    fullName: u?.fullName || "",
    mobileNumber: u?.mobileNumber || "",
    role: u?.role || "",
  };
};

// Team leaders can see All Tasks and assign
export const isTeamLeader = () => LEADER_ROLES.includes(currentUser().role);

/* ------------------------------------------------------------------ */
/*  List tasks                                                         */
/*  scope:  "mine" | "all"                                             */
/*  type:   "pickup" | "drop"                                          */
/*  status: "active" | "completed" | "cancelled" | "all"               */
/* ------------------------------------------------------------------ */
export async function listTasks({
  scope = "mine",
  type = "pickup",
  status = "active",
}) {
  const res = await api.get(BASE, { params: { scope, type, status } });
  const c = res.data?.counts || {};
  return {
    data: res.data?.data || [],
    counts: {
      active: c.active ?? 0,
      completed: c.completed ?? 0,
      // Shown only once the backend sends them
      cancelled: c.cancelled,
      all: c.all,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  One task                                                           */
/* ------------------------------------------------------------------ */
export async function getTask(taskId) {
  const res = await api.get(`${BASE}/${taskId}`);
  return res.data?.data;
}

/* ------------------------------------------------------------------ */
/*  Team members (for the assign sheet) — leaders only                 */
/* ------------------------------------------------------------------ */
export async function getTeamMembers() {
  const res = await api.get(`${BASE}/team-members`);
  return res.data?.data || [];
}

/* ------------------------------------------------------------------ */
/*  Assign a member — leaders only                                     */
/*  scheduledAt (optional): Date — when the member should reach        */
/* ------------------------------------------------------------------ */
export async function assignTask(taskId, memberId, scheduledAt) {
  const res = await api.patch(`${BASE}/${taskId}/assign`, {
    assignedTo: memberId,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
  });
  return res.data?.data;
}

/* ------------------------------------------------------------------ */
/*  Start / Reached / Complete — backend in step 5                     */
/*  action: "start" | "reach" | "complete"                             */
/* ------------------------------------------------------------------ */
export async function updateTaskStatus(
  taskId,
  action,
  { locationName = "" } = {},
) {
  const res = await api.patch(`${BASE}/${taskId}/${action}`, { locationName });
  return res.data?.data;
}

/* ------------------------------------------------------------------ */
/*  Cancel a task — leaders only (backend in step 5)                   */
/* ------------------------------------------------------------------ */
export async function cancelTask(taskId, reason = "") {
  const res = await api.patch(`${BASE}/${taskId}/cancel`, { reason });
  return res.data?.data;
}

/* ------------------------------------------------------------------ */
/*  Home-screen badge: open pickups + open drops                       */
/*  Leaders count all company tasks, others count their own.           */
/* ------------------------------------------------------------------ */
export async function getOpenServiceCount() {
  const scope = isTeamLeader() ? "all" : "mine";
  const [pickups, drops] = await Promise.all([
    listTasks({ scope, type: "pickup", status: "active" }),
    listTasks({ scope, type: "drop", status: "active" }),
  ]);
  return (pickups.counts.active || 0) + (drops.counts.active || 0);
}
