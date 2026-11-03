// Supabase Edge Function: cron-scheduler
// Can be triggered by Supabase Cron / pg_cron via pg_net or webhook
// Deploy via: supabase functions deploy cron-scheduler

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // 1. Process pending schedules
    const { data: dueJobs } = await supabase
      .from("notification_schedules")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .limit(50);

    let processed = 0;
    for (const job of dueJobs || []) {
      // Mark as processing
      await supabase
        .from("notification_schedules")
        .update({ status: "completed", processed_at: now })
        .eq("id", job.id);
      processed++;
    }

    return new Response(
      JSON.stringify({ success: true, processedSchedules: processed, timestamp: now }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
