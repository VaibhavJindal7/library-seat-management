import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORAGE_KEY = "nitj-library-seats-v1";

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
};

const EXPECTED_SEAT_PLAN = { 0: 50, 1: 50, 2: 50 };
const EXPECTED_TOTAL_SEATS = Object.values(EXPECTED_SEAT_PLAN).reduce((sum, count) => sum + count, 0);

function showMessage(el, text, isError = true) {
  el.textContent = text;
  el.style.color = isError ? "#d92d20" : "#2f9e44";
}

function makeDefaultSeats() {
  const seats = [];
  Object.entries(EXPECTED_SEAT_PLAN).forEach(([floorKey, total]) => {
    const floor = Number(floorKey);
    for (let number = 1; number <= total; number += 1) {
      seats.push({
        id: `F${floor}-S${String(number).padStart(2, "0")}`,
        floor,
        occupied: Math.random() > 0.5,
      });
    }
  });
  return seats;
}

function saveSeats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.seats));
}

function loadSeats() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.seats = makeDefaultSeats();
    saveSeats();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === EXPECTED_TOTAL_SEATS) {
      const counts = parsed.reduce(
        (acc, seat) => {
          if (seat.floor in acc) acc[seat.floor] += 1;
          return acc;
        },
        { 0: 0, 1: 0, 2: 0 }
      );

      const isValidPlan = Object.entries(EXPECTED_SEAT_PLAN).every(
        ([floor, expected]) => counts[floor] === expected
      );

      if (!isValidPlan) {
        state.seats = makeDefaultSeats();
        saveSeats();
        return;
      }

      state.seats = parsed;
      return;
    }
  } catch {}

  state.seats = makeDefaultSeats();
  saveSeats();
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

function logout() {
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
    seatEl.textContent = seat.id;
    seatEl.title = `${seat.id} - ${seat.occupied ? "Occupied" : "Vacant"}${isAdmin ? " (click to toggle)" : ""}`;
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

function toggleSeatStatus(seatId) {
  if (state.profile?.role !== "admin") return;
  const seat = state.seats.find((item) => item.id === seatId);
  if (!seat) return;
  seat.occupied = !seat.occupied;
  saveSeats();
  renderSeats();
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
    renderSeats();
  } catch (err) {
    showMessage(loginMessage, err.message || "Something went wrong. Please try again.");
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
      renderSeats();
    } else {
      tabLogin.click();
      showMessage(loginMessage, "Account created. You can login now.", false);
    }
  } catch (err) {
    showMessage(signupMessage, err.message || "Something went wrong. Please try again.");
  }
});

dashboardSection.addEventListener("click", (event) => {
  const seatEl = event.target.closest(".seat");
  if (!seatEl) return;
  toggleSeatStatus(seatEl.dataset.id);
});

logoutBtn.addEventListener("click", logout);

loadSeats();

// Check existing session
supabase.auth.getSession().then(async ({ data: { session } }) => {
  if (session?.user) {
    const profile = await fetchProfile(session.user.id);
    if (profile) {
      setLoggedIn(session.user, profile);
      renderSeats();
    } else {
      await supabase.auth.signOut();
    }
  }
});
