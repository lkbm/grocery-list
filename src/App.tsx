//newest
import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { Fragment } from 'preact';
import { memo } from 'preact/compat';

// TODO: Manual Sorting?
// Add by recipe
// Grid layout?
// Import/export

export interface Item {
	name: string;
	status?: "need" | "carted";
	category?: string;
	dateAdded?: string;      // ISO string
	lastUpdated?: string;    // ISO string
	deleted?: boolean;
	deletedAt?: string;      // ISO string
};

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
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isRemoving, setIsRemoving] = useState<boolean>(false);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [isErrorSaving, setErrorSaving] = useState<boolean>(false);
	const listName = window.location.hash.slice(1) || "default-list";

	const activeItems = useMemo(() => currentList.filter(item => !item.deleted),
		[currentList]);

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

	// Load initial state:
	useEffect(() => {
		const loadData = async () => {
			if (['default-list', 'default-list-options'].includes(listName)) {
				setIsLoading(false);
				return [];
			}
			setCurrentList(await fetchListData(listName));
			setPossibleItems(await fetchListData(`${listName}-options`));
			setIsLoading(false);
		};

		loadData();
	}, []);

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

	const pruneList = () => {
		const now = getNow();
		// 1. Mark non-needed, non-deleted items as deleted
		let updated = currentList.map(item =>
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

	if (isLoading) return <div>Loading...</div>;
	let itemNamesOnList = activeItems.map((item) => item.name);
	const itemsByCategory = useMemo(() => {
		const grouped: { [category: string]: Item[] } = {};
		activeItems.forEach(item => {
			const category = item.category || "unknown";
			if (!grouped[category]) {
				grouped[category] = [];
			}
			grouped[category].push(item);
		});
		return grouped;
	}, [activeItems]);

	return (
		<div>
			<button onClick={pruneList}>
				Prune Purchases
			</button>

			<button onClick={() => setIsRemoving(!isRemoving)}
			>
				{isRemoving ? "Done Removing" : "Remove Items"}
			</button>
			<button
				onClick={() => saveList()}
				className={isSaving ? 'saving' : isErrorSaving ? 'error' : ''}
				disabled={isSaving}
			>
				{isSaving ? `Saving` : isErrorSaving ? `Error Saving!` : `Save List`}
			</button>
			<hr />
			<h2>{isRemoving && "Remove From "}Current List</h2>
			{sortOrder.map(category => {
				const items = itemsByCategory[category];
				if (!items || items.length === 0) return null;

				return (
					<Fragment key={category}>
						<h3 className={`category-title`}>{category}</h3>
						{items.map(item => (
							<Fragment key={item.name}>
								{isRemoving ? <AvailableItem
									key={item.name}
									item={item}
									onChange={removeItemByName}
									className={`removable-item ${item.status}`}
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
			/>
		</div >
	);
}

interface AddItemsProps {
	onAddItem: (itemName: string, category?: string) => void;
	possibleItems: Item[];
	activeItemNames: string[];
}

const AddItems = memo(({ onAddItem, possibleItems, activeItemNames }: AddItemsProps) => {
	const availableToAdd = useMemo(() => {
		const result = possibleItems.filter((item) => !activeItemNames.includes(item.name)).sort((a, b) => {
			const categoryA = a.category || "unknown";
			const categoryB = b.category || "unknown";
			return sortOrder.indexOf(categoryA) - sortOrder.indexOf(categoryB);
		});
		return result;
	}, [possibleItems, activeItemNames]);

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
				availableToAdd.map((item) => (
					<AvailableItem
						key={`available-${item.name}`}
						item={item}
						onChange={onAddItem}
					/>
				))
			}
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
		</div >
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
