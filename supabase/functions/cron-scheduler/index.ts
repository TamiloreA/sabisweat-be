// @ts-nocheck
// Supabase Edge Function: cron-scheduler
// Can be triggered by Supabase Cron / pg_cron via pg_net or webhook
// Deploy via: supabase functions deploy cron-scheduler

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const backendUrl = Deno.env.get("BACKEND_URL") || "https://sabisweat-be.onrender.com";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // 1. Trigger the main backend cron worker (which processes schedules and Expo receipts)
    let backendCronResult: any = null;
    try {
      const beRes = await fetch(`${backendUrl}/api/v1/notifications/cron/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      backendCronResult = await beRes.json().catch(() => null);
    } catch (e: any) {
      console.warn("[cron-scheduler] Could not reach backend cron, processing locally:", e?.message);
    }

    // 2. Fallback: check due schedules directly in Supabase
    const { data: dueJobs } = await supabase
      .from("notification_schedules")
      .select("id")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .limit(50);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: now,
        duePendingCount: (dueJobs || []).length,
        backendCronResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
