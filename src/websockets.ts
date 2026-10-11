import { useState, useEffect, useRef } from 'preact/hooks';
import { ListData } from './types';

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

// --- Synced list state ---

const EMPTY_LIST: ListData = { items: [], recipeOrder: [], storeSections: [], deletedRecipes: [], deletedSections: [] };

const normalizeListData = (data: ListData): ListData => ({
	...data,
	deletedRecipes: data.deletedRecipes ?? [],
	deletedSections: data.deletedSections ?? [],
});

// One list's full data, synced over a WebSocket: server messages replace it, local changes are sent.
const useSyncedList = (listName: string, onServerData?: (data: ListData) => void) => {
	const [data, setData] = useState<ListData>(EMPTY_LIST);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	const { wsRef, skipNextSend, wsConnected, reconnect } = useWebSocket(buildWsUrl(listName), (incoming) => {
		onServerData?.(incoming);
		setData(normalizeListData(incoming));
		setIsLoading(false);
	});

	useEffect(() => {
		if (skipNextSend.current) { skipNextSend.current = false; return; }
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN || isLoading) return;
		ws.send(JSON.stringify(data));
	}, [data, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

	// Setter for a single field. Uses a functional update so several setters called in one handler
	// (e.g. items + recipeOrder + deletedRecipes) all apply, instead of each overwriting the last.
	const setField = <K extends keyof ListData>(key: K) => (value: ListData[K]) =>
		setData((prev) => ({ ...prev, [key]: value }));

	return { data, setData, setField, isLoading, wsConnected, reconnect };
};

// --- Public hooks ---

export const useOptionsSocket = (listName: string) => {
	const optionsListName = listName.endsWith('-options') ? listName : `${listName}-options`;
	const [backupAvailable, setBackupAvailable] = useState<{ data: ListData; timestamp: string } | null>(null);
	const backupBannerShown = useRef(false);

	const { data, setData, setField, isLoading, reconnect } = useSyncedList(optionsListName, (incoming) => {
		if (incoming.items.length > 0) {
			saveOptionsBackup(optionsListName, incoming);
		} else if (!backupBannerShown.current) {
			backupBannerShown.current = true;
			const backup = getOptionsBackup(optionsListName);
			if (backup && backup.data.items.length > 0) {
				setBackupAvailable(backup);
			}
		}
	});

	const restoreFromBackup = () => {
		if (!backupAvailable) return;
		setData(normalizeListData(backupAvailable.data));
		setBackupAvailable(null);
	};

	const dismissBackup = () => setBackupAvailable(null);

	return {
		backupAvailable,
		dismissBackup,
		restoreFromBackup,
		setPossibleItems: setField('items'),
		setRecipes: setField('recipeOrder'),
		setStoreSections: setField('storeSections'),
		setDeletedRecipes: setField('deletedRecipes'),
		setDeletedSections: setField('deletedSections'),
		recipes: data.recipeOrder,
		storeSections: data.storeSections,
		deletedRecipes: data.deletedRecipes ?? [],
		deletedSections: data.deletedSections ?? [],
		isOptionsLoading: isLoading,
		possibleItems: data.items,
		reconnectOptionsSocket: reconnect,
	};
};

// The main list's own recipeOrder/storeSections/tombstones are unused by the UI, but are kept in
// `data` and echoed back on save so nothing is dropped.
export const useListSocket = (listName: string) => {
	const { data, setField, isLoading, wsConnected, reconnect } = useSyncedList(listName);
	return {
		currentList: data.items,
		setCurrentList: setField('items'),
		wsConnected,
		reconnectListSocket: reconnect,
		isListLoading: isLoading,
	};
};
