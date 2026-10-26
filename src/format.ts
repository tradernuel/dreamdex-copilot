import { formatUnits } from "viem";
import type { UnifiedPosition } from "@somnia-chain/markets-sdk";
import type { Health } from "./trading.js";
import type { TradeRecord } from "./tradelog.js";

export const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
export const fundingPct = (r?: number) => (r === undefined ? "n/a" : `${(r * 100).toFixed(4)}%/8h`);
export const shortHash = (h?: string) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");

export function fmtPosition(p: UnifiedPosition): string {
  const pnl = p.unrealizedPnl === undefined ? "n/a" : `${p.unrealizedPnl >= 0 ? "🟢 +" : "🔴 "}${usd(p.unrealizedPnl)}`;
  const liq = p.liquidationPrice === undefined ? "n/a" : usd(p.liquidationPrice);
  return [
    `<b>${p.symbol}</b> ${p.side === "long" ? "LONG" : "SHORT"} ${p.contracts}`,
    `  entry ${usd(p.entryPrice)} · mark ${p.markPrice === undefined ? "n/a" : usd(p.markPrice)}`,
    `  uPnL ${pnl} · liq ≈ ${liq}`,
  ].join("\n");
}

export function fmtHealth(h: Health, decimals: number): string {
  const icon = { Healthy: "🟢", MarginCall: "🟠", PartialLiquidation: "🔴", CloseOut: "⛔" }[h.status];
  const equity = Number(formatUnits(h.equity, decimals));
  return `${icon} <b>${h.status}</b>\nEquity ${usd(equity)}\nHealth ${h.ratio === null ? "∞ (flat)" : `${h.ratio.toFixed(2)}x maintenance`}`;
}

export function fmtTrade(t: TradeRecord): string {
  return `${t.action.toUpperCase()} ${t.side} ${t.amount} ${t.symbol} → ${t.status}${t.filled ? ` (filled ${t.filled})` : ""}\ntx <code>${t.txHash ?? "—"}</code>`;
}
