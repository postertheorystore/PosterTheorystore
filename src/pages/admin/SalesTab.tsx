import React, { useState, useEffect } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import api from '../../lib/api';
import { h, useAction, Spinner, Input, Label } from './shared';


interface SaleProduct {
  product_id: number;
  sale_price: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
  images?: string[];
}

const emptyForm = {
  title: '', subtitle: '', description: '', discount_text: '',
  coupon_code: '', min_order: '', starts_at: '', expires_at: '',
  priority: '0', is_active: true,
};

const toLocalInput = (v: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function SalesTab({ token }: { token: string | null }) {
  const [sales, setSales] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [saleProducts, setSaleProducts] = useState<SaleProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const { loading, run } = useAction();

  const load = () =>
  api.get('/api/admin/sales', h(token))
    .then(r => setSales(Array.isArray(r.data) ? r.data : []))
    .catch(() => {});

  const loadProducts = () =>
    api.get('/api/admin/products', h(token))
      .then(r => {
        const data = Array.isArray(r.data)
          ? r.data
          : Array.isArray(r.data?.products)
            ? r.data.products
            : [];

        setProducts(data);
      })
      .catch(() => {});

  useEffect(() => {
    load();
    loadProducts();
  }, []);

  const isActiveNow = (s: any) =>
    s.is_active &&
    (!s.starts_at || new Date(s.starts_at) <= new Date()) &&
    (!s.expires_at || new Date(s.expires_at) >= new Date());


      const selectedProductIds = new Set(
      saleProducts.map(p => p.product_id)
    );

    const filteredProducts = products.filter(product =>
      product.name
        ?.toLowerCase()
        .includes(productSearch.toLowerCase())
    );

    const toggleProduct = (productId: number) => {
      setSaleProducts(prev => {
        const exists = prev.some(p => p.product_id === productId);

        if (exists) {
          return prev.filter(p => p.product_id !== productId);
        }

        return [
          ...prev,
          {
            product_id: productId,
            sale_price: '',
          },
        ];
      });
    };

    const updateSalePrice = (productId: number, salePrice: string) => {
      setSaleProducts(prev =>
        prev.map(p =>
          p.product_id === productId
            ? { ...p, sale_price: salePrice }
            : p
        )
      );
    };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      try {
       const payload = {
                title: form.title,
                subtitle: form.subtitle,
                description: form.description,
                discount_text: form.discount_text,
                coupon_code: form.coupon_code,
                min_order: parseInt(form.min_order) || 0,
                priority: parseInt(form.priority) || 0,
                is_active: form.is_active,

                starts_at: form.starts_at
                  ? new Date(form.starts_at).toISOString()
                  : null,

                expires_at: form.expires_at
                  ? new Date(form.expires_at).toISOString()
                  : null,

                products: saleProducts.map(product => ({
                  product_id: product.product_id,
                  sale_price: Number(product.sale_price),
                })),
              };
        if (editingId) {
          const res = await api.put(`/api/admin/sales/${editingId}`, payload, h(token));
          setSales(prev => prev.map(s => (s.id === editingId ? res.data : s)));
        } else {
          const res = await api.post('/api/admin/sales', payload, h(token));
          setSales(prev => [res.data, ...prev]);
        }
       setForm({ ...emptyForm });
      setSaleProducts([]);
      setProductSearch('');
      setEditingId(null);
      } catch (err: any) {
        alert(err.response?.data?.error || 'Failed to save sale');
      }
    });
  };

const startEdit = (s: any) => {
  setEditingId(s.id);

  setForm({
    title: s.title || '',
    subtitle: s.subtitle || '',
    description: s.description || '',
    discount_text: s.discount_text || '',
    coupon_code: s.coupon_code || '',
    min_order: String(s.min_order ?? 0),
    starts_at: toLocalInput(s.starts_at),
    expires_at: toLocalInput(s.expires_at),
    priority: String(s.priority ?? 0),
    is_active: !!s.is_active,
  });

  setSaleProducts(
    Array.isArray(s.products)
      ? s.products.map((p: any) => ({
          product_id: Number(p.product_id),
          sale_price: String(p.sale_price),
        }))
      : []
  );

  setProductSearch('');
};

const toggleActive = async (id: number, current: boolean) => {
  await run(async () => {
    try {
      const sale = sales.find(s => s.id === id);

      if (!sale) return;

      const res = await api.put(
        `/api/admin/sales/${id}`,
        {
          title: sale.title,
          subtitle: sale.subtitle,
          description: sale.description,
          discount_text: sale.discount_text,
          coupon_code: sale.coupon_code,
          min_order: sale.min_order ?? 0,
          starts_at: sale.starts_at,
          expires_at: sale.expires_at,
          priority: sale.priority ?? 0,
          is_active: !current,
          products: sale.products || [],
        },
        h(token)
      );

      setSales(prev =>
        prev.map(s => s.id === id ? res.data : s)
      );
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed');
    }
  });
};

  const deleteSale = async (id: number) => {
    if (!window.confirm('Delete this sale announcement?')) return;
    await run(async () => {
      try {
        await api.delete(`/api/admin/sales/${id}`, h(token));
        setSales(prev => prev.filter(s => s.id !== id));
      } catch (err: any) {
        alert(err.response?.data?.error || 'Failed');
      }
    });
  };

  const cancelEdit = () => {
  setEditingId(null);
  setForm({ ...emptyForm });
  setSaleProducts([]);
  setProductSearch('');
  };

  const textCls = 'w-full bg-z-paper border-2 border-z-border/30 px-3 py-2 text-[11px] font-mono text-z-ink focus:outline-none focus:border-z-orange transition-colors';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4">
        <div className="border-2 border-z-border/20 p-5 bg-z-paper shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
          <h3 className="text-[11px] font-mono font-black uppercase mb-4 text-z-ink border-b-2 border-z-orange/30 pb-2">
            {editingId ? 'Edit Sale' : 'Sale Announcement'}
          </h3>
          <form onSubmit={handleSave} className="space-y-3">
            <Input label="Title *" value={form.title} onChange={v => setForm({ ...form, title: v })} required />
            <Input label="Subtitle" value={form.subtitle} onChange={v => setForm({ ...form, subtitle: v })} />
            <div>
              <Label>Description</Label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className={textCls} />
            </div>
            <Input label="Discount Text" value={form.discount_text} onChange={v => setForm({ ...form, discount_text: v })} />
            <Input label="Coupon Code" value={form.coupon_code} onChange={v => setForm({ ...form, coupon_code: v.toUpperCase() })} />
            <Input label="Minimum Order (₹)" value={form.min_order} onChange={v => setForm({ ...form, min_order: v })} type="number" />


            <div className="border-t-2 border-z-border/20 pt-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label>Products in Sale</Label>

              <span className="text-[8px] font-mono font-black uppercase text-z-orange">
                {saleProducts.length} selected
              </span>
            </div>

            <input
              type="text"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="Search products..."
              className={textCls}
            />

            <div className="mt-2 max-h-56 overflow-y-auto border-2 border-z-border/20">
              {filteredProducts.length === 0 ? (
                <p className="p-3 text-[9px] font-mono uppercase text-z-muted">
                  No products found
                </p>
              ) : (
                filteredProducts.map(product => {
                  const selected = selectedProductIds.has(product.id);
                  const selectedProduct = saleProducts.find(
                    p => p.product_id === product.id
                  );

                  return (
                    <div
                      key={product.id}
                      className={`p-2 border-b border-z-border/10 last:border-b-0 ${
                        selected ? 'bg-z-orange/5' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProduct(product.id)}
                          className="accent-[var(--color-z-orange)]"
                        />

                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-mono font-black text-z-ink truncate">
                            {product.name}
                          </p>

                          <p className="text-[8px] font-mono text-z-muted">
                            Regular ₹{product.price}
                          </p>
                        </div>
                      </div>

                      {selected && (
                        <div className="mt-2 ml-6 flex items-center gap-2">
                          <span className="text-[8px] font-mono uppercase text-z-muted whitespace-nowrap">
                            Sale Price ₹
                          </span>

                          <input
                            type="number"
                            min="0"
                            max={product.price}
                            value={selectedProduct?.sale_price || ''}
                            onChange={e =>
                              updateSalePrice(product.id, e.target.value)
                            }
                            placeholder={String(product.price)}
                            className={`${textCls} py-1`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
            <div>
              <Label>Starts At</Label>
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} className={textCls} />
            </div>
            <div>
              <Label>Ends At</Label>
              <input type="datetime-local" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} className={textCls} />
            </div>
            <Input label="Priority" value={form.priority} onChange={v => setForm({ ...form, priority: v })} type="number" />
            <label className="flex items-center gap-2 text-[10px] font-mono uppercase cursor-pointer text-z-ink">
              <input type="checkbox" checked={form.is_active} onChange={() => setForm({ ...form, is_active: !form.is_active })} className="accent-[var(--color-z-orange)]" /> Active
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="flex-1 bg-z-orange text-white py-2.5 text-[10px] font-mono font-black uppercase active:scale-95 transition-all hover:bg-z-orange-dark disabled:opacity-50 shadow-[4px_4px_0px_0px_var(--color-z-shadow)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]">
                {loading ? <span className="flex items-center justify-center gap-2"><Spinner /> Saving...</span> : editingId ? 'Update Sale' : 'Save Sale'}
              </button>
              {editingId && (
                <button type="button" onClick={cancelEdit} className="px-3 border-2 border-z-border/30 text-[10px] font-mono font-black uppercase text-z-muted hover:text-z-ink transition-colors">Cancel</button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="lg:col-span-8">
        <h3 className="text-[11px] font-mono font-black uppercase text-z-ink mb-4">Sales <span className="text-z-orange">({sales.length})</span></h3>
        <div className="space-y-2">
          {sales.map(s => (
            <div key={s.id} className={`border-2 border-z-border/20 p-3 flex justify-between items-center bg-z-paper ${!s.is_active ? 'opacity-50' : ''}`}>
              <div>
                <p className="text-[11px] font-mono font-black text-z-ink">
                  {s.title}{s.discount_text && <> — <span className="text-z-orange">{s.discount_text}</span></>}
                </p>
                <p className="text-[9px] font-mono text-z-muted">
                  Min ₹{s.min_order || 0}
                  {s.coupon_code && ` · Code: ${s.coupon_code}`}
                  {s.starts_at && ` · From ${new Date(s.starts_at).toLocaleDateString()}`}
                  {s.expires_at && ` · Until ${new Date(s.expires_at).toLocaleDateString()}`}
                  {` · Priority ${s.priority}`}
                </p>
              </div>
              <div className="flex gap-2 items-center shrink-0">
                {loading && <Spinner />}
                {isActiveNow(s) && <span className="px-1.5 py-0.5 text-[7px] font-mono font-black uppercase bg-green-100 text-green-700">Live</span>}
                <button onClick={() => toggleActive(s.id, s.is_active)} disabled={loading} className={`px-2 py-1 text-[8px] font-mono font-black uppercase border-2 active:scale-95 transition-all disabled:opacity-50 ${s.is_active ? 'border-green-500 text-green-600' : 'border-z-border/30 text-z-muted'}`}>
                  {s.is_active ? 'Active' : 'Disabled'}
                </button>
                <button onClick={() => startEdit(s)} className="p-1 hover:opacity-70 transition-opacity"><Pencil className="w-3.5 h-3.5 text-z-ink" /></button>
                <button onClick={() => deleteSale(s.id)} disabled={loading} className="active:scale-90 transition-transform disabled:opacity-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
              </div>
            </div>
          ))}
          {sales.length === 0 && <p className="text-[10px] font-mono text-z-muted uppercase">No sales yet</p>}
        </div>
      </div>
    </div>
  );
}

