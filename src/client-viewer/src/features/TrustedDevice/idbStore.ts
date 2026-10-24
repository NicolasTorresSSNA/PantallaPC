import type { KeyValueStore } from './identity';

const DB_NAME = 'deskreen-viewer';
const STORE = 'kv';

const OPEN_TIMEOUT_MS = 2500;

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		// IndexedDB puede quedarse sin responder (bloqueada, modo privado, etc.).
		const timer = setTimeout(
			() => reject(new Error('indexedDB open timeout')),
			OPEN_TIMEOUT_MS,
		);
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => {
			clearTimeout(timer);
			resolve(request.result);
		};
		request.onerror = () => {
			clearTimeout(timer);
			reject(request.error);
		};
		request.onblocked = () => {
			clearTimeout(timer);
			reject(new Error('indexedDB blocked'));
		};
	});
}

async function run<T>(
	mode: IDBTransactionMode,
	action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const db = await openDb();
	try {
		return await new Promise<T>((resolve, reject) => {
			const request = action(db.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}

export const indexedDbStore: KeyValueStore = {
	get: (key) => run('readonly', (s) => s.get(key)),
	set: async (key, value) => {
		await run('readwrite', (s) => s.put(value, key));
	},
	remove: async (key) => {
		await run('readwrite', (s) => s.delete(key));
	},
};
