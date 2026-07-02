import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { email, name, type, dateLabel, times, newDateLabel, newTimes } = await req.json();

  const isCancel = type === "cancelled";
  const subject = isCancel ? "Your CourtFlow booking was cancelled" : "Your CourtFlow booking was rescheduled";
  const bodyHtml = isCancel
    ? `<p style="font-size:14px;color:#3A362E;">Hi ${name || "there"}, your booking on <strong>${dateLabel} &middot; ${times}</strong> has been cancelled.</p>`
    : `<p style="font-size:14px;color:#3A362E;">Hi ${name || "there"}, your booking has been moved.</p>
       <p style="font-size:13px;color:#8A8578;">Previously: ${dateLabel} &middot; ${times}</p>
       <p style="font-size:15px;font-weight:bold;color:#12100D;">New time: ${newDateLabel} &middot; ${newTimes}</p>`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
    <div style="background:#12100D;border-radius:12px;padding:24px;text-align:center;">
      <div style="color:#B8924A;font-family:Georgia,serif;font-size:20px;">CourtFlow</div>
    </div>
    <div style="padding:20px 8px;">${bodyHtml}</div>
  </div>`;

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: Deno.env.get("GMAIL_USER"), password: Deno.env.get("GMAIL_APP_PASSWORD") },
    },
  });
  await client.send({ from: Deno.env.get("GMAIL_USER"), to: email, subject, content: "auto", html });
  await client.close();

  return new Response(JSON.stringify({ sent: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});