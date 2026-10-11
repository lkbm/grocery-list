import { describe, expect, it } from 'vitest';
import { DEFAULT_RECIPE, isDefaultItem, sortBySection } from './helpers';

describe('isDefaultItem', () => {
	it('treats items without recipes as default items', () => {
		expect(isDefaultItem({ name: 'milk' })).toBe(true);
		expect(isDefaultItem({ name: 'milk', recipes: [] })).toBe(true);
	});

	it('treats items explicitly in the default recipe as default items', () => {
		expect(isDefaultItem({ name: 'milk', recipes: ['tacos', DEFAULT_RECIPE] })).toBe(true);
	});

	it('excludes items that only belong to other recipes', () => {
		expect(isDefaultItem({ name: 'tortillas', recipes: ['tacos'] })).toBe(false);
	});
});

describe('sortBySection', () => {
	const sections = ['produce', 'dairy', 'unknown'];
	const names = (items: { name: string }[]) => items.map((i) => i.name);

	it('orders items by their section position', () => {
		const items = [
			{ name: 'milk', category: 'dairy' },
			{ name: 'apples', category: 'produce' },
		];
		expect(names(sortBySection(items, sections))).toEqual(['apples', 'milk']);
	});

	it('treats a missing category as "unknown"', () => {
		const items = [{ name: 'mystery' }, { name: 'milk', category: 'dairy' }];
		expect(names(sortBySection(items, sections))).toEqual(['milk', 'mystery']);
	});

	it('puts categories not in the section list last, keeping their relative order', () => {
		const items = [
			{ name: 'batteries', category: 'hardware' },
			{ name: 'apples', category: 'produce' },
			{ name: 'tape', category: 'hardware' },
			{ name: 'mystery' },
		];
		expect(names(sortBySection(items, ['produce']))).toEqual(['apples', 'batteries', 'tape', 'mystery']);
	});

	it('does not mutate the input array', () => {
		const items = [
			{ name: 'milk', category: 'dairy' },
			{ name: 'apples', category: 'produce' },
		];
		sortBySection(items, sections);
		expect(names(items)).toEqual(['milk', 'apples']);
	});
});
