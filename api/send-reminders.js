const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM || '+13637770337';
const CRON_SECRET = process.env.CRON_SECRET || 'bossclawd-cron';

async function getUpcomingBookings() {
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const windowStart = new Date(now.getTime() + 50 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 70 * 60 * 1000);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?reminded=eq.false&select=*`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });
  const bookings = await res.json();

  // Filter bookings where session_timestamp is within 50-70 min from now
  return (bookings || []).filter(b => {
    if (!b.session_timestamp) return false;
    const t = new Date(b.session_timestamp);
    return t >= windowStart && t <= windowEnd;
  });
}

async function markReminded(id) {
  await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reminded: true })
  });
}

async function sendReminderEmail(booking) {
  if (!RESEND_API_KEY) return;
  const isPT = booking.language === 'portuguese';
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Boss AI <hello@bossclawd.com>',
      to: [booking.email],
      subject: isPT ? `⏰ Sua sessão começa em 1 hora!` : `⏰ Your session starts in 1 hour!`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;padding:40px;border-radius:12px;">
        <h1 style="color:#4ade80;">${isPT ? '⏰ Daqui a 1 hora!' : '⏰ 1 hour to go!'}</h1>
        <p>${isPT ? `Sua sessão com o Boss AI começa em 1 hora — ${booking.time_slot}` : `Your Boss AI session starts in 1 hour — ${booking.time_slot}`}</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${booking.invite_link}" style="background:#4ade80;color:#000;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">${isPT ? 'Entrar agora →' : 'Join now →'}</a>
        </div>
        <p style="color:#666;font-size:14px;">BossCLAWD · bossclawd.com</p>
      </div>`
    })
  });
}

async function sendReminderSMS(booking) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !booking.phone) return;
  const isPT = booking.language === 'portuguese';
  const msg = isPT
    ? `Olá ${booking.name.split(' ')[0]}! Sua sessão com o Boss AI começa em 1 hora. Acesse: ${booking.invite_link}`
    : `Hey ${booking.name.split(' ')[0]}! Your Boss AI session starts in 1 hour. Join: ${booking.invite_link}`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: TWILIO_FROM, To: booking.phone, Body: msg })
  });
}

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const bookings = await getUpcomingBookings();
    const results = [];
    for (const booking of bookings) {
      await sendReminderEmail(booking);
      await sendReminderSMS(booking);
      await markReminded(booking.id);
      results.push({ id: booking.id, name: booking.name });
    }
    return res.status(200).json({ sent: results.length, bookings: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
