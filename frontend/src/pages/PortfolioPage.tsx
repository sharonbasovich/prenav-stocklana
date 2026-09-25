import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { num, pct, premiumClass, usd } from "../format";

const EXAMPLE = "4wa8FTHDBLNf1DCAWhNbqJ5ZRGkV8TQX1TaF2VMpNttM";

export default function PortfolioPage() {
  const { address } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(address ?? "");
  const enabled = Boolean(address);
  const { data, isFetching, isError, error } = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => api.portfolio(address!),
    enabled,
    retry: false,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (v) navigate(`/portfolio/${v}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Portfolio statement</h1>
        <p className="text-sm text-dim mt-1 max-w-2xl">
          Paste any Solana address to see its PreStocks positions: market value vs. NAV value,
          how much premium you're paying, and what it costs to exit (transfer fee + pool depth).
          Read-only — no wallet connection, no signing.
        </p>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Solana address, e.g. 4wa8…NttM"
          className="flex-1 rounded border border-edge bg-panel px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          data-testid="address-input"
          spellCheck={false}
        />
        <button
          type="submit"
          className="rounded border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20"
          data-testid="address-submit"
        >
          Generate
        </button>
      </form>
      {!enabled && (
        <button onClick={() => navigate(`/portfolio/${EXAMPLE}`)} className="text-xs text-dim underline hover:text-slate-300">
          try the example address
        </button>
      )}

      {isFetching && enabled && (
        <div className="space-y-2" data-testid="portfolio-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-panel animate-pulse" />
          ))}
        </div>
      )}

      {isError && !isFetching && (
        <div className="rounded border border-neg/40 bg-neg/10 px-4 py-3 text-sm text-neg" data-testid="portfolio-error">
          {(error as Error).message === "invalid solana address"
            ? "That doesn't look like a Solana address — check for typos."
            : `Couldn't load statement: ${(error as Error).message}`}
        </div>
      )}

      {data && !isFetching && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="portfolio-totals">
            <Stat label="Market value" value={usd(data.totals.marketValue)} />
            <Stat label="NAV value" value={usd(data.totals.navValue)} />
            <Stat
              label="Premium exposure"
              value={usd(data.totals.premiumExposureUsd)}
              sub={pct(data.totals.premiumPct)}
              tone={data.totals.premiumExposureUsd >= 0 ? "pos" : "neg"}
            />
            <Stat label="Est. exit cost (transfer fees)" value={usd(data.totals.exitFeeUsd)} />
          </div>

          {data.positions.length === 0 ? (
            <div className="rounded border border-edge bg-panel/40 p-6 text-sm text-dim" data-testid="portfolio-empty">
              No PreStocks positions found in this wallet (Token-2022 program scanned).
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-edge">
              <table className="w-full text-sm font-mono" data-testid="portfolio-table">
                <thead className="bg-panel text-dim text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3">Position</th>
                    <th className="text-right px-4 py-3">Units</th>
                    <th className="text-right px-4 py-3">DEX</th>
                    <th className="text-right px-4 py-3">NAV</th>
                    <th className="text-right px-4 py-3">Market value</th>
                    <th className="text-right px-4 py-3">NAV value</th>
                    <th className="text-right px-4 py-3">Premium</th>
                    <th className="text-right px-4 py-3">Exit fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {data.positions.map((p) => (
                    <tr key={p.mint} data-testid={`position-${p.symbol}`}>
                      <td className="px-4 py-3">
                        <Link to={`/token/${p.symbol}`} className="flex items-center gap-2 hover:text-accent">
                          {p.image && <img src={p.image} alt="" className="w-6 h-6 rounded-full bg-edge" />}
                          {p.symbol}
                        </Link>
                      </td>
                      <td className="text-right px-4 py-3">{num(p.units, 6)}</td>
                      <td className="text-right px-4 py-3">{usd(p.dex)}</td>
                      <td className="text-right px-4 py-3 text-dim">{usd(p.mark)}</td>
                      <td className="text-right px-4 py-3">{usd(p.marketValue)}</td>
                      <td className="text-right px-4 py-3 text-dim">{usd(p.navValue)}</td>
                      <td className={`text-right px-4 py-3 ${premiumClass(p.premiumExposureUsd)}`}>
                        {usd(p.premiumExposureUsd)}
                        <span className="text-dim"> ({pct(p.premiumPct)})</span>
                        {p.exitWarning && (
                          <div className="text-[10px] text-neg">thin liquidity vs position</div>
                        )}
                      </td>
                      <td className="text-right px-4 py-3">
                        {usd(p.exitFeeUsd)}
                        <span className="text-dim"> ({(p.exitFeeBps / 100).toFixed(1)}%)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-dim">
            Positive premium exposure = you paid more than the shares are worth at the issuer's mark.
            Exit fee is the Token-2022 transfer fee withheld when you move or sell the tokens; actual
            sale may also cross pool spread/slippage (see pool depth).
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="rounded-lg border border-edge bg-panel/40 p-4">
      <div className="text-xs text-dim uppercase tracking-wide">{label}</div>
      <div
        className={`text-xl font-mono font-bold mt-1 ${tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : ""}`}
      >
        {value}
      </div>
      {sub && <div className={`text-xs font-mono ${premiumClass(tone === "pos" ? 1 : -1)}`}>{sub}</div>}
    </div>
  );
}
