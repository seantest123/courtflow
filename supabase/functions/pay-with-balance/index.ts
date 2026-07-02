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

  const { courtId, slotDate, slots, amount } = await req.json();

  const { data: userRow, error: userErr } = await supabaseAdmin.from("users").select("balance").eq("id", user.id).single();
  if (userErr || !userRow) {
    return new Response(JSON.stringify({ error: "Could not load account" }), { status: 500, headers: corsHeaders });
  }
  if (Number(userRow.balance) < amount) {
    return new Response(JSON.stringify({ error: "Insufficient balance" }), { status: 400, headers: corsHeaders });
  }

  const { data: bookingRow, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .insert({ user_id: user.id, total_amount: amount, payment_method: "balance", payment_status: "paid" })
    .select()
    .single();
  if (bookingErr) {
    return new Response(JSON.stringify({ error: bookingErr.message }), { status: 500, headers: corsHeaders });
  }

  const slotRows = slots.map((s) => ({
    booking_id: bookingRow.id,
    court_id: courtId,
    slot_date: slotDate,
    start_time: `${String(s.hour).padStart(2, "0")}:00:00`,
    end_time: `${String(s.hour + 1).padStart(2, "0")}:00:00`,
    price: 300,
    status: "booked",
  }));
  const { error: slotsErr } = await supabaseAdmin.from("booking_slots").insert(slotRows);
  if (slotsErr) {
    return new Response(JSON.stringify({ error: slotsErr.message }), { status: 500, headers: corsHeaders });
  }

  const newBalance = Number(userRow.balance) - amount;
  await supabaseAdmin.from("users").update({ balance: newBalance }).eq("id", user.id);

  return new Response(JSON.stringify({ success: true, bookingId: bookingRow.id, newBalance }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});