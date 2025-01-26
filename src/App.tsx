import React, { useState, useEffect } from 'react';

// TODO: Manual Sorting?
// TODO: Better caching? https://hono.dev/docs/middleware/builtin/cache
// Timestamp
// Better default list?
// Gird layout?

export interface Item {
	name: string;
	status: string;
	category?: string;
};

export interface Data {
	value: string;
}


export default function App() {
	const [currentList, setCurrentList] = useState<Item[]>([]);
	const [loading, setLoading] = useState(true);
	const listName = window.location.hash.slice(1) || "default-list";
	const [isRemoving, setIsRemoving] = useState(false);
	const [saving, setIsSaving] = useState(false);

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			console.debug("Auto-saving currentList", currentList);
			saveList();
		}, 2000);

		return () => clearTimeout(timeoutId);
	}, [currentList]);

	// Set as a list of Items:
	const DEFAULT_LIST = JSON.stringify([
		{ name: 'Dragonfruit', status: "need", category: "produce"},
		{ name: 'Oranges', status: "need", category: "produce"},
		{ name: 'DDP', status: "need", category: "soda" },
		{ name: 'CF Diet Coke', status: "need", category: "soda" },
		{ name: 'Egg', status: "need", category: "eggs/dairy" },
	]);

	// TODO: Make "possible items" also a kv
	const DEFAULT_POSSIBLE_ITEMS = {
		// Produce
		"Tomato, small": "produce",
		"Tomato, big": "produce",
		"🌶️Jalapeno": "produce",
		"🟥🫑": "produce",
		"🍄‍🟫": "produce",
		"Spinach": "produce",
		"Brocolli": "produce",
		"Fresh basil": "produce",
		"🍒": "produce",
		"🍓": "produce",
		"Raspberries": "produce",
		"Blueberries": "produce",
		"⭐️fruit": "produce",
		"🐉fruit": "produce",
		"Oranges": "produce",
		
		// Corner
		"Brie": "corner",
		"Fresh Mozarella": "corner",
		"🌽🌯": "corner",
		"🌾🌯": "corner",
		"Bacon": "corner",
		"Kielbasa": "corner",
		
		// Bread
		"Bread, seaded": "bread",
		"Bread, sourdough": "bread",
		"Bread, rye": "bread",
		"Fritos": "bread",

		// Cans
		"Pinto Beans": "cans",
		"🥫Sauce": "cans",
		"🥫Whole": "cans",
		"🥫Diced": "cans",
		"🥫Paste": "cans",
		"🥫Puree": "cans",
		
		// Pasta
		"Manicotti": "pasta",
		"Spaghetti": "pasta",
		"Spaghetti, GF": "pasta",
		
		// Soup
		"Brocolli Cheddar soup": "soup",

		// Drinks
		"Hot Chocolate": "drinks",
		"White Hot Chocolate": "drinks",
		"Green Tea": "drinks",
		"Peppermint Tea": "drinks",

		// Egg/Dairy:
		"Chocolate Soy Milk": "eggs/dairy",
		"🥚": "eggs/dairy",
		"🧀 Moz": "eggs/dairy",
		"🧀 Ched": "eggs/dairy",
		"🧀 Ricotta": "eggs/dairy",

		// Soda:
		"DDP": "soda",
		"CF Diet Coke": "soda",
		"Sm. CF Diet Coke": "soda",

		// Frozen
		"Beyond Meat Sausage": "frozen",
		"Morningstar Sausage": "frozen",
		"Impossible Beef": "frozen",
		"🍨LM": "frozen",
		"🍨🥜": "frozen",
		"🍨Dulce": "frozen",
	};

	const sortOrder = [
		"unknown",
		"produce",
		"corner",
		"bread",
		"cans",
		"pasta",
		"soup",
		"drinks",
		"eggs/dairy",
		"soda",
		"frozen",
	];

	const [POSSIBLE_ITEMS, setPossibleItems] = useState<string[]>([]);

	useEffect(() => {
		// Load initial state
		fetch(`/api/state/${listName}`)
			.then(res => res.json().catch(() => ({ value: DEFAULT_LIST })))
			.then(data => {
				const typedData = data as Data;
				try {
					if (typedData.value) setCurrentList(JSON.parse(typedData.value));
				} catch {
					setCurrentList(JSON.parse(DEFAULT_LIST));
				}
				setLoading(false);
			});
		fetch(`/api/state/${listName}-options`)
			.then(res => res.json().catch(() => ({ value: JSON.stringify(Object.keys(DEFAULT_POSSIBLE_ITEMS)) })))
			.then(data => {
				// TODO: This is untested.
				const typedData = data as Data;
				try {
					if (typedData.value) {
						setPossibleItems(JSON.parse(typedData.value));
					}
					else {
						setPossibleItems(Object.keys(DEFAULT_POSSIBLE_ITEMS));
					}
				} catch {
					setPossibleItems(Object.keys(DEFAULT_POSSIBLE_ITEMS));
				}
				setLoading(false);
			});
	}, []);

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
		const itemCategory = category || ((itemName in DEFAULT_POSSIBLE_ITEMS) ? DEFAULT_POSSIBLE_ITEMS[itemName as keyof typeof DEFAULT_POSSIBLE_ITEMS] : "unknown");
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

	let itemNamesOnList = currentList
		.sort((a, b) => {
			const categoryA = a.category || "unknown";
			const categoryB = b.category || "unknown";
			return sortOrder.indexOf(categoryA) - sortOrder.indexOf(categoryB);
		})
		.map((item) => item.name);

	const availableToAdd = POSSIBLE_ITEMS.filter((item) => !itemNamesOnList.includes(item));

	if (loading) return <div>Loading......</div>;
	return (
		<div>
			<button 
				onClick={clearList}
				className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 mb-4"
			>
				Clear Purchases
			</button>

			<button 
				onClick={() => setIsRemoving(!isRemoving)}
				className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 mb-4"
			>
				{isRemoving ? "Done Removing" : "Remove Items"}
			</button>
			<button
				onClick={saveList}
				className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${saving ? 'saving' : ''}`}
				disabled={saving}
			>
				{saving ? `Saving` : `Save List`}
			</button>
			<hr />

			{!isRemoving ? (
				<>
					<h2>Current List</h2>
					{sortOrder.map(category => (
						<>
							{currentList
								.filter(item => (item.category || "unknown") === category)
								.map((item, idx) => (
									<ListItem
									 	firstInCategory={idx === 0}
										key={item.name}
										item={item}
										currentValue={item.status === "carted"}
										toggleCurrentItems={toggleCurrentItem}
									/>
								))}
						</>
					))}
				</>
			) : (
				<>
					<h2>Remove from List</h2>
					{currentList.map((item) => (
						<AvailableItem
							key={item.name}
							itemName={item.name}
							onChange={removeItemByName}
							className={`removable-item ${item.status}`}
						/>
					))}
				</>
			)}
			<hr />
			<h2>Add to List</h2>
			{sortOrder.map(category => (
				<CustomItem key={category} onChange={addItemByName} category={category} />
			))}
			<h3>Basic items</h3>
			{availableToAdd.map((itemName) => (
				<AvailableItem
					key={`available-${itemName}`}
					itemName={itemName}
					onChange={addItemByName}
				/>
			))}
		</div>
	);
}

interface ListItemProps {
	item: Item;
	currentValue: boolean;
	toggleCurrentItems: (itemName: string) => void;
	firstInCategory?: boolean;
}

const ListItem: React.FC<ListItemProps> = ({item , currentValue, toggleCurrentItems, firstInCategory }) => {
	return (
		<div>
			{firstInCategory ? <h3>{item.category}</h3> : ''}
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
	itemName: string;
	onChange: (itemName: string) => void;
	className?: string;
}


const AvailableItem: React.FC<AvailableItemProps> = ({ itemName, onChange, className = "" }) => {
	const [isRemoving, setIsRemoving] = React.useState(false);

	const handleClick = () => {
		setIsRemoving(true);
		// Wait for animation to complete before calling onChange
		setTimeout(() => {
			onChange(itemName);
		}, 100); // matches transition duration
	};


	return (
		<button onClick={handleClick} className={`available-item ${className} ${isRemoving ? 'removing' : ''}`}>
			{itemName}
		</button>
	);
};

interface CustomItemProps {
	onChange: (itemName: string, category?: string) => void;
	category: string;
}

const CustomItem: React.FC<CustomItemProps> = ({ onChange, category }) => {
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
					onChange={(e) => setCustomValue(e.target.value)}
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
		<button onClick={() => setIsEditing(true)} className="available-item custom">
			{category}
		</button>
	);
}