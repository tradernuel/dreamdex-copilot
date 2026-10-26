/**
 * Natural, chat-friendly trade commands. Pure functions — no I/O — so they are unit tested.
 *
 *   long eth 100          -> $100 notional long on ETH
 *   short btc $250 3x     -> $250 margin x 3 = $750 notional short on BTC
 *   close eth             -> close the whole ETH position
 *   close eth 50%         -> close half of it
 */
export type Intent =
  | { kind: "open"; side: "long" | "short"; asset: string; marginUsd: number; leverage: number; notionalUsd: number }
  | { kind: "close"; asset: string; fraction: number }
  | { kind: "closeall" };

export type ParseResult = { ok: true; intent: Intent } | { ok: false; error: string };

const MAX_LEVERAGE = 50;

export function parseIntent(text: string): ParseResult {
  const words = text.trim().replace(/^\//, "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { ok: false, error: "Empty command." };
  const [verb, ...rest] = words;

  if (verb === "closeall" || (verb === "close" && rest[0] === "all")) return { ok: true, intent: { kind: "closeall" } };

  if (verb === "long" || verb === "short" || verb === "buy" || verb === "sell") {
    const side = verb === "long" || verb === "buy" ? "long" : "short";
    const [asset, amountRaw, levRaw] = rest;
    if (!asset || !amountRaw) return { ok: false, error: `Usage: ${side} <asset> <usd> [leverage]x — e.g. "${side} eth 100 2x"` };
    const marginUsd = Number(amountRaw.replace(/^\$/, "").replace(/usd$/, ""));
    if (!Number.isFinite(marginUsd) || marginUsd <= 0) return { ok: false, error: `"${amountRaw}" is not a valid USD amount.` };
    let leverage = 1;
    if (levRaw !== undefined) {
      const m = /^x?(\d+(?:\.\d+)?)x?$/.exec(levRaw);
      if (!m) return { ok: false, error: `"${levRaw}" is not a valid leverage — use e.g. 3x.` };
      leverage = Number(m[1]);
      if (leverage < 1 || leverage > MAX_LEVERAGE) return { ok: false, error: `Leverage must be between 1x and ${MAX_LEVERAGE}x.` };
    }
    return { ok: true, intent: { kind: "open", side, asset, marginUsd, leverage, notionalUsd: marginUsd * leverage } };
  }

  if (verb === "close") {
    const [asset, pctRaw] = rest;
    if (!asset) return { ok: false, error: 'Usage: close <asset> [percent] — e.g. "close eth 50%"' };
    let fraction = 1;
    if (pctRaw !== undefined) {
      const pct = Number(pctRaw.replace(/%$/, ""));
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { ok: false, error: "Percent must be between 0 and 100." };
      fraction = pct / 100;
    }
    return { ok: true, intent: { kind: "close", asset, fraction } };
  }

  return { ok: false, error: `Unknown command "${verb}". Send /help.` };
}
