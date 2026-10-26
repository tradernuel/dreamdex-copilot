// Read-only: lists tradeable perps with mark and funding. No Telegram needed.
import { loadChainConfig } from "../src/config.js";
import { connect, listPerps } from "../src/exchange.js";
import { fundingPct, usd } from "../src/format.js";

const v = await connect(loadChainConfig());
console.log(`account ${v.account}\n`);
for (const m of listPerps(v.ex)) {
  const t = await v.ex.fetchTicker(m.symbol).catch(() => undefined);
  console.log(`${m.symbol.padEnd(22)} ${t?.markPrice !== undefined ? usd(t.markPrice).padStart(14) : "no mark".padStart(14)}  ${fundingPct(t?.fundingRate)}  min ${m.limits.amount.min ?? "?"}`);
}
await v.ex.close();
