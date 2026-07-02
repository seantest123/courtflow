import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseClient = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: corsHeaders });
  }

  const { slotId } = await req.json();

  const { data: slot, error: slotErr } = await supabaseAdmin
    .from("booking_slots")
    .select("id, status, slot_date, start_time, booking_id, bookings(user_id, total_amount)")
    .eq("id", slotId)
    .single();

  if (slotErr || !slot) {
    return new Response(JSON.stringify({ error: "Booking not found" }), { status: 404, headers: corsHeaders });
  }
  if (slot.bookings.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Not your booking" }), { status: 403, headers: corsHeaders });
  }
  if (slot.status !== "booked") {
    return new Response(JSON.stringify({ error: "This slot is no longer active" }), { status: 400, headers: corsHeaders });
  }

  const slotStart = new Date(`${slot.slot_date}T${slot.start_time}`);
  const hoursUntil = (slotStart.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntil < 12) {
    return new Response(JSON.stringify({ error: "Too close to start time to convert" }), { status: 400, headers: corsHeaders });
  }

  const { count: siblingCount } = await supabaseAdmin
    .from("booking_slots")
    .select("*", { count: "exact", head: true })
    .eq("booking_id", slot.booking_id);

  const creditAmount = Math.round((Number(slot.bookings.total_amount) / (siblingCount || 1)) * 100) / 100;

  const { error: updateSlotErr } = await supabaseAdmin
    .from("booking_slots")
    .update({ status: "converted" })
    .eq("id", slotId);
  if (updateSlotErr) {
    return new Response(JSON.stringify({ error: updateSlotErr.message }), { status: 500, headers: corsHeaders });
  }

  const { data: userRow } = await supabaseAdmin.from("users").select("balance").eq("id", user.id).single();
  const newBalance = Number(userRow.balance) + creditAmount;

  const { error: balanceErr } = await supabaseAdmin.from("users").update({ balance: newBalance }).eq("id", user.id);
  if (balanceErr) {
    return new Response(JSON.stringify({ error: balanceErr.message }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ success: true, creditAmount, newBalance }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});