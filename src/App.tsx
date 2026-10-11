import { useState, useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import { Fragment } from 'preact';
import { Item } from './types';
import { Tile } from './Tile';
import { AddRecipeModal } from './RecipeModal';
import { HelpModal } from './HelpModal';
import { AvailableItem } from './AvailableItem';
import { DEFAULT_RECIPE, isDefaultItem, getNow } from './helpers';
import { AddItems } from './AddItems';
import { DraggableItem } from './DraggableItem';
import { useOptionsSocket, useListSocket } from './websockets';
import { useSortOrder } from './useSortOrder';

export const blankList = { items: [], recipeOrder: [], storeSections: [] };

declare global {
	interface Window {
		debug: () => void;
	}
}

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
		setDeletedRecipes,
		setDeletedSections,
		recipes,
		storeSections,
		deletedRecipes,
		deletedSections,
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
		standardItems: false,
	});
	const toggleSectionCollapse = (section: keyof typeof collapsedSections) => {
		setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
	};
	const [showAddRecipeModal, setShowAddRecipeModal] = useState<boolean>(false);
	const [editingRecipeName, setEditingRecipeName] = useState<string | null>(null);
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

	const { effectiveSortOrder, itemsByCategory, reorderSection, addSection, deleteSection, reorderItem } = useSortOrder({
		storeSections,
		setStoreSections,
		deletedSections,
		setDeletedSections,
		activeItems,
		possibleItems,
		currentList,
		setCurrentList,
		setPossibleItems,
	});

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

	const saveRecipe = async (recipeName: string, recipeItems: Item[]) => {
		const oldName = editingRecipeName;
		const now = getNow();
		const newItemNames = recipeItems.map((i) => i.name);

		// Update the recipe order: rename in place when editing, append when adding
		const newRecipeOrder = oldName
			? recipes.map((r) => (r === oldName ? recipeName : r))
			: [...recipes, recipeName];

		const updatedItems = [...possibleItems];

		// When editing, untag items that were dropped from the recipe
		if (oldName) {
			for (let i = 0; i < updatedItems.length; i++) {
				const item = updatedItems[i];
				if (item.recipes?.includes(oldName) && !newItemNames.includes(item.name)) {
					updatedItems[i] = {
						...item,
						recipes: item.recipes.filter((r) => r !== oldName),
						lastUpdated: now,
					};
				}
			}
		}

		for (const recipeItem of recipeItems) {
			const existingIndex = updatedItems.findIndex((i) => i.name === recipeItem.name);
			if (existingIndex >= 0) {
				// Item exists in options, add/rename recipe tag on its recipes array
				const existing = updatedItems[existingIndex];
				const existingRecipes = existing.recipes || [];
				let newRecipes: string[];
				if (oldName && existingRecipes.includes(oldName)) {
					newRecipes = existingRecipes.map((r) => (r === oldName ? recipeName : r));
				} else if (!existingRecipes.includes(recipeName)) {
					// Preserve default status: if item was a default item, keep it as one
					const wasDefault = isDefaultItem(existing);
					newRecipes =
						wasDefault && !existingRecipes.includes(DEFAULT_RECIPE)
							? [...existingRecipes, DEFAULT_RECIPE, recipeName]
							: [...existingRecipes, recipeName];
				} else {
					newRecipes = existingRecipes;
				}
				updatedItems[existingIndex] = {
					...existing,
					recipes: newRecipes,
					lastUpdated: now,
				};
			} else {
				// Item might be from currentList or new - add to options with recipe
				updatedItems.push({
					...recipeItem,
					recipes: [recipeName],
					lastUpdated: now,
				});
			}
		}

		setPossibleItems(updatedItems);
		setRecipes(newRecipeOrder);
		// Renaming drops the old name from recipeOrder, same as a delete - tombstone it so a
		// server merge with a stale copy of the old name doesn't resurrect it.
		if (oldName && oldName !== recipeName) {
			setDeletedRecipes([...deletedRecipes, { name: oldName, deletedAt: now }]);
		}
	};

	const deleteRecipe = async (recipeName: string) => {
		// Remove recipe from the order
		const newRecipeOrder = recipes.filter((r) => r !== recipeName);

		// Remove recipe from all items in possibleItems
		const now = getNow();
		const updatedItems = possibleItems.map((item) => {
			if (!item.recipes?.includes(recipeName)) return item;
			const newRecipes = item.recipes.filter((r) => r !== recipeName);
			return { ...item, recipes: newRecipes, lastUpdated: now };
		});

		setPossibleItems(updatedItems);
		setRecipes(newRecipeOrder);
		setDeletedRecipes([...deletedRecipes, { name: recipeName, deletedAt: now }]);
	};

	const reorderRecipe = (recipeName: string, newIndex: number) => {
		const oldIndex = recipes.indexOf(recipeName);
		if (oldIndex === -1 || oldIndex === newIndex) return;

		const newOrder = [...recipes];
		newOrder.splice(oldIndex, 1);
		newOrder.splice(newIndex, 0, recipeName);

		setRecipes(newOrder);
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
			<Tile onClick={pruneList}>Prune Purchases</Tile>
			<Tile onClick={() => setIsRemoving(!isRemoving)}>{isRemoving ? 'Done Removing' : 'Remove Items'}</Tile>
			<Tile onClick={() => setIsSorting(!isSorting)} className={isSorting ? 'active-mode' : ''}>
				{isSorting ? 'Done Sorting' : 'Sort Items'}
			</Tile>
			{wsConnected === false && (
				<Tile onClick={reconnectAll} className="error">
					Disconnected
				</Tile>
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
				onEditRecipeClick={(recipeName) => {
					setEditingRecipeName(recipeName);
					setShowAddRecipeModal(true);
				}}
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
					onSave={saveRecipe}
					onClose={() => {
						setShowAddRecipeModal(false);
						setEditingRecipeName(null);
					}}
					editingRecipeName={editingRecipeName ?? undefined}
					initialItems={
						editingRecipeName
							? possibleItems.filter((i) => i.recipes?.includes(editingRecipeName))
							: undefined
					}
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
	return (
		<Tile ref={(el: HTMLButtonElement | null) => registerRef?.(item.name, el)} pressed={currentValue} onClick={() => toggleCurrentItems(item.name)}>
			{item.name}
		</Tile>
	);
};
