import { describe, expect, it } from "vitest";
import { parseIntent } from "../src/parser.js";

describe("parseIntent", () => {
  it("parses a plain long", () => {
    expect(parseIntent("long eth 100")).toEqual({
      ok: true,
      intent: { kind: "open", side: "long", asset: "eth", marginUsd: 100, leverage: 1, notionalUsd: 100 },
    });
  });
  it("parses $ amounts and leverage", () => {
    const r = parseIntent("/short BTC $250 3x");
    expect(r.ok && r.intent).toMatchObject({ kind: "open", side: "short", asset: "btc", notionalUsd: 750, leverage: 3 });
  });
  it("accepts buy/sell aliases", () => {
    const r = parseIntent("sell sol 20");
    expect(r.ok && r.intent).toMatchObject({ side: "short" });
  });
  it("rejects bad amounts and leverage", () => {
    expect(parseIntent("long eth abc").ok).toBe(false);
    expect(parseIntent("long eth -5").ok).toBe(false);
    expect(parseIntent("long eth 10 0x").ok).toBe(false);
    expect(parseIntent("long eth 10 500x").ok).toBe(false);
  });
  it("parses closes", () => {
    expect(parseIntent("close eth")).toEqual({ ok: true, intent: { kind: "close", asset: "eth", fraction: 1 } });
    expect(parseIntent("close eth 25%")).toEqual({ ok: true, intent: { kind: "close", asset: "eth", fraction: 0.25 } });
    expect(parseIntent("close all")).toEqual({ ok: true, intent: { kind: "closeall" } });
    expect(parseIntent("close eth 150%").ok).toBe(false);
  });
  it("rejects unknown verbs", () => {
    expect(parseIntent("moon eth").ok).toBe(false);
  });
});
