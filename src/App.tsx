import React, { memo, useMemo, useState, useEffect } from 'preact/compat';

// TODO: Manual Sorting?
// TODO: Better caching? https://hono.dev/docs/middleware/builtin/cache
// Timestamp
// Better default list?
// Gird layout?

export interface Item {
	name: string;
	status?: string;
	category?: string;
};

export interface Data {
	value: string;
}


const DEFAULT_LIST = "[]";

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

export default function App() {
	const [currentList, setCurrentList] = useState<Item[]>([]);
	const [possibleItems, setPossibleItems] = useState<Item[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isRemoving, setIsRemoving] = useState<boolean>(false);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const listName = window.location.hash.slice(1) || "default-list";

	// Load initial state:
	useEffect(() => {
		// Load initial state
		fetch(`/api/state/${listName}`)
			.then(res => res.json().catch(() => ({ value: DEFAULT_LIST })))
			.then(data => {
				const typedData = data as Data;
				try {
					// LKBM TODO: Handle bad format (e.g., because I changed format):
					if (typedData.value) setCurrentList(JSON.parse(typedData.value));
				} catch {
					setCurrentList(JSON.parse(DEFAULT_LIST));
				}
				// setIsLoading(false);
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
		await fetch(`/api/state/${listName}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: JSON.stringify(currentList) })
		});
		setIsSaving(true);
		setTimeout(() => {
			setIsSaving(false);
		}, 1000);
		
	};

	const toggleCurrentItem = (itemName: string) => {
		const updatedList = currentList.map((item) => {
			if (item.name === itemName) {
				item.status = item.status === "need" ? "carted" : "need";
			}
			return item;
		});
		setCurrentList(updatedList);
	};

	const addItemByName = (itemName: string, category?: string) => {
		const newItems = [...currentList];
		const itemCategory = category;
		newItems.push({ name: itemName, status: "need", category: itemCategory });
		setCurrentList(newItems);
	};

	const removeItemByName = (itemName: string) => {
		const newItems = [...currentList];
		const index = newItems.findIndex((item) => item.name === itemName);
		newItems.splice(index, 1);
		setCurrentList(newItems);
	}

	const clearList = () => {
		setCurrentList(currentList.filter(item => item.status === "need"));
	};

	let itemNamesOnList = currentList.map((item) => item.name);
	const availableToAdd = useMemo(() => {
		const result = possibleItems.filter((item) => !itemNamesOnList.includes(item.name))		.sort((a, b) => {
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
				className={isSaving ? 'saving' : ''}
				disabled={isSaving}
			>
				{isSaving ? `Saving` : `Save List`}
			</button>
			<hr />
			<h2>{isRemoving && "Remove From "}Current List</h2>
			{sortOrder.map(category => (
				<>
					{currentList
						.filter(item => (item.category || "unknown") === category)
						.map((item, idx) => (
							<>
							{idx === 0 && <h3>{category}</h3>}
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
					placeholder="Enter custom item"
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
