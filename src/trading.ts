import type { UnifiedOrder, UnifiedPosition } from "@somnia-chain/markets-sdk";
import type { Venue } from "./exchange.js";
import { resolvePerp } from "./exchange.js";
import { logTrade, type TradeRecord } from "./tradelog.js";

export class UserError extends Error {}

export interface OpenQuote {
  symbol: string;
  side: "long" | "short";
  mark: number;
  amount: number;
  notionalUsd: number;
  fundingRate8h?: number;
}

/** Turn a USD notional into an on-grid base quantity at the current mark. Read-only. */
export async function quoteOpen(v: Venue, asset: string, side: "long" | "short", notionalUsd: number): Promise<OpenQuote> {
  const market = resolvePerp(v.ex, asset);
  if (!market) throw new UserError(`No tradeable perp for "${asset}". Send /markets to see the list.`);
  if (notionalUsd > v.cfg.maxOrderUsd) {
    throw new UserError(`$${notionalUsd} is above your MAX_ORDER_USD cap of $${v.cfg.maxOrderUsd}.`);
  }
  const t = await v.ex.fetchTicker(market.symbol);
  const mark = t.markPrice ?? t.last;
  if (!mark || t.perpState === "degraded") throw new UserError(`${market.symbol} has no live mark price right now — try again shortly.`);
  const amount = v.ex.amountToPrecision(market.symbol, notionalUsd / mark);
  const min = market.limits.amount.min ?? 0;
  if (amount <= 0 || amount < min) {
    throw new UserError(`$${notionalUsd} is below the minimum size for ${market.symbol} (min ${min} ≈ $${(min * mark).toFixed(2)}).`);
  }
  return { symbol: market.symbol, side, mark, amount, notionalUsd: amount * mark, fundingRate8h: t.fundingRate };
}

function record(source: TradeRecord["source"], action: TradeRecord["action"], o: UnifiedOrder, note?: string): TradeRecord {
  return logTrade({
    source,
    action,
    symbol: o.symbol,
    side: o.side,
    amount: o.amount,
    filled: o.filled,
    price: o.price,
    status: o.status,
    orderId: o.id,
    txHash: o.txHash,
    note,
  });
}

export async function executeOpen(v: Venue, q: OpenQuote, source: TradeRecord["source"] = "telegram"): Promise<TradeRecord> {
  const order = await v.ex.createOrder(q.symbol, "market", q.side === "long" ? "buy" : "sell", q.amount, undefined, {
    slippage: v.cfg.slippage,
  });
  return record(source, "open", order);
}

export async function getPositions(v: Venue, symbols?: string[]): Promise<UnifiedPosition[]> {
  const all = await v.ex.fetchPositions(symbols);
  return all.filter((p) => p.contracts > 0);
}

/**
 * Close `fraction` of a position with a market order on the opposite side.
 * The unified createOrder has no reduce-only flag (see feedback/02), so we size the
 * order from a FRESH position read immediately before sending and cap it at |size|.
 */
export async function closePosition(
  v: Venue,
  symbol: string,
  fraction = 1,
  source: TradeRecord["source"] = "telegram",
  action: TradeRecord["action"] = "close",
): Promise<TradeRecord | null> {
  const [pos] = await getPositions(v, [symbol]);
  if (!pos) return null;
  const amount = v.ex.amountToPrecision(symbol, Math.min(pos.contracts, pos.contracts * fraction));
  if (amount <= 0) throw new UserError(`That close is smaller than one lot on ${symbol}.`);
  const order = await v.ex.createOrder(symbol, "market", pos.side === "long" ? "sell" : "buy", amount, undefined, {
    slippage: v.cfg.slippage,
  });
  return record(source, action, order, `${Math.round(fraction * 100)}% of ${pos.side}`);
}

export async function closeAll(v: Venue, source: TradeRecord["source"] = "telegram"): Promise<TradeRecord[]> {
  const out: TradeRecord[] = [];
  for (const p of await getPositions(v)) {
    const r = await closePosition(v, p.symbol, 1, source);
    if (r) out.push(r);
  }
  return out;
}

export interface Health {
  status: "Healthy" | "MarginCall" | "PartialLiquidation" | "CloseOut";
  /** equity / maintenance requirement; null when flat (no requirement). */
  ratio: number | null;
  equity: bigint;
  mmReq: bigint;
}

export async function getHealth(v: Venue): Promise<Health> {
  const h = await v.ex.client.getAccountHealth(v.marginBank, v.account);
  const ratio = h.mmReq > 0n ? Number((h.equity * 10_000n) / h.mmReq) / 10_000 : null;
  return { status: h.marginStatus, ratio, equity: h.equity, mmReq: h.mmReq };
}
