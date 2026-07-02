import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { email, name, dateLabel, times, total } = await req.json();

  const html = `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
    <div style="background: #12100D; border-radius: 12px; padding: 32px 24px; text-align: center;">
      <div style="color: #B8924A; font-family: Georgia, serif; font-size: 22px; margin-bottom: 8px;">CourtFlow</div>
      <div style="color: #ffffff; font-size: 16px;">Your booking is confirmed!</div>
    </div>
    <div style="padding: 24px 8px;">
      <p style="font-size: 15px; color: #3A362E;">Hi ${name},</p>
      <p style="font-size: 14px; color: #3A362E;">Great news! Your court booking has been confirmed. Here are your booking details:</p>
      <div style="border: 1px solid #E1DACB; border-radius: 10px; padding: 20px; margin-top: 16px;">
        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; color: #8A8578; text-transform: uppercase;">Venue</div>
          <div style="font-size: 15px; font-weight: bold; color: #12100D;">CourtFlow — Court 1</div>
          <div style="font-size: 13px; color: #8A8578;">Davao City</div>
        </div>
        <div style="border-top: 1px solid #E1DACB; margin: 12px 0;"></div>
        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; color: #8A8578; text-transform: uppercase;">Date</div>
          <div style="font-size: 15px; font-weight: bold; color: #12100D;">${dateLabel}</div>
        </div>
        <div style="border-top: 1px solid #E1DACB; margin: 12px 0;"></div>
        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; color: #8A8578; text-transform: uppercase;">Time</div>
          <div style="font-size: 15px; font-weight: bold; color: #12100D;">${times}</div>
        </div>
        <div style="border-top: 1px solid #E1DACB; margin: 12px 0;"></div>
        <div>
          <div style="font-size: 11px; color: #8A8578; text-transform: uppercase;">Total amount</div>
          <div style="font-size: 20px; font-weight: bold; color: #93551C;">₱${total}</div>
        </div>
      </div>
      <p style="font-size: 12px; color: #8A8578; margin-top: 20px;">This booking is non-refundable. Reschedules are allowed up to 12 hours before your scheduled time.</p>
    </div>
  </div>`;

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: {
        username: Deno.env.get("GMAIL_USER"),
        password: Deno.env.get("GMAIL_APP_PASSWORD"),
      },
    },
  });

  await client.send({
    from: Deno.env.get("GMAIL_USER"),
    to: email,
    subject: "Your CourtFlow booking is confirmed",
    content: "auto",
    html,
  });

  await client.close();

  return new Response(JSON.stringify({ sent: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});