import { useState, useEffect, useRef } from 'preact/hooks';
import { Item, ListData } from './types';

// --- Module-level helpers ---

const buildWsUrl = (path: string): string => {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	const basePath = window.location.pathname.replace(/\/+$/, '');
	return `${protocol}//${window.location.host}${basePath}/api/ws/${path}`;
};

const getBackupKey = (listName: string) => `grocery-backup:${listName}`;

const saveOptionsBackup = (listName: string, data: ListData): void => {
	try {
		localStorage.setItem(getBackupKey(listName), JSON.stringify({ data, timestamp: new Date().toISOString() }));
	} catch (e) {
		console.warn('Failed to save options backup to localStorage', e);
	}
};

const getOptionsBackup = (listName: string): { data: ListData; timestamp: string } | null => {
	try {
		const stored = localStorage.getItem(getBackupKey(listName));
		if (!stored) return null;
		return JSON.parse(stored);
	} catch {
		return null;
	}
};

// --- Shared WebSocket hook ---

const useWebSocket = (url: string, onMessage: (data: ListData) => void) => {
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<number | null>(null);
	const reconnectAttemptsRef = useRef<number>(0);
	const skipNextSend = useRef<boolean>(false);
	const [wsConnected, setWsConnected] = useState<boolean | null>(null);
	// Keep onMessage current without restarting the socket on every render
	const onMessageRef = useRef(onMessage);
	onMessageRef.current = onMessage;

	const clearTimer = () => {
		if (reconnectTimeoutRef.current !== null) {
			window.clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
	};

	// scheduleReconnect and openSocket are mutually recursive via closures over refs — safe
	// because both are only ever called asynchronously (from setTimeout / WS events).
	const scheduleReconnect = () => {
		if (reconnectTimeoutRef.current !== null) return;
		const attempt = reconnectAttemptsRef.current + 1;
		reconnectAttemptsRef.current = attempt;
		const delay = Math.min(1000 * 2 ** (attempt - 1), 15000);
		reconnectTimeoutRef.current = window.setTimeout(() => {
			reconnectTimeoutRef.current = null;
			openSocket();
		}, delay);
	};

	const openSocket = () => {
		const existing = wsRef.current;
		if (
			existing &&
			(existing.readyState === WebSocket.OPEN ||
				existing.readyState === WebSocket.CONNECTING ||
				existing.readyState === WebSocket.CLOSING)
		) return;

		const ws = new WebSocket(url);
		wsRef.current = ws;
		clearTimer();

		ws.onopen = () => {
			setWsConnected(true);
			reconnectAttemptsRef.current = 0;
			clearTimer();
		};
		ws.onmessage = (event) => {
			skipNextSend.current = true;
			setWsConnected(true);
			onMessageRef.current(JSON.parse(event.data) as ListData);
		};
		ws.onclose = () => {
			if (wsRef.current === ws) {
				setWsConnected(false);
				wsRef.current = null;
				scheduleReconnect();
			}
		};
		ws.onerror = () => {
			if (wsRef.current === ws) setWsConnected(false);
		};
	};

	useEffect(() => {
		openSocket();
		return () => {
			clearTimer();
			reconnectAttemptsRef.current = 0;
			const ws = wsRef.current;
			if (ws) {
				wsRef.current = null;
				ws.close();
			}
		};
	}, [url]); // eslint-disable-line react-hooks/exhaustive-deps

	const reconnect = () => {
		clearTimer();
		reconnectAttemptsRef.current = 0;
		const ws = wsRef.current;
		if (!ws || ws.readyState === WebSocket.CLOSED) openSocket();
	};

	return { wsRef, skipNextSend, wsConnected, reconnect };
};

// --- Public hooks ---

export const useOptionsSocket = (listName: string) => {
	const optionsListName = listName.endsWith('-options') ? listName : `${listName}-options`;
	const [backupAvailable, setBackupAvailable] = useState<{ data: ListData; timestamp: string } | null>(null);
	const [recipes, setRecipes] = useState<string[]>([]);
	const [storeSections, setStoreSections] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [possibleItems, setPossibleItems] = useState<Item[]>([]);
	const backupBannerShown = useRef(false);

	const { wsRef, skipNextSend, reconnect: reconnectOptionsSocket } = useWebSocket(
		buildWsUrl(optionsListName),
		(data) => {
			if (data.items.length > 0) {
				saveOptionsBackup(optionsListName, data);
			} else if (!backupBannerShown.current) {
				backupBannerShown.current = true;
				const backup = getOptionsBackup(optionsListName);
				if (backup && backup.data.items.length > 0) {
					setBackupAvailable(backup);
				}
			}
			setPossibleItems(data.items);
			setRecipes(data.recipeOrder);
			setStoreSections(data.storeSections);
			setIsLoading(false);
		},
	);

	const restoreFromBackup = () => {
		if (!backupAvailable) return;
		const { data } = backupAvailable;
		setPossibleItems(data.items);
		setRecipes(data.recipeOrder);
		setStoreSections(data.storeSections);
		setBackupAvailable(null);
	};

	const dismissBackup = () => setBackupAvailable(null);

	useEffect(() => {
		if (skipNextSend.current) { skipNextSend.current = false; return; }
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN || isLoading) return;
		ws.send(JSON.stringify({ items: possibleItems, recipeOrder: recipes, storeSections }));
	}, [possibleItems, recipes, storeSections]); // eslint-disable-line react-hooks/exhaustive-deps

	return {
		backupAvailable,
		dismissBackup,
		restoreFromBackup,
		setPossibleItems,
		setRecipes,
		setStoreSections,
		recipes,
		storeSections,
		isOptionsLoading: isLoading,
		possibleItems,
		reconnectOptionsSocket,
	};
};

export const useListSocket = (listName: string) => {
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [currentList, setCurrentList] = useState<Item[]>([]);
	// Preserved and echoed back on save — the main list owns its own recipe/section metadata
	const [currentListMeta, setCurrentListMeta] = useState<{ recipeOrder: string[]; storeSections: string[] }>({
		recipeOrder: [],
		storeSections: [],
	});

	const { wsRef, skipNextSend, wsConnected, reconnect: reconnectListSocket } = useWebSocket(
		buildWsUrl(listName),
		(data) => {
			setCurrentList(data.items);
			setCurrentListMeta({ recipeOrder: data.recipeOrder, storeSections: data.storeSections });
			setIsLoading(false);
		},
	);

	useEffect(() => {
		if (skipNextSend.current) { skipNextSend.current = false; return; }
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN || isLoading) return;
		ws.send(JSON.stringify({
			items: currentList,
			recipes: currentListMeta.recipeOrder,
			storeSections: currentListMeta.storeSections,
		}));
	}, [currentList, currentListMeta, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

	return { currentList, setCurrentList, wsConnected, reconnectListSocket, isListLoading: isLoading };
};
