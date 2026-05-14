import { useState } from 'preact/hooks';
import { Item } from './types';

interface DraggableItemProps {
	item: Item;
	index: number;
	category: string;
	onReorder: (itemName: string, category: string, newIndex: number) => void;
}

export const DraggableItem = ({ item, index, category, onReorder }: DraggableItemProps) => {
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
