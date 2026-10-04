import { forwardRef } from 'preact/compat';
import type { JSX } from 'preact';

type TileProps = JSX.HTMLAttributes<HTMLButtonElement> & {
	// Set for toggle tiles (e.g. carted); omit for plain action tiles
	pressed?: boolean;
};

// The shared grid-cell element for items, so every item type gets the same base styles from .tile
export const Tile = forwardRef<HTMLButtonElement, TileProps>(({ className = '', pressed, ...props }, ref) => (
	<button ref={ref} type="button" className={`tile ${className}`} aria-pressed={pressed} {...props} />
));
