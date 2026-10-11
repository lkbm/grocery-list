import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { memo } from 'preact/compat';
import { Item } from './types';
import { Tile } from './Tile';
import { isDefaultItem, sortBySection } from './helpers';
import { AvailableItem } from './AvailableItem';
import { useDragReorder } from './useDragReorder';

interface AddItemsProps {
	onAddItem: (itemName: string, category?: string) => void;
	possibleItems: Item[];
	activeItemNames: string[];
	recipes: string[];
	storeSections: string[];
	onAddRecipeClick: () => void;
	onEditRecipeClick: (recipeName: string) => void;
	onDeleteRecipe: (recipeName: string) => Promise<void>;
	isSorting: boolean;
	onReorderRecipe: (recipeName: string, newIndex: number) => void;
	onReorderSection: (sectionName: string, newIndex: number) => void;
	onAddSection: (sectionName: string) => void;
	onDeleteSection: (sectionName: string, deleteItems: boolean) => void;
	collapsedSections: { standardItems: boolean };
	onToggleSectionCollapse: (section: 'standardItems') => void;
	listName: string;
	onHelpClick: () => void;
}

export const AddItems = memo(
	({
		onAddItem,
		possibleItems,
		activeItemNames,
		recipes,
		storeSections,
		onAddRecipeClick,
		onEditRecipeClick,
		onDeleteRecipe,
		isSorting,
		onReorderRecipe,
		onReorderSection,
		onAddSection,
		onDeleteSection,
		collapsedSections,
		onToggleSectionCollapse,
		listName,
		onHelpClick,
	}: AddItemsProps) => {
		const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
		const sectionDrag = useDragReorder('section', onReorderSection);
		const recipeDrag = useDragReorder('recipe', onReorderRecipe);
		const [deletingSectionName, setDeletingSectionName] = useState<string | null>(
			null,
		);
		const [deleteItemsChecked, setDeleteItemsChecked] = useState(false);
		const [isAddingSection, setIsAddingSection] = useState(false);
		const [newSectionName, setNewSectionName] = useState('');
		const [searchFilter, setSearchFilter] = useState('');
		const newSectionInputRef = useRef<HTMLInputElement>(null);
		const searchInputRef = useRef<HTMLInputElement>(null);

		useEffect(() => {
			if (isAddingSection && newSectionInputRef.current) {
				newSectionInputRef.current.focus();
			}
		}, [isAddingSection]);

		// Standard items: default items not already on the list
		const standardItems = useMemo(() => {
			return sortBySection(
				possibleItems.filter(
					(item) => isDefaultItem(item) && !activeItemNames.includes(item.name),
				),
				storeSections,
			);
		}, [possibleItems, activeItemNames, storeSections]);

		const filteredStandardItems = useMemo(() => {
			if (!searchFilter.trim()) return standardItems;
			const query = searchFilter.toLowerCase();
			return standardItems.filter((item) =>
				item.name.toLowerCase().includes(query),
			);
		}, [standardItems, searchFilter]);

		const trimmedFilter = searchFilter.trim();

		// Offer "Add to [section]" unless the typed text already names a standard item
		// (otherwise clicking it would create a duplicate instead of reusing the existing one).
		const shouldShowAddToSection = (filter: string): boolean => {
			const query = filter.toLowerCase();
			return !standardItems.some((item) => item.name.toLowerCase() === query);
		};

		// Get items for a specific recipe
		const getRecipeItems = (recipeName: string) => {
			return sortBySection(
				possibleItems.filter((item) => item.recipes?.includes(recipeName)),
				storeSections,
			);
		};

		const handleAddSectionSubmit = (e: Event) => {
			e.preventDefault();
			if (newSectionName.trim()) {
				onAddSection(newSectionName.trim());
				setNewSectionName('');
				setIsAddingSection(false);
			}
		};

		const handleDeleteConfirm = () => {
			if (deletingSectionName) {
				onDeleteSection(deletingSectionName, deleteItemsChecked);
				setDeletingSectionName(null);
				setDeleteItemsChecked(false);
			}
		};

		return (
			<>
				<button
					className="collapsible-header"
					onClick={() => onToggleSectionCollapse('standardItems')}
				>
					<span className="collapse-indicator">
						{collapsedSections.standardItems ? '+' : '-'}
					</span>
					{isSorting ? 'Drag to Reorder Sections' : 'Standard Items'}
					<span className="section-count">
						({isSorting ? storeSections.length : standardItems.length})
					</span>
				</button>
				{!collapsedSections.standardItems && !isSorting && (
					<div className="search-filter">
						<input
							ref={searchInputRef}
							type="text"
							value={searchFilter}
							onInput={(e) => setSearchFilter((e.target as HTMLInputElement).value)}
							placeholder="Filter items..."
							className="search-filter-input"
						/>
						{searchFilter && (
							<button
								className="search-filter-clear"
								onClick={() => {
									setSearchFilter('');
									searchInputRef.current?.focus();
								}}
							>
								&times;
							</button>
						)}
					</div>
				)}
				{!collapsedSections.standardItems && (
					<div className="item-grid">
						{isSorting
							? storeSections.map((category, index) => (
									<div key={category} className="section-row">
										<Tile
											{...sectionDrag.dragProps(category, index)}
											className={`available-item custom draggable-section ${sectionDrag.dragClassName(category)}`}
										>
											<span className="drag-handle">⋮⋮</span>
											{category}
										</Tile>
										<button
											className="section-delete"
											onClick={() => setDeletingSectionName(category)}
											title="Delete section"
										>
											&times;
										</button>
									</div>
								))
							: filteredStandardItems.map((item, index) => (
									<AvailableItem
										key={`available-${item.name}`}
										showCategoryLabel={
											index === 0 ||
											item.category !== filteredStandardItems[index - 1].category
										}
										item={item}
										onChange={(name, category) => {
											onAddItem(name, category);
											setSearchFilter('');
										}}
									/>
								))}
						{!isSorting &&
							trimmedFilter &&
							shouldShowAddToSection(trimmedFilter) &&
							storeSections.map((category) => (
								<Tile
									key={`add-to-${category}`}
									className="available-item custom"
									onClick={() => {
										onAddItem(trimmedFilter, category);
										setSearchFilter('');
									}}
								>
									<span className="custom-item-plus">+</span>
									Add to {category}
								</Tile>
							))}
						{(isSorting || !trimmedFilter) &&
							(isAddingSection ? (
								<form onSubmit={handleAddSectionSubmit} className="add-section-form">
									<input
										ref={newSectionInputRef}
										type="text"
										value={newSectionName}
										onChange={(e) =>
											setNewSectionName((e.target as HTMLInputElement).value)
										}
										placeholder="Section name"
									/>
									<button type="submit">Add</button>
									<button
										type="button"
										onClick={() => {
											setIsAddingSection(false);
											setNewSectionName('');
										}}
									>
										Cancel
									</button>
								</form>
							) : (
								<Tile
									className="add-section-button"
									onClick={() => setIsAddingSection(true)}
								>
									+ Add Section
								</Tile>
							))}
					</div>
				)}
				<h3>{isSorting ? 'Drag to Reorder ' : ''}Recipes</h3>
				{recipes.map((recipeName, index) => {
					const isExpanded = expandedRecipe === recipeName;
					const recipeItems = getRecipeItems(recipeName);
					return (
						<div key={recipeName} className="recipe-section">
							<div className="recipe-header-row">
								<button
									{...(isSorting ? recipeDrag.dragProps(recipeName, index) : {})}
									className={`recipe-header ${recipeDrag.dragClassName(recipeName)}`}
									onClick={() =>
										!isSorting && setExpandedRecipe(isExpanded ? null : recipeName)
									}
								>
									{isSorting && <span className="drag-handle">⋮⋮</span>}
									<span className="recipe-toggle">{isExpanded ? '▾' : '▸'}</span>
									{recipeName}
									<span className="recipe-count">({recipeItems.length})</span>
								</button>
								{!isSorting && (
									<button
										className="recipe-edit"
										onClick={(e) => {
											e.stopPropagation();
											onEditRecipeClick(recipeName);
										}}
										title="Edit recipe"
									>
										✎
									</button>
								)}
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
											className={
												activeItemNames.includes(item.name) ? 'already-added' : ''
											}
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
				{deletingSectionName && (
					<div
						className="modal-overlay"
						onClick={() => {
							setDeletingSectionName(null);
							setDeleteItemsChecked(false);
						}}
					>
						<div
							className="modal-content delete-section-modal"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="modal-header">
								<h2>Delete Section</h2>
								<button
									className="modal-close"
									onClick={() => {
										setDeletingSectionName(null);
										setDeleteItemsChecked(false);
									}}
								>
									&times;
								</button>
							</div>
							<div className="modal-body">
								<p>Delete the section "{deletingSectionName}"?</p>
								<p>Items in this section will be moved to "unknown".</p>
								<label className="delete-items-checkbox">
									<input
										type="checkbox"
										checked={deleteItemsChecked}
										onChange={(e) =>
											setDeleteItemsChecked((e.target as HTMLInputElement).checked)
										}
									/>
									Also delete all items in this section
								</label>
							</div>
							<div className="modal-footer">
								<button
									onClick={() => {
										setDeletingSectionName(null);
										setDeleteItemsChecked(false);
									}}
								>
									Cancel
								</button>
								<button onClick={handleDeleteConfirm} className="delete-button">
									Delete Section
								</button>
							</div>
						</div>
					</div>
				)}
				<div className="item-grid">
					<span onClick={onHelpClick} className="footer-link help-link">
						Help
					</span>
					{listName.endsWith('-options') ? (
						<a
							href={`#${listName.slice(0, -8)}`}
							target="_blank"
							rel="noopener noreferrer"
							className="footer-link"
						>
							Go to List
						</a>
					) : (
						<a
							href={`#${listName}-options`}
							className="footer-link"
							rel="noopener noreferrer"
							target="_blank"
						>
							Edit Options
						</a>
					)}
					<a
						href="https://ko-fi.com/lucamasters"
						target="_blank"
						rel="noopener noreferrer"
						className="footer-link"
					>
						Support me on Ko-Fi.
					</a>
				</div>
			</>
		);
	},
);

interface CustomItemProps {
	onChange: (itemName: string, category?: string) => void;
	category: string;
}

export const CustomItem = ({ onChange, category }: CustomItemProps) => {
	const [isEditing, setIsEditing] = useState(false);
	const [customValue, setCustomValue] = useState('');
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
			setCustomValue('');
			setIsEditing(false);
		}
	};

	const handleCancel = () => {
		setCustomValue('');
		setIsEditing(false);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			handleCancel();
		}
	};

	if (isEditing) {
		return (
			<form onSubmit={handleSubmit} className="custom-item-form">
				<button type="button" className="custom-item-cancel" onClick={handleCancel}>
					×
				</button>
				<input
					ref={inputRef}
					type="text"
					value={customValue}
					onChange={(e) => setCustomValue((e.target as HTMLInputElement)?.value)}
					onKeyDown={handleKeyDown}
					placeholder={category}
					className="custom-item-input"
				/>
			</form>
		);
	}

	return (
		<Tile onClick={() => setIsEditing(true)} className="available-item custom">
			<span className="custom-item-plus">+</span>
			{category}
		</Tile>
	);
};
