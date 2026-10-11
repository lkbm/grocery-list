import { Item } from './types';
import { Tile } from './Tile';
import { useDragReorder } from './useDragReorder';

interface DraggableItemProps {
	item: Item;
	index: number;
	category: string;
	onReorder: (itemName: string, category: string, newIndex: number) => void;
}

export const DraggableItem = ({ item, index, category, onReorder }: DraggableItemProps) => {
	// Group by category so items can only be reordered within their own category
	const { dragProps, dragClassName } = useDragReorder(`item:${category}`, (name, newIndex) =>
		onReorder(name, category, newIndex),
	);

	return (
		<Tile
			{...dragProps(item.name, index)}
			className={`draggable-item ${dragClassName(item.name)} ${item.status || ''}`}
		>
			<span className="drag-handle">⋮⋮</span>
			{item.name}
		</Tile>
	);
};
