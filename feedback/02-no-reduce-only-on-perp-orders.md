# Perp limit/market orders have no reduce-only flag, so "close position" can open the opposite side

Severity: normal
Area: SDK

## Steps to reproduce
1. `npm install @somnia-chain/markets-sdk@0.32.1 viem`
2. Inspect the options accepted by `SomniaMarkets.createOrder` (`CreateOrderParams` in `dist/unified/exchange.d.ts`) and by `Trader.placePerpOrder` (`PlacePerpOrderParams` in `dist/trade.d.ts`). Or run `node repro/02-no-reduce-only.mjs`.
3. Open a perp position, e.g. `exchange.createOrder("ETH/USDSO:USDSO", "market", "buy", q)`.
4. Close it the only way available: `exchange.fetchPositions()` then a market order on the opposite side for `contracts`.
5. Let the position change between step 4's read and the send (a partial liquidation, the guard of another process, or a second client closing part of it), or send the close twice.

## Expected
A `reduceOnly` option on perp orders (ccxt's standard `params.reduceOnly`, which the exchange API otherwise mirrors), so a close order can never increase or flip a position: the excess is cancelled instead of opening exposure.

## Actual
Neither `CreateOrderParams` (`timeInForce`, `postOnly`, `slippage`, `builder`, `builderFeeBpsTimes1k`, `funding`) nor `PlacePerpOrderParams` (`pool`, `isBid`, `price`, `quantity`, `expireTimestampNs`, `orderType`, `selfMatchingOption`, `builder`, `builderFeeBpsTimes1k`, `gas`) has a reduce-only option. Reduce-only exists only for stop orders (`PerpStopIntent = "reduceOnly" | "opening"`).

So every bot or UI "Close" button must size the close from a separate position read. If the position shrank in between, or the close is sent twice (e.g. a retry after `TransactionOutcomeUnknownError`, which the SDK explicitly tells callers may have landed), the order opens a new position on the opposite side and locks fresh margin, which is the opposite of what a close/risk-reduction action should ever do.

## Evidence
- `dist/unified/exchange.d.ts`: `export interface CreateOrderParams` has no reduce-only field.
- `dist/trade.d.ts`: `export interface PlacePerpOrderParams` has no reduce-only field.
- `dist/trade.d.ts`: `PerpStopIntent = "reduceOnly" | "opening"` shows the concept exists for stops only.
- Output of `repro/02-no-reduce-only.mjs`.

## Environment
SDK version: @somnia-chain/markets-sdk 0.32.1
Network: Somnia Tokyo testnet (Hideki, chain 50383)
Wallet address: <YOUR_WALLET_ADDRESS>
