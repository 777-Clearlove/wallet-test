/**
 * 存储适配器增强器
 * 提供原子写入、防抖、校验和、写入队列等安全机制
 *
 * 使用函数式组合模式，通过 withXxx 命名约定增强基础适配器
 */

import { Mutex } from "async-mutex";
import { debounce, flow } from "lodash-es";
import type { StorageAdapter } from "./adapter";

// ============ 类型定义 ============

/** 存储适配器增强器 - 接收适配器返回增强后的适配器 */
export type StorageEnhancer = (adapter: StorageAdapter) => StorageAdapter;

/** 防抖增强器选项 */
export interface DebounceOptions {
	wait?: number;
	maxWait?: number;
}

/** 安全适配器组合选项 */
export interface SafeStorageOptions {
	/** 是否启用写入队列（防止并发冲突），默认 true */
	queue?: boolean;
	/**
	 * 是否启用原子写入（Double Buffer + 备份），默认 true
	 * ⚠️ 对于异步适配器，建议设为 false（会导致嵌套异步调用问题）
	 */
	atomic?: boolean;
	/** 是否启用 Checksum 校验，默认 true */
	checksum?: boolean;
	/** 是否启用防抖写入，默认 false */
	debounce?: boolean | DebounceOptions;
}

// ============ 原子写入增强器 ============

/**
 * 原子写入增强器（Double Buffer + 备份）
 *
 * 原理：
 * 1. 写入到临时 key（`{key}.tmp`）
 * 2. 备份当前数据到（`{key}.bak`）
 * 3. 验证临时数据完整性
 * 4. 原子性替换主数据
 * 5. 清理临时文件
 *
 * @example
 * ```ts
 * const safeAdapter = withAtomic(localStorageAdapter);
 * // 或组合使用
 * const enhanced = flow(withQueue, withAtomic)(baseAdapter);
 * ```
 */
export const withAtomic: StorageEnhancer = (base) => ({
	getItem: (key) => {
		const result = base.getItem(key);

		// 同步适配器
		if (!(result instanceof Promise)) {
			if (!result) {
				const backup = base.getItem(`${key}.bak`);
				if (backup && !(backup instanceof Promise)) {
					console.warn(`[Atomic] Restored from backup: ${key}`);
					base.setItem(key, backup);
					return backup;
				}
			}
			return result;
		}

		// 异步适配器
		return result.then(async (value) => {
			if (!value) {
				const backup = await base.getItem(`${key}.bak`);
				if (backup) {
					console.warn(`[Atomic] Restored from backup: ${key}`);
					await base.setItem(key, backup);
					return backup;
				}
			}
			return value;
		});
	},

	setItem: (key, value) => {
		const tempKey = `${key}.tmp`;
		const backupKey = `${key}.bak`;

		const doWrite = async () => {
			// 1. 备份当前数据
			const current = await base.getItem(key);
			if (current) {
				await base.setItem(backupKey, current);
			}

			// 2. 写入临时 key
			await base.setItem(tempKey, value);

			// 3. 验证写入
			const written = await base.getItem(tempKey);
			if (written !== value) {
				throw new Error(`[Atomic] Write verification failed: ${key}`);
			}

			// 4. 提交到主 key
			await base.setItem(key, written);

			// 5. 清理临时文件
			await base.removeItem(tempKey);
		};

		const result = base.getItem(key);
		// 检测是否为异步适配器
		if (result instanceof Promise) {
			return doWrite();
		}

		// 同步适配器的同步路径
		const current = result;
		if (current) base.setItem(backupKey, current);
		base.setItem(tempKey, value);
		const written = base.getItem(tempKey);
		if (written !== value) {
			throw new Error(`[Atomic] Write verification failed: ${key}`);
		}
		base.setItem(key, written as string);
		base.removeItem(tempKey);
	},

	removeItem: (key) => {
		const result = base.removeItem(key);
		base.removeItem(`${key}.bak`);
		base.removeItem(`${key}.tmp`);
		return result;
	},
});

// ============ 防抖写入增强器 ============

/**
 * 防抖写入增强器
 *
 * 适用场景：高频更新的状态（如编辑器、Canvas）
 *
 * @example
 * ```ts
 * const adapter = withDebounce({ wait: 300, maxWait: 1000 })(baseAdapter);
 * ```
 */
export const withDebounce =
	(options: DebounceOptions = {}): StorageEnhancer =>
	(base) => {
		const { wait = 300, maxWait = wait * 3 } = options;
		const pendingWrites = new Map<string, string>();
		const writers = new Map<
			string,
			ReturnType<typeof debounce<(k: string, v: string) => void>>
		>();

		const getWriter = (key: string) => {
			let writer = writers.get(key);
			if (!writer) {
				writer = debounce(
					(k: string, v: string) => {
						base.setItem(k, v);
						pendingWrites.delete(k);
					},
					wait,
					{ maxWait },
				);
				writers.set(key, writer);
			}
			return writer;
		};

		// 页面卸载前强制写入
		if (typeof window !== "undefined") {
			const flush = () => {
				for (const [key, value] of pendingWrites) {
					writers.get(key)?.cancel();
					base.setItem(key, value);
				}
				pendingWrites.clear();
			};
			window.addEventListener("beforeunload", flush);
			window.addEventListener("pagehide", flush);
		}

		return {
			getItem: (key) => base.getItem(key),
			setItem: (key, value) => {
				pendingWrites.set(key, value);
				getWriter(key)(key, value);
			},
			removeItem: (key) => {
				writers.get(key)?.cancel();
				pendingWrites.delete(key);
				writers.delete(key);
				return base.removeItem(key);
			},
		};
	};

// ============ Checksum 校验增强器 ============

// CRC32 查找表
const CRC32_TABLE = Array.from({ length: 256 }, (_, i) => {
	let c = i;
	for (let j = 0; j < 8; j++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	return c;
});

const crc32 = (str: string): number => {
	let crc = -1;
	for (let i = 0; i < str.length; i++) {
		crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ str.charCodeAt(i)) & 0xff]!;
	}
	return (crc ^ -1) >>> 0;
};

interface ChecksummedData {
	d: string; // data
	c: number; // checksum
	t: number; // timestamp
}

/**
 * Checksum 校验增强器
 *
 * @example
 * ```ts
 * const adapter = flow(withAtomic, withChecksum)(baseAdapter);
 * ```
 */
export const withChecksum: StorageEnhancer = (base) => {
	const parse = (raw: string | null): string | null => {
		if (!raw) return null;
		try {
			const { d, c } = JSON.parse(raw) as ChecksummedData;
			if (crc32(d) !== c) {
				console.error("[Checksum] Data corrupted");
				return null;
			}
			return d;
		} catch {
			console.error("[Checksum] Parse failed");
			return null;
		}
	};

	return {
		getItem: (key) => {
			const result = base.getItem(key);
			if (result instanceof Promise) {
				return result.then(parse);
			}
			return parse(result);
		},

		setItem: (key, value) => {
			const wrapped: ChecksummedData = {
				d: value,
				c: crc32(value),
				t: Date.now(),
			};
			return base.setItem(key, JSON.stringify(wrapped));
		},

		removeItem: (key) => base.removeItem(key),
	};
};

// ============ 写入队列增强器 ============

/**
 * 写入队列增强器（防止并发写入冲突）
 *
 * **重要性**：
 * - Web 端：可选
 * - RN 端：**必须**
 * - Electron：**必须**
 * - 插件端：**推荐**
 *
 * @example
 * ```ts
 * const adapter = withQueue(asyncStorageAdapter);
 * ```
 */
export const withQueue: StorageEnhancer = (base) => {
	const mutex = new Mutex();

	return {
		getItem: (key) =>
			mutex.runExclusive(async () => {
				const result = base.getItem(key);
				return result instanceof Promise ? await result : result;
			}),

		setItem: (key, value) =>
			mutex.runExclusive(async () => {
				const result = base.setItem(key, value);
				if (result instanceof Promise) await result;
			}),

		removeItem: (key) =>
			mutex.runExclusive(async () => {
				const result = base.removeItem(key);
				if (result instanceof Promise) await result;
			}),
	};
};

// ============ 组合工具 ============

/**
 * 创建安全存储适配器（推荐用于生产环境）
 *
 * 默认包含：Queue → Atomic → Checksum
 * 可选开启：Debounce（最外层）
 *
 * @example
 * ```ts
 * // 基础用法（同步适配器，如 localStorage）
 * const adapter = createSafeStorage(localStorageAdapter);
 *
 * // 异步适配器（如 AsyncStorage）- 禁用 atomic
 * const adapter = createSafeStorage(asyncStorageAdapter, {
 *   atomic: false,  // 异步适配器必须禁用
 * });
 *
 * // 带防抖（高频写入场景）
 * const adapter = createSafeStorage(baseAdapter, {
 *   debounce: { wait: 300, maxWait: 1000 }
 * });
 *
 * // 自定义组合（直接用 lodash-es 的 flow）
 * import { flow } from "lodash-es";
 * const adapter = flow(
 *   withQueue,
 *   withAtomic,
 *   withDebounce({ wait: 500 })
 * )(baseAdapter);
 * ```
 */
export function createSafeStorage(
	base: StorageAdapter,
	options: SafeStorageOptions = {},
): StorageAdapter {
	const {
		queue = true,
		atomic = true,
		checksum = true,
		debounce: debounceOpt,
	} = options;

	// 构建增强器管道
	const enhancers: StorageEnhancer[] = [];

	// 1. 队列（最内层）- 异步适配器必须
	if (queue) enhancers.push(withQueue);

	// 2. 原子写入 - 对异步适配器可能有问题，可选禁用
	if (atomic) enhancers.push(withAtomic);

	// 3. 校验和
	if (checksum) enhancers.push(withChecksum);

	// 4. 防抖（最外层）
	if (debounceOpt) {
		const opts = typeof debounceOpt === "boolean" ? {} : debounceOpt;
		enhancers.push(withDebounce(opts));
	}

	return flow(...enhancers)(base);
}

