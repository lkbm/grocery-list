import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { Fragment } from 'preact';
import { memo } from 'preact/compat';

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

export interface OptionsData {
	items: Item[];
	recipeOrder: string[];   // Ordered list of recipe names
}

const DEFAULT_RECIPE = "default items";

const DEFAULT_DATE = "1970-01-01T00:00:00Z";

const sortOrder = [
	"unknown",
	"produce",
	"corner",
	"bread",
	"cans",
	"pasta",
	"soup",
	"coffee and tea",
	"eggs/dairy",
	"soda",
	"pharmacy",
	"frozen",
	"Farmers' Market"
];

const getNewestOfEachItem = (itemList: Item[]): Item[] => {
	const latestItems: { [key: string]: Item } = {};
	itemList.forEach(item => {
		const existing = latestItems[item.name];
		const itemLastUpdated = item.lastUpdated || "1970-01-01T00:00:00Z";
		const existingLastUdpated = existing?.lastUpdated || "1970-01-01T00:00:00Z";
		if (!existing || (itemLastUpdated > existingLastUdpated)) {
			latestItems[item.name] = item;
		}
	});

	return Object.values(latestItems);
};

export default function App() {
	const [currentList, setCurrentList] = useState<Item[]>([]);
	const [force, setForce] = useState<boolean>(false);
	const [possibleItems, setPossibleItems] = useState<Item[]>([]);
	const [recipeOrder, setRecipeOrder] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isRemoving, setIsRemoving] = useState<boolean>(false);
	const [isSorting, setIsSorting] = useState<boolean>(false);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [isErrorSaving, setErrorSaving] = useState<boolean>(false);
	const [showAddRecipeModal, setShowAddRecipeModal] = useState<boolean>(false);
	const listName = window.location.hash.slice(1) || "default-list";
	// If we're on an -options list, use it directly; otherwise append -options
	const optionsListName = listName.endsWith('-options') ? listName : `${listName}-options`;

	const activeItems = useMemo(() => currentList.filter(item => !item.deleted),
		[currentList]);

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

	const fetchListData = async (listName: string): Promise<Item[]> => {
		const res = await fetch(`/api/state/${listName}`);
		const data = await res.json().catch(() => []);
		const typedData = data as { value: string };

		try {
			let loadedList = typedData.value ? JSON.parse(typedData.value) : [];
			loadedList = loadedList.map((item: Item) => ({
				...item,
				dateAdded: item.dateAdded || DEFAULT_DATE,
				lastUpdated: item.lastUpdated || DEFAULT_DATE,
			}));
			return loadedList;
		} catch {
			return [];
		}
	};

	const fetchOptionsData = async (): Promise<OptionsData> => {
		const res = await fetch(`/api/state/${optionsListName}`);
		const data = await res.json().catch(() => ({}));
		const typedData = data as { value: string };

		try {
			const parsed = typedData.value ? JSON.parse(typedData.value) : {};
			// Backwards compatibility: if it's an array, treat as items with no recipes
			if (Array.isArray(parsed)) {
				return {
					items: parsed.map((item: Item) => ({
						...item,
						dateAdded: item.dateAdded || DEFAULT_DATE,
						lastUpdated: item.lastUpdated || DEFAULT_DATE,
					})),
					recipeOrder: []
				};
			}
			return {
				items: (parsed.items || []).map((item: Item) => ({
					...item,
					dateAdded: item.dateAdded || DEFAULT_DATE,
					lastUpdated: item.lastUpdated || DEFAULT_DATE,
				})),
				recipeOrder: parsed.recipeOrder || []
			};
		} catch {
			return { items: [], recipeOrder: [] };
		}
	};

	// Load initial state:
	useEffect(() => {
		const loadData = async () => {
			if (['default-list', 'default-list-options'].includes(listName)) {
				setIsLoading(false);
				return;
			}

			// Load both the current list and options list
			const [currentListData, optionsData] = await Promise.all([
				fetchListData(listName),
				fetchOptionsData()
			]);

			setCurrentList(currentListData);
			setPossibleItems(optionsData.items);
			setRecipeOrder(optionsData.recipeOrder);
			setIsLoading(false);
		};

		loadData();
	}, [listName]);

	// Auto-save when list changes:
	useEffect(() => {
		const timeoutId = setTimeout(() => {
			console.debug("Auto-saving currentList", currentList);
			saveList();
		}, 2000);

		return () => clearTimeout(timeoutId);
	}, [currentList]);

	const saveList = async () => {
		setIsSaving(true);
		setErrorSaving(false);

		try {
			// Fetch server's current list
			let mergedList = currentList;
			if (!force) {
				const serverList = await fetchListData(listName);
				mergedList = getNewestOfEachItem([...serverList, ...currentList]);
			} else {
				mergedList = activeItems.filter(item => ["need", "carted"].includes(item.status || ""));
			}
			await fetch(`/api/state/${listName}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ value: JSON.stringify(mergedList) })
			}).then(response => {
				if (!response.ok) {
					console.error(`Error: ${response.status}`);
					setErrorSaving(true);
				}
				setTimeout(() => {
					setIsSaving(false);
				}, 1000);
			});
		} catch (err) {
			console.error("Save error", err);
			setErrorSaving(true);
			setIsSaving(false);
		}
		setForce(false);
	};

	const getNow = () => new Date().toISOString();

	const saveOptionsData = async (items: Item[], recipes: string[]) => {
		const optionsData: OptionsData = { items, recipeOrder: recipes };
		await fetch(`/api/state/${optionsListName}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: JSON.stringify(optionsData) })
		});
		setPossibleItems(items);
		setRecipeOrder(recipes);
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
					updatedItems[existingIndex] = {
						...existing,
						recipes: [...recipes, recipeName]
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

	const pruneList = () => {
		const now = getNow();
		// 1. Mark non-needed, non-deleted items as deleted
		const updated = currentList.map(item =>
			item.status !== "need"
				? { ...item, deleted: true, deletedAt: now, lastUpdated: now }
				: item
		);
		setForce(true);
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
		<div>
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
			<button
				onClick={() => saveList()}
				className={isSaving ? 'saving' : isErrorSaving ? 'error' : ''}
				disabled={isSaving}
			>
				{isSaving ? `Saving` : isErrorSaving ? `Error Saving!` : `Save List`}
			</button>
			<hr />
			<h2>{isRemoving ? "Remove From " : isSorting ? "Drag to Reorder " : ""}Current List</h2>
			{sortOrder.map(category => {
				const items = itemsByCategory[category];
				if (!items || items.length === 0) return null;

				return (
					<Fragment key={category}>
						<h3 className={`category-title`}>{category}</h3>
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
									/>}
							</Fragment>
						))
						}
					</Fragment>
				)
			})}
			<hr />
			<AddItems
				onAddItem={addItemByName}
				possibleItems={possibleItems}
				activeItemNames={itemNamesOnList}
				recipeOrder={recipeOrder}
				onAddRecipeClick={() => setShowAddRecipeModal(true)}
				onDeleteRecipe={deleteRecipe}
				isSorting={isSorting}
				onReorderRecipe={reorderRecipe}
			/>
			{showAddRecipeModal && (
				<AddRecipeModal
					possibleItems={allAvailableItems}
					onSave={addRecipe}
					onClose={() => setShowAddRecipeModal(false)}
				/>
			)}
		</div >
	);
}

interface AddItemsProps {
	onAddItem: (itemName: string, category?: string) => void;
	possibleItems: Item[];
	activeItemNames: string[];
	recipeOrder: string[];
	onAddRecipeClick: () => void;
	onDeleteRecipe: (recipeName: string) => Promise<void>;
	isSorting: boolean;
	onReorderRecipe: (recipeName: string, newIndex: number) => void;
}

// Check if an item should appear in Standard Items (default items)
const isDefaultItem = (item: Item): boolean => {
	// No recipes array or empty array = default item (backwards compatible)
	if (!item.recipes || item.recipes.length === 0) return true;
	// Explicitly in "default items"
	return item.recipes.includes(DEFAULT_RECIPE);
};

const AddItems = memo(({ onAddItem, possibleItems, activeItemNames, recipeOrder, onAddRecipeClick, onDeleteRecipe, isSorting, onReorderRecipe }: AddItemsProps) => {
	const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
	const [draggingRecipe, setDraggingRecipe] = useState<string | null>(null);
	const [dragOverRecipe, setDragOverRecipe] = useState<string | null>(null);

	// Standard items: default items not already on the list
	const standardItems = useMemo(() => {
		return possibleItems
			.filter((item) => isDefaultItem(item) && !activeItemNames.includes(item.name))
			.sort((a, b) => {
				const categoryA = a.category || "unknown";
				const categoryB = b.category || "unknown";
				return sortOrder.indexOf(categoryA) - sortOrder.indexOf(categoryB);
			});
	}, [possibleItems, activeItemNames]);

	// Get items for a specific recipe
	const getRecipeItems = (recipeName: string) => {
		return possibleItems
			.filter((item) => item.recipes?.includes(recipeName))
			.sort((a, b) => {
				const categoryA = a.category || "unknown";
				const categoryB = b.category || "unknown";
				return sortOrder.indexOf(categoryA) - sortOrder.indexOf(categoryB);
			});
	};

	return (
		<>
			<h2>Add to List</h2>
			{
				sortOrder.map(category => (
					<CustomItem key={category} onChange={onAddItem} category={category} />
				))
			}
			<h3>Standard items</h3>
			{
				standardItems.map((item) => (
					<AvailableItem
						key={`available-${item.name}`}
						item={item}
						onChange={onAddItem}
					/>
				))
			}
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
		</>
	);
});

interface ListItemProps {
	toggleCurrentItems: (itemName: string) => void;
	currentValue: boolean;
	item: Item;
}

const ListItem = ({ item, currentValue, toggleCurrentItems }: ListItemProps) => {
	return (
		<div>
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

const AvailableItem = ({ item, onChange, className = "" }: AvailableItemProps) => {
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

	if (isEditing) {
		return (
			<form onSubmit={handleSubmit}>
				<input
					ref={inputRef}
					type="text"
					value={customValue}
					onChange={(e) => setCustomValue((e.target as HTMLInputElement)?.value)}
					placeholder={`Enter custom ${category}`}
				/>
				<button type="button" onClick={() => setIsEditing(false)}>
					Cancel
				</button>
			</form>
		);
	}

	return (
		<button onClick={() => setIsEditing(true)} className="available-item custom">{category}</button>
	);
};

interface AddRecipeModalProps {
	possibleItems: Item[];
	onSave: (recipeName: string, items: Item[]) => Promise<void>;
	onClose: () => void;
}

const AddRecipeModal = ({ possibleItems, onSave, onClose }: AddRecipeModalProps) => {
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
				return sortOrder.indexOf(categoryA) - sortOrder.indexOf(categoryB);
			});
	}, [possibleItems, recipeItems]);

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
								sortOrder.map(category => {
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
							{sortOrder.map(category => (
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
