import type { KeyValueStore } from './identity';

const DB_NAME = 'deskreen-viewer';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
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
