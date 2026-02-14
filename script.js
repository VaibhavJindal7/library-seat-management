import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { fetchSeats, updateSeat } from "./admin.js";

if (window.location.protocol === "file:") {
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div style="background:#fef3c7;color:#92400e;padding:12px;text-align:center;font-weight:600">⚠️ Run with a local server: <code>npx serve .</code> — opening the file directly causes "failed to fetch"</div>'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authSection = document.getElementById("auth-section");
const dashboardSection = document.getElementById("dashboard-section");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const loginFormWrap = document.getElementById("login-form-wrap");
const signupFormWrap = document.getElementById("signup-form-wrap");
const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const loginMessage = document.getElementById("login-message");
const signupMessage = document.getElementById("signup-message");
const welcomeUser = document.getElementById("welcome-user");
const logoutBtn = document.getElementById("logout-btn");
const adminOnlyEl = document.getElementById("admin-only");
const seatsErrorEl = document.getElementById("seats-error");

const floorOneSeatsEl = document.getElementById("floor-1-seats");
const floorTwoSeatsEl = document.getElementById("floor-2-seats");
const floorZeroSeatsEl = document.getElementById("floor-0-seats");
const floorZeroCountEl = document.getElementById("floor-0-count");
const floorOneCountEl = document.getElementById("floor-1-count");
const floorTwoCountEl = document.getElementById("floor-2-count");

const state = {
  seats: [],
  user: null,
  profile: null,
  realtimeChannel: null,
};

function showMessage(el, text, isError = true) {
  el.textContent = text;
  el.style.color = isError ? "#d92d20" : "#2f9e44";
}

async function loadSeatsFromSupabase() {
  seatsErrorEl.classList.add("hidden");
  seatsErrorEl.textContent = "";
  const seats = await fetchSeats();
  if (seats && Array.isArray(seats) && seats.length > 0) {
    state.seats = seats;
  } else {
    state.seats = [];
    seatsErrorEl.textContent = "Could not load seats. Run the library_seats SQL in Supabase (see supabase-setup.sql).";
    seatsErrorEl.classList.remove("hidden");
  }
}

async function fetchProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("role, full_name, email").eq("id", userId).single();
  if (error) return null;
  return data;
}

function setLoggedIn(user, profile) {
  state.user = user;
  state.profile = profile;
  const displayName = profile?.full_name || profile?.email || user?.email || "User";
  const role = profile?.role || "user";
  welcomeUser.textContent = `Logged in as: ${displayName} (${role})`;
  authSection.classList.add("hidden");
  dashboardSection.classList.remove("hidden");

  if (role === "admin") {
    adminOnlyEl.classList.remove("hidden");
  } else {
    adminOnlyEl.classList.add("hidden");
  }
}

function setupRealtime() {
  if (state.realtimeChannel) return;
  state.realtimeChannel = supabase
    .channel("library-seats-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "library_seats" },
      async () => {
        await loadSeatsFromSupabase();
        renderSeats();
      }
    )
    .subscribe();
}

function teardownRealtime() {
  if (state.realtimeChannel) {
    supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }
}

function logout() {
  teardownRealtime();
  supabase.auth.signOut().then(() => {
    state.user = null;
    state.profile = null;
    dashboardSection.classList.add("hidden");
    authSection.classList.remove("hidden");
    loginForm.reset();
    signupForm.reset();
    loginMessage.textContent = "";
    signupMessage.textContent = "";
  });
}

function renderFloor(floor, targetEl, countEl) {
  targetEl.innerHTML = "";

  const floorSeats = state.seats.filter((seat) => seat.floor === floor);
  const vacantCount = floorSeats.filter((seat) => !seat.occupied).length;
  const occupiedCount = floorSeats.length - vacantCount;
  countEl.textContent = `Vacant: ${vacantCount} | Occupied: ${occupiedCount}`;

  const isAdmin = state.profile?.role === "admin";

  floorSeats.forEach((seat) => {
    const seatEl = document.createElement("button");
    seatEl.type = "button";
    seatEl.className = `seat ${seat.occupied ? "occupied" : "vacant"}`;
    const label = seat.displayId || seat.id;
    seatEl.textContent = label;
    seatEl.title = `${label} - ${seat.occupied ? "Occupied" : "Vacant"}${isAdmin ? " (click to toggle)" : ""}`;
    seatEl.dataset.id = seat.id;
    seatEl.disabled = !isAdmin;
    if (!isAdmin) seatEl.style.cursor = "default";
    targetEl.appendChild(seatEl);
  });
}

function renderSeats() {
  renderFloor(0, floorZeroSeatsEl, floorZeroCountEl);
  renderFloor(1, floorOneSeatsEl, floorOneCountEl);
  renderFloor(2, floorTwoSeatsEl, floorTwoCountEl);
}

async function toggleSeatStatus(seatId) {
  if (state.profile?.role !== "admin") return;
  const seat = state.seats.find((item) => String(item.id) === String(seatId));
  if (!seat) {
    seatsErrorEl.textContent = "Seat not found. Please refresh the page.";
    seatsErrorEl.classList.remove("hidden");
    return;
  }
  const newOccupied = !seat.occupied;
  const result = await updateSeat(seat.id, newOccupied);
  if (result.success) {
    seat.occupied = newOccupied;
    renderSeats();
  } else {
    seatsErrorEl.textContent = result.error || "Failed to update seat.";
    seatsErrorEl.classList.remove("hidden");
  }
}

// Tab switching
tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("active");
  tabSignup.classList.remove("active");
  loginFormWrap.classList.remove("hidden");
  signupFormWrap.classList.add("hidden");
  loginMessage.textContent = "";
  signupMessage.textContent = "";
});

tabSignup.addEventListener("click", () => {
  tabSignup.classList.add("active");
  tabLogin.classList.remove("active");
  signupFormWrap.classList.remove("hidden");
  loginFormWrap.classList.add("hidden");
  loginMessage.textContent = "";
  signupMessage.textContent = "";
});

// Login form
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const selectedRole = formData.get("loginRole") || "user";

  if (!email || !password) {
    showMessage(loginMessage, "Please enter email and password.");
    return;
  }

  if (SUPABASE_URL.includes("YOUR_PROJECT") || SUPABASE_ANON_KEY.includes("YOUR_ANON")) {
    showMessage(loginMessage, "Please configure Supabase in supabase-config.js");
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showMessage(loginMessage, error.message || "Invalid email or password.");
      return;
    }

    const profile = await fetchProfile(data.user.id);
    if (!profile) {
      showMessage(loginMessage, "Could not load your profile. Please try again.");
      await supabase.auth.signOut();
      return;
    }

    if (profile.role !== selectedRole) {
      await supabase.auth.signOut();
      showMessage(
        loginMessage,
        selectedRole === "admin" ? "You do not have admin access." : "Please use the Admin login."
      );
      return;
    }

    showMessage(loginMessage, "", false);
    setLoggedIn(data.user, profile);
    await loadSeatsFromSupabase();
    renderSeats();
    setupRealtime();
  } catch (err) {
    if (err?.name === "AbortError" || err?.message?.toLowerCase().includes("aborted")) return;
    const msg = err?.message || "";
    if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("network")) {
      showMessage(
        loginMessage,
        "Network error. Run the app with a local server: npx serve . (Opening the HTML file directly won't work)"
      );
    } else {
      showMessage(loginMessage, msg || "Something went wrong. Please try again.");
    }
  }
});

// Signup form
signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(signupForm);
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();

  if (!email || !password) {
    showMessage(signupMessage, "Please enter email and password.");
    return;
  }

  if (password.length < 6) {
    showMessage(signupMessage, "Password must be at least 6 characters.");
    return;
  }

  if (SUPABASE_URL.includes("YOUR_PROJECT") || SUPABASE_ANON_KEY.includes("YOUR_ANON")) {
    showMessage(signupMessage, "Please configure Supabase in supabase-config.js");
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: "user" },
      },
    });

    if (error) {
      showMessage(signupMessage, error.message || "Sign up failed. Please try again.");
      return;
    }

    if (data?.user?.identities?.length === 0) {
      showMessage(signupMessage, "An account with this email already exists. Please login instead.");
      return;
    }

    showMessage(signupMessage, "Account created! Check your email to confirm, or login now.", false);

    const profile = await fetchProfile(data.user.id);
    if (profile) {
      setLoggedIn(data.user, profile);
      await loadSeatsFromSupabase();
      renderSeats();
      setupRealtime();
    } else {
      tabLogin.click();
      showMessage(loginMessage, "Account created. You can login now.", false);
    }
  } catch (err) {
    if (err?.name === "AbortError" || err?.message?.toLowerCase().includes("aborted")) return;
    const msg = err?.message || "";
    if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("network")) {
      showMessage(
        signupMessage,
        "Network error. Run the app with a local server: npx serve . (Opening the HTML file directly won't work)"
      );
    } else {
      showMessage(signupMessage, msg || "Something went wrong. Please try again.");
    }
  }
});

dashboardSection.addEventListener("click", (event) => {
  const seatEl = event.target.closest(".seat");
  if (!seatEl) return;
  toggleSeatStatus(seatEl.dataset.id);
});

logoutBtn.addEventListener("click", logout);

// Check existing session
supabase.auth.getSession().then(async ({ data: { session } }) => {
  if (session?.user) {
    const profile = await fetchProfile(session.user.id);
    if (profile) {
      setLoggedIn(session.user, profile);
      await loadSeatsFromSupabase();
      renderSeats();
      setupRealtime();
    } else {
      await supabase.auth.signOut();
    }
  }
});
