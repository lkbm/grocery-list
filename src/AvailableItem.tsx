import { useState } from 'preact/hooks';
import { Item } from './types';

interface AvailableItemProps {
	onChange: (itemName: string, category?: string) => void;
	className?: string;
	item: Item;
}

export const AvailableItem = ({ item, onChange, className = "", showCategoryLabel = false }: AvailableItemProps & { showCategoryLabel?: boolean }) => {
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
			{showCategoryLabel && <span className={`sideways-category-header`}>{item.category}</span>}
			{item.name}
		</button>
	);
};
