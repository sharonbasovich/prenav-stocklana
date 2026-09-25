import { staticSource } from "./staticSource";

export interface TokenRow {
  symbol: string;
  name: string;
  description?: string;
  image?: string;
  externalUrl?: string;
  mint: string;
  mark: number | null;
  dex: number | null;
  premiumPct: number | null;
  liquidityUsd: number | null;
  vol24hUsd: number | null;
  holders: number | null;
  launchDate: string | null;
  implVal: number | null;
  markVal: number | null;
  supply: number | null;
  priceChange24h?: number | null;
}

export interface SafetyFlag {
  key: string;
  severity: "high" | "medium" | "low" | "info" | string;
  explain: string;
}

export interface Safety {
  program: string;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  transferFeeBps: number | null;
  pendingFeeBps: number | null;
  withheld: number | null;
  permanentDelegate: string | null;
  transferHook: string | null;
  transferHookAuthority: string | null;
  scaledUiMultiplier: number;
  pendingScaledUiMultiplier: number | null;
  confidential: boolean;
  pausable: boolean;
  paused: boolean;
  defaultAccountState: string | null;
  flags: SafetyFlag[];
}

export interface Pool {
  dex: string;
  pair: string;
  url?: string;
  priceUsd: number | null;
  liqUsd: number | null;
  vol24h: number | null;
  devFromMidPct: number | null;
}

export interface PythPrice {
  price: number;
  publishTime: number;
  premiumPct: number;
}

export interface TokenDetail extends TokenRow {
  safety: Safety | null;
  pools: Pool[];
  dispersionPct: number;
  pyth?: PythPrice;
}

export interface PremiumPoint {
  ts: number;
  mark: number | null;
  dex: number | null;
  premiumPct: number | null;
}

export interface History {
  premium: PremiumPoint[];
  volumeDaily: { date: string; value: number }[];
  holdersWeekly: { week: string; value: number }[];
}

export interface Position {
  symbol: string;
  name: string;
  image?: string;
  mint: string;
  units: number;
  dex: number | null;
  mark: number | null;
  marketValue: number | null;
  navValue: number | null;
  premiumExposureUsd: number | null;
  premiumPct: number | null;
  exitFeeUsd: number | null;
  exitFeeBps: number;
  poolDepthUsd: number | null;
  exitWarning: boolean;
}

export interface Portfolio {
  address: string;
  positions: Position[];
  totals: {
    marketValue: number;
    navValue: number;
    premiumExposureUsd: number;
    exitFeeUsd: number;
    premiumPct: number | null;
  };
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

// VITE_STATIC_MODE=1 builds a backend-free bundle: data comes from the
// bundled snapshot (public/data/snapshot.json) plus browser-direct calls to
// keyless CORS-open APIs (Jupiter, DexScreener, Solana mainnet RPC).
const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === "1";

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(`${BASE}${path}`);
  if (!resp.ok) {
    let detail = `${resp.status}`;
    try {
      const body = await resp.json();
      detail = body.detail ?? detail;
    } catch {
      /* keep status as detail */
    }
    throw new Error(detail);
  }
  return resp.json() as Promise<T>;
}

const remoteApi = {
  tokens: () => get<TokenRow[]>("/api/tokens"),
  token: (symbol: string) => get<TokenDetail>(`/api/tokens/${symbol}`),
  history: (symbol: string) => get<History>(`/api/tokens/${symbol}/history`),
  portfolio: (address: string) => get<Portfolio>(`/api/portfolio/${address}`),
};

export const api: typeof remoteApi = STATIC_MODE ? staticSource : remoteApi;
