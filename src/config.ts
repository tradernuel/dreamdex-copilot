import "dotenv/config";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name} in .env (see .env.example)`);
  return v;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

export interface ChainConfig {
  privateKey: `0x${string}`;
  indexerUrl: string;
  slippage: number;
  maxOrderUsd: number;
}

export interface GuardConfig {
  enabled: boolean;
  intervalSec: number;
  liqWarnPct: number;
  autoReduce: boolean;
  reduceFraction: number;
}

export interface BotConfig {
  telegramToken: string;
  allowedUserIds: number[];
}

export function loadChainConfig(): ChainConfig {
  const privateKey = required("PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("PRIVATE_KEY must be a 0x-prefixed 32-byte hex key");
  }
  return {
    privateKey: privateKey as `0x${string}`,
    indexerUrl: process.env.INDEXER_URL?.trim() || "https://hideki-dev.smk.somnia.host/v1/graphql",
    slippage: num("SLIPPAGE", 0.01),
    maxOrderUsd: num("MAX_ORDER_USD", 1000),
  };
}

export function loadGuardConfig(): GuardConfig {
  const reduceFraction = num("GUARD_REDUCE_FRACTION", 0.25);
  if (reduceFraction <= 0 || reduceFraction > 1) throw new Error("GUARD_REDUCE_FRACTION must be in (0, 1]");
  return {
    enabled: bool("GUARD_ENABLED", true),
    intervalSec: Math.max(5, num("GUARD_INTERVAL_SEC", 15)),
    liqWarnPct: num("GUARD_LIQ_WARN_PCT", 15),
    autoReduce: bool("GUARD_AUTO_REDUCE", true),
    reduceFraction,
  };
}

export function loadBotConfig(): BotConfig {
  const allowedUserIds = (process.env.ALLOWED_TELEGRAM_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isInteger);
  if (allowedUserIds.length === 0) {
    throw new Error("Set ALLOWED_TELEGRAM_USER_IDS so only you can control the bot (it holds a trading key).");
  }
  return { telegramToken: required("TELEGRAM_BOT_TOKEN"), allowedUserIds };
}
