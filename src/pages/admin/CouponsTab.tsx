import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import api from '../../lib/api';
import { h, useAction, Spinner, Input, Label } from './shared';

const EMPTY_FORM = { code: '', type: 'percent', value: '', min_order: '', max_uses: '', free_shipping: false, expires_at: '' };

// Mirrors what the customer-facing validator will accept/reject.
const couponStatus = (c: any) => {
  if (!c.is_active) return { label: 'Disabled', cls: 'border-z-border/30 text-z-muted' };
  if (c.expires_at && new Date(c.expires_at) <= new Date())
    return { label: 'Expired', cls: 'border-red-500 text-red-500' };
  if (c.max_uses > 0 && c.used_count >= c.max_uses)
    return { label: 'Used up', cls: 'border-yellow-500 text-yellow-600' };
  return { label: 'Active', cls: 'border-green-500 text-green-600 dark:border-green-400 dark:text-green-400' };
};

export default function CouponsTab({ token }: { token: string | null }) {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const { loading: couponLoading, run: runCoupon } = useAction();

  useEffect(() => {
    api.get('/api/admin/coupons', h(token))
      .then(r => setCoupons(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const value = parseInt(form.value);
    if (form.type === 'percent' && (value < 1 || value > 100)) {
      return alert('Percent must be between 1 and 100');
    }

    await runCoupon(async () => {
      try {
        const res = await api.post(
          '/api/admin/coupons',
          {
            ...form,
            value,
            min_order: parseInt(form.min_order) || 0,
            max_uses: parseInt(form.max_uses) || 0,
            // Expire at the END of the chosen day, not midnight at its start.
            expires_at: form.expires_at ? `${form.expires_at}T23:59:59` : null,
          },
          h(token)
        );
        setCoupons(prev => [res.data, ...prev]);
        setForm(EMPTY_FORM);
      } catch (err: any) {
        alert(err.response?.data?.error || 'Failed');
      }
    });
  };

  const toggleActive = async (id: number, current: boolean) => {
    await runCoupon(async () => {
      const res = await api.put(`/api/admin/coupons/${id}`, { is_active: !current }, h(token));
      setCoupons(prev => prev.map(c => (c.id === id ? res.data : c)));
    });
  };

  const deleteCoupon = async (id: number) => {
    await runCoupon(async () => {
      await api.delete(`/api/admin/coupons/${id}`, h(token));
      setCoupons(prev => prev.filter(c => c.id !== id));
    });
  };

  const confirmDelete = (c: any) => {
    if (window.confirm(`Delete coupon ${c.code}? Past orders keep the code and discount for reference.`)) {
      deleteCoupon(c.id);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4">
        <div className="border-2 border-z-border/20 p-5 bg-z-paper shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
          <h3 className="text-[11px] font-mono font-black uppercase mb-4 text-z-ink border-b-2 border-z-orange/30 pb-2">Create Coupon</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <Input
              label="Code"
              value={form.code}
              onChange={v => setForm({ ...form, code: v.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })}
              required
            />
            <div>
              <Label>Type</Label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full bg-z-paper border-2 border-z-border/30 px-3 py-2 text-[11px] font-mono uppercase text-z-ink focus:outline-none focus:border-z-orange transition-colors"
              >
                <option value="percent">Percentage %</option>
                <option value="flat">Flat ₹</option>
              </select>
            </div>
            <Input label="Value" value={form.value} onChange={v => setForm({ ...form, value: v })} required type="number" />
            <Input label="Min Order (₹)" value={form.min_order} onChange={v => setForm({ ...form, min_order: v })} type="number" />
            <Input label="Max Uses (0 = unlimited)" value={form.max_uses} onChange={v => setForm({ ...form, max_uses: v })} type="number" />
            <Input label="Expires At" value={form.expires_at} onChange={v => setForm({ ...form, expires_at: v })} type="date" />
            <label className="flex items-center gap-2 text-[10px] font-mono uppercase cursor-pointer text-z-ink">
              <input
                type="checkbox"
                checked={form.free_shipping}
                onChange={() => setForm({ ...form, free_shipping: !form.free_shipping })}
                className="accent-[var(--color-z-orange)]"
              />{' '}
              Free Shipping
            </label>
            <button
              type="submit"
              disabled={couponLoading}
              className="w-full bg-z-orange text-white py-2.5 text-[10px] font-mono font-black uppercase active:scale-95 transition-all hover:bg-z-orange-dark disabled:opacity-50 shadow-[4px_4px_0px_0px_var(--color-z-shadow)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
            >
              {couponLoading ? <span className="flex items-center justify-center gap-2"><Spinner /> Saving...</span> : 'Create'}
            </button>
          </form>
        </div>
      </div>

      <div className="lg:col-span-8">
        <h3 className="text-[11px] font-mono font-black uppercase text-z-ink mb-4">
          Coupons <span className="text-z-orange">({coupons.length})</span>
        </h3>
        <div className="space-y-2">
          {coupons.map(c => {
            const st = couponStatus(c);
            return (
              <div
                key={c.id}
                className={`border-2 border-z-border/20 p-3 flex justify-between items-center bg-z-paper ${st.label !== 'Active' ? 'opacity-60' : ''}`}
              >
                <div>
                  <p className="text-[11px] font-mono font-black text-z-ink">
                    {c.code} — <span className="text-z-orange">{c.type === 'percent' ? `${c.value}%` : `₹${c.value}`}</span> off
                  </p>
                  <p className="text-[9px] font-mono text-z-muted">
                    Min ₹{c.min_order} · Uses: {c.used_count}/{c.max_uses || '∞'}
                    {c.expires_at && ` · Expires ${new Date(c.expires_at).toLocaleDateString()}`}
                    {c.free_shipping && ' · Free Ship'}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  {couponLoading && <Spinner />}
                  <button
                    onClick={() => toggleActive(c.id, c.is_active)}
                    disabled={couponLoading}
                    title="Click to enable/disable"
                    className={`px-2 py-1 text-[8px] font-mono font-black uppercase border-2 active:scale-95 transition-all disabled:opacity-50 ${st.cls}`}
                  >
                    {st.label}
                  </button>
                  <button
                    onClick={() => confirmDelete(c)}
                    disabled={couponLoading}
                    className="active:scale-90 transition-transform disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}