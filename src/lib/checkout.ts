// Remembers which delivery address was chosen in the Cart, so /payment survives a refresh.
const KEY = 'pt_checkout_address_id';

export const saveCheckoutAddressId = (id: number) => {
  try { sessionStorage.setItem(KEY, String(id)); } catch {}
};

export const readCheckoutAddressId = (): number | null => {
  try {
    const v = sessionStorage.getItem(KEY);
    const n = v ? parseInt(v, 10) : NaN;
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
};

export const clearCheckoutAddressId = () => {
  try { sessionStorage.removeItem(KEY); } catch {}
};