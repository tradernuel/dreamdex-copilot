import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES, type UnifiedMarket } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import type { ChainConfig } from "./config.js";

/** Everything the bot needs to talk to dreamDEX perps on Somnia Tokyo (Hideki, chain 50383). */
export interface Venue {
  ex: SomniaMarkets;
  account: Address;
  marginBank: Address;
  /** Decimals of the MarginBank collateral (USDso), read off a perp market row. */
  collateralDecimals: number;
  cfg: ChainConfig;
}

export async function connect(cfg: ChainConfig): Promise<Venue> {
  const ex = new SomniaMarkets({
    chain: hidekiTestnet,
    wsRpcUrl: hidekiTestnet.rpcUrls.default.webSocket[0],
    indexerUrl: cfg.indexerUrl,
    addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
    privateKey: cfg.privateKey,
  });
  await ex.loadMarkets();
  const anyPerp = listPerps(ex)[0];
  if (!anyPerp) throw new Error("No tradeable perp markets loaded. Check your network can reach api.hideki2.infra.testnet.somnia.network and the Hideki indexer (INDEXER_URL).");
  return {
    ex,
    account: privateKeyToAccount(cfg.privateKey).address,
    marginBank: SOMNIA_HIDEKI_TESTNET_ADDRESSES.marginBank as Address,
    collateralDecimals: anyPerp.info.quoteDecimals,
    cfg,
  };
}

/** Tradeable perp markets only: deployed AND registered AND not close-only. */
export function listPerps(ex: SomniaMarkets): UnifiedMarket[] {
  return Object.values(ex.markets)
    .filter((m) => (m.type === "swap" || m.info.marketType === "PERP") && m.perpStatus?.tradeable !== false)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** "eth", "ETH", "weth", "ETH/USDSO:USDSO" all resolve to the same perp symbol. */
export function resolvePerp(ex: SomniaMarkets, input: string): UnifiedMarket | undefined {
  const perps = listPerps(ex);
  const q = input.trim().toUpperCase();
  const exact = perps.find((m) => m.symbol.toUpperCase() === q);
  if (exact) return exact;
  const norm = (s: string) => s.toUpperCase().replace(/^W(?=BTC|ETH)/, "").replace(/-?PERP$/, "");
  return perps.find((m) => norm(m.base) === norm(q));
}
