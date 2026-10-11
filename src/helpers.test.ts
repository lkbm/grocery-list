import { describe, expect, it } from 'vitest';
import { DEFAULT_RECIPE, isDefaultItem } from './helpers';

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
