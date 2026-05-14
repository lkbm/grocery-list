import { Item } from './types';
export const DEFAULT_RECIPE = "default items";
// Check if an item should appear in Standard Items (default items)
export const isDefaultItem = (item: Item): boolean => {
	// No recipes array or empty array = default item (backwards compatible)
	if (!item.recipes || item.recipes.length === 0) return true;
	// Explicitly in "default items"
	return item.recipes.includes(DEFAULT_RECIPE);
};

export const getNow = (): string => new Date().toISOString();