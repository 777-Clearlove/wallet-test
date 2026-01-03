/**
 * 存储适配器增强器
 * 提供原子写入、防抖、校验和、写入队列等安全机制
 *
 * 使用函数式组合模式，通过 withXxx 命名约定增强基础适配器
 */

import { Mutex } from "async-mutex";
import crc32 from "crc-32";
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
	/**
	 * 是否启用写入队列（防止并发冲突）
	 * - 同步适配器：默认 true
	 * - 异步适配器：如果启用了 atomic，则自动禁用（atomic 自带 per-key 锁）
	 */
	queue?: boolean;
	/**
	 * 是否启用原子写入（Double Buffer + 备份），默认 true
	 * 自动适配同步/异步适配器，异步模式自带 per-key 锁
	 */
	atomic?: boolean;
	/** 是否启用 Checksum 校验，默认 true */
	checksum?: boolean;
	/** 是否启用防抖写入，默认 false */
	debounce?: boolean | DebounceOptions;
}

// ============ 原子写入增强器 ============

/**
 * 统一原子写入增强器（Double Buffer + 备份）
 *
 * **自动适配同步/异步适配器**：
 * - 同步适配器：保持同步返回，无额外开销
 * - 异步适配器：自带 per-key 锁，避免并发问题
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
 * // 同步适配器
 * const safeAdapter = withAtomic(localStorageAdapter);
 *
 * // 异步适配器（自动检测，自带锁）
 * const safeAdapter = withAtomic(asyncStorageAdapter);
 *
 * // 组合使用
 * const enhanced = flow(withAtomic, withChecksum)(baseAdapter);
 * ```
 */
export const withAtomic: StorageEnhancer = (base) => {
	// 惰性检测：首次调用时判断是否为异步适配器
	let isAsync: boolean | null = null;

	// per-key 锁（仅异步模式使用）
	const keyLocks = new Map<string, Mutex>();

	const getLock = (key: string): Mutex => {
		let lock = keyLocks.get(key);
		if (!lock) {
			lock = new Mutex();
			keyLocks.set(key, lock);
		}
		return lock;
	};

	// 提取纯净的 key（去除 .bak/.tmp 后缀）
	const getPrimaryKey = (key: string): string => {
		if (key.endsWith(".bak") || key.endsWith(".tmp")) {
			return key.slice(0, key.lastIndexOf("."));
		}
		return key;
	};

	// ============ 同步实现 ============
	const syncGetItem = (key: string): string | null => {
		const result = base.getItem(key) as string | null;
		if (!result) {
			const backup = base.getItem(`${key}.bak`) as string | null;
			if (backup) {
				console.warn(`[Atomic] Restored from backup: ${key}`);
				base.setItem(key, backup);
				return backup;
			}
		}
		return result;
	};

	const syncSetItem = (key: string, value: string): void => {
		const tempKey = `${key}.tmp`;
		const backupKey = `${key}.bak`;

		const current = base.getItem(key) as string | null;
		if (current) base.setItem(backupKey, current);

		base.setItem(tempKey, value);

		const written = base.getItem(tempKey) as string | null;
		if (written !== value) {
			throw new Error(`[Atomic] Write verification failed: ${key}`);
		}

		base.setItem(key, written);
		base.removeItem(tempKey);
	};

	const syncRemoveItem = (key: string): void => {
		base.removeItem(key);
		base.removeItem(`${key}.bak`);
		base.removeItem(`${key}.tmp`);
	};

	// ============ 异步实现（带 per-key 锁）============
	const asyncGetItem = (key: string): Promise<string | null> => {
		const primaryKey = getPrimaryKey(key);
		return getLock(primaryKey).runExclusive(async () => {
			const result = await base.getItem(key);
			if (!result && key === primaryKey) {
				const backup = await base.getItem(`${key}.bak`);
				if (backup) {
					console.warn(`[Atomic] Restored from backup: ${key}`);
					await base.setItem(key, backup);
					return backup;
				}
			}
			return result;
		});
	};

	const asyncSetItem = (key: string, value: string): Promise<void> => {
		const primaryKey = getPrimaryKey(key);
		return getLock(primaryKey).runExclusive(async () => {
			const tempKey = `${key}.tmp`;
			const backupKey = `${key}.bak`;

			const current = await base.getItem(key);
			if (current) await base.setItem(backupKey, current);

			await base.setItem(tempKey, value);

			const written = await base.getItem(tempKey);
			if (written !== value) {
				throw new Error(`[Atomic] Write verification failed: ${key}`);
			}

			await base.setItem(key, written);
			await base.removeItem(tempKey);
		});
	};

	const asyncRemoveItem = (key: string): Promise<void> => {
		const primaryKey = getPrimaryKey(key);
		return getLock(primaryKey).runExclusive(async () => {
			await base.removeItem(key);
			await base.removeItem(`${key}.bak`);
			await base.removeItem(`${key}.tmp`);
		});
	};

	// ============ 检测并路由 ============
	const detectAndRoute = <T>(
		key: string,
		syncFn: (k: string) => T,
		asyncFn: (k: string) => Promise<T>,
	): T | Promise<T> => {
		// 首次调用时检测
		if (isAsync === null) {
			const testResult = base.getItem(key);
			isAsync = testResult instanceof Promise;
		}
		return isAsync ? asyncFn(key) : syncFn(key);
	};

	return {
		getItem: (key) => detectAndRoute(key, syncGetItem, asyncGetItem),

		setItem: (key, value) => {
			if (isAsync === null) {
				const testResult = base.getItem(key);
				isAsync = testResult instanceof Promise;
			}
			return isAsync ? asyncSetItem(key, value) : syncSetItem(key, value);
		},

		removeItem: (key) => {
			if (isAsync === null) {
				const testResult = base.getItem(key);
				isAsync = testResult instanceof Promise;
			}
			return isAsync ? asyncRemoveItem(key) : syncRemoveItem(key);
		},
	};
};

/**
 * @deprecated 请使用统一的 `withAtomic`，它已自动支持异步适配器
 */
export const withAtomicAsync = withAtomic;

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
			if (crc32.str(d) !== c) {
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
				c: crc32.str(value),
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
 * 默认管道：Queue → Checksum → Atomic → Debounce
 * - `withChecksum` 在最内层，确保所有数据（包括 .tmp/.bak）都有校验保护
 * - `withAtomic` 自动适配同步/异步，异步模式自带 per-key 锁
 * - 同步适配器可额外启用 `queue`（默认禁用，因为同步操作本身是原子的）
 *
 * @example
 * ```ts
 * // 基础用法（自动适配同步/异步）
 * const adapter = createSafeStorage(localStorageAdapter);
 * const adapter = createSafeStorage(asyncStorageAdapter);
 *
 * // 带防抖（高频写入场景）
 * const adapter = createSafeStorage(baseAdapter, {
 *   debounce: { wait: 300, maxWait: 1000 }
 * });
 *
 * // 自定义组合
 * import { flow } from "lodash-es";
 * const adapter = flow(withChecksum, withAtomic)(baseAdapter);
 * ```
 */
export function createSafeStorage(
	base: StorageAdapter,
	options: SafeStorageOptions = {},
): StorageAdapter {
	const {
		queue = false, // 默认禁用：withAtomic 异步模式自带锁，同步模式本身是原子的
		atomic = true,
		checksum = true,
		debounce: debounceOpt,
	} = options;

	// 构建增强器管道（从内到外）
	// 调用顺序：debounce → atomic → checksum → queue → base
	const enhancers: StorageEnhancer[] = [];

	// 1. 队列（最内层，直接操作底层存储）
	if (queue) enhancers.push(withQueue);

	// 2. 校验和（确保所有写入数据都有 checksum，包括 .tmp/.bak）
	if (checksum) enhancers.push(withChecksum);

	// 3. 原子写入（Double Buffer，操作已有 checksum 的数据）
	if (atomic) enhancers.push(withAtomic);

	// 4. 防抖（最外层，控制调用频率）
	if (debounceOpt) {
		const opts = typeof debounceOpt === "boolean" ? {} : debounceOpt;
		enhancers.push(withDebounce(opts));
	}

	return flow(...enhancers)(base);
}

