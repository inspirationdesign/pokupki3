import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CategoryDef, ProductItem, ViewMode, ShoppingSet, PurchaseLog } from './types';
import { DEFAULT_CATEGORIES, INITIAL_ITEMS, EMOJI_LIST } from './constants';
import { categorizeProduct, parseDictatedText, generateSetItems, analyzeHistoryForSets } from './services/geminiService';
import { Icons } from './components/Icon';

// Interface for Telegram User
interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface FamilyMember {
  telegram_id: number;
  username?: string;
  photo_url?: string;
}

const ItemRow: React.FC<{
  item: ProductItem;
  countBadge?: number;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ item, countBadge, onToggle, onEdit, onDelete }) => (
  <div className={`group flex items-center justify-between p-3 transition-all ${item.completed ? 'opacity-50' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer ${item.completed ? 'bg-primary border-primary text-white' : 'border-slate-300 dark:border-slate-600'}`}
      >
        {item.completed && <Icons.Check size={12} strokeWidth={4} />}
      </div>
      <div className="flex-1 min-w-0 cursor-default" onClick={(e) => e.stopPropagation()}>
        <p className={`font-bold text-sm truncate transition-all ${item.completed ? 'line-through text-slate-400' : ''}`}>{item.name}</p>
      </div>
      {countBadge && (
        <div className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-[9px] font-black text-slate-500">
          {countBadge}
        </div>
      )}
    </div>
    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-2 text-slate-300 hover:text-primary transition-colors"><Icons.Pencil size={14} /></button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Icons.Trash2 size={14} /></button>
    </div>
  </div>
);

const SetCard: React.FC<{
  set: ShoppingSet;
  isAdded: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAdd: () => void;
}> = ({ set, isAdded, onEdit, onDelete, onAdd }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{set.emoji}</span>
          <h3 className="font-black truncate max-w-[140px]">{set.name}</h3>
          {set.usageCount !== undefined && set.usageCount > 0 && (
            <div className="w-6 h-6 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center text-[10px] font-black text-slate-400 shadow-inner">
              {set.usageCount}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="p-2 text-slate-300 hover:text-primary transition-colors"><Icons.Pencil size={16} /></button>
          <button onClick={onDelete} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Icons.Trash2 size={16} /></button>
        </div>
      </div>

      <div className="mb-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-left">
            Товары ({set.items.length})
          </span>
          <Icons.ChevronDown className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} size={14} />
        </button>

        {isExpanded && (
          <div className="mt-3 flex flex-wrap gap-2 animate-bounce-short">
            {set.items.map((it, idx) => (
              <span key={idx} className="px-2 py-1 bg-slate-100 dark:bg-slate-700/50 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300 border border-transparent dark:border-slate-700">
                {it.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onAdd}
        disabled={isAdded}
        className={`w-full py-4 font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all ${isAdded ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-default' : 'bg-primary text-white hover:opacity-95 active:scale-[0.98]'}`}
      >
        {isAdded ? 'Добавлено' : 'В список покупок'}
      </button>
    </div>
  );
};

const App: React.FC = () => {
  const [categories, setCategories] = useState<CategoryDef[]>(() => {
    const saved = localStorage.getItem('lumina_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });
  const [items, setItems] = useState<ProductItem[]>(() => {
    const saved = localStorage.getItem('lumina_items');
    return saved ? JSON.parse(saved) : INITIAL_ITEMS;
  });
  const [sets, setSets] = useState<ShoppingSet[]>(() => {
    const saved = localStorage.getItem('lumina_sets');
    return saved ? JSON.parse(saved) : [];
  });
  const [logs, setLogs] = useState<PurchaseLog[]>(() => {
    const saved = localStorage.getItem('lumina_logs');
    return saved ? JSON.parse(saved) : [];
  });
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('lumina_dark') === 'true');

  // AI is disabled by default unless explicitly enabled
  const [isAiEnabled, setIsAiEnabled] = useState(() => localStorage.getItem('lumina_ai_enabled') === 'true');

  const [confirmDelete, setConfirmDelete] = useState(() => localStorage.getItem('lumina_confirm_delete') !== 'false');
  const [confirmItemDelete, setConfirmItemDelete] = useState(() => localStorage.getItem('lumina_confirm_item_delete') !== 'false');
  const [confirmSetDelete, setConfirmSetDelete] = useState(() => localStorage.getItem('lumina_confirm_set_delete') !== 'false');

  const [viewMode, setViewMode] = useState<ViewMode>('buy');
  const [historyTab, setHistoryTab] = useState<'top' | 'categories'>('top');
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');

  // Telegram User State
  const [tgUser, setTgUser] = useState<TelegramUser | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  // ADMIN STATE
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminStats, setAdminStats] = useState<any[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState(false);

  const fetchAdminStats = async () => {
    if (!tgUser) return;
    setIsAdminLoading(true);
    try {
      const response = await fetch(`/api/admin/stats?admin_user_id=${tgUser.id}`);
      if (response.ok) {
        const data = await response.json();
        setAdminStats(data);
        setIsAdminModalOpen(true);
      } else {
        showToast("Доступ запрещен", true);
      }
    } catch (e) {
      console.error(e);
      showToast("Ошибка сети", true);
    } finally {
      setIsAdminLoading(false);
    }
  };
  const [isFamilyLoading, setIsFamilyLoading] = useState(false);

  // Modals
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSetModalOpen, setIsSetModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isParsedModalOpen, setIsParsedModalOpen] = useState(false);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAiAnalysisModalOpen, setIsAiAnalysisModalOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ isOpen: boolean, categoryId: string | null }>({ isOpen: false, categoryId: null });
  const [itemDeleteConfirmModal, setItemDeleteConfirmModal] = useState<{ isOpen: boolean, item: ProductItem | null }>({ isOpen: false, item: null });
  const [deleteSetConfirmModal, setDeleteSetConfirmModal] = useState<{ isOpen: boolean, set: ShoppingSet | null }>({ isOpen: false, set: null });
  const [tempDontAskAgain, setTempDontAskAgain] = useState(false);

  // Partial Set Add Modal State
  const [partialSetModal, setPartialSetModal] = useState<{ isOpen: boolean, set: ShoppingSet | null, selectedIndices: number[] }>({ isOpen: false, set: null, selectedIndices: [] });

  // Voice Parsed Editing
  const [editingParsedIndex, setEditingParsedIndex] = useState<number | null>(null);
  const [editingParsedName, setEditingParsedName] = useState('');

  // State to handle item update after creating a new category
  const [itemToUpdateAfterCategory, setItemToUpdateAfterCategory] = useState<{ id?: string, name: string, onList: boolean } | null>(null);

  // Undo System
  const [lastDeletedItem, setLastDeletedItem] = useState<ProductItem | null>(null);
  const [lastCompletedItem, setLastCompletedItem] = useState<string | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [showCompletedUndoToast, setShowCompletedUndoToast] = useState(false);
  const undoTimerRef = useRef<any>(null);
  const completedUndoTimerRef = useRef<any>(null);

  // States for Editing/Adding
  const [editingItem, setEditingItem] = useState<ProductItem | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemCategoryId, setEditItemCategoryId] = useState('');

  const [editingCategory, setEditingCategory] = useState<CategoryDef | null>(null);
  const [catName, setCatName] = useState('');
  const [catEmoji, setCatEmoji] = useState('📦');

  // Sets State
  const [editingSet, setEditingSet] = useState<ShoppingSet | null>(null);
  const [newSetName, setNewSetName] = useState('');
  const [newSetEmoji, setNewSetEmoji] = useState('📦');
  const [newSetManualItems, setNewSetManualItems] = useState('');
  const [setCreationMode, setSetCreationMode] = useState<'text' | 'history' | 'ai'>('text');
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<string[]>([]);
  // New state for AI generated set preview
  const [aiSetPreviewItems, setAiSetPreviewItems] = useState<{ name: string, categoryName: string, emoji: string, checked?: boolean }[]>([]);
  const [editingAiSetIndex, setEditingAiSetIndex] = useState<number | null>(null);
  const [editingAiSetName, setEditingAiSetName] = useState('');

  const [parsedItems, setParsedItems] = useState<any[]>([]);
  const [detectedDishName, setDetectedDishName] = useState<string | null>(null);
  const [aiSuggestedSets, setAiSuggestedSets] = useState<any[]>([]);

  // Track recently added sets visually
  const [addedSetIds, setAddedSetIds] = useState<string[]>([]);

  const [addItemText, setAddItemText] = useState('');
  const [addItemCategory, setAddItemCategory] = useState<string>('dept_none');

  // Bulk Add State
  const [bulkAddCategory, setBulkAddCategory] = useState<string | null>(null);
  const [bulkAddText, setBulkAddText] = useState('');

  const [selectedCalendarDate, setSelectedCalendarDate] = useState<number | null>(new Date().setHours(0, 0, 0, 0));
  const [toast, setToast] = useState<{ id: string, message: string, isError?: boolean } | null>(null);

  useEffect(() => {
    // Initialize Telegram WebApp
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.initDataUnsafe?.user) {
        setTgUser(tg.initDataUnsafe.user);
      } else {
        // Mock user for development outside Telegram
        setTgUser({ id: 0, first_name: 'Гость' });
      }

      // Update theme based on TG params if available
      if (tg.colorScheme === 'dark') {
        setDarkMode(true);
      }
    }
  }, []);

  // Backend Auth & Sync
  useEffect(() => {
    if (!tgUser) return;

    const authAndSync = async () => {
      setIsFamilyLoading(true);
      try {
        // Auth / Create User
        const authRes = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tgUser)
        });
        if (!authRes.ok) {
          const errText = await authRes.text();
          console.error("Auth Error:", errText);
          throw new Error(`Server error: ${authRes.status}`);
        }
        const authData = await authRes.json();

        // Check for invite code in start param
        const tg = (window as any).Telegram?.WebApp;
        const startParam = tg?.initDataUnsafe?.start_param;

        if (startParam && startParam.startsWith('invite_') && authData.family.invite_code !== startParam.replace('invite_', '')) {
          const joinRes = await fetch('/api/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invite_code: startParam.replace('invite_', ''), user_id: tgUser.id })
          });
          if (joinRes.ok) {
            const joinData = await joinRes.json();
            setFamilyMembers(joinData.family.members.filter((m: any) => m.telegram_id !== tgUser.id));
            setInviteCode(joinData.family.invite_code);
            setIsOwner(joinData.family.is_owner || false);
            showToast("Вы присоединились к семье!");
          }
        } else {
          setFamilyMembers(authData.family.members.filter((m: any) => m.telegram_id !== tgUser.id));
          setInviteCode(authData.family.invite_code);
          setIsOwner(authData.family.is_owner || false);
        }

        // Sync Items
        const itemsRes = await fetch(`/api/items?user_id=${tgUser.id}`);
        if (itemsRes.ok) {
          const remoteItems = await itemsRes.json();
          // Merge strategies could be complex, for now we treat server as source of truth for simplicity as per requirements
          // But we map them to our internal ProductItem structure
          const mappedItems: ProductItem[] = remoteItems.map((ri: any) => ({
            id: ri.id,
            name: ri.text,
            categoryId: ri.category || 'dept_none',
            completed: ri.is_bought,
            onList: true, // Assuming if it's in DB it's on list. Adjust logic if needed.
            purchaseCount: 0 // We might lose local purchase count if strictly syncing. 
          }));
          // Try to preserve local purchase counts if names match
          setItems(prev => {
            const existingMap = new Map(prev.map(i => [i.id, i]));
            return mappedItems.map(mi => ({
              ...mi,
              purchaseCount: existingMap.get(mi.id)?.purchaseCount || 0
            }));
          });
        }

      } catch (e) {
        console.error(e);
        showToast("Ошибка подключения к серверу", true);
      } finally {
        setIsFamilyLoading(false);
      }
    };

    authAndSync();
  }, [tgUser]);

  // WebSocket for real-time sync
  useEffect(() => {
    if (!tgUser || tgUser.id === 0) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/${tgUser.id}`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'item_added' || data.type === 'item_updated') {
            setItems(prev => {
              const exists = prev.find(i => i.id === data.item.id);
              if (exists) {
                return prev.map(i => i.id === data.item.id ? {
                  ...i,
                  name: data.item.text,
                  categoryId: data.item.category || 'dept_none',
                  completed: data.item.is_bought,
                  onList: true
                } : i);
              } else {
                return [...prev, {
                  id: data.item.id,
                  name: data.item.text,
                  categoryId: data.item.category || 'dept_none',
                  completed: data.item.is_bought,
                  onList: true,
                  purchaseCount: 0
                }];
              }
            });
          } else if (data.type === 'item_deleted') {
            setItems(prev => prev.filter(i => i.id !== data.item_id));
          }
        } catch (e) {
          console.error('WebSocket message error:', e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting in 3s...');
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws?.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [tgUser]);

  useEffect(() => {
    localStorage.setItem('lumina_categories', JSON.stringify(categories));
    localStorage.setItem('lumina_items', JSON.stringify(items));
    localStorage.setItem('lumina_sets', JSON.stringify(sets));
    localStorage.setItem('lumina_logs', JSON.stringify(logs));
    localStorage.setItem('lumina_dark', darkMode.toString());
    localStorage.setItem('lumina_ai_enabled', isAiEnabled.toString());
    localStorage.setItem('lumina_confirm_delete', confirmDelete.toString());
    localStorage.setItem('lumina_confirm_item_delete', confirmItemDelete.toString());
    localStorage.setItem('lumina_confirm_set_delete', confirmSetDelete.toString());

    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      (window as any).Telegram?.WebApp?.setHeaderColor('#020617');
      (window as any).Telegram?.WebApp?.setBackgroundColor('#020617');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      (window as any).Telegram?.WebApp?.setHeaderColor('#f8fafc'); // slate-50
      (window as any).Telegram?.WebApp?.setBackgroundColor('#f8fafc');
    }
  }, [categories, items, sets, logs, darkMode, isAiEnabled, confirmDelete, confirmItemDelete, confirmSetDelete]);

  useEffect(() => {
    const todayStr = new Date().setHours(0, 0, 0, 0);
    setItems(prev => prev.map(item => {
      if (item.completed && item.completedAt && new Date(item.completedAt).setHours(0, 0, 0, 0) < todayStr) {
        return { ...item, completed: false, onList: false, completedAt: undefined };
      }
      return item;
    }));
  }, []);

  // AUTO-REDIRECT TO ALL EFFECT
  useEffect(() => {
    if (selectedCategoryFilter === 'All') return;

    // Check if there are any active (uncompleted) items left in the selected category
    const hasActiveItems = items.some(
      i => i.onList && !i.completed && i.categoryId === selectedCategoryFilter
    );

    if (!hasActiveItems) {
      // Small timeout to allow UI to update tick check before switching
      const t = setTimeout(() => setSelectedCategoryFilter('All'), 300);
      return () => clearTimeout(t);
    }
  }, [items, selectedCategoryFilter]);

  const categoryRankings = useMemo(() => {
    const rankings: Record<string, number> = {};
    items.forEach(item => {
      rankings[item.categoryId] = (rankings[item.categoryId] || 0) + (item.purchaseCount || 0);
    });
    return rankings;
  }, [items]);

  const showToast = (message: string, isError = false) => {
    setToast({ id: Date.now().toString(), message, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAiError = (err: any) => {
    const msg = err?.message || "";
    if (msg.includes('429') || msg.includes('quota')) {
      showToast("Лимит ИИ. Попробуйте через минуту.", true);
    } else if (msg.includes('API ключ')) {
      showToast(msg, true);
    } else {
      showToast("Ошибка сервиса: " + (msg.slice(0, 20) + '...'), true);
    }
  };

  const getCategoryById = (id: string) => categories.find(c => c.id === id);

  const pluralizeRaz = (n: number) => {
    const lastDigit = n % 10;
    const lastTwoDigits = n % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'раз';
    if (lastDigit === 1) return 'раз';
    if (lastDigit >= 2 && lastDigit <= 4) return 'раза';
    return 'раз';
  };

  const finalizeAddItem = (name: string, categoryId: string, onList: boolean = true) => {
    const capName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);
    const existing = items.find(i => i.name.toLowerCase() === capName.toLowerCase());

    if (existing) {
      setItems(prev => prev.map(i => i.id === existing.id ? {
        ...i,
        onList: onList || i.onList,
        completed: onList ? false : i.completed,
        completedAt: onList ? undefined : i.completedAt,
        categoryId: categoryId !== 'dept_none' ? categoryId : i.categoryId
      } : i));
    } else {
      const newItem: ProductItem = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        name: capName,
        categoryId: categoryId || 'dept_none',
        completed: false,
        onList: onList,
        purchaseCount: 0
      };
      setItems(prev => [newItem, ...prev]);

      // Sync to backend
      if (tgUser) {
        fetch('/api/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: newItem.id,
            text: newItem.name,
            is_bought: newItem.completed,
            category: newItem.categoryId,
            user_id: tgUser.id
          })
        }).catch(console.error);
      }
    }
  };

  const addSetToBuyListDirect = (set: ShoppingSet) => {
    addSpecificItemsFromSet(set, set.items);
  };

  const addSpecificItemsFromSet = (set: ShoppingSet, itemsToAdd: { name: string; categoryName: string; emoji: string }[]) => {
    let updatedCats = [...categories];
    // Helper to ensure dept_none is last
    const reorderCats = (cats: CategoryDef[]) => {
      const others = cats.filter(c => c.id !== 'dept_none');
      const none = cats.find(c => c.id === 'dept_none') || { id: 'dept_none', name: 'Без категории', emoji: '⚪' };
      return [...others, none];
    };

    itemsToAdd.forEach(setItem => {
      const historyItem = items.find(i => i.name.toLowerCase() === setItem.name.toLowerCase());
      if (historyItem) {
        finalizeAddItem(setItem.name, historyItem.categoryId);
      } else {
        let cat = updatedCats.find(c => c.name.toLowerCase() === setItem.categoryName.toLowerCase());
        if (!cat) {
          cat = { id: 'dept_' + Date.now() + Math.random(), name: setItem.categoryName, emoji: setItem.emoji || '📦' };
          updatedCats.push(cat);
        }
        finalizeAddItem(setItem.name, cat.id);
      }
    });
    setCategories(reorderCats(updatedCats));
    setAddedSetIds(prev => [...prev, set.id]);
    setSets(prev => prev.map(s => s.id === set.id ? { ...s, usageCount: (s.usageCount || 0) + 1 } : s));
    showToast(itemsToAdd.length === set.items.length ? `Набор "${set.name}" добавлен` : `Добавлено ${itemsToAdd.length} товаров из набора`);
    setTimeout(() => {
      setAddedSetIds(prev => prev.filter(id => id !== set.id));
    }, 5000);
  };

  const handleAddItemFromModal = async (forcedCategoryId?: string, onList: boolean = true) => {
    if (!addItemText.trim() || isAiLoading) return;
    const name = addItemText.trim();
    let targetId = forcedCategoryId || addItemCategory;

    setIsAddModalOpen(false);
    setAddItemText('');
    setAddItemCategory('dept_none');

    const existingItem = items.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (existingItem) {
      finalizeAddItem(name, targetId !== 'dept_none' ? targetId : existingItem.categoryId, onList);
      return;
    }

    if (!isAiEnabled || (targetId !== 'dept_none' && targetId !== 'other')) {
      finalizeAddItem(name, targetId, onList);
      return;
    }

    setIsAiLoading(true);
    try {
      const smart = await categorizeProduct(name, categories);
      if (smart) {
        let existingCat = categories.find(c => c.name.toLowerCase() === smart.categoryName.toLowerCase());
        if (!existingCat) {
          const newCat = { id: 'dept_' + Date.now(), name: smart.categoryName, emoji: smart.suggestedEmoji || '📦' };
          // Ensure new categories are added before 'dept_none'
          setCategories(prev => {
            const others = prev.filter(c => c.id !== 'dept_none');
            const none = prev.find(c => c.id === 'dept_none') || { id: 'dept_none', name: 'Без категории', emoji: '⚪' };
            return [...others, newCat, none];
          });
          targetId = newCat.id;
        } else targetId = existingCat.id;
      }
      finalizeAddItem(name, targetId, onList);
    } catch (err) {
      finalizeAddItem(name, 'dept_none', onList);
      handleAiError(err);
    } finally { setIsAiLoading(false); }
  };

  const handleBulkAdd = () => {
    if (!bulkAddText.trim() || !bulkAddCategory) return;
    const lines = bulkAddText.split('\n').map(l => l.trim()).filter(l => l);
    lines.forEach(name => finalizeAddItem(name, bulkAddCategory, viewMode === 'buy')); // onList is true if we are in buy mode, otherwise standard behavior (could be just to history)

    // Actually, finalizeAddItem third arg 'onList' defaults to true.
    // If we are in History view, adding an item usually means adding to database AND potentially to list?
    // The previous logic for single item add in history was `finalizeAddItem(..., ..., true)`.
    // So default behavior is correct.

    setIsBulkAddModalOpen(false);
    setBulkAddText('');
    setBulkAddCategory(null);
    showToast(`Добавлено ${lines.length} товаров`);
  };

  const toggleComplete = (id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const newCompleted = !item.completed;
        // Sync to backend
        if (tgUser) {
          fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: item.id,
              text: item.name,
              is_bought: newCompleted,
              category: item.categoryId,
              user_id: tgUser.id
            })
          }).catch(console.error);
        }

        const now = Date.now();
        const today = new Date().setHours(0, 0, 0, 0);

        setLogs(currentLogs => {
          if (newCompleted) {
            const logEntry = currentLogs.find(l => new Date(l.date).setHours(0, 0, 0, 0) === today);
            const itemForLog = { name: item.name, categoryId: item.categoryId };
            if (logEntry) {
              return currentLogs.map(l => l.id === logEntry.id ? { ...l, items: [...l.items, itemForLog] } : l);
            } else {
              return [{ id: Date.now().toString(), date: now, items: [itemForLog] }, ...currentLogs];
            }
          } else {
            const logEntry = currentLogs.find(l => new Date(l.date).setHours(0, 0, 0, 0) === today);
            if (logEntry) {
              const lastIndex = logEntry.items.map(i => i.name).lastIndexOf(item.name);
              if (lastIndex !== -1) {
                const newItems = [...logEntry.items];
                newItems.splice(lastIndex, 1);
                return currentLogs.map(l => l.id === logEntry.id ? { ...l, items: newItems } : l);
              }
            }
            return currentLogs;
          }
        });

        if (newCompleted) {
          setLastCompletedItem(id);
          setShowCompletedUndoToast(true);
          if (completedUndoTimerRef.current) clearTimeout(completedUndoTimerRef.current);
          completedUndoTimerRef.current = setTimeout(() => setShowCompletedUndoToast(false), 5000);
          return { ...item, completed: true, purchaseCount: item.purchaseCount + 1, completedAt: now };
        }
        return { ...item, completed: false, completedAt: undefined };
      }
      return item;
    }));
  };

  const undoCompletion = () => {
    if (lastCompletedItem) {
      const today = new Date().setHours(0, 0, 0, 0);
      const itemToUndo = items.find(i => i.id === lastCompletedItem);
      if (itemToUndo) {
        setLogs(currentLogs => {
          const logEntry = currentLogs.find(l => new Date(l.date).setHours(0, 0, 0, 0) === today);
          if (logEntry) {
            const lastIndex = logEntry.items.map(i => i.name).lastIndexOf(itemToUndo.name);
            if (lastIndex !== -1) {
              const newItems = [...logEntry.items];
              newItems.splice(lastIndex, 1);
              return currentLogs.map(l => l.id === logEntry.id ? { ...l, items: newItems } : l);
            }
          }
          return currentLogs;
        });
      }
      setItems(prev => prev.map(it => it.id === lastCompletedItem ? { ...it, completed: false, completedAt: undefined, purchaseCount: Math.max(0, it.purchaseCount - 1) } : it));
      setLastCompletedItem(null);
      setShowCompletedUndoToast(false);
    }
  };

  const toggleHistoryItem = (item: ProductItem) => {
    if (item.onList && !item.completed) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, onList: false } : i));
    } else {
      finalizeAddItem(item.name, item.categoryId);
    }
  };

  const startVoiceDictation = () => {
    if (isAiLoading) return;
    if (!isAiEnabled) { showToast("Включите ИИ", true); return; }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    rec.continuous = false;

    let hasProcessed = false;

    rec.onstart = () => setIsRecording(true);

    rec.onresult = async (e: any) => {
      if (hasProcessed) return;

      const last = e.results.length - 1;
      const text = e.results[last][0].transcript;

      if (e.results[last].isFinal && text.trim()) {
        hasProcessed = true;
        rec.stop();
        setIsRecording(false);

        setIsAiLoading(true);
        try {
          const result = await parseDictatedText(text, categories);
          if (result?.items.length) {
            setParsedItems(result.items.map((p: any) => ({ ...p, selected: true })));
            setDetectedDishName(result.dishName || null);
            setIsParsedModalOpen(true);
          }
        } catch (err) {
          handleAiError(err);
        } finally {
          setIsAiLoading(false);
        }
      }
    };

    rec.onerror = (e: any) => {
      if (e.error !== 'no-speech') {
        console.error("Speech Recognition Error", e.error);
      }
      setIsRecording(false);
    }

    rec.onend = () => {
      if (!hasProcessed) setIsRecording(false);
    };

    rec.start();
  };

  const performItemDelete = (item: ProductItem) => {
    setLastDeletedItem(item);
    setItems(prev => prev.filter(i => i.id !== item.id));

    // Sync to backend
    if (tgUser) {
      fetch(`/api/items/${item.id}?user_id=${tgUser.id}`, { method: 'DELETE' }).catch(console.error);
    }

    setItemDeleteConfirmModal({ isOpen: false, item: null });
    setShowUndoToast(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setShowUndoToast(false), 5000);
    if (tempDontAskAgain) setConfirmItemDelete(false);
  };

  const deleteItem = (item: ProductItem) => {
    if (confirmItemDelete) {
      setTempDontAskAgain(false);
      setItemDeleteConfirmModal({ isOpen: true, item });
    } else {
      performItemDelete(item);
    }
  };

  const openCategoryModal = (cat?: CategoryDef) => {
    if (cat?.id === 'dept_none') return; // Защита системной категории
    if (cat) {
      setEditingCategory(cat);
      setCatName(cat.name);
      setCatEmoji(cat.emoji);
    } else {
      setEditingCategory(null);
      setCatName('');
      setCatEmoji('📦');
    }
    setIsCategoryModalOpen(true);
  };

  const saveCategory = () => {
    if (!catName.trim()) return;
    const newCatId = 'dept_' + Date.now();

    setCategories(prev => {
      // Filter out existing edited category and the system 'No Category'
      const others = prev.filter(c => c.id !== 'dept_none' && (editingCategory ? c.id !== editingCategory.id : true));

      const newCat: CategoryDef = {
        id: editingCategory ? editingCategory.id : newCatId,
        name: catName,
        emoji: catEmoji
      };

      const systemNone = prev.find(c => c.id === 'dept_none') || { id: 'dept_none', name: 'Без категории', emoji: '⚪' };

      // Always put new/edited category before system 'No Category'
      return [...others, newCat, systemNone];
    });

    if (!editingCategory && itemToUpdateAfterCategory) {
      if (itemToUpdateAfterCategory.id) {
        setItems(prev => prev.map(i => i.id === itemToUpdateAfterCategory.id ? { ...i, name: itemToUpdateAfterCategory.name, categoryId: newCatId } : i));
      } else {
        finalizeAddItem(itemToUpdateAfterCategory.name, newCatId, itemToUpdateAfterCategory.onList);
      }
      setItemToUpdateAfterCategory(null);
      showToast("Товар обновлен");
    }

    setIsCategoryModalOpen(false);
  };

  const deleteCategory = (id: string) => {
    if (id === 'dept_none') return; // Защита
    if (confirmDelete) {
      setTempDontAskAgain(false);
      setDeleteConfirmModal({ isOpen: true, categoryId: id });
    } else {
      performDeleteCategory(id);
    }
  };

  const performDeleteCategory = (id: string) => {
    setItems(prev => prev.map(item => item.categoryId === id ? { ...item, categoryId: 'dept_none' } : item));
    setCategories(prev => prev.filter(c => c.id !== id));
    setIsCategoryModalOpen(false);
    setDeleteConfirmModal({ isOpen: false, categoryId: null });
    if (tempDontAskAgain) setConfirmDelete(false);
  };

  const performSetDelete = (set: ShoppingSet) => {
    setSets(prev => prev.filter(s => s.id !== set.id));
    setDeleteSetConfirmModal({ isOpen: false, set: null });
    showToast(`Набор "${set.name}" удален`);
  };

  const deleteSet = (set: ShoppingSet) => {
    if (confirmSetDelete) {
      setTempDontAskAgain(false);
      setDeleteSetConfirmModal({ isOpen: true, set });
    } else {
      performSetDelete(set);
    }
  };

  const inviteUser = () => {
    if (inviteCode) {
      const botUsername = "pokupkigross_bot";
      // FIX: Use /start?startapp= format so it works everywhere
      const link = `https://t.me/${botUsername}/start?startapp=invite_${inviteCode}`;
      if ((window as any).Telegram?.WebApp) {
        (window as any).Telegram.WebApp.openTelegramLink(link);
      } else {
        window.open(link, '_blank');
      }
    } else {
      showToast("Код приглашения еще не загружен");
    }
  };

  const leaveFamily = async () => {
    if (!tgUser) return;
    try {
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: tgUser.id })
      });
      if (res.ok) {
        const data = await res.json();
        setFamilyMembers([]);
        setInviteCode(data.family.invite_code);
        setIsOwner(true);
        showToast("Вы покинули семью");
      } else {
        showToast("Ошибка при выходе из семьи", true);
      }
    } catch (e) {
      console.error(e);
      showToast("Ошибка сети", true);
    }
  };

  const removeFamilyMember = async (targetUserId: number) => {
    if (!tgUser || !isOwner) return;
    try {
      const res = await fetch('/api/remove-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: tgUser.id, target_user_id: targetUserId })
      });
      if (res.ok) {
        const data = await res.json();
        setFamilyMembers(data.family.members.filter((m: any) => m.telegram_id !== tgUser.id));
        showToast("Пользователь удален из семьи");
      } else {
        showToast("Ошибка при удалении", true);
      }
    } catch (e) {
      console.error(e);
      showToast("Ошибка сети", true);
    }
  };

  const buyList = useMemo(() => {
    let filtered = items.filter(i => i.onList);
    if (selectedCategoryFilter !== 'All') filtered = filtered.filter(i => i.categoryId === selectedCategoryFilter);
    return filtered;
  }, [items, selectedCategoryFilter]);

  const historyList = useMemo(() => {
    // Unique list of items based on name for selection
    const unique = new Map();
    items.forEach(item => {
      if (!unique.has(item.name.toLowerCase())) {
        unique.set(item.name.toLowerCase(), item);
      }
    });
    return Array.from(unique.values()).sort((a, b) => b.purchaseCount - a.purchaseCount);
  }, [items]);

  const historyListFull = useMemo(() => [...items].sort((a, b) => b.purchaseCount - a.purchaseCount), [items]);

  const sortedGroupedHistoryList = useMemo(() => {
    const groups: Record<string, { cat: CategoryDef, items: ProductItem[], totalCount: number }> = {};
    historyListFull.forEach(item => {
      const cat = getCategoryById(item.categoryId) || { id: 'dept_none', name: 'Без категории', emoji: '⚪' };
      if (!groups[cat.id]) groups[cat.id] = { cat, items: [], totalCount: 0 };
      groups[cat.id].items.push(item);
      groups[cat.id].totalCount += item.purchaseCount;
    });
    Object.values(groups).forEach(group => group.items.sort((a, b) => b.purchaseCount - a.purchaseCount));
    return Object.values(groups).sort((a, b) => b.totalCount - a.totalCount);
  }, [historyListFull, categories]);

  // Вычисляем активные категории ТОЛЬКО на основе некупленных товаров в списке
  const activeCategoryIds = useMemo(() => {
    const activeIds = new Set<string>();
    items.forEach(item => {
      // Только не купленные, но находящиеся в списке
      if (item.onList && !item.completed) activeIds.add(item.categoryId);
    });
    return activeIds;
  }, [items]);

  const { activeGroups, completedToday } = useMemo(() => {
    const todayStr = new Date().setHours(0, 0, 0, 0);
    const active = buyList.filter(i => !i.completed);
    const completed = buyList.filter(i => i.completed && i.completedAt && new Date(i.completedAt).setHours(0, 0, 0, 0) === todayStr);

    const groups: Record<string, { cat: CategoryDef, items: ProductItem[] }> = {};

    active.forEach(item => {
      const cat = getCategoryById(item.categoryId) || { id: 'dept_none', name: 'Без категории', emoji: '⚪' };
      if (!groups[cat.id]) groups[cat.id] = { cat, items: [] };
      groups[cat.id].items.push(item);
    });

    // Сортируем товары внутри каждой группы по популярности
    Object.values(groups).forEach(g => {
      g.items.sort((a, b) => b.purchaseCount - a.purchaseCount);
    });

    return {
      // Сортируем сами группы по общему весу категории в истории
      activeGroups: Object.values(groups).sort((a, b) => (categoryRankings[b.cat.id] || 0) - (categoryRankings[a.cat.id] || 0)),
      completedToday: completed
    };
  }, [buyList, categories, categoryRankings]);

  // Сортировка тегов: самые популярные в истории категории стоят левее
  const sortedActiveCategories = useMemo(() => {
    return categories
      .filter(cat => activeCategoryIds.has(cat.id))
      .sort((a, b) => (categoryRankings[b.id] || 0) - (categoryRankings[a.id] || 0));
  }, [categories, activeCategoryIds, categoryRankings]);

  const groupedPurchasesOnDate = useMemo(() => {
    if (selectedCalendarDate === null) return [];
    const normalizedSelectedDate = new Date(selectedCalendarDate).setHours(0, 0, 0, 0);
    const log = logs.find(l => new Date(l.date).setHours(0, 0, 0, 0) === normalizedSelectedDate);
    if (!log) return [];
    const groups: Record<string, { cat: CategoryDef, items: { name: string, count: number }[] }> = {};
    const itemCount: Record<string, number> = {};
    log.items.forEach(it => {
      const key = `${it.categoryId}_${it.name}`;
      itemCount[key] = (itemCount[key] || 0) + 1;
    });
    const processedItems = new Set<string>();
    log.items.forEach(it => {
      const cat = getCategoryById(it.categoryId) || { id: 'dept_none', name: 'Без категории', emoji: '⚪' };
      const key = `${it.categoryId}_${it.name}`;
      if (!groups[cat.id]) groups[cat.id] = { cat, items: [] };
      if (!processedItems.has(key)) {
        groups[cat.id].items.push({ name: it.name, count: itemCount[key] });
        processedItems.add(key);
      }
    });
    return Object.values(groups);
  }, [selectedCalendarDate, logs, categories]);

  const sortedSets = useMemo(() => {
    return [...sets].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
  }, [sets]);

  const getTodayPurchaseCount = (itemName: string) => {
    const today = new Date().setHours(0, 0, 0, 0);
    const log = logs.find(l => new Date(l.date).setHours(0, 0, 0, 0) === today);
    return log ? log.items.filter(i => i.name === itemName).length : 0;
  };

  const uniqueHistoryDaysCount = useMemo(() => {
    return new Set(logs.map(l => new Date(l.date).setHours(0, 0, 0, 0))).size;
  }, [logs]);

  const handleManualSetCreate = () => {
    if (!newSetName.trim()) return;

    let setItems: { name: string, categoryName: string, emoji: string }[] = [];

    if (setCreationMode === 'text') {
      if (!newSetManualItems.trim()) return;
      const rawItems = newSetManualItems.split('\n').map(s => s.trim()).filter(s => s !== '');
      setItems = rawItems.map(name => {
        const historyItem = items.find(it => it.name.toLowerCase() === name.toLowerCase());
        const cat = categories.find(c => c.id === historyItem?.categoryId) || categories.find(c => c.id === 'dept_none')!;
        return {
          name: name.charAt(0).toUpperCase() + name.slice(1),
          categoryName: cat.name,
          emoji: cat.emoji || '📦'
        };
      });
    } else if (setCreationMode === 'history') {
      // History mode
      if (selectedHistoryItems.length === 0) return;
      setItems = selectedHistoryItems.map(id => {
        const item = items.find(i => i.id === id);
        if (!item) return null;
        const cat = categories.find(c => c.id === item.categoryId) || categories.find(c => c.id === 'dept_none')!;
        return {
          name: item.name,
          categoryName: cat.name,
          emoji: cat.emoji || '📦'
        };
      }).filter(i => i !== null) as any;
    } else if (setCreationMode === 'ai') {
      if (aiSetPreviewItems.length === 0) return;
      // Filter only checked items
      setItems = aiSetPreviewItems.filter(i => i.checked !== false).map(i => ({
        name: i.name,
        categoryName: i.categoryName,
        emoji: i.emoji
      }));
    }

    if (editingSet) {
      setSets(prev => prev.map(s => s.id === editingSet.id ? { ...s, name: newSetName, emoji: newSetEmoji, items: setItems } : s));
      showToast(`Набор "${newSetName}" обновлен`);
    } else {
      const newSet: ShoppingSet = {
        id: Date.now().toString(),
        name: newSetName,
        emoji: newSetEmoji,
        items: setItems,
        usageCount: 0
      };
      setSets(prev => [newSet, ...prev]);
      showToast(`Набор "${newSetName}" сохранен`);
    }

    setIsSetModalOpen(false);
    setEditingSet(null);
    setNewSetName('');
    setNewSetEmoji('📦');
    setNewSetManualItems('');
    setSetCreationMode('text');
    setSelectedHistoryItems([]);
    setAiSetPreviewItems([]);
  };

  const handleAnalyzeHistory = async () => {
    if (uniqueHistoryDaysCount < 10) return;
    setIsAiLoading(true);
    try {
      const suggested = await analyzeHistoryForSets(logs, categories);
      if (suggested && suggested.length > 0) {
        setAiSuggestedSets(suggested);
        setIsAiAnalysisModalOpen(true);
      } else {
        showToast("Недостаточно данных для анализа", true);
      }
    } catch (err) {
      handleAiError(err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const ModalHeader: React.FC<{ title: string; onClose: () => void; actionIcon?: React.ReactNode; onAction?: () => void }> = ({ title, onClose, actionIcon, onAction }) => (
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-black text-xl">{title}</h3>
      <div className="flex gap-2">
        {actionIcon && onAction && (
          <button onClick={onAction} className="w-9 h-9 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full hover:bg-red-100 transition-colors">
            {actionIcon}
          </button>
        )}
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
          <Icons.X size={18} />
        </button>
      </div>
    </div>
  );

  const UserProfileHeader = () => (
    <div className="flex items-center gap-1">
      {/* Current user avatar first */}
      <div className="relative z-20">
        {tgUser?.photo_url ? (
          <img src={tgUser.photo_url} alt="Ava" className="w-10 h-10 rounded-full object-cover bg-slate-200 border-2 border-white dark:border-slate-900" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-sm border-2 border-white dark:border-slate-900">
            {tgUser?.first_name?.charAt(0) || 'G'}
          </div>
        )}
      </div>
      {/* Family members */}
      {familyMembers.length > 0 && (
        <div className="flex -ml-3">
          {familyMembers.slice(0, 4).map((m, i) => (
            <div key={m.telegram_id} className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-900 -ml-2 first:ml-0" style={{ zIndex: 10 - i }}>
              {m.photo_url ? (
                <img src={m.photo_url} className="w-full h-full rounded-full object-cover" alt="Member" />
              ) : (
                <div className="w-full h-full rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                  {m.username?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Invite button */}
      <button onClick={inviteUser} className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary transition-all -ml-2">
        <Icons.Plus size={18} />
      </button>
    </div>
  );

  const NavItem: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string }> = ({ active, onClick, icon, label }) => (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all flex-1 ${active ? 'text-primary' : 'text-slate-400 opacity-60 hover:opacity-100'}`}>
      <div className={`p-1.5 rounded-xl transition-all ${active ? 'bg-primary/10' : ''}`}>{icon}</div>
      <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );

  const BenefitItem: React.FC<{ icon: React.ReactNode, title: string, desc: string }> = ({ icon, title, desc }) => (
    <div className="flex gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/30 rounded-2xl">
      <div className="w-9 h-9 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm border border-slate-100 dark:border-slate-700">
        {icon}
      </div>
      <div className="flex-1">
        <h4 className="text-xs font-black uppercase tracking-wider mb-1">{title}</h4>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{desc}</p>
      </div>
    </div>
  );

  const boughtTodayNode = completedToday.length > 0 ? (
    <div className="mb-4">
      <button onClick={() => setIsCompletedExpanded(!isCompletedExpanded)} className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-200/20 dark:bg-slate-800/20">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-left">Куплено сегодня ({completedToday.length})</span>
        <Icons.ChevronDown className={`transition-transform ${isCompletedExpanded ? 'rotate-180' : ''}`} size={14} />
      </button>
      {isCompletedExpanded && (
        <div className="mt-2 bg-white/40 dark:bg-slate-800/10 rounded-3xl p-1">
          {completedToday.map(item => {
            const count = getTodayPurchaseCount(item.name);
            return <ItemRow key={item.id} item={item} countBadge={count > 1 ? count : undefined} onToggle={() => toggleComplete(item.id)} onEdit={() => {
              setEditingItem(item);
              setEditItemName(item.name);
              setEditItemCategoryId(item.categoryId);
              setIsEditModalOpen(true);
            }} onDelete={() => deleteItem(item)} />;
          })}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="min-h-screen pb-40 bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300 relative">

      {toast && (
        <div className="fixed top-6 left-0 right-0 z-[1000] flex justify-center pointer-events-none px-4">
          <div className="w-full max-w-xs animate-bounce-short pointer-events-auto">
            <div className={`py-2.5 px-5 rounded-2xl shadow-xl text-center font-bold text-xs ${toast.isError ? 'bg-red-500 text-white' : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'}`}>
              {toast.message}
            </div>
          </div>
        </div>
      )}

      {(showUndoToast || showCompletedUndoToast) && (
        <div className="fixed bottom-28 left-0 right-0 z-[150] flex justify-center pointer-events-none px-4">
          <div className="bg-slate-950/90 dark:bg-slate-900/90 backdrop-blur-md text-white py-3 px-6 rounded-full shadow-2xl flex items-center gap-6 font-bold text-sm animate-bounce-short border border-white/5 pointer-events-auto">
            <span className="opacity-60">{showUndoToast ? 'Удалено' : 'Куплено'}</span>
            <button onClick={showUndoToast ? () => { if (lastDeletedItem) setItems(p => [lastDeletedItem, ...p]); setShowUndoToast(false); } : undoCompletion} className="text-primary hover:text-white transition-colors uppercase tracking-widest font-black text-xs">Отменить</button>
          </div>
        </div>
      )}

      {viewMode === 'buy' && (
        <div className="fixed bottom-24 right-6 z-[60] flex flex-col gap-3 pointer-events-auto">
          <button onClick={startVoiceDictation} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl backdrop-blur-md border ${isRecording ? 'bg-red-500 text-white animate-pulse border-red-500' : 'bg-primary text-white border-transparent'}`}>
            {isAiLoading ? <Icons.Loader2 className="animate-spin" /> : <Icons.Mic size={24} />}
          </button>
          <button onClick={() => { setAddItemCategory('dept_none'); setAddItemText(''); setIsAddModalOpen(true); }} className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all">
            <Icons.Plus size={28} />
          </button>
        </div>
      )}

      <header className="sticky top-0 z-20 bg-slate-50/80 dark:bg-[#020617]/80 backdrop-blur-xl border-b dark:border-slate-800">
        <div className="max-w-xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex-1 mr-4">
            <UserProfileHeader />
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={() => setIsAiSettingsOpen(true)} className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors relative ${isAiEnabled ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}><Icons.Bot size={18} /></button>
            <button onClick={() => setIsCalendarOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary transition-colors"><Icons.Calendar size={18} /></button>
            <button onClick={() => setIsSettingsOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary transition-colors"><Icons.Settings size={18} /></button>
          </div>
        </div>

        {viewMode === 'buy' && sortedActiveCategories.length > 0 && (
          <div className="max-w-xl mx-auto pl-6 pb-3 overflow-x-auto scrollbar-hide flex items-center gap-2 pr-6 border-t dark:border-slate-800/50 pt-3">
            <button onClick={() => setSelectedCategoryFilter('All')} className={`whitespace-nowrap px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${selectedCategoryFilter === 'All' ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500'}`}>Все</button>
            {sortedActiveCategories.map(cat => (
              <button key={cat.id} onClick={() => setSelectedCategoryFilter(cat.id)} className={`whitespace-nowrap px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border-2 ${selectedCategoryFilter === cat.id ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500'}`}>
                <span>{cat.emoji}</span> {cat.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4 relative z-10">
        {viewMode === 'buy' && (
          <div className="space-y-4 pb-10">
            {activeGroups.length === 0 && boughtTodayNode}

            {activeGroups.map(group => (
              <div key={group.cat.id} className="animate-bounce-short">
                <div className="flex items-center gap-2 mb-1.5 px-2 opacity-60"><span className="text-sm">{group.cat.emoji}</span><h2 className="text-[10px] font-black uppercase tracking-widest">{group.cat.name}</h2></div>
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-1 shadow-sm">
                  {group.items.map(item => (
                    <ItemRow key={item.id} item={item} onToggle={() => toggleComplete(item.id)} onEdit={() => {
                      setEditingItem(item);
                      setEditItemName(item.name);
                      setEditItemCategoryId(item.categoryId);
                      setIsEditModalOpen(true);
                    }} onDelete={() => deleteItem(item)} />
                  ))}
                  <button onClick={() => { setBulkAddCategory(group.cat.id); setBulkAddText(''); setIsBulkAddModalOpen(true); }} className="w-full py-2.5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-primary transition-all">
                    <Icons.Plus size={12} /> Добавить
                  </button>
                </div>
              </div>
            ))}

            {activeGroups.length > 0 && boughtTodayNode}

            {activeGroups.length === 0 && selectedCategoryFilter === 'All' && (
              <div className="py-20 text-center flex flex-col items-center max-w-sm mx-auto animate-bounce-short px-6">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-[32px] flex items-center justify-center text-slate-400 mb-6 shadow-sm">
                  <Icons.ShoppingBag size={40} strokeWidth={1.5} />
                </div>
                <h2 className="font-black text-lg uppercase tracking-widest mb-3">Список пуст</h2>
                <p className="text-slate-400 dark:text-slate-500 text-xs leading-relaxed text-center mb-8">
                  Вы можете добавить товары кнопкой <span className="text-primary font-black">+</span>, выбрать из раздела <b>История</b> частых покупок или использовать готовые <b>Наборы</b>.
                </p>
              </div>
            )}
          </div>
        )}

        {viewMode === 'history' && (
          <div className="space-y-6 pb-10">
            <div className="flex items-center justify-center">
              <div className="flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-2xl w-full">
                <button onClick={() => setHistoryTab('top')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${historyTab === 'top' ? 'bg-white dark:bg-slate-800 shadow-md text-slate-900 dark:text-white' : 'text-slate-400'}`}>Топ</button>
                <button onClick={() => setHistoryTab('categories')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${historyTab === 'categories' ? 'bg-white dark:bg-slate-800 shadow-md text-slate-900 dark:text-white' : 'text-slate-400'}`}>Категории</button>
              </div>
            </div>

            {historyList.length === 0 ? (
              <div className="min-h-[60vh] flex flex-col items-center justify-center text-center max-w-sm mx-auto animate-bounce-short px-6">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-[32px] flex items-center justify-center text-slate-400 mb-6 shadow-sm">
                  <Icons.History size={40} strokeWidth={1.5} />
                </div>
                <h2 className="font-black text-lg uppercase tracking-widest mb-3">История пуста</h2>
                <p className="text-slate-400 dark:text-slate-500 text-xs leading-relaxed text-center mb-8">
                  Добавляйте товары в базу, чтобы быстро находить их позже.
                </p>
                <button
                  onClick={() => { setAddItemCategory('dept_none'); setAddItemText(''); setIsAddModalOpen(true); }}
                  className="px-8 py-4 bg-primary text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:opacity-90 active:scale-95 transition-all"
                >
                  Добавить товар
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {historyTab === 'top' ? (
                  <div className="bg-white dark:bg-slate-800 rounded-3xl p-1 shadow-sm overflow-hidden">
                    {historyListFull.map(item => (
                      <div key={item.id} className="group flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm truncate">{item.name}</p>
                          <p className="text-[8px] font-black uppercase opacity-40">Куплено {item.purchaseCount} {pluralizeRaz(item.purchaseCount)}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mr-3">
                          <button onClick={() => { setEditingItem(item); setEditItemName(item.name); setEditItemCategoryId(item.categoryId); setIsEditModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-primary"><Icons.Pencil size={14} /></button>
                          <button onClick={() => deleteItem(item)} className="p-1.5 text-slate-300 hover:text-red-500"><Icons.Trash2 size={14} /></button>
                        </div>
                        <button onClick={() => toggleHistoryItem(item)} className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${item.onList && !item.completed ? 'bg-slate-100 text-slate-400' : 'bg-primary text-white'}`}>
                          {(item.onList && !item.completed) ? 'В списке' : 'Добавить'}
                        </button>
                      </div>
                    ))}
                    <button onClick={() => { setAddItemCategory('dept_none'); setAddItemText(''); setIsAddModalOpen(true); }} className="w-full py-5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-primary transition-all">
                      <Icons.Plus size={12} /> Добавить в базу
                    </button>
                  </div>
                ) : (
                  <>
                    {sortedGroupedHistoryList.map(group => (
                      <div key={group.cat.id} className="animate-bounce-short">
                        <div className="flex items-center gap-2 mb-2 px-2 opacity-60"><span className="text-sm">{group.cat.emoji}</span><h2 className="text-[10px] font-black uppercase tracking-widest">{group.cat.name}</h2></div>
                        <div className="bg-white dark:bg-slate-800 rounded-3xl p-1 shadow-sm overflow-hidden mb-4">
                          {group.items.map(item => (
                            <div key={item.id} className="group flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm truncate">{item.name}</p>
                                <p className="text-[8px] font-black uppercase opacity-40">Куплено {item.purchaseCount} {pluralizeRaz(item.purchaseCount)}</p>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mr-3">
                                <button onClick={() => { setEditingItem(item); setEditItemName(item.name); setEditItemCategoryId(item.categoryId); setIsEditModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-primary"><Icons.Pencil size={14} /></button>
                                <button onClick={() => deleteItem(item)} className="p-1.5 text-slate-300 hover:text-red-500"><Icons.Trash2 size={14} /></button>
                              </div>
                              <button onClick={() => toggleHistoryItem(item)} className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${item.onList && !item.completed ? 'bg-slate-100 text-slate-400' : 'bg-primary text-white'}`}>
                                {(item.onList && !item.completed) ? 'В списке' : 'Добавить'}
                              </button>
                            </div>
                          ))}
                          <button onClick={() => { setBulkAddCategory(group.cat.id); setBulkAddText(''); setIsBulkAddModalOpen(true); }} className="w-full py-4 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-primary transition-all">
                            <Icons.Plus size={12} /> Добавить товар
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => { setAddItemCategory('dept_none'); setAddItemText(''); setIsAddModalOpen(true); }}
                      className="w-full py-4 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all mt-4 mb-2 border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-[0.98] rounded-xl"
                    >
                      <Icons.Plus size={16} /> Добавить категорию и товар
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {viewMode === 'sets' && (
          <div className="space-y-4 pb-10">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-black uppercase tracking-widest">Наборы</h2>
            </div>
            {sortedSets.length === 0 ? (
              <div className="py-20 text-center flex flex-col items-center max-w-sm mx-auto animate-bounce-short px-6">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-[32px] flex items-center justify-center text-slate-400 mb-6 shadow-sm">
                  <Icons.List size={40} strokeWidth={1.5} />
                </div>
                <h2 className="font-black text-lg uppercase tracking-widest mb-3">Нет наборов</h2>
                <p className="text-slate-400 dark:text-slate-500 text-xs leading-relaxed text-center mb-8">
                  Вы можете добавить набор вручную кнопкой ниже или запустить AI-анализ в <b className="font-black uppercase tracking-widest text-[9px]">Календаре</b>, чтобы система предложила наборы на основе вашей истории покупок.
                </p>
                <button
                  onClick={() => {
                    setEditingSet(null);
                    setNewSetName('');
                    setNewSetEmoji('📦');
                    setNewSetManualItems('');
                    setSetCreationMode('text');
                    setSelectedHistoryItems([]);
                    setAiSetPreviewItems([]);
                    setIsSetModalOpen(true);
                  }}
                  className="px-8 py-4 bg-primary text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:opacity-90 active:scale-95 transition-all"
                >
                  Создать набор
                </button>
              </div>
            ) : (
              <>
                {sortedSets.map((set) => {
                  const isAdded = addedSetIds.includes(set.id);
                  return (
                    <SetCard
                      key={set.id}
                      set={set}
                      isAdded={isAdded}
                      onEdit={() => {
                        setEditingSet(set);
                        setNewSetName(set.name);
                        setNewSetEmoji(set.emoji || '📦');
                        setNewSetManualItems(set.items.map(it => it.name).join('\n'));
                        setSetCreationMode('text');
                        setSelectedHistoryItems([]);
                        setAiSetPreviewItems([]);
                        setIsSetModalOpen(true);
                      }}
                      onDelete={() => deleteSet(set)}
                      onAdd={() => !isAdded && setPartialSetModal({ isOpen: true, set, selectedIndices: set.items.map((_, i) => i) })}
                    />
                  );
                })}
                <button
                  onClick={() => {
                    setEditingSet(null);
                    setNewSetName('');
                    setNewSetEmoji('📦');
                    setNewSetManualItems('');
                    setSetCreationMode('text');
                    setSelectedHistoryItems([]);
                    setAiSetPreviewItems([]);
                    setIsSetModalOpen(true);
                  }}
                  className="w-full py-4 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all mt-4 mb-2 border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-[0.98] rounded-xl"
                >
                  <Icons.Plus size={16} /> Создать набор
                </button>
              </>
            )}
          </div>
        )}
      </main>

      {/* RESTORED ADD ITEM MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)}>
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-t-[32px] px-6 pb-6 pt-4 shadow-2xl animate-bounce-short overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-4" />
            <div className="space-y-6">
              <div className="relative flex items-center bg-slate-100 dark:bg-slate-800 rounded-3xl px-6 py-4">
                <input autoFocus value={addItemText} onChange={e => setAddItemText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAddItemFromModal(undefined, viewMode !== 'history')} placeholder={viewMode === 'history' ? "Название товара" : "Что купить?"} className="flex-1 bg-transparent text-lg font-bold border-none outline-none dark:text-white placeholder:text-slate-400" />
                {addItemText.length > 0 && (
                  <button onClick={() => handleAddItemFromModal(undefined, viewMode !== 'history')} className="ml-2 w-10 h-10 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all flex-shrink-0">
                    <Icons.Plus size={24} />
                  </button>
                )}
              </div>
              {addItemText.length > 0 && (
                <div className="animate-bounce-short space-y-4">
                  <div className="grid grid-cols-2 gap-2 overflow-y-auto max-h-[40vh] scrollbar-hide pr-1">
                    {isAiEnabled && (
                      <button
                        onClick={() => handleAddItemFromModal('dept_none', viewMode !== 'history')}
                        className={`px-4 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 truncate ${addItemCategory === 'dept_none' ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border border-transparent dark:border-slate-700'}`}
                      >
                        ✨ Авто
                      </button>
                    )}
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => handleAddItemFromModal(cat.id, viewMode !== 'history')}
                        className={`px-4 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 truncate ${addItemCategory === cat.id ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border border-transparent dark:border-slate-700'}`}
                      >
                        <span className="flex-shrink-0 text-base">{cat.emoji}</span>
                        <span className="truncate">{cat.name}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setItemToUpdateAfterCategory({ name: addItemText, onList: viewMode !== 'history' });
                        setIsAddModalOpen(false);
                        openCategoryModal();
                      }}
                      className="px-4 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-300 hover:border-primary hover:text-primary"
                    >
                      <Icons.Plus size={16} /> Категория
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BULK ADD MODAL */}
      {isBulkAddModalOpen && bulkAddCategory && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] pt-5 px-6 pb-6 shadow-2xl flex flex-col h-[70vh] min-h-[400px] animate-bounce-short">
            <ModalHeader
              title={(() => {
                const cat = categories.find(c => c.id === bulkAddCategory);
                return cat ? `Добавить в ${cat.name}` : 'Добавить товары';
              })()}
              onClose={() => setIsBulkAddModalOpen(false)}
            />

            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 px-1">Введите товары (каждый с новой строки)</p>
            <div className="flex-1 bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-4 border dark:border-slate-800/50 mb-4">
              <textarea
                autoFocus
                value={bulkAddText}
                onChange={e => setBulkAddText(e.target.value)}
                placeholder="Молоко&#10;Хлеб&#10;Масло..."
                className="w-full h-full bg-transparent resize-none outline-none font-bold text-sm dark:text-white placeholder:text-slate-400"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setIsBulkAddModalOpen(false)} className="flex-1 font-black uppercase text-[10px] tracking-widest text-slate-400">Отмена</button>
              <button onClick={handleBulkAdd} className="flex-[2] h-14 bg-primary text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg hover:opacity-90 transition-opacity">Добавить все</button>
            </div>
          </div>
        </div>
      )}

      {/* PARSED ITEMS MODAL (RESTORED & FIXED) */}
      {isParsedModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-sm rounded-[32px] pt-5 px-6 pb-6 shadow-2xl flex flex-col h-auto max-h-[85vh] animate-bounce-short">
            <ModalHeader title="Голосовой разбор" onClose={() => setIsParsedModalOpen(false)} />

            {detectedDishName && detectedDishName !== 'null' && (
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-4">
                Обнаружено: {detectedDishName}
              </p>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-hide">
              {parsedItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-transparent dark:border-slate-800">
                  <div
                    onClick={() => setParsedItems(p => p.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it))}
                    className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all cursor-pointer ${item.selected ? 'bg-primary border-primary' : 'border-slate-300 dark:border-slate-600'}`}
                  >
                    {item.selected && <Icons.Check size={14} className="text-white" strokeWidth={4} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingParsedIndex === idx ? (
                      <input
                        autoFocus
                        className="w-full bg-transparent border-b-2 border-primary outline-none text-sm font-bold"
                        value={editingParsedName}
                        onChange={e => setEditingParsedName(e.target.value)}
                        onBlur={() => {
                          if (editingParsedName.trim()) setParsedItems(p => p.map((it, i) => i === idx ? { ...it, name: editingParsedName } : it));
                          setEditingParsedIndex(null);
                        }}
                      />
                    ) : (
                      <div onClick={() => { setEditingParsedIndex(idx); setEditingParsedName(item.name); }}>
                        <p className="font-bold text-sm truncate">{item.name}</p>
                        <p className="text-[10px] opacity-40">{item.categoryName}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingParsedIndex(idx); setEditingParsedName(item.name); }} className="p-2 text-slate-300 hover:text-primary"><Icons.Pencil size={16} /></button>
                    <button onClick={() => setParsedItems(p => p.filter((_, i) => i !== idx))} className="p-2 text-slate-300 hover:text-red-500"><Icons.Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setIsParsedModalOpen(false)} className="flex-1 font-black uppercase text-[10px] tracking-widest text-slate-400">Отмена</button>
              <button
                onClick={() => {
                  const toAdd = parsedItems.filter(i => i.selected);
                  let updatedCats = [...categories];
                  const reorderCats = (cats: CategoryDef[]) => {
                    const others = cats.filter(c => c.id !== 'dept_none');
                    const none = cats.find(c => c.id === 'dept_none') || { id: 'dept_none', name: 'Без категории', emoji: '⚪' };
                    return [...others, none];
                  };

                  toAdd.forEach(pItem => {
                    const historyItem = items.find(i => i.name.toLowerCase() === pItem.name.toLowerCase());
                    if (historyItem) {
                      finalizeAddItem(pItem.name, historyItem.categoryId);
                    } else {
                      let cat = updatedCats.find(c => c.name.toLowerCase() === pItem.categoryName.toLowerCase());
                      if (!cat) {
                        cat = { id: 'dept_' + Date.now() + Math.random(), name: pItem.categoryName, emoji: pItem.suggestedEmoji || '📦' };
                        updatedCats.push(cat);
                      }
                      finalizeAddItem(pItem.name, cat.id);
                    }
                  });
                  setCategories(reorderCats(updatedCats));
                  setIsParsedModalOpen(false);
                  showToast(`Добавлено ${toAdd.length} товаров`);
                }}
                className="flex-[2] h-14 bg-primary text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg hover:opacity-90 transition-opacity"
              >
                Добавить всё
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CALENDAR MODAL */}
      {isCalendarOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] pt-5 px-8 pb-8 shadow-2xl flex flex-col max-h-[90vh]">
            <ModalHeader title="Календарь" onClose={() => setIsCalendarOpen(false)} />

            <div className="mb-6 grid grid-cols-7 gap-1 text-center">
              {['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map(d => <span key={d} className="text-[8px] font-black opacity-30">{d}</span>)}
              {[...Array(31)].map((_, i) => (
                <button key={i} onClick={() => {
                  const d = new Date();
                  d.setDate(i + 1);
                  d.setHours(0, 0, 0, 0);
                  setSelectedCalendarDate(d.getTime());
                }} className={`p-2 rounded-xl text-xs font-bold transition-all ${new Date(selectedCalendarDate || 0).getDate() === i + 1 ? 'bg-primary text-white shadow-lg' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{i + 1}</button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-black uppercase opacity-40">Покупки за день</p>
                {isAiEnabled && (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={handleAnalyzeHistory}
                      disabled={isAiLoading || uniqueHistoryDaysCount < 10}
                      className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors ${uniqueHistoryDaysCount >= 10
                        ? 'text-primary bg-primary/5 hover:bg-primary/10'
                        : 'text-slate-400 bg-slate-100 dark:bg-slate-800 cursor-not-allowed opacity-60'
                        }`}
                    >
                      {isAiLoading ? <Icons.Loader2 className="animate-spin" size={10} /> : <Icons.Sparkles size={10} />}
                      AI Анализ
                    </button>
                    {uniqueHistoryDaysCount < 10 && (
                      <span className="text-[7px] font-black uppercase opacity-40 text-right leading-none">
                        Осталось {10 - uniqueHistoryDaysCount} дн. покупок
                      </span>
                    )}
                  </div>
                )}
              </div>
              {groupedPurchasesOnDate.length > 0 ? groupedPurchasesOnDate.map((g, idx) => (
                <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border dark:border-slate-700">
                  <div className="flex items-center gap-2 mb-1 opacity-60"><span className="text-xs">{g.cat.emoji}</span><p className="text-[9px] font-black uppercase">{g.cat.name}</p></div>
                  <div className="space-y-1">
                    {g.items.map((it, i) => <div key={i} className="text-xs font-bold py-1 border-b last:border-0 dark:border-slate-700 flex justify-between"><span>{it.name}</span> <span className="opacity-40">x{it.count}</span></div>)}
                  </div>
                </div>
              )) : <div className="text-center py-6 opacity-30 italic text-xs">Нет данных</div>}
            </div>

            <button onClick={() => setIsCalendarOpen(false)} className="w-full h-14 mt-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg hover:opacity-90 transition-opacity flex-shrink-0">Закрыть</button>
          </div>
        </div>
      )}

      {/* AI ANALYSIS RESULTS MODAL */}
      {isAiAnalysisModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-sm rounded-[32px] pt-5 px-6 pb-6 shadow-2xl flex flex-col h-auto max-h-[85vh] animate-bounce-short">
            <ModalHeader title="Рекомендации AI" onClose={() => setIsAiAnalysisModalOpen(false)} />
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">На основе вашей истории за последние {uniqueHistoryDaysCount} дней, Lumina AI предлагает создать следующие наборы:</p>
            <div className="flex-1 overflow-y-auto space-y-4 scrollbar-hide pr-1">
              {aiSuggestedSets.map((s, idx) => {
                const exists = sets.some(existingSet => existingSet.name.toLowerCase() === s.name.toLowerCase());
                return (
                  <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-3xl border dark:border-slate-700 transition-all hover:border-primary/30">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{s.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black text-sm truncate">{s.name}</h4>
                        <p className="text-[10px] opacity-40 uppercase font-black">{s.items.length} товаров</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {s.items.slice(0, 5).map((it: any, i: number) => (
                        <span key={i} className="px-2 py-1 bg-white dark:bg-slate-900 rounded-lg text-[9px] font-bold border dark:border-slate-800">{it.name}</span>
                      ))}
                      {s.items.length > 5 && <span className="text-[9px] opacity-40 font-bold self-center">+{s.items.length - 5}</span>}
                    </div>
                    <button
                      onClick={() => {
                        const newSet: ShoppingSet = {
                          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                          name: s.name,
                          emoji: s.emoji,
                          items: s.items,
                          usageCount: 0
                        };
                        setSets(prev => [newSet, ...prev]);
                        showToast(`Набор "${s.name}" сохранен`);
                        setAiSuggestedSets(prev => prev.filter((_, i) => i !== idx));
                      }}
                      disabled={exists}
                      className={`w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${exists ? 'bg-slate-200 dark:bg-slate-700 text-slate-400' : 'bg-primary text-white active:scale-95'}`}
                    >
                      {exists ? 'Уже есть' : 'Создать набор'}
                    </button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setIsAiAnalysisModalOpen(false)} className="w-full mt-6 h-14 bg-slate-100 dark:bg-slate-800 text-slate-500 font-black uppercase text-[10px] tracking-widest rounded-2xl hover:bg-slate-200 transition-colors">Готово</button>
          </div>
        </div>
      )}

      {/* AI SETTINGS MODAL */}
      {isAiSettingsOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] pt-5 px-8 pb-8 shadow-2xl border dark:border-slate-800 flex flex-col max-h-[90vh]">
            <ModalHeader title="Lumina AI" onClose={() => setIsAiSettingsOpen(false)} />

            <div className="flex-1 overflow-y-auto pr-1 scrollbar-hide space-y-5">
              <div className={`flex items-center gap-3 p-4 rounded-2xl transition-colors ${isAiEnabled ? 'bg-primary/5' : 'bg-slate-100 dark:bg-slate-800/50'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isAiEnabled ? 'bg-primary/10 text-primary' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                  <Icons.Bot size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Статус системы</p>
                  <p className="font-bold text-sm">{isAiEnabled ? 'Интеллект активен' : 'Система отключена'}</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">ИИ функции</span>
                  <button onClick={() => setIsAiEnabled(!isAiEnabled)} className={`w-12 h-6 rounded-full transition-all relative ${isAiEnabled ? 'bg-primary' : 'bg-slate-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isAiEnabled ? 'left-7' : 'left-1'}`} /></button>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed text-left uppercase font-black tracking-widest opacity-60">Ваши возможности:</p>
              </div>

              <div className="space-y-3">
                <BenefitItem
                  icon={<Icons.Mic size={18} className="text-rose-500" />}
                  title="Голосовой ввод"
                  desc="Надиктуйте список, и ИИ мгновенно разберет его на отдельные товары."
                />
                <BenefitItem
                  icon={<Icons.Sparkles size={18} className="text-amber-500" />}
                  title="Авто-категории"
                  desc="Товары сами распределяются по отделам — не нужно тратить время на сортировку."
                />
                <BenefitItem
                  icon={<Icons.History size={18} className="text-blue-500" />}
                  title="Анализ привычек"
                  desc="ИИ изучает ваши покупки и автоматически предлагает готовые наборы товаров."
                />
                <BenefitItem
                  icon={<Icons.List size={18} className="text-emerald-500" />}
                  title="Списки по названию"
                  desc="Просто скажите «все для пиццы», и список ингредиентов будет готов за секунду."
                />
                <BenefitItem
                  icon={<Icons.Bot size={18} className="text-violet-500" />}
                  title="Экономия времени"
                  desc="ИИ берет на себя рутину, позволяя сфокусироваться на главном."
                />
              </div>
            </div>

            <button onClick={() => setIsAiSettingsOpen(false)} className="w-full h-14 mt-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg hover:opacity-90 transition-opacity flex-shrink-0">Закрыть</button>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] pt-5 px-8 pb-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <ModalHeader title="Настройки" onClose={() => setIsSettingsOpen(false)} />
            <div className="space-y-6 mb-4 overflow-y-auto pr-1 scrollbar-hide">

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 px-1">Внешний вид</p>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                  <span className="font-bold text-xs text-left mr-2">Темная тема</span>
                  <button onClick={() => setDarkMode(!darkMode)} className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 ${darkMode ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${darkMode ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              {/* Family Management Section */}
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Семья</p>
                  <button onClick={inviteUser} className="text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-primary/10 rounded-full">+ Пригласить</button>
                </div>
                <div className="space-y-2">
                  {/* Current user */}
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
                        {tgUser?.photo_url ? (
                          <img src={tgUser.photo_url} className="w-full h-full object-cover" alt="You" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center text-white font-bold text-sm">
                            {tgUser?.first_name?.charAt(0) || 'G'}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{tgUser?.first_name || 'Вы'}</p>
                        <p className="text-[10px] opacity-40">{isOwner ? 'Владелец' : 'Участник'}</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-1 rounded-lg">Вы</span>
                  </div>

                  {/* Family members */}
                  {familyMembers.map(member => (
                    <div key={member.telegram_id} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
                          {member.photo_url ? (
                            <img src={member.photo_url} className="w-full h-full object-cover" alt="Member" />
                          ) : (
                            <div className="w-full h-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                              {member.username?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold">{member.username || 'Пользователь'}</p>
                          <p className="text-[10px] opacity-40">Участник</p>
                        </div>
                      </div>
                      {isOwner && (
                        <button
                          onClick={() => removeFamilyMember(member.telegram_id)}
                          className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Icons.X size={16} />
                        </button>
                      )}
                    </div>
                  ))}

                  {familyMembers.length === 0 && (
                    <div className="text-center py-4 text-slate-400 text-xs">
                      Пока вы один в семье. Пригласите близких!
                    </div>
                  )}
                </div>

                {/* Leave family button - only show if there are other members */}
                {familyMembers.length > 0 && (
                  <button
                    onClick={leaveFamily}
                    className="w-full mt-3 py-3 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-2xl border-2 border-red-200 dark:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                  >
                    Покинуть семью
                  </button>
                )}
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 px-1">Подтверждения</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="font-bold text-xs text-left mr-2">При удалении товара</span>
                    <button onClick={() => setConfirmItemDelete(!confirmItemDelete)} className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 ${confirmItemDelete ? 'bg-primary' : 'bg-slate-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${confirmItemDelete ? 'left-7' : 'left-1'}`} /></button>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="font-bold text-xs text-left mr-2">При удалении категории</span>
                    <button onClick={() => setConfirmDelete(!confirmDelete)} className={`w-12 h-6 rounded-full transition-all relative ${confirmDelete ? 'bg-primary' : 'bg-slate-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${confirmDelete ? 'left-7' : 'left-1'}`} /></button>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="font-bold text-xs text-left mr-2">При удалении набора</span>
                    <button onClick={() => setConfirmSetDelete(!confirmSetDelete)} className={`w-12 h-6 rounded-full transition-all relative ${confirmSetDelete ? 'bg-primary' : 'bg-slate-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${confirmSetDelete ? 'left-7' : 'left-1'}`} /></button>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Категории</p>
                  <button onClick={() => openCategoryModal()} className="text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-primary/10 rounded-full">+ Новая</button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {categories.map(cat => {
                    const isSystem = cat.id === 'dept_none';
                    return (
                      <div key={cat.id} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{cat.emoji}</span>
                          <span className="text-sm font-bold">{cat.name}</span>
                        </div>
                        {!isSystem && (
                          <div className="flex gap-1">
                            <button onClick={() => openCategoryModal(cat)} className="p-2 text-slate-400 hover:text-primary"><Icons.Pencil size={14} /></button>
                            <button onClick={() => deleteCategory(cat.id)} className="p-2 text-slate-300 hover:text-red-500"><Icons.Trash2 size={14} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={() => openCategoryModal()} className="w-full py-4 mt-2 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-300 hover:border-primary hover:text-primary transition-all font-black uppercase text-[10px] tracking-widest">
                    <Icons.Plus size={14} /> Добавить категорию
                  </button>
                </div>
              </div>
            </div>
            <button onClick={() => setIsSettingsOpen(false)} className="w-full h-14 mt-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg hover:opacity-90 transition-opacity flex-shrink-0">Закрыть настройки</button>
            <div className="text-center mt-4">
              <span
                onClick={() => {
                  if (tgUser?.username === 'v_chernyshov') {
                    fetchAdminStats();
                  }
                }}
                className="text-[9px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-700 cursor-default hover:text-slate-400 dark:hover:text-slate-600 transition-colors"
              >
                Версия 2.0
              </span>
            </div>
          </div>
        </div>
      )}

      {isAdminModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-sm rounded-[32px] pt-5 px-6 pb-6 shadow-2xl flex flex-col h-[85vh] animate-bounce-short">
            <ModalHeader title="Панель администратора" onClose={() => setIsAdminModalOpen(false)} />
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-hide space-y-2">
              <div className="flex justify-between px-2 mb-2">
                <span className="text-[10px] font-black uppercase text-slate-400">Пользователь</span>
                <span className="text-[10px] font-black uppercase text-slate-400">Статус</span>
              </div>
              {adminStats.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                      {user.photo_url ? (
                        <img src={user.photo_url} className="w-full h-full object-cover" alt="Аватар" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-slate-500">
                          {user.username?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{user.username || user.first_name || 'Неизвестный'}</p>
                      <p className="text-[10px] opacity-40">Семья: {user.family_id}</p>
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${user.is_online ? 'bg-green-500/10 text-green-500' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                    {user.is_online ? 'В сети' : 'Не в сети'}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setIsAdminModalOpen(false)} className="w-full mt-6 h-14 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg hover:opacity-90 transition-opacity flex-shrink-0">Закрыть</button>
          </div>
        </div>
      )}

      {/* PARTIAL SET MODAL */}
      {partialSetModal.isOpen && partialSetModal.set && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-sm rounded-[32px] pt-5 px-6 pb-6 shadow-2xl flex flex-col h-[75vh] animate-bounce-short">
            <ModalHeader title={partialSetModal.set.name} onClose={() => setPartialSetModal({ isOpen: false, set: null, selectedIndices: [] })} />
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-4">Выберите товары</p>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-hide">
              {partialSetModal.set.items.map((item, idx) => {
                const isSelected = partialSetModal.selectedIndices.includes(idx);
                return (
                  <div
                    key={idx}
                    onClick={() => setPartialSetModal(prev => ({ ...prev, selectedIndices: isSelected ? prev.selectedIndices.filter(i => i !== idx) : [...prev.selectedIndices, idx] }))}
                    className={`flex items-center gap-3 p-3 rounded-2xl transition-all cursor-pointer ${isSelected ? 'bg-slate-50 dark:bg-slate-800/80' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-slate-300 dark:border-slate-600'}`}>
                      {isSelected && <Icons.Check size={12} className="text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm">{item.name}</p>
                      <p className="text-[10px] opacity-40">{item.categoryName}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setPartialSetModal({ isOpen: false, set: null, selectedIndices: [] })} className="flex-1 font-black uppercase text-[10px] tracking-widest text-slate-400">Отмена</button>
              <button
                onClick={() => {
                  if (partialSetModal.set) {
                    const itemsToAdd = partialSetModal.set.items.filter((_, i) => partialSetModal.selectedIndices.includes(i));
                    if (itemsToAdd.length > 0) {
                      addSpecificItemsFromSet(partialSetModal.set, itemsToAdd);
                    }
                    setPartialSetModal({ isOpen: false, set: null, selectedIndices: [] });
                  }
                }}
                disabled={partialSetModal.selectedIndices.length === 0}
                className={`flex-[2] h-14 font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg transition-all ${partialSetModal.selectedIndices.length === 0 ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-primary text-white hover:opacity-90'}`}
              >
                Добавить ({partialSetModal.selectedIndices.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ITEM MODAL */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-[550] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-sm rounded-[32px] sm:rounded-[40px] pt-5 px-6 pb-8 shadow-2xl flex flex-col h-auto max-h-[90vh] animate-bounce-short">
            <ModalHeader title="Редактировать" onClose={() => setIsEditModalOpen(false)} />
            <div className="space-y-6 flex-1 overflow-y-auto scrollbar-hide pr-1">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Название</p>
                <div className="relative">
                  <input
                    autoFocus
                    value={editItemName}
                    onChange={e => setEditItemName(e.target.value)}
                    className="w-full px-6 py-5 rounded-[24px] bg-white dark:bg-slate-800 border-2 border-primary/10 dark:border-slate-700 font-bold text-lg outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/5 dark:text-white transition-all"
                  />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3">Категория</p>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setEditItemCategoryId(cat.id)}
                      className={`px-4 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 truncate ${editItemCategoryId === cat.id ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border border-transparent dark:border-slate-700'}`}
                    >
                      <span className="flex-shrink-0 text-base">{cat.emoji}</span>
                      <span className="truncate">{cat.name}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setItemToUpdateAfterCategory({ id: editingItem.id, name: editItemName, onList: editingItem.onList });
                      setIsEditModalOpen(false);
                      openCategoryModal();
                    }}
                    className="px-4 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-300 hover:border-primary hover:text-primary"
                  >
                    <Icons.Plus size={16} /> Категория
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-6 mt-8">
              <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 font-black uppercase text-[11px] tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Отмена</button>
              <button
                onClick={() => {
                  setItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, name: editItemName, categoryId: editItemCategoryId } : i));
                  setIsEditModalOpen(false);
                }}
                className="flex-1 h-16 bg-primary text-white font-black uppercase text-[12px] tracking-widest rounded-[24px] shadow-2xl shadow-primary/30 hover:opacity-95 active:scale-95 transition-all"
              >Готово</button>
            </div>
          </div>
        </div>
      )}

      {/* ITEM DELETE CONFIRM MODAL */}
      {itemDeleteConfirmModal.isOpen && itemDeleteConfirmModal.item && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-sm rounded-[32px] pt-5 px-8 pb-8 shadow-2xl text-center">
            <ModalHeader title="Удалить товар?" onClose={() => setItemDeleteConfirmModal({ isOpen: false, item: null })} />
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><Icons.AlertTriangle size={32} /></div>
            <p className="text-slate-500 dark:text-slate-400 mb-6 font-bold text-sm">"{itemDeleteConfirmModal.item.name}" будет стерт.</p>
            <label className="flex items-center justify-center gap-2 mb-6 cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
              <input type="checkbox" checked={tempDontAskAgain} onChange={e => setTempDontAskAgain(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
              <span className="text-xs font-bold">Больше не спрашивать</span>
            </label>
            <div className="flex gap-3">
              <button onClick={() => setItemDeleteConfirmModal({ isOpen: false, item: null })} className="flex-1 font-black uppercase text-[10px] tracking-widest text-slate-400">Отмена</button>
              <button onClick={() => performItemDelete(itemDeleteConfirmModal.item!)} className="flex-[2] h-14 bg-red-500 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-red-500/20">Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY MODAL (EDIT/CREATE) */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[550] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] pt-5 px-6 pb-6 shadow-2xl flex flex-col h-[85vh] min-h-[500px] animate-bounce-short">
            <ModalHeader
              title={editingCategory ? 'Категория' : 'Новая категория'}
              onClose={() => setIsCategoryModalOpen(false)}
              actionIcon={editingCategory ? <Icons.Trash2 size={18} /> : undefined}
              onAction={editingCategory ? () => deleteCategory(editingCategory.id) : undefined}
            />

            <div className="flex gap-3 mb-6 shrink-0">
              <div className="w-16 h-16 rounded-[20px] bg-slate-100 dark:bg-slate-800 text-3xl flex items-center justify-center shrink-0 border border-transparent transition-all">
                {catEmoji}
              </div>
              <input
                value={catName}
                onChange={e => setCatName(e.target.value)}
                placeholder="Название"
                className="flex-1 px-5 h-16 rounded-[20px] bg-slate-100 dark:bg-slate-800 font-bold outline-none dark:text-white text-lg"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-1 scrollbar-hide">
              <div className="grid grid-cols-5 gap-3">
                {EMOJI_LIST.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => setCatEmoji(emoji)}
                    className={`w-14 h-14 text-2xl flex items-center justify-center rounded-2xl transition-all ${catEmoji === emoji ? 'bg-primary text-white scale-110 shadow-lg' : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-4 shrink-0">
              <button onClick={() => { setIsCategoryModalOpen(false); setItemToUpdateAfterCategory(null); }} className="flex-1 font-black uppercase text-[10px] tracking-widest text-slate-400">Отмена</button>
              <button onClick={saveCategory} className="flex-[2] h-14 bg-primary text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg hover:opacity-90 transition-opacity">Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CATEGORY CONFIRM MODAL */}
      {deleteConfirmModal.isOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-sm rounded-[32px] pt-5 px-8 pb-8 shadow-2xl text-center">
            <ModalHeader title="Удалить категорию?" onClose={() => setDeleteConfirmModal({ isOpen: false, categoryId: null })} />
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><Icons.AlertTriangle size={32} /></div>
            <p className="text-slate-500 dark:text-slate-400 mb-6 font-bold text-sm">Товары будут перенесены в «Без категории».</p>
            <label className="flex items-center justify-center gap-2 mb-6 cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
              <input type="checkbox" checked={tempDontAskAgain} onChange={e => setTempDontAskAgain(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
              <span className="text-xs font-bold">Больше не спрашивать</span>
            </label>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmModal({ isOpen: false, categoryId: null })} className="flex-1 font-black uppercase text-[10px] tracking-widest text-slate-400">Отмена</button>
              <button onClick={() => performDeleteCategory(deleteConfirmModal.categoryId!)} className="flex-[2] h-14 bg-red-500 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-red-500/20">Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE SET CONFIRM MODAL */}
      {deleteSetConfirmModal.isOpen && deleteSetConfirmModal.set && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-sm rounded-[32px] pt-5 px-8 pb-8 shadow-2xl text-center">
            <ModalHeader title="Удалить набор?" onClose={() => setDeleteSetConfirmModal({ isOpen: false, set: null })} />
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><Icons.AlertTriangle size={32} /></div>
            <p className="text-slate-500 dark:text-slate-400 mb-6 font-bold text-sm">"{deleteSetConfirmModal.set.name}" будет удален.</p>
            <label className="flex items-center justify-center gap-2 mb-6 cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
              <input type="checkbox" checked={tempDontAskAgain} onChange={e => setTempDontAskAgain(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
              <span className="text-xs font-bold">Больше не спрашивать</span>
            </label>
            <div className="flex gap-3">
              <button onClick={() => setDeleteSetConfirmModal({ isOpen: false, set: null })} className="flex-1 font-black uppercase text-[10px] tracking-widest text-slate-400">Отмена</button>
              <button onClick={() => performSetDelete(deleteSetConfirmModal.set!)} className="flex-[2] h-14 bg-red-500 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-red-500/20">Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW SET MODAL */}
      {isSetModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] pt-5 px-6 pb-6 shadow-2xl flex flex-col h-[85vh] min-h-[500px] animate-bounce-short">
            <ModalHeader
              title={editingSet ? 'Редактировать набор' : 'Новый набор'}
              onClose={() => { setIsSetModalOpen(false); setEditingSet(null); setNewSetName(''); setNewSetEmoji('📦'); setNewSetManualItems(''); setSetCreationMode('text'); setSelectedHistoryItems([]); setAiSetPreviewItems([]); }}
            />

            <div className="flex gap-3 mb-4 shrink-0">
              <button onClick={() => setIsEmojiPickerOpen(true)} className="w-16 h-16 rounded-[20px] bg-slate-100 dark:bg-slate-800 text-3xl flex items-center justify-center shrink-0 border border-transparent hover:border-primary transition-all">
                {newSetEmoji}
              </button>
              <input
                value={newSetName}
                onChange={e => setNewSetName(e.target.value)}
                placeholder="Название"
                className="flex-1 min-w-0 px-5 h-16 rounded-[20px] bg-slate-100 dark:bg-slate-800 font-bold outline-none dark:text-white text-lg"
              />
            </div>

            <div className="flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-2xl mb-4 shrink-0">
              <button onClick={() => setSetCreationMode('text')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${setCreationMode === 'text' ? 'bg-white dark:bg-slate-800 shadow-md text-slate-900 dark:text-white' : 'text-slate-400'}`}>Текст</button>
              <button onClick={() => setSetCreationMode('history')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${setCreationMode === 'history' ? 'bg-white dark:bg-slate-800 shadow-md text-slate-900 dark:text-white' : 'text-slate-400'}`}>Из истории</button>
              <button onClick={() => { if (isAiEnabled) setSetCreationMode('ai'); else showToast("Включите ИИ в настройках"); }} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1 ${setCreationMode === 'ai' ? 'bg-primary text-white shadow-md' : 'text-slate-400'}`}>
                <Icons.Sparkles size={10} /> AI
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0 bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-2 border dark:border-slate-800/50">
              {setCreationMode === 'text' ? (
                <div className="flex flex-col h-full">
                  <p className="text-[10px] font-black uppercase opacity-40 mb-2 px-2 pt-2">Товары (каждый с новой строки)</p>
                  <textarea
                    value={newSetManualItems}
                    onChange={e => setNewSetManualItems(e.target.value)}
                    placeholder="Список товаров..."
                    className="w-full h-full bg-transparent resize-none outline-none font-bold text-sm"
                  />
                </div>
              ) : setCreationMode === 'history' ? (
                <div className="flex flex-col h-full">
                  <p className="text-[10px] font-black uppercase opacity-40 mb-2 px-2 pt-2">Выберите из истории</p>
                  <div className="space-y-2 flex-1">
                    {historyList.map(item => {
                      const isSelected = selectedHistoryItems.includes(item.id);
                      return (
                        <div key={item.id} onClick={() => setSelectedHistoryItems(prev => isSelected ? prev.filter(id => id !== item.id) : [...prev, item.id])} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${isSelected ? 'bg-white dark:bg-slate-800 border-primary/30 shadow-sm' : 'border-transparent hover:bg-white/50 dark:hover:bg-slate-800/50'}`}>
                          <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-slate-300 dark:border-slate-600'}`}>
                            {isSelected && <Icons.Check size={12} className="text-white" strokeWidth={3} />}
                          </div>
                          <span className="font-bold text-sm">{item.name}</span>
                        </div>
                      )
                    })}
                    {historyList.length === 0 && <p className="text-center text-slate-400 py-10 text-xs italic">История покупок пуста</p>}
                  </div>
                </div>
              ) : (
                // AI MODE
                <div className="flex flex-col h-full">
                  {aiSetPreviewItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                      <Icons.Sparkles className="text-primary mb-4" size={32} />
                      <p className="text-xs font-bold mb-4 opacity-60">
                        {newSetName.trim() ? `Составить список для "${newSetName}"?` : 'Введите название набора сверху'}
                      </p>
                      <button
                        onClick={async () => {
                          if (!newSetName.trim()) { showToast("Введите название набора", true); return; }
                          setIsAiLoading(true);
                          try {
                            const result = await generateSetItems(newSetName, categories);
                            if (result) {
                              setNewSetEmoji(result.setEmoji || '🍱');
                              setAiSetPreviewItems(result.items.map(i => ({ ...i, checked: true })));
                            }
                          } catch (err) { handleAiError(err); } finally { setIsAiLoading(false); }
                        }}
                        disabled={!newSetName.trim() || isAiLoading}
                        className={`px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all ${!newSetName.trim() ? 'bg-slate-200 dark:bg-slate-800 text-slate-400' : 'bg-primary text-white hover:opacity-90'}`}
                      >
                        {isAiLoading ? <Icons.Loader2 className="animate-spin" /> : 'Генерировать'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between mb-2 px-2 pt-2">
                        <p className="text-[10px] font-black uppercase opacity-40">Состав ({aiSetPreviewItems.filter(i => i.checked !== false).length})</p>
                        <button onClick={() => setAiSetPreviewItems([])} className="text-[10px] font-black uppercase text-slate-400 hover:text-red-500">Сброс</button>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-hide pb-2">
                        {aiSetPreviewItems.map((item, idx) => (
                          <div key={idx} className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${item.checked !== false ? 'bg-white dark:bg-slate-800 shadow-sm' : 'bg-slate-50 dark:bg-slate-800/50 opacity-50'}`}>
                            <div
                              onClick={() => setAiSetPreviewItems(p => p.map((it, i) => i === idx ? { ...it, checked: !it.checked } : it))}
                              className={`w-6 h-6 rounded-[10px] flex items-center justify-center border-2 transition-all cursor-pointer flex-shrink-0 ${item.checked !== false ? 'bg-primary border-primary' : 'border-slate-300 dark:border-slate-600'}`}
                            >
                              {item.checked !== false && <Icons.Check size={14} className="text-white" strokeWidth={4} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              {editingAiSetIndex === idx ? (
                                <input
                                  autoFocus
                                  className="w-full bg-transparent border-b-2 border-primary outline-none text-sm font-bold p-0"
                                  value={editingAiSetName}
                                  onChange={(e) => setEditingAiSetName(e.target.value)}
                                  onBlur={() => {
                                    if (editingAiSetName.trim()) {
                                      setAiSetPreviewItems(p => p.map((it, i) => i === idx ? { ...it, name: editingAiSetName } : it));
                                    }
                                    setEditingAiSetIndex(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      if (editingAiSetName.trim()) {
                                        setAiSetPreviewItems(p => p.map((it, i) => i === idx ? { ...it, name: editingAiSetName } : it));
                                      }
                                      setEditingAiSetIndex(null);
                                    }
                                  }}
                                />
                              ) : (
                                <div onClick={() => { setEditingAiSetIndex(idx); setEditingAiSetName(item.name); }} className="cursor-text">
                                  <p className={`font-bold text-sm truncate ${item.checked === false ? 'line-through opacity-50' : ''}`}>{item.name}</p>
                                  <p className="text-[10px] font-bold opacity-40">{item.categoryName}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setEditingAiSetIndex(idx); setEditingAiSetName(item.name); }} className="p-2 text-slate-300 hover:text-primary transition-colors"><Icons.Pencil size={16} /></button>
                              <button onClick={() => setAiSetPreviewItems(p => p.filter((_, i) => i !== idx))} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Icons.Trash2 size={16} /></button>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const newItem = { name: 'Новый товар', categoryName: 'Разное', emoji: '📦', checked: true };
                            setAiSetPreviewItems([...aiSetPreviewItems, newItem]);
                            setEditingAiSetIndex(aiSetPreviewItems.length);
                            setEditingAiSetName('Новый товар');
                          }}
                          className="w-full py-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-all border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                          <Icons.Plus size={14} /> Добавить вручную
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3 flex-shrink-0">
              <div className="flex gap-3">
                <button onClick={() => { setIsSetModalOpen(false); setEditingSet(null); setNewSetName(''); setNewSetEmoji('📦'); setNewSetManualItems(''); setSetCreationMode('text'); setSelectedHistoryItems([]); setAiSetPreviewItems([]); }} className="flex-1 font-black uppercase text-[10px] tracking-widest text-slate-400">Отмена</button>
                <button onClick={handleManualSetCreate} className="flex-[2] h-14 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg hover:opacity-90 transition-opacity">Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EMOJI PICKER MODAL */}
      {isEmojiPickerOpen && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md" onClick={() => setIsEmojiPickerOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] pt-5 px-6 pb-6 shadow-2xl flex flex-col max-h-[60vh] animate-bounce-short" onClick={e => e.stopPropagation()}>
            <ModalHeader title="Выберите иконку" onClose={() => setIsEmojiPickerOpen(false)} />
            <div className="grid grid-cols-5 gap-3 overflow-y-auto p-1 scrollbar-hide">
              {EMOJI_LIST.map(emoji => (
                <button key={emoji} onClick={() => { setNewSetEmoji(emoji); setIsEmojiPickerOpen(false); }} className={`w-14 h-14 text-2xl flex items-center justify-center rounded-2xl transition-all ${newSetEmoji === emoji ? 'bg-primary text-white scale-110 shadow-lg' : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>{emoji}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/80 dark:bg-[#020617]/80 backdrop-blur-xl border-t dark:border-slate-800 pb-safe">
        <div className="max-w-xl mx-auto px-6 h-[88px] flex items-start justify-between gap-4 pt-3">
          <NavItem active={viewMode === 'buy'} onClick={() => setViewMode('buy')} icon={<Icons.ShoppingBag size={22} />} label="Купить" />
          <NavItem active={viewMode === 'history'} onClick={() => setViewMode('history')} icon={<Icons.History size={22} />} label="История" />
          <NavItem active={viewMode === 'sets'} onClick={() => setViewMode('sets')} icon={<Icons.List size={22} />} label="Наборы" />
        </div>
      </div>

    </div>
  );
};

export default App;