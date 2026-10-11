import { useState } from 'preact/hooks';

interface DragPayload {
	group: string;
	name: string;
}

// HTML5 drag-and-drop reordering for a list of named things. Drops are only accepted from the
// same group, so e.g. items can't be dragged across categories or sections onto recipes.
export const useDragReorder = (group: string, onReorder: (name: string, newIndex: number) => void) => {
	const [draggingName, setDraggingName] = useState<string | null>(null);
	const [dragOverName, setDragOverName] = useState<string | null>(null);

	const dragProps = (name: string, index: number) => ({
		draggable: true,
		onDragStart: (e: DragEvent) => {
			setDraggingName(name);
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', JSON.stringify({ group, name } satisfies DragPayload));
			}
		},
		onDragEnd: () => {
			setDraggingName(null);
			setDragOverName(null);
		},
		onDragOver: (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			setDragOverName(name);
		},
		onDragLeave: () => setDragOverName(null),
		onDrop: (e: DragEvent) => {
			e.preventDefault();
			setDragOverName(null);
			if (!e.dataTransfer) return;
			try {
				const data = JSON.parse(e.dataTransfer.getData('text/plain')) as DragPayload;
				if (data.group === group && data.name !== name) onReorder(data.name, index);
			} catch {
				// Invalid drag data (e.g. text dragged in from outside the app)
			}
		},
	});

	const dragClassName = (name: string) =>
		`${draggingName === name ? 'dragging' : ''} ${dragOverName === name ? 'drag-over' : ''}`;

	return { dragProps, dragClassName };
};
