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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json();
  const { amount, paymentMethodType, returnUrl, userId, courtId, slotDate, slots, paymentMethod, guestPhone } = body;

  const intentRes = await fetch("https://api.paymongo.com/v1/payment_intents", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: Math.round(amount * 100),
          currency: "PHP",
          payment_method_allowed: [paymentMethodType],
          payment_method_options: { card: { request_three_d_secure: "automatic" } },
          capture_type: "automatic",
        },
      },
    }),
  });
  const intent = await intentRes.json();
  const intentId = intent.data.id;

  const methodRes = await fetch("https://api.paymongo.com/v1/payment_methods", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { attributes: { type: paymentMethodType } } }),
  });
  const method = await methodRes.json();
  const methodId = method.data.id;

  const attachRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}/attach`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { attributes: { payment_method: methodId, return_url: returnUrl } },
    }),
  });
  const attached = await attachRes.json();
  const nextAction = attached.data?.attributes?.next_action || null;

  await supabaseAdmin.from("pending_payments").insert({
    intent_id: intentId,
    user_id: userId,
    court_id: courtId,
    slot_date: slotDate,
    slots,
    total_amount: amount,
    payment_method: paymentMethod,
    guest_phone: guestPhone,
    status: "pending",
  });

  return new Response(JSON.stringify({ intentId, nextAction }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});