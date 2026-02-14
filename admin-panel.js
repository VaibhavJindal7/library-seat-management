import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginPanel = document.getElementById("admin-login-panel");
const dashboard = document.getElementById("admin-dashboard");
const loginForm = document.getElementById("admin-login-form");
const loginMessage = document.getElementById("admin-login-message");
const logoutBtn = document.getElementById("admin-logout");
const adminEmailView = document.getElementById("admin-email-view");
const globalCountEl = document.getElementById("admin-global-count");

const floorSeatsEls = {
  0: document.getElementById("floor-0-seats"),
  1: document.getElementById("floor-1-seats"),
  2: document.getElementById("floor-2-seats"),
};

const floorCountEls = {
  0: document.getElementById("floor-0-count"),
  1: document.getElementById("floor-1-count"),
  2: document.getElementById("floor-2-count"),
};

let seatRows = [];
let pollInterval = null;

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(() => fetchSeats(), 5000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function renderFloor(floorNo) {
  const rows = seatRows
    .filter((r) => r.floor_no === floorNo)
    .sort((a, b) => a.seat_no - b.seat_no);
  const floorEl = floorSeatsEls[floorNo];
  const countEl = floorCountEls[floorNo];
  floorEl.innerHTML = "";

  const vacant = rows.filter((r) => !r.occupied).length;
  const occupied = rows.length - vacant;
  countEl.textContent = `Vacant: ${vacant} | Occupied: ${occupied}`;

  rows.forEach((row) => {
    const seatEl = document.createElement("button");
    seatEl.type = "button";
    seatEl.className = `seat ${row.occupied ? "occupied" : "vacant"}`;
    seatEl.textContent = `F${floorNo}-S${String(row.seat_no).padStart(2, "0")}`;
    seatEl.dataset.id = row.id;
    seatEl.title = `Click to toggle`;
    floorEl.appendChild(seatEl);
  });
}

function renderAll() {
  renderFloor(0);
  renderFloor(1);
  renderFloor(2);
  const vacant = seatRows.filter((r) => !r.occupied).length;
  globalCountEl.textContent = `Total Seats: ${seatRows.length} | Vacant: ${vacant} | Occupied: ${seatRows.length - vacant}`;
}

function showDashboard(session) {
  adminEmailView.textContent = `Logged in as: ${session.user.email}`;
  loginPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

function showLogin() {
  dashboard.classList.add("hidden");
  loginPanel.classList.remove("hidden");
}

async function fetchSeats() {
  const { data, error } = await supabaseClient
    .from("library_seats")
    .select("id,floor_no,seat_no,occupied")
    .order("floor_no", { ascending: true })
    .order("seat_no", { ascending: true });

  if (error) {
    globalCountEl.textContent = `Error loading seats: ${error.message}`;
    return;
  }
  seatRows = data || [];
  renderAll();
}

async function toggleSeat(seatId) {
  const seat = seatRows.find((r) => String(r.id) === String(seatId));
  if (!seat) return;

  const { error } = await supabaseClient
    .from("library_seats")
    .update({ occupied: !seat.occupied })
    .eq("id", seat.id);

  if (error) {
    alert(`Update failed: ${error.message}`);
    return;
  }

  await fetchSeats();
}

function setupRealtime() {
  try {
    supabaseClient
      .channel("library-seats-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "library_seats" },
        () => fetchSeats()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") stopPolling();
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") startPolling();
      });
  } catch (_) {}
  startPolling();
}

async function isAdmin(userId) {
  const { data } = await supabaseClient.from("profiles").select("role").eq("id", userId).single();
  return data?.role === "admin";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";

  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    loginMessage.textContent = error.message;
    return;
  }

  if (!(await isAdmin(data.session.user.id))) {
    await supabaseClient.auth.signOut();
    loginMessage.textContent = "You do not have admin access.";
    return;
  }

  showDashboard(data.session);
  await fetchSeats();
});

dashboard.addEventListener("click", async (event) => {
  const seatBtn = event.target.closest(".seat");
  if (!seatBtn) return;
  await toggleSeat(seatBtn.dataset.id);
});

logoutBtn.addEventListener("click", async () => {
  stopPolling();
  await supabaseClient.auth.signOut();
  showLogin();
});

async function bootstrap() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session) {
    if (await isAdmin(session.user.id)) {
      showDashboard(session);
      await fetchSeats();
    } else {
      await supabaseClient.auth.signOut();
      showLogin();
    }
  } else {
    showLogin();
  }

  setupRealtime();
}

bootstrap();
