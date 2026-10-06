import React, { useEffect, useState } from 'react';
import { Copy, Check, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

interface Sale {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  discount_text: string;
  coupon_code: string;
  min_order: number;
  starts_at: string | null;
  expires_at: string | null;
}

// Reusable sale announcement banner. Fetches the current active sale
// (GET /api/sales/active) once on mount. Renders nothing if there is no sale.
export default function SaleAnnouncement() {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/sales/active')
      .then((r) => {
        if (cancelled) return;
        setSale(r.data?.sale || null);
        setLoaded(true);
      })
      .catch(() => {
        // API failure must not break the homepage — just stay hidden.
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const copyCode = async () => {
    if (!sale?.coupon_code) return;
    try {
      await navigator.clipboard.writeText(sale.coupon_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (permissions / http) — silently ignore
    }
  };

  if (!loaded || !sale) return null;

  return (
    <section className="border-b-2 border-z-border bg-z-orange/5 overflow-hidden">
      <div className="max-w-[1440px] mx-auto px-6 py-6 sm:py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-orange font-bold mb-1">
            🔥 Limited Time Offer
          </p>
          <h3 className="font-display font-black text-2xl sm:text-3xl uppercase tracking-tighter text-z-ink leading-none">
            {sale.title}
            {sale.discount_text && (
              <span className="text-z-orange"> — {sale.discount_text}</span>
            )}
          </h3>
          {sale.subtitle && (
            <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-wide text-z-muted mt-2">
              {sale.subtitle}
            </p>
          )}
          {sale.description && (
            <p className="font-mono text-[10px] uppercase text-z-muted/80 mt-1">
              {sale.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {sale.coupon_code && (
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-z-orange text-z-ink font-mono text-[11px] font-black uppercase tracking-widest hover:bg-z-orange/10 transition-colors active:scale-95"
              title="Copy coupon code"
            >
              {sale.coupon_code}
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-z-orange" />}
              <span className="text-[9px] text-z-muted">{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          )}
          {sale.min_order > 0 && (
            <span className="font-mono text-[10px] uppercase text-z-muted">
              Min order ₹{sale.min_order.toLocaleString()}
            </span>
          )}
          <Link
            to="/collection"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-z-ink text-z-paper font-mono text-[11px] font-bold uppercase tracking-widest hover:bg-z-orange transition-colors"
          >
            Shop Now <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

