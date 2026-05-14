import { useState, useEffect, useRef } from 'preact/hooks';
import { Item, ListData } from './types';

const clearReconnectTimer = (reconnectTimeoutRef: { current: number | null }) => {
	if (reconnectTimeoutRef.current !== null) {
		window.clearTimeout(reconnectTimeoutRef.current);
		reconnectTimeoutRef.current = null;
	}
};

const reconnect = (reconnectAttemptsRef: { current: number }, wsRef: { current: WebSocket | null}, openSocket: (() => void)) => {
	clearReconnectTimer(reconnectAttemptsRef);
	reconnectAttemptsRef.current = 0;

	const mainWs = wsRef.current;
	if (!mainWs || mainWs.readyState === WebSocket.CLOSED) {
		openSocket();
	}
};

export const useOptionsSocket = (listName: string) => {
	const optionsListName = listName.endsWith('-options') ? listName : `${listName}-options`;
	const wsOptionsRef = useRef<WebSocket | null>(null);
	const optionsReconnectTimeoutRef = useRef<number | null>(null);
	const optionsReconnectAttemptsRef = useRef<number>(0);
	const [backupAvailable, setBackupAvailable] = useState<{ data: ListData; timestamp: string } | null>(null);
	const [recipes, setRecipes] = useState<string[]>([]);
	const [storeSections, setStoreSections] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [possibleItems, setPossibleItems] = useState<Item[]>([]);
	const skipNextSend = useRef<boolean>(false);
	const clearOptionsReconnectTimer = () => clearReconnectTimer(optionsReconnectTimeoutRef);

	const restoreFromBackup = async () => {
		if (!backupAvailable) return;
		const { data } = backupAvailable;
		setPossibleItems(data.items);
		setRecipes(data.recipeOrder);
		setStoreSections(data.storeSections);
		setBackupAvailable(null);
	};

	const dismissBackup = () => setBackupAvailable(null);

	// WebSocket connection for the options list
	const openOptionsSocket = (): (() => void) => {
		const existing = wsOptionsRef.current;
		if (
			existing &&
			(existing.readyState === WebSocket.OPEN ||
				existing.readyState === WebSocket.CONNECTING ||
				existing.readyState === WebSocket.CLOSING)
		) {
			return () => {};
		}

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const basePath = window.location.pathname.replace(/\/+$/, '');
		const ws = new WebSocket(`${protocol}//${window.location.host}${basePath}/api/ws/${optionsListName}`);
		wsOptionsRef.current = ws;
		clearOptionsReconnectTimer();

		let backupBannerShown = false;

		ws.onmessage = (event) => {
			const data = JSON.parse(event.data) as ListData;
			if (data.items.length > 0) {
				saveOptionsBackup(optionsListName, data);
			} else if (!backupBannerShown) {
				backupBannerShown = true;
				const backup = getOptionsBackup(optionsListName);
				if (backup && backup.data.items.length > 0) {
					setBackupAvailable(backup);
				}
			}
			skipNextSend.current = true;
			setPossibleItems(data.items);
			setRecipes(data.recipeOrder);
			setStoreSections(data.storeSections);
			setIsLoading(false);
		};

		ws.onopen = () => {
			optionsReconnectAttemptsRef.current = 0;
			clearOptionsReconnectTimer();
		};

		ws.onclose = () => {
			if (wsOptionsRef.current === ws) {
				wsOptionsRef.current = null;
				scheduleOptionsReconnect();
			}
		};

		return () => {
			if (wsOptionsRef.current === ws) {
				wsOptionsRef.current = null;
			}
			clearOptionsReconnectTimer();
			optionsReconnectAttemptsRef.current = 0;
			ws.close();
		};
	};
	const scheduleOptionsReconnect = () => {
		if (optionsReconnectTimeoutRef.current !== null) return;
		const attempt = optionsReconnectAttemptsRef.current + 1;
		optionsReconnectAttemptsRef.current = attempt;
		const delay = Math.min(1000 * 2 ** (attempt - 1), 15000);
		optionsReconnectTimeoutRef.current = window.setTimeout(() => {
			optionsReconnectTimeoutRef.current = null;
			openOptionsSocket();
		}, delay);
	};

	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(openOptionsSocket, [optionsListName]);

	// localStorage backup helpers for options data
	const getBackupKey = (optionsListName: string) => `grocery-backup:${optionsListName}`;

	const saveOptionsBackup = (optionsListName: string, data: ListData) => {
		try {
			const key = getBackupKey(optionsListName);
			localStorage.setItem(
				key,
				JSON.stringify({
					data,
					timestamp: new Date().toISOString(),
				}),
			);
		} catch (e) {
			console.warn('Failed to save options backup to localStorage', e);
		}
	};

	const getOptionsBackup = (optionsListName: string): { data: ListData; timestamp: string } | null => {
		try {
			const key = getBackupKey(optionsListName);
			const stored = localStorage.getItem(key);
			if (!stored) return null;
			return JSON.parse(stored);
		} catch {
			return null;
		}
	};

	const saveOptionsData = () => {
		if (skipNextSend.current) { skipNextSend.current = false; return; }
		const ws = wsOptionsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN || isLoading) return;
		ws.send(JSON.stringify({ items: possibleItems, recipeOrder: recipes, storeSections }));
	};
	useEffect(saveOptionsData, [possibleItems, recipes, storeSections]); // eslint-disable-line react-hooks/exhaustive-deps
	// TODO: This should be a useEffect and we use setPossibleItems, setRecipes,  and setStoreSections to trigger it:
	const reconnectOptionsSocket = () => {
		reconnect(optionsReconnectAttemptsRef, wsOptionsRef, openOptionsSocket);
	};

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
	const wsRef = useRef<WebSocket | null>(null);
	const mainReconnectTimeoutRef = useRef<number | null>(null);
	const mainReconnectAttemptsRef = useRef<number>(0);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	const [wsConnected, setWsConnected] = useState<boolean | null>(null);
	const skipNextSend = useRef<boolean>(false);

	const [currentList, setCurrentList] = useState<Item[]>([]);
	// Current list's own metadata (for saving back to this list)
	const [currentListMeta, setCurrentListMeta] = useState<{ recipeOrder: string[]; storeSections: string[] }>({
		recipeOrder: [],
		storeSections: [],
	});
	// Options list metadata (for UI: recipe picker, sort order)

	const clearMainReconnectTimer = () => {
		if (mainReconnectTimeoutRef.current !== null) {
			window.clearTimeout(mainReconnectTimeoutRef.current);
			mainReconnectTimeoutRef.current = null;
		}
	};

	const scheduleMainReconnect = () => {
		if (mainReconnectTimeoutRef.current !== null) return;
		const attempt = mainReconnectAttemptsRef.current + 1;
		mainReconnectAttemptsRef.current = attempt;
		const delay = Math.min(1000 * 2 ** (attempt - 1), 15000);
		mainReconnectTimeoutRef.current = window.setTimeout(() => {
			mainReconnectTimeoutRef.current = null;
			openMainSocket();
		}, delay);
	};

	// WebSocket connection for the main list
	const openMainSocket = () => {
		const existing = wsRef.current;
		if (
			existing &&
			(existing.readyState === WebSocket.OPEN ||
				existing.readyState === WebSocket.CONNECTING ||
				existing.readyState === WebSocket.CLOSING)
		) {
			return () => {};
		}

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const basePath = window.location.pathname.replace(/\/+$/, '');
		const ws = new WebSocket(`${protocol}//${window.location.host}${basePath}/api/ws/${listName}`);
		wsRef.current = ws;
		clearMainReconnectTimer();

		ws.onopen = () => {
			setWsConnected(true);
			mainReconnectAttemptsRef.current = 0;
			clearMainReconnectTimer();
		};
		ws.onclose = () => {
			if (wsRef.current === ws) {
				setWsConnected(false);
				wsRef.current = null;
				scheduleMainReconnect();
			}
		};
		ws.onerror = () => {
			if (wsRef.current === ws) {
				setWsConnected(false);
			}
		};
		ws.onmessage = (event) => {
			const data = JSON.parse(event.data) as ListData;
			skipNextSend.current = true;
			setCurrentList(data.items);
			setCurrentListMeta({ recipeOrder: data.recipeOrder, storeSections: data.storeSections });
			setIsLoading(false);
			setWsConnected(true);
		};

		return () => {
			if (wsRef.current === ws) {
				wsRef.current = null;
			}
			clearMainReconnectTimer();
			mainReconnectAttemptsRef.current = 0;
			ws.close();
		};
	};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(openMainSocket, [listName]);

	// Send local changes to server immediately
	useEffect(() => {
		if (skipNextSend.current) {
			skipNextSend.current = false;
			return;
		}
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN || isLoading) return;
		// TODO: Should we reconned if not open?
		ws.send(
			JSON.stringify({
				items: currentList,
				recipes: currentListMeta.recipeOrder,
				storeSections: currentListMeta.storeSections,
			}),
		);
		// TODO: Should we just include isLoading in the deps?
	}, [currentList, currentListMeta, isLoading]);
	const reconnectListSocket = () => {
		reconnect(mainReconnectAttemptsRef, wsRef, openMainSocket);
	};

	return { currentList, setCurrentList, wsConnected, reconnectListSocket, isListLoading: isLoading };
};
