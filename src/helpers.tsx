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

// Sort items by their category's position in the store sections. Categories not in the list
// (including items with no category, which count as "unknown") go last; sort is stable.
export const sortBySection = (items: Item[], storeSections: string[]): Item[] => {
	const rank = (item: Item) => {
		const index = storeSections.indexOf(item.category || 'unknown');
		return index === -1 ? Infinity : index;
	};
	return [...items].sort((a, b) => {
		const rankA = rank(a);
		const rankB = rank(b);
		// Infinity - Infinity is NaN, so compare explicitly rather than subtracting
		return rankA === rankB ? 0 : rankA < rankB ? -1 : 1;
	});
};

// Return a copy of arr with item moved to newIndex. Returns arr itself (same reference) when
// there's nothing to do - item not found or already at newIndex - so callers can skip saving.
export const moveTo = <T,>(arr: T[], item: T, newIndex: number): T[] => {
	const oldIndex = arr.indexOf(item);
	if (oldIndex === -1 || oldIndex === newIndex) return arr;
	const result = [...arr];
	result.splice(oldIndex, 1);
	result.splice(newIndex, 0, item);
	return result;
};
