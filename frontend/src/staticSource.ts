/**
 * Static-mode data source: serves the full product from a bundled snapshot
 * (public/data/snapshot.json) plus keyless CORS-open APIs called directly from
 * the browser (Jupiter, DexScreener, Solana mainnet RPC). No backend needed.
 */

import type {
  History,
  Pool,
  Portfolio,
  Position,
  PremiumPoint,
  Safety,
  SafetyFlag,
  TokenDetail,
  TokenRow,
} from "./api";

// Keyless public RPCs, tried in order on retry; mainnet.solana.com currently
// serves getTokenAccountsByOwner while the -beta host 403s it.
const RPC_URLS = [
  "https://api.mainnet.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
];
const JUP = "https://lite-api.jup.ag";
const DEXS = "https://api.dexscreener.com/latest/dex";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface Snapshot {
  generatedAt: number;
  tokens: Record<string, unknown>[];
  stats: {
    volume?: Record<string, unknown>[];
    holders?: Record<string, unknown>[];
    launchDates?: Record<string, string>;
  };
  premium: Record<string, PremiumPoint[]>;
}

// Fallback mint table (same as backend config) if the snapshot is missing.
const FALLBACK_TOKENS: Record<string, unknown>[] = [
  ["ANDURIL", "Anduril PreStocks", "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB"],
  ["ANTHROPIC", "Anthropic PreStocks", "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw"],
  ["FIGUREAI", "Figure AI PreStocks", "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd"],
  ["KALSHI", "Kalshi PreStocks", "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua"],
  ["NEURALINK", "Neuralink PreStocks", "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S"],
  ["OPENAI", "OpenAI PreStocks", "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF"],
  ["POLYMARKET", "Polymarket PreStocks", "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP"],
  ["SPACEX", "SpaceX PreStocks", "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh"],
].map(([symbol, name, contract_address]) => ({ symbol, name, contract_address }));

let _snapshot: Promise<Snapshot> | null = null;
function snapshot(): Promise<Snapshot> {
  if (!_snapshot) {
    _snapshot = fetch(`${import.meta.env.BASE_URL}data/snapshot.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no snapshot"))))
      .catch(() => ({
        generatedAt: 0,
        tokens: FALLBACK_TOKENS,
        stats: {},
        premium: {},
      }));
  }
  return _snapshot;
}

async function getJson<T>(url: string, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url);
      if (resp.status === 429 || resp.status >= 500) throw new Error(`HTTP ${resp.status}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as T;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

async function rpc<T>(method: string, params: unknown[], retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    const url = RPC_URLS[Math.min(i, RPC_URLS.length - 1)];
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (resp.status === 429 || resp.status >= 500) throw new Error(`HTTP ${resp.status}`);
      const body = await resp.json();
      if (body.error) throw new Error(`rpc ${body.error.code}`);
      return body.result as T;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(s: string): Uint8Array | null {
  if (!s || s.length > 44) return null;
  let num = 0n;
  for (const ch of s) {
    const idx = B58.indexOf(ch);
    if (idx < 0) return null;
    num = num * 58n + BigInt(idx);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const pad = s.length - s.replace(/^1+/, "").length;
  const out = new Uint8Array(pad + bytes.length);
  out.set(bytes, pad);
  return out;
}
export function validAddress(s: string): boolean {
  const d = decodeBase58(s);
  return d !== null && d.length === 32;
}

function encodeBase58(bytes: Uint8Array): string {
  let z = 0;
  while (z < bytes.length && bytes[z] === 0) z++;
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  let out = "";
  while (num > 0n) {
    out = B58[Number(num % 58n)] + out;
    num /= 58n;
  }
  return "1".repeat(z) + (out || (z ? "" : ""));
}

// --- ed25519 point-on-curve check (for PDA derivation), pure bigint ---
const ED_P = 2n ** 255n - 19n;
const ED_D = BigInt("37095705934669439343138083508754565189542113879843219016388785533085940283555");
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return r;
}
function isOnEd25519Curve(bytes: Uint8Array): boolean {
  const yBytes = new Uint8Array(bytes);
  yBytes[31] &= 0x7f; // clear sign bit
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = y * 256n + BigInt(yBytes[i]);
  if (y >= ED_P) return false;
  const y2 = (y * y) % ED_P;
  // x^2 = (y^2 - 1) / (d*y^2 + 1) mod p
  const num = (y2 - 1n + ED_P) % ED_P;
  const den = modPow((ED_D * y2 + 1n) % ED_P, ED_P - 2n, ED_P);
  const x2 = (num * den) % ED_P;
  // check x2 is a quadratic residue: x2^((p-1)/2) == 1, or x2 == 0
  if (x2 === 0n) return true;
  return modPow(x2, (ED_P - 1n) / 2n, ED_P) === 1n;
}

const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");

async function createProgramAddress(
  seeds: Uint8Array[],
  programId: Uint8Array,
): Promise<Uint8Array | null> {
  const total = seeds.reduce((n, s) => n + s.length, 0) + programId.length + PDA_MARKER.length;
  const buf = new Uint8Array(total);
  let off = 0;
  for (const s of seeds) {
    buf.set(s, off);
    off += s.length;
  }
  buf.set(programId, off);
  off += programId.length;
  buf.set(PDA_MARKER, off);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  return isOnEd25519Curve(hash) ? null : hash;
}

async function findATA(owner: Uint8Array, tokenProgram: Uint8Array, mint: Uint8Array): Promise<string | null> {
  const prog = decodeBase58(ATA_PROGRAM)!;
  for (let bump = 255; bump >= 0; bump--) {
    const seeds = [owner, tokenProgram, mint, new Uint8Array([bump])];
    const addr = await createProgramAddress(seeds, prog);
    if (addr) return encodeBase58(addr);
  }
  return null;
}

const f = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function statsMap(stats: Snapshot["stats"]): Record<string, { holders?: number; launchDate?: string }> {
  const out: Record<string, { holders?: number; launchDate?: string }> = {};
  const holders = stats.holders ?? [];
  if (holders.length) {
    const last = holders[holders.length - 1];
    for (const [k, v] of Object.entries(last)) {
      if (k !== "week") out[k] = { ...(out[k] ?? {}), holders: Number(v) };
    }
  }
  for (const [k, v] of Object.entries(stats.launchDates ?? {})) {
    out[k] = { ...(out[k] ?? {}), launchDate: v };
  }
  return out;
}

type JupEntry = {
  usdPrice?: number;
  liquidity?: number;
  priceChange24h?: number;
  stockData?: { price?: number };
};

function tokenRow(
  item: Record<string, unknown>,
  pe: JupEntry | undefined,
  pairs: Record<string, unknown>[],
  sm: { holders?: number; launchDate?: string } | undefined,
): TokenRow {
  const mark = f(item.markPrice) ?? f(pe?.stockData?.price);
  const dex = f(pe?.usdPrice) ?? f(item.tokenPrice);
  const vol24 =
    pairs.reduce((acc, p) => acc + (f((p.volume as Record<string, unknown>)?.h24) ?? 0), 0) || null;
  return {
    symbol: String(item.symbol ?? ""),
    name: String(item.name ?? item.symbol ?? ""),
    description: item.description as string | undefined,
    image: item.image as string | undefined,
    externalUrl: item.external_url as string | undefined,
    mint: String(item.contract_address ?? ""),
    mark,
    dex,
    premiumPct: dex && mark ? (dex / mark - 1) * 100 : null,
    liquidityUsd: f(pe?.liquidity),
    vol24hUsd: vol24,
    holders: sm?.holders ?? null,
    launchDate: sm?.launchDate ?? null,
    implVal: f(item.impliedValuation),
    markVal: f(item.markValuation),
    supply: f(item.supply),
    priceChange24h: f(pe?.priceChange24h),
  };
}

type DexPair = {
  dexId?: string;
  pairAddress?: string;
  url?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  baseToken?: { address?: string };
};

let _prices: { at: number; data: Record<string, JupEntry> } | null = null;
async function jupPrices(mints: string[]): Promise<Record<string, JupEntry>> {
  if (_prices && Date.now() - _prices.at < 60_000) return _prices.data;
  const data = await getJson<Record<string, JupEntry>>(`${JUP}/price/v3?ids=${mints.join(",")}`);
  _prices = { at: Date.now(), data };
  return data;
}

let _pairs: { at: number; data: Record<string, DexPair[]> } | null = null;
async function dexPairs(mints: string[]): Promise<Record<string, DexPair[]>> {
  if (_pairs && Date.now() - _pairs.at < 300_000) return _pairs.data;
  const resp = await getJson<{ pairs?: DexPair[] }>(`${DEXS}/tokens/${mints.join(",")}`);
  const out: Record<string, DexPair[]> = Object.fromEntries(mints.map((m) => [m, []]));
  for (const p of resp.pairs ?? []) {
    const base = p.baseToken?.address;
    if (base && base in out) out[base].push(p);
  }
  _pairs = { at: Date.now(), data: out };
  return out;
}

function poolRows(pairs: DexPair[], multiplier: number): { pools: Pool[]; dispersionPct: number } {
  const usable = pairs.filter((p) => f(p.priceUsd) !== null && (f(p.liquidity?.usd) ?? 0) >= 1000);
  if (!usable.length) return { pools: [], dispersionPct: 0 };
  const prices = usable.map((p) => f(p.priceUsd)!).sort((a, b) => a - b);
  const mid = prices[Math.floor(prices.length / 2)];
  const dispersion = mid ? ((prices[prices.length - 1] - prices[0]) / mid) * 100 : 0;
  usable.sort((a, b) => (f(b.liquidity?.usd) ?? 0) - (f(a.liquidity?.usd) ?? 0));
  return {
    pools: usable.slice(0, 15).map((p) => {
      const raw = f(p.priceUsd);
      return {
        dex: p.dexId ?? "?",
        pair: p.pairAddress ?? "",
        url: p.url,
        priceUsd: raw !== null ? raw / multiplier : null,
        liqUsd: f(p.liquidity?.usd),
        vol24h: f(p.volume?.h24),
        devFromMidPct: raw !== null && mid ? (raw / mid - 1) * 100 : null,
      };
    }),
    dispersionPct: dispersion,
  };
}

// ---- Token-2022 safety decode (port of backend token2022.py) ---------------

type Ext = { extension: string; state: Record<string, unknown> };
const ext = (exts: Ext[], name: string): Record<string, unknown> | null =>
  exts.find((e) => e.extension === name)?.state ?? null;

function currentMultiplier(scaled: Record<string, unknown> | null, now: number): number {
  if (!scaled) return 1;
  const eff = Number(scaled.newMultiplierEffectiveTimestamp);
  const newMult = Number(scaled.newMultiplier);
  if (Number.isFinite(eff) && Number.isFinite(newMult) && eff <= now) return newMult;
  return Number(scaled.multiplier ?? 1) || 1;
}

function decodeSafety(
  accountValue: Record<string, unknown>,
  epoch: number | null,
  nowSec: number,
): Safety {
  const data = (accountValue.data ?? {}) as { program?: string; parsed?: { info?: Record<string, unknown> } };
  const info = (data.parsed?.info ?? {}) as Record<string, unknown>;
  const exts = (info.extensions ?? []) as Ext[];
  const feeCfg = ext(exts, "transferFeeConfig") ?? {};
  const delegate = ext(exts, "permanentDelegate");
  const hook = ext(exts, "transferHook");
  const scaled = ext(exts, "scaledUiAmountConfig");
  const conf = ext(exts, "confidentialTransferMint");
  const pausable = ext(exts, "pausableConfig");
  const defaultState = ext(exts, "defaultAccountState");

  const newer = (feeCfg.newerTransferFee ?? {}) as { epoch?: number; transferFeeBasisPoints?: number };
  const older = (feeCfg.olderTransferFee ?? {}) as { epoch?: number; transferFeeBasisPoints?: number };
  let feeBps: number | null;
  let pendingBps: number | null = null;
  if (epoch !== null && newer.epoch !== undefined && epoch < newer.epoch) {
    feeBps = older.transferFeeBasisPoints ?? null;
    pendingBps = newer.transferFeeBasisPoints ?? null;
  } else {
    feeBps = newer.transferFeeBasisPoints ?? null;
  }
  const decimals = Number(info.decimals ?? 0);
  const mult = currentMultiplier(scaled, nowSec);
  const mintAuth = (info.mintAuthority as string) ?? null;
  const freezeAuth = (info.freezeAuthority as string) ?? null;
  const withheldRaw = Number(feeCfg.withheldAmount ?? 0);
  const paused = Boolean(pausable?.paused);

  const flags: SafetyFlag[] = [];
  if (delegate?.delegate) {
    flags.push({
      key: "permanent_delegate",
      severity: "high",
      explain:
        "A permanent delegate is set: the issuer can move or burn tokens out of any wallet without the owner's approval.",
    });
  }
  if (freezeAuth) {
    flags.push({
      key: "freeze_authority",
      severity: "high",
      explain:
        "Freeze authority is active: the issuer can freeze your token account at any time, blocking transfers.",
    });
  }
  if (feeBps !== null && feeBps >= 50) {
    flags.push({
      key: "transfer_fee",
      severity: "medium",
      explain: `Every transfer pays a ${(feeBps / 100).toFixed(2)}% fee to the issuer (withheld at the token account).`,
    });
  }
  if (mintAuth) {
    flags.push({
      key: "mint_authority",
      severity: "medium",
      explain: "Mint authority is active: the issuer can mint unlimited new tokens (supply is not fixed).",
    });
  }
  if (pausable !== null) {
    flags.push({
      key: "pausable",
      severity: "medium",
      explain: paused
        ? "Transfers are currently PAUSED globally by the issuer."
        : "Token is pausable: the issuer can halt all transfers globally.",
    });
  }
  if (hook !== null) {
    flags.push({
      key: "transfer_hook",
      severity: "low",
      explain: hook.programId
        ? "A transfer hook is configured: every transfer invokes a custom program that can reject or act on transfers."
        : "A transfer-hook slot is configured but no hook program is set yet (can be enabled later by the issuer).",
    });
  }
  if (scaled && mult !== 1) {
    flags.push({
      key: "scaled_ui",
      severity: "low",
      explain: `Amounts are scaled ${mult}x for display (scaled-UI extension): raw on-chain amounts differ from what wallets show.`,
    });
  }
  if (conf !== null) {
    flags.push({
      key: "confidential",
      severity: "info",
      explain: "Confidential transfers are enabled on the mint (balances can be encrypted at the account level).",
    });
  }

  return {
    program: data.program ?? "?",
    decimals,
    mintAuthority: mintAuth,
    freezeAuthority: freezeAuth,
    transferFeeBps: feeBps,
    pendingFeeBps: pendingBps,
    withheld: decimals ? (withheldRaw / 10 ** decimals) * mult : 0,
    permanentDelegate: (delegate?.delegate as string) ?? null,
    transferHook: (hook?.programId as string) ?? null,
    transferHookAuthority: (hook?.authority as string) ?? null,
    scaledUiMultiplier: mult,
    pendingScaledUiMultiplier:
      scaled && Number(scaled.newMultiplier) !== mult ? Number(scaled.newMultiplier) : null,
    confidential: conf !== null,
    pausable: pausable !== null,
    paused,
    defaultAccountState: (defaultState?.accountState as string) ?? null,
    flags,
  };
}

const _mintCache = new Map<string, { at: number; value: Record<string, unknown> | null }>();
async function mintAccount(mint: string): Promise<Record<string, unknown> | null> {
  const hit = _mintCache.get(mint);
  if (hit && Date.now() - hit.at < 600_000) return hit.value;
  try {
    const result = await rpc<{ value: Record<string, unknown> | null }>("getAccountInfo", [
      mint,
      { encoding: "jsonParsed" },
    ]);
    _mintCache.set(mint, { at: Date.now(), value: result?.value ?? null });
    return result?.value ?? null;
  } catch {
    return hit?.value ?? null;
  }
}

async function epochNow(): Promise<number | null> {
  try {
    const info = await rpc<{ epoch: number }>("getEpochInfo", []);
    return info?.epoch ?? null;
  } catch {
    return null;
  }
}

// ------------------------------ public surface -----------------------------

export const staticSource = {
  async tokens(): Promise<TokenRow[]> {
    const snap = await snapshot();
    const items = snap.tokens.length ? snap.tokens : FALLBACK_TOKENS;
    const mints = items.map((i) => String(i.contract_address ?? "")).filter(Boolean);
    const [prices, pairs] = await Promise.all([
      jupPrices(mints).catch(() => ({}) as Record<string, JupEntry>),
      dexPairs(mints).catch(() => ({} as Record<string, DexPair[]>)),
    ]);
    const sm = statsMap(snap.stats);
    return items.map((i) =>
      tokenRow(i, prices[String(i.contract_address)], pairs[String(i.contract_address)] ?? [], sm[String(i.symbol)]),
    );
  },

  async token(symbol: string): Promise<TokenDetail> {
    const sym = symbol.toUpperCase();
    const snap = await snapshot();
    const items = snap.tokens.length ? snap.tokens : FALLBACK_TOKENS;
    const item = items.find((i) => String(i.symbol ?? "").toUpperCase() === sym);
    if (!item) throw new Error("unknown token");
    const mint = String(item.contract_address ?? "");
    const [prices, pairsMap, acct, epoch] = await Promise.all([
      jupPrices([mint]).catch(() => ({}) as Record<string, JupEntry>),
      dexPairs([mint]).catch(() => ({ [mint]: [] }) as Record<string, DexPair[]>),
      mintAccount(mint),
      epochNow(),
    ]);
    const nowSec = Math.floor(Date.now() / 1000);
    const scaledCfg = acct
      ? (ext(
          (((acct.data as Record<string, unknown>)?.parsed as { info?: { extensions?: Ext[] } })?.info
            ?.extensions ?? []) as Ext[],
          "scaledUiAmountConfig",
        ) ?? null)
      : null;
    const mult = scaledCfg ? currentMultiplier(scaledCfg, nowSec) : 1;
    const { pools, dispersionPct } = poolRows(pairsMap[mint] ?? [], mult);
    const sm = statsMap(snap.stats)[sym];
    const row = tokenRow(item, prices[mint], pairsMap[mint] ?? [], sm) as TokenDetail;
    row.safety = acct ? decodeSafety(acct, epoch, nowSec) : null;
    row.pools = pools;
    row.dispersionPct = dispersionPct;
    return row;
  },

  async history(symbol: string): Promise<History> {
    const sym = symbol.toUpperCase();
    const snap = await snapshot();
    const premium = [...(snap.premium[sym] ?? [])];
    // Append a live sample point computed from fresh prices.
    try {
      const items = snap.tokens.length ? snap.tokens : FALLBACK_TOKENS;
      const item = items.find((i) => String(i.symbol ?? "").toUpperCase() === sym);
      const mint = String(item?.contract_address ?? "");
      if (mint) {
        const prices = await jupPrices([mint]);
        const mark = f(item?.markPrice) ?? f(prices[mint]?.stockData?.price);
        const dex = f(prices[mint]?.usdPrice);
        if (mark && dex) {
          const last = premium[premium.length - 1];
          const now = Math.floor(Date.now() / 1000);
          if (!last || now - last.ts > 60) {
            premium.push({ ts: now, mark, dex, premiumPct: (dex / mark - 1) * 100 });
          }
        }
      }
    } catch {
      /* snapshot-only */
    }
    const vol = snap.stats.volume ?? [];
    const hold = snap.stats.holders ?? [];
    return {
      premium,
      volumeDaily: vol
        .filter((r) => sym in r)
        .map((r) => ({ date: String(r.date), value: Number(r[sym]) })),
      holdersWeekly: hold
        .filter((r) => sym in r)
        .map((r) => ({ week: String(r.week), value: Number(r[sym]) })),
    };
  },

  async portfolio(address: string): Promise<Portfolio> {
    const ownerBytes = decodeBase58(address);
    if (!ownerBytes || ownerBytes.length !== 32) throw new Error("invalid solana address");
    const snap = await snapshot();
    const items = snap.tokens.length ? snap.tokens : FALLBACK_TOKENS;
    const tokenProg = decodeBase58(TOKEN_2022)!;
    // Public RPCs block getTokenAccountsByOwner for browsers, so derive each
    // mint's ATA (owner + Token-2022 + mint under the ATA program) and read all
    // eight in one getMultipleAccounts call. Non-ATA token accounts are not
    // covered by this derivation.
    const entries = await Promise.all(
      items.map(async (i) => {
        const mint = String(i.contract_address ?? "");
        const mintBytes = decodeBase58(mint);
        const ata = mintBytes ? await findATA(ownerBytes, tokenProg, mintBytes) : null;
        return { item: i, mint, ata };
      }),
    );
    const atas = entries.map((e) => e.ata).filter((a): a is string => a !== null);
    const accts = await rpc<{ value: (Record<string, unknown> | null)[] }>("getMultipleAccounts", [
      atas,
      { encoding: "jsonParsed" },
    ]);
    const held: { item: Record<string, unknown>; mint: string; uiAmount: number }[] = [];
    const value = accts?.value ?? [];
    entries.forEach((e, idx) => {
      const acct = value[idx];
      const info = (acct?.data as { parsed?: { info?: Record<string, unknown> } })?.parsed?.info;
      const amt = Number((info?.tokenAmount as { uiAmount?: number })?.uiAmount ?? 0);
      if (amt > 0) held.push({ item: e.item, mint: e.mint, uiAmount: amt });
    });
    const mints = held.map((h) => h.mint);
    const prices = mints.length ? await jupPrices(mints).catch(() => ({} as Record<string, JupEntry>)) : {};
    const epoch = await epochNow();
    const nowSec = Math.floor(Date.now() / 1000);
    const positions: Position[] = [];
    for (const h of held) {
      const item = h.item;
      const acct = await mintAccount(h.mint);
      const safety = acct ? decodeSafety(acct, epoch, nowSec) : null;
      const mult = safety?.scaledUiMultiplier ?? 1;
      const units = h.uiAmount * mult;
      const pe = prices[h.mint];
      const dex = f(pe?.usdPrice) ?? f(item.tokenPrice);
      const mark = f(item.markPrice) ?? f(pe?.stockData?.price);
      const marketValue = dex !== null ? units * dex : null;
      const navValue = mark !== null ? units * mark : null;
      const feeBps = safety?.transferFeeBps ?? 0;
      positions.push({
        symbol: String(item.symbol),
        name: String(item.name ?? item.symbol),
        image: item.image as string | undefined,
        mint: h.mint,
        units,
        dex,
        mark,
        marketValue,
        navValue,
        premiumExposureUsd: marketValue !== null && navValue !== null ? marketValue - navValue : null,
        premiumPct: dex && mark ? (dex / mark - 1) * 100 : null,
        exitFeeUsd: marketValue !== null ? (marketValue * feeBps) / 10000 : null,
        exitFeeBps: feeBps,
        poolDepthUsd: f(pe?.liquidity),
        exitWarning:
          marketValue !== null && f(pe?.liquidity) !== null && marketValue > f(pe?.liquidity)! * 0.1,
      });
    }
    positions.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
    const totals = {
      marketValue: positions.reduce((s, p) => s + (p.marketValue ?? 0), 0),
      navValue: positions.reduce((s, p) => s + (p.navValue ?? 0), 0),
      premiumExposureUsd: positions.reduce((s, p) => s + (p.premiumExposureUsd ?? 0), 0),
      exitFeeUsd: positions.reduce((s, p) => s + (p.exitFeeUsd ?? 0), 0),
      premiumPct: null as number | null,
    };
    totals.premiumPct = totals.navValue ? (totals.marketValue / totals.navValue - 1) * 100 : null;
    return { address, positions, totals };
  },
};
