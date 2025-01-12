import React, { useState, useEffect } from 'react';

// Define the type for Current List:
export interface Item {
	name: string;
	status: string;
};

export interface Data {
	value: string;
}

export default function App() {
	const [currentList, setCurrentList] = useState<Item[]>([]);
	const [loading, setLoading] = useState(true);
	const listName = window.location.hash.slice(1) || "default-list";

	// Set as a list of Items:
	const DEFAULT_LIST = JSON.stringify([
		{ name: 'Dragonfruit', status: "need" },
		{ name: 'Oranges', status: "need" },
		{ name: 'DDP', status: "need" },
		{ name: 'CF Diet Coke', status: "need" },
		{ name: 'Egg', status: "need" },
	]);

	// TODO: Make "possible items" also a kv
	const POSSIBLE_ITEMS = [
		// Produce
		"Tomato, small",
		"Tomato, big",
		"🌶️Jalapeno",
		"🟥🫑",
		"🍄‍🟫",
		"Spinach",
		"Brocolli",
		"Fresh basil",
		"🍓",
		"🍒",
		"⭐️fruit",
		"🐉fruit",
		"Oranges",
		
		// Corner
		"Brie",
		"Fresh Mozarella",
		"🌽🌯",
		"🌾🌯",
		"Bacon",
		"Kielbasa",
		
		// Cans
		"Pintos Beans",
		"🥫Sauce",
		"🥫Whole",
		"🥫Diced",
		"🥫Paste",
		"🥫Puree",
		
		// Pasta
		"Manicotti",
		"Spaghetti",
		"Spaghetti, GF",
		
		// Soup
		"Brocolli Cheddar soup",

		// Drinks
		"Hot Chocolate",
		"White Hot Chocolate",
		"Green Tea",
		"Peppermint Tea",

		// Egg/Dairy:
		"Chocolate Soy Milk",
		"🥚",
		"🧀 Moz",
		"🧀 Ched",
		"🧀 Ricotta",

		// Soda:
		"DDP",
		"CF Diet Coke",
		"Sm. CF Diet Coke",

		// Frozen
		"Beyond Meat Sausage",
		"Morningstar Sausage",
		"Impossible Beef",
		"🍨LM",
		"🍨🥜",
		"🍨Dulce",
	];

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
				return 1;
			});
	}, []);

	const saveList = async () => {
		await fetch(`/api/state/${listName}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: JSON.stringify(currentList) })
		});
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

	const addItemByName = (itemName: string) => {
		const newItems = [...currentList];
		newItems.push({ name: itemName, status: "need" });
		setCurrentList(newItems);
	};

	const removeItemByName = (itemName: string) => {
		const newItems = [...currentList];
		const index = newItems.findIndex((item) => item.name === itemName);
		newItems.splice(index, 1);
		setCurrentList(newItems);
	}

	const itemNamesOnList = Object.values(currentList).map((item) => item.name);
	const availableToAdd = POSSIBLE_ITEMS.filter((item) => !itemNamesOnList.includes(item));

	if (loading) return <div>Loading......</div>;
	return (
		<div>
			<h2>Current List</h2>
			{/* {JSON.stringify(currentList)} */}
			{currentList.map((item) => (
				<ListItem
					key={item.name}
					item={item}
					currentValue={item.status === "carted"}
					toggleCurrentItems={toggleCurrentItem}
				/>
			))}
			<hr />
			<h2>Add to List</h2>
			{availableToAdd.map((itemName) => (
				<AvailableItem
					key={`available-${itemName}`}
					itemName={itemName}
					onChange={addItemByName}
				/>
			))}
			<CustomItem onChange={addItemByName} />
			<hr />
			<h2>Remove from List</h2>
			{currentList.map((item) => (
				<AvailableItem
					key={item.name}
					itemName={item.name}
					onChange={removeItemByName}
					className="removable-item"
				/>
			))}
			<hr />
			<hr />
			<button
				onClick={saveList}
				className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
			>
				Save List
			</button>
		</div>
	);
}

interface ListItemProps {
	item: Item;
	currentValue: boolean;
	toggleCurrentItems: (itemName: string) => void;
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
	itemName: string;
	onChange: (itemName: string) => void;
	className?: string;
}


const AvailableItem: React.FC<AvailableItemProps> = ({ itemName, onChange, className = "" }) => {
	return (
		<button onClick={() => onChange(itemName)} className={`available-item ${className}`}>
			{itemName}
		</button>
	);
};

interface CustomItemProps {
	onChange: (itemName: string) => void;
}

const CustomItem: React.FC<CustomItemProps> = ({ onChange }) => {
	const [isEditing, setIsEditing] = React.useState(false);
	const [customValue, setCustomValue] = React.useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (customValue.trim()) {
			onChange(customValue.trim());
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
		<button onClick={() => setIsEditing(true)} className="available-item">
			Custom
		</button>
	);
}