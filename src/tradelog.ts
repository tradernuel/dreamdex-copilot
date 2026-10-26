import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Every order the co-pilot sends is appended here — this file is the build evidence (tx hashes). */
export const TRADE_LOG = resolve(process.cwd(), "data/trades.jsonl");

export interface TradeRecord {
  ts: string;
  source: "telegram" | "guard" | "smoke";
  action: "open" | "close" | "reduce";
  symbol: string;
  side: "buy" | "sell";
  amount: number;
  filled: number;
  price?: number;
  status: string;
  orderId: string;
  txHash?: string;
  note?: string;
}

export function logTrade(rec: Omit<TradeRecord, "ts">): TradeRecord {
  const full: TradeRecord = { ts: new Date().toISOString(), ...rec };
  mkdirSync(dirname(TRADE_LOG), { recursive: true });
  appendFileSync(TRADE_LOG, JSON.stringify(full) + "\n");
  return full;
}

export function readTrades(): TradeRecord[] {
  if (!existsSync(TRADE_LOG)) return [];
  return readFileSync(TRADE_LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as TradeRecord);
}
