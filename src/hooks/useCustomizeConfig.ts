import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  DEFAULT_SIZES,
  buildPaperSizes,
  buildCustomMargins,
  buildSizePrices,
  buildLayoutPrices,
  PORTRAIT_ONLY_SIZES,
  type SizeConfig,
  type LayoutConfig,
  type CustomizeConfig,
} from '../config/paperSizes';

export interface FramePriceEntry { id: number; size_name: string; price: number; }
export interface MaterialPriceEntry { id: number; material: string; extra_price: number; }


export type PricingCategory = 'framed_photo' | 'print_only';

export interface CategoryPriceEntry {
  id: number;
  category: PricingCategory;
  size_id: number;
  size_name: string;
  width_mm: number;
  height_mm: number;
  price: number;
}


export function useCustomizeConfig() {
  const [sizes, setSizes] = useState<SizeConfig[]>(DEFAULT_SIZES);
  const [layouts, setLayouts] = useState<LayoutConfig[]>([{ name: 'Single', panel_count: 1 }]);
  const [paperSizes, setPaperSizes] = useState(buildPaperSizes(DEFAULT_SIZES));
  const [customMargins, setCustomMargins] = useState(buildCustomMargins(DEFAULT_SIZES));
  const [sizePrices, setSizePrices] = useState<Record<string, number>>({});
  const [layoutPrices, setLayoutPrices] = useState<Record<string, number>>({});
  const [portraitOnly, setPortraitOnly] = useState<string[]>(PORTRAIT_ONLY_SIZES);
  const [framePricing, setFramePricing] = useState<FramePriceEntry[]>([]);
  const [materialPricing, setMaterialPricing] = useState<MaterialPriceEntry[]>([]);
  const [categoryPricing, setCategoryPricing] =
  useState<CategoryPriceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get<
        CustomizeConfig & {
          framePricing: FramePriceEntry[];
          materialPricing: MaterialPriceEntry[];
          categoryPricing: CategoryPriceEntry[];
        }
      >('/api/products/customize-config')
      .then(res => {
        const { sizes: dbSizes, layouts: dbLayouts, pricing, framePricing: fp, materialPricing: mp,categoryPricing: cp, } = res.data;
        if (dbSizes.length > 0) {
          setSizes(dbSizes);
          setPaperSizes(buildPaperSizes(dbSizes));
          setCustomMargins(buildCustomMargins(dbSizes));
          setPortraitOnly(dbSizes.filter(s => s.width_mm >= s.height_mm || PORTRAIT_ONLY_SIZES.includes(s.name)).map(s => s.name));
        }
        if (dbLayouts && dbLayouts.length > 0) setLayouts(dbLayouts);
        if (pricing.length > 0) {
          setSizePrices(buildSizePrices(pricing));
          setLayoutPrices(buildLayoutPrices(pricing));
        }
        if (fp) setFramePricing(fp);
        if (mp) setMaterialPricing(mp);
        if (cp) setCategoryPricing(cp);
      })
      .catch(() => {
        setSizePrices({ 'A3': 199, 'A4': 129, 'A5': 99, 'A6': 69, 'Polaroid': 49, 'Pocket': 39 });
      })
      .finally(() => setLoading(false));
  }, []);

  return { sizes, layouts, paperSizes, customMargins, sizePrices, layoutPrices, portraitOnly, framePricing, materialPricing, categoryPricing, loading };
}
