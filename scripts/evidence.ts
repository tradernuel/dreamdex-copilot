// Prints the trade log as a Markdown table for the README "Evidence" section.
import { readTrades } from "../src/tradelog.js";

const rows = readTrades();
if (rows.length === 0) {
  console.log("No trades logged yet — run `npm run smoke` or trade from Telegram first.");
  process.exit(0);
}
console.log("| Time (UTC) | Source | Action | Market | Side | Size | Status | Tx hash |");
console.log("|---|---|---|---|---|---|---|---|");
for (const t of rows) {
  console.log(`| ${t.ts.replace("T", " ").slice(0, 19)} | ${t.source} | ${t.action} | ${t.symbol} | ${t.side} | ${t.amount} | ${t.status} | \`${t.txHash ?? "—"}\` |`);
}
