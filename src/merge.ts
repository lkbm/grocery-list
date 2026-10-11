import { Item, ListData, Tombstone } from './types';

const VALID_STATUSES = new Set(['need', 'carted']);

// Clamp an ISO timestamp to the current time if it's in the future or invalid.
export function clampTimestamp(iso: string): string {
	const now = Date.now();
	const parsed = Date.parse(iso);
	if (isNaN(parsed) || parsed > now) return new Date(now).toISOString();
	return iso;
}

function sanitizeItem(raw: unknown): Item | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	if (typeof obj.name !== 'string' || !obj.name.trim()) return null;

	const item: Item = { name: obj.name.trim() };
	if (obj.status !== undefined && obj.status !== null) {
		if (!VALID_STATUSES.has(obj.status as string)) return null;
		item.status = obj.status as 'need' | 'carted';
	}
	if (typeof obj.category === 'string') item.category = obj.category;
	if (
		Array.isArray(obj.recipes) &&
		obj.recipes.every((r) => typeof r === 'string')
	)
		item.recipes = obj.recipes;
	if (typeof obj.dateAdded === 'string')
		item.dateAdded = clampTimestamp(obj.dateAdded);
	if (typeof obj.lastUpdated === 'string')
		item.lastUpdated = clampTimestamp(obj.lastUpdated);
	if (typeof obj.deleted === 'boolean') item.deleted = obj.deleted;
	if (typeof obj.deletedAt === 'string')
		item.deletedAt = clampTimestamp(obj.deletedAt);
	if (typeof obj.sortIndex === 'number') item.sortIndex = obj.sortIndex;
	return item;
}

function sanitizeStringArray(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((s): s is string => typeof s === 'string');
}

function sanitizeTombstones(raw: unknown): Tombstone[] {
	if (!Array.isArray(raw)) return [];
	const result: Tombstone[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue;
		const obj = entry as Record<string, unknown>;
		if (typeof obj.name !== 'string' || !obj.name.trim()) continue;
		if (typeof obj.deletedAt !== 'string') continue;
		result.push({ name: obj.name.trim(), deletedAt: clampTimestamp(obj.deletedAt) });
	}
	return result;
}

// Parse and validate incoming list data, stripping unknown fields and clamping
// future timestamps. Returns null if the payload is structurally invalid.
export function sanitizeListData(raw: unknown): ListData | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	if (!Array.isArray(obj.items)) return null;
	return {
		items: obj.items.map(sanitizeItem).filter((i): i is Item => i !== null),
		recipeOrder: sanitizeStringArray(obj.recipeOrder),
		storeSections: sanitizeStringArray(obj.storeSections),
		deletedRecipes: sanitizeTombstones(obj.deletedRecipes),
		deletedSections: sanitizeTombstones(obj.deletedSections),
	};
}

// JSON.parse + sanitizeListData; returns null instead of throwing on malformed JSON.
export function parseListData(text: string): ListData | null {
	try {
		return sanitizeListData(JSON.parse(text));
	} catch {
		return null;
	}
}

export const getNewestOfEachItem = (itemList: Item[]): Item[] => {
	const latestItems: { [key: string]: Item } = {};
	itemList.forEach((item) => {
		const existing = latestItems[item.name];
		const itemLastUpdated = item.lastUpdated || '1970-01-01T00:00:00Z';
		const existingLastUpdated = existing?.lastUpdated || '1970-01-01T00:00:00Z';
		if (!existing || itemLastUpdated > existingLastUpdated) {
			latestItems[item.name] = item;
		}
	});
	return Object.values(latestItems);
};

// Incoming order wins, so reorders stick. Names only the server has (e.g. just added by another
// client) are kept, placed right after the name they followed in the existing order.
export const mergeOrdered = (existing: string[], incoming: string[]): string[] => {
	const result = [...incoming];
	existing.forEach((name, i) => {
		if (result.includes(name)) return;
		const predecessorIndex = i > 0 ? result.indexOf(existing[i - 1]) : -1;
		result.splice(predecessorIndex + 1, 0, name);
	});
	return result;
};

// Newest-wins merge of tombstones by name, mirroring getNewestOfEachItem
export const mergeTombstones = (existing: Tombstone[] = [], incoming: Tombstone[] = []): Tombstone[] => {
	const latest: { [name: string]: Tombstone } = {};
	for (const tombstone of [...existing, ...incoming]) {
		const current = latest[tombstone.name];
		if (!current || tombstone.deletedAt > current.deletedAt) latest[tombstone.name] = tombstone;
	}
	return Object.values(latest);
};

// A union merge (mergeOrdered) can't tell a removal from "the other side just hasn't seen it yet" -
// it can only ever add names, never drop them. Tombstones supply the missing removal signal: a
// unioned name is dropped unless some non-deleted item's tag/category for it was touched after
// the tombstone was created, which means the name was intentionally reused since the deletion.
export const mergeOrderedWithTombstones = (
	existingNames: string[],
	incomingNames: string[],
	tombstones: Tombstone[],
	items: Item[],
	namesForItem: (item: Item) => string[],
): string[] => {
	const union = mergeOrdered(existingNames, incomingNames);
	const tombstoneByName = new Map(tombstones.map((t) => [t.name, t.deletedAt]));
	return union.filter((name) => {
		const deletedAt = tombstoneByName.get(name);
		if (!deletedAt) return true;
		return items.some(
			(item) => !item.deleted && namesForItem(item).includes(name) && (item.lastUpdated || '') > deletedAt,
		);
	});
};

// Server-side merge of an incoming client save into the stored list
export const mergeListData = (existingData: ListData, incoming: ListData): ListData => {
	const mergedItems = getNewestOfEachItem([...existingData.items, ...incoming.items]);
	const mergedDeletedRecipes = mergeTombstones(existingData.deletedRecipes, incoming.deletedRecipes);
	const mergedDeletedSections = mergeTombstones(existingData.deletedSections, incoming.deletedSections);

	return {
		items: mergedItems,
		recipeOrder: mergeOrderedWithTombstones(
			existingData.recipeOrder,
			incoming.recipeOrder,
			mergedDeletedRecipes,
			mergedItems,
			(item) => item.recipes || [],
		),
		storeSections: mergeOrderedWithTombstones(
			existingData.storeSections,
			incoming.storeSections,
			mergedDeletedSections,
			mergedItems,
			(item) => (item.category ? [item.category] : []),
		),
		deletedRecipes: mergedDeletedRecipes,
		deletedSections: mergedDeletedSections,
	};
};
