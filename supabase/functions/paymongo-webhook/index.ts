import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYMONGO_KEY = Deno.env.get("PAYMONGO_SECRET_KEY");
const AUTH = "Basic " + btoa(`${PAYMONGO_KEY}:`);
const WEBHOOK_SECRET = Deno.env.get("PAYMONGO_WEBHOOK_SECRET");

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

async function verifySignature(rawBody, sigHeader) {
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
  const timestamp = parts["t"];
  const signature = parts["te"] || parts["li"];
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const computed = Array.from(new Uint8Array(sigBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed === signature;
}

async function finalize(intentId) {
  const { data: pending } = await supabaseAdmin.from("pending_payments").select("*").eq("intent_id", intentId).single();
  if (!pending || pending.status === "completed") return;

  const res = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}`, { headers: { Authorization: AUTH } });
  const data = await res.json();
  if (data.data?.attributes?.status !== "succeeded") return;

  const { data: bookingRow, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .insert({ user_id: pending.user_id, total_amount: pending.total_amount, payment_method: pending.payment_method, payment_status: "paid" })
    .select()
    .single();
  if (bookingErr) return;

  const slotRows = pending.slots.map((s) => ({
    booking_id: bookingRow.id,
    court_id: pending.court_id,
    slot_date: pending.slot_date,
    start_time: `${String(s.hour).padStart(2, "0")}:00:00`,
    end_time: `${String(s.hour + 1).padStart(2, "0")}:00:00`,
    price: 300,
    status: "booked",
  }));
  await supabaseAdmin.from("booking_slots").insert(slotRows);

  if (pending.guest_phone && pending.user_id) {
    await supabaseAdmin.from("users").update({ phone: pending.guest_phone }).eq("id", pending.user_id);
  }
  await supabaseAdmin.from("pending_payments").update({ status: "completed" }).eq("intent_id", intentId);
}

serve(async (req) => {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("Paymongo-Signature") || "";
  const valid = await verifySignature(rawBody, sigHeader);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const event = JSON.parse(rawBody);
  const eventType = event.data?.attributes?.type;
  const intentId = event.data?.attributes?.data?.id;

  if (eventType === "payment_intent.succeeded" || eventType === "payment.paid") {
    await finalize(intentId);
  }
  return new Response("ok", { status: 200 });
});