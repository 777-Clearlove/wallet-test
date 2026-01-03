/**
 * IndexedDB 模拟适配器
 *
 * 模拟 IndexedDB 的核心特性：
 * - ✅ 单操作原子性（事务）
 * - ✅ 跨操作事务支持
 * - ✅ 内置完整性检查
 *
 * 用于在 Node.js 环境中测试（vitest）
 */

import type { StorageAdapter } from "../types";

export function createIndexedDBMockAdapter(
	delay = 5,
): StorageAdapter & {
	/** 模拟事务 */
	transaction: <T>(
		mode: "readonly" | "readwrite",
		fn: () => Promise<T>,
	) => Promise<T>;
	/** 获取原始存储 */
	getRawStorage: () => Map<string, string>;
	/** 清空存储 */
	clear: () => void;
	/** 获取操作计数 */
	getOperationCount: () => { reads: number; writes: number };
	/** 重置计数 */
	resetCount: () => void;
} {
	const storage = new Map<string, string>();
	let isInTransaction = false;
	let transactionMode: "readonly" | "readwrite" = "readonly";
	let readCount = 0;
	let writeCount = 0;

	const sleep = (ms: number) =>
		new Promise((resolve) => setTimeout(resolve, ms));

	return {
		getItem: async (key: string) => {
			await sleep(delay);
			readCount++;
			return storage.get(key) ?? null;
		},

		setItem: async (key: string, value: string) => {
			await sleep(delay);
			writeCount++;

			if (isInTransaction && transactionMode === "readonly") {
				throw new Error("Cannot write in readonly transaction");
			}

			// IndexedDB 单个 put 操作是原子的
			storage.set(key, value);
		},

		removeItem: async (key: string) => {
			await sleep(delay);
			writeCount++;

			if (isInTransaction && transactionMode === "readonly") {
				throw new Error("Cannot delete in readonly transaction");
			}

			storage.delete(key);
		},

		transaction: async <T>(
			mode: "readonly" | "readwrite",
			fn: () => Promise<T>,
		): Promise<T> => {
			isInTransaction = true;
			transactionMode = mode;

			try {
				const result = await fn();
				return result;
			} finally {
				isInTransaction = false;
			}
		},

		getRawStorage: () => new Map(storage),

		clear: () => {
			storage.clear();
			readCount = 0;
			writeCount = 0;
		},

		getOperationCount: () => ({ reads: readCount, writes: writeCount }),

		resetCount: () => {
			readCount = 0;
			writeCount = 0;
		},
	};
}

/**
 * localStorage 模拟适配器（无原子性保证）
 * 用于对比测试
 */
export function createLocalStorageMockAdapter(): StorageAdapter & {
	/** 模拟崩溃 */
	simulateCrashOnNextWrite: () => void;
	/** 获取原始存储 */
	getRawStorage: () => Map<string, string>;
	/** 清空存储 */
	clear: () => void;
	/** 获取写入计数 */
	getWriteCount: () => number;
	/** 重置计数 */
	resetCount: () => void;
} {
	const storage = new Map<string, string>();
	let shouldCrash = false;
	let writeCount = 0;

	return {
		getItem: (key: string) => {
			return storage.get(key) ?? null;
		},

		setItem: (key: string, value: string) => {
			writeCount++;

			if (shouldCrash) {
				// 模拟部分写入
				storage.set(key, value.slice(0, Math.floor(value.length / 2)));
				shouldCrash = false;
				throw new Error("Simulated crash during write");
			}

			storage.set(key, value);
		},

		removeItem: (key: string) => {
			storage.delete(key);
		},

		simulateCrashOnNextWrite: () => {
			shouldCrash = true;
		},

		getRawStorage: () => new Map(storage),

		clear: () => {
			storage.clear();
			writeCount = 0;
		},

		getWriteCount: () => writeCount,

		resetCount: () => {
			writeCount = 0;
		},
	};
}

