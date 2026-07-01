import { useState, useEffect, useMemo } from "react";
import {
  Clock, Lock, Check, X, ChevronLeft, ChevronRight, CreditCard, Calendar,
  LayoutDashboard, ListChecks, Settings, Plus, Eye, EyeOff, Trash2,
} from "lucide-react";
import { supabase } from "./supabaseClient";

const COLORS = {
  onyx: "#12100D",
  ivory: "#FBF8F1",
  card: "#FFFFFF",
  border: "#E1DACB",
  muted: "#8A8578",
  text: "#3A362E",
  gold: "#B8924A",
  goldDark: "#93551C",
  pine: "#3F5643",
  pineLight: "#E4F1E8",
  success: "#1E7A4F",
  successBg: "#E4F1E8",
  danger: "#A5382E",
  dangerBg: "#F7E6E3",
  warn: "#93551C",
  warnBg: "#F3E4D2",
};

// Legend / status colors — distinct from brand accent colors above,
// since these encode booking status, not brand identity.
const STATUS = {
  available: { bg: "#FFFFFF", border: COLORS.border, text: COLORS.text, label: "Available" },
  selected: { bg: "#EAF1FD", border: "#2F6FED", text: "#1E4FB8", label: "Selected" },
  mine: { bg: "#E3F6FB", border: "#1C8FB0", text: "#136F87", label: "Your booking" },
  booked: { bg: "#EFEDE5", border: "#D3D1C7", text: COLORS.muted, label: "Booked" },
  unavailable: { bg: "#FBE9E7", border: "#C0392B", text: "#9A2E22", label: "Unavailable" },
  comingSoon: { bg: "#F5F3EC", border: "#E1DACB", text: "#B4B2A9", label: "Coming soon" },
};

const COURTS = [
  { id: "court-1", name: "Court 1", tag: "Outdoor", active: true },
  { id: "court-2", name: "Court 2", tag: "Coming soon", active: false },
  { id: "court-3", name: "Court 3", tag: "Coming soon", active: false },
  { id: "court-4", name: "Court 4", tag: "Coming soon", active: false },
  { id: "court-5", name: "Court 5", tag: "Coming soon", active: false },
];

function generateSlots() {
  const slots = [];
  for (let h = 6; h < 23; h++) {
    const label = `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"} - ${
      (h + 1) % 12 === 0 ? 12 : (h + 1) % 12
    }:00 ${h + 1 < 12 || h + 1 === 24 ? "AM" : "PM"}`;
    const section = h < 11 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
    slots.push({ id: `slot-${h}`, label, section, hour: h });
  }
  return slots;
}

const ALL_SLOTS = generateSlots();

const PAYMENT_METHODS = [
  { id: "qrph", label: "QR Ph (InstaPay)", feePct: 0.02, available: true },
  { id: "gcash", label: "GCash", feePct: 0.03, available: true },
  { id: "maya", label: "Maya", feePct: 0.03, available: true },
  { id: "card", label: "Credit / Debit card", feePct: 0.03125, flatFee: 13.39, available: false },
];

function computeTotal(basePrice, method) {
  if (!method) return basePrice;
  const withPct = basePrice * (1 + method.feePct);
  const withFlat = withPct + (method.flatFee || 0);
  return Math.round(withFlat);
}

const INITIAL_CLOSURES = [
  { id: "c1", type: "Single date", when: "Jul 14, 2026", reason: "Closed for net resurfacing" },
  { id: "c2", type: "Recurring weekly", when: "Every Monday", reason: "Weekly deep clean" },
];

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
}

function getMonthMatrix(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toDateStr(new Date(year, month, day)));
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { weeks, monthLabel };
}

export default function CourtFlowPrototype() {
  const [view, setView] = useState("home");
  const [panelOpen, setPanelOpen] = useState(false);
  const [step, setStep] = useState("details");
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [courtId, setCourtId] = useState(null);
  const [bookingError, setBookingError] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [showPw, setShowPw] = useState(false);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [bookedHours, setBookedHours] = useState([]);
  const [myHours, setMyHours] = useState([]);
  const [selected, setSelected] = useState([]);
  const [holdSeconds, setHoldSeconds] = useState(900);

  const [payment, setPayment] = useState(null);
  const [agree1, setAgree1] = useState(false);
  const [agree2, setAgree2] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [bookings, setBookings] = useState([]);
  const [myTab, setMyTab] = useState("upcoming");
  const [rescheduleId, setRescheduleId] = useState(null);

  const [closures, setClosures] = useState(INITIAL_CLOSURES);
  const [newClosureOpen, setNewClosureOpen] = useState(false);
  const [newClosureReason, setNewClosureReason] = useState("");
  const [newClosureWhen, setNewClosureWhen] = useState("");
  const [adminTab, setAdminTab] = useState("dashboard");

  const basePrice = selected.length * 300;
  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === payment) || null;
  const totalPrice = computeTotal(basePrice, selectedMethod);
  const holdActive = selected.length > 0 && step !== "confirm";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setLoggedIn(true);
        setCurrentUserId(data.session.user.id);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setLoggedIn(true);
        setCurrentUserId(session.user.id);
      } else {
        setLoggedIn(false);
        setCurrentUserId(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    supabase
      .from("courts")
      .select("id")
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (data) setCourtId(data.id);
        if (error) console.error("Could not load court:", error.message);
      });
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setBookings([]);
      return;
    }
    loadMyBookings();
  }, [currentUserId]);

  async function loadMyBookings() {
    const { data, error } = await supabase
      .from("booking_slots")
      .select("id, slot_date, start_time, end_time, price, status, bookings!inner(user_id)")
      .eq("bookings.user_id", currentUserId)
      .eq("status", "booked")
      .order("slot_date", { ascending: true });

    if (error) {
      console.error("Could not load bookings:", error.message);
      return;
    }

    const now = new Date();
    const mapped = data.map((row) => {
      const start = new Date(`${row.slot_date}T${row.start_time}`);
      const hoursUntil = (start - now) / (1000 * 60 * 60);
      return {
        id: row.id,
        dateLabel: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        timeLabel: `${row.start_time.slice(0, 5)} - ${row.end_time.slice(0, 5)}`,
        price: row.price,
        hoursUntil,
      };
    });
    setBookings(mapped);
  }

  useEffect(() => {
    if (!courtId) return;
    loadAvailability(selectedDate);
  }, [selectedDate, courtId]);

  async function loadAvailability(dateStr) {
    const { data, error } = await supabase
      .from("booking_slots")
      .select("start_time, bookings!inner(user_id)")
      .eq("court_id", courtId)
      .eq("slot_date", dateStr)
      .eq("status", "booked");

    if (error) {
      console.error("Could not load availability:", error.message);
      return;
    }
    const all = [];
    const mine = [];
    data.forEach((r) => {
      const hour = parseInt(r.start_time.slice(0, 2), 10);
      all.push(hour);
      if (currentUserId && r.bookings.user_id === currentUserId) mine.push(hour);
    });
    setBookedHours(all);
    setMyHours(mine);
  }

  useEffect(() => {
    if (!holdActive) return;
    const t = setInterval(() => {
      setHoldSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [holdActive]);

  function resetSelection() {
    setPanelOpen(false);
    setStep("details");
    setSelected([]);
    setHoldSeconds(900);
    setPayment(null);
    setAgree1(false);
    setAgree2(false);
    setBookingError("");
  }

  function toggleSlot(slot) {
    if (bookedHours.includes(slot.hour)) return;
    const isTodaySel = selectedDate === todayStr();
    const currentHour = new Date().getHours();
    if (isTodaySel && slot.hour <= currentHour) return;
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === slot.id);
      if (exists) return prev.filter((s) => s.id !== slot.id);
      if (prev.length >= 3) return prev;
      return [...prev, slot];
    });
  }

  function handleBookNow() {
    if (selected.length === 0) return;
    if (!loggedIn) {
      setShowLogin(true);
      return;
    }
    setStep("details");
    setPanelOpen(true);
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    if (authMode === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      setAuthLoading(false);
      if (error) {
        setAuthError(error.message);
        return;
      }
      setLoggedIn(true);
      setCurrentUserId(data.user.id);
      setShowLogin(false);
      if (selected.length > 0) {
        setStep("details");
        setPanelOpen(true);
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) {
        setAuthLoading(false);
        setAuthError(error.message);
        return;
      }
      const { error: profileError } = await supabase.from("users").insert({
        id: data.user.id,
        name: authName,
        email: authEmail,
        phone: "",
      });
      setAuthLoading(false);
      if (profileError) {
        setAuthError(profileError.message);
        return;
      }
      setLoggedIn(true);
      setCurrentUserId(data.user.id);
      setShowLogin(false);
      if (selected.length > 0) {
        setStep("details");
        setPanelOpen(true);
      }
    }
  }

  async function handleConfirm() {
    setBookingError("");

    if (!currentUserId || !courtId) {
      setBookingError("Could not identify your account or the court. Please refresh and try again.");
      return;
    }

    const { data: bookingRow, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        user_id: currentUserId,
        total_amount: totalPrice,
        payment_method: payment,
        payment_status: "paid",
      })
      .select()
      .single();

    if (bookingErr) {
      setBookingError(bookingErr.message);
      return;
    }

    const slotRows = selected.map((s) => ({
      booking_id: bookingRow.id,
      court_id: courtId,
      slot_date: selectedDate,
      start_time: `${String(s.hour).padStart(2, "0")}:00:00`,
      end_time: `${String(s.hour + 1).padStart(2, "0")}:00:00`,
      price: 300,
      status: "booked",
    }));

    const { error: slotsErr } = await supabase.from("booking_slots").insert(slotRows);

    if (slotsErr) {
      setBookingError(slotsErr.message);
      return;
    }

    await loadMyBookings();
    await loadAvailability(selectedDate);
    setStep("confirm");
  }

  const canSubmitDetails = name && email && phone && payment && agree1 && agree2;

  const bySection = useMemo(() => {
    const g = { Morning: [], Afternoon: [], Evening: [] };
    ALL_SLOTS.forEach((s) => g[s.section].push(s));
    return g;
  }, []);

  const isToday = selectedDate === todayStr();

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: COLORS.ivory, minHeight: "100vh", color: COLORS.text }}>
      <style>{`
        .cf-btn { cursor: pointer; border: none; font-family: inherit; transition: opacity 0.15s, transform 0.1s; }
        .cf-btn:active { transform: scale(0.98); }
        .cf-btn:disabled { cursor: not-allowed; }
        .cf-input { width: 100%; height: 40px; border-radius: 8px; border: 1px solid ${COLORS.border}; padding: 0 12px; font-size: 14px; box-sizing: border-box; background: #fff; font-family: inherit; }
        .cf-input:focus { outline: 2px solid ${COLORS.gold}; outline-offset: 1px; }
        .cf-label { font-size: 12px; color: ${COLORS.muted}; display: block; margin-bottom: 4px; }
        .cf-tab { padding: 10px 4px; cursor: pointer; border-bottom: 2px solid transparent; font-size: 14px; }
        .cf-tab.active { border-bottom-color: ${COLORS.onyx}; font-weight: 500; color: ${COLORS.onyx}; }
        .cf-tab:not(.active) { color: ${COLORS.muted}; }
        .cf-slot-row { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-radius:10px; border:1px solid ${COLORS.border}; margin-bottom:8px; cursor:pointer; background:#fff; }
        .cf-cell-hover { opacity: 0; transition: opacity 0.1s; }
        .cf-cell:hover .cf-cell-hover { opacity: 1; }
      `}</style>

      {/* Top nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 32px", borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 20, color: COLORS.onyx, letterSpacing: 0.5 }}>CourtFlow</div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <button className="cf-btn" onClick={() => setView("home")} style={{ background: "none", fontSize: 13, color: view === "home" ? COLORS.onyx : COLORS.muted, fontWeight: view === "home" ? 500 : 400 }}>
            Home
          </button>
          <button className="cf-btn" onClick={() => setView("account")} style={{ background: "none", fontSize: 13, color: view === "account" ? COLORS.onyx : COLORS.muted, fontWeight: view === "account" ? 500 : 400 }}>
            Account
          </button>
          <button className="cf-btn" onClick={() => setView("admin")} style={{ background: "none", fontSize: 13, color: view === "admin" ? COLORS.onyx : COLORS.muted, fontWeight: view === "admin" ? 500 : 400 }}>
            Admin
          </button>
          {!loggedIn && (
            <button className="cf-btn" onClick={() => setShowLogin(true)} style={{ height: 34, padding: "0 16px", borderRadius: 8, background: COLORS.onyx, color: COLORS.gold, fontSize: 13 }}>
              Log in
            </button>
          )}
        </div>
      </div>

      {view === "home" && (
        <HomeView
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          isToday={isToday}
          bySection={bySection}
          bookedHours={bookedHours}
          myHours={myHours}
          selected={selected}
          toggleSlot={toggleSlot}
          basePrice={basePrice}
          handleBookNow={handleBookNow}
        />
      )}

      {view === "account" && (
        <AccountView
          loggedIn={loggedIn}
          myTab={myTab}
          setMyTab={setMyTab}
          bookings={bookings}
          rescheduleId={rescheduleId}
          setRescheduleId={setRescheduleId}
          loadMyBookings={loadMyBookings}
          loadAvailability={loadAvailability}
          selectedDate={selectedDate}
          courtId={courtId}
          onLoginClick={() => setShowLogin(true)}
        />
      )}

      {view === "admin" && (
        <AdminView
          adminTab={adminTab}
          setAdminTab={setAdminTab}
          bookings={bookings}
          closures={closures}
          setClosures={setClosures}
          newClosureOpen={newClosureOpen}
          setNewClosureOpen={setNewClosureOpen}
          newClosureReason={newClosureReason}
          setNewClosureReason={setNewClosureReason}
          newClosureWhen={newClosureWhen}
          setNewClosureWhen={setNewClosureWhen}
        />
      )}

      {/* Booking panel overlay: details + confirm only */}
      {panelOpen && (
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "100%", background: COLORS.ivory, borderLeft: `1px solid ${COLORS.border}`, boxShadow: "-8px 0 24px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", zIndex: 40 }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: COLORS.onyx }}>
              {step === "details" && "Details and payment"}
              {step === "confirm" && "Confirmed"}
            </span>
            {step !== "confirm" && (
              <button className="cf-btn" onClick={() => setPanelOpen(false)} style={{ background: "none", padding: 4 }} aria-label="Close booking panel">
                <X size={18} color={COLORS.muted} />
              </button>
            )}
          </div>

          {holdActive && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.warnBg, padding: "8px 20px" }}>
              <Clock size={14} color={COLORS.warn} />
              <span style={{ fontSize: 12, color: COLORS.warn }}>Held for {fmt(holdSeconds)}</span>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {step === "details" && (
              <div>
                <div style={{ background: COLORS.warnBg, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: COLORS.warn, marginBottom: 16 }}>
                  Payments are non-refundable. Review your booking carefully before submitting.
                </div>

                <div style={{ background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <p style={{ fontSize: 12, color: COLORS.muted, margin: "0 0 8px" }}>{formatDateLabel(selectedDate)}</p>
                  {selected.map((s) => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                      <span>{s.label}</span>
                      <span>₱300</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.muted, padding: "4px 0" }}>
                    <span>Subtotal</span>
                    <span>₱{basePrice}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.muted, padding: "4px 0" }}>
                    <span>Processing fee</span>
                    <span>{selectedMethod ? `₱${totalPrice - basePrice}` : "Select a method"}</span>
                  </div>
                  <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 500, fontSize: 14 }}>
                    <span>Total</span>
                    <span>₱{totalPrice}</span>
                  </div>
                </div>

                <label className="cf-label">Name</label>
                <input className="cf-input" style={{ marginBottom: 12 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Dela Cruz" />
                <label className="cf-label">Email</label>
                <input className="cf-input" style={{ marginBottom: 12 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" />
                <label className="cf-label">Phone</label>
                <input className="cf-input" style={{ marginBottom: 16 }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09XX XXX XXXX" />

                <p className="cf-label">Payment method</p>
                <p style={{ fontSize: 11, color: COLORS.muted, marginTop: -2, marginBottom: 10 }}>Total updates with the selected payment method.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {PAYMENT_METHODS.map((m) => {
                    const isSelected = payment === m.id;
                    const methodTotal = computeTotal(basePrice, m);
                    return (
                      <button
                        key={m.id}
                        className="cf-btn"
                        disabled={!m.available}
                        onClick={() => m.available && setPayment(m.id)}
                        style={{
                          height: 46,
                          borderRadius: 8,
                          border: `1px solid ${isSelected ? COLORS.onyx : COLORS.border}`,
                          background: isSelected ? COLORS.onyx : "#fff",
                          color: isSelected ? COLORS.gold : m.available ? COLORS.text : COLORS.muted,
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0 14px",
                          opacity: m.available ? 1 : 0.55,
                          cursor: m.available ? "pointer" : "not-allowed",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <CreditCard size={14} />
                          {m.label}
                        </span>
                        <span style={{ fontSize: 12 }}>{m.available ? `₱${methodTotal}` : "Coming soon"}</span>
                      </button>
                    );
                  })}
                </div>

                <label style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 10, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={agree1} onChange={(e) => setAgree1(e.target.checked)} style={{ marginTop: 2 }} />
                  I understand this booking cannot be modified less than 12 hours before its start time.
                </label>
                <label style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 20, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={agree2} onChange={(e) => setAgree2(e.target.checked)} style={{ marginTop: 2 }} />
                  I agree to the terms and conditions and waiver.
                </label>

                {bookingError && (
                  <div style={{ background: COLORS.dangerBg, color: COLORS.danger, fontSize: 12, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                    {bookingError}
                  </div>
                )}

                <button
                  className="cf-btn"
                  disabled={!canSubmitDetails}
                  onClick={handleConfirm}
                  style={{ width: "100%", height: 46, borderRadius: 8, background: canSubmitDetails ? COLORS.onyx : COLORS.border, color: canSubmitDetails ? COLORS.gold : COLORS.muted, fontSize: 14, fontWeight: 500 }}
                >
                  Pay ₱{totalPrice}
                </button>
              </div>
            )}

            {step === "confirm" && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: COLORS.successBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Check size={26} color={COLORS.success} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 500, color: COLORS.onyx, marginBottom: 6 }}>Booking confirmed</p>
                <p style={{ fontSize: 13, color: COLORS.muted, marginBottom: 24 }}>A confirmation and receipt have been sent to {email || "your email"}.</p>
                <button className="cf-btn" onClick={resetSelection} style={{ height: 42, padding: "0 20px", borderRadius: 8, background: COLORS.onyx, color: COLORS.gold, fontSize: 13 }}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Login / register modal */}
      {showLogin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(18,16,13,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ width: 380, background: COLORS.ivory, borderRadius: 16, padding: 28, position: "relative" }}>
            <button className="cf-btn" onClick={() => setShowLogin(false)} style={{ position: "absolute", top: 16, right: 16, background: "none", padding: 4 }} aria-label="Close">
              <X size={18} color={COLORS.muted} />
            </button>
            {selected.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.warnBg, borderRadius: 8, padding: "8px 12px", marginBottom: 20, marginRight: 24 }}>
                <Clock size={14} color={COLORS.warn} />
                <span style={{ fontSize: 12, color: COLORS.warn }}>Your slots are held for {fmt(holdSeconds)} while you sign in</span>
              </div>
            )}

            <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}`, marginBottom: 20 }}>
              {["login", "register"].map((m) => (
                <div
                  key={m}
                  onClick={() => setAuthMode(m)}
                  style={{ flex: 1, textAlign: "center", padding: "10px 0", cursor: "pointer", borderBottom: authMode === m ? `2px solid ${COLORS.onyx}` : "none", fontSize: 14, fontWeight: authMode === m ? 500 : 400, color: authMode === m ? COLORS.onyx : COLORS.muted }}
                >
                  {m === "login" ? "Log in" : "Create account"}
                </div>
              ))}
            </div>

            <form onSubmit={handleLoginSubmit}>
              {authError && (
                <div style={{ background: COLORS.dangerBg, color: COLORS.danger, fontSize: 12, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                  {authError}
                </div>
              )}
              {authMode === "register" && (
                <>
                  <label className="cf-label">Name</label>
                  <input className="cf-input" style={{ marginBottom: 12 }} required value={authName} onChange={(e) => setAuthName(e.target.value)} />
                </>
              )}
              <label className="cf-label">Email</label>
              <input className="cf-input" style={{ marginBottom: 12 }} type="email" required placeholder="name@email.com" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
              <label className="cf-label">Password</label>
              <div style={{ position: "relative", marginBottom: 8 }}>
                <input className="cf-input" type={showPw ? "text" : "password"} required style={{ paddingRight: 36 }} placeholder="Enter your password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
                <button type="button" className="cf-btn" onClick={() => setShowPw((v) => !v)} style={{ position: "absolute", right: 8, top: 8, background: "none" }} aria-label={showPw ? "Hide password" : "Show password"}>
                  {showPw ? <EyeOff size={16} color={COLORS.muted} /> : <Eye size={16} color={COLORS.muted} />}
                </button>
              </div>

              {authMode === "login" && (
                <div style={{ textAlign: "right", marginBottom: 20 }}>
                  <span style={{ fontSize: 12, color: COLORS.goldDark }}>Forgot password?</span>
                </div>
              )}

              <button
                type="submit"
                className="cf-btn"
                disabled={authLoading}
                style={{ width: "100%", height: 42, borderRadius: 8, background: COLORS.onyx, color: COLORS.gold, fontSize: 14, fontWeight: 500, marginTop: authMode === "register" ? 8 : 0, opacity: authLoading ? 0.6 : 1 }}
              >
                {authLoading ? "Please wait..." : authMode === "login" ? "Log in and continue" : "Create account and continue"}
              </button>
            </form>

            <p style={{ fontSize: 11, color: COLORS.muted, textAlign: "center", marginTop: 12 }}>
              Logging in keeps your booking tied to your account for later cancellation or reschedule.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function HomeView({ selectedDate, setSelectedDate, isToday, bySection, bookedHours, myHours, selected, toggleSlot, basePrice, handleBookNow }) {
  const [showMonth, setShowMonth] = useState(false);
  const { weeks, monthLabel } = useMemo(() => getMonthMatrix(selectedDate), [selectedDate]);
  const currentHour = new Date().getHours();

  function cellStatus(slot) {
    if (isToday && slot.hour <= currentHour) return "unavailable";
    if (myHours.includes(slot.hour)) return "mine";
    if (bookedHours.includes(slot.hour)) return "booked";
    if (selected.some((s) => s.id === slot.id)) return "selected";
    return "available";
  }

  return (
    <div style={{ padding: "40px 32px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 4 }}>
        <button className="cf-btn" onClick={() => setSelectedDate(addDays(selectedDate, -1))} style={{ background: "none", padding: 6 }} aria-label="Previous day">
          <ChevronLeft size={18} color={COLORS.onyx} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="cf-btn" onClick={() => setShowMonth((v) => !v)} style={{ background: "none", padding: 4, display: "flex" }} aria-label="Open calendar">
            <Calendar size={16} color={COLORS.muted} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 500, color: COLORS.onyx }}>{formatDateLabel(selectedDate)}</span>
          {isToday && <span style={{ background: COLORS.pineLight, color: COLORS.pine, fontSize: 11, padding: "2px 8px", borderRadius: 6 }}>Today</span>}
        </div>
        <button className="cf-btn" onClick={() => setSelectedDate(addDays(selectedDate, 1))} style={{ background: "none", padding: 6 }} aria-label="Next day">
          <ChevronRight size={18} color={COLORS.onyx} />
        </button>

        {showMonth && (
          <div style={{ position: "absolute", top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 10, width: 280 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: COLORS.onyx, textAlign: "center", marginBottom: 10 }}>{monthLabel}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", fontSize: 11, color: COLORS.muted, textAlign: "center", marginBottom: 4 }}>
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span key={d}>{d}</span>)}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
                {week.map((dateStr, di) => (
                  <button
                    key={di}
                    className="cf-btn"
                    disabled={!dateStr}
                    onClick={() => {
                      if (!dateStr) return;
                      setSelectedDate(dateStr);
                      setShowMonth(false);
                    }}
                    style={{
                      height: 30,
                      borderRadius: 6,
                      background: dateStr === selectedDate ? COLORS.onyx : "transparent",
                      color: dateStr === selectedDate ? COLORS.gold : dateStr ? COLORS.text : "transparent",
                      fontSize: 12,
                    }}
                  >
                    {dateStr ? parseInt(dateStr.slice(-2), 10) : ""}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={{ fontSize: 13, color: COLORS.muted, marginBottom: 20 }}>6:00 AM – 11:00 PM | ₱300/hour</p>

      <div style={{ overflowX: "auto", marginTop: 20, marginBottom: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Time</th>
              {COURTS.map((c) => (
                <th key={c.id} style={{ padding: "8px 10px", fontSize: 12, color: COLORS.onyx, fontWeight: 500 }}>
                  {c.name}
                  <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 400 }}>{c.tag}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(bySection).map(([section, slots]) => (
              <>
                <tr key={section}>
                  <td colSpan={COURTS.length + 1} style={{ padding: "14px 10px 6px", fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {section}
                  </td>
                </tr>
                {slots.map((slot) => {
                  const status = cellStatus(slot);
                  const s = STATUS[status];
                  return (
                    <tr key={slot.id}>
                      <td style={{ padding: "4px 10px", fontSize: 12, color: COLORS.text, whiteSpace: "nowrap" }}>{slot.label}</td>
                      <td style={{ padding: "3px 6px" }}>
                        <button
                          className="cf-btn cf-cell"
                          disabled={status === "booked" || status === "unavailable" || status === "mine"}
                          onClick={() => toggleSlot(slot)}
                          style={{ width: "100%", height: 34, borderRadius: 6, border: `1px solid ${s.border}`, background: s.bg, color: s.text, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                        >
                          {status === "available" && <span className="cf-cell-hover">Select</span>}
                          {status === "selected" && (
                            <>
                              <Check size={12} color={s.text} />
                              <span>Selected</span>
                            </>
                          )}
                          {(status === "booked" || status === "unavailable" || status === "mine") && s.label}
                        </button>
                      </td>
                      {COURTS.slice(1).map((c) => (
                        <td key={c.id} style={{ padding: "3px 6px" }}>
                          <div style={{ height: 34, borderRadius: 6, border: `1px solid ${STATUS.comingSoon.border}`, background: STATUS.comingSoon.bg, color: STATUS.comingSoon.text, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            Coming soon
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, fontSize: 12 }}>
        {["available", "selected", "mine", "booked", "unavailable"].map((key) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS[key].bg, border: `1px solid ${STATUS[key].border}`, display: "inline-block" }} />
            <span style={{ color: COLORS.muted }}>{STATUS[key].label}</span>
          </div>
        ))}
      </div>

      <div style={{ position: "sticky", bottom: 16, background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: COLORS.muted }}>
          {selected.length} slot{selected.length !== 1 ? "s" : ""} · {selected.length}/3 hrs · ₱{basePrice}
        </div>
        <button
          className="cf-btn"
          disabled={selected.length === 0}
          onClick={handleBookNow}
          style={{ height: 40, padding: "0 18px", borderRadius: 8, background: selected.length ? COLORS.onyx : COLORS.border, color: selected.length ? COLORS.gold : COLORS.muted, fontSize: 13, fontWeight: 500 }}
        >
          Book now
        </button>
      </div>
      <p style={{ fontSize: 11, color: COLORS.muted, fontStyle: "italic", marginTop: 8 }}>
        Prices may vary — this isn't the final amount, it may change based on your payment method.
      </p>
    </div>
  );
}

function AccountView({ loggedIn, myTab, setMyTab, bookings, rescheduleId, setRescheduleId, loadMyBookings, loadAvailability, selectedDate, courtId, onLoginClick }) {
  const [rescheduleDate, setRescheduleDate] = useState(selectedDate);
  const [rescheduleBookedHours, setRescheduleBookedHours] = useState([]);

  useEffect(() => {
    if (!rescheduleId || !courtId) return;
    setRescheduleDate(selectedDate);
  }, [rescheduleId]);

  useEffect(() => {
    if (!rescheduleId || !courtId) return;
    supabase
      .from("booking_slots")
      .select("start_time")
      .eq("court_id", courtId)
      .eq("slot_date", rescheduleDate)
      .eq("status", "booked")
      .then(({ data, error }) => {
        if (error) {
          console.error(error.message);
          return;
        }
        setRescheduleBookedHours(data.map((r) => parseInt(r.start_time.slice(0, 2), 10)));
      });
  }, [rescheduleId, rescheduleDate, courtId]);

  async function cancelBooking(id) {
    const { error } = await supabase.from("booking_slots").update({ status: "cancelled" }).eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadMyBookings();
    await loadAvailability(selectedDate);
  }

  async function rescheduleBooking(id, newStart, newEnd) {
    const { error } = await supabase.from("booking_slots").update({ start_time: newStart, end_time: newEnd, slot_date: rescheduleDate }).eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadMyBookings();
    await loadAvailability(selectedDate);
    setRescheduleId(null);
  }

  if (!loggedIn) {
    return (
      <div style={{ padding: "80px 32px", maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
        <p style={{ fontSize: 16, color: COLORS.onyx, marginBottom: 12 }}>Log in to view your account</p>
        <p style={{ fontSize: 13, color: COLORS.muted, marginBottom: 20 }}>Your bookings, profile, and history live here once you're signed in.</p>
        <button className="cf-btn" onClick={onLoginClick} style={{ height: 42, padding: "0 20px", borderRadius: 8, background: COLORS.onyx, color: COLORS.gold, fontSize: 13 }}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px 32px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: COLORS.onyx, marginBottom: 20 }}>My account</h1>

      <h3 style={{ fontSize: 18, color: COLORS.onyx, marginBottom: 16 }}>My bookings</h3>
      <div style={{ display: "flex", gap: 20, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 16 }}>
        <div className={`cf-tab ${myTab === "upcoming" ? "active" : ""}`} onClick={() => setMyTab("upcoming")}>Upcoming</div>
        <div className={`cf-tab ${myTab === "past" ? "active" : ""}`} onClick={() => setMyTab("past")}>Past</div>
      </div>

      {myTab === "upcoming" &&
        (bookings.length === 0 ? (
          <p style={{ fontSize: 13, color: COLORS.muted }}>No upcoming bookings.</p>
        ) : (
          bookings.map((b) => {
            const locked = b.hoursUntil < 12;
            return (
              <div key={b.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff" }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: COLORS.onyx, margin: "0 0 4px" }}>{b.dateLabel} · {b.timeLabel}</p>
                  <p style={{ fontSize: 12, color: COLORS.muted, margin: 0 }}>₱{b.price} · Paid</p>
                </div>
                {locked ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.warnBg, borderRadius: 6, padding: "4px 10px" }}>
                    <Lock size={13} color={COLORS.warn} />
                    <span style={{ fontSize: 11, color: COLORS.warn }}>Locked — under 12h notice</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="cf-btn" onClick={() => cancelBooking(b.id)} style={{ height: 32, padding: "0 14px", borderRadius: 6, border: `1px solid ${COLORS.border}`, background: "transparent", fontSize: 13, color: COLORS.onyx }}>
                      Cancel
                    </button>
                    <button className="cf-btn" onClick={() => setRescheduleId(b.id)} style={{ height: 32, padding: "0 14px", borderRadius: 6, background: COLORS.pine, color: "#EFF3EC", fontSize: 13 }}>
                      Reschedule
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ))}

      {myTab === "past" && <p style={{ fontSize: 13, color: COLORS.muted }}>No past bookings yet.</p>}

      <p style={{ fontSize: 12, color: COLORS.muted, marginTop: 12 }}>
        Reschedules and cancellations are not refunded, and need at least 12 hours' notice.
      </p>

      {rescheduleId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(18,16,13,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ width: 360, maxHeight: "80vh", overflowY: "auto", background: COLORS.ivory, borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 15, fontWeight: 500, color: COLORS.onyx, marginBottom: 12 }}>Choose a new time</p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <button className="cf-btn" onClick={() => setRescheduleDate(addDays(rescheduleDate, -1))} style={{ background: "none", padding: 4 }} aria-label="Previous day">
                <ChevronLeft size={16} color={COLORS.onyx} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.onyx }}>{formatDateLabel(rescheduleDate)}</span>
              <button className="cf-btn" onClick={() => setRescheduleDate(addDays(rescheduleDate, 1))} style={{ background: "none", padding: 4 }} aria-label="Next day">
                <ChevronRight size={16} color={COLORS.onyx} />
              </button>
            </div>

            {ALL_SLOTS.map((slot) => {
              const isBooked = rescheduleBookedHours.includes(slot.hour);
              const isPast = rescheduleDate === todayStr() && slot.hour <= new Date().getHours();
              const disabled = isBooked || isPast;
              return (
                <div
                  key={slot.id}
                  className="cf-slot-row"
                  style={disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}}
                  onClick={() => {
                    if (disabled) return;
                    rescheduleBooking(
                      rescheduleId,
                      `${String(slot.hour).padStart(2, "0")}:00:00`,
                      `${String(slot.hour + 1).padStart(2, "0")}:00:00`
                    );
                  }}
                >
                  <span style={{ fontSize: 14 }}>{slot.label}</span>
                  <span style={{ fontSize: 12, color: COLORS.muted }}>{disabled ? "Unavailable" : "Available"}</span>
                </div>
              );
            })}

            <button className="cf-btn" onClick={() => setRescheduleId(null)} style={{ marginTop: 8, background: "none", fontSize: 13, color: COLORS.muted }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminView({
  adminTab, setAdminTab, bookings, closures, setClosures,
  newClosureOpen, setNewClosureOpen, newClosureReason, setNewClosureReason,
  newClosureWhen, setNewClosureWhen,
}) {
  function addClosure() {
    if (!newClosureReason || !newClosureWhen) return;
    setClosures((prev) => [
      { id: `c-${Date.now()}`, type: "Single date", when: newClosureWhen, reason: newClosureReason },
      ...prev,
    ]);
    setNewClosureReason("");
    setNewClosureWhen("");
    setNewClosureOpen(false);
  }

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "bookings", label: "Bookings", icon: ListChecks },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div style={{ display: "flex" }}>
      <div style={{ width: 200, borderRight: `1px solid ${COLORS.border}`, minHeight: "calc(100vh - 65px)", padding: "24px 12px" }}>
        {tabs.map((t) => (
          <div
            key={t.id}
            onClick={() => setAdminTab(t.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, cursor: "pointer", marginBottom: 4, background: adminTab === t.id ? COLORS.pineLight : "transparent", color: adminTab === t.id ? COLORS.pine : COLORS.muted, fontSize: 14 }}
          >
            <t.icon size={16} />
            {t.label}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, padding: "32px 36px" }}>
        {adminTab === "dashboard" && (
          <div>
            <h2 style={{ fontSize: 20, color: COLORS.onyx, marginBottom: 20 }}>Dashboard</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Today's bookings", value: "3" },
                { label: "This week", value: "17" },
                { label: "Occupancy", value: "42%" },
                { label: "Today's revenue", value: "₱900", gold: true },
              ].map((m) => (
                <div key={m.label} style={{ background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
                  <p style={{ fontSize: 12, color: COLORS.muted, margin: "0 0 6px" }}>{m.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 500, margin: 0, color: m.gold ? COLORS.goldDark : COLORS.onyx }}>{m.value}</p>
                </div>
              ))}
            </div>
            <button className="cf-btn" style={{ height: 40, padding: "0 16px", borderRadius: 8, background: COLORS.pine, color: "#EFF3EC", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> Add walk-in booking
            </button>
          </div>
        )}

        {adminTab === "bookings" && (
          <div>
            <h2 style={{ fontSize: 20, color: COLORS.onyx, marginBottom: 20 }}>Bookings</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: COLORS.muted, borderBottom: `1px solid ${COLORS.border}` }}>
                  <th style={{ padding: "8px 0" }}>Date / time</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: "10px 0" }}>{b.dateLabel} · {b.timeLabel}</td>
                    <td>₱{b.price}</td>
                    <td>
                      <span style={{ background: COLORS.successBg, color: COLORS.success, fontSize: 11, padding: "2px 8px", borderRadius: 6 }}>Paid</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {adminTab === "settings" && (
          <div>
            <h2 style={{ fontSize: 20, color: COLORS.onyx, marginBottom: 20 }}>Availability and closures</h2>
            <div style={{ background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <p className="cf-label">Operating hours</p>
              <p style={{ fontSize: 14, color: COLORS.onyx }}>6:00 AM – 11:00 PM daily (editable)</p>
            </div>

            {closures.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 8, background: "#fff" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: COLORS.onyx, margin: "0 0 2px" }}>{c.when} · {c.type}</p>
                  <p style={{ fontSize: 12, color: COLORS.muted, margin: 0 }}>{c.reason}</p>
                </div>
                <button className="cf-btn" onClick={() => setClosures((prev) => prev.filter((x) => x.id !== c.id))} style={{ background: "none" }} aria-label="Remove closure">
                  <Trash2 size={15} color={COLORS.muted} />
                </button>
              </div>
            ))}

            {newClosureOpen ? (
              <div style={{ background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16, marginTop: 8 }}>
                <label className="cf-label">Date or range</label>
                <input className="cf-input" style={{ marginBottom: 12 }} value={newClosureWhen} onChange={(e) => setNewClosureWhen(e.target.value)} placeholder="Jul 20, 2026" />
                <label className="cf-label">Reason (shown to customers)</label>
                <input className="cf-input" style={{ marginBottom: 12 }} value={newClosureReason} onChange={(e) => setNewClosureReason(e.target.value)} placeholder="Closed for maintenance" />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="cf-btn" onClick={addClosure} style={{ height: 36, padding: "0 14px", borderRadius: 8, background: COLORS.onyx, color: COLORS.gold, fontSize: 13 }}>
                    Add closure
                  </button>
                  <button className="cf-btn" onClick={() => setNewClosureOpen(false)} style={{ height: 36, padding: "0 14px", borderRadius: 8, background: "none", fontSize: 13, color: COLORS.muted }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="cf-btn" onClick={() => setNewClosureOpen(true)} style={{ marginTop: 8, height: 38, padding: "0 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "transparent", fontSize: 13, color: COLORS.onyx, display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} /> Add closure
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}