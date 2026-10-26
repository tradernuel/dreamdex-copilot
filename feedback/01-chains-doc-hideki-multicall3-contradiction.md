# CHAINS.md gives a Hideki Multicall3 address that the SDK itself says has no code on Hideki v2

Severity: normal
Area: docs

## Steps to reproduce
1. `npm install @somnia-chain/markets-sdk@0.32.1 viem`
2. Open `node_modules/@somnia-chain/markets-sdk/docs/CHAINS.md`, section "Absences are deliberate".
3. Compare with `docs/reference/networks-and-endpoints.md` and with the shipped chain object `hidekiTestnet` from `@somnia-chain/markets-sdk/chains`.
4. Or run `node repro/01-multicall-docs.mjs` from this repo.

## Expected
All SDK docs agree with the shipped `hidekiTestnet` definition about which Multicall3 address to use on Hideki (chain 50383), since CHAINS.md explicitly tells developers not to copy addresses between networks and viem routes batched reads to whatever Multicall3 address it is given.

## Actual
The three sources contradict each other:

- **CHAINS.md** says Hideki's Multicall3 is the non-canonical `0x540B…D131`, and that the canonical `0xcA11bde0…` is "unreachable for good" on Somnia chains.
- **docs/reference/networks-and-endpoints.md** says Hideki uses the canonical `0xcA11bde05977b3631167028862bE2a173976CA11` ("v2 predeploys it").
- **The shipped code** (`hidekiTestnet.contracts.multicall3.address`) is `0xcA11bde05977b3631167028862bE2a173976CA11`, and its TSDoc in `dist/chains/definitions/hidekiTestnet.d.ts` states that `0x540B091b…` holds **no code** on v2.

A developer who builds a viem chain by hand from CHAINS.md (the page that lists the per-network Multicall3 addresses) gets an address with no code, which, per CHAINS.md's own warning, turns every batched read into a failure.

## Evidence
- `docs/CHAINS.md` line 64: lists `0x540B…D131` for Hideki; following paragraph says `0xcA11bde0…` is unreachable.
- `docs/reference/networks-and-endpoints.md` line 32: Hideki Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`.
- `dist/chains/definitions/hidekiTestnet.d.ts` lines 33–34: "`0x540B091b…` holds NO code on v2".
- `repro/01-multicall-docs.mjs` prints the doc line, the shipped address, and `eth_getCode` for the canonical address on Hideki.

Suggested fix: update CHAINS.md's Hideki row and paragraph to the v2 canonical address (and note the v1 → v2 change, as MIGRATING.md already does).

## Environment
SDK version: @somnia-chain/markets-sdk 0.32.1
Network: Somnia Tokyo testnet (Hideki, chain 50383)
Wallet address: <YOUR_WALLET_ADDRESS>
