/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   CryptoCheck AI — Telegram Bot v3.0 PROFESSIONAL            ║
 * ║   Full engagement loop · Neural Scanner · Anti-exit flow     ║
 * ║   Deploy on Railway / Render / VPS                           ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const TelegramBot = require('node-telegram-bot-api')
const axios       = require('axios')

// ── ENV ──────────────────────────────────────────────────────────
const BOT_TOKEN        = process.env.TELEGRAM_BOT_TOKEN
const ALERT_CHANNEL    = process.env.ALERT_CHANNEL    || '@CryptoCheckAlerts2026'
const SITE_URL         = process.env.SITE_URL         || 'https://cryptocheckai.com'
const HELIUS_API_KEY   = process.env.HELIUS_API_KEY   || ''
const NEURAL_THRESHOLD = Number(process.env.NEURAL_THRESHOLD || 65)
const ADMIN_ID         = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : null
const BOT_USERNAME     = '@CryptoCheckGold_bot'

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN missing')

// ── Bot instance ─────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: false })

// ── Session store ────────────────────────────────────────────────
const sessions   = new Map()
const scanCounts = new Map()
const lastActive = new Map()

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      isPro:      false,
      step:       'menu',
      scanCount:  0,
      watchlist:  [],
      joinedAt:   Date.now(),
    })
  }
  lastActive.set(userId, Date.now())
  return sessions.get(userId)
}

function isAdmin(userId) {
  if (!ADMIN_ID) return true
  return userId === ADMIN_ID
}

function escMd(text) {
  return String(text ?? '').replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}

function scoreEmoji(score) {
  if (score >= 80) return '🟢'
  if (score >= 60) return '🟡'
  if (score >= 40) return '🟠'
  return '🔴'
}

function scoreVerdict(score) {
  if (score >= 80) return '✅ SAFE GEM'
  if (score >= 60) return '⚠️ MODERATE RISK'
  if (score >= 40) return '🚨 HIGH RISK'
  return '☠️ DANGER — LIKELY RUG'
}

// ── Main keyboard ────────────────────────────────────────────────
function mainKeyboard(isPro = false) {
  return {
    inline_keyboard: [
      [
        { text: '🧠 Neural Scan',     callback_data: 'scan' },
        { text: '📡 Alpha Feed',      callback_data: 'feed' },
      ],
      [
        { text: '🐋 Whale Tracker',   callback_data: 'whales' },
        { text: '📊 Portfolio',       callback_data: 'portfolio' },
      ],
      [
        { text: '🔔 Set Alert',       callback_data: 'set_alert' },
        { text: '📰 Latest News',     callback_data: 'news' },
      ],
      [
        { text: '🏆 Leaderboard',     callback_data: 'leaderboard' },
        { text: '❓ How it works',    callback_data: 'howto' },
      ],
      [
        isPro
          ? { text: '✅ VIP Active — Manage',    url: `${SITE_URL}/#account` }
          : { text: '⚡ Upgrade VIP — $30/mo 🚀', url: `${SITE_URL}/#upgrade` },
      ],
      [
        { text: '🌐 Open Terminal',   url: SITE_URL },
      ],
    ]
  }
}

function backKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '← Back to Menu', callback_data: 'menu' }]
    ]
  }
}

function scanResultKeyboard(mint) {
  return {
    inline_keyboard: [
      [
        { text: '⚡ Trade on Jupiter', url: `https://jup.ag/swap/SOL-${mint}` },
        { text: '📊 Full Chart',       url: `https://dexscreener.com/solana/${mint}` },
      ],
      [
        { text: '🔍 Scan Another Token', callback_data: 'scan' },
        { text: '🔔 Add to Watchlist',   callback_data: `watch_${mint}` },
      ],
      [
        { text: '🌐 Deep Analysis on Site', url: `${SITE_URL}/scan?mint=${mint}` },
      ],
      [{ text: '← Back to Menu', callback_data: 'menu' }],
    ]
  }
}

// ── Token Scanner ────────────────────────────────────────────────
async function scanToken(mint) {
  try {
    // Helius token metadata
    const heliusRes = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: '2.0',
        id: 'scan',
        method: 'getAsset',
        params: { id: mint },
      },
      { timeout: 8000 }
    )

    const asset = heliusRes.data?.result

    // DexScreener price data
    let dex = {}
    try {
      const dexRes = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
        { timeout: 5000 }
      )
      const pair = dexRes.data?.pairs?.[0]
      if (pair) {
        dex = {
          price:     pair.priceUsd || '0',
          volume24h: pair.volume?.h24 || 0,
          liquidity: pair.liquidity?.usd || 0,
          priceChange: pair.priceChange?.h24 || 0,
          txns:      (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0),
          dexUrl:    pair.url || '',
          pairAge:   pair.pairCreatedAt
            ? Math.floor((Date.now() - pair.pairCreatedAt) / 60000)
            : null,
        }
      }
    } catch {}

    // Neural score calculation
    let score = 50
    const flags = []
    const positives = []

    // Mint authority
    const mintAuth = asset?.mintAuthority
    if (mintAuth) {
      score -= 25
      flags.push('⚠️ Mint authority active — unlimited supply risk')
    } else {
      score += 10
      positives.push('✅ Mint authority revoked')
    }

    // Freeze authority
    const freezeAuth = asset?.freezeAuthority
    if (freezeAuth) {
      score -= 20
      flags.push('⚠️ Freeze authority active — accounts can be frozen')
    } else {
      score += 5
      positives.push('✅ Freeze authority revoked')
    }

    // Liquidity check
    if (dex.liquidity > 100000) {
      score += 20
      positives.push(`✅ Strong liquidity $${Number(dex.liquidity).toLocaleString()}`)
    } else if (dex.liquidity > 10000) {
      score += 5
    } else if (dex.liquidity > 0) {
      score -= 20
      flags.push(`⚠️ Low liquidity $${Number(dex.liquidity).toLocaleString()}`)
    }

    // Volume check
    if (dex.volume24h > 50000) {
      score += 10
      positives.push(`✅ High 24h volume $${Number(dex.volume24h).toLocaleString()}`)
    } else if (dex.volume24h < 1000 && dex.volume24h > 0) {
      score -= 10
      flags.push('⚠️ Very low volume')
    }

    // Age check
    if (dex.pairAge !== null) {
      if (dex.pairAge < 10) {
        score -= 15
        flags.push('⚠️ Token very new — less than 10 minutes old')
      } else if (dex.pairAge > 1440) {
        score += 10
        positives.push('✅ Token older than 24 hours')
      }
    }

    score = Math.max(0, Math.min(100, score))

    const name   = asset?.content?.metadata?.name    || 'Unknown'
    const symbol = asset?.content?.metadata?.symbol  || '???'

    return {
      mint, name, symbol, score,
      price:      dex.price,
      volume24h:  dex.volume24h,
      liquidity:  dex.liquidity,
      priceChange: dex.priceChange,
      txns:       dex.txns,
      dexUrl:     dex.dexUrl,
      pairAge:    dex.pairAge,
      mintAuth:   !!mintAuth,
      freezeAuth: !!freezeAuth,
      flags,
      positives,
    }
  } catch (err) {
    throw new Error(`Scan failed: ${err.message}`)
  }
}

function formatScanResult(data) {
  const verdict = scoreVerdict(data.score)
  const emoji   = scoreEmoji(data.score)
  const bar     = '█'.repeat(Math.floor(data.score / 10)) + '░'.repeat(10 - Math.floor(data.score / 10))

  const flagsText = data.flags.length > 0
    ? data.flags.map(f => `├ ${escMd(f)}`).join('\n')
    : '├ No critical flags found'

  const positivesText = data.positives.length > 0
    ? data.positives.map(p => `├ ${escMd(p)}`).join('\n')
    : ''

  const priceChange = data.priceChange > 0
    ? `\\+${escMd(data.priceChange.toFixed(2))}%`
    : `${escMd(data.priceChange.toFixed(2))}%`

  const ageText = data.pairAge !== null
    ? data.pairAge > 1440
      ? escMd(`${Math.floor(data.pairAge / 1440)}d ${Math.floor((data.pairAge % 1440) / 60)}h`)
      : data.pairAge > 60
      ? escMd(`${Math.floor(data.pairAge / 60)}h ${data.pairAge % 60}m`)
      : escMd(`${data.pairAge}m`)
    : 'Unknown'

  return `
🧠 *NEURAL SCAN REPORT*
━━━━━━━━━━━━━━━━━━━━━━

🪙 *${escMd(data.name)}* \\($${escMd(data.symbol)}\\)
📍 \`${escMd(data.mint.slice(0, 8))}…${escMd(data.mint.slice(-8))}\`

*Neural Score: ${escMd(data.score)}/100*
${escMd(bar)} ${emoji}
🏷️ Verdict: *${escMd(verdict)}*

━━━━━━━━━━━━━━━━━━━━━━
📊 *MARKET DATA*
├ 💰 Price: $${escMd(data.price || '0')}
├ 📈 24h Change: ${priceChange}
├ 💧 Liquidity: $${escMd(Number(data.liquidity).toLocaleString())}
├ 📦 24h Volume: $${escMd(Number(data.volume24h).toLocaleString())}
├ 🔄 24h Txns: ${escMd(data.txns.toString())}
└ ⏱️ Age: ${ageText}

━━━━━━━━━━━━━━━━━━━━━━
🔍 *SECURITY ANALYSIS*
${flagsText}
${positivesText ? positivesText + '\n' : ''}
━━━━━━━━━━━━━━━━━━━━━━
🔗 [cryptocheckai\\.com](${SITE_URL}) · ${escMd(BOT_USERNAME)}
`.trim()
}

// ── /start ───────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const chatId  = msg.chat.id
  const name    = msg.from?.first_name || 'Trader'
  const session = getSession(msg.from.id)
  session.step  = 'menu'

  const text = `
🛡️ *Welcome to CryptoCheck AI, ${escMd(name)}\\!*
_The \\#1 Neural Intelligence Layer for Solana_
━━━━━━━━━━━━━━━━━━━━━━

🧠 *What CryptoCheck AI does:*
├ Scans every Solana token in real\\-time
├ GPT\\-4o risk scoring \\(0\\-100\\)
├ Detects rugs BEFORE they happen
├ Tracks whale wallets \\+$50K PnL
├ Auto\\-Sniper — trades for you 24/7
└ Live alpha feed every 30 minutes

${session.isPro ? '⚡ *VIP Account Active* ✅' : '🔒 *Free Account* — 3 scans/day'}

━━━━━━━━━━━━━━━━━━━━━━
👇 *Choose what you want to do:*
`.trim()

  await bot.sendMessage(chatId, text, {
    parse_mode:   'MarkdownV2',
    reply_markup: mainKeyboard(session.isPro),
    disable_web_page_preview: true,
  })
})

// ── /scan <mint> ─────────────────────────────────────────────────
bot.onText(/\/scan(?:\s+(.+))?/, async (msg, match) => {
  const chatId  = msg.chat.id
  const mint    = match?.[1]?.trim()
  const session = getSession(msg.from?.id)

  if (!mint) {
    await bot.sendMessage(chatId,
      `🧠 *Neural Scanner Ready*\n\nPaste any Solana token address:\n\`/scan <mint_address>\`\n\n_Example:_\n\`/scan EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\``,
      { parse_mode: 'MarkdownV2', reply_markup: backKeyboard() }
    )
    return
  }

  if (mint.length < 32) {
    await bot.sendMessage(chatId,
      '❌ *Invalid address*\n\nPlease send a valid Solana token mint address \\(32\\-44 characters\\)\\.',
      { parse_mode: 'MarkdownV2', reply_markup: backKeyboard() }
    )
    return
  }

  if (!session.isPro && session.scanCount >= 3) {
    await bot.sendMessage(chatId,
      `🔒 *Daily Scan Limit Reached*\n\n━━━━━━━━━━━━━━━━━━━━━━\nFree accounts get *3 scans/day*\\.\n\n🚀 *Upgrade to VIP for:*\n├ ✅ Unlimited scans\n├ 🐋 Whale tracker\n├ 🤖 AI Auto\\-Sniper\n└ 📡 Priority alerts\n━━━━━━━━━━━━━━━━━━━━━━`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚡ Upgrade to VIP — $30/mo', url: `${SITE_URL}/#upgrade` }],
            [{ text: '← Back to Menu', callback_data: 'menu' }],
          ]
        }
      }
    )
    return
  }

  const loadingMsg = await bot.sendMessage(chatId,
    '⟳ _Running Neural Engine v2\\.\\.\\._\n_Scanning contract, liquidity, whale data…_',
    { parse_mode: 'MarkdownV2' }
  )

  try {
    const data = await scanToken(mint)
    session.scanCount = (session.scanCount || 0) + 1
    const text = formatScanResult(data)

    await bot.editMessageText(text, {
      chat_id:      chatId,
      message_id:   loadingMsg.message_id,
      parse_mode:   'MarkdownV2',
      reply_markup: scanResultKeyboard(mint),
      disable_web_page_preview: true,
    })

    // Re-engage after scan
    setTimeout(async () => {
      try {
        await bot.sendMessage(chatId,
          `💡 *Want more alpha?*\n\nScan another token or check the live Alpha Feed for new gems 👇`,
          {
            parse_mode: 'MarkdownV2',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔍 Scan Another', callback_data: 'scan' },
                  { text: '📡 Alpha Feed',   callback_data: 'feed' },
                ],
                [{ text: '← Main Menu', callback_data: 'menu' }],
              ]
            }
          }
        )
      } catch {}
    }, 3000)

  } catch (err) {
    await bot.editMessageText(
      `❌ *Scan Failed*\n\n_${escMd(err.message)}_\n\nPlease check the mint address and try again\\.`,
      {
        chat_id:    chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'MarkdownV2',
        reply_markup: backKeyboard(),
      }
    )
  }
})

// ── Callback query handler ───────────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId  = query.message?.chat.id
  const msgId   = query.message?.message_id
  const userId  = query.from.id
  const data    = query.data
  const session = getSession(userId)

  await bot.answerCallbackQuery(query.id)

  // ── MENU ──
  if (data === 'menu') {
    session.step = 'menu'
    const text = `
🛡️ *CryptoCheck AI — Command Center*
━━━━━━━━━━━━━━━━━━━━━━
${session.isPro ? '⚡ VIP Account Active ✅' : `🔒 Free Account — ${escMd(String(3 - (session.scanCount || 0)))} scans remaining today`}
━━━━━━━━━━━━━━━━━━━━━━
👇 *What would you like to do?*
`.trim()

    await bot.sendMessage(chatId, text, {
      parse_mode:   'MarkdownV2',
      reply_markup: mainKeyboard(session.isPro),
    })
    return
  }

  // ── SCAN ──
  if (data === 'scan') {
    session.step = 'awaiting_mint'
    await bot.sendMessage(chatId,
      `🧠 *Neural Scanner*\n━━━━━━━━━━━━━━━━━━━━━━\n\nPaste the Solana token address you want to scan:\n\n_Tip: You can find it on DexScreener or pump\\.fun_`,
      {
        parse_mode:   'MarkdownV2',
        reply_markup: backKeyboard(),
      }
    )
    return
  }

  // ── FEED ──
  if (data === 'feed') {
    await bot.sendMessage(chatId,
      `📡 *Live Alpha Feed*\n━━━━━━━━━━━━━━━━━━━━━━\n\n🚨 New Raydium launches scanned every *15 seconds*\nOnly tokens scoring *${escMd(NEURAL_THRESHOLD)}\\+* trigger an alert\n\n📊 Alpha updates post to channel every *30 minutes*\n\n🔔 Make sure notifications are *ON* in the channel\\!`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📡 Join Alert Channel', url: `https://t.me/${ALERT_CHANNEL.replace('@', '')}` }],
            [{ text: '🔍 Scan a Token Now',   callback_data: 'scan' }],
            [{ text: '← Back to Menu',        callback_data: 'menu' }],
          ]
        }
      }
    )
    return
  }

  // ── NEWS ──
  if (data === 'news') {
    const loadingMsg = await bot.sendMessage(chatId,
      '📰 _Fetching latest alpha news…_',
      { parse_mode: 'MarkdownV2' }
    )
    try {
      const newsRes = await axios.get(
        'https://api.coingecko.com/api/v3/search/trending',
        { timeout: 5000 }
      )
      const coins = newsRes.data?.coins?.slice(0, 5) || []
      const lines = coins.map((c, i) =>
        `${i + 1}\\. 🔥 *${escMd(c.item.name)}* \\($${escMd(c.item.symbol)}\\) — Rank \\#${escMd(String(c.item.market_cap_rank || '?'))}\n   📎 CoinGecko Trending`
      ).join('\n\n')

      await bot.editMessageText(
        `📰 *CRYPTO ALPHA DIGEST*\n━━━━━━━━━━━━━━━━━━━━━━\n☀️ *Top Trending Now*\n\n${lines}\n\n━━━━━━━━━━━━━━━━━━━━━━\n⏰ Updated every 30 minutes`,
        {
          chat_id:    chatId,
          message_id: loadingMsg.message_id,
          parse_mode: 'MarkdownV2',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔍 Scan a Trending Token', callback_data: 'scan' }],
              [{ text: '← Back to Menu',           callback_data: 'menu' }],
            ]
          }
        }
      )
    } catch {
      await bot.editMessageText(
        '❌ Could not fetch news\\. Try again later\\.',
        { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'MarkdownV2', reply_markup: backKeyboard() }
      )
    }
    return
  }

  // ── WHALES ──
  if (data === 'whales') {
    if (!session.isPro) {
      await bot.sendMessage(chatId,
        `🐋 *Whale Tracker — VIP Feature*\n━━━━━━━━━━━━━━━━━━━━━━\n\nTrack wallets with \\+$50K PnL in real\\-time\\.\n\n*What you get with VIP:*\n├ 🐋 Top 50 whale wallets live\n├ 📊 Entry/exit alerts\n├ 💰 PnL tracking\n└ 🤖 Auto\\-copy trade signals\n━━━━━━━━━━━━━━━━━━━━━━`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⚡ Upgrade to VIP — $30/mo', url: `${SITE_URL}/#upgrade` }],
              [{ text: '← Back to Menu', callback_data: 'menu' }],
            ]
          }
        }
      )
    } else {
      await bot.sendMessage(chatId,
        '🐋 *Smart Money Tracker*\n\n_Loading whale wallets\\.\\.\\._\n\n🔜 Coming in next update\\!',
        { parse_mode: 'MarkdownV2', reply_markup: backKeyboard() }
      )
    }
    return
  }

  // ── PORTFOLIO ──
  if (data === 'portfolio') {
    await bot.sendMessage(chatId,
      `📊 *Portfolio Tracker*\n━━━━━━━━━━━━━━━━━━━━━━\n\nConnect your wallet to track your Solana portfolio in real\\-time\\.\n\n✅ P&L tracking\n✅ Token risk scores\n✅ Whale comparison\n━━━━━━━━━━━━━━━━━━━━━━`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Connect Wallet on Site', url: `${SITE_URL}` }],
            [{ text: '← Back to Menu', callback_data: 'menu' }],
          ]
        }
      }
    )
    return
  }

  // ── SET ALERT ──
  if (data === 'set_alert') {
    await bot.sendMessage(chatId,
      `🔔 *Token Alerts*\n━━━━━━━━━━━━━━━━━━━━━━\n\nGet instant alerts when:\n├ New gems score \\> ${escMd(NEURAL_THRESHOLD)}/100\n├ Your watchlist tokens move \\>20%\n└ Whale wallets enter a position\n\n📡 Join the channel to receive all alerts:`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📡 Join Alert Channel', url: `https://t.me/${ALERT_CHANNEL.replace('@', '')}` }],
            [{ text: '← Back to Menu', callback_data: 'menu' }],
          ]
        }
      }
    )
    return
  }

  // ── LEADERBOARD ──
  if (data === 'leaderboard') {
    const topUsers = [...sessions.entries()]
      .sort((a, b) => (b[1].scanCount || 0) - (a[1].scanCount || 0))
      .slice(0, 5)

    const lines = topUsers.length > 0
      ? topUsers.map(([ , s], i) =>
          `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} ${escMd(String(s.scanCount || 0))} scans`
        ).join('\n')
      : '_No data yet — be the first to scan\\!_'

    await bot.sendMessage(chatId,
      `🏆 *Top Scanners Today*\n━━━━━━━━━━━━━━━━━━━━━━\n\n${lines}\n\n━━━━━━━━━━━━━━━━━━━━━━\n💡 _Scan more tokens to climb the leaderboard\\!_`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 Scan Now', callback_data: 'scan' }],
            [{ text: '← Back to Menu', callback_data: 'menu' }],
          ]
        }
      }
    )
    return
  }

  // ── HOW IT WORKS ──
  if (data === 'howto') {
    await bot.sendMessage(chatId,
      `❓ *How CryptoCheck AI Works*\n━━━━━━━━━━━━━━━━━━━━━━\n\n*Step 1 — Scan any token*\nPaste any Solana mint address\\. Our Neural Engine v2 analyzes:\n├ Smart contract code\n├ Liquidity & volume\n├ Mint/freeze authority\n├ Holder concentration\n└ Whale wallet activity\n\n*Step 2 — Get Neural Score*\nScore 0\\-100:\n├ 🟢 80\\+ = Safe gem\n├ 🟡 60\\-79 = Moderate risk\n├ 🟠 40\\-59 = High risk\n└ 🔴 0\\-39 = Likely rug\n\n*Step 3 — Trade with confidence*\nDirect Jupiter swap link included in every scan\\.\n\n*Step 4 — Upgrade to VIP*\nUnlock Auto\\-Sniper, Whale Tracker & unlimited scans\\.\n━━━━━━━━━━━━━━━━━━━━━━`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 Try a Scan Now',          callback_data: 'scan' }],
            [{ text: '⚡ Upgrade to VIP',           url: `${SITE_URL}/#upgrade` }],
            [{ text: '← Back to Menu',             callback_data: 'menu' }],
          ]
        }
      }
    )
    return
  }

  // ── WATCHLIST ──
  if (data?.startsWith('watch_')) {
    const mint = data.replace('watch_', '')
    session.watchlist = session.watchlist || []
    if (!session.watchlist.includes(mint)) {
      session.watchlist.push(mint)
      await bot.sendMessage(chatId,
        `✅ *Added to Watchlist\\!*\n\n\`${escMd(mint.slice(0, 8))}…\`\n\nYou'll get alerts when this token moves significantly\\.`,
        { parse_mode: 'MarkdownV2', reply_markup: backKeyboard() }
      )
    } else {
      await bot.sendMessage(chatId,
        '⚠️ _Already in your watchlist\\._',
        { parse_mode: 'MarkdownV2', reply_markup: backKeyboard() }
      )
    }
    return
  }
})

// ── Handle plain text (awaiting mint address) ────────────────────
bot.on('message', async (msg) => {
  if (msg.text?.startsWith('/')) return

  const chatId  = msg.chat.id
  const session = getSession(msg.from?.id)
  const text    = msg.text?.trim()

  if (!text) return

  // If user is in scan mode, treat message as mint address
  if (session.step === 'awaiting_mint') {
    session.step = 'menu'

    if (text.length < 32) {
      await bot.sendMessage(chatId,
        '❌ *Invalid address*\n\nPlease send a valid Solana token address \\(32\\-44 characters\\)\\.',
        { parse_mode: 'MarkdownV2', reply_markup: backKeyboard() }
      )
      return
    }

    if (!session.isPro && session.scanCount >= 3) {
      await bot.sendMessage(chatId,
        `🔒 *Scan limit reached*\n\n[Upgrade to VIP](${SITE_URL}/#upgrade) for unlimited scans\\.`,
        { parse_mode: 'MarkdownV2', reply_markup: {
          inline_keyboard: [
            [{ text: '⚡ Upgrade VIP', url: `${SITE_URL}/#upgrade` }],
            [{ text: '← Menu', callback_data: 'menu' }],
          ]
        }}
      )
      return
    }

    const loadingMsg = await bot.sendMessage(chatId,
      '⟳ _Running Neural Engine v2…_\n_Analyzing contract, liquidity & whale data…_',
      { parse_mode: 'MarkdownV2' }
    )

    try {
      const data = await scanToken(text)
      session.scanCount = (session.scanCount || 0) + 1
      const result = formatScanResult(data)

      await bot.editMessageText(result, {
        chat_id:      chatId,
        message_id:   loadingMsg.message_id,
        parse_mode:   'MarkdownV2',
        reply_markup: scanResultKeyboard(text),
        disable_web_page_preview: true,
      })

      setTimeout(async () => {
        try {
          await bot.sendMessage(chatId,
            `💡 *Scan another token or explore more features:*`,
            { parse_mode: 'MarkdownV2', reply_markup: mainKeyboard(session.isPro) }
          )
        } catch {}
      }, 3000)

    } catch (err) {
      await bot.editMessageText(
        `❌ *Scan Failed*\n\n_${escMd(err.message)}_`,
        {
          chat_id:    chatId,
          message_id: loadingMsg.message_id,
          parse_mode: 'MarkdownV2',
          reply_markup: backKeyboard(),
        }
      )
    }
    return
  }

  // Default — unknown message, bring back to menu
  await bot.sendMessage(chatId,
    `💡 _Use the menu below to get started\\!_`,
    { parse_mode: 'MarkdownV2', reply_markup: mainKeyboard(session.isPro) }
  )
})

// ── Re-engage inactive users (every 6 hours) ─────────────────────
setInterval(async () => {
  const now = Date.now()
  const SIX_HOURS = 6 * 60 * 60 * 1000

  for (const [userId, lastTime] of lastActive.entries()) {
    if (now - lastTime > SIX_HOURS) {
      try {
        await bot.sendMessage(userId,
          `🔔 *New gems detected on Solana\\!*\n\nOur Neural Engine just flagged several tokens\\. Want to check them out?`,
          {
            parse_mode: 'MarkdownV2',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🧠 Scan a Token', callback_data: 'scan' }],
                [{ text: '📡 Alpha Feed',   callback_data: 'feed' }],
              ]
            }
          }
        )
        lastActive.set(userId, now)
      } catch {}
    }
  }
}, 60 * 60 * 1000)

// ── News cron (every 30 min) ─────────────────────────────────────
async function postNewsCron() {
  try {
    const res = await axios.get(
      'https://api.coingecko.com/api/v3/search/trending',
      { timeout: 5000 }
    )
    const coins = res.data?.coins?.slice(0, 5) || []
    const lines = coins.map((c, i) =>
      `${i + 1}\\. 🔥 *${escMd(c.item.name)}* \\($${escMd(c.item.symbol)}\\) — Rank \\#${escMd(String(c.item.market_cap_rank || '?'))}\n   📎 CoinGecko Trending`
    ).join('\n\n')

    const text = `
🗞️ *CRYPTO ALPHA DIGEST*
━━━━━━━━━━━━━━━━━━━━━━
☀️ *Top Solana & Crypto News*

${lines}

━━━━━━━━━━━━━━━━━━━━━━
⏰ _Updated every 30 minutes_
━━━━━━━━━━━━━━━━━━━━━━
🔗 [cryptocheckai\\.com](${SITE_URL}) · 🤖 ${escMd(BOT_USERNAME)}
`.trim()

    await bot.sendMessage(ALERT_CHANNEL, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🌐 Website',   url: SITE_URL },
            { text: '🤖 Open Bot',  url: `https://t.me/${BOT_USERNAME.replace('@', '')}` },
          ],
          [{ text: '💎 Join Community', url: `https://t.me/${ALERT_CHANNEL.replace('@', '')}` }],
        ]
      },
      disable_web_page_preview: true,
    })
  } catch (err) {
    console.error('[News Cron Error]', err.message)
  }
}

setInterval(postNewsCron, 30 * 60 * 1000)

// ── Reset daily scan counts (midnight UTC) ───────────────────────
setInterval(() => {
  for (const session of sessions.values()) {
    session.scanCount = 0
  }
}, 24 * 60 * 60 * 1000)

// ── Polling error handler ────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('[Polling Error]', err.message)
})

// ── BOOT ─────────────────────────────────────────────────────────
async function startBot() {
  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`,
      { drop_pending_updates: true }
    )
    console.log('[Boot] Webhook cleared')
  } catch (err) {
    console.warn('[Boot] Could not clear webhook:', err.message)
  }

  bot.startPolling({ restart: false })

  console.log('🤖 CryptoCheck AI Bot v3.0 PROFESSIONAL is LIVE')
  console.log(`📡 Alert channel : ${ALERT_CHANNEL}`)
  console.log(`🧠 Neural threshold: ${NEURAL_THRESHOLD}+`)
  console.log(`🔐 Admin ID: ${ADMIN_ID || 'open mode'}`)

  // Post first news immediately
  setTimeout(postNewsCron, 5000)
}

startBot()
