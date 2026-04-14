import { useState, useEffect, useMemo, useRef, useCallback } from 'preact/hooks';
import { Fragment } from 'preact';
import { memo } from 'preact/compat';
import { Item, ListData } from './types';

export const blankList = { items: [], recipeOrder: [], storeSections: [] }

declare global {
	interface Window {
		debug: () => void;
	}
}

const DEFAULT_RECIPE = "default items";

const DEFAULT_DATE = "1970-01-01T00:00:00Z";

// localStorage backup helpers for options data
const getBackupKey = (optionsListName: string) => `grocery-backup:${optionsListName}`;

const saveOptionsBackup = (optionsListName: string, data: ListData) => {
	try {
		const key = getBackupKey(optionsListName);
		localStorage.setItem(key, JSON.stringify({
			data,
			timestamp: new Date().toISOString()
		}));
	} catch (e) {
		console.warn("Failed to save options backup to localStorage", e);
	}
};

const getOptionsBackup = (optionsListName: string): { data: ListData; timestamp: string } | null => {
	try {
		const key = getBackupKey(optionsListName);
		const stored = localStorage.getItem(key);
		if (!stored) return null;
		return JSON.parse(stored);
	} catch {
		return null;
	}
};


const fetchListData = async (listName: string): Promise<ListData> => {
	const res = await fetch(`/api/state/${listName}`);
	const data = (await res.json().catch(() => (blankList))) as ListData;

	try {
		const rawItems = data?.items || [];
		const items = rawItems.map((item: Item) => ({
			...item,
			dateAdded: item.dateAdded || DEFAULT_DATE,
			lastUpdated: item.lastUpdated || DEFAULT_DATE,
		}));
		return {
			items,
			recipeOrder: data?.recipeOrder || [],
			storeSections: data?.storeSections || [],
		};
	} catch {
		return blankList;
	}
};

export default function App() {
	const [currentList, setCurrentList] = useState<Item[]>([]);
	const [possibleItems, setPossibleItems] = useState<Item[]>([]);
	// Current list's own metadata (for saving back to this list)
	const [currentListMeta, setCurrentListMeta] = useState<{ recipeOrder: string[]; storeSections: string[] }>({ recipeOrder: [], storeSections: [] });
	// Options list metadata (for UI: recipe picker, sort order)
	const [recipeOrder, setRecipeOrder] = useState<string[]>([]);
	const [storeSections, setStoreSections] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isRemoving, setIsRemoving] = useState<boolean>(false);
	const [isSorting, setIsSorting] = useState<boolean>(false);
	const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
	const toggleCategoryCollapse = (category: string) => {
		setCollapsedCategories(prev => {
			const next = new Set(prev);
			if (next.has(category)) {
				next.delete(category);
			} else {
				next.add(category);
			}
			return next;
		});
	};
	const [collapsedSections, setCollapsedSections] = useState({
		currentList: false,
		sections: false,
		standardItems: false
	});
	const toggleSectionCollapse = (section: keyof typeof collapsedSections) => {
		setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
	};
	const [wsConnected, setWsConnected] = useState<boolean | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const skipNextSend = useRef<boolean>(false);
	const [showAddRecipeModal, setShowAddRecipeModal] = useState<boolean>(false);
	const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
	const [backupAvailable, setBackupAvailable] = useState<{ data: ListData; timestamp: string } | null>(null);
	const [skippedItems, setSkippedItems] = useState<string[]>([]);
	const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

	const registerItemRef = useCallback((itemName: string, el: HTMLElement | null) => {
		if (el) {
			itemRefs.current.set(itemName, el);
		} else {
			itemRefs.current.delete(itemName);
		}
	}, []);

	const scrollToTop = useCallback(() => {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}, []);

	const listName = window.location.hash.slice(1) || "default-list";
	// If we're on an -options list, use it directly; otherwise append -options
	const optionsListName = listName.endsWith('-options') ? listName : `${listName}-options`;

	const activeItems = useMemo(() => currentList.filter(item => !item.deleted),
		[currentList]);

	// Track skipped (unchecked) items above viewport
	useEffect(() => {
		const checkSkippedItems = () => {
			const skipped: string[] = [];
			activeItems.forEach(item => {
				if (item.status !== 'carted') {
					const element = itemRefs.current.get(item.name);
					if (element) {
						const rect = element.getBoundingClientRect();
						// Item is above viewport (completely scrolled past)
						if (rect.bottom < 0) {
							skipped.push(item.name);
						}
					}
				}
			});
			setSkippedItems(skipped);
		};

		window.addEventListener('scroll', checkSkippedItems, { passive: true });
		checkSkippedItems(); // Initial check

		return () => window.removeEventListener('scroll', checkSkippedItems);
	}, [activeItems]);

	// Effective sort order: stored sections + any new categories from items (backwards compatibility)
	const effectiveSortOrder = useMemo(() => {
		// Start with stored sections, or defaults if empty
		const sections = storeSections.length > 0 ? [...storeSections] : [];

		// Find all unique categories from items that aren't in sections yet
		const allCategories = new Set<string>();
		activeItems.forEach(item => {
			if (item.category) allCategories.add(item.category);
		});

		possibleItems.forEach(item => {
			if (item.category) allCategories.add(item.category);
		});

		// Add any missing categories at the end
		allCategories.forEach(category => {
			if (!sections.includes(category)) {
				sections.push(category);
			}
		});

		return sections;
	}, [storeSections, activeItems, possibleItems]);

	// Union of items from currentList and possibleItems (for recipe modal)
	const allAvailableItems = useMemo(() => {
		const itemMap = new Map<string, Item>();
		// Add possibleItems first
		possibleItems.forEach(item => itemMap.set(item.name, item));
		// Add activeItems (currentList items override if same name)
		activeItems.forEach(item => {
			if (!itemMap.has(item.name)) {
				itemMap.set(item.name, item);
			}
		});
		return Array.from(itemMap.values());
	}, [possibleItems, activeItems]);

	// Load initial state:
	useEffect(() => {
		const loadData = async () => {
			// Load both the current list and options list (both use unified ListData format)
			const [currentListData, optionsData] = await Promise.all([
				fetchListData(listName),
				fetchListData(optionsListName)
			]);

			// Current list items and its own metadata (for saving)
			setCurrentList(currentListData.items);
			setCurrentListMeta({
				recipeOrder: currentListData.recipeOrder,
				storeSections: currentListData.storeSections
			});

			// Options list data (for UI: available items, recipe picker, sort order)
			setPossibleItems(optionsData.items);
			setRecipeOrder(optionsData.recipeOrder);
			setStoreSections(optionsData.storeSections);

			// Save backup if we got real options data
			if (optionsData.items.length > 0) {
				saveOptionsBackup(optionsListName, optionsData);
			}

			// Check if options are empty but we have a backup
			if (optionsData.items.length === 0) {
				const backup = getOptionsBackup(optionsListName);
				if (backup && backup.data.items.length > 0) {
					setBackupAvailable(backup);
				}
			}

			setIsLoading(false);
		};

		loadData();
	}, [listName, optionsListName]);

	// WebSocket connection for the main list
	useEffect(() => {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const basePath = window.location.pathname.replace(/\/+$/, '');
		const ws = new WebSocket(`${protocol}//${window.location.host}${basePath}/api/ws/${listName}`);
		wsRef.current = ws;

		ws.onopen = () => setWsConnected(true);
		ws.onclose = () => { setWsConnected(false); wsRef.current = null; };
		ws.onerror = () => setWsConnected(false);
		ws.onmessage = (event) => {
			const data = JSON.parse(event.data) as ListData;
			skipNextSend.current = true;
			setCurrentList(data.items);
			setCurrentListMeta({ recipeOrder: data.recipeOrder, storeSections: data.storeSections });
			setIsLoading(false);
			setWsConnected(true);
		};

		return () => ws.close();
	}, [listName]);

	// Send local changes to server immediately
	useEffect(() => {
		if (skipNextSend.current) {
			skipNextSend.current = false;
			return;
		}
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN || isLoading) return;
		ws.send(JSON.stringify({
			items: currentList,
			recipeOrder: currentListMeta.recipeOrder,
			storeSections: currentListMeta.storeSections,
		}));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentList]);
	const getNow = () => new Date().toISOString();

	useEffect(() => {
		window.debug = () => {
			console.debug({ currentList, possibleItems, recipeOrder, storeSections });
		};
	}, [currentList, possibleItems, recipeOrder, storeSections]);

	const restoreFromBackup = async () => {
		if (!backupAvailable) return;
		const { data } = backupAvailable;
		await saveOptionsData(data.items, data.recipeOrder, data.storeSections);
		setBackupAvailable(null);
	};

	const dismissBackup = () => setBackupAvailable(null);

	const saveOptionsData = async (items: Item[], recipes: string[], sections?: string[]) => {
		// Use provided sections, or current effectiveSortOrder to persist any auto-discovered categories
		const sectionsToSave = sections ?? effectiveSortOrder;
		const optionsData: ListData = { items, recipeOrder: recipes, storeSections: sectionsToSave };
		await fetch(`/api/state/${optionsListName}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(optionsData),
		});
		setPossibleItems(items);
		setRecipeOrder(recipes);
		setStoreSections(sectionsToSave);
	};

	const addRecipe = async (recipeName: string, recipeItems: Item[]) => {
		// Add recipe to the order
		const newRecipeOrder = [...recipeOrder, recipeName];

		// Update possibleItems with recipe assignments
		const updatedItems = [...possibleItems];
		for (const recipeItem of recipeItems) {
			const existingIndex = updatedItems.findIndex(i => i.name === recipeItem.name);
			if (existingIndex >= 0) {
				// Item exists in options, add recipe to its recipes array
				const existing = updatedItems[existingIndex];
				const recipes = existing.recipes || [];
				if (!recipes.includes(recipeName)) {
					// Preserve default status: if item was a default item, keep it as one
					const wasDefault = isDefaultItem(existing);
					const newRecipes = wasDefault && !recipes.includes(DEFAULT_RECIPE)
						? [...recipes, DEFAULT_RECIPE, recipeName]
						: [...recipes, recipeName];
					updatedItems[existingIndex] = {
						...existing,
						recipes: newRecipes
					};
				}
			} else {
				// Item might be from currentList or new - add to options with recipe
				updatedItems.push({
					...recipeItem,
					recipes: [recipeName]
				});
			}
		}

		await saveOptionsData(updatedItems, newRecipeOrder);
	};

	const deleteRecipe = async (recipeName: string) => {
		// Remove recipe from the order
		const newRecipeOrder = recipeOrder.filter(r => r !== recipeName);

		// Remove recipe from all items in possibleItems
		const updatedItems = possibleItems.map(item => {
			if (!item.recipes?.includes(recipeName)) return item;
			const newRecipes = item.recipes.filter(r => r !== recipeName);
			return { ...item, recipes: newRecipes };
		});

		await saveOptionsData(updatedItems, newRecipeOrder);
	};

	const reorderRecipe = (recipeName: string, newIndex: number) => {
		const oldIndex = recipeOrder.indexOf(recipeName);
		if (oldIndex === -1 || oldIndex === newIndex) return;

		const newOrder = [...recipeOrder];
		newOrder.splice(oldIndex, 1);
		newOrder.splice(newIndex, 0, recipeName);

		// Save immediately since recipes are in options
		saveOptionsData(possibleItems, newOrder);
	};

	const reorderSection = (sectionName: string, newIndex: number) => {
		const oldIndex = effectiveSortOrder.indexOf(sectionName);
		if (oldIndex === -1 || oldIndex === newIndex) return;

		const newOrder = [...effectiveSortOrder];
		newOrder.splice(oldIndex, 1);
		newOrder.splice(newIndex, 0, sectionName);

		saveOptionsData(possibleItems, recipeOrder, newOrder);
	};

	const addSection = (sectionName: string) => {
		if (effectiveSortOrder.includes(sectionName)) return;
		const newSections = [...effectiveSortOrder, sectionName];
		saveOptionsData(possibleItems, recipeOrder, newSections);
	};

	const deleteSection = async (sectionName: string, deleteItems: boolean) => {
		// Remove section from the order
		const newSections = effectiveSortOrder.filter(s => s !== sectionName);

		if (deleteItems) {
			// Mark all items in this category as deleted
			const now = getNow();
			const updatedCurrentList = currentList.map(item =>
				item.category === sectionName
					? { ...item, deleted: true, deletedAt: now, lastUpdated: now }
					: item
			);
			setCurrentList(updatedCurrentList);

			// Also remove from possibleItems
			const updatedPossibleItems = possibleItems.filter(item => item.category !== sectionName);
			await saveOptionsData(updatedPossibleItems, recipeOrder, newSections);
		} else {
			// Move items to "unknown" category
			const now = getNow();
			const updatedCurrentList = currentList.map(item =>
				item.category === sectionName
					? { ...item, category: "unknown", lastUpdated: now }
					: item
			);
			setCurrentList(updatedCurrentList);

			const updatedPossibleItems = possibleItems.map(item =>
				item.category === sectionName
					? { ...item, category: "unknown" }
					: item
			);
			await saveOptionsData(updatedPossibleItems, recipeOrder, newSections);
		}
	};

	const pruneList = () => {
		const now = getNow();
		// 1. Mark non-needed, non-deleted items as deleted
		const updated = currentList.map(item =>
			item.status !== "need"
				? { ...item, deleted: true, deletedAt: now, lastUpdated: now }
				: item
		);
		setCurrentList(updated);
	};

	const toggleCurrentItem = (itemName: string) => {
		const updatedList = currentList.map((item) => {
			if (item.name === itemName && !item.deleted) {
				return {
					...item,
					status: (item.status === "need" ? "carted" : "need") as "need" | "carted",
					lastUpdated: getNow()
				};
			}
			return item;
		});
		setCurrentList(updatedList);
	};

	const addItemByName = (itemName: string, category?: string) => {
		const now = getNow();
		// If item exists and is deleted, undelete it
		const existing = currentList.find(item => item.name === itemName && item.deleted);
		if (existing) {
			return setCurrentList(currentList.map(item =>
				item === existing
					? {
						...item, deleted: false, deletedAt: undefined, status:
							"need", category: category || item.category, lastUpdated: now
					}
					: item
			));
		}
		setCurrentList([...currentList, {
			name: itemName,
			status: "need",
			category,
			dateAdded: now,
			lastUpdated: now,
			deleted: false,
		}]);
	};

	const removeItemByName = (itemName: string) => {
		const now = getNow();
		const newItems = currentList.map(item =>
			item.name === itemName && !item.deleted
				? { ...item, deleted: true, deletedAt: now, lastUpdated: now }
				: item
		);
		setCurrentList(newItems);
	}

	const itemsByCategory = useMemo(() => {
		const grouped: { [category: string]: Item[] } = {};
		activeItems.forEach(item => {
			const category = item.category || "unknown";
			if (!grouped[category]) {
				grouped[category] = [];
			}
			grouped[category].push(item);
		});
		// Sort items within each category by sortIndex (if present), then by dateAdded
		Object.keys(grouped).forEach(category => {
			grouped[category].sort((a, b) => {
				const aIndex = a.sortIndex ?? Infinity;
				const bIndex = b.sortIndex ?? Infinity;
				if (aIndex !== bIndex) return aIndex - bIndex;
				// Fallback to dateAdded for items without sortIndex
				return (a.dateAdded || "").localeCompare(b.dateAdded || "");
			});
		});
		return grouped;
	}, [activeItems]);

	const reorderItem = (itemName: string, category: string, newIndex: number) => {
		const categoryItems = itemsByCategory[category];
		if (!categoryItems) return;

		const oldIndex = categoryItems.findIndex(i => i.name === itemName);
		if (oldIndex === -1 || oldIndex === newIndex) return;

		// Build new order for this category
		const reordered = [...categoryItems];
		const [moved] = reordered.splice(oldIndex, 1);
		reordered.splice(newIndex, 0, moved);

		// Assign new sortIndex values
		const now = getNow();
		const updates = new Map<string, number>();
		reordered.forEach((item, idx) => {
			updates.set(item.name, idx);
		});

		setCurrentList(currentList.map(item => {
			if (item.category === category || (!item.category && category === "unknown")) {
				const newSortIndex = updates.get(item.name);
				if (newSortIndex !== undefined) {
					return { ...item, sortIndex: newSortIndex, lastUpdated: now };
				}
			}
			return item;
		}));
	};

	if (isLoading) return <div>Loading...</div>;
	const itemNamesOnList = activeItems.map((item) => item.name);
	return (
		<div className="grocery-app">
			{backupAvailable && (
				<div className="backup-banner">
					<span>
						Options list is empty but a backup from {new Date(backupAvailable.timestamp).toLocaleString()} exists ({backupAvailable.data.items.length} items).
					</span>
					<button onClick={restoreFromBackup}>Restore</button>
					<button onClick={dismissBackup}>Dismiss</button>
				</div>
			)}
			<SkippedItemsIndicator items={skippedItems} onScrollToTop={scrollToTop} />
			<button onClick={pruneList}>
				Prune Purchases
			</button>
			<button onClick={() => setIsRemoving(!isRemoving)}
			>
				{isRemoving ? "Done Removing" : "Remove Items"}
			</button>
			<button onClick={() => setIsSorting(!isSorting)} className={isSorting ? 'active-mode' : ''}>
				{isSorting ? "Done Sorting" : "Sort Items"}
			</button>
			{wsConnected === false && <span className="error">Disconnected</span>}

			<hr />

			<button
				className="collapsible-header"
				onClick={() => toggleSectionCollapse('currentList')}
			>
				<span className="collapse-indicator">{collapsedSections.currentList ? '+' : '-'}</span>
				{isRemoving ? "Remove From " : isSorting ? "Drag to Reorder " : ""}Current List
				<span className="section-count">({activeItems.length} items)</span>
			</button>
			{!collapsedSections.currentList && effectiveSortOrder.map(category => {
				const items = itemsByCategory[category];
				if (!items || items.length === 0) return null;
				const isCollapsed = collapsedCategories.has(category);

				return (
					<Fragment key={category}>
						<div className="category-header">
							<button
								className="category-pill"
								onClick={() => toggleCategoryCollapse(category)}
							>
								<span className="collapse-indicator">{isCollapsed ? '+' : '-'}</span>
								{category}
								<span className="category-count">({items.length})</span>
							</button>
						</div>
						{!isCollapsed && (
							<div className="item-grid">
								{items.map((item, index) => (
									<Fragment key={item.name}>
										{isRemoving ? <AvailableItem
											key={item.name}
											item={item}
											onChange={removeItemByName}
											className={`removable-item ${item.status}`}
										/>
											: isSorting ? <DraggableItem
												key={item.name}
												item={item}
												index={index}
												category={category}
												onReorder={reorderItem}
											/>
												: <ListItem
													key={item.name}
													item={item}
													currentValue={item.status === "carted"}
													toggleCurrentItems={toggleCurrentItem}
													registerRef={registerItemRef}
												/>}
									</Fragment>
								))}
							</div>
						)}
					</Fragment>
				)
			})}
			<hr />
			<AddItems
				onAddItem={addItemByName}
				possibleItems={possibleItems}
				activeItemNames={itemNamesOnList}
				recipeOrder={recipeOrder}
				storeSections={effectiveSortOrder}
				onAddRecipeClick={() => setShowAddRecipeModal(true)}
				onDeleteRecipe={deleteRecipe}
				isSorting={isSorting}
				onReorderRecipe={reorderRecipe}
				onReorderSection={reorderSection}
				onAddSection={addSection}
				onDeleteSection={deleteSection}
				collapsedSections={collapsedSections}
				onToggleSectionCollapse={toggleSectionCollapse}
				listName={listName}
				onHelpClick={() => setShowHelpModal(true)}
			/>
			{showAddRecipeModal && (
				<AddRecipeModal
					possibleItems={allAvailableItems}
					storeSections={effectiveSortOrder}
					onSave={addRecipe}
					onClose={() => setShowAddRecipeModal(false)}
				/>
			)}
			{showHelpModal && (
				<HelpModal onClose={() => setShowHelpModal(false)} />
			)}
		</div >
	);
}

interface AddItemsProps {
	onAddItem: (itemName: string, category?: string) => void;
	possibleItems: Item[];
	activeItemNames: string[];
	recipeOrder: string[];
	storeSections: string[];
	onAddRecipeClick: () => void;
	onDeleteRecipe: (recipeName: string) => Promise<void>;
	isSorting: boolean;
	onReorderRecipe: (recipeName: string, newIndex: number) => void;
	onReorderSection: (sectionName: string, newIndex: number) => void;
	onAddSection: (sectionName: string) => void;
	onDeleteSection: (sectionName: string, deleteItems: boolean) => Promise<void>;
	collapsedSections: { sections: boolean; standardItems: boolean };
	onToggleSectionCollapse: (section: 'sections' | 'standardItems') => void;
	listName: string;
	onHelpClick: () => void;
}

// Check if an item should appear in Standard Items (default items)
const isDefaultItem = (item: Item): boolean => {
	// No recipes array or empty array = default item (backwards compatible)
	if (!item.recipes || item.recipes.length === 0) return true;
	// Explicitly in "default items"
	return item.recipes.includes(DEFAULT_RECIPE);
};

const AddItems = memo(({ onAddItem, possibleItems, activeItemNames, recipeOrder, storeSections, onAddRecipeClick, onDeleteRecipe, isSorting, onReorderRecipe, onReorderSection, onAddSection, onDeleteSection, collapsedSections, onToggleSectionCollapse, listName, onHelpClick }: AddItemsProps) => {
	const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
	// TODO: Combine the dragging state into a single object to simplify?
	const [draggingRecipe, setDraggingRecipe] = useState<string | null>(null);
	const [dragOverRecipe, setDragOverRecipe] = useState<string | null>(null);
	const [draggingSection, setDraggingSection] = useState<string | null>(null);
	const [dragOverSection, setDragOverSection] = useState<string | null>(null);
	const [deletingSectionName, setDeletingSectionName] = useState<string | null>(null);
	const [deleteItemsChecked, setDeleteItemsChecked] = useState(false);
	const [isAddingSection, setIsAddingSection] = useState(false);
	const [newSectionName, setNewSectionName] = useState("");
	const [searchFilter, setSearchFilter] = useState("");
	const newSectionInputRef = useRef<HTMLInputElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isAddingSection && newSectionInputRef.current) {
			newSectionInputRef.current.focus();
		}
	}, [isAddingSection]);

	// Standard items: default items not already on the list
	const standardItems = useMemo(() => {
		return possibleItems
			.filter((item) => isDefaultItem(item) && !activeItemNames.includes(item.name))
			.sort((a, b) => {
				const categoryA = a.category || "unknown";
				const categoryB = b.category || "unknown";
				return storeSections.indexOf(categoryA) - storeSections.indexOf(categoryB);
			});
	}, [possibleItems, activeItemNames, storeSections]);

	const filteredStandardItems = useMemo(() => {
		if (!searchFilter.trim()) return standardItems;
		const query = searchFilter.toLowerCase();
		return standardItems.filter(item => item.name.toLowerCase().includes(query));
	}, [standardItems, searchFilter]);

	// Get items for a specific recipe
	const getRecipeItems = (recipeName: string) => {
		return possibleItems
			.filter((item) => item.recipes?.includes(recipeName))
			.sort((a, b) => {
				const categoryA = a.category || "unknown";
				const categoryB = b.category || "unknown";
				return storeSections.indexOf(categoryA) - storeSections.indexOf(categoryB);
			});
	};

	const handleSectionDragStart = (sectionName: string, index: number) => (e: DragEvent) => {
		setDraggingSection(sectionName);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'section', name: sectionName, index }));
		}
	};

	const handleSectionDragEnd = () => {
		setDraggingSection(null);
	};

	const handleSectionDragOver = (sectionName: string) => (e: DragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		setDragOverSection(sectionName);
	};

	const handleSectionDragLeave = () => {
		setDragOverSection(null);
	};

	const handleSectionDrop = (targetIndex: number) => (e: DragEvent) => {
		e.preventDefault();
		setDragOverSection(null);
		if (!e.dataTransfer) return;

		try {
			const data = JSON.parse(e.dataTransfer.getData('text/plain'));
			if (data.type === 'section' && data.index !== targetIndex) {
				onReorderSection(data.name, targetIndex);
			}
		} catch {
			// Invalid drag data
		}
	};

	const handleAddSectionSubmit = (e: Event) => {
		e.preventDefault();
		if (newSectionName.trim()) {
			onAddSection(newSectionName.trim());
			setNewSectionName("");
			setIsAddingSection(false);
		}
	};

	const handleDeleteConfirm = async () => {
		if (deletingSectionName) {
			await onDeleteSection(deletingSectionName, deleteItemsChecked);
			setDeletingSectionName(null);
			setDeleteItemsChecked(false);
		}
	};

	return (
		<>
			<button
				className="collapsible-header"
				onClick={() => onToggleSectionCollapse('sections')}
			>
				<span className="collapse-indicator">{collapsedSections.sections ? '+' : '-'}</span>
				{isSorting ? "Drag to Reorder " : ""}Sections
				<span className="section-count">({storeSections.length})</span>
			</button>
			{!collapsedSections.sections && (
				<div className="item-grid">
					{storeSections.map((category, index) => {
						const isDragging = draggingSection === category;
						const isDragOver = dragOverSection === category;

						return isSorting ? (
							<div key={category} className="section-row">
								<button
									className={`available-item custom draggable-section ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
									draggable
									onDragStart={handleSectionDragStart(category, index)}
									onDragEnd={handleSectionDragEnd}
									onDragOver={handleSectionDragOver(category)}
									onDragLeave={handleSectionDragLeave}
									onDrop={handleSectionDrop(index)}
								>
									<span className="drag-handle">⋮⋮</span>
									{category}
								</button>
								<button
									className="section-delete"
									onClick={() => setDeletingSectionName(category)}
									title="Delete section"
								>
									&times;
								</button>
							</div>
						) : (
							<CustomItem key={category} onChange={onAddItem} category={category} />
						);
					})}
					{isAddingSection ? (
						<form onSubmit={handleAddSectionSubmit} className="add-section-form">
							<input
								ref={newSectionInputRef}
								type="text"
								value={newSectionName}
								onChange={(e) => setNewSectionName((e.target as HTMLInputElement).value)}
								placeholder="Section name"
							/>
							<button type="submit">Add</button>
							<button type="button" onClick={() => { setIsAddingSection(false); setNewSectionName(""); }}>Cancel</button>
						</form>
					) : (
						<button className="add-section-button" onClick={() => setIsAddingSection(true)}>
							+ Add Section
						</button>
					)}
				</div>
			)}
			<button
				className="collapsible-header"
				onClick={() => onToggleSectionCollapse('standardItems')}
			>
				<span className="collapse-indicator">{collapsedSections.standardItems ? '+' : '-'}</span>
				Standard Items
				<span className="section-count">({standardItems.length})</span>
			</button>
			{!collapsedSections.standardItems && (
				<>
					<div className="search-filter">
						<input
							ref={searchInputRef}
							type="text"
							value={searchFilter}
							onInput={(e) => setSearchFilter((e.target as HTMLInputElement).value)}
							placeholder="Filter items..."
							className="search-filter-input"
						/>
						{searchFilter && (
							<button
								className="search-filter-clear"
								onClick={() => { setSearchFilter(""); searchInputRef.current?.focus(); }}
							>&times;</button>
						)}
					</div>
					<div className="item-grid">
						{filteredStandardItems.map((item, index) => (
							<AvailableItem
								key={`available-${item.name}`}
								showCategoryLabel={index === 0 || item.category !== filteredStandardItems[index - 1].category}
								item={item}
								onChange={(name, category) => { onAddItem(name, category); setSearchFilter(""); }}
							/>
						))}
						{searchFilter && filteredStandardItems.length === 0 && (
							<div className="search-no-results">No items match "{searchFilter}"</div>
						)}
					</div>
				</>
			)}
			<h3>{isSorting ? "Drag to Reorder " : ""}Recipes</h3>
			{recipeOrder.map((recipeName, index) => {
				const isExpanded = expandedRecipe === recipeName;
				const recipeItems = getRecipeItems(recipeName);
				const isDragging = draggingRecipe === recipeName;
				const isDragOver = dragOverRecipe === recipeName;

				const handleRecipeDragStart = (e: DragEvent) => {
					setDraggingRecipe(recipeName);
					if (e.dataTransfer) {
						e.dataTransfer.effectAllowed = 'move';
						e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'recipe', name: recipeName, index }));
					}
				};

				const handleRecipeDragEnd = () => {
					setDraggingRecipe(null);
				};

				const handleRecipeDragOver = (e: DragEvent) => {
					e.preventDefault();
					if (e.dataTransfer) {
						e.dataTransfer.dropEffect = 'move';
					}
					setDragOverRecipe(recipeName);
				};

				const handleRecipeDragLeave = () => {
					setDragOverRecipe(null);
				};

				const handleRecipeDrop = (e: DragEvent) => {
					e.preventDefault();
					setDragOverRecipe(null);
					if (!e.dataTransfer) return;

					try {
						const data = JSON.parse(e.dataTransfer.getData('text/plain'));
						if (data.type === 'recipe' && data.name !== recipeName) {
							onReorderRecipe(data.name, index);
						}
					} catch {
						// Invalid drag data
					}
				};

				return (
					<div key={recipeName} className="recipe-section">
						<div className="recipe-header-row">
							<button
								className={`recipe-header ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
								onClick={() => !isSorting && setExpandedRecipe(isExpanded ? null : recipeName)}
								draggable={isSorting}
								onDragStart={isSorting ? handleRecipeDragStart : undefined}
								onDragEnd={isSorting ? handleRecipeDragEnd : undefined}
								onDragOver={isSorting ? handleRecipeDragOver : undefined}
								onDragLeave={isSorting ? handleRecipeDragLeave : undefined}
								onDrop={isSorting ? handleRecipeDrop : undefined}
							>
								{isSorting && <span className="drag-handle">⋮⋮</span>}
								<span className="recipe-toggle">{isExpanded ? '▾' : '▸'}</span>
								{recipeName}
								<span className="recipe-count">({recipeItems.length})</span>
							</button>
							{!isSorting && (
								<button
									className="recipe-delete"
									onClick={(e) => {
										e.stopPropagation();
										if (confirm(`Delete recipe "${recipeName}"?`)) {
											onDeleteRecipe(recipeName);
										}
									}}
									title="Delete recipe"
								>
									&times;
								</button>
							)}
						</div>
						{isExpanded && !isSorting && (
							<div className="recipe-items">
								{recipeItems.map((item) => (
									<AvailableItem
										key={`recipe-${recipeName}-${item.name}`}
										item={item}
										onChange={onAddItem}
										className={activeItemNames.includes(item.name) ? 'already-added' : ''}
									/>
								))}
							</div>
						)}
					</div>
				);
			})}
			<button className="add-recipe-button" onClick={onAddRecipeClick}>
				+ Add Recipe
			</button>
			{deletingSectionName && (
				<div className="modal-overlay" onClick={() => { setDeletingSectionName(null); setDeleteItemsChecked(false); }}>
					<div className="modal-content delete-section-modal" onClick={e => e.stopPropagation()}>
						<div className="modal-header">
							<h2>Delete Section</h2>
							<button className="modal-close" onClick={() => { setDeletingSectionName(null); setDeleteItemsChecked(false); }}>&times;</button>
						</div>
						<div className="modal-body">
							<p>Delete the section "{deletingSectionName}"?</p>
							<p>Items in this section will be moved to "unknown".</p>
							<label className="delete-items-checkbox">
								<input
									type="checkbox"
									checked={deleteItemsChecked}
									onChange={(e) => setDeleteItemsChecked((e.target as HTMLInputElement).checked)}
								/>
								Also delete all items in this section
							</label>
						</div>
						<div className="modal-footer">
							<button onClick={() => { setDeletingSectionName(null); setDeleteItemsChecked(false); }}>Cancel</button>
							<button onClick={handleDeleteConfirm} className="delete-button">
								Delete Section
							</button>
						</div>
					</div>
				</div>
			)}
			<div className="item-grid">
				<span onClick={onHelpClick} className="footer-link help-link">Help</span>
				{listName.endsWith('-options') ? (
					<a href={`#${listName.slice(0, -8)}`} target="_blank" className="footer-link">Go to List</a>
				) : (
					<a href={`#${listName}-options`} className="footer-link" target="_blank">Edit Options</a>
				)}
				<a href="https://ko-fi.com/lucamasters" target="_blank" rel="noopener noreferrer" className="footer-link">
					Support me on Ko-Fi.
				</a>
			</div>
		</>
	);
});

interface SkippedItemsIndicatorProps {
	items: string[];
	onScrollToTop: () => void;
}

const SkippedItemsIndicator = ({ items, onScrollToTop }: SkippedItemsIndicatorProps) => {
	if (items.length === 0) return null;

	const displayText = items.length <= 3
		? items.join(', ')
		: `${items.slice(0, 3).join(', ')} +${items.length - 3}`;

	return (
		<button
			className="skipped-indicator"
			onClick={onScrollToTop}
			aria-label={`${items.length} unchecked items above. Click to scroll up.`}
		>
			<span className="skipped-arrow">^</span>
			<span className="skipped-text">{displayText}</span>
		</button>
	);
};

interface ListItemProps {
	toggleCurrentItems: (itemName: string) => void;
	currentValue: boolean;
	item: Item;
	registerRef?: (itemName: string, el: HTMLElement | null) => void;
}

const ListItem = ({ item, currentValue, toggleCurrentItems, registerRef }: ListItemProps) => {
	return (
		<div ref={el => registerRef?.(item.name, el)}>
			<input
				type="checkbox"
				checked={currentValue}
				id={item.name}
				onChange={() => toggleCurrentItems(item.name)}
			/>
			<label htmlFor={item.name}>
				{item.name}
			</label>
		</div>
	);
};

interface DraggableItemProps {
	item: Item;
	index: number;
	category: string;
	onReorder: (itemName: string, category: string, newIndex: number) => void;
}

const DraggableItem = ({ item, index, category, onReorder }: DraggableItemProps) => {
	const [isDragging, setIsDragging] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);

	const handleDragStart = (e: DragEvent) => {
		setIsDragging(true);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', JSON.stringify({ name: item.name, category, index }));
		}
	};

	const handleDragEnd = () => {
		setIsDragging(false);
	};

	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		setIsDragOver(true);
	};

	const handleDragLeave = () => {
		setIsDragOver(false);
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
		if (!e.dataTransfer) return;

		try {
			const data = JSON.parse(e.dataTransfer.getData('text/plain'));
			// Only allow drops within same category
			if (data.category === category && data.name !== item.name) {
				onReorder(data.name, category, index);
			}
		} catch {
			// Invalid drag data
		}
	};

	return (
		<button
			draggable
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			className={`draggable-item ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''} ${item.status || ''}`}
		>
			<span className="drag-handle">⋮⋮</span>
			{item.name}
		</button>
	);
};

interface AvailableItemProps {
	onChange: (itemName: string, category?: string) => void;
	className?: string;
	item: Item;
}

const AvailableItem = ({ item, onChange, className = "", showCategoryLabel = false }: AvailableItemProps & { showCategoryLabel?: boolean }) => {
	const [isRemoving, setIsRemoving] = useState(false);

	const handleClick = () => {
		setIsRemoving(true);
		// Wait for animation to complete before calling onChange
		setTimeout(() => {
			onChange(item.name, item.category);
		}, 100); // matches transition duration
	};

	return (
		<button onClick={handleClick} className={`available-item ${className} ${isRemoving ? 'removing' : ''}`}>
			{showCategoryLabel && <span className={`sideways-category-header`}>{item.category}</span>}
			{item.name}
		</button>
	);
};

interface CustomItemProps {
	onChange: (itemName: string, category?: string) => void;
	category: string;
}

const CustomItem = ({ onChange, category }: CustomItemProps) => {
	const [isEditing, setIsEditing] = useState(false);
	const [customValue, setCustomValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isEditing]);

	const handleSubmit = (e: Event) => {
		e.preventDefault();
		if (customValue.trim()) {
			onChange(customValue.trim(), category);
			setCustomValue("");
			setIsEditing(false);
		}
	};

	const handleCancel = () => {
		setCustomValue("");
		setIsEditing(false);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			handleCancel();
		}
	};

	if (isEditing) {
		return (
			<form onSubmit={handleSubmit} className="custom-item-form">
				<button type="button" className="custom-item-cancel" onClick={handleCancel}>
					×
				</button>
				<input
					ref={inputRef}
					type="text"
					value={customValue}
					onChange={(e) => setCustomValue((e.target as HTMLInputElement)?.value)}
					onKeyDown={handleKeyDown}
					placeholder={category}
					className="custom-item-input"
				/>
				<button type="submit" className="custom-item-submit" disabled={!customValue.trim()}>
					+
				</button>
			</form>
		);
	}

	return (
		<button onClick={() => setIsEditing(true)} className="available-item custom">
			<span className="custom-item-plus">+</span>
			{category}
		</button>
	);
};

interface AddRecipeModalProps {
	possibleItems: Item[];
	storeSections: string[];
	onSave: (recipeName: string, items: Item[]) => Promise<void>;
	onClose: () => void;
}

const AddRecipeModal = ({ possibleItems, storeSections, onSave, onClose }: AddRecipeModalProps) => {
	const [recipeName, setRecipeName] = useState("");
	const [recipeItems, setRecipeItems] = useState<Item[]>([]);
	const [isSaving, setIsSaving] = useState(false);
	const nameInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		nameInputRef.current?.focus();
	}, []);

	const addItemToRecipe = (itemName: string, category?: string) => {
		if (recipeItems.some(i => i.name === itemName)) return;
		setRecipeItems([...recipeItems, { name: itemName, category }]);
	};

	const removeItemFromRecipe = (itemName: string) => {
		setRecipeItems(recipeItems.filter(i => i.name !== itemName));
	};

	const handleSave = async () => {
		if (!recipeName.trim() || recipeItems.length === 0) return;
		setIsSaving(true);
		await onSave(recipeName.trim(), recipeItems);
		setIsSaving(false);
		onClose();
	};

	// Items available to add (from possibleItems, excluding already added)
	const availableItems = useMemo(() => {
		const addedNames = recipeItems.map(i => i.name);
		return possibleItems
			.filter(item => !addedNames.includes(item.name))
			.sort((a, b) => {
				const categoryA = a.category || "unknown";
				const categoryB = b.category || "unknown";
				return storeSections.indexOf(categoryA) - storeSections.indexOf(categoryB);
			});
	}, [possibleItems, recipeItems, storeSections]);

	// Group recipe items by category for display
	const recipeItemsByCategory = useMemo(() => {
		const grouped: { [category: string]: Item[] } = {};
		recipeItems.forEach(item => {
			const category = item.category || "unknown";
			if (!grouped[category]) grouped[category] = [];
			grouped[category].push(item);
		});
		return grouped;
	}, [recipeItems]);

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content" onClick={e => e.stopPropagation()}>
				<div className="modal-header">
					<h2>Add Recipe</h2>
					<button className="modal-close" onClick={onClose}>&times;</button>
				</div>

				<div className="modal-body">
					<div className="recipe-name-input">
						<label htmlFor="recipe-name">Recipe Name</label>
						<input
							ref={nameInputRef}
							id="recipe-name"
							type="text"
							value={recipeName}
							onChange={e => setRecipeName((e.target as HTMLInputElement).value)}
							placeholder="e.g., Sausage with Roasted Veggies"
						/>
					</div>

					<div className="recipe-editor">
						<div className="recipe-items-list">
							<h3>Recipe Items ({recipeItems.length})</h3>
							{recipeItems.length === 0 ? (
								<p className="empty-message">Add items from the right panel</p>
							) : (
								storeSections.map(category => {
									const items = recipeItemsByCategory[category];
									if (!items || items.length === 0) return null;
									return (
										<Fragment key={category}>
											<h4 className="recipe-category">{category}</h4>
											{items.map(item => (
												<button
													key={item.name}
													className="available-item removable-item"
													onClick={() => removeItemFromRecipe(item.name)}
												>
													{item.name}
												</button>
											))}
										</Fragment>
									);
								})
							)}
						</div>

						<div className="available-items-list">
							<h3>Available Items</h3>
							{storeSections.map(category => (
								<CustomItem key={category} onChange={addItemToRecipe} category={category} />
							))}
							{availableItems.map(item => (
								<AvailableItem
									key={item.name}
									item={item}
									onChange={addItemToRecipe}
								/>
							))}
						</div>
					</div>
				</div>

				<div className="modal-footer">
					<button onClick={onClose} disabled={isSaving}>Cancel</button>
					<button
						onClick={handleSave}
						disabled={!recipeName.trim() || recipeItems.length === 0 || isSaving}
						className="save-button"
					>
						{isSaving ? "Saving..." : "Save Recipe"}
					</button>
				</div>
			</div>
		</div>
	);
};

interface HelpModalProps {
	onClose: () => void;
}

const HelpModal = ({ onClose }: HelpModalProps) => {
	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content help-modal" onClick={e => e.stopPropagation()}>
				<div className="modal-header">
					<h2>Don't Forget the Oatmeal!</h2>
					<button className="modal-close" onClick={onClose}>&times;</button>
				</div>
				<div className="modal-body">
					<h3>A simple grocery list app</h3>
					<p>You can create a personal grocery list given hash. e.g., https://lucamasters.com/grocery#johnsmith</p>
					<p>You can create a list of default items that you frequently purchase by creating a second list with the same hash but appending "-options" to the end. e.g., https://lucamasters.com/grocery#johnsmith-options</p>
					<p>All lists are saved to Cloudflare Workers, which means anyone who guesses the hash can see and modify your list. Don't use this for sensitive information, and consider using a less obvious hash.</p>
					<p>Note, however, that this feature means it will sync across devices, and can be shared with others. Do note that it's possible to accidentally clobber the list. It tries to combine intelligently if you modify on two different devices, but I recommend reloading the tab if it's been sitting open while you modified the list on another device.</p>
					<p>Please don't abuse this. I just want it for my own purposes, and don't want to have to add auth or anything.</p>
				</div>
				<div className="modal-footer">
					<button onClick={onClose}>Close</button>
				</div>
			</div>
		</div>
	);
};
