import { Link, Route, Routes } from "react-router-dom";
import PortfolioPage from "./pages/PortfolioPage";
import Screener from "./pages/Screener";
import TokenPage from "./pages/TokenPage";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-edge bg-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-mono font-bold text-lg">
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
              <rect width="32" height="32" rx="6" fill="#11161f" />
              <polyline
                points="5,24 12,15 17,19 27,7"
                fill="none"
                stroke="#f5c518"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              Pre<span className="text-accent">NAV</span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-dim">
            <Link to="/" className="hover:text-slate-200 transition-colors">
              Screener
            </Link>
            <Link to="/portfolio" className="hover:text-slate-200 transition-colors">
              Statement
            </Link>
          </nav>
          <div className="ml-auto text-xs text-dim font-mono hidden sm:block">
            read-only · live mainnet data · no wallet needed
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Screener />} />
          <Route path="/token/:symbol" element={<TokenPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/portfolio/:address" element={<PortfolioPage />} />
          <Route path="*" element={<Screener />} />
        </Routes>
      </main>
      <footer className="border-t border-edge mt-16">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-dim flex flex-wrap gap-x-6 gap-y-2">
          <span>PreNAV — NAV-premium terminal for tokenized pre-IPO stocks on Solana.</span>
          <span>Read-only analytics. Not financial advice. Data: PreStocks, Jupiter, DexScreener, Solana RPC.</span>
        </div>
      </footer>
    </div>
  );
}
