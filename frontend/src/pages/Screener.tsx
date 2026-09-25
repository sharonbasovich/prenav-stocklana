import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type TokenRow } from "../api";
import { compactUsd, dateOnly, pct, premiumClass, usd } from "../format";

type SortKey = "premium" | "liquidity" | "volume" | "holders";

export default function Screener() {
  const [sort, setSort] = useState<SortKey>("premium");
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["tokens"],
    queryFn: api.tokens,
    refetchInterval: 60_000,
  });

  const rows = [...(data ?? [])].sort((a, b) => {
    const val = (r: TokenRow) =>
      sort === "premium"
        ? r.premiumPct
        : sort === "liquidity"
          ? r.liquidityUsd
          : sort === "volume"
            ? r.vol24hUsd
            : r.holders;
    return (val(b) ?? -Infinity) - (val(a) ?? -Infinity);
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pre-IPO NAV premium screener</h1>
          <p className="text-sm text-dim mt-1 max-w-2xl">
            Tokenized pre-IPO stocks trade away from the value of the shares backing them — exactly
            like closed-end funds. This is the premium/discount-to-NAV screen your wallet doesn't
            show you. All figures live from Solana mainnet.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-dim">
          <span>sort:</span>
          {(["premium", "liquidity", "volume", "holders"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`px-2 py-1 rounded border ${
                sort === k ? "border-accent text-accent" : "border-edge text-dim hover:text-slate-300"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="rounded border border-neg/40 bg-neg/10 px-4 py-3 text-sm text-neg mb-4">
          Failed to load tokens: {(error as Error).message}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-edge">
        <table className="w-full text-sm" data-testid="screener-table">
          <thead className="bg-panel text-dim text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Token</th>
              <th className="text-right px-4 py-3">DEX price</th>
              <th className="text-right px-4 py-3">Mark (NAV)</th>
              <th className="text-right px-4 py-3">Premium</th>
              <th className="text-right px-4 py-3 hidden md:table-cell">Implied val.</th>
              <th className="text-right px-4 py-3 hidden md:table-cell">Mark val.</th>
              <th className="text-right px-4 py-3 hidden lg:table-cell">Liquidity</th>
              <th className="text-right px-4 py-3 hidden lg:table-cell">24h vol</th>
              <th className="text-right px-4 py-3 hidden lg:table-cell">Holders</th>
              <th className="text-right px-4 py-3 hidden xl:table-cell">Launched</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge font-mono">
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={10} className="px-4 py-3">
                    <div className="h-5 rounded bg-panel animate-pulse" />
                  </td>
                </tr>
              ))}
            {rows.map((t) => (
              <tr key={t.symbol} data-testid={`row-${t.symbol}`} className="hover:bg-panel/60 transition-colors">
                <td className="px-4 py-3">
                  <Link to={`/token/${t.symbol}`} className="flex items-center gap-3 group">
                    {t.image ? (
                      <img src={t.image} alt="" className="w-7 h-7 rounded-full bg-edge" loading="lazy" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-edge" />
                    )}
                    <div>
                      <div className="font-semibold text-slate-100 group-hover:text-accent transition-colors">
                        {t.symbol}
                      </div>
                      <div className="text-xs text-dim font-sans">{t.name?.replace(" PreStocks", "")}</div>
                    </div>
                  </Link>
                </td>
                <td className="text-right px-4 py-3">{usd(t.dex)}</td>
                <td className="text-right px-4 py-3 text-dim">{usd(t.mark)}</td>
                <td className={`text-right px-4 py-3 font-bold ${premiumClass(t.premiumPct)}`} data-testid={`premium-${t.symbol}`}>
                  {pct(t.premiumPct)}
                </td>
                <td className="text-right px-4 py-3 hidden md:table-cell">{compactUsd(t.implVal)}</td>
                <td className="text-right px-4 py-3 hidden md:table-cell text-dim">{compactUsd(t.markVal)}</td>
                <td className="text-right px-4 py-3 hidden lg:table-cell">{compactUsd(t.liquidityUsd)}</td>
                <td className="text-right px-4 py-3 hidden lg:table-cell">{compactUsd(t.vol24hUsd)}</td>
                <td className="text-right px-4 py-3 hidden lg:table-cell">
                  {t.holders?.toLocaleString() ?? "—"}
                </td>
                <td className="text-right px-4 py-3 hidden xl:table-cell text-dim">{dateOnly(t.launchDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-dim flex justify-between">
        <span>Click a token for its Token-2022 safety sheet, liquidity pools and premium history.</span>
        {dataUpdatedAt > 0 && (
          <span>updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );
}
