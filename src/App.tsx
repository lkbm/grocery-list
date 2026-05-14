import { useState, useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import { Fragment } from 'preact';
import { Item, ListData } from './types';
import { AddRecipeModal } from './RecipeModal';
import { HelpModal } from './HelpModal';
import { AvailableItem } from './AvailableItem';
import { DEFAULT_RECIPE, isDefaultItem, getNow } from './helpers';
import { AddItems } from './AddItems';
import { DraggableItem } from './DraggableItem';

export const blankList = { items: [], recipes: [], storeSections: [] };

declare global {
	interface Window {
		debug: () => void;
	}
}

	const clearReconnectTimer = (reconnectTimeoutRef: { current: number | null }) => {
		if (reconnectTimeoutRef.current !== null) {
			window.clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
	};

const reconnect = (reconnectAttemptsRef: { current: number }, wsRef: { current: WebSocket | null}, openSocket: (() => void)) => {
	clearReconnectTimer(reconnectAttemptsRef);
	reconnectAttemptsRef.current = 0;

	const mainWs = wsRef.current;
	if (!mainWs || mainWs.readyState === WebSocket.CLOSED) {
		openSocket();
	}
};

const useOptionsSocket = (listName: string) => {
	const optionsListName = listName.endsWith('-options') ? listName : `${listName}-options`;
	const wsOptionsRef = useRef<WebSocket | null>(null);
	const optionsReconnectTimeoutRef = useRef<number | null>(null);
	const optionsReconnectAttemptsRef = useRef<number>(0);
	const [backupAvailable, setBackupAvailable] = useState<{ data: ListData; timestamp: string } | null>(null);
	const [recipes, setRecipes] = useState<string[]>([]);
	const [storeSections, setStoreSections] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [possibleItems, setPossibleItems] = useState<Item[]>([]);
	const skipNextSend = useRef<boolean>(false);
	const clearOptionsReconnectTimer = () => clearReconnectTimer(optionsReconnectTimeoutRef);

	const restoreFromBackup = async () => {
		if (!backupAvailable) return;
		const { data } = backupAvailable;
		setPossibleItems(data.items);
		setRecipes(data.recipeOrder);
		setStoreSections(data.storeSections);
		setBackupAvailable(null);
	};

	const dismissBackup = () => setBackupAvailable(null);

	// WebSocket connection for the options list
	const openOptionsSocket = (): (() => void) => {
		const existing = wsOptionsRef.current;
		if (
			existing &&
			(existing.readyState === WebSocket.OPEN ||
				existing.readyState === WebSocket.CONNECTING ||
				existing.readyState === WebSocket.CLOSING)
		) {
			return () => {};
		}

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const basePath = window.location.pathname.replace(/\/+$/, '');
		const ws = new WebSocket(`${protocol}//${window.location.host}${basePath}/api/ws/${optionsListName}`);
		wsOptionsRef.current = ws;
		clearOptionsReconnectTimer();

		let backupBannerShown = false;

		ws.onmessage = (event) => {
			const data = JSON.parse(event.data) as ListData;
			if (data.items.length > 0) {
				saveOptionsBackup(optionsListName, data);
			} else if (!backupBannerShown) {
				backupBannerShown = true;
				const backup = getOptionsBackup(optionsListName);
				if (backup && backup.data.items.length > 0) {
					setBackupAvailable(backup);
				}
			}
			skipNextSend.current = true;
			setPossibleItems(data.items);
			setRecipes(data.recipeOrder);
			setStoreSections(data.storeSections);
			setIsLoading(false);
		};

		ws.onopen = () => {
			optionsReconnectAttemptsRef.current = 0;
			clearOptionsReconnectTimer();
		};

		ws.onclose = () => {
			if (wsOptionsRef.current === ws) {
				wsOptionsRef.current = null;
				scheduleOptionsReconnect();
			}
		};

		return () => {
			if (wsOptionsRef.current === ws) {
				wsOptionsRef.current = null;
			}
			clearOptionsReconnectTimer();
			optionsReconnectAttemptsRef.current = 0;
			ws.close();
		};
	};
	const scheduleOptionsReconnect = () => {
		if (optionsReconnectTimeoutRef.current !== null) return;
		const attempt = optionsReconnectAttemptsRef.current + 1;
		optionsReconnectAttemptsRef.current = attempt;
		const delay = Math.min(1000 * 2 ** (attempt - 1), 15000);
		optionsReconnectTimeoutRef.current = window.setTimeout(() => {
			optionsReconnectTimeoutRef.current = null;
			openOptionsSocket();
		}, delay);
	};

	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(openOptionsSocket, [optionsListName]);

	// localStorage backup helpers for options data
	const getBackupKey = (optionsListName: string) => `grocery-backup:${optionsListName}`;

	const saveOptionsBackup = (optionsListName: string, data: ListData) => {
		try {
			const key = getBackupKey(optionsListName);
			localStorage.setItem(
				key,
				JSON.stringify({
					data,
					timestamp: new Date().toISOString(),
				}),
			);
		} catch (e) {
			console.warn('Failed to save options backup to localStorage', e);
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

	const saveOptionsData = () => {
		if (skipNextSend.current) { skipNextSend.current = false; return; }
		const ws = wsOptionsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN || isLoading) return;
		ws.send(JSON.stringify({ items: possibleItems, recipeOrder: recipes, storeSections }));
	};
	useEffect(saveOptionsData, [possibleItems, recipes, storeSections]); // eslint-disable-line react-hooks/exhaustive-deps
	// TODO: This should be a useEffect and we use setPossibleItems, setRecipes,  and setStoreSections to trigger it:
	const reconnectOptionsSocket = () => {
		reconnect(optionsReconnectAttemptsRef, wsOptionsRef, openOptionsSocket);
	};

	return {
		backupAvailable,
		dismissBackup,
		restoreFromBackup,
		setPossibleItems,
		setRecipes,
		setStoreSections,
		recipes,
		storeSections,
		isOptionsLoading: isLoading,
		possibleItems,
		reconnectOptionsSocket,
	};
};

const useListSocket = (listName: string) => {
	const wsRef = useRef<WebSocket | null>(null);
	const mainReconnectTimeoutRef = useRef<number | null>(null);
	const mainReconnectAttemptsRef = useRef<number>(0);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	const [wsConnected, setWsConnected] = useState<boolean | null>(null);
	const skipNextSend = useRef<boolean>(false);

	const [currentList, setCurrentList] = useState<Item[]>([]);
	// Current list's own metadata (for saving back to this list)
	const [currentListMeta, setCurrentListMeta] = useState<{ recipeOrder: string[]; storeSections: string[] }>({
		recipeOrder: [],
		storeSections: [],
	});
	// Options list metadata (for UI: recipe picker, sort order)

	const clearMainReconnectTimer = () => {
		if (mainReconnectTimeoutRef.current !== null) {
			window.clearTimeout(mainReconnectTimeoutRef.current);
			mainReconnectTimeoutRef.current = null;
		}
	};

	const scheduleMainReconnect = () => {
		if (mainReconnectTimeoutRef.current !== null) return;
		const attempt = mainReconnectAttemptsRef.current + 1;
		mainReconnectAttemptsRef.current = attempt;
		const delay = Math.min(1000 * 2 ** (attempt - 1), 15000);
		mainReconnectTimeoutRef.current = window.setTimeout(() => {
			mainReconnectTimeoutRef.current = null;
			openMainSocket();
		}, delay);
	};

	// WebSocket connection for the main list
	const openMainSocket = () => {
		const existing = wsRef.current;
		if (
			existing &&
			(existing.readyState === WebSocket.OPEN ||
				existing.readyState === WebSocket.CONNECTING ||
				existing.readyState === WebSocket.CLOSING)
		) {
			return () => {};
		}

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const basePath = window.location.pathname.replace(/\/+$/, '');
		const ws = new WebSocket(`${protocol}//${window.location.host}${basePath}/api/ws/${listName}`);
		wsRef.current = ws;
		clearMainReconnectTimer();

		ws.onopen = () => {
			setWsConnected(true);
			mainReconnectAttemptsRef.current = 0;
			clearMainReconnectTimer();
		};
		ws.onclose = () => {
			if (wsRef.current === ws) {
				setWsConnected(false);
				wsRef.current = null;
				scheduleMainReconnect();
			}
		};
		ws.onerror = () => {
			if (wsRef.current === ws) {
				setWsConnected(false);
			}
		};
		ws.onmessage = (event) => {
			const data = JSON.parse(event.data) as ListData;
			skipNextSend.current = true;
			setCurrentList(data.items);
			setCurrentListMeta({ recipeOrder: data.recipeOrder, storeSections: data.storeSections });
			setIsLoading(false);
			setWsConnected(true);
		};

		return () => {
			if (wsRef.current === ws) {
				wsRef.current = null;
			}
			clearMainReconnectTimer();
			mainReconnectAttemptsRef.current = 0;
			ws.close();
		};
	};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(openMainSocket, [listName]);

	// Send local changes to server immediately
	useEffect(() => {
		if (skipNextSend.current) {
			skipNextSend.current = false;
			return;
		}
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN || isLoading) return;
		// TODO: Should we reconned if not open?
		ws.send(
			JSON.stringify({
				items: currentList,
				recipes: currentListMeta.recipeOrder,
				storeSections: currentListMeta.storeSections,
			}),
		);
		// TODO: Should we just include isLoading in the deps?
	}, [currentList, currentListMeta, isLoading]);
	const reconnectListSocket = () => {
		reconnect(mainReconnectAttemptsRef, wsRef, openMainSocket);
	};

	return { currentList, setCurrentList, wsConnected, reconnectListSocket, isListLoading: isLoading };
};

const getListName = (): string => {
	return window.location.hash
			.slice(1)
			.replace(/[^a-zA-Z0-9_-]/g, '')
			.slice(0, 128) || 'default-list';
};

export default function App() {
	const listName = getListName();

	const {currentList, setCurrentList, wsConnected, reconnectListSocket, isListLoading } = useListSocket(listName);
	const {
		backupAvailable,
		dismissBackup,
		restoreFromBackup,
		setPossibleItems,
		setRecipes,
		setStoreSections,
		recipes,
		storeSections,
		isOptionsLoading,
		possibleItems,
		reconnectOptionsSocket,
	} = useOptionsSocket(listName);
	const isLoading = isListLoading || isOptionsLoading;
	const reconnectAll = () => {
		reconnectListSocket();
		reconnectOptionsSocket();
	};

	const [isRemoving, setIsRemoving] = useState<boolean>(false);
	const [isSorting, setIsSorting] = useState<boolean>(false);
	const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
	const toggleCategoryCollapse = (category: string) => {
		setCollapsedCategories((prev) => {
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
		standardItems: false,
	});
	const toggleSectionCollapse = (section: keyof typeof collapsedSections) => {
		setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
	};
	const [showAddRecipeModal, setShowAddRecipeModal] = useState<boolean>(false);
	const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
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

	const activeItems = useMemo(() => currentList.filter((item) => !item.deleted), [currentList]);

	// Track skipped (unchecked) items above viewport
	useEffect(() => {
		const checkSkippedItems = () => {
			const skipped: string[] = [];
			activeItems.forEach((item) => {
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
		activeItems.forEach((item) => {
			if (item.category) allCategories.add(item.category);
		});

		possibleItems.forEach((item) => {
			if (item.category) allCategories.add(item.category);
		});

		// Add any missing categories at the end
		allCategories.forEach((category) => {
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
		possibleItems.forEach((item) => itemMap.set(item.name, item));
		// Add activeItems (possibleItems items override if same name)
		// TODO: Should we override possibleItems with currentList?
		activeItems.forEach((item) => {
			if (!itemMap.has(item.name)) {
				itemMap.set(item.name, item);
			}
		});
		return Array.from(itemMap.values());
	}, [possibleItems, activeItems]);

	useEffect(() => {
		window.debug = () => {
			console.debug({ currentList, possibleItems, recipes, storeSections });
		};
	}, [currentList, possibleItems, recipes, storeSections]);

	const addRecipe = async (recipeName: string, recipeItems: Item[]) => {
		// Add recipe to the order
		const newRecipeOrder = [...recipes, recipeName];

		// Update possibleItems with recipe assignments
		const updatedItems = [...possibleItems];
		for (const recipeItem of recipeItems) {
			const existingIndex = updatedItems.findIndex((i) => i.name === recipeItem.name);
			if (existingIndex >= 0) {
				// Item exists in options, add recipe to its recipes array
				const existing = updatedItems[existingIndex];
				const recipes = existing.recipes || [];
				if (!recipes.includes(recipeName)) {
					// Preserve default status: if item was a default item, keep it as one
					const wasDefault = isDefaultItem(existing);
					const newRecipes =
						wasDefault && !recipes.includes(DEFAULT_RECIPE)
							? [...recipes, DEFAULT_RECIPE, recipeName]
							: [...recipes, recipeName];
					updatedItems[existingIndex] = {
						...existing,
						recipes: newRecipes,
					};
				}
			} else {
				// Item might be from currentList or new - add to options with recipe
				updatedItems.push({
					...recipeItem,
					recipes: [recipeName],
				});
			}
		}

		setPossibleItems(updatedItems);
		setRecipes(newRecipeOrder);
	};

	const deleteRecipe = async (recipeName: string) => {
		// Remove recipe from the order
		const newRecipeOrder = recipes.filter((r) => r !== recipeName);

		// Remove recipe from all items in possibleItems
		const updatedItems = possibleItems.map((item) => {
			if (!item.recipes?.includes(recipeName)) return item;
			const newRecipes = item.recipes.filter((r) => r !== recipeName);
			return { ...item, recipes: newRecipes };
		});

		setPossibleItems(updatedItems);
		setRecipes(newRecipeOrder);
	};

	const reorderRecipe = (recipeName: string, newIndex: number) => {
		const oldIndex = recipes.indexOf(recipeName);
		if (oldIndex === -1 || oldIndex === newIndex) return;

		const newOrder = [...recipes];
		newOrder.splice(oldIndex, 1);
		newOrder.splice(newIndex, 0, recipeName);

		setRecipes(newOrder);
	};

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
		const newSections = [...effectiveSortOrder, sectionName];
		setStoreSections(newSections);
	};

	const deleteSection = async (sectionName: string, deleteItems: boolean) => {
		// Remove section from the order
		const newSections = effectiveSortOrder.filter((s) => s !== sectionName);

		if (deleteItems) {
			// Mark all items in this category as deleted
			const now = getNow();
			const updatedCurrentList = currentList.map((item) =>
				item.category === sectionName ? { ...item, deleted: true, deletedAt: now, lastUpdated: now } : item,
			);
			setCurrentList(updatedCurrentList);

			// Also remove from possibleItems
			const updatedPossibleItems = possibleItems.filter((item) => item.category !== sectionName);
			setPossibleItems(updatedPossibleItems);
			setStoreSections(newSections);
		} else {
			// Move items to "unknown" category
			const now = getNow();
			const updatedCurrentList = currentList.map((item) =>
				item.category === sectionName ? { ...item, category: 'unknown', lastUpdated: now } : item,
			);
			setCurrentList(updatedCurrentList);

			const updatedPossibleItems = possibleItems.map((item) =>
				item.category === sectionName ? { ...item, category: 'unknown' } : item,
			);
			setPossibleItems(updatedPossibleItems);
			setStoreSections(newSections);
		}
	};

	const pruneList = () => {
		const now = getNow();
		// 1. Mark non-needed, non-deleted items as deleted
		const updated = currentList.map((item) =>
			item.status !== 'need' ? { ...item, deleted: true, deletedAt: now, lastUpdated: now } : item,
		);
		setCurrentList(updated);
	};

	const toggleCurrentItem = (itemName: string) => {
		const updatedList = currentList.map((item) => {
			if (item.name === itemName && !item.deleted) {
				return {
					...item,
					status: (item.status === 'need' ? 'carted' : 'need') as 'need' | 'carted',
					lastUpdated: getNow(),
				};
			}
			return item;
		});
		setCurrentList(updatedList);
	};

	const addItemByName = (itemName: string, category?: string) => {
		const now = getNow();
		// If item exists and is deleted, undelete it
		const existing = currentList.find((item) => item.name === itemName && item.deleted);
		if (existing) {
			return setCurrentList(
				currentList.map((item) =>
					item === existing
						? {
								...item,
								deleted: false,
								deletedAt: undefined,
								status: 'need',
								category: category || item.category,
								lastUpdated: now,
							}
						: item,
				),
			);
		}
		setCurrentList([
			...currentList,
			{
				name: itemName,
				status: 'need',
				category,
				dateAdded: now,
				lastUpdated: now,
				deleted: false,
			},
		]);
	};

	const removeItemByName = (itemName: string) => {
		const now = getNow();
		const newItems = currentList.map((item) =>
			item.name === itemName && !item.deleted
				? { ...item, deleted: true, deletedAt: now, lastUpdated: now }
				: item,
		);
		setCurrentList(newItems);
	};

	const itemsByCategory = useMemo(() => {
		const grouped: { [category: string]: Item[] } = {};
		activeItems.forEach((item) => {
			const category = item.category || 'unknown';
			if (!grouped[category]) {
				grouped[category] = [];
			}
			grouped[category].push(item);
		});
		// Sort items within each category by sortIndex (if present), then by dateAdded
		Object.keys(grouped).forEach((category) => {
			grouped[category].sort((a, b) => {
				const aIndex = a.sortIndex ?? Infinity;
				const bIndex = b.sortIndex ?? Infinity;
				if (aIndex !== bIndex) return aIndex - bIndex;
				// Fallback to dateAdded for items without sortIndex
				return (a.dateAdded || '').localeCompare(b.dateAdded || '');
			});
		});
		return grouped;
	}, [activeItems]);

	const reorderItem = (itemName: string, category: string, newIndex: number) => {
		const categoryItems = itemsByCategory[category];
		if (!categoryItems) return;

		const oldIndex = categoryItems.findIndex((i) => i.name === itemName);
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

		setCurrentList(
			currentList.map((item) => {
				if (item.category === category || (!item.category && category === 'unknown')) {
					const newSortIndex = updates.get(item.name);
					if (newSortIndex !== undefined) {
						return { ...item, sortIndex: newSortIndex, lastUpdated: now };
					}
				}
				return item;
			}),
		);
	};

	if (isLoading) return <div>Loading...</div>;
	const itemNamesOnList = activeItems.map((item) => item.name);
	return (
		<div className="grocery-app">
			{backupAvailable && (
				<div className="backup-banner">
					<span>
						Options list is empty but a backup from {new Date(backupAvailable.timestamp).toLocaleString()}{' '}
						exists ({backupAvailable.data.items.length} items).
					</span>
					<button onClick={restoreFromBackup}>Restore</button>
					<button onClick={dismissBackup}>Dismiss</button>
				</div>
			)}
			<SkippedItemsIndicator items={skippedItems} onScrollToTop={scrollToTop} />
			<button onClick={pruneList}>Prune Purchases</button>
			<button onClick={() => setIsRemoving(!isRemoving)}>{isRemoving ? 'Done Removing' : 'Remove Items'}</button>
			<button onClick={() => setIsSorting(!isSorting)} className={isSorting ? 'active-mode' : ''}>
				{isSorting ? 'Done Sorting' : 'Sort Items'}
			</button>
			{wsConnected === false && (
				<button onClick={reconnectAll} className="error">
					Disconnected
				</button>
			)}

			<hr />

			<button className="collapsible-header" onClick={() => toggleSectionCollapse('currentList')}>
				<span className="collapse-indicator">{collapsedSections.currentList ? '+' : '-'}</span>
				{isRemoving ? 'Remove From ' : isSorting ? 'Drag to Reorder ' : ''}Current List
				<span className="section-count">({activeItems.length} items)</span>
			</button>
			{!collapsedSections.currentList &&
				effectiveSortOrder.map((category) => {
					const items = itemsByCategory[category];
					if (!items || items.length === 0) return null;
					const isCollapsed = collapsedCategories.has(category);

					return (
						<Fragment key={category}>
							<div className="category-header">
								<button className="category-pill" onClick={() => toggleCategoryCollapse(category)}>
									<span className="collapse-indicator">{isCollapsed ? '+' : '-'}</span>
									{category}
									<span className="category-count">({items.length})</span>
								</button>
							</div>
							{!isCollapsed && (
								<div className="item-grid">
									{items.map((item, index) => (
										<Fragment key={item.name}>
											{isRemoving ? (
												<AvailableItem
													key={item.name}
													item={item}
													onChange={removeItemByName}
													className={`removable-item ${item.status}`}
												/>
											) : isSorting ? (
												<DraggableItem
													key={item.name}
													item={item}
													index={index}
													category={category}
													onReorder={reorderItem}
												/>
											) : (
												<ListItem
													key={item.name}
													item={item}
													currentValue={item.status === 'carted'}
													toggleCurrentItems={toggleCurrentItem}
													registerRef={registerItemRef}
												/>
											)}
										</Fragment>
									))}
								</div>
							)}
						</Fragment>
					);
				})}
			<hr />
			<AddItems
				onAddItem={addItemByName}
				possibleItems={possibleItems}
				activeItemNames={itemNamesOnList}
				recipes={recipes}
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
			{showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
		</div>
	);
}

interface SkippedItemsIndicatorProps {
	items: string[];
	onScrollToTop: () => void;
}

const SkippedItemsIndicator = ({ items, onScrollToTop }: SkippedItemsIndicatorProps) => {
	if (items.length === 0) return null;

	const displayText = items.length <= 3 ? items.join(', ') : `${items.slice(0, 3).join(', ')} +${items.length - 3}`;

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
	const itemId = `item-${encodeURIComponent(item.name)}`;
	return (
		<div ref={(el) => registerRef?.(item.name, el)}>
			<input type="checkbox" checked={currentValue} id={itemId} onChange={() => toggleCurrentItems(item.name)} />
			<label htmlFor={itemId}>{item.name}</label>
		</div>
	);
};
