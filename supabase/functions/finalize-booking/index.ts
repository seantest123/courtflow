import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYMONGO_KEY = Deno.env.get("PAYMONGO_SECRET_KEY");
const AUTH = "Basic " + btoa(`${PAYMONGO_KEY}:`);

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

async function finalize(intentId) {
  const { data: pending, error: findErr } = await supabaseAdmin
    .from("pending_payments")
    .select("*")
    .eq("intent_id", intentId)
    .single();

  if (findErr || !pending) return { status: "not_found" };
  if (pending.status === "completed") return { status: "completed" };

  const res = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.data?.attributes?.status !== "succeeded") {
    return { status: "not_paid" };
  }

  const { data: bookingRow, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .insert({
      user_id: pending.user_id,
      total_amount: pending.total_amount,
      payment_method: pending.payment_method,
      payment_status: "paid",
    })
    .select()
    .single();

  if (bookingErr) return { status: "error", message: bookingErr.message };

  const slotRows = pending.slots.map((s) => ({
    booking_id: bookingRow.id,
    court_id: pending.court_id,
    slot_date: pending.slot_date,
    start_time: `${String(s.hour).padStart(2, "0")}:00:00`,
    end_time: `${String(s.hour + 1).padStart(2, "0")}:00:00`,
    price: 300,
    status: "booked",
  }));

  const { error: slotsErr } = await supabaseAdmin.from("booking_slots").insert(slotRows);
  if (slotsErr) return { status: "error", message: slotsErr.message };

  if (pending.guest_phone && pending.user_id) {
    await supabaseAdmin.from("users").update({ phone: pending.guest_phone }).eq("id", pending.user_id);
  }

  await supabaseAdmin.from("pending_payments").update({ status: "completed" }).eq("intent_id", intentId);
  return { status: "completed" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { intentId } = await req.json();
  const result = await finalize(intentId);
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});