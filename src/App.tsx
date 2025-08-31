import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { Fragment } from 'preact';

// TODO: Manual Sorting?
// TODO: Better caching? https://hono.dev/docs/middleware/builtin/cache
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

export interface Data {
	value: string;
}

const DEFAULT_LIST = "[]";
const DEFAULT_DATE = "2025-01-01T00:00:00Z";

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

	const getServerList = async (): Promise<Item[]> => {
		if (['default-list', 'default-list-options'].includes(listName)) {
			return JSON.parse(DEFAULT_LIST);
		}
		const res = await fetch(`/api/state/${listName}`);
		const data = await res.json().catch(() => ({ value: DEFAULT_LIST }));
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
			return JSON.parse(DEFAULT_LIST);
		}
	};
	// Load initial state:
	useEffect(() => {
		const loadData = async () => {
			setCurrentList(await getServerList());

			// Load possible items
			const defaultItems = await getDefaultItems(listName);
			setPossibleItems(defaultItems);
			setIsLoading(false);
		};

		loadData();
	}, []);

	const getDefaultItems = async (listName: string): Promise<Item[]> => {
		try {
			const res = await fetch(`/api/state/${listName}-options`);
			const data = await res.json().catch(() => ({ value: [] }));
			const typedData = data as Data;
			if (typedData.value) {
				// LKBM TODO: Handle bad format (e.g., because I changed format):
				return JSON.parse(typedData.value);
			}
			return [];
		}
		catch {
			return [];
		}
	};

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
				const serverList = await getServerList();
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
		const now = getNow();
		const newItems = currentList.map(item =>
			item.name === itemName && !item.deleted
				? { ...item, deleted: true, deletedAt: now, lastUpdated: now }
				: item
		);
		setCurrentList(newItems);
	}

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
			{sortOrder.map(category => (
				<Fragment key={category}>
					{activeItems
						.filter(item => (item.category || "unknown") === category)
						.map((item, idx) => (
							<Fragment key={item.name}>
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
							</Fragment>
						))
					}
				</Fragment>
			))
			}
			<hr />
			<h2>Add to List</h2>
			{
				sortOrder.map(category => (
					<CustomItem key={category} onChange={addItemByName} category={category} />
				))
			}
			<h3>Standard items</h3>
			{
				availableToAdd.map((item) => (
					<AvailableItem
						key={`available-${item.name}`}
						item={item}
						onChange={addItemByName}
					/>
				))
			}
		</div >
	);
}

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
