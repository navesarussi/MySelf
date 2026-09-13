export type WealthCategory = "pension" | "insurance" | "investment" | "property" | "other";
export type WealthSource = "manual" | "cover_import" | "har_bituach" | "agent";

export type WealthItem = {
  id: string;
  category: WealthCategory;
  name: string;
  provider: string | null;
  balance: number;
  currency: string;
  notes: string | null;
  source: WealthSource;
  as_of_date: string | null;
  created_at: string;
  updated_at: string;
};

export type WealthSummary = {
  total: number;
  by_category: Record<WealthCategory, number>;
  items: WealthItem[];
};
