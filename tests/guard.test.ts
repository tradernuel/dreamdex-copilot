import { describe, expect, it } from "vitest";
import type { UnifiedPosition } from "@somnia-chain/markets-sdk";
import { Cooldown, evaluate, liqDistancePct, paysFunding } from "../src/guard.js";
import type { GuardConfig } from "../src/config.js";

const cfg: GuardConfig = { enabled: true, intervalSec: 15, liqWarnPct: 15, autoReduce: true, reduceFraction: 0.25 };
const pos = (o: Partial<UnifiedPosition>): UnifiedPosition =>
  ({ symbol: "ETH/USDSO:USDSO", chainId: 50383, side: "long", contracts: 1, entryPrice: 3000, markPrice: 3000, perpState: "ok", info: {}, ...o }) as UnifiedPosition;
const healthy = { status: "Healthy" as const, ratio: 3, equity: 0n, mmReq: 0n };

describe("guard", () => {
  it("measures liquidation distance", () => {
    expect(liqDistancePct(pos({ markPrice: 3000, liquidationPrice: 2700 }))).toBeCloseTo(10);
    expect(liqDistancePct(pos({ liquidationPrice: undefined }))).toBeNull();
  });
  it("knows who pays funding", () => {
    expect(paysFunding("long", 0.001)).toBe(true);
    expect(paysFunding("short", 0.001)).toBe(false);
    expect(paysFunding("short", -0.001)).toBe(true);
  });
  it("is silent when flat or safe", () => {
    expect(evaluate({ positions: [], health: healthy, funding: {}, prevFunding: {}, cfg })).toEqual([]);
    expect(evaluate({ positions: [pos({ liquidationPrice: 1500 })], health: healthy, funding: {}, prevFunding: {}, cfg })).toEqual([]);
  });
  it("warns near liquidation", () => {
    const a = evaluate({ positions: [pos({ liquidationPrice: 2800 })], health: healthy, funding: {}, prevFunding: {}, cfg });
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe("alert");
  });
  it("reduces the largest position on margin call", () => {
    const a = evaluate({
      positions: [pos({ symbol: "A", contracts: 1 }), pos({ symbol: "B", contracts: 5 })],
      health: { ...healthy, status: "MarginCall" },
      funding: {}, prevFunding: {}, cfg,
    });
    expect(a[0]).toMatchObject({ kind: "reduce", symbol: "B", fraction: 0.25 });
  });
  it("only alerts on margin call when auto-reduce is off", () => {
    const a = evaluate({ positions: [pos({})], health: { ...healthy, status: "MarginCall" }, funding: {}, prevFunding: {}, cfg: { ...cfg, autoReduce: false } });
    expect(a[0].kind).toBe("alert");
  });
  it("flattens on partial liquidation", () => {
    const a = evaluate({ positions: [pos({})], health: { ...healthy, status: "PartialLiquidation" }, funding: {}, prevFunding: {}, cfg });
    expect(a).toEqual([expect.objectContaining({ kind: "closeall" })]);
  });
  it("detects a funding flip against the position", () => {
    const s = "ETH/USDSO:USDSO";
    const a = evaluate({ positions: [pos({ side: "long" })], health: healthy, funding: { [s]: 0.0005 }, prevFunding: { [s]: -0.0002 }, cfg });
    expect(a[0].text).toMatch(/flipped/);
    const none = evaluate({ positions: [pos({ side: "short" })], health: healthy, funding: { [s]: 0.0005 }, prevFunding: { [s]: -0.0002 }, cfg });
    expect(none).toEqual([]);
  });
  it("cooldown suppresses repeats", () => {
    const c = new Cooldown(1000);
    expect(c.allow("x", 0)).toBe(true);
    expect(c.allow("x", 500)).toBe(false);
    expect(c.allow("x", 1500)).toBe(true);
  });
});
