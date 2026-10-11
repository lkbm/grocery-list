import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { Fragment } from 'preact';
import { Item } from './types';
import { Tile } from './Tile';
import { CustomItem } from './AddItems';
import { AvailableItem } from './AvailableItem';
import { sortBySection } from './helpers';

interface AddRecipeModalProps {
	possibleItems: Item[];
	storeSections: string[];
	onSave: (recipeName: string, items: Item[]) => Promise<void>;
	onClose: () => void;
	editingRecipeName?: string;
	initialItems?: Item[];
}

export const AddRecipeModal = ({ possibleItems, storeSections, onSave, onClose, editingRecipeName, initialItems }: AddRecipeModalProps) => {
	const [recipeName, setRecipeName] = useState(editingRecipeName ?? "");
	const [recipeItems, setRecipeItems] = useState<Item[]>(initialItems ?? []);
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
		return sortBySection(
			possibleItems.filter(item => !addedNames.includes(item.name)),
			storeSections,
		);
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
	storeSections = ["unknown", ...storeSections.filter(s => s !== "unknown")];

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content" onClick={e => e.stopPropagation()}>
				<div className="modal-header">
					<h2>{editingRecipeName ? "Edit Recipe" : "Add Recipe"}</h2>
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
												<Tile
													key={item.name}
													className="available-item removable-item"
													onClick={() => removeItemFromRecipe(item.name)}
												>
													{item.name}
												</Tile>
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
						{isSaving ? "Saving..." : editingRecipeName ? "Save Changes" : "Save Recipe"}
					</button>
				</div>
			</div>
		</div>
	);
};
