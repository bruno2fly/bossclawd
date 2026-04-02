const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1472734279892074580';
const DISCORD_CATEGORY_ID = process.env.DISCORD_CATEGORY_ID || '1487724556603883631';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM || '+13637770337';
const BRUNO_PHONE = process.env.BRUNO_PHONE || '+17816062445';

async function createDiscordChannel(name, topic) {
  const res = await fetch(`https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/channels`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, topic, type: 0, parent_id: DISCORD_CATEGORY_ID })
  });
  return res.json();
}

async function createDiscordInvite(channelId) {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/invites`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_age: 604800, max_uses: 5, unique: true })
  });
  const data = await res.json();
  return `https://discord.gg/${data.code}`;
}

async function sendDiscordMessage(channelId, message) {
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message })
  });
}

async function sendWebhookNotification(data, inviteLink) {
  if (!DISCORD_WEBHOOK_URL) return;
  await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `🍌 **New Consultation Booked!**\n\n**Name:** ${data.name}\n**Email:** ${data.email}\n**Discord:** ${data.discord || 'not provided'}\n**Time:** ${data.time_slot}\n**Idea:** ${data.idea}\n\n**Session channel invite:** ${inviteLink}`
    })
  });
}

async function sendConfirmationEmail(data, inviteLink) {
  if (!RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Boss AI <hello@bossclawd.com>',
      to: [data.email],
      subject: `Your AI Strategy Session is confirmed — ${data.time_slot}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 40px; border-radius: 12px;">
          <h1 style="color: #4ade80; margin-bottom: 8px;">🍌 You're confirmed, ${data.name.split(' ')[0]}!</h1>
          <p style="color: #aaa; font-size: 16px;">Your AI Strategy Session with Boss is locked in.</p>
          
          <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 24px; margin: 24px 0;">
            <p style="margin: 0 0 8px; color: #4ade80; font-weight: bold;">📅 Your Session</p>
            <p style="margin: 0; font-size: 18px;">${data.time_slot}</p>
          </div>

          <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 24px; margin: 24px 0;">
            <p style="margin: 0 0 8px; color: #4ade80; font-weight: bold;">💡 What you told us</p>
            <p style="margin: 0; color: #ccc;">${data.idea}</p>
          </div>

          <div style="background: #1a1a1a; border: 1px solid #4ade80; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 16px; font-weight: bold;">Join your private session room on Discord:</p>
            <a href="${inviteLink}" style="background: #4ade80; color: #000; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">Join Session →</a>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 32px;">When you join, just say <strong>"I'm here"</strong> and we'll kick things off. We have 30 minutes to map out exactly what we're building for you.</p>
          
          <p style="color: #444; font-size: 12px; margin-top: 24px;">BossCLAWD · bossclawd.com</p>
        </div>
      `
    })
  });
}

async function sendSMS(to, message) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: TWILIO_FROM, To: to, Body: message })
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, discord, idea, time_slot } = req.body;
  if (!name || !email || !idea || !time_slot) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Create private Discord channel
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 20);
    const dateSlug = new Date().toISOString().slice(5, 10).replace('-', '');
    const channelName = `session-${slug}-${dateSlug}`;
    const channel = await createDiscordChannel(channelName, `🤖 ${name} — ${idea.substring(0, 60)} | ${time_slot}`);
    
    // 2. Generate invite
    const inviteLink = await createDiscordInvite(channel.id);

    // 3. Post welcome message in channel
    await sendDiscordMessage(channel.id, 
      `👋 **Welcome ${name.split(' ')[0]}!**\n\nThis is your private AI Strategy Session with **Boss** and **Bruno**.\n\n📅 **Your session:** ${time_slot}\n💡 **Your idea:** ${idea}\n\nWhen you're ready, just say **"I'm here"** and we'll kick things off. We have 30 minutes to map out exactly what we can build for you. 🍌`
    );

    // 4. Notify Bruno via webhook (with invite link)
    await sendWebhookNotification({ name, email, discord, idea, time_slot }, inviteLink);

    // 5. Send confirmation email to client
    await sendConfirmationEmail({ name, email, idea, time_slot }, inviteLink);

    // 6. SMS to Bruno (alert)
    await sendSMS(BRUNO_PHONE, `🍌 New consultation booked!\n${name} | ${time_slot}\nIdea: ${idea.substring(0, 80)}`);

    return res.status(200).json({ success: true, message: 'Booked!', invite: inviteLink });
  } catch (err) {
    console.error('Booking error:', err);
    return res.status(500).json({ error: 'Booking failed', details: err.message });
  }
}
