
import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { h, useAction, Spinner } from './shared';

interface Size {
  id: number;
  name: string;
  frame_only?: boolean;
  is_active?: boolean;
}

interface Promotion {
  promotion_name: string;
  buy_quantity: number;
  free_quantity: number;
  eligible_size_ids: number[];
  eligible_materials: string[];
  include_framed: boolean;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
}

const toLocalInput = (value: string | null) => {
  if (!value) return "";

  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function PromotionSettings({
  token,
}: {
  token: string | null;
}) {
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");

  const loadSettings = async () => {
    try {
      const [promotionRes, sizesRes] = await Promise.all([
        api.get("/api/admin/promotions", h(token)),
        api.get("/api/admin/sizes", h(token)),
      ]);

      const data = promotionRes.data;

      setPromotion({
        promotion_name: data.promotion_name || "Buy X Get Y Free",
        buy_quantity: Number(data.buy_quantity),
        free_quantity: Number(data.free_quantity),
        eligible_size_ids: (data.eligible_size_ids || []).map(Number),
        eligible_materials: data.eligible_materials || ["PAPER"],
        include_framed: !!data.include_framed,
        is_active: !!data.is_active,
        start_date: data.start_date,
        end_date: data.end_date,
      });

      setStartDate(toLocalInput(data.start_date));
      setEndDate(toLocalInput(data.end_date));

      setSizes(Array.isArray(sizesRes.data) ? sizesRes.data : []);
    } catch (error: any) {
      setMessage(
        error.response?.data?.error || "Failed to load promotion settings"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const update = (changes: Partial<Promotion>) => {
    setPromotion((prev) => prev ? { ...prev, ...changes } : prev);
  };

  const toggleSize = (id: number) => {
    if (!promotion) return;

    const selected = promotion.eligible_size_ids.includes(id);

    update({
      eligible_size_ids: selected
        ? promotion.eligible_size_ids.filter((sizeId) => sizeId !== id)
        : [...promotion.eligible_size_ids, id],
    });
  };

  const toggleMaterial = (material: string) => {
    if (!promotion) return;

    const selected = promotion.eligible_materials.includes(material);

    update({
      eligible_materials: selected
        ? promotion.eligible_materials.filter((m) => m !== material)
        : [...promotion.eligible_materials, material],
    });
  };

  const savePromotion = async () => {
    if (!promotion) return;

    if (
      !Number.isInteger(Number(promotion.buy_quantity)) ||
      promotion.buy_quantity < 1 ||
      !Number.isInteger(Number(promotion.free_quantity)) ||
      promotion.free_quantity < 0
    ) {
      setMessage("Enter valid Buy and Free quantities.");
      return;
    }

    if (promotion.eligible_materials.length === 0) {
      setMessage("Select at least one eligible material.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const payload = {
        ...promotion,
        buy_quantity: Number(promotion.buy_quantity),
        free_quantity: Number(promotion.free_quantity),
        start_date: startDate
          ? new Date(startDate).toISOString()
          : null,
        end_date: endDate
          ? new Date(endDate).toISOString()
          : null,
      };

      const response = await api.put(
        "/api/admin/promotions",
        payload,
        h(token)
      );

      const saved = response.data.promotion;

      setPromotion({
        ...saved,
        eligible_size_ids: (saved.eligible_size_ids || []).map(Number),
        eligible_materials: saved.eligible_materials || [],
      });

      setStartDate(toLocalInput(saved.start_date));
      setEndDate(toLocalInput(saved.end_date));

      setMessage("Global promotion updated successfully.");
    } catch (error: any) {
      setMessage(
        error.response?.data?.error || "Failed to update promotion"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-5"><Spinner /></div>;
  }

  if (!promotion) {
    return (
      <div className="border-2 border-red-300 p-4 text-sm">
        {message || "Promotion settings could not be loaded."}
      </div>
    );
  }

  const textCls =
    "w-full bg-z-paper border-2 border-z-border/30 px-3 py-2 text-[11px] font-mono text-z-ink focus:outline-none focus:border-z-orange";

  return (
    <section className="mb-8 border-2 border-z-orange/40 bg-z-paper p-5 shadow-[4px_4px_0px_0px_var(--color-z-shadow)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b-2 border-z-orange/30 pb-3">
        <div>
          <h3 className="text-sm font-mono font-black uppercase text-z-ink">
            Global Buy X Get Y Promotion
          </h3>
          <p className="mt-1 text-[9px] font-mono text-z-muted">
            Changes apply globally to customer carts and future checkouts.
          </p>
        </div>

        <label className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase">
          <input
            type="checkbox"
            checked={promotion.is_active}
            onChange={(e) => update({ is_active: e.target.checked })}
            className="accent-[var(--color-z-orange)]"
          />
          Promotion Active
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[9px] font-mono uppercase text-z-muted">
            Promotion Name
          </label>
          <input
            className={textCls}
            value={promotion.promotion_name}
            onChange={(e) =>
              update({ promotion_name: e.target.value })
            }
          />
        </div>

        <div>
          <label className="mb-1 block text-[9px] font-mono uppercase text-z-muted">
            Buy Quantity
          </label>
          <input
            type="number"
            min="1"
            max="100"
            className={textCls}
            value={promotion.buy_quantity}
            onChange={(e) =>
              update({ buy_quantity: Number(e.target.value) })
            }
          />
        </div>

        <div>
          <label className="mb-1 block text-[9px] font-mono uppercase text-z-muted">
            Free Quantity
          </label>
          <input
            type="number"
            min="0"
            max="100"
            className={textCls}
            value={promotion.free_quantity}
            onChange={(e) =>
              update({ free_quantity: Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div className="mt-5">
        <h4 className="mb-2 text-[10px] font-mono font-black uppercase text-z-ink">
          Eligible Poster Sizes
        </h4>

        <p className="mb-3 text-[9px] font-mono text-z-muted">
          Select sizes that qualify. Selecting none means all sizes,
          subject to the backend eligibility rules.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sizes.map((size) => (
            <label
              key={size.id}
              className="flex items-center gap-2 border border-z-border/20 p-2 text-[10px] font-mono"
            >
              <input
                type="checkbox"
                checked={promotion.eligible_size_ids.includes(size.id)}
                onChange={() => toggleSize(size.id)}
                className="accent-[var(--color-z-orange)]"
              />
              {size.name}
              {size.frame_only ? " (Frame only)" : ""}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <h4 className="mb-2 text-[10px] font-mono font-black uppercase text-z-ink">
          Eligible Materials
        </h4>

        <div className="flex flex-wrap gap-4">
          {["PAPER", "METALLIC"].map((material) => (
            <label
              key={material}
              className="flex items-center gap-2 text-[10px] font-mono"
            >
              <input
                type="checkbox"
                checked={promotion.eligible_materials.includes(material)}
                onChange={() => toggleMaterial(material)}
                className="accent-[var(--color-z-orange)]"
              />
              {material}
            </label>
          ))}
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-[10px] font-mono">
        <input
          type="checkbox"
          checked={promotion.include_framed}
          onChange={(e) =>
            update({ include_framed: e.target.checked })
          }
          className="accent-[var(--color-z-orange)]"
        />
        Include framed posters
      </label>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[9px] font-mono uppercase text-z-muted">
            Promotion Starts
          </label>
          <input
            type="datetime-local"
            className={textCls}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-[9px] font-mono uppercase text-z-muted">
            Promotion Ends
          </label>
          <input
            type="datetime-local"
            className={textCls}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      {message && (
        <p className="mt-4 text-[10px] font-mono text-z-orange">
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={savePromotion}
        disabled={saving}
        className="mt-5 w-full bg-z-orange px-4 py-3 text-[10px] font-mono font-black uppercase text-white hover:bg-z-orange-dark disabled:opacity-50 sm:w-auto"
      >
        {saving ? "Saving..." : "Save Global Promotion"}
      </button>
    </section>
  );
}
