/**
 * API client — all calls go through here so token handling and error
 * normalisation live in one place.
 *
 * The Vite dev proxy forwards /api → http://localhost:8000, so every
 * fetch uses a relative URL and no CORS preflight is needed in dev.
 */

const BASE = "/api";

function token() {
  return localStorage.getItem("token");
}

function headers(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  const t = token();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (typeof data?.detail === "string") {
      msg = data.detail;
    } else if (Array.isArray(data?.detail)) {
      msg = data.detail.map(d => d.msg || d.message || JSON.stringify(d)).join(", ");
    } else if (data?.detail && typeof data.detail === "object") {
      msg = data.detail.message || JSON.stringify(data.detail);
    } else if (data?.message) {
      msg = data.message;
    }
    const err = new Error(msg);
    err.status = res.status;
    err.detail = msg;
    throw err;
  }

  return data;
}

const get  = (path)        => request("GET",    path);
const post = (path, body)  => request("POST",   path, body);
const patch= (path, body)  => request("PATCH",  path, body);
const del  = (path, body)  => request("DELETE", path, body);

// ── Auth ──────────────────────────────────────────────────────────────────
export const signupCustomer = (body) => post("/auth/signup/customer", body);
export const signupProvider = (body) => post("/auth/signup/provider", body);
export const login          = (body) => post("/auth/login",           body);
export const me             = ()     => get("/auth/me");
export const demoAccounts   = ()     => get("/auth/demo-accounts");

// ── Catalog ───────────────────────────────────────────────────────────────
export const getCategories  = ()                         => get("/categories").then(d => (d.categories || []).map((c, i) => ({ ...c, id: c.name })));
export const getProviders   = (serviceType)              => get(`/providers${serviceType ? `?service_type=${encodeURIComponent(serviceType)}` : ""}`);
export const getProvider    = (id)                       => get(`/providers/${id}`);
export const getAvailability= (serviceType, days = 14, providerId = null) => {
  let url = `/availability?service_type=${encodeURIComponent(serviceType)}&days=${days}`;
  if (providerId) url += `&provider_id=${encodeURIComponent(providerId)}`;
  return get(url);
};
export const getStatusFlow  = ()                         => get("/status-flow");

// ── Matching & bookings ───────────────────────────────────────────────────
export const matchPreview       = (body) => post("/match-preview",    body);
export const createRequest      = (body) => post("/service-requests", body);
export const getRequest         = (id)   => get(`/service-requests/${id}`);
export const myRequests         = ()     => get("/my/requests");
export const cancelRequest      = (id)   => post(`/service-requests/${id}/cancel`);
export const updateStatus       = (id, new_status) => patch(`/service-requests/${id}/status`, { new_status });
export const rateService        = (id, rating, feedback = "") => post(`/service-requests/${id}/rate`, { rating, feedback });
export const getInvoice         = (id)   => get(`/service-requests/${id}/invoice`);

export const releasePayment     = (id) => post(`/service-requests/${id}/release-payment`);
export const disputeRequest      = (id, body) => post(`/service-requests/${id}/dispute`, body);

// ── Provider portal ───────────────────────────────────────────────────────
export const myJobs             = ()                 => get("/provider/me/jobs");
export const myStats            = ()                 => get("/provider/me/stats");
export const mySlots            = (days)             => get(`/provider/me/slots?days=${days ?? 14}`);
export const publishSlot        = (date, time_slot)  => post("/provider/me/slots",   { date, time_slot });
export const unpublishSlot      = (date, time_slot)  => del("/provider/me/slots",    { date, time_slot });
export const updateProfile      = (body)             => patch("/provider/me/profile", body);

// ── Notifications ─────────────────────────────────────────────────────────
export const getNotifications   = () => get("/notifications");
export const markNotificationsRead = () => post("/notifications/mark-read");

// ── Admin ─────────────────────────────────────────────────────────────────
export const getAdminStats       = () => get("/admin/stats");
export const getAdminUsers       = (role, search) => {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (search) params.set("search", search);
  const q = params.toString();
  return get(`/admin/users${q ? `?${q}` : ""}`);
};
export const toggleBanUser       = (userId) => patch(`/admin/users/${userId}/ban`);
export const getPendingProviders = () => get("/admin/providers/pending");
export const approveProvider     = (providerId) => patch(`/admin/providers/${providerId}/approve`);
export const rejectProvider      = (providerId) => patch(`/admin/providers/${providerId}/reject`);
export const getAdminDisputes    = () => get("/admin/disputes");
export const resolveAdminDispute = (requestId, body) => patch(`/admin/disputes/${requestId}/resolve`, body);


