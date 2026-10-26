// Repro for feedback/01: CHAINS.md vs the shipped hidekiTestnet chain definition.
// Run: node repro/01-multicall-docs.mjs
import { readFileSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";

const docs = readFileSync("node_modules/@somnia-chain/markets-sdk/docs/CHAINS.md", "utf8");
const line = docs.split("\n").find((l) => l.includes("0x540B"));
console.log("CHAINS.md says:        ", line?.trim());
console.log("hidekiTestnet uses:    ", hidekiTestnet.contracts?.multicall3?.address);

const client = createPublicClient({ chain: hidekiTestnet, transport: http() });
for (const [label, addr] of [
  ["canonical 0xcA11bde0…", "0xcA11bde05977b3631167028862bE2a173976CA11"],
  ["documented 0x540B091b…", null],
]) {
  if (!addr) { console.log(`${label}: full address not given in CHAINS.md (truncated) — see dist/chains/definitions/hidekiTestnet.d.ts`); continue; }
  const code = await client.getCode({ address: addr });
  console.log(`${label}: ${code && code !== "0x" ? `has code (${(code.length - 2) / 2} bytes)` : "NO CODE"}`);
}
