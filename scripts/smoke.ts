// Places a small real market order on Somnia Tokyo testnet, then closes it.
// Usage: npm run smoke -- [asset=eth] [usd=25] [long|short]
import { loadChainConfig } from "../src/config.js";
import { connect } from "../src/exchange.js";
import { closePosition, executeOpen, getHealth, quoteOpen } from "../src/trading.js";

const [asset = "eth", usdRaw = "25", sideRaw = "long"] = process.argv.slice(2);
const side = sideRaw === "short" ? "short" : "long";
const v = await connect(loadChainConfig());
console.log(`account ${v.account}`);
console.log("health before:", (await getHealth(v)).status);

const q = await quoteOpen(v, asset, side, Number(usdRaw));
console.log(`opening ${side} ${q.amount} ${q.symbol} @ ~${q.mark}`);
const open = await executeOpen(v, q, "smoke");
console.log("OPEN ", open.status, "filled", open.filled, "tx", open.txHash);

await new Promise((r) => setTimeout(r, 3000));
const close = await closePosition(v, q.symbol, 1, "smoke");
console.log("CLOSE", close?.status, "filled", close?.filled, "tx", close?.txHash);
console.log("\nBoth orders are recorded in data/trades.jsonl — run `npm run evidence` for the README table.");
await v.ex.close();
