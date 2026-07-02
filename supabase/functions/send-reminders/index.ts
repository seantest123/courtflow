import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

async function sendMail(to, subject, html) {
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: Deno.env.get("GMAIL_USER"), password: Deno.env.get("GMAIL_APP_PASSWORD") },
    },
  });
  await client.send({ from: Deno.env.get("GMAIL_USER"), to, subject, content: "auto", html });
  await client.close();
}

serve(async (req) => {
  const { data, error } = await supabaseAdmin.rpc("get_upcoming_reminders");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  for (const row of data) {
    const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
      <div style="background:#12100D;border-radius:12px;padding:24px;text-align:center;">
        <div style="color:#B8924A;font-family:Georgia,serif;font-size:20px;">CourtFlow</div>
      </div>
      <div style="padding:16px 8px;">
        <p style="font-size:14px;color:#3A362E;">Hi ${row.name || "there"}, this is a reminder that your court booking starts soon:</p>
        <p style="font-size:15px;font-weight:bold;color:#12100D;">${row.slot_date} &middot; ${row.start_time.slice(0,5)}&ndash;${row.end_time.slice(0,5)}</p>
        <p style="font-size:12px;color:#8A8578;">See you on the court!</p>
      </div>
    </div>`;
    try {
      await sendMail(row.email, "Reminder: your CourtFlow booking is coming up", html);
      await supabaseAdmin.from("booking_slots").update({ reminder_sent: true }).eq("id", row.slot_id);
    } catch (e) {
      console.error(e);
    }
  }

  return new Response(JSON.stringify({ sent: data.length }), { headers: { "Content-Type": "application/json" } });
});