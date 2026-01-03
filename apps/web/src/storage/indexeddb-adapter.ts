/**
 * IndexedDB 存储适配器
 *
 * IndexedDB 特性：
 * - ✅ 单操作原子性（事务）
 * - ✅ 跨操作事务支持
 * - ✅ 内置完整性检查
 * - ⚡️ 异步非阻塞
 *
 * 结论：只需要 withDebounce 优化高频写入
 */

import type { StorageAdapter } from "./types";

const DB_NAME = "app-storage";
const STORE_NAME = "key-value";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
	});

	return dbPromise;
}

export function createIndexedDBAdapter(): StorageAdapter {
	return {
		getItem: async (key: string) => {
			const db = await openDB();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(STORE_NAME, "readonly");
				const store = tx.objectStore(STORE_NAME);
				const request = store.get(key);

				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(request.result ?? null);
			});
		},

		setItem: async (key: string, value: string) => {
			const db = await openDB();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(STORE_NAME, "readwrite");
				const store = tx.objectStore(STORE_NAME);
				const request = store.put(value, key);

				request.onerror = () => reject(request.error);
				tx.oncomplete = () => resolve();
			});
		},

		removeItem: async (key: string) => {
			const db = await openDB();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(STORE_NAME, "readwrite");
				const store = tx.objectStore(STORE_NAME);
				const request = store.delete(key);

				request.onerror = () => reject(request.error);
				tx.oncomplete = () => resolve();
			});
		},
	};
}

export const indexedDBAdapter = createIndexedDBAdapter();

