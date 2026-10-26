import type { UnifiedPosition } from "@somnia-chain/markets-sdk";
import type { GuardConfig } from "./config.js";
import type { Health } from "./trading.js";

/**
 * The risk guard's brain. Pure: given positions, health and last-seen funding,
 * it returns what to say and what to do. The runner (bot.ts) performs the actions.
 */
export type GuardAction =
  | { kind: "alert"; key: string; text: string }
  | { kind: "reduce"; key: string; symbol: string; fraction: number; text: string }
  | { kind: "closeall"; key: string; text: string };

export interface GuardInput {
  positions: UnifiedPosition[];
  health: Health;
  /** Current per-8h funding rate per symbol. Positive = longs pay shorts. */
  funding: Record<string, number | undefined>;
  /** Funding seen on the previous tick, to detect a flip. */
  prevFunding: Record<string, number | undefined>;
  cfg: GuardConfig;
}

/** % distance from mark to liquidation, in the direction that hurts the position. */
export function liqDistancePct(p: UnifiedPosition): number | null {
  if (p.markPrice === undefined || p.liquidationPrice === undefined || p.liquidationPrice <= 0) return null;
  return (Math.abs(p.markPrice - p.liquidationPrice) / p.markPrice) * 100;
}

/** True when this position is the side that PAYS funding at this rate. */
export function paysFunding(side: "long" | "short", rate: number): boolean {
  return side === "long" ? rate > 0 : rate < 0;
}

const pct = (r: number) => `${(r * 100).toFixed(4)}%`;

export function evaluate({ positions, health, funding, prevFunding, cfg }: GuardInput): GuardAction[] {
  const out: GuardAction[] = [];
  if (positions.length === 0) return out;

  // 1. Account-level margin status (cross margin: one status for all positions).
  if (health.status === "PartialLiquidation" || health.status === "CloseOut") {
    if (cfg.autoReduce) {
      out.push({ kind: "closeall", key: `status:${health.status}`, text: `🚨 Account is in ${health.status}. Flattening all positions to stop the liquidation waterfall.` });
    } else {
      out.push({ kind: "alert", key: `status:${health.status}`, text: `🚨 Account is in ${health.status}. Liquidation is under way — act now (/closeall).` });
    }
    return out; // nothing else matters at this point
  }
  if (health.status === "MarginCall") {
    const largest = [...positions].sort((a, b) => notional(b) - notional(a))[0];
    if (cfg.autoReduce) {
      out.push({
        kind: "reduce",
        key: "status:MarginCall",
        symbol: largest.symbol,
        fraction: cfg.reduceFraction,
        text: `⚠️ Margin call (equity below initial margin). Cutting ${Math.round(cfg.reduceFraction * 100)}% of your largest position, ${largest.symbol}.`,
      });
    } else {
      out.push({ kind: "alert", key: "status:MarginCall", text: `⚠️ Margin call — equity is below initial margin. Consider reducing ${largest.symbol}.` });
    }
  }

  // 2. Per-position liquidation distance.
  for (const p of positions) {
    const d = liqDistancePct(p);
    if (d !== null && d < cfg.liqWarnPct) {
      out.push({
        kind: "alert",
        key: `liq:${p.symbol}`,
        text: `📉 ${p.symbol} ${p.side} is ${d.toFixed(1)}% from liquidation (mark ${p.markPrice}, liq ≈ ${p.liquidationPrice?.toFixed(2)}).`,
      });
    }
  }

  // 3. Funding flips against you.
  for (const p of positions) {
    const now = funding[p.symbol];
    const before = prevFunding[p.symbol];
    if (now === undefined || before === undefined) continue;
    if (paysFunding(p.side, now) && !paysFunding(p.side, before)) {
      out.push({
        kind: "alert",
        key: `funding:${p.symbol}:${Math.sign(now)}`,
        text: `💸 Funding on ${p.symbol} flipped against your ${p.side}: now ${pct(now)} per 8h (was ${pct(before)}). You are now paying.`,
      });
    }
  }
  return out;
}

function notional(p: UnifiedPosition): number {
  return p.contracts * (p.markPrice ?? p.entryPrice);
}

/** Suppresses repeats of the same alert key within a cooldown window. */
export class Cooldown {
  private last = new Map<string, number>();
  constructor(private readonly ms: number) {}
  allow(key: string, now = Date.now()): boolean {
    const t = this.last.get(key);
    if (t !== undefined && now - t < this.ms) return false;
    this.last.set(key, now);
    return true;
  }
}
