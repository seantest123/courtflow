import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYMONGO_KEY = Deno.env.get("PAYMONGO_SECRET_KEY");
const AUTH = "Basic " + btoa(`${PAYMONGO_KEY}:`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { intentId } = await req.json();

  const res = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  const status = data.data?.attributes?.status;

  return new Response(JSON.stringify({ status }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});