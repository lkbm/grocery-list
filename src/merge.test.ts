import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clampTimestamp,
	getNewestOfEachItem,
	mergeListData,
	mergeOrdered,
	mergeOrderedWithTombstones,
	mergeTombstones,
	parseListData,
	sanitizeListData,
} from './merge';
import { ListData } from './types';

const NOW = '2026-10-01T12:00:00.000Z';
const EARLIER = '2026-09-01T00:00:00.000Z';
const LATER = '2026-09-15T00:00:00.000Z';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
	vi.useRealTimers();
});

const list = (overrides: Partial<ListData> = {}): ListData => ({
	items: [],
	recipeOrder: [],
	storeSections: [],
	deletedRecipes: [],
	deletedSections: [],
	...overrides,
});

describe('clampTimestamp', () => {
	it('keeps past timestamps', () => {
		expect(clampTimestamp(EARLIER)).toBe(EARLIER);
	});

	it('clamps future timestamps to now', () => {
		expect(clampTimestamp('2099-01-01T00:00:00.000Z')).toBe(NOW);
	});

	it('replaces invalid timestamps with now', () => {
		expect(clampTimestamp('not a date')).toBe(NOW);
	});
});

describe('sanitizeListData', () => {
	it('rejects payloads without an items array', () => {
		expect(sanitizeListData(null)).toBeNull();
		expect(sanitizeListData({})).toBeNull();
		expect(sanitizeListData({ items: 'milk' })).toBeNull();
	});

	it('drops invalid items and trims names', () => {
		const result = sanitizeListData({
			items: [{ name: '  milk  ' }, { name: '' }, { name: 42 }, { name: 'eggs', status: 'bogus' }, 'bread'],
		});
		expect(result?.items).toEqual([{ name: 'milk' }]);
	});

	it('strips unknown fields', () => {
		const result = sanitizeListData({ items: [{ name: 'milk', evil: true }], extra: 'nope' });
		expect(result).toEqual(list({ items: [{ name: 'milk' }] }));
	});

	it('keeps valid item fields and clamps future timestamps', () => {
		const result = sanitizeListData({
			items: [
				{
					name: 'milk',
					status: 'carted',
					category: 'dairy',
					recipes: ['breakfast'],
					dateAdded: EARLIER,
					lastUpdated: '2099-01-01T00:00:00.000Z',
					sortIndex: 3,
				},
			],
		});
		expect(result?.items[0]).toEqual({
			name: 'milk',
			status: 'carted',
			category: 'dairy',
			recipes: ['breakfast'],
			dateAdded: EARLIER,
			lastUpdated: NOW,
			sortIndex: 3,
		});
	});

	it('filters non-string section names and malformed tombstones', () => {
		const result = sanitizeListData({
			items: [],
			storeSections: ['produce', 7, 'dairy'],
			deletedSections: [{ name: 'bakery', deletedAt: EARLIER }, { name: 'frozen' }, null],
		});
		expect(result?.storeSections).toEqual(['produce', 'dairy']);
		expect(result?.deletedSections).toEqual([{ name: 'bakery', deletedAt: EARLIER }]);
	});
});

describe('parseListData', () => {
	it('parses and sanitizes valid JSON', () => {
		const result = parseListData(JSON.stringify({ items: [{ name: ' milk ', bogus: 1 }] }));
		expect(result?.items).toEqual([{ name: 'milk' }]);
	});

	it('returns null for malformed JSON instead of throwing', () => {
		expect(parseListData('{"items": [')).toBeNull();
		expect(parseListData('')).toBeNull();
	});

	it('returns null for valid JSON that is not list data', () => {
		expect(parseListData('null')).toBeNull();
		expect(parseListData('"hello"')).toBeNull();
		expect(parseListData('{"items": "nope"}')).toBeNull();
	});
});

describe('getNewestOfEachItem', () => {
	it('keeps the most recently updated copy of each item', () => {
		const result = getNewestOfEachItem([
			{ name: 'milk', status: 'need', lastUpdated: EARLIER },
			{ name: 'milk', status: 'carted', lastUpdated: LATER },
			{ name: 'eggs', lastUpdated: EARLIER },
		]);
		expect(result).toEqual([
			{ name: 'milk', status: 'carted', lastUpdated: LATER },
			{ name: 'eggs', lastUpdated: EARLIER },
		]);
	});

	it('prefers any timestamp over a missing one', () => {
		const result = getNewestOfEachItem([{ name: 'milk', status: 'carted', lastUpdated: EARLIER }, { name: 'milk' }]);
		expect(result).toEqual([{ name: 'milk', status: 'carted', lastUpdated: EARLIER }]);
	});
});

describe('mergeOrdered', () => {
	it('lets a reorder from the client win', () => {
		expect(mergeOrdered(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
	});

	it('appends names the client added', () => {
		expect(mergeOrdered(['a', 'b'], ['a', 'b', 'z'])).toEqual(['a', 'b', 'z']);
	});

	it('keeps names only the server has, after their previous neighbor', () => {
		expect(mergeOrdered(['a', 'x', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'x', 'b']);
	});

	it('keeps a run of server-only names at the front together and in order', () => {
		expect(mergeOrdered(['x', 'y', 'a', 'b'], ['b', 'a'])).toEqual(['x', 'y', 'b', 'a']);
	});
});

describe('mergeTombstones', () => {
	it('keeps the newest tombstone per name', () => {
		const result = mergeTombstones(
			[{ name: 'bakery', deletedAt: EARLIER }],
			[
				{ name: 'bakery', deletedAt: LATER },
				{ name: 'frozen', deletedAt: EARLIER },
			],
		);
		expect(result).toEqual([
			{ name: 'bakery', deletedAt: LATER },
			{ name: 'frozen', deletedAt: EARLIER },
		]);
	});

	it('handles missing tombstone lists', () => {
		expect(mergeTombstones(undefined, undefined)).toEqual([]);
	});
});

describe('mergeOrderedWithTombstones', () => {
	const byCategory = (item: { category?: string }) => (item.category ? [item.category] : []);

	it('drops a tombstoned name even when the other side still has it', () => {
		const result = mergeOrderedWithTombstones(
			['produce', 'bakery'],
			['produce'],
			[{ name: 'bakery', deletedAt: LATER }],
			[],
			byCategory,
		);
		expect(result).toEqual(['produce']);
	});

	it('resurrects a tombstoned name when an item used it after the deletion', () => {
		const result = mergeOrderedWithTombstones(
			['produce'],
			['produce', 'bakery'],
			[{ name: 'bakery', deletedAt: EARLIER }],
			[{ name: 'bread', category: 'bakery', lastUpdated: LATER }],
			byCategory,
		);
		expect(result).toEqual(['produce', 'bakery']);
	});

	it('does not resurrect for deleted items or items untouched since the deletion', () => {
		const result = mergeOrderedWithTombstones(
			['produce', 'bakery'],
			['produce', 'bakery'],
			[{ name: 'bakery', deletedAt: LATER }],
			[
				{ name: 'bread', category: 'bakery', lastUpdated: EARLIER },
				{ name: 'bagels', category: 'bakery', lastUpdated: NOW, deleted: true },
			],
			byCategory,
		);
		expect(result).toEqual(['produce']);
	});
});

describe('mergeListData', () => {
	it('persists a section reorder', () => {
		const existing = list({ storeSections: ['produce', 'dairy', 'bakery'] });
		const incoming = list({ storeSections: ['bakery', 'produce', 'dairy'] });
		expect(mergeListData(existing, incoming).storeSections).toEqual(['bakery', 'produce', 'dairy']);
	});

	it('persists a recipe reorder', () => {
		const existing = list({ recipeOrder: ['tacos', 'pancakes'] });
		const incoming = list({ recipeOrder: ['pancakes', 'tacos'] });
		expect(mergeListData(existing, incoming).recipeOrder).toEqual(['pancakes', 'tacos']);
	});

	it('merges items from both sides, newest wins', () => {
		const existing = list({
			items: [
				{ name: 'milk', status: 'need', lastUpdated: LATER },
				{ name: 'eggs', status: 'need', lastUpdated: EARLIER },
			],
		});
		const incoming = list({
			items: [
				{ name: 'milk', status: 'carted', lastUpdated: EARLIER },
				{ name: 'eggs', status: 'carted', lastUpdated: LATER },
				{ name: 'bread', status: 'need', lastUpdated: LATER },
			],
		});
		expect(mergeListData(existing, incoming).items).toEqual([
			{ name: 'milk', status: 'need', lastUpdated: LATER },
			{ name: 'eggs', status: 'carted', lastUpdated: LATER },
			{ name: 'bread', status: 'need', lastUpdated: LATER },
		]);
	});

	it('removes a section deleted on one device even though another device still sends it', () => {
		const existing = list({
			storeSections: ['produce'],
			deletedSections: [{ name: 'bakery', deletedAt: LATER }],
		});
		const staleClient = list({ storeSections: ['produce', 'bakery'] });
		const merged = mergeListData(existing, staleClient);
		expect(merged.storeSections).toEqual(['produce']);
		expect(merged.deletedSections).toEqual([{ name: 'bakery', deletedAt: LATER }]);
	});

	it('handles stored data saved before tombstones existed', () => {
		const legacy: ListData = { items: [], recipeOrder: [], storeSections: ['produce'] };
		expect(mergeListData(legacy, list({ storeSections: ['produce', 'dairy'] }))).toEqual(
			list({ storeSections: ['produce', 'dairy'] }),
		);
	});
});
