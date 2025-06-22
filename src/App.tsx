import React, { memo, useMemo, useState, useEffect } from 'preact/compat';

// TODO: Manual Sorting?
// TODO: Better caching? https://hono.dev/docs/middleware/builtin/cache
// Timestamp
// Better default list?
// Add by recipe
// Grid layout?
// Import/export

export interface Item {
	name: string;
	status?: string;
	category?: string;
	dateAdded?: string;      // ISO string
	lastUpdated?: string;    // ISO string
	deleted?: boolean;
	deletedAt?: string;      // ISO string
};

export interface Data {
	value: string;
}


const DEFAULT_LIST = "[]";

const DEFAULT_DATE = "2025-01-01T00:00:00Z";

const DEFAULT_POSSIBLE_ITEMS = [
	{
		"name": "Tomato, small",
		"category": "produce"
	},
	{
		"name": "Tomato, big",
		"category": "produce"
	},
	{
		"name": "🌶️Jalapeno",
		"category": "produce"
	},
	{
		"name": "🟥🫑",
		"category": "produce"
	},
	{
		"name": "🍄‍🟫",
		"category": "produce"
	},
	{
		"name": "Spinach",
		"category": "produce"
	},
	{
		"name": "Brocolli",
		"category": "produce"
	},
	{
		"name": "Fresh basil",
		"category": "produce"
	},
	{
		"name": "🍒",
		"category": "produce"
	},
	{
		"name": "🍓",
		"category": "produce"
	},
	{
		"name": "Raspberries",
		"category": "produce"
	},
	{
		"name": "Blueberries",
		"category": "produce"
	},
	{
		"name": "⭐️fruit",
		"category": "produce"
	},
	{
		"name": "🐉fruit",
		"category": "produce"
	},
	{
		"name": "Oranges",
		"category": "produce"
	},
	{
		"name": "Brie",
		"category": "corner"
	},
	{
		"name": "Fresh Mozarella",
		"category": "corner"
	},
	{
		"name": "🌽🌯",
		"category": "corner"
	},
	{
		"name": "🌾🌯",
		"category": "corner"
	},
	{
		"name": "Bacon",
		"category": "corner"
	},
	{
		"name": "Kielbasa",
		"category": "corner"
	},
	{
		"name": "Bread, seaded",
		"category": "bread"
	},
	{
		"name": "Bread, sourdough",
		"category": "bread"
	},
	{
		"name": "Bread, rye",
		"category": "bread"
	},
	{
		"name": "Fritos",
		"category": "bread"
	},
	{
		"name": "Pinto Beans",
		"category": "cans"
	},
	{
		"name": "🥫Sauce",
		"category": "cans"
	},
	{
		"name": "🥫Whole",
		"category": "cans"
	},
	{
		"name": "🥫Diced",
		"category": "cans"
	},
	{
		"name": "🥫Paste",
		"category": "cans"
	},
	{
		"name": "🥫Puree",
		"category": "cans"
	},
	{
		"name": "Manicotti",
		"category": "pasta"
	},
	{
		"name": "Spaghetti",
		"category": "pasta"
	},
	{
		"name": "Spaghetti, GF",
		"category": "pasta"
	},
	{
		"name": "Brocolli Cheddar soup",
		"category": "soup"
	},
	{
		"name": "Hot Chocolate",
		"category": "coffee and tea"
	},
	{
		"name": "White Hot Chocolate",
		"category": "coffee and tea"
	},
	{
		"name": "Green Tea",
		"category": "coffee and tea"
	},
	{
		"name": "Peppermint Tea",
		"category": "coffee and tea"
	},
	{
		"name": "Chocolate Soy Milk",
		"category": "eggs/dairy"
	},
	{
		"name": "🥚",
		"category": "eggs/dairy"
	},
	{
		"name": "🧀 Moz",
		"category": "eggs/dairy"
	},
	{
		"name": "🧀 Ched",
		"category": "eggs/dairy"
	},
	{
		"name": "🧀 Ricotta",
		"category": "eggs/dairy"
	},
	{
		"name": "DDP",
		"category": "soda"
	},
	{
		"name": "CF Diet Coke",
		"category": "soda"
	},
	{
		"name": "Sm. CF Diet Coke",
		"category": "soda"
	},
	{
		"name": "Beyond Meat Sausage",
		"category": "frozen"
	},
	{
		"name": "Morningstar Sausage",
		"category": "frozen"
	},
	{
		"name": "Impossible Beef",
		"category": "frozen"
	},
	{
		"name": "🍨LM",
		"category": "frozen"
	},
	{
		"name": "🍨🥜",
		"category": "frozen"
	},
	{
		"name": "🍨Dulce",
		"category": "frozen"
	}
]

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
	"frozen",
];

// Utility: Compute the latest lastUpdated timestamp from a list of items
function getListLastUpdated(items: Item[]): string {
	if (!items.length) return "1970-01-01T00:00:00Z";
	return items.reduce((max, item) => {
		const t = item.lastUpdated || "1970-01-01T00:00:00Z";
		return t > max ? t : max;
	}, "1970-01-01T00:00:00Z");
}

export default function App() {
	const [currentList, setCurrentList] = useState<Item[]>([]);
	const [possibleItems, setPossibleItems] = useState<Item[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isRemoving, setIsRemoving] = useState<boolean>(false);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [isErrorSaving, setErrorSaving] = useState<boolean>(false);
	const [mergeError, setMergeError] = useState<string | null>(null);
	const listName = window.location.hash.slice(1) || "default-list";

	// Load initial state:
	useEffect(() => {
		// Load initial state
		fetch(`/api/state/${listName}`)
			.then(res => res.json().catch(() => ({ value: DEFAULT_LIST })))
			.then(data => {
				const typedData = data as Data;
				try {
					let loadedList = typedData.value ? JSON.parse(typedData.value) : [];
					// Add dateAdded/lastUpdated for legacy items
					loadedList = loadedList.map((item: Item) => ({
						...item,
						dateAdded: item.dateAdded || DEFAULT_DATE,
						lastUpdated: item.lastUpdated || DEFAULT_DATE,
					}));
					setCurrentList(loadedList);
				} catch {
					setCurrentList(JSON.parse(DEFAULT_LIST));
				}
			});
			fetch(`/api/state/${listName}-options`)
			.then(res => res.json().catch(() => ({ value: JSON.stringify(DEFAULT_POSSIBLE_ITEMS) })))
			.then(data => {
				const typedData = data as Data;
				try {
					if (typedData.value) {
						// LKBM TODO: Handle bad format (e.g., because I changed format):
						setPossibleItems(JSON.parse(typedData.value));
					}
					else {
						setPossibleItems(DEFAULT_POSSIBLE_ITEMS);
					}
				} catch {
					setPossibleItems(DEFAULT_POSSIBLE_ITEMS);
				}
				setIsLoading(false);
			});
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
		setMergeError(null);

		try {
			// Fetch server's current list
			const res = await fetch(`/api/state/${listName}`);
			const data = await res.json().catch(() => ({ value: DEFAULT_LIST }));
			const typedData = data as Data;
			const serverList: Item[] = typedData.value ? JSON.parse(typedData.value) : [];
			const serverLastUpdated = getListLastUpdated(serverList);
			const localLastUpdated = getListLastUpdated(currentList);

			if (localLastUpdated >= serverLastUpdated) {
				// Local is newer or equal, proceed to save
				await fetch(`/api/state/${listName}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ value: JSON.stringify(currentList) })
				}).then(response => {
					if (!response.ok) {
						console.error(`Error: ${response.status}`);
						setErrorSaving(true);
					}
					setTimeout(() => {
						setIsSaving(false);
					}, 1000);
				});
			} else {
				// Server is newer, do not overwrite
				setMergeError("Server list is newer. Please refresh or merge changes.");
				setIsSaving(false);
			}
		} catch (err) {
			console.error("Save error", err);
			setErrorSaving(true);
			setIsSaving(false);
		}
	};

	const toggleCurrentItem = (itemName: string) => {
		const now = new Date().toISOString();
		const updatedList = currentList.map((item) => {
			if (item.name === itemName && !item.deleted) {
				const newStatus = item.status === "need" ? "carted" : "need";
				return { ...item, status: newStatus, lastUpdated: now };
			}
			return item;
		});
		setCurrentList(updatedList);
	};

	const addItemByName = (itemName: string, category?: string) => {
		const now = new Date().toISOString();
		const newItems = [...currentList];
		// If item exists and is deleted, undelete it
		const existing = newItems.find(item => item.name === itemName && item.deleted);
		if (existing) {
			existing.deleted = false;
			existing.deletedAt = undefined;
			existing.status = "need";
			existing.category = category || existing.category;
			existing.lastUpdated = now;
			return setCurrentList([...newItems]);
		}
		newItems.push({
			name: itemName,
			status: "need",
			category,
			dateAdded: now,
			lastUpdated: now,
			deleted: false,
		});
		setCurrentList(newItems);
	};

	const removeItemByName = (itemName: string) => {
		const now = new Date().toISOString();
		const newItems = currentList.map(item =>
			item.name === itemName && !item.deleted
				? { ...item, deleted: true, deletedAt: now, lastUpdated: now }
				: item
		);
		setCurrentList(newItems);
	}

	const clearList = () => {
		const now = new Date().toISOString();
		// 1. Mark non-needed, non-deleted items as deleted (soft-delete)
		let updated = currentList.map(item =>
			item.status !== "need" && !item.deleted
				? { ...item, deleted: true, deletedAt: now, lastUpdated: now }
				: item
		);
		// 2. Purge (hard-delete) all items that are deleted
		updated = updated.filter(item => !item.deleted);
		setCurrentList(updated);
	};

	let itemNamesOnList = currentList.filter(item => !item.deleted).map((item) => item.name);
	const availableToAdd = useMemo(() => {
		const result = possibleItems.filter((item) => !itemNamesOnList.includes(item.name)).sort((a, b) => {
			const categoryA = a.category || "unknown";
			const categoryB = b.category || "unknown";
			return sortOrder.indexOf(categoryA) - sortOrder.indexOf(categoryB);
		});
		return result;
	}, [possibleItems, itemNamesOnList]);

	if (isLoading) return <div>Loading...</div>;
	return (
		<div>
			<button onClick={clearList}>
				Clear Purchases
			</button>

			<button onClick={() => setIsRemoving(!isRemoving)}
			>
				{isRemoving ? "Done Removing" : "Remove Items"}
			</button>
			<button
				onClick={saveList}
				className={isSaving ? 'saving' : isErrorSaving ? 'error' : ''}
				disabled={isSaving}
			>
				{isSaving ? `Saving` : isErrorSaving ? `Error Saving!` : `Save List`}
			</button>
			{mergeError && <div className="merge-error">{mergeError}</div>}
			<hr />
			<h2>{isRemoving && "Remove From "}Current List</h2>
			{sortOrder.map(category => (
				<>
					{currentList
						.filter(item => (item.category || "unknown") === category && !item.deleted)
						.map((item, idx) => (
							<>
							{idx === 0 && <h3 className={`category-title`}>{category}</h3>}
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
						</>
						))
					}
				</>
			))}
			<hr />
			<h2>Add to List</h2>
			{sortOrder.map(category => (
				<CustomItem key={category} onChange={addItemByName} category={category} />
			))}
			<h3>Standard items</h3>
			{availableToAdd.map((item) => (
				<AvailableItem
					key={`available-${item.name}`}
					item={item}
					onChange={addItemByName}
				/>
			))}
		</div>
	);
}

interface ListItemProps {
	toggleCurrentItems: (itemName: string) => void;
	currentValue: boolean;
	item: Item;
}

const ListItem: React.FC<ListItemProps> = ({item , currentValue, toggleCurrentItems }) => {
	return (
		<div>
			<input
				type="checkbox"
				checked={currentValue}
				onChange={() => {}}
			/>
			<label htmlFor={item.name} onClick={() => toggleCurrentItems(item.name)}>
				{item.name}
			</label>
		</div>
	);
};

interface AvailableItemProps {
	onChange: (itemName: string, category?: string) => void;
	className?: string;
	item: Item;
}


const AvailableItem: React.FC<AvailableItemProps> = ({ item, onChange, className = "" }) => {
	const [isRemoving, setIsRemoving] = React.useState(false);

	const handleClick = () => {
		setIsRemoving(true);
		// Wait for animation to complete before calling onChange
		setTimeout(() => {
			onChange(item.name, item.category);
		}, 100); // matches transition duration
	};


	return (
		<>
		<button onClick={handleClick} className={`available-item ${className} ${isRemoving ? 'removing' : ''}`}>
			{item.name}
		</button>
		</>
	);
};

interface CustomItemProps {
	onChange: (itemName: string, category?: string) => void;
	category: string;
}

const CustomItem: React.FC<CustomItemProps> = memo(({ onChange, category }) => {
	const [isEditing, setIsEditing] = React.useState(false);
	const [customValue, setCustomValue] = React.useState("");

	const handleSubmit = (e: React.FormEvent) => {
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
					type="text"
					value={customValue}
					onChange={(e) => setCustomValue((e.target as HTMLInputElement)?.value)}
					placeholder={`Enter custom ${category}`}
					autoFocus
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
});
