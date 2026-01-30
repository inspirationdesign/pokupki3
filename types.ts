
export interface CategoryDef {
  id: string;
  name: string;
  emoji: string;
}

export interface ProductItem {
  id: string;
  name: string;
  categoryId: string;
  completed: boolean;
  onList: boolean;
  purchaseCount: number;
  completedAt?: number;
}

export interface ShoppingSet {
  id: string;
  name: string;
  emoji: string;
  items: { name: string; categoryName: string; emoji: string }[];
  usageCount?: number;
}

export interface PurchaseLog {
  id: string;
  date: number; 
  items: { name: string; categoryId: string }[];
}

export type ViewMode = 'buy' | 'history' | 'sets' | 'settings';

export interface SmartCategoryResponse {
  categoryName: string; 
  suggestedEmoji: string;
  isNew: boolean;
}
