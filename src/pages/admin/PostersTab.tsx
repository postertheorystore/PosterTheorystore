import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Upload, Star, Search } from 'lucide-react';
import api from '../../lib/api';
import { h, Spinner, MicroBadge, Input, Label } from './shared';

export default function PostersTab({ token }: { token: string | null }) {
  const [products, setProducts] = useState<any[]>([]);
  const [collections, setCategories] = useState<any[]>([]);
  const [sizes, setSizes] = useState<any[]>([]);
  const [layouts, setLayouts] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deletingImg, setDeletingImg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [imageError, setImageError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;
  const searchRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    if (q.startsWith('#')) {
      const tag = q.slice(1);
      if (!tag) return products;
      return products.filter(p => (p.tags || []).some((t: string) => t.toLowerCase().includes(tag)));
    }
    return products.filter(p => p.title?.toLowerCase().includes(q));
  }, [products, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [search]);

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    const results: { label: string; type: string }[] = [];
    if (q.startsWith('#')) {
      const tag = q.slice(1);
      if (!tag) return [];
      const seen = new Set<string>();
      for (const p of products) {
        for (const t of (p.tags || [])) {
          if (t.toLowerCase().includes(tag) && !seen.has(t.toLowerCase())) {
            seen.add(t.toLowerCase());
            results.push({ label: t, type: '#tag' });
            if (results.length >= 10) return results;
          }
        }
      }
    } else {
      for (const p of products) {
        if (p.title?.toLowerCase().includes(q)) {
          results.push({ label: p.title, type: 'title' });
          if (results.length >= 10) return results;
        }
      }
    }
    return results;
  }, [products, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function emptyForm() {
    return { title: '', description: '', collection_id: '', tags: '', orientation: 'portrait' as string, available_sizes: [] as number[], available_layouts: [] as number[], frame_options: ['no_frame', 'with_frame'] as string[], status: 'active', is_featured: false, is_trending: false, is_new_arrival: true, is_bestseller: false };
  }

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/products', h(token)),
      api.get('/api/admin/collections', h(token)),
      api.get('/api/admin/sizes', h(token)),
      api.get('/api/admin/layouts', h(token)),
    ]).then(([p, c, s, l]) => {
      setProducts(Array.isArray(p.data) ? p.data : []);
      setCategories(Array.isArray(c.data) ? c.data : []);
      setSizes(Array.isArray(s.data) ? s.data : []);
      setLayouts(Array.isArray(l.data) ? l.data : []);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (form.available_sizes.length === 0) errors.available_sizes = 'Select at least one size';
    if (form.available_layouts.length === 0) errors.available_layouts = 'Select at least one layout';
    if (imageFiles.length === 0) errors.images = 'Please select at least one image';
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    setSubmitting(true);
    const fd = new FormData();
    fd.append('title', form.title);
    fd.append('description', form.description);
    fd.append('collection_id', form.collection_id);
    fd.append('tags', JSON.stringify(form.tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)));
    fd.append('orientation', form.orientation);
    fd.append('frame_options', JSON.stringify(form.frame_options));
    fd.append('available_sizes', JSON.stringify(form.available_sizes));
    fd.append('available_layouts', JSON.stringify(form.available_layouts));
    fd.append('status', form.status);
    fd.append('is_featured', String(form.is_featured));
    fd.append('is_trending', String(form.is_trending));
    fd.append('is_new_arrival', String(form.is_new_arrival));
    fd.append('is_bestseller', String(form.is_bestseller));
    for (const file of imageFiles) {
      fd.append('images', file);
    }

    try {
      const res = await api.post('/api/admin/products', fd, { ...h(token), headers: { ...h(token).headers, 'Content-Type': 'multipart/form-data' } });
      setProducts(prev => [res.data, ...prev]);
      setForm(emptyForm());
      setImageFiles([]);
    
} catch (error: any) {
  console.error(
    'Create poster failed:',
    error.response?.data || error
  );

  alert(
    error.response?.data?.error ||
    error.response?.data?.message ||
    error.message ||
    'Failed to create poster. Check the backend terminal.'
  );
} finally {
  setSubmitting(false);
}

  };

  const openEdit = async (product: any) => {
    setSelected(product);
    setEditErrors({});
    setEditForm({
      title: product.title || '',
      description: product.description || '',
      collection_id: product.collection_id || '',
      tags: Array.isArray(product.tags) ? product.tags.map((t: string) => `#${t}`).join(', ') : '',
      orientation: product.orientation || 'portrait',
      frame_options: Array.isArray(product.frame_options) ? product.frame_options : ['no_frame', 'with_frame'],
      available_sizes: Array.isArray(product.available_sizes) ? product.available_sizes : [],
      available_layouts: Array.isArray(product.available_layouts) ? product.available_layouts : [],
      status: product.status || 'active',
      is_featured: !!product.is_featured,
      is_trending: !!product.is_trending,
      is_new_arrival: !!product.is_new_arrival,
      is_bestseller: !!product.is_bestseller,
      totalOrdered: null as number | null,
    });
    // Fetch order stats for this product
    try {
      const res = await api.get(`/api/admin/products/${product.id}/stats`, h(token));
      setEditForm((prev: any) => prev ? { ...prev, totalOrdered: res.data.totalOrdered } : prev);
    } catch {}
  };

  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const handleUpdate = async () => {
    if (!selected || !editForm) return;
    const errors: Record<string, string> = {};
    if (editForm.available_sizes.length === 0) errors.available_sizes = 'Select at least one size';
    if (editForm.available_layouts.length === 0) errors.available_layouts = 'Select at least one layout';
    if (Object.keys(errors).length > 0) { setEditErrors(errors); return; }
    setEditErrors({});
    setSaving(true);
    try {
      const payload = {
        title: editForm.title,
        description: editForm.description,
        collection_id: editForm.collection_id || null,
        tags: editForm.tags.split(',').map((t: string) => t.trim().replace(/^#/, '')).filter(Boolean),
        orientation: editForm.orientation,
        frame_options: editForm.frame_options,
        available_sizes: editForm.available_sizes,
        available_layouts: editForm.available_layouts,
        status: editForm.status,
        is_featured: editForm.is_featured,
        is_trending: editForm.is_trending,
        is_new_arrival: editForm.is_new_arrival,
        is_bestseller: editForm.is_bestseller,
      };
      const res = await api.put(`/api/admin/products/${selected.id}`, payload, h(token));
      setProducts(prev => prev.map(p => p.id === selected.id ? { ...p, ...res.data } : p));
      setSelected(null);
      setEditForm(null);
    } catch { alert("Update failed"); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/products/${selected.id}`, h(token));
      setProducts(prev => prev.filter(p => p.id !== selected.id));
      setSelected(null);
      setEditForm(null);
    } catch {}
    setDeleting(false);
  };

  const toggleArr = (arr: number[], val: number) => arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Add Form */}
      <div className="lg:col-span-5">
        <div className="bg-z-paper border-2 border-z-border/20 p-6 shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
          <h2 className="text-[11px] font-mono font-black uppercase tracking-widest text-z-ink mb-6 pb-3 border-b-2 border-z-orange/30">Add Poster</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Title" value={form.title} onChange={v => setForm({...form, title: v})} required />
            <Input label="Description" value={form.description} onChange={v => setForm({...form, description: v})} />
            
            <div>
              <Label>Collection</Label>
              <select value={form.collection_id} onChange={e => setForm({...form, collection_id: e.target.value})} required className="w-full bg-z-paper border-2 border-z-border/30 px-3 py-2 text-[11px] font-mono uppercase text-z-ink focus:outline-none focus:border-z-orange transition-colors">
                <option value="">Select...</option>
                {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <Input label="Tags (#tag, comma separated)" value={form.tags} onChange={v => setForm({...form, tags: v})} />

            <div>
              <Label>Orientation</Label>
              <div className="flex gap-2">
                {['portrait', 'landscape', 'both'].map(o => (
                  <button type="button" key={o} onClick={() => setForm({...form, orientation: o})}
                    className={`px-3 py-1 text-[9px] font-mono font-black uppercase border-2 transition-all active:scale-95 ${
                      form.orientation === o ? 'bg-z-orange text-white border-z-orange' : 'border-z-border/30 hover:border-z-orange hover:text-z-orange text-z-ink'
                    }`}>
                    {o}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Frame Options</Label>
              <div className="flex gap-2">
                {[{ val: 'no_frame', label: 'Without Frame' }, { val: 'with_frame', label: 'With Frame' }].map(({ val, label }) => (
                  <button type="button" key={val}
                    onClick={() => setForm({ ...form, frame_options: form.frame_options.includes(val) ? form.frame_options.filter(v => v !== val) : [...form.frame_options, val] })}
                    className={`px-3 py-1 text-[9px] font-mono font-black uppercase border-2 transition-all active:scale-95 ${
                      form.frame_options.includes(val) ? 'bg-z-orange text-white border-z-orange' : 'border-z-border/30 hover:border-z-orange hover:text-z-orange text-z-ink'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Available Sizes</Label>
              <div className="flex flex-wrap gap-2">
                {sizes.map(s => (
                  <button type="button" key={s.id} onClick={() => { setForm({...form, available_sizes: toggleArr(form.available_sizes, s.id)}); setFormErrors(prev => ({...prev, available_sizes: ''})); }}
                    className={`px-3 py-1 text-[9px] font-mono font-black uppercase border-2 transition-all active:scale-95 ${
                      form.available_sizes.includes(s.id) ? 'bg-z-orange text-white border-z-orange' : 'border-z-border/30 hover:border-z-orange hover:text-z-orange text-z-ink'
                    }`}>
                    {s.name}
                  </button>
                ))}
              </div>
              {formErrors.available_sizes && <p className="text-red-500 text-[9px] font-mono font-black uppercase mt-1">{formErrors.available_sizes}</p>}
            </div>

            <div>
              <Label>Available Layouts</Label>
              <div className="flex flex-wrap gap-2">
                {layouts.map(l => (
                  <button type="button" key={l.id} onClick={() => { setForm({...form, available_layouts: toggleArr(form.available_layouts, l.id)}); setFormErrors(prev => ({...prev, available_layouts: ''})); }}
                    className={`px-3 py-1 text-[9px] font-mono font-black uppercase border-2 transition-all active:scale-95 ${
                      form.available_layouts.includes(l.id) ? 'bg-z-orange text-white border-z-orange' : 'border-z-border/30 hover:border-z-orange hover:text-z-orange text-z-ink'
                    }`}>
                    {l.name}
                  </button>
                ))}
              </div>
              {formErrors.available_layouts && <p className="text-red-500 text-[9px] font-mono font-black uppercase mt-1">{formErrors.available_layouts}</p>}
            </div>

            <div>
              <Label>Status Flags</Label>
              <div className="flex flex-wrap gap-3">
                {(['is_featured', 'is_trending', 'is_new_arrival', 'is_bestseller'] as const).map(flag => (
                  <label key={flag} className="flex items-center gap-1.5 text-[9px] font-mono uppercase cursor-pointer text-z-ink">
                    <input type="checkbox" checked={form[flag]} onChange={() => setForm({...form, [flag]: !form[flag]})} className="w-3 h-3 accent-[var(--color-z-orange)]" />
                    {flag.replace('is_', '').replace('_', ' ')}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label>Status</Label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-z-paper border-2 border-z-border/30 px-3 py-2 text-[11px] font-mono uppercase text-z-ink focus:outline-none focus:border-z-orange transition-colors">
                <option value="active">Active</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>

            <div>
              <Label>Images (multiple allowed)</Label>
              <label className="inline-block px-4 py-2 bg-z-orange text-white text-[10px] font-mono font-black uppercase cursor-pointer hover:bg-z-orange-dark transition-all active:scale-95 mb-2">
                {imageFiles.length > 0 ? `${imageFiles.length} file(s)` : 'Choose Files'}
                <input type="file" accept="image/*" multiple onChange={e => { setImageFiles(Array.from(e.target.files || [])); setImageError(''); }} className="hidden" />
              </label>
              {imageFiles.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {imageFiles.map((f, idx) => (
                    <div key={idx} className="relative w-16 aspect-[210/297] border border-z-border/30 overflow-hidden">
                      <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setImageFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white flex items-center justify-center text-[8px] font-black">
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(imageError || formErrors.images) && <p className="text-red-500 text-[10px] font-mono font-black uppercase">{imageError || formErrors.images}</p>}
            <button type="submit" disabled={submitting} className="w-full bg-z-orange text-white py-3 text-[11px] font-mono font-black uppercase disabled:opacity-50 active:scale-95 transition-all hover:bg-z-orange-dark shadow-[4px_4px_0px_0px_var(--color-z-shadow)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]">
              {submitting ? <span className="flex items-center justify-center gap-2"><Spinner /> Uploading...</span> : 'Add Poster'}
            </button>
          </form>
        </div>
      </div>

      {/* Product Grid */}
      <div className="lg:col-span-7">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-mono font-black uppercase tracking-widest text-z-ink">All Posters <span className="text-z-orange">({filtered.length})</span></h3>
          <div className="relative" ref={searchRef}>
            <input type="text" placeholder="Title or #tag" value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              className="bg-z-paper border-2 border-z-border/30 px-3 py-1.5 pl-8 text-[10px] font-mono font-bold uppercase tracking-widest focus:outline-none focus:border-z-orange transition-all w-44" />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-z-muted" />
            {showDropdown && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-z-paper border-2 border-z-border/30 shadow-[4px_4px_0px_0px_var(--color-z-shadow)] z-50 max-h-52 overflow-y-auto scrollbar-thin">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => { setSearch(s.type === '#tag' ? `#${s.label}` : s.label); setShowDropdown(false); }}
                    className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-mono hover:bg-z-orange/10 transition-colors">
                    <span className="font-bold text-z-ink truncate">{s.type === '#tag' ? `#${s.label}` : s.label}</span>
                    <span className="text-[8px] font-black text-z-muted uppercase shrink-0 ml-2">{s.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {paginated.map(p => (
            <div key={p.id} onClick={() => openEdit(p)} className="border-2 border-z-border/20 overflow-hidden bg-z-paper group hover:border-z-orange/40 transition-colors cursor-pointer">
              <div className="aspect-[210/297] overflow-hidden"><img src={p.image?.startsWith('http') ? p.image : ''} alt={p.title} className="w-full h-full object-cover" /></div>
              <div className="p-2">
                <p className="text-[10px] font-mono font-black text-z-ink truncate">{p.title}</p>
                <p className="text-[9px] font-mono text-z-muted">{p.collection_name || 'No collection'}</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {p.is_featured && <MicroBadge>Featured</MicroBadge>}
                  {p.is_trending && <MicroBadge>Trending</MicroBadge>}
                  {p.is_bestseller && <MicroBadge>Bestseller</MicroBadge>}
                  {p.status === 'hidden' && <MicroBadge red>Hidden</MicroBadge>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 text-[10px] font-mono font-black uppercase border-2 border-z-border/30 disabled:opacity-30 hover:border-z-orange hover:text-z-orange transition-all active:scale-95">Prev</button>
            <span className="text-[10px] font-mono font-black text-z-ink">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1 text-[10px] font-mono font-black uppercase border-2 border-z-border/30 disabled:opacity-30 hover:border-z-orange hover:text-z-orange transition-all active:scale-95">Next</button>
          </div>
        )}
      </div>

      {/* Edit Panel (Overlay) */}
      {selected && editForm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-2 sm:p-4" onClick={() => { setSelected(null); setEditForm(null); }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-z-paper border-2 border-z-border shadow-[8px_8px_0px_0px_var(--color-z-shadow)] p-4 sm:p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setSelected(null); setEditForm(null); }} className="absolute top-3 right-3 w-8 h-8 bg-z-ink text-z-paper flex items-center justify-center hover:opacity-80">
              <X className="w-4 h-4" />
            </button>

            {/* Image preview + upload + set main */}
            <div className="mb-5">
              <Label>Images</Label>
              <div className="flex gap-3 flex-wrap">
                {(Array.isArray(selected.images) ? selected.images : [selected.image]).filter(Boolean).map((img: string, idx: number) => (
                  <div key={idx} className="relative w-20 sm:w-28 aspect-[210/297] border border-z-border/30 overflow-hidden group/img">
                    <img src={img?.startsWith('http') ? img : ''} alt="" className="w-full h-full object-cover" />
                    {deletingImg === img && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Spinner /></div>}
                    {/* Delete image */}
                    <button disabled={deletingImg === img} onClick={async () => {
                      setDeletingImg(img);
                      try {
                        const res = await api.put(`/api/admin/products/${selected.id}/remove-image`, { imageUrl: img }, h(token));
                        setSelected((prev: any) => ({ ...prev, images: res.data.images, image: res.data.image }));
                        setProducts(prev => prev.map(p => p.id === selected.id ? { ...p, images: res.data.images, image: res.data.image } : p));
                      } catch {}
                      setDeletingImg(null);
                    }} className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white flex items-center justify-center text-[9px] font-black opacity-0 group-hover/img:opacity-100 transition-opacity">
                      &times;
                    </button>
                    {/* Set as main */}
                    {selected.image !== img && (
                      <button onClick={async () => {
                        try {
                          const res = await api.put(`/api/admin/products/${selected.id}/set-main-image`, { imageUrl: img }, h(token));
                          setSelected((prev: any) => ({ ...prev, image: res.data.image, images: res.data.images }));
                          setProducts(prev => prev.map(p => p.id === selected.id ? { ...p, image: res.data.image, images: res.data.images } : p));
                        } catch { alert('Failed to set main image'); }
                      }} className="absolute bottom-0 right-0 w-5 h-5 bg-blue-500 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity" title="Set as main">
                        <Star className="w-3 h-3" />
                      </button>
                    )}
                    {selected.image === img && <span className="absolute bottom-0 left-0 bg-z-orange text-white text-[7px] font-mono font-black px-1">MAIN</span>}
                  </div>
                ))}
              </div>
              {/* Upload new images */}
              <label className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-z-ink text-z-paper text-[11px] font-mono font-black uppercase cursor-pointer hover:opacity-80 transition-all active:scale-95">
                <Upload className="w-3.5 h-3.5" /> Add Images
                <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  const fd = new FormData();
                  for (const f of files) fd.append('images', f);
                  try {
                    const res = await api.post(`/api/admin/products/${selected.id}/upload-images`, fd, { ...h(token), headers: { ...h(token).headers, 'Content-Type': 'multipart/form-data' } });
                    setSelected((prev: any) => ({ ...prev, images: res.data.images, image: res.data.image }));
                    setProducts(prev => prev.map(p => p.id === selected.id ? { ...p, images: res.data.images, image: res.data.image } : p));
                  } catch { alert('Upload failed'); }
                  e.target.value = '';
                }} />
              </label>
            </div>

            <h3 className="text-[13px] font-mono font-black uppercase tracking-widest text-z-ink mb-5 pb-3 border-b-2 border-z-orange/30">Edit Poster</h3>

            {/* Total Ordered Stats */}
            <div className="mb-5 p-3 border-2 border-z-orange/20 bg-z-orange/5">
              <p className="text-[9px] font-mono uppercase tracking-widest text-z-muted font-black">Total Ordered</p>
              <p className="font-display font-black text-2xl text-z-orange">
                {editForm.totalOrdered !== null ? editForm.totalOrdered : '...'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <Input label="Title" value={editForm.title} onChange={v => setEditForm({...editForm, title: v})} required />
              <Input label="Description" value={editForm.description} onChange={v => setEditForm({...editForm, description: v})} />

              <div>
                <Label>Collection</Label>
                <select value={editForm.collection_id} onChange={e => setEditForm({...editForm, collection_id: e.target.value})} className="w-full bg-z-paper border-2 border-z-border/30 px-3 py-2 text-[11px] font-mono uppercase text-z-ink focus:outline-none focus:border-z-orange transition-colors">
                  <option value="">None</option>
                  {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <Input label="Tags (#tag, comma separated)" value={editForm.tags} onChange={v => setEditForm({...editForm, tags: v})} />

              <div>
                <Label>Orientation</Label>
                <div className="flex gap-2">
                  {['portrait', 'landscape', 'both'].map(o => (
                    <button type="button" key={o} onClick={() => setEditForm({...editForm, orientation: o})}
                      className={`px-3 py-1 text-[9px] font-mono font-black uppercase border-2 transition-all active:scale-95 ${
                        editForm.orientation === o ? 'bg-z-orange text-white border-z-orange' : 'border-z-border/30 hover:border-z-orange hover:text-z-orange text-z-ink'
                      }`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Frame Options</Label>
                <div className="flex gap-2">
                  {[{ val: 'no_frame', label: 'Without Frame' }, { val: 'with_frame', label: 'With Frame' }].map(({ val, label }) => (
                    <button type="button" key={val}
                      onClick={() => setEditForm({ ...editForm, frame_options: editForm.frame_options.includes(val) ? editForm.frame_options.filter((v: string) => v !== val) : [...editForm.frame_options, val] })}
                      className={`px-3 py-1 text-[9px] font-mono font-black uppercase border-2 transition-all active:scale-95 ${
                        editForm.frame_options.includes(val) ? 'bg-z-orange text-white border-z-orange' : 'border-z-border/30 hover:border-z-orange hover:text-z-orange text-z-ink'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Available Sizes</Label>
                <div className="flex flex-wrap gap-2">
                  {sizes.map(s => (
                    <button type="button" key={s.id} onClick={() => { setEditForm({...editForm, available_sizes: toggleArr(editForm.available_sizes, s.id)}); setEditErrors(prev => ({...prev, available_sizes: ''})); }}
                      className={`px-3 py-1 text-[9px] font-mono font-black uppercase border-2 transition-all active:scale-95 ${
                        editForm.available_sizes.includes(s.id) ? 'bg-z-orange text-white border-z-orange' : 'border-z-border/30 hover:border-z-orange hover:text-z-orange text-z-ink'
                      }`}>
                      {s.name}
                    </button>
                  ))}
                </div>
                {editErrors.available_sizes && <p className="text-red-500 text-[9px] font-mono font-black uppercase mt-1">{editErrors.available_sizes}</p>}
              </div>

              <div>
                <Label>Available Layouts</Label>
                <div className="flex flex-wrap gap-2">
                  {layouts.map(l => (
                    <button type="button" key={l.id} onClick={() => { setEditForm({...editForm, available_layouts: toggleArr(editForm.available_layouts, l.id)}); setEditErrors(prev => ({...prev, available_layouts: ''})); }}
                      className={`px-3 py-1 text-[9px] font-mono font-black uppercase border-2 transition-all active:scale-95 ${
                        editForm.available_layouts.includes(l.id) ? 'bg-z-orange text-white border-z-orange' : 'border-z-border/30 hover:border-z-orange hover:text-z-orange text-z-ink'
                      }`}>
                      {l.name}
                    </button>
                  ))}
                </div>
                {editErrors.available_layouts && <p className="text-red-500 text-[9px] font-mono font-black uppercase mt-1">{editErrors.available_layouts}</p>}
              </div>

              <div>
                <Label>Status Flags</Label>
                <div className="flex flex-wrap gap-3">
                  {(['is_featured', 'is_trending', 'is_new_arrival', 'is_bestseller'] as const).map(flag => (
                    <label key={flag} className="flex items-center gap-1.5 text-[9px] font-mono uppercase cursor-pointer text-z-ink">
                      <input type="checkbox" checked={editForm[flag]} onChange={() => setEditForm({...editForm, [flag]: !editForm[flag]})} className="w-3 h-3 accent-[var(--color-z-orange)]" />
                      {flag.replace('is_', '').replace('_', ' ')}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label>Status</Label>
                <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} className="w-full bg-z-paper border-2 border-z-border/30 px-3 py-2 text-[11px] font-mono uppercase text-z-ink focus:outline-none focus:border-z-orange transition-colors">
                  <option value="active">Active</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-z-border/30 md:col-span-2">
                <button onClick={handleUpdate} disabled={saving} className="flex-1 bg-z-orange text-white py-3 text-[12px] font-mono font-black uppercase disabled:opacity-50 active:scale-95 transition-all hover:bg-z-orange-dark">
                  {saving ? <span className="flex items-center justify-center gap-2"><Spinner /> Saving...</span> : 'Save Changes'}
                </button>
                <button onClick={handleDelete} disabled={deleting} className="px-6 py-3 border-2 border-red-400 text-red-500 text-[12px] font-mono font-black uppercase hover:bg-red-500 hover:text-white transition-all active:scale-95 disabled:opacity-50">
                  {deleting ? <Spinner /> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


