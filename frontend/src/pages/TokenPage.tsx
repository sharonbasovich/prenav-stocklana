import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Safety, type SafetyFlag } from "../api";
import { compactUsd, num, pct, premiumClass, short, usd } from "../format";

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-neg/15 text-neg border-neg/30",
  medium: "bg-accent/10 text-accent border-accent/30",
  low: "bg-sky-400/10 text-sky-300 border-sky-400/30",
  info: "bg-dim/10 text-dim border-dim/30",
};

function Badge({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wide ${SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info}`}
    >
      {severity}
    </span>
  );
}

function SafetyRow({ label, value, flag }: { label: string; value: React.ReactNode; flag?: SafetyFlag }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-edge/60 last:border-0" data-testid={`safety-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="min-w-0">
        <div className="text-sm text-slate-300">{label}</div>
        {flag && <div className="text-xs text-dim mt-0.5 max-w-md">{flag.explain}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-mono text-right">{value}</span>
        {flag && <Badge severity={flag.severity} />}
      </div>
    </div>
  );
}

function SafetySheet({ safety }: { safety: Safety }) {
  const flagFor = (key: string) => safety.flags.find((f) => f.key === key);
  const feePct = safety.transferFeeBps !== null ? safety.transferFeeBps / 100 : null;
  const pendingPct = safety.pendingFeeBps !== null ? safety.pendingFeeBps / 100 : null;
  return (
    <section className="rounded-lg border border-edge bg-panel/40 p-4">
      <h2 className="text-lg font-semibold mb-1">What you actually own</h2>
      <p className="text-xs text-dim mb-3">
        Decoded live from the Token-2022 mint account — the permissions and fees the issuer
        holds over this token.
      </p>
      <div>
        <SafetyRow label="Token program" value={<span className="text-sky-300">{safety.program}</span>} />
        <SafetyRow
          label="Transfer fee"
          flag={flagFor("transfer_fee")}
          value={
            feePct !== null ? (
              <span className="text-accent">
                {feePct.toFixed(2)}%{pendingPct !== null && ` → ${pendingPct!.toFixed(2)}% pending`}
              </span>
            ) : (
              "none"
            )
          }
        />
        <SafetyRow
          label="Permanent delegate"
          flag={flagFor("permanent_delegate")}
          value={safety.permanentDelegate ? short(safety.permanentDelegate) : "none"}
        />
        <SafetyRow
          label="Freeze authority"
          flag={flagFor("freeze_authority")}
          value={safety.freezeAuthority ? short(safety.freezeAuthority) : "revoked"}
        />
        <SafetyRow
          label="Mint authority"
          flag={flagFor("mint_authority")}
          value={safety.mintAuthority ? short(safety.mintAuthority) : "revoked"}
        />
        <SafetyRow
          label="Pausable"
          flag={flagFor("pausable")}
          value={safety.pausable ? (safety.paused ? "PAUSED" : "enabled, not paused") : "no"}
        />
        <SafetyRow
          label="Transfer hook"
          flag={flagFor("transfer_hook")}
          value={safety.transferHook ? short(safety.transferHook) : "slot reserved, no program"}
        />
        <SafetyRow
          label="UI amount scale"
          flag={flagFor("scaled_ui")}
          value={`${safety.scaledUiMultiplier}×`}
        />
        <SafetyRow
          label="Confidential transfer"
          flag={flagFor("confidential")}
          value={safety.confidential ? "enabled" : "disabled"}
        />
        <SafetyRow
          label="Withheld fees (issuer's accrued take)"
          value={safety.withheld !== null ? `${num(safety.withheld)} tokens` : "—"}
        />
      </div>
    </section>
  );
}

export default function TokenPage() {
  const { symbol = "" } = useParams();
  const sym = symbol.toUpperCase();

  const detail = useQuery({ queryKey: ["token", sym], queryFn: () => api.token(sym) });
  const history = useQuery({ queryKey: ["history", sym], queryFn: () => api.history(sym) });

  if (detail.isError) {
    return (
      <div className="rounded border border-neg/40 bg-neg/10 px-4 py-6 text-center">
        <div className="text-neg font-semibold">Unknown token: {sym}</div>
        <Link to="/" className="text-sm text-dim underline mt-2 inline-block">
          back to screener
        </Link>
      </div>
    );
  }

  const t = detail.data;
  const premiumPts = (history.data?.premium ?? []).filter((p) => p.premiumPct !== null);
  const volPts = history.data?.volumeDaily ?? [];
  const holderPts = history.data?.holdersWeekly ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {t?.image && <img src={t.image} alt="" className="w-12 h-12 rounded-full bg-edge" />}
          <div>
            <h1 className="text-2xl font-bold">{t?.name ?? sym}</h1>
            <div className="text-xs text-dim font-mono">
              {t?.mint && (
                <a
                  href={`https://solscan.io/token/${t.mint}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-sky-300"
                >
                  {short(t.mint, 8, 8)}
                </a>
              )}
            </div>
          </div>
        </div>
        {t && (
          <div className="flex gap-6 font-mono text-sm">
            <div>
              <div className="text-xs text-dim uppercase">DEX price</div>
              <div className="text-lg">{usd(t.dex)}</div>
            </div>
            <div>
              <div className="text-xs text-dim uppercase">Mark (NAV)</div>
              <div className="text-lg text-dim">{usd(t.mark)}</div>
            </div>
            <div>
              <div className="text-xs text-dim uppercase">Premium</div>
              <div className={`text-lg font-bold ${premiumClass(t.premiumPct)}`} data-testid="token-premium">
                {pct(t.premiumPct)}
              </div>
            </div>
            {t.pyth && (
              <div>
                <div className="text-xs text-dim uppercase">Pyth index</div>
                <div className="text-lg">{usd(t.pyth.price)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <section className="rounded-lg border border-edge bg-panel/40 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-dim">
            Premium to NAV — PreNAV sampler (5 min)
          </h2>
          <span className="text-xs text-dim">{premiumPts.length} samples</span>
        </div>
        <div className="h-44" data-testid="premium-chart">
          {premiumPts.length === 0 ? (
            <div className="h-full flex items-center justify-center text-dim text-sm">
              sampler warming up — first samples appear within minutes
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={premiumPts}>
                <XAxis
                  dataKey="ts"
                  tickFormatter={(ts: number) =>
                    new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  }
                  tick={{ fontSize: 10, fill: "#8b97a8" }}
                  stroke="#1f2733"
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                  tick={{ fontSize: 10, fill: "#8b97a8" }}
                  stroke="#1f2733"
                  width={56}
                />
                <Tooltip
                  contentStyle={{ background: "#11161f", border: "1px solid #1f2733", fontSize: 12 }}
                  labelFormatter={(ts) => new Date(Number(ts) * 1000).toLocaleString()}
                  formatter={(v) => [`${Number(v).toFixed(3)}%`, "premium"]}
                />
                <Line type="monotone" dataKey="premiumPct" stroke="#f5c518" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {t?.safety ? (
        <SafetySheet safety={t.safety} />
      ) : (
        <section className="rounded-lg border border-edge bg-panel/40 p-4 text-dim text-sm">
          {detail.isLoading ? "decoding mint…" : "safety sheet unavailable (RPC rate-limited)"}
        </section>
      )}

      <section className="rounded-lg border border-edge bg-panel/40 p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-dim">
            Liquidity pools — fragmented across DEXes
          </h2>
          <span className="text-xs text-dim">
            {t?.pools.length ?? 0} pools · {pct(t?.dispersionPct ?? 0)} price dispersion
          </span>
        </div>
        <div className="overflow-x-auto" data-testid="pool-table">
          <table className="w-full text-sm font-mono">
            <thead className="text-dim text-xs uppercase">
              <tr>
                <th className="text-left py-2 pr-4">DEX / pool</th>
                <th className="text-right py-2 pr-4">price</th>
                <th className="text-right py-2 pr-4">liquidity</th>
                <th className="text-right py-2 pr-4">24h vol</th>
                <th className="text-right py-2">vs mid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {(t?.pools ?? []).map((p) => (
                <tr key={p.pair}>
                  <td className="py-2 pr-4">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
                        {p.dex}
                      </a>
                    ) : (
                      p.dex
                    )}
                    <span className="text-dim"> {short(p.pair)}</span>
                  </td>
                  <td className="text-right py-2 pr-4">{usd(p.priceUsd)}</td>
                  <td className="text-right py-2 pr-4">{compactUsd(p.liqUsd)}</td>
                  <td className="text-right py-2 pr-4">{compactUsd(p.vol24h)}</td>
                  <td className={`text-right py-2 ${premiumClass(p.devFromMidPct)}`}>{pct(p.devFromMidPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="rounded-lg border border-edge bg-panel/40 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-dim mb-3">
            Weekly holders (PreStocks stats)
          </h2>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={holderPts}>
                <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#8b97a8" }} stroke="#1f2733" />
                <YAxis tick={{ fontSize: 10, fill: "#8b97a8" }} stroke="#1f2733" width={50} />
                <Tooltip
                  contentStyle={{ background: "#11161f", border: "1px solid #1f2733", fontSize: 12 }}
                />
                <Line type="monotone" dataKey="value" stroke="#34d399" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-lg border border-edge bg-panel/40 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-dim mb-3">
            Daily volume (PreStocks stats)
          </h2>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volPts.slice(-60)}>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#8b97a8" }} stroke="#1f2733" />
                <YAxis tick={{ fontSize: 10, fill: "#8b97a8" }} stroke="#1f2733" width={56} />
                <Tooltip
                  contentStyle={{ background: "#11161f", border: "1px solid #1f2733", fontSize: 12 }}
                />
                <Bar dataKey="value" fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
