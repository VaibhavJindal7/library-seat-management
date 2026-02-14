/**
 * Admin seat management - Supabase operations for seats
 * Uses library_seats table (id, floor_no, seat_no, occupied)
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EXPECTED_SEAT_PLAN = { 0: 50, 1: 50, 2: 50 };
const EXPECTED_TOTAL_SEATS = 150;

/**
 * Fetch all seats from Supabase (library_seats table)
 * Returns format: { id, displayId, floor, occupied } for compatibility
 */
export async function fetchSeats() {
  const { data, error } = await supabase
    .from("library_seats")
    .select("id, floor_no, seat_no, occupied")
    .order("floor_no", { ascending: true })
    .order("seat_no", { ascending: true });

  if (error) {
    console.error("Error fetching seats:", error);
    return null;
  }

  if (!data || data.length === 0) return null;

  return data.map((r) => ({
    id: r.id,
    displayId: `F${r.floor_no}-S${String(r.seat_no).padStart(2, "0")}`,
    floor: r.floor_no,
    occupied: r.occupied,
  }));
}

/**
 * Update a seat's occupied status in Supabase (admin only, RLS enforced)
 * @param {string|number} seatId - numeric id from library_seats
 * @param {boolean} occupied
 */
export async function updateSeat(seatId, occupied) {
  const { error } = await supabase.from("library_seats").update({ occupied }).eq("id", seatId);
  if (error) {
    console.error("Error updating seat:", error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Seed default seats if table is empty (admin only) - uses library_seats
 */
export async function seedSeatsIfEmpty() {
  const existing = await fetchSeats();
  if (existing && existing.length >= EXPECTED_TOTAL_SEATS) {
    return { success: true };
  }

  const seats = [];
  Object.entries(EXPECTED_SEAT_PLAN).forEach(([floorKey, total]) => {
    const floor = Number(floorKey);
    for (let number = 1; number <= total; number += 1) {
      seats.push({
        floor_no: floor,
        seat_no: number,
        occupied: Math.random() > 0.5,
      });
    }
  });

  const { error } = await supabase.from("library_seats").upsert(seats, { onConflict: "floor_no,seat_no" });
  if (error) {
    console.error("Error seeding seats:", error);
    return { success: false, error: error.message };
  }
  return { success: true };
}
