import { useCallback, useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { h } from "../pages/admin/shared";

export interface AppliedCoupon {
  code: string;
  type: "percent" | "flat";
  value: number;
  free_shipping: boolean;
  discount: number;
  final_amount: number;
}

interface Props {
  token: string | null;
  items: any[];
  addressId: number | null;
  applied: AppliedCoupon | null;
  onChange: (coupon: AppliedCoupon | null) => void;
}

export default function CouponInput({ token, items, addressId, applied, onChange }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Images (possibly huge base64) are not needed for pricing.
  const lean = useCallback(() => items.map(({ image, ...rest }) => rest), [items]);

  const validate = useCallback(
    async (value: string): Promise<AppliedCoupon> => {
      const { data } = await api.post(
        "/api/coupons/validate",
        { code: value, address_id: addressId, items: lean() },
        h(token)
      );
      return { ...data.coupon, discount: data.discount, final_amount: data.final_amount };
    },
    [addressId, lean, token]
  );

  // If the bag or address changes, re-check so the shown discount never goes stale.
  const cartKey = JSON.stringify([lean(), addressId]);
  const lastKey = useRef(cartKey);
  useEffect(() => {
    if (lastKey.current === cartKey) return;
    lastKey.current = cartKey;
    if (!applied) return;
    validate(applied.code)
      .then(onChange)
      .catch(() => {
        onChange(null);
        setError("Coupon removed: it no longer applies to this bag.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey]);

  const apply = async () => {
    const value = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (!value) return;
    if (!addressId) return setError("Select a delivery address first.");
    setLoading(true);
    setError(null);
    try {
      onChange(await validate(value));
      setCode("");
    } catch (e: any) {
      setError(e?.response?.data?.error || "Could not apply this coupon.");
    } finally {
      setLoading(false);
    }
  };

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-green-600/40 bg-green-50 px-3 py-2 text-sm">
        <span>
          <strong>{applied.code}</strong> applied · you save ₹{applied.discount}
        </span>
        <button type="button" onClick={() => onChange(null)} className="text-xs underline">
          Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="Coupon code"
          maxLength={30}
          className="flex-1 rounded-lg border px-3 py-2 text-sm uppercase"
        />
        <button
          type="button"
          onClick={apply}
          disabled={loading || !code.trim()}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Checking…" : "Apply"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}