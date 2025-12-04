"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  type ModelTier,
  type ModelTierConfig,
  MODEL_TIER_LIST,
  DEFAULT_MODEL_TIER,
  getModelIdFromTier,
  isValidModelTier,
  STORAGE_KEY,
} from "@/lib/models";

function getStoredTier(): ModelTier {
  if (typeof window === "undefined") {
    return DEFAULT_MODEL_TIER;
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && isValidModelTier(saved)) {
    return saved;
  }
  return DEFAULT_MODEL_TIER;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): ModelTier {
  return getStoredTier();
}

function getServerSnapshot(): ModelTier {
  return DEFAULT_MODEL_TIER;
}

interface UseModelTierResult {
  selectedTier: ModelTier;
  selectedModelId: string;
  tiers: ModelTierConfig[];
  setTier: (tier: ModelTier) => void;
  isLoading: boolean;
}

export function useModelTier(): UseModelTierResult {
  const selectedTier = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTier = useCallback((tier: ModelTier) => {
    if (isValidModelTier(tier)) {
      localStorage.setItem(STORAGE_KEY, tier);
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    }
  }, []);

  const selectedModelId = useMemo(() => getModelIdFromTier(selectedTier), [selectedTier]);

  return {
    selectedTier,
    selectedModelId,
    tiers: MODEL_TIER_LIST,
    setTier,
    isLoading: false,
  };
}
