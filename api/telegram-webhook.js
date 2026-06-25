// Telegram bot webhook receiver.
// POST /api/telegram-webhook — receives updates from Telegram.
// GET  /api/telegram-webhook — returns current bot registration status.
//
// When an owner replies to a lead-alert message, the bot echoes context back
// and optionally queues a CRM action (log → Supabase, email draft, etc.)
//
// Env vars required:
//   TELEGRAM_BOT_TOKEN   — BotFather token
//   TELEGRAM_WEBHOOK_SECRET — secret token passed in X-Telegram-Bot-Api-Secret-Token header
//                            (set when registering the webhook URL with Telegram)
//   TELEGRAM_CHAT_ID     — owner chat/group ID (used as a whitelist)
// Optional:
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — persist incoming commands to supermega_pipeline_actions

const crypto = require('crypto')

function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function text(value) {
  return String(value || '').trim()
}


async function telegramSend(token, chatId, msg, replyToMessageId) {
  const body = { chat_id: chatId, text: msg, parse_mode: 'HTML' }
  if (replyToMessageId) body.reply_to_message_id = replyToMessageId
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  })
  return res.ok
}

async function supabasePersist(supabaseUrl, serviceKey, action) {
  if (!supabaseUrl || !serviceKey) return { status: 'skipped' }
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/supermega_pipeline_actions`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(action),
      signal: AbortSignal.timeout(5000),
    })
    return res.ok ? { status: 'saved' } : { status: 'error', code: res.status }
  } catch (e) {
    return { status: 'error', reason: text(e?.message) }
  }
}

// Parse /commands and natural-language shortcuts from incoming messages
function parseIntent(msgText) {
  const t = text(msgText).toLowerCase()
  if (t.startsWith('/reply')) return { intent: 'draft_reply', args: msgText.slice(6).trim() }
  if (t.startsWith('/done')) return { intent: 'mark_done', args: msgText.slice(5).trim() }
  if (t.startsWith('/snooze')) return { intent: 'snooze', args: msgText.slice(7).trim() }
  if (t.startsWith('/status')) return { intent: 'status_check', args: '' }
  if (t.startsWith('/help')) return { intent: 'help', args: '' }
  // Natural language catch-all — queue for AI processing
  return { intent: 'freeform', args: text(msgText) }
}

function helpText() {
  return [
    '<b>SUPERMEGA bot commands</b>',
    '',
    '/reply &lt;message&gt; — draft an email reply to the last lead',
    '/done &lt;lead_id&gt; — mark a lead as handled',
    '/snooze &lt;lead_id&gt; — snooze a lead for 24 h',
    '/status — show today\'s open leads',
    '/help — this message',
    '',
    'Or just type a message and it\'ll be queued for the AI to process.',
  ].join('\n')
}

module.exports = async function handler(req, res) {
  const token = text(process.env.TELEGRAM_BOT_TOKEN)
  const webhookSecret = text(process.env.TELEGRAM_WEBHOOK_SECRET)
  const ownerChatId = text(process.env.TELEGRAM_CHAT_ID)
  const supabaseUrl = text(process.env.SUPABASE_URL).replace(/\/$/, '')
  const supabaseKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (!token) {
    json(res, 200, {
      status: 'unconfigured',
      reason: 'TELEGRAM_BOT_TOKEN not configured',
      endpoint: 'telegram-webhook',
      webhook_configured: false,
      owner_chat_configured: Boolean(ownerChatId),
    })
    return
  }

  // GET: return registration status
  if (req.method === 'GET') {
    json(res, 200, {
      status: 'ready',
      endpoint: 'telegram-webhook',
      webhook_configured: Boolean(webhookSecret),
      owner_chat_configured: Boolean(ownerChatId),
      supabase_configured: Boolean(supabaseUrl && supabaseKey),
      register_url: `https://api.telegram.org/bot${token}/setWebhook`,
      notes: 'POST register_url with {"url":"https://supermega.dev/api/telegram-webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}',
    })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { status: 'error', reason: 'method_not_allowed' })
    return
  }

  // Read body
  let rawBody = ''
  if (typeof req.body === 'string') {
    rawBody = req.body
  } else if (req.body && typeof req.body === 'object') {
    rawBody = JSON.stringify(req.body)
  } else {
    await new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => { rawBody = Buffer.concat(chunks).toString('utf8'); resolve() })
      req.on('error', reject)
    })
  }

  // Verify webhook secret — constant-time comparison prevents timing oracle attacks
  if (webhookSecret) {
    const sigHeader = text(req.headers['x-telegram-bot-api-secret-token'])
    const a = Buffer.from(sigHeader)
    const b = Buffer.from(webhookSecret)
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b)
    if (!valid) {
      json(res, 401, { status: 'error', reason: 'invalid_secret' })
      return
    }
  }

  let update
  try {
    update = JSON.parse(rawBody)
  } catch {
    json(res, 400, { status: 'error', reason: 'invalid_json' })
    return
  }

  // Telegram requires 200 quickly — respond now, process async
  json(res, 200, { ok: true })

  // Process the update (fire-and-forget after 200 sent)
  try {
    const message = update.message || update.edited_message || update.channel_post
    if (!message) return

    const chatId = String(message.chat?.id || '')
    const fromId = String(message.from?.id || '')
    const msgText = text(message.text)
    const msgId = message.message_id

    // Whitelist: only respond to the configured owner chat
    if (ownerChatId && chatId !== ownerChatId && fromId !== ownerChatId) return

    const { intent, args } = parseIntent(msgText)

    if (intent === 'help') {
      await telegramSend(token, chatId, helpText(), msgId)
      return
    }

    if (intent === 'status_check') {
      // Quick status — real count needs Supabase; fallback to a pointer
      const reply = supabaseUrl
        ? '⏳ Checking leads...\n\nThis will be powered by Supabase shortly.'
        : '🔧 Supabase not configured yet — check /api/commercial-control for lead status.'
      await telegramSend(token, chatId, reply, msgId)
      return
    }

    // For all other intents, persist to pipeline_actions table for AI processing
    const action = {
      action_type: intent,
      source: 'telegram',
      chat_id: chatId,
      message_id: String(msgId),
      args: args.slice(0, 2000),
      raw_text: msgText.slice(0, 2000),
      created_at: new Date().toISOString(),
      status: 'queued',
    }

    const saved = await supabasePersist(supabaseUrl, supabaseKey, action)

    const ack = saved.status === 'saved'
      ? `✅ Queued: <i>${intent}</i>\nThe system will process this shortly.`
      : `⚠️ Received: <i>${intent}</i>\n(Supabase not connected — action not persisted)`

    await telegramSend(token, chatId, ack, msgId)
  } catch (e) {
    // Never let processing errors surface back to Telegram
  }
}
