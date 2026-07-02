import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYMONGO_KEY = Deno.env.get("PAYMONGO_SECRET_KEY");
const AUTH = "Basic " + btoa(`${PAYMONGO_KEY}:`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { amount, paymentMethodType, returnUrl } = await req.json();

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

  return new Response(JSON.stringify({ intentId, nextAction }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});