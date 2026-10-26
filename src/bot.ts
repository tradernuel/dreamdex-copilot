import { Bot, InlineKeyboard, type Context } from "grammy";
import { getAbiItem, formatUnits } from "viem";
import { ContractRevertError, marginBankEventsAbi } from "@somnia-chain/markets-sdk";
import { loadBotConfig, loadChainConfig, loadGuardConfig } from "./config.js";
import { connect, listPerps, resolvePerp, type Venue } from "./exchange.js";
import { parseIntent } from "./parser.js";
import { closeAll, closePosition, executeOpen, getHealth, getPositions, quoteOpen, UserError, type OpenQuote } from "./trading.js";
import { Cooldown, evaluate } from "./guard.js";
import { fmtHealth, fmtPosition, fmtTrade, fundingPct, usd } from "./format.js";
import { readTrades } from "./tradelog.js";

const HELP = `<b>dreamDEX Perps Co-pilot</b> — Somnia Tokyo testnet

<b>Trade</b> (type it plainly or as a command)
<code>long eth 100</code> — $100 long
<code>short btc 50 3x</code> — $50 × 3 = $150 short
<code>close eth</code> · <code>close eth 50%</code> · <code>/closeall</code>

<b>Look</b>
/positions · /health · /markets · <code>/price eth</code> · /log

<b>Guard</b>
<code>/guard on</code> · <code>/guard off</code> · /guard
Every order asks you to confirm first.`;

const PENDING_TTL_MS = 60_000;

async function main() {
  const chainCfg = loadChainConfig();
  const botCfg = loadBotConfig();
  const guardCfg = loadGuardConfig();
  const v = await connect(chainCfg);
  console.log(`Connected to Hideki as ${v.account} — ${listPerps(v.ex).length} tradeable perps`);

  const bot = new Bot(botCfg.telegramToken);
  const pending = new Map<string, { quote?: OpenQuote; closeAll?: boolean; expires: number }>();
  let guardOn = guardCfg.enabled;

  // Only the owner(s) may talk to a bot that holds a trading key.
  bot.use(async (ctx, next) => {
    if (ctx.from && botCfg.allowedUserIds.includes(ctx.from.id)) return next();
    if (ctx.chat?.type === "private") await ctx.reply("This co-pilot is private.");
  });

  const notify = (text: string) =>
    Promise.all(botCfg.allowedUserIds.map((id) => bot.api.sendMessage(id, text, { parse_mode: "HTML" }).catch(() => {})));

  const fail = (ctx: Context, e: unknown) => {
    if (e instanceof UserError) return ctx.reply(e.message);
    if (e instanceof ContractRevertError) return ctx.reply(`Chain rejected it: <code>${e.errorName ?? e.message}</code>`, { parse_mode: "HTML" });
    console.error(e);
    return ctx.reply(`Something went wrong: ${(e as Error).message?.slice(0, 300)}`);
  };

  bot.command(["start", "help"], (ctx) => ctx.reply(HELP, { parse_mode: "HTML" }));

  bot.command("markets", async (ctx) => {
    try {
      const rows = await Promise.all(
        listPerps(v.ex).map(async (m) => {
          const t = await v.ex.fetchTicker(m.symbol).catch(() => undefined);
          return `${m.base.padEnd(6)} ${t?.markPrice !== undefined ? usd(t.markPrice).padStart(12) : "   no mark  "}  ${fundingPct(t?.fundingRate)}`;
        }),
      );
      await ctx.reply(`<pre>${rows.join("\n")}</pre>`, { parse_mode: "HTML" });
    } catch (e) { await fail(ctx, e); }
  });

  bot.command("price", async (ctx) => {
    try {
      const m = resolvePerp(v.ex, ctx.match || "");
      if (!m) throw new UserError("Usage: /price eth");
      const t = await v.ex.fetchTicker(m.symbol);
      await ctx.reply(
        `<b>${m.symbol}</b>\nmark ${t.markPrice !== undefined ? usd(t.markPrice) : "n/a"} · index ${t.indexPrice !== undefined ? usd(t.indexPrice) : "n/a"}\nfunding ${fundingPct(t.fundingRate)} · OI ${t.openInterest ?? "n/a"}`,
        { parse_mode: "HTML" },
      );
    } catch (e) { await fail(ctx, e); }
  });

  bot.command("positions", async (ctx) => {
    try {
      const ps = await getPositions(v);
      await ctx.reply(ps.length ? ps.map(fmtPosition).join("\n\n") : "You're flat. Try <code>long eth 50</code>.", { parse_mode: "HTML" });
    } catch (e) { await fail(ctx, e); }
  });

  bot.command("health", async (ctx) => {
    try { await ctx.reply(fmtHealth(await getHealth(v), v.collateralDecimals), { parse_mode: "HTML" }); }
    catch (e) { await fail(ctx, e); }
  });

  bot.command("log", async (ctx) => {
    const last = readTrades().slice(-5).reverse();
    await ctx.reply(last.length ? last.map(fmtTrade).join("\n\n") : "No trades yet.", { parse_mode: "HTML" });
  });

  bot.command("guard", async (ctx) => {
    const arg = ctx.match.trim().toLowerCase();
    if (arg === "on") guardOn = true;
    if (arg === "off") guardOn = false;
    await ctx.reply(
      `Guard is <b>${guardOn ? "ON" : "OFF"}</b>\nchecks every ${guardCfg.intervalSec}s · warn within ${guardCfg.liqWarnPct}% of liq · auto-reduce ${guardCfg.autoReduce ? `${guardCfg.reduceFraction * 100}% on margin call` : "off"}`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("closeall", async (ctx) => {
    const id = Math.random().toString(36).slice(2, 10);
    pending.set(id, { closeAll: true, expires: Date.now() + PENDING_TTL_MS });
    await ctx.reply("Close <b>all</b> positions at market?", {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("✅ Close all", `ok:${id}`).text("Cancel", `no:${id}`),
    });
  });

  // Plain-text trading ("long eth 100 2x") and the /long /short /close commands.
  const handleTrade = async (ctx: Context, text: string) => {
    const r = parseIntent(text);
    if (!r.ok) return ctx.reply(r.error);
    const it = r.intent;
    try {
      if (it.kind === "closeall") return ctx.reply("Use /closeall");
      if (it.kind === "close") {
        const m = resolvePerp(v.ex, it.asset);
        if (!m) throw new UserError(`No perp for "${it.asset}".`);
        await ctx.reply(`Closing ${Math.round(it.fraction * 100)}% of ${m.symbol}…`);
        const rec = await closePosition(v, m.symbol, it.fraction);
        return ctx.reply(rec ? fmtTrade(rec) : `No open ${m.symbol} position.`, { parse_mode: "HTML" });
      }
      const q = await quoteOpen(v, it.asset, it.side, it.notionalUsd);
      const id = Math.random().toString(36).slice(2, 10);
      pending.set(id, { quote: q, expires: Date.now() + PENDING_TTL_MS });
      return ctx.reply(
        [
          `<b>${q.side.toUpperCase()} ${q.symbol}</b>`,
          `size ${q.amount} ≈ ${usd(q.notionalUsd)} notional${it.leverage > 1 ? ` (${usd(it.marginUsd)} × ${it.leverage}x)` : ""}`,
          `mark ${usd(q.mark)} · slippage cap ${(chainCfg.slippage * 100).toFixed(1)}%`,
          `funding ${fundingPct(q.fundingRate8h)}${q.fundingRate8h !== undefined && (q.side === "long" ? q.fundingRate8h > 0 : q.fundingRate8h < 0) ? " — you'd PAY funding" : ""}`,
          `<i>Confirm within 60s.</i>`,
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("✅ Place order", `ok:${id}`).text("Cancel", `no:${id}`) },
      );
    } catch (e) { return fail(ctx, e); }
  };

  bot.command(["long", "short", "close"], (ctx) => handleTrade(ctx, `${ctx.message?.text?.split(/\s/)[0].slice(1)} ${ctx.match}`));
  bot.hears(/^(long|short|buy|sell|close)\b/i, (ctx) => handleTrade(ctx, ctx.message?.text ?? ""));

  bot.callbackQuery(/^(ok|no):(\w+)$/, async (ctx) => {
    const [, verdict, id] = ctx.match;
    const p = pending.get(id);
    pending.delete(id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup().catch(() => {});
    if (verdict === "no") return ctx.reply("Cancelled.");
    if (!p || p.expires < Date.now()) return ctx.reply("That quote expired — send the order again for a fresh price.");
    try {
      if (p.closeAll) {
        const recs = await closeAll(v);
        return ctx.reply(recs.length ? recs.map(fmtTrade).join("\n\n") : "Nothing to close.", { parse_mode: "HTML" });
      }
      await ctx.reply("Sending…");
      const rec = await executeOpen(v, p.quote!);
      return ctx.reply(fmtTrade(rec), { parse_mode: "HTML" });
    } catch (e) { return fail(ctx, e); }
  });

  // ---- Risk guard loop -------------------------------------------------------
  const cooldown = new Cooldown(10 * 60_000);
  let prevFunding: Record<string, number | undefined> = {};
  let ticking = false;
  setInterval(async () => {
    if (!guardOn || ticking) return;
    ticking = true;
    try {
      const positions = await getPositions(v);
      if (positions.length === 0) return;
      const health = await getHealth(v);
      const funding: Record<string, number | undefined> = {};
      for (const p of positions) funding[p.symbol] = (await v.ex.fetchFundingRate(p.symbol).catch(() => undefined))?.fundingRate;
      const actions = evaluate({ positions, health, funding, prevFunding, cfg: guardCfg });
      prevFunding = { ...prevFunding, ...funding };
      for (const a of actions) {
        if (!cooldown.allow(a.key)) continue;
        await notify(a.text);
        if (a.kind === "reduce") {
          const rec = await closePosition(v, a.symbol, a.fraction, "guard", "reduce");
          if (rec) await notify(`🛡 Guard reduced:\n${fmtTrade(rec)}`);
        } else if (a.kind === "closeall") {
          const recs = await closeAll(v, "guard");
          if (recs.length) await notify(`🛡 Guard flattened:\n${recs.map(fmtTrade).join("\n\n")}`);
        }
      }
    } catch (e) {
      console.error("guard tick failed:", e);
    } finally {
      ticking = false;
    }
  }, guardCfg.intervalSec * 1000);

  // ---- Live funding-settlement push (chain events, no polling) ---------------
  const viem = v.ex.client.getViemClient();
  viem.watchEvent({
    address: v.marginBank,
    event: getAbiItem({ abi: marginBankEventsAbi, name: "FundingSettled" }),
    args: { account: v.account },
    onLogs: (logs) => {
      for (const log of logs) {
        const payment = log.args.payment ?? 0n;
        if (payment === 0n) continue;
        const amt = Number(formatUnits(payment < 0n ? -payment : payment, v.collateralDecimals));
        const market = listPerps(v.ex).find((m) => m.info.poolAddress.toLowerCase() === log.args.perpPool?.toLowerCase());
        void notify(`${payment > 0n ? "💸 Paid" : "💰 Received"} ${usd(amt)} funding on ${market?.symbol ?? log.args.perpPool}`);
      }
    },
    onError: (e) => console.error("funding watch error:", e.message),
  });

  bot.catch((err) => console.error("bot error:", err.error));
  await bot.api.setMyCommands([
    { command: "positions", description: "Open positions with PnL and liq price" },
    { command: "health", description: "Account margin health" },
    { command: "markets", description: "Perp markets, marks and funding" },
    { command: "price", description: "Price and funding for one market" },
    { command: "closeall", description: "Close every position" },
    { command: "guard", description: "Risk guard on/off/status" },
    { command: "log", description: "Last 5 orders with tx hashes" },
    { command: "help", description: "How to trade from chat" },
  ]);
  await notify(`🤖 Co-pilot online for <code>${v.account}</code>. Guard ${guardOn ? "ON" : "OFF"}. Send /help.`);
  console.log("Bot running. Ctrl+C to stop.");
  const shutdown = async () => { await bot.stop(); await v.ex.close(); process.exit(0); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await bot.start();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
