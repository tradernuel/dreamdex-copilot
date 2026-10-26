// Repro for feedback/02: no reduce-only flag on perp limit/market orders.
// Run: node repro/02-no-reduce-only.mjs
import { readFileSync } from "node:fs";
const base = "node_modules/@somnia-chain/markets-sdk/dist";
const pick = (file, start) => {
  const src = readFileSync(`${base}/${file}`, "utf8");
  const i = src.indexOf(start);
  return src.slice(i, src.indexOf("\n}", i) + 2);
};
const createOrderParams = pick("unified/exchange.d.ts", "export interface CreateOrderParams");
const placePerpOrderParams = pick("trade.d.ts", "export interface PlacePerpOrderParams");
const fields = (s) => [...s.matchAll(/^\s{4}(\w+)\??:/gm)].map((m) => m[1]);
console.log("CreateOrderParams fields:   ", fields(createOrderParams).join(", "));
console.log("PlacePerpOrderParams fields:", fields(placePerpOrderParams).join(", "));
console.log("reduceOnly present?        ", /reduceOnly/i.test(createOrderParams + placePerpOrderParams));
console.log("(reduce-only exists only for stop orders: PerpStopIntent = \"reduceOnly\" | \"opening\")");
