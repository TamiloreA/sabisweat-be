/**
 * Resend Email Service
 * Handles product notification emails through the Resend REST API.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  category?: string;
  idempotencyKey?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Sends an email using the Resend API
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    console.warn('[resendEmailService] RESEND_API_KEY not set. Email delivery simulated.');
    return {
      success: true,
      id: `sim_${Date.now()}`,
    };
  }

  const fromEmail =
    options.from ||
    process.env.RESEND_FROM_EMAIL ||
    'SabiSweat <onboarding@resend.dev>';

  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  const bodyPayload: Record<string, any> = {
    from: fromEmail,
    to: recipients,
    subject: options.subject,
    html: options.html,
  };

  if (options.text) {
    bodyPayload.text = options.text;
  }
  if (options.replyTo) {
    bodyPayload.reply_to = options.replyTo;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey.trim()}`,
  };

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload),
    });

    const data = (await response.json().catch(() => ({}))) as any;

    if (!response.ok) {
      console.error(`[resendEmailService] Resend API error (${response.status}):`, data);
      return {
        success: false,
        error: data?.message || `HTTP ${response.status}`,
        statusCode: response.status,
      };
    }

    return {
      success: true,
      id: data?.id,
    };
  } catch (err: any) {
    console.error('[resendEmailService] Network error sending email:', err);
    return {
      success: false,
      error: err?.message || 'Network error sending email',
    };
  }
}

/**
 * Email Templates for Product Notifications
 */
export const emailTemplates = {
  weeklyActivitySummary(data: {
    userName: string;
    totalSteps: number;
    totalDistanceKm: number;
    daysGoalAchieved: number;
    weekRange: string;
  }): { subject: string; html: string; text: string } {
    const subject = `Your SabiSweat Weekly Summary: ${data.totalSteps.toLocaleString()} steps! 🏃‍♂️`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9fa; color: #1a1a1a; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; }
    .header { background: #00D06C; padding: 32px 24px; text-align: center; color: #ffffff; }
    .content { padding: 32px 24px; }
    .stat-box { display: flex; background: #f3f4f6; border-radius: 12px; padding: 16px; margin: 16px 0; justify-content: space-around; text-align: center; }
    .stat { flex: 1; }
    .stat-val { font-size: 22px; font-weight: bold; color: #00D06C; }
    .stat-lbl { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-top: 4px; }
    .footer { text-align: center; padding: 24px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0; font-size: 24px;">Weekly Sabi Activity</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">${data.weekRange}</p>
    </div>
    <div class="content">
      <p>Hi ${data.userName || 'Sabi Mover'},</p>
      <p>Here is your weekly sweat report. You made incredible progress staying active this week!</p>
      <div class="stat-box">
        <div class="stat">
          <div class="stat-val">${data.totalSteps.toLocaleString()}</div>
          <div class="stat-lbl">Total Steps</div>
        </div>
        <div class="stat">
          <div class="stat-val">${data.totalDistanceKm.toFixed(1)} km</div>
          <div class="stat-lbl">Distance</div>
        </div>
        <div class="stat">
          <div class="stat-val">${data.daysGoalAchieved}/7</div>
          <div class="stat-lbl">Goals Hit</div>
        </div>
      </div>
      <p>Keep moving and building that consistency. Open your SabiSweat app to see your community rank and badges.</p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} SabiSweat. Keep stepping, keep winning.</p>
      <p>You received this email because you opted in to Weekly Activity Summaries. Manage preferences in your mobile app settings.</p>
    </div>
  </div>
</body>
</html>`;

    const text = `Hi ${data.userName || 'Sabi Mover'},\n\nHere is your SabiSweat weekly summary for ${data.weekRange}:\n\n- Total Steps: ${data.totalSteps.toLocaleString()}\n- Distance: ${data.totalDistanceKm.toFixed(1)} km\n- Goals Achieved: ${data.daysGoalAchieved}/7 days\n\nKeep stepping!`;

    return { subject, html, text };
  },

  coinsRewardUpdate(data: {
    userName: string;
    coinsEarned: number;
    totalBalance: number;
    reason: string;
  }): { subject: string; html: string; text: string } {
    const subject = `You earned ${data.coinsEarned} Sabi Coins! 🪙`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9fa; color: #1a1a1a; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; }
    .header { background: #FFB800; padding: 32px 24px; text-align: center; color: #ffffff; }
    .content { padding: 32px 24px; }
    .reward-box { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; }
    .reward-coins { font-size: 32px; font-weight: bold; color: #d97706; }
    .footer { text-align: center; padding: 24px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0; font-size: 24px;">Coins Reward Update 🪙</h1>
    </div>
    <div class="content">
      <p>Hi ${data.userName || 'Sabi Mover'},</p>
      <p>Great news! You just earned Sabi Coins:</p>
      <div class="reward-box">
        <div class="reward-coins">+${data.coinsEarned} Coins</div>
        <p style="margin: 8px 0 0 0; color: #92400e; font-size: 14px;">${data.reason}</p>
      </div>
      <p>Your current wallet balance is <strong>${data.totalBalance.toLocaleString()} Coins</strong>.</p>
      <p>Check the Rewards tab in the SabiSweat app to redeem your coins for merchandise and vouchers.</p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} SabiSweat. Keep stepping, keep winning.</p>
    </div>
  </div>
</body>
</html>`;

    const text = `Hi ${data.userName || 'Sabi Mover'},\n\nYou just earned +${data.coinsEarned} Sabi Coins for: ${data.reason}.\nYour new balance is ${data.totalBalance.toLocaleString()} Coins.\n\nOpen SabiSweat to redeem rewards!`;

    return { subject, html, text };
  },
};
