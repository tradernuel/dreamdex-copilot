# dreamDEX Perps Co-pilot 🤖🛡

**Trade dreamDEX perps from Telegram, with a risk guard that watches your back 24/7.**

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io) on **Somnia Tokyo testnet** (Hideki, chain 50383) with the official Somnia Markets SDK (`@somnia-chain/markets-sdk` 0.32.1).

## What it does

Perps traders lose money in two boring ways: they're away from the screen when a position drifts toward liquidation, and they keep paying funding long after it flipped against them. The co-pilot fixes both, from the chat app traders already live in.

- **Trade in plain words.** `long eth 100`, `short btc 50 3x`, `close eth 50%`. Every order shows size, mark, slippage cap and whether you'd pay funding, then waits for a ✅ tap.
- **Always-on risk guard.** Every 15 s it reads your positions and cross-margin health on-chain and:
  - alerts when any position is within 15% of its liquidation price,
  - on **Margin Call** automatically cuts 25% of your largest position,
  - on **Partial Liquidation / Close-Out** flattens everything before the liquidation waterfall eats more,
  - alerts when **funding flips** against a position you hold.
- **Live funding push.** Subscribes to the MarginBank's `FundingSettled` event for your wallet, so you hear "Paid $1.20 funding on ETH" the moment it settles, not when you next open the app.
- **Evidence by default.** Every order (yours or the guard's) is appended to `data/trades.jsonl` with its tx hash.

All thresholds are configurable in `.env`.

## Who it's for

- Traders who want perps exposure without watching a chart all day.
- Anyone running positions on the Perps Arena who has been liquidated while asleep.
- Builders who want a small, readable reference for the SDK's perps write and risk-read paths.

## How to run

Requirements: Node 20+, a Telegram account, and a Somnia Tokyo testnet wallet with USDso in the MarginBank (join the Perps Arena on app.testnet.dreamdex.io for weekly paper USDso) plus a little STT for gas.

```bash
git clone https://github.com/tradernuel/dreamdex-copilot.git
cd dreamdex-copilot
npm install
cp .env.example .env    # then fill it in
```

In `.env`:

1. `TELEGRAM_BOT_TOKEN`: create a bot with [@BotFather](https://t.me/BotFather).
2. `PRIVATE_KEY`: your testnet wallet's key. It stays on your machine; `.env` is git-ignored.
3. `ALLOWED_TELEGRAM_USER_IDS`: your numeric Telegram ID (ask [@userinfobot](https://t.me/userinfobot)). The bot ignores everyone else.

Then:

```bash
npm run markets    # read-only: list perps, marks, funding (checks your connection)
npm run smoke      # places a real ~$25 ETH long and closes it, prints both tx hashes
npm start          # starts the Telegram co-pilot
```

Open your bot in Telegram and send `/help`.

### Commands

| Message | Does |
|---|---|
| `long eth 100` / `short btc 50 3x` | Market order for $100 notional / $50 × 3x; confirm with a button |
| `close eth` / `close eth 50%` | Close all or part of a position |
| `/closeall` | Flatten everything (with confirm) |
| `/positions` | Size, entry, mark, uPnL, liquidation price |
| `/health` | Margin status, equity, health vs maintenance |
| `/markets` · `/price eth` | Marks and funding |
| `/guard on\|off` | Toggle the risk guard |
| `/log` | Last 5 orders with tx hashes |

## How it works

```
Telegram ──► grammY bot ──► parser (pure, tested) ──► trading.ts ──► SomniaMarkets (SDK)
                                                                      │  createOrder / fetchPositions
                    guard loop (15 s) ◄── getAccountHealth ◄──────────┤  fetchTicker / fetchFundingRate
                    evaluate() (pure, tested)                         │
                    └─► alert / reduce / flatten                      │
                    funding push ◄── viem.watchEvent(FundingSettled) ◄┘  (MarginBank, Hideki WS)
```

- `src/exchange.ts`: connects to Hideki with `hidekiTestnet`, `SOMNIA_HIDEKI_TESTNET_ADDRESSES` and the Hideki indexer; lists only **tradeable** perps (registered and not close-only).
- `src/trading.ts`: converts a USD notional to an on-grid size at the live mark, sends market orders with a slippage cap, and sizes closes from a fresh on-chain position read (the SDK has no reduce-only flag; see `feedback/02`).
- `src/guard.ts`: the guard's decision logic as a pure function, fully unit-tested.
- `src/bot.ts`: Telegram UX, confirmations, guard runner, funding event stream.

```bash
npm test         # parser + guard unit tests
npm run typecheck
```

## Evidence (Somnia Tokyo testnet)

Wallet: `<YOUR_WALLET_ADDRESS>`

<!-- Paste the output of `npm run evidence` here -->

| Time (UTC) | Source | Action | Market | Side | Size | Status | Tx hash |
|---|---|---|---|---|---|---|---|
| _pending first run_ | | | | | | | |

Demo video: _link_

## X posts

- _link to post 1 (tags @DreamDEXSomnia)_
- _link to post 2_
- _link to post 3_

## Feedback track

SDK/docs issues found while building are in [`feedback/`](./feedback), one file per issue, with runnable repros in [`repro/`](./repro).

## Roadmap

- Move the guard's trigger on-chain with **Somnia Reactivity** so protection runs even when this process is offline.
- Pre-trade liquidation preview using `client.previewPerpLiquidationPrice`.
- Optional TP/SL attached at entry via the perp stop-order registry.
- Multi-user hosted mode with per-user linked bot keys.

## Safety

Testnet only. The bot holds a trading key, so run it on a machine you trust, keep `ALLOWED_TELEGRAM_USER_IDS` set, and keep `MAX_ORDER_USD` sensible. Not financial advice.

## License

MIT
