// Supabase Edge Function: notifications-dispatcher
// Deploy via: supabase functions deploy notifications-dispatcher

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
    const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { userId, title, body: msgBody, type, data, channel = "all" } = body;

    if (!userId || !title || !msgBody) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: userId, title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create in-app notification
    const { data: notification, error: notifError } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        type: type || "SYSTEM_NOTIFICATION",
        title,
        body: msgBody,
        description: msgBody,
        data: data || {},
      })
      .select()
      .single();

    if (notifError) {
      console.error("Error creating in-app record:", notifError);
    }

    // 2. Compute authoritative unread count
    const { data: countData } = await supabase.rpc("get_unread_notification_count", {
      p_user_id: userId,
    });
    const unreadCount = typeof countData === "number" ? countData : 1;

    // 3. Dispatch push if allowed
    let ticketsCount = 0;
    if (channel === "all" || channel === "push") {
      const { data: devices } = await supabase
        .from("user_devices")
        .select("expo_push_token")
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("notifications_enabled", true);

      if (devices && devices.length > 0) {
        const messages = devices.map((d: any) => ({
          to: d.expo_push_token,
          title,
          body: msgBody,
          badge: unreadCount,
          sound: "default",
          priority: "high",
          data: {
            ...data,
            notificationId: notification?.id,
            type,
          },
        }));

        const pushHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        if (expoAccessToken) {
          pushHeaders["Authorization"] = `Bearer ${expoAccessToken}`;
        }

        const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: pushHeaders,
          body: JSON.stringify(messages),
        });

        const expoJson = await expoRes.json();
        ticketsCount = (expoJson.data || []).length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notificationId: notification?.id,
        unreadCount,
        ticketsCount,
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
