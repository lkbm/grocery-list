import { useMemo } from 'preact/hooks';
import { Item } from './types';
import { getNow } from './helpers';

interface UseSortOrderParams {
	storeSections: string[];
	setStoreSections: (sections: string[]) => void;
	activeItems: Item[];
	possibleItems: Item[];
	currentList: Item[];
	setCurrentList: (list: Item[]) => void;
	setPossibleItems: (items: Item[]) => void;
}

export const useSortOrder = ({
	storeSections,
	setStoreSections,
	activeItems,
	possibleItems,
	currentList,
	setCurrentList,
	setPossibleItems,
}: UseSortOrderParams) => {
	// Stored sections + any categories from items not yet in the list (backwards compatibility)
	const effectiveSortOrder = useMemo(() => {
		const sections = [...storeSections];
		const allCategories = new Set<string>();
		activeItems.forEach((item) => { if (item.category) allCategories.add(item.category); });
		possibleItems.forEach((item) => { if (item.category) allCategories.add(item.category); });
		allCategories.forEach((category) => { if (!sections.includes(category)) sections.push(category); });
		return sections;
	}, [storeSections, activeItems, possibleItems]);

	const itemsByCategory = useMemo(() => {
		const grouped: { [category: string]: Item[] } = {};
		activeItems.forEach((item) => {
			const category = item.category || 'unknown';
			if (!grouped[category]) grouped[category] = [];
			grouped[category].push(item);
		});
		Object.keys(grouped).forEach((category) => {
			grouped[category].sort((a, b) => {
				const aIndex = a.sortIndex ?? Infinity;
				const bIndex = b.sortIndex ?? Infinity;
				if (aIndex !== bIndex) return aIndex - bIndex;
				return (a.dateAdded || '').localeCompare(b.dateAdded || '');
			});
		});
		return grouped;
	}, [activeItems]);

	const reorderSection = (sectionName: string, newIndex: number) => {
		const oldIndex = effectiveSortOrder.indexOf(sectionName);
		if (oldIndex === -1 || oldIndex === newIndex) return;
		const newOrder = [...effectiveSortOrder];
		newOrder.splice(oldIndex, 1);
		newOrder.splice(newIndex, 0, sectionName);
		setStoreSections(newOrder);
	};

	const addSection = (sectionName: string) => {
		if (effectiveSortOrder.includes(sectionName)) return;
		setStoreSections([...effectiveSortOrder, sectionName]);
	};

	const deleteSection = (sectionName: string, deleteItems: boolean) => {
		const newSections = effectiveSortOrder.filter((s) => s !== sectionName);
		const now = getNow();
		if (deleteItems) {
			setCurrentList(currentList.map((item) =>
				item.category === sectionName ? { ...item, deleted: true, deletedAt: now, lastUpdated: now } : item,
			));
			setPossibleItems(possibleItems.filter((item) => item.category !== sectionName));
		} else {
			setCurrentList(currentList.map((item) =>
				item.category === sectionName ? { ...item, category: 'unknown', lastUpdated: now } : item,
			));
			setPossibleItems(possibleItems.map((item) =>
				item.category === sectionName ? { ...item, category: 'unknown' } : item,
			));
		}
		setStoreSections(newSections);
	};

	const reorderItem = (itemName: string, category: string, newIndex: number) => {
		const categoryItems = itemsByCategory[category];
		if (!categoryItems) return;
		const oldIndex = categoryItems.findIndex((i) => i.name === itemName);
		if (oldIndex === -1 || oldIndex === newIndex) return;

		const reordered = [...categoryItems];
		const [moved] = reordered.splice(oldIndex, 1);
		reordered.splice(newIndex, 0, moved);

		const now = getNow();
		const updates = new Map(reordered.map((item, idx) => [item.name, idx]));
		setCurrentList(currentList.map((item) => {
			if (item.category === category || (!item.category && category === 'unknown')) {
				const newSortIndex = updates.get(item.name);
				if (newSortIndex !== undefined) return { ...item, sortIndex: newSortIndex, lastUpdated: now };
			}
			return item;
		}));
	};

	return { effectiveSortOrder, itemsByCategory, reorderSection, addSection, deleteSection, reorderItem };
};
