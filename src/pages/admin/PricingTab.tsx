import React, { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import api from '../../lib/api';
import { h, useAction, Spinner } from './shared';

type FrameDraft = { noFrame: boolean; withFrame: boolean; framePrice: string };

export default function PricingTab({ token }: { token: string | null }) {
  const [pricing, setPricing] = useState<any[]>([]);
  const [sizes, setSizes] = useState<any[]>([]);
  const [layouts, setLayouts] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [editPrice, setEditPrice] = useState<{ size_id: number; layout_id: number; price: string; promotional_price: string; } | null>(null);
  const [newCat, setNewCat] = useState('');
  const [editCat, setEditCat] = useState<{ id: number; name: string } | null>(null);
  const [newSize, setNewSize] = useState({ name: '', width_mm: '', height_mm: '', margin_top: '10', margin_bottom: '10', margin_left: '10', margin_right: '10' });
  const [editSize, setEditSize] = useState<{ id: number; name: string; width_mm: string; height_mm: string; margin_top: string; margin_bottom: string; margin_left: string; margin_right: string } | null>(null);
  const [newLayout, setNewLayout] = useState({ name: '', panel_count: '' });
  const [editLayout, setEditLayout] = useState<{ id: number; name: string; panel_count: string } | null>(null);

  const [couriers, setCouriers] = useState<any[]>([]);
  const [newCourier, setNewCourier] = useState({ name: '', tracking_url: '' });
  const { loading: courierLoading, run: runCourier } = useAction();

  const [framePricing, setFramePricing] = useState<any[]>([]);
  // draft: keyed by size.id — local edits before Save
  const [frameDraft, setFrameDraft] = useState<Record<number, FrameDraft>>({});
  const [frameRowLoading, setFrameRowLoading] = useState<Record<number, boolean>>({});
  const [frameErrors, setFrameErrors] = useState<Record<number, string>>({}); 

  const [materialPricing, setMaterialPricing] = useState<any[]>([]);
  const { loading: materialLoading, run: runMaterial } = useAction();

  const reload = async () => {
    const [p, s, l, c, cr, fp, mp] = await Promise.all([
      api.get('/api/admin/pricing', h(token)),
      api.get('/api/admin/sizes', h(token)),
      api.get('/api/admin/layouts', h(token)),
      api.get('/api/admin/collections', h(token)),
      api.get('/api/admin/couriers', h(token)),
      api.get('/api/admin/frame-pricing', h(token)),
      api.get('/api/admin/material-pricing', h(token)),
    ]);
    setPricing(Array.isArray(p.data) ? p.data : []);
    const freshSizes: any[] = Array.isArray(s.data) ? s.data : [];
    const freshFp: any[] = Array.isArray(fp.data) ? fp.data : [];
    setSizes(freshSizes);
    setLayouts(Array.isArray(l.data) ? l.data : []);
    setCollections(Array.isArray(c.data) ? c.data : []);
    setCouriers(Array.isArray(cr.data) ? cr.data : []);
    setFramePricing(freshFp);
    setMaterialPricing(Array.isArray(mp.data) ? mp.data : []);
    // Reset drafts to match DB state
    const drafts: Record<number, FrameDraft> = {};
    freshSizes.forEach((sz: any) => {
      const entry = freshFp.find((f: any) => f.size_name === sz.name);
      drafts[sz.id] = { noFrame: !sz.frame_only, withFrame: !!entry, framePrice: entry ? String(entry.price) : '' };
    });
    setFrameDraft(drafts);
    setFrameErrors({});
  };

  useEffect(() => { reload().catch(() => {}); }, []);

  const { loading: pricingLoading, run: runPricing } = useAction();
  const { loading: catLoading, run: runCat } = useAction();
  const { loading: sizeLoading, run: runSize } = useAction();
  const { loading: layoutLoading, run: runLayout } = useAction();

  const savePrice = async () => {
  if (!editPrice) return;

  const draft = editPrice;

  if (!draft.price || Number(draft.price) <= 0) return;

  if (
    draft.promotional_price !== '' &&
    Number(draft.promotional_price) < 0
  ) {
    return;
  }

  setEditPrice(null);

  await runPricing(async () => {
    await api.post(
      '/api/admin/pricing',
      {
        size_id: draft.size_id,
        layout_id: draft.layout_id,
        price: Number(draft.price),
        promotional_price:
          draft.promotional_price === ''
            ? null
            : Number(draft.promotional_price),
      },
      h(token)
    );

    await reload();
  });
};

  const deletePrice = async (sizeId: number, layoutId: number) => {
    await runPricing(async () => {
      await api.delete(`/api/admin/pricing/${sizeId}/${layoutId}`, h(token)).catch(() => {});
      await reload();
    });
  };

  const getPrice = (sizeId: number, layoutId: number) => pricing.find(p => p.size_id === sizeId && p.layout_id === layoutId)?.price;

  // Collections CRUD
  const addCategory = async () => {
    if (!newCat.trim()) return;
    await runCat(async () => { await api.post('/api/admin/collections', { name: newCat.trim() }, h(token)); setNewCat(''); await reload(); });
  };
  const updateCategory = async () => {
    if (!editCat) return;
    const cat = editCat;
    setEditCat(null);
    await runCat(async () => { await api.put(`/api/admin/collections/${cat.id}`, { name: cat.name }, h(token)); await reload(); });
  };
  const deleteCategory = async (id: number) => {
    await runCat(async () => { await api.delete(`/api/admin/collections/${id}`, h(token)); setCollections(prev => prev.filter(c => c.id !== id)); });
  };

  // Sizes CRUD
  const addSize = async () => {
    if (!newSize.name || !newSize.width_mm || !newSize.height_mm) return;
    await runSize(async () => {
      await api.post('/api/admin/sizes', { name: newSize.name, width_mm: parseInt(newSize.width_mm), height_mm: parseInt(newSize.height_mm), margin_top: parseInt(newSize.margin_top) || 10, margin_bottom: parseInt(newSize.margin_bottom) || 10, margin_left: parseInt(newSize.margin_left) || 10, margin_right: parseInt(newSize.margin_right) || 10 }, h(token));
      setNewSize({ name: '', width_mm: '', height_mm: '', margin_top: '10', margin_bottom: '10', margin_left: '10', margin_right: '10' });
      await reload();
    });
  };
  const updateSize = async () => {
    if (!editSize) return;
    const size = editSize;
    setEditSize(null);
    await runSize(async () => {
      await api.put(`/api/admin/sizes/${size.id}`, { name: size.name, width_mm: parseInt(size.width_mm), height_mm: parseInt(size.height_mm), margin_top: parseInt(size.margin_top) || 10, margin_bottom: parseInt(size.margin_bottom) || 10, margin_left: parseInt(size.margin_left) || 10, margin_right: parseInt(size.margin_right) || 10 }, h(token));
      await reload();
    });
  };
  const deleteSize = async (id: number) => { await runSize(async () => { await api.delete(`/api/admin/sizes/${id}`, h(token)); await reload(); }); };

  // Layouts CRUD
  const addLayout = async () => {
    if (!newLayout.name || !newLayout.panel_count) return;
    await runLayout(async () => { await api.post('/api/admin/layouts', { name: newLayout.name, panel_count: parseInt(newLayout.panel_count) }, h(token)); setNewLayout({ name: '', panel_count: '' }); await reload(); });
  };
  const updateLayout = async () => {
    if (!editLayout) return;
    const layout = editLayout;
    setEditLayout(null);
    await runLayout(async () => { await api.put(`/api/admin/layouts/${layout.id}`, { name: layout.name, panel_count: parseInt(layout.panel_count) }, h(token)); await reload(); });
  };
  const deleteLayout = async (id: number) => { await runLayout(async () => { await api.delete(`/api/admin/layouts/${id}`, h(token)); await reload(); }); };

  const inputCls = "border-2 border-z-border/30 px-2 py-1 text-[9px] font-mono bg-z-paper text-z-ink focus:outline-none focus:border-z-orange transition-colors";
  const inputClsLg = "border-2 border-z-border/30 px-3 py-2 text-[12px] font-mono bg-z-paper text-z-ink focus:outline-none focus:border-z-orange transition-colors";
  const addBtnCls = "px-3 py-1.5 bg-z-orange text-white text-[9px] font-mono font-black flex items-center gap-1 hover:bg-z-orange-dark active:scale-95 transition-all disabled:opacity-50";
  const addBtnClsLg = "px-4 py-2 bg-z-orange text-white text-[11px] font-mono font-black flex items-center gap-1.5 hover:bg-z-orange-dark active:scale-95 transition-all disabled:opacity-50";
  const iconBtnCls = "p-1 hover:bg-z-orange/10 active:scale-90 transition-transform rounded-sm";

  return (
    <div className="space-y-10">
      {/* Price Matrix Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-black text-2xl uppercase tracking-tighter text-z-ink flex items-center gap-2">Price Matrix <span className="text-z-orange">(₹)</span> {pricingLoading && <Spinner />}</h2>
          <p className="text-[11px] font-mono text-z-muted uppercase">Click any cell to edit</p>
        </div>
        <div className="border-2 border-z-border/20 overflow-x-auto shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
          <table className="w-full text-[12px] font-mono">
            <thead>
              <tr className="bg-z-ink text-z-paper dark:bg-z-orange dark:text-white">
                <th className="px-4 py-3 text-left uppercase font-black tracking-widest text-[11px]">Size \ Layout →</th>
                {layouts.map(l => <th key={l.id} className="px-4 py-3 text-center uppercase font-black text-[11px]">{l.name}<br/><span className="text-[9px] font-normal opacity-70">{l.panel_count}P</span></th>)}
              </tr>
            </thead>
            <tbody>
              {sizes.map((s, idx) => (
                <tr key={s.id} className={`border-t border-z-border/10 ${idx % 2 === 0 ? 'bg-z-paper' : 'bg-z-orange/[0.03]'}`}>
                  <td className="px-4 py-3 font-black text-z-ink text-[13px]">
                    {s.name}
                    <span className="text-z-muted font-normal ml-2 text-[11px]">({s.width_mm}×{s.height_mm}mm)</span>
                  </td>
                  {layouts.map(l => {
                    const price = getPrice(s.id, l.id);
                    const isEditing = editPrice?.size_id === s.id && editPrice?.layout_id === l.id;
                    const promotionalPrice = pricing.find(
                      p => Number(p.size_id) === Number(s.id) &&
                          Number(p.layout_id) === Number(l.id)
                    )?.promotional_price;
                    return (
                     <td key={l.id} className="px-4 py-3 text-center">
  {isEditing ? (
    <div className="flex flex-col items-center gap-2">
      {/* Actual selling price */}
      <div className="flex items-center gap-1">
        <span className="text-z-muted">₹</span>

        <input
          value={editPrice!.price}
          onChange={e =>
            setEditPrice({
              ...editPrice!,
              price: e.target.value.replace(/\D/g, ''),
            })
          }
          className={`w-20 ${inputClsLg} border-z-orange text-center font-black`}
          placeholder="Price"
          autoFocus
        />
      </div>

      {/* Promotional strike-through price */}
      <div className="flex items-center gap-1">
        <span className="text-z-muted line-through">₹</span>

        <input
          type="number"
          min="0"
          step="0.01"
          value={editPrice!.promotional_price}
          onChange={e =>
            setEditPrice({
              ...editPrice!,
              promotional_price: e.target.value,
            })
          }
          className={`w-20 ${inputClsLg} border-z-orange/40 text-center`}
          placeholder="Promo"
          title="Promotional display price"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={savePrice}
          disabled={pricingLoading}
          className="p-1.5 bg-green-100 dark:bg-green-900/30 border border-green-400"
        >
          {pricingLoading ? (
            <Spinner />
          ) : (
            <Check className="w-4 h-4 text-green-700 dark:text-green-400" />
          )}
        </button>

        <button
          onClick={() => setEditPrice(null)}
          className="p-1.5 bg-red-50 dark:bg-red-900/30 border border-red-300"
        >
          <X className="w-4 h-4 text-red-500" />
        </button>
      </div>
    </div>
  ) : price ? (
    <div className="flex items-center justify-center gap-1 group">
      <button
        onClick={() =>
          setEditPrice({
            size_id: s.id,
            layout_id: l.id,
            price: String(price),
            promotional_price:
              promotionalPrice != null
                ? String(promotionalPrice)
                : '',
          })
        }
        className="font-black text-z-orange hover:bg-z-orange hover:text-white px-3 py-1.5 transition-all text-[13px]"
      >
        <span className="flex flex-col items-center">
          <span>₹{Number(price).toLocaleString('en-IN')}</span>

          {promotionalPrice != null &&
            Number(promotionalPrice) > Number(price) && (
              <span className="text-[10px] text-z-muted line-through">
                ₹{Number(promotionalPrice).toLocaleString('en-IN')}
              </span>
            )}
        </span>
      </button>

      <button
        onClick={() => deletePrice(s.id, l.id)}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all"
        title="Remove price"
      >
        <Trash2 className="w-4 h-4 text-red-400" />
      </button>
    </div>
  ) : (
    <button
      onClick={() =>
        setEditPrice({
          size_id: s.id,
          layout_id: l.id,
          price: '',
          promotional_price: '',
        })
      }
      className="text-z-muted hover:text-z-orange px-3 py-1.5 transition-all border border-dashed border-z-border/30 hover:border-z-orange text-[11px]"
    >
      + Add
    </button>
  )}
</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sizes.length === 0 && layouts.length === 0 && (
          <p className="text-center py-8 font-mono text-[12px] text-z-muted uppercase border-2 border-dashed border-z-border/30 mt-4">Add sizes and layouts below to build the pricing grid</p>
        )}
      </div>

      {/* Collections & Layouts (side by side) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Collections */}
        <div className="border-2 border-z-border/20 p-6 bg-z-paper shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
          <h3 className="text-[12px] font-mono font-black uppercase tracking-widest text-z-ink mb-5 border-b-2 border-z-orange/30 pb-3 flex items-center gap-2">
            <Tag className="w-4 h-4 text-z-orange" /> Collections <span className="text-z-orange">({collections.length})</span> {catLoading && <Spinner />}
          </h3>
          <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
            {collections.map(c => (
              <div key={c.id} className="flex justify-between items-center text-[12px] font-mono py-2.5 px-3 border border-z-border/10 hover:border-z-orange/30 transition-all group bg-z-paper rounded-sm">
                {editCat?.id === c.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input value={editCat!.name} onChange={e => setEditCat({...editCat!, name: e.target.value})} 
                      className={`flex-1 ${inputClsLg}`}
                      onKeyDown={e => { if (e.key === 'Enter') updateCategory(); if (e.key === 'Escape') setEditCat(null); }} autoFocus />
                    <button onClick={updateCategory} disabled={catLoading} className="p-1.5 active:scale-90 transition-transform disabled:opacity-50">{catLoading ? <Spinner /> : <Check className="w-4 h-4 text-green-600 dark:text-green-400" />}</button>
                    <button onClick={() => setEditCat(null)} className="p-1.5 active:scale-90 transition-transform"><X className="w-4 h-4 text-red-500" /></button>
                  </div>
                ) : (
                  <>
                    <span className="text-z-ink font-bold">{c.name}</span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditCat({ id: c.id, name: c.name })} className={iconBtnCls}><Edit2 className="w-4 h-4 text-z-orange" /></button>
                      <button onClick={() => deleteCategory(c.id)} disabled={catLoading} className={`${iconBtnCls} disabled:opacity-50`}><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {collections.length === 0 && <p className="text-[11px] font-mono text-z-muted italic text-center py-4">No collections yet</p>}
          </div>
          <div className="flex gap-2">
            <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New collection" 
              className={`flex-1 ${inputClsLg}`}
              onKeyDown={e => { if (e.key === 'Enter') addCategory(); }} />
            <button onClick={addCategory} disabled={catLoading} className={addBtnClsLg}>
              {catLoading ? <Spinner /> : <><Plus className="w-4 h-4" /> Add</>}
            </button>
          </div>
        </div>

        {/* Layouts */}
        <div className="border-2 border-z-border/20 p-6 bg-z-paper shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
          <h3 className="text-[12px] font-mono font-black uppercase tracking-widest text-z-ink mb-5 border-b-2 border-z-orange/30 pb-3 flex items-center gap-2">
            <Tag className="w-4 h-4 text-z-orange" /> Layouts <span className="text-z-orange">({layouts.length})</span> {layoutLoading && <Spinner />}
          </h3>
          <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
            {layouts.map(l => (
              <div key={l.id} className="flex justify-between items-center text-[12px] font-mono py-2.5 px-3 border border-z-border/10 hover:border-z-orange/30 transition-all group bg-z-paper rounded-sm">
                {editLayout?.id === l.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input value={editLayout!.name} onChange={e => setEditLayout({...editLayout!, name: e.target.value})} className={`flex-1 ${inputClsLg}`} />
                    <input value={editLayout!.panel_count} onChange={e => setEditLayout({...editLayout!, panel_count: e.target.value.replace(/\D/g, '')})} className={`w-14 ${inputClsLg} text-center`} placeholder="#" />
                    <button onClick={updateLayout} disabled={layoutLoading} className="p-1.5 active:scale-90 transition-transform disabled:opacity-50">{layoutLoading ? <Spinner /> : <Check className="w-4 h-4 text-green-600 dark:text-green-400" />}</button>
                    <button onClick={() => setEditLayout(null)} className="p-1.5 active:scale-90 transition-transform"><X className="w-4 h-4 text-red-500" /></button>
                  </div>
                ) : (
                  <>
                    <span className="text-z-ink"><span className="font-bold">{l.name}</span> <span className="text-z-muted">· {l.panel_count} panel(s)</span></span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditLayout({ id: l.id, name: l.name, panel_count: String(l.panel_count) })} className={iconBtnCls}><Edit2 className="w-4 h-4 text-z-orange" /></button>
                      <button onClick={() => deleteLayout(l.id)} disabled={layoutLoading} className={`${iconBtnCls} disabled:opacity-50`}><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {layouts.length === 0 && <p className="text-[11px] font-mono text-z-muted italic text-center py-4">No layouts yet</p>}
          </div>
          <div className="flex gap-2">
            <input value={newLayout.name} onChange={e => setNewLayout({...newLayout, name: e.target.value})} placeholder="Name" className={`flex-1 ${inputClsLg}`} />
            <input value={newLayout.panel_count} onChange={e => setNewLayout({...newLayout, panel_count: e.target.value.replace(/\D/g, '')})} placeholder="Panels" className={`w-20 ${inputClsLg} text-center`} />
            <button onClick={addLayout} disabled={layoutLoading} className={addBtnClsLg}>{layoutLoading ? <Spinner /> : <><Plus className="w-4 h-4" /> Add</>}</button>
          </div>
        </div>
      </div>

      {/* Sizes & Margins (full width) */}
      <div className="border-2 border-z-border/20 p-6 bg-z-paper shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
        <h3 className="text-[12px] font-mono font-black uppercase tracking-widest text-z-ink mb-5 border-b-2 border-z-orange/30 pb-3 flex items-center gap-2">
          <Tag className="w-4 h-4 text-z-orange" /> Sizes & Margins <span className="text-z-orange">({sizes.length})</span> {sizeLoading && <Spinner />}
        </h3>
        <div className="space-y-2 mb-5 max-h-80 overflow-y-auto">
          {sizes.map(s => (
            <div key={s.id} className="text-[12px] font-mono py-3 px-4 border border-z-border/10 hover:border-z-orange/30 transition-all group bg-z-paper rounded-sm">
              {editSize?.id === s.id ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-z-muted uppercase font-bold w-12">Name</span>
                      <input value={editSize!.name} onChange={e => setEditSize({...editSize!, name: e.target.value})} className={`w-28 ${inputClsLg}`} placeholder="Name" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-z-muted uppercase font-bold w-12">Size</span>
                      <input value={editSize!.width_mm} onChange={e => setEditSize({...editSize!, width_mm: e.target.value})} className={`w-16 ${inputClsLg} text-center`} placeholder="W" />
                      <span className="text-z-muted font-bold">×</span>
                      <input value={editSize!.height_mm} onChange={e => setEditSize({...editSize!, height_mm: e.target.value})} className={`w-16 ${inputClsLg} text-center`} placeholder="H" />
                      <span className="text-[10px] text-z-muted">mm</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[10px] text-z-muted uppercase font-bold w-12">Margins</span>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] text-z-muted mb-0.5">Top</span>
                        <input value={editSize!.margin_top} onChange={e => setEditSize({...editSize!, margin_top: e.target.value})} className={`w-14 ${inputClsLg} text-center`} />
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] text-z-muted mb-0.5">Bottom</span>
                        <input value={editSize!.margin_bottom} onChange={e => setEditSize({...editSize!, margin_bottom: e.target.value})} className={`w-14 ${inputClsLg} text-center`} />
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] text-z-muted mb-0.5">Left</span>
                        <input value={editSize!.margin_left} onChange={e => setEditSize({...editSize!, margin_left: e.target.value})} className={`w-14 ${inputClsLg} text-center`} />
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] text-z-muted mb-0.5">Right</span>
                        <input value={editSize!.margin_right} onChange={e => setEditSize({...editSize!, margin_right: e.target.value})} className={`w-14 ${inputClsLg} text-center`} />
                      </div>
                      <span className="text-[10px] text-z-muted">mm</span>
                    </div>
                    <div className="flex gap-2 ml-auto">
                      <button onClick={updateSize} disabled={sizeLoading} className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400 text-[10px] font-mono font-black uppercase active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1">{sizeLoading ? <Spinner /> : <><Check className="w-3.5 h-3.5" /> Save</>}</button>
                      <button onClick={() => setEditSize(null)} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/30 border border-red-300 text-red-500 text-[10px] font-mono font-black uppercase active:scale-95 transition-all flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-z-ink text-[13px]">{s.name}</span>
                    <span className="text-z-muted">{s.width_mm} × {s.height_mm} mm</span>
                    <span className="text-z-muted text-[10px] bg-z-orange/5 px-2 py-0.5 rounded-sm">margins: {s.margin_top} / {s.margin_bottom} / {s.margin_left} / {s.margin_right} mm</span>
                    {(() => {
                      const fe = framePricing.find(f => f.size_name === s.name);
                      const noFrame = !s.frame_only;
                      const withFrame = !!fe;
                      const label = noFrame && withFrame ? 'No Frame + Frame' : withFrame ? 'Frame Only' : noFrame ? 'No Frame Only' : 'Not Set';
                      const cls = (noFrame && withFrame) ? 'border-z-border/30 text-z-muted' : withFrame ? 'border-z-orange text-z-orange' : 'border-z-border/30 text-z-muted';
                      return <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 border ${cls}`}>{label}</span>;
                    })()}
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditSize({ id: s.id, name: s.name, width_mm: String(s.width_mm), height_mm: String(s.height_mm), margin_top: String(s.margin_top || 10), margin_bottom: String(s.margin_bottom || 10), margin_left: String(s.margin_left || 10), margin_right: String(s.margin_right || 10) })} className={iconBtnCls}><Edit2 className="w-4 h-4 text-z-orange" /></button>
                    <button onClick={() => deleteSize(s.id)} disabled={sizeLoading} className={`${iconBtnCls} disabled:opacity-50`}><Trash2 className="w-4 h-4 text-red-500" /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {sizes.length === 0 && <p className="text-[11px] font-mono text-z-muted italic text-center py-4">No sizes yet</p>}
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex flex-col">
            <span className="text-[9px] text-z-muted uppercase font-bold mb-1">Name</span>
            <input value={newSize.name} onChange={e => setNewSize({...newSize, name: e.target.value})} placeholder="e.g. A3" className={`w-24 ${inputClsLg}`} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-z-muted uppercase font-bold mb-1">Width</span>
            <input value={newSize.width_mm} onChange={e => setNewSize({...newSize, width_mm: e.target.value.replace(/\D/g, '')})} placeholder="mm" className={`w-16 ${inputClsLg} text-center`} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-z-muted uppercase font-bold mb-1">Height</span>
            <input value={newSize.height_mm} onChange={e => setNewSize({...newSize, height_mm: e.target.value.replace(/\D/g, '')})} placeholder="mm" className={`w-16 ${inputClsLg} text-center`} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-z-muted uppercase font-bold mb-1">T</span>
            <input value={newSize.margin_top} onChange={e => setNewSize({...newSize, margin_top: e.target.value.replace(/\D/g, '')})} placeholder="10" className={`w-12 ${inputClsLg} text-center`} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-z-muted uppercase font-bold mb-1">B</span>
            <input value={newSize.margin_bottom} onChange={e => setNewSize({...newSize, margin_bottom: e.target.value.replace(/\D/g, '')})} placeholder="10" className={`w-12 ${inputClsLg} text-center`} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-z-muted uppercase font-bold mb-1">L</span>
            <input value={newSize.margin_left} onChange={e => setNewSize({...newSize, margin_left: e.target.value.replace(/\D/g, '')})} placeholder="10" className={`w-12 ${inputClsLg} text-center`} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-z-muted uppercase font-bold mb-1">R</span>
            <input value={newSize.margin_right} onChange={e => setNewSize({...newSize, margin_right: e.target.value.replace(/\D/g, '')})} placeholder="10" className={`w-12 ${inputClsLg} text-center`} />
          </div>
          <button onClick={addSize} disabled={sizeLoading} className={addBtnClsLg}>{sizeLoading ? <Spinner /> : <><Plus className="w-4 h-4" /> Add Size</>}</button>
        </div>
      </div>

      {/* Frame Availability & Pricing */}
      <div className="border-2 border-z-border/20 p-6 bg-z-paper shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
        <h3 className="text-[12px] font-mono font-black uppercase tracking-widest text-z-ink mb-2 border-b-2 border-z-orange/30 pb-3 flex items-center gap-2">
          <Tag className="w-4 h-4 text-z-orange" /> Frame Availability &amp; Pricing
        </h3>
        <p className="text-[10px] font-mono text-z-muted mb-4">At least one option must be selected per size. With Frame requires a price. Changes apply only after Save.</p>
        {sizes.length === 0 && <p className="text-[11px] font-mono text-z-muted italic text-center py-3">Add sizes above first</p>}
        {sizes.length > 0 && (
          <div className="grid grid-cols-[1fr_160px_220px_auto] gap-x-4 mb-2 px-3 items-center">
            <span className="text-[9px] font-mono font-black uppercase text-z-muted">Size</span>
            <span className="text-[9px] font-mono font-black uppercase text-z-muted text-center">No Frame</span>
            <span className="text-[9px] font-mono font-black uppercase text-z-muted text-center">With Frame + Price (&#8377;)</span>
            <span />
          </div>
        )}
        <div className="space-y-2">
          {sizes.map(s => {
            const draft = frameDraft[s.id] ?? { noFrame: !s.frame_only, withFrame: !!framePricing.find(f => f.size_name === s.name), framePrice: framePricing.find(f => f.size_name === s.name)?.price?.toString() ?? '' };
            const savedEntry = framePricing.find(f => f.size_name === s.name);
            const isDirty = draft.noFrame !== !s.frame_only || draft.withFrame !== !!savedEntry || (draft.withFrame && draft.framePrice !== (savedEntry?.price?.toString() ?? ''));
            const isLoading = !!frameRowLoading[s.id];
            const error = frameErrors[s.id];

            const setDraft = (patch: Partial<FrameDraft>) => {
              const fallback: FrameDraft = { noFrame: !s.frame_only, withFrame: !!savedEntry, framePrice: savedEntry?.price?.toString() ?? '' };
              setFrameDraft(p => ({ ...p, [s.id]: { ...(p[s.id] ?? fallback), ...patch } }));
              setFrameErrors(p => ({ ...p, [s.id]: '' }));
            };

            const save = async () => {
              if (!draft.noFrame && !draft.withFrame) {
                setFrameErrors(p => ({ ...p, [s.id]: 'Select at least one option.' }));
                return;
              }
              if (draft.withFrame && (!draft.framePrice || parseInt(draft.framePrice, 10) <= 0)) {
                setFrameErrors(p => ({ ...p, [s.id]: 'Enter a valid frame price.' }));
                return;
              }
              setFrameRowLoading(p => ({ ...p, [s.id]: true }));
              try {
                await api.put(`/api/admin/sizes/${s.id}`, { frame_only: !draft.noFrame }, h(token));
                if (draft.withFrame) {
                  await api.post('/api/admin/frame-pricing', { size_name: s.name, price: parseInt(draft.framePrice, 10) }, h(token));
                } else if (savedEntry) {
                  await api.delete(`/api/admin/frame-pricing/${savedEntry.id}`, h(token));
                }
                await reload();
              } finally {
                setFrameRowLoading(p => ({ ...p, [s.id]: false }));
              }
            };

            return (
              <div key={s.id} className={`grid grid-cols-[1fr_160px_220px_auto] gap-x-4 items-center py-3 px-3 border transition-all ${
                error ? 'border-red-300 bg-red-50/30 dark:bg-red-900/10' : isDirty ? 'border-z-orange/40 bg-z-orange/[0.02]' : 'border-z-border/10 bg-z-paper'
              }`}>
                <div>
                  <span className="font-mono font-black text-[13px] text-z-ink">{s.name}</span>
                  <span className="text-[10px] font-mono text-z-muted ml-2">{s.width_mm}×{s.height_mm}mm</span>
                  {error && <p className="text-[9px] font-mono text-red-500 mt-0.5">{error}</p>}
                </div>

                {/* No Frame */}
                <div className="flex items-center justify-center gap-2">
                  <input type="checkbox" id={`nf-${s.id}`} checked={draft.noFrame}
                    onChange={e => setDraft({ noFrame: e.target.checked })}
                    className="w-3.5 h-3.5 accent-z-orange cursor-pointer" />
                  <label htmlFor={`nf-${s.id}`} className={`text-[10px] font-mono font-black uppercase cursor-pointer ${
                    draft.noFrame ? 'text-z-ink' : 'text-z-muted'
                  }`}>Available</label>
                </div>

                {/* With Frame + price */}
                <div className="flex items-center justify-center gap-2">
                  <input type="checkbox" id={`wf-${s.id}`} checked={draft.withFrame}
                    onChange={e => setDraft({ withFrame: e.target.checked })}
                    className="w-3.5 h-3.5 accent-z-orange cursor-pointer" />
                  <label htmlFor={`wf-${s.id}`} className={`text-[10px] font-mono font-black uppercase cursor-pointer ${
                    draft.withFrame ? 'text-z-ink' : 'text-z-muted'
                  }`}>Available</label>
                  <input
                    type="number" min="1"
                    value={draft.framePrice}
                    placeholder="price"
                    onChange={e => setDraft({ framePrice: e.target.value })}
                    disabled={!draft.withFrame}
                    className={`w-20 ${inputClsLg} text-center ${
                      !draft.withFrame ? 'opacity-30 cursor-not-allowed' :
                      (draft.withFrame && (!draft.framePrice || parseInt(draft.framePrice,10) <= 0)) ? 'border-red-400' : 'border-z-orange/50'
                    }`}
                  />
                </div>

                {/* Save */}
                <button onClick={save} disabled={isLoading || !isDirty}
                  className="px-3 py-1.5 bg-z-orange text-white text-[9px] font-mono font-black uppercase flex items-center gap-1 hover:bg-z-orange/80 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                  {isLoading ? <Spinner /> : <><Check className="w-3 h-3" /> Save</>}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Material Pricing */}
      <div className="border-2 border-z-border/20 p-6 bg-z-paper shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
        <h3 className="text-[12px] font-mono font-black uppercase tracking-widest text-z-ink mb-2 border-b-2 border-z-orange/30 pb-3 flex items-center gap-2">
          <Tag className="w-4 h-4 text-z-orange" /> Material Pricing {materialLoading && <Spinner />}
        </h3>
        <p className="text-[10px] font-mono text-z-muted mb-4">Extra price added on top of base price. PAPER = 0 extra. METALLIC SHEET = extra charge.</p>
        <div className="space-y-2">
          {materialPricing.map(m => (
            <div key={m.id} className="flex items-center gap-3 text-[12px] font-mono py-2 px-3 border border-z-border/10 bg-z-paper">
              <span className="font-bold text-z-ink w-40">{m.material}</span>
              <span className="text-z-muted">Extra:</span>
              <input
                type="number" min="0"
                defaultValue={m.extra_price}
                onBlur={async e => {
                  const val = parseInt(e.target.value, 10);
                  if (isNaN(val) || val < 0) return;
                  await runMaterial(async () => { await api.post('/api/admin/material-pricing', { material: m.material, extra_price: val }, h(token)); await reload(); });
                }}
                className={`w-24 ${inputClsLg} text-center`}
              />
              <span className="text-z-muted">&#8377;</span>
            </div>
          ))}
          {materialPricing.length === 0 && <p className="text-[11px] font-mono text-z-muted italic text-center py-3">No materials found — restart server to seed defaults</p>}
        </div>
      </div>

      {/* Couriers */}
      <div className="border-2 border-z-border/20 p-6 bg-z-paper shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
        <h3 className="text-[12px] font-mono font-black uppercase tracking-widest text-z-ink mb-5 border-b-2 border-z-orange/30 pb-3 flex items-center gap-2">
          <Tag className="w-4 h-4 text-z-orange" /> Couriers <span className="text-z-orange">({couriers.length})</span> {courierLoading && <Spinner />}
        </h3>
        <p className="text-[10px] font-mono text-z-muted mb-4">Tracking URL must contain <code className="bg-z-ink/10 px-1">{'{tracking_id}'}</code> as placeholder. Example: https://www.delhivery.com/track/package/{'{tracking_id}'}</p>
        <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
          {couriers.map(c => (
            <div key={c.id} className="flex justify-between items-center text-[12px] font-mono py-2.5 px-3 border border-z-border/10 hover:border-z-orange/30 transition-all group bg-z-paper rounded-sm">
              <div>
                <span className="font-bold text-z-ink">{c.name}</span>
                <span className="text-z-muted text-[10px] ml-3 truncate max-w-[300px] inline-block align-bottom">{c.tracking_url}</span>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={async () => { await runCourier(async () => { await api.put(`/api/admin/couriers/${c.id}`, { is_active: !c.is_active }, h(token)); await reload(); }); }}
                  className={`px-2 py-1 text-[9px] font-mono font-black uppercase border transition-all ${c.is_active ? 'border-green-400 text-green-600' : 'border-red-300 text-red-500'}`}>
                  {c.is_active ? 'Active' : 'Inactive'}
                </button>
                <button onClick={async () => { await runCourier(async () => { await api.delete(`/api/admin/couriers/${c.id}`, h(token)); await reload(); }); }} disabled={courierLoading} className={`${iconBtnCls} disabled:opacity-50`}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}
          {couriers.length === 0 && <p className="text-[11px] font-mono text-z-muted italic text-center py-4">No couriers added yet</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input value={newCourier.name} onChange={e => setNewCourier({...newCourier, name: e.target.value})} placeholder="Courier name (e.g. Delhivery)" className={`w-48 ${inputClsLg}`} />
          <input value={newCourier.tracking_url} onChange={e => setNewCourier({...newCourier, tracking_url: e.target.value})} placeholder="https://track.example.com/{tracking_id}" className={`flex-1 min-w-[200px] ${inputClsLg}`} />
          <button onClick={async () => {
            if (!newCourier.name || !newCourier.tracking_url) return;
            await runCourier(async () => {
              await api.post('/api/admin/couriers', newCourier, h(token));
              setNewCourier({ name: '', tracking_url: '' });
              await reload();
            });
          }} disabled={courierLoading} className={addBtnClsLg}>{courierLoading ? <Spinner /> : <><Plus className="w-4 h-4" /> Add</>}</button>
        </div>
      </div>
    </div>
  );
}

