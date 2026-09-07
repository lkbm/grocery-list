export interface Item {
	name: string;
	status?: "need" | "carted";
	category?: string;
	recipes?: string[];      // Recipe names this item belongs to; empty/missing = "default items"
	dateAdded?: string;      // ISO string
	lastUpdated?: string;    // ISO string
	deleted?: boolean;
	deletedAt?: string;      // ISO string
	sortIndex?: number;      // Custom sort order within category
};

export interface Tombstone {
	name: string;
	deletedAt: string; // ISO string
}

export interface ListData {
	items: Item[];
	recipeOrder: string[];   // Ordered list of recipe names
	storeSections: string[]; // Ordered list of store sections/categories
	deletedRecipes?: Tombstone[];  // Recipe names removed via delete/rename, so a merge doesn't resurrect them
	deletedSections?: Tombstone[]; // Store section names removed via delete/rename, so a merge doesn't resurrect them
}

