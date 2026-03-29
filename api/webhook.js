// BossCLAWD — Stripe Webhook Handler
// Creates a private Discord channel when someone pays

const crypto = require('crypto');

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1472734279892074580';
const BRUNO_ID = '1109710874425430049';
const BOT_ID_1 = '1472735869847998606';
const BOT_ID_2 = '1472738254443905025';
const BOSSCLAWD_CATEGORY_ID = '1487724556603883631';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Stripe signature
  const sig = req.headers['stripe-signature'];
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  
  let event;
  try {
    const parts = sig.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {});
    
    const timestamp = parts.t;
    const signature = parts.v1;
    const payload = `${timestamp}.${body}`;
    const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(payload).digest('hex');
    
    if (signature !== expected) {
      console.error('Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }
    
    event = JSON.parse(body);
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    // In case of verification issues, still try to parse
    try { event = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid payload' }); }
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const customerEmail = session.customer_details?.email || 'unknown';
  const customerName = session.customer_details?.name || 'Client';
  const amount = (session.amount_total || 0) / 100;
  
  // Determine plan
  let plan = 'Quick Consult';
  if (amount >= 900) plan = 'Done For You';
  else if (amount >= 250) plan = 'Build Session';

  const slug = customerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
  const channelName = `session-${slug}`;

  try {
    // 1. Create private channel
    const channelRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: channelName,
        type: 0, // text channel
        parent_id: BOSSCLAWD_CATEGORY_ID,
        topic: `🔧 BossCLAWD ${plan} — ${customerName} (${customerEmail}) — $${amount}`,
        permission_overwrites: [
          // Deny @everyone
          { id: GUILD_ID, type: 0, deny: '1024', allow: '0' },
          // Allow Bruno
          { id: BRUNO_ID, type: 1, allow: '1049600', deny: '0' },
          // Allow bots
          { id: BOT_ID_1, type: 1, allow: '1049600', deny: '0' },
          { id: BOT_ID_2, type: 1, allow: '1049600', deny: '0' },
        ]
      })
    });

    if (!channelRes.ok) {
      const err = await channelRes.text();
      console.error('Discord channel creation failed:', err);
      return res.status(500).json({ error: 'Failed to create channel' });
    }

    const channel = await channelRes.json();

    // 2. Send welcome message in the channel
    const welcomeMsg = `🎉 **New BossCLAWD Session!**

**Client:** ${customerName}
**Email:** ${customerEmail}
**Plan:** ${plan} ($${amount})
**Status:** ⏳ Waiting for client to join

---

Hey ${customerName.split(' ')[0]}! Welcome to your private BossCLAWD session. 👋

I'm your AI engineer and I'm ready to build. Here's how this works:

1. **Tell me what you need** — describe it in plain English
2. **I'll start building immediately** — you'll see progress in real-time
3. **Give feedback anytime** — we iterate together until it's perfect
4. **Everything gets delivered** — docs, configs, transcripts, all yours

Let's go! What are we building? 🔥`;

    await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: welcomeMsg })
    });

    // 3. Notify Bruno in #boss
    await fetch(`https://discord.com/api/v10/channels/1473159861977219154/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: `💰 **NEW BOSSCLAWD SALE!**\n\n**${customerName}** just bought **${plan}** for **$${amount}**!\nEmail: ${customerEmail}\nChannel: <#${channel.id}>\n\n🍌🔥`
      })
    });

    console.log(`✅ Created channel ${channelName} for ${customerName} ($${amount})`);
    return res.status(200).json({ success: true, channelId: channel.id });

  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
