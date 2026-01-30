import { GoogleGenAI, Type } from "@google/genai";
import { CategoryDef, SmartCategoryResponse, PurchaseLog } from "../types";

// Models to try in order (fallback if one fails with 400)
const MODELS = ['gemini-3-flash-preview', 'gemini-2.0-flash', 'gemini-1.5-flash'];
let currentModelIndex = 0;
const getModelName = () => MODELS[currentModelIndex] || MODELS[0];

// Robust way to get the API key in different environments (Vite vs Node/Standard)
const getApiKey = (): string => {
  // 1. Try standard process.env (Node/Webpack)
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
    return process.env.API_KEY;
  }
  // 2. Try Vite specific import.meta.env
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  return '';
};

const API_KEY = getApiKey();

async function callWithRetry<T>(fn: () => Promise<T>, retries = 5, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    console.error("[Lumina Service] AI Error Details:", error);

    // Check if it's a 400 error (bad request - often means model not available)
    const is400Error =
      error?.status === 400 ||
      error?.code === 400 ||
      error?.message?.includes('400') ||
      (error?.error && error.error.code === 400);

    // If 400 error and we have more models to try, switch to next model
    if (is400Error && currentModelIndex < MODELS.length - 1) {
      currentModelIndex++;
      console.log(`[Lumina Service] Model error, switching to: ${getModelName()}`);
      return callWithRetry(fn, retries, delay);
    }

    const isRetryable =
      error?.status === 429 ||
      error?.code === 429 ||
      error?.status === 503 ||
      error?.code === 503 ||
      error?.message?.includes('429') ||
      error?.message?.includes('503') ||
      error?.message?.includes('quota') ||
      error?.message?.includes('RESOURCE_EXHAUSTED') ||
      error?.message?.includes('Overloaded') ||
      (error?.error && (
        error.error.code === 429 ||
        error.error.code === 503 ||
        error.error.status === 'RESOURCE_EXHAUSTED' ||
        error.error.status === 'UNAVAILABLE'
      ));

    if (retries > 0 && isRetryable) {
      console.log(`[Lumina Service] Rate limit/Error hit. Retrying in ${delay}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

// Categorize a single product name into an existing or new category
export const categorizeProduct = async (productName: string, availableCategories: CategoryDef[]): Promise<SmartCategoryResponse | null> => {
  if (!API_KEY) {
    console.error("Gemini API Key is missing. Check your .env file.");
    throw new Error("API ключ не найден.");
  }

  const categoryNames = availableCategories.map(c => c.name);

  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const response = await ai.models.generateContent({
      model: getModelName(),
      contents: `Category for: "${productName}". 
      Existing: ${categoryNames.join(', ')}. 
      If none fit, make new.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            categoryName: { type: Type.STRING },
            suggestedEmoji: { type: Type.STRING },
            isNew: { type: Type.BOOLEAN }
          },
          required: ["categoryName", "suggestedEmoji", "isNew"]
        }
      }
    });

    return response.text ? JSON.parse(response.text.trim()) : null;
  });
};

// Generate a set of shopping items (e.g. ingredients for a dish)
export const generateSetItems = async (setName: string, availableCategories: CategoryDef[]) => {
  if (!API_KEY) {
    console.error("Gemini API Key is missing. Check your .env file.");
    throw new Error("API ключ не найден.");
  }
  const categoryNames = availableCategories.map(c => c.name);

  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const response = await ai.models.generateContent({
      model: getModelName(),
      contents: `Create a shopping list of INGREDIENTS or COMPONENTS for the set named: "${setName}".
      
      RULES:
      1. IF user input is a DISH (e.g. "Pizza", "Borsch", "Soup") -> RETURN INGREDIENTS (e.g. "Dough", "Cheese", "Beets", "Meat"). DO NOT return just the dish name.
      2. IF user input is a generic task (e.g. "Cleaning", "Party") -> RETURN ITEMS needed.
      3. Capitalize first letter of every item.
      4. Use categories from: ${categoryNames.join(', ')}.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            setEmoji: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  categoryName: { type: Type.STRING },
                  emoji: { type: Type.STRING }
                },
                required: ["name", "categoryName", "emoji"]
              }
            }
          },
          required: ["setEmoji", "items"]
        }
      }
    });
    return response.text ? JSON.parse(response.text.trim()) : { setEmoji: '🍱', items: [] };
  });
};

// Parse a dictated string into a list of specific products
export const parseDictatedText = async (text: string, availableCategories: CategoryDef[]) => {
  if (!API_KEY) {
    console.error("Gemini API Key is missing. Check your .env file.");
    throw new Error("API ключ не найден.");
  }
  const categoryNames = availableCategories.map(c => c.name);

  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const response = await ai.models.generateContent({
      model: getModelName(),
      contents: `Parse shopping items from text: "${text}".
      
      STRICT RULES:
      1. Capitalize first letter of every item (e.g. "Oranges", "Bread").
      2. PRESERVE GRAMMATICAL NUMBER:
         - "Apples" -> "Apples"
         - "Apple" -> "Apple"
         - "10 eggs" -> "Eggs" (quantity handled separately usually, but here just name)
      3. CONTEXT AWARENESS:
         - "Pizza" -> Single item "Pizza" (DishName: null).
         - "Ingredients for pizza", "Pizza kit", "Everything for soup" -> List ingredients (DishName: "Pizza").
      
      Categories: ${categoryNames.join(', ')}.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  categoryName: { type: Type.STRING },
                  suggestedEmoji: { type: Type.STRING }
                },
                required: ["name", "categoryName", "suggestedEmoji"]
              }
            },
            dishName: { type: Type.STRING }
          },
          required: ["items", "dishName"]
        }
      }
    });
    return response.text ? JSON.parse(response.text.trim()) : { items: [], dishName: null };
  });
};

// Analyze purchase history to suggest sets
export const analyzeHistoryForSets = async (logs: PurchaseLog[], availableCategories: CategoryDef[]) => {
  if (!API_KEY) {
    console.error("Gemini API Key is missing. Check your .env file.");
    throw new Error("API ключ не найден.");
  }
  const categoryNames = availableCategories.map(c => c.name);

  const historySummary = logs.map(l => ({
    date: new Date(l.date).toDateString(),
    items: l.items.map(i => i.name)
  }));

  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const response = await ai.models.generateContent({
      model: getModelName(),
      contents: `Analyze history and suggest 3 logical shopping sets.
      History: ${JSON.stringify(historySummary)}.
      Categories: ${categoryNames.join(', ')}.
      Rule: Capitalize all item names.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              emoji: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    categoryName: { type: Type.STRING },
                    emoji: { type: Type.STRING }
                  },
                  required: ["name", "categoryName", "emoji"]
                }
              }
            },
            required: ["name", "emoji", "items"]
          }
        }
      }
    });
    return response.text ? JSON.parse(response.text.trim()) : [];
  });
};