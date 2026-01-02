/**
 * 测试工具和模拟适配器
 */
import type { StorageAdapter } from "../storage/adapter";

/**
 * 创建内存存储适配器（同步）
 * 用于测试场景，不依赖 localStorage
 */
export function createMemoryStorageAdapter(): StorageAdapter {
	const storage = new Map<string, string>();

	return {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => {
			storage.set(key, value);
		},
		removeItem: (key: string) => {
			storage.delete(key);
		},
	};
}

/**
 * 创建异步内存存储适配器
 * 模拟 AsyncStorage / chrome.storage 等异步存储
 */
export function createAsyncMemoryStorageAdapter(
	delay = 10,
): StorageAdapter & { _storage: Map<string, string> } {
	const storage = new Map<string, string>();

	return {
		_storage: storage,
		getItem: async (key: string) => {
			await sleep(delay);
			return storage.get(key) ?? null;
		},
		setItem: async (key: string, value: string) => {
			await sleep(delay);
			storage.set(key, value);
		},
		removeItem: async (key: string) => {
			await sleep(delay);
			storage.delete(key);
		},
	};
}

/**
 * 创建基于 localStorage 的异步适配器模拟
 * 用于测试异步存储场景
 */
export function createLocalStorageAsyncAdapter(
	delay = 10,
): StorageAdapter {
	return {
		getItem: async (key: string) => {
			await sleep(delay);
			return localStorage.getItem(key);
		},
		setItem: async (key: string, value: string) => {
			await sleep(delay);
			localStorage.setItem(key, value);
		},
		removeItem: async (key: string) => {
			await sleep(delay);
			localStorage.removeItem(key);
		},
	};
}

/**
 * 创建可失败的存储适配器（用于测试错误处理）
 */
export function createFailableStorageAdapter(
	base: StorageAdapter,
	options: {
		failOnGet?: boolean;
		failOnSet?: boolean;
		failOnRemove?: boolean;
		failAfterNWrites?: number;
	} = {},
): StorageAdapter & { reset: () => void } {
	let writeCount = 0;

	const shouldFail = (operation: "get" | "set" | "remove") => {
		if (options.failAfterNWrites !== undefined && writeCount >= options.failAfterNWrites) {
			return true;
		}
		if (operation === "get" && options.failOnGet) return true;
		if (operation === "set" && options.failOnSet) return true;
		if (operation === "remove" && options.failOnRemove) return true;
		return false;
	};

	return {
		getItem: (key: string) => {
			if (shouldFail("get")) {
				throw new Error("Simulated storage read error");
			}
			return base.getItem(key);
		},
		setItem: (key: string, value: string) => {
			writeCount++;
			if (shouldFail("set")) {
				throw new Error("Simulated storage write error");
			}
			return base.setItem(key, value);
		},
		removeItem: (key: string) => {
			if (shouldFail("remove")) {
				throw new Error("Simulated storage remove error");
			}
			return base.removeItem(key);
		},
		reset: () => {
			writeCount = 0;
		},
	};
}

/**
 * 创建可追踪操作的存储适配器
 */
export function createTrackedStorageAdapter(base: StorageAdapter): StorageAdapter & {
	operations: Array<{ type: "get" | "set" | "remove"; key: string; value?: string }>;
	clear: () => void;
} {
	const operations: Array<{ type: "get" | "set" | "remove"; key: string; value?: string }> = [];

	return {
		operations,
		getItem: (key: string) => {
			operations.push({ type: "get", key });
			return base.getItem(key);
		},
		setItem: (key: string, value: string) => {
			operations.push({ type: "set", key, value });
			return base.setItem(key, value);
		},
		removeItem: (key: string) => {
			operations.push({ type: "remove", key });
			return base.removeItem(key);
		},
		clear: () => {
			operations.length = 0;
		},
	};
}

/**
 * 辅助函数：休眠
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 辅助函数：等待条件满足
 */
export async function waitFor(
	condition: () => boolean,
	timeout = 5000,
	interval = 50,
): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeout) {
			throw new Error("waitFor timeout");
		}
		await sleep(interval);
	}
}

/**
 * 清理 localStorage 的所有测试数据
 */
export function clearTestStorage(): void {
	if (typeof localStorage !== "undefined") {
		localStorage.clear();
	}
}

