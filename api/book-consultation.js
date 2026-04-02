module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
  if (!DISCORD_WEBHOOK_URL) {
    console.error('DISCORD_WEBHOOK_URL not configured');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const { name, email, discord, idea, time_slot } = req.body || {};

  if (!name || !email || !idea || !time_slot) {
    return res.status(400).json({ error: 'Missing required fields: name, email, idea, time_slot' });
  }

  const discordMessage = {
    content: [
      '🍌 **New Consultation Booked!**',
      '',
      `**Name:** ${name}`,
      `**Email:** ${email}`,
      `**Discord:** ${discord || 'Not provided'}`,
      `**Time:** ${time_slot}`,
      `**Idea:** ${idea}`,
    ].join('\n'),
  };

  try {
    const webhookRes = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordMessage),
    });

    if (!webhookRes.ok) {
      const err = await webhookRes.text();
      console.error('Discord webhook failed:', err);
      return res.status(500).json({ error: 'Failed to send notification' });
    }

    return res.status(200).json({ success: true, message: 'Booked!' });
  } catch (err) {
    console.error('Booking error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
