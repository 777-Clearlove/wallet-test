/**
 * 存储安全性测试场景
 *
 * 这是一套可复用的测试场景，用于验证不同存储方案（localStorage、MMKV、IndexedDB）
 * 在各种边界情况下的行为。
 *
 * 测试的问题：
 * 1. 原子性 - 写入过程中崩溃是否会导致数据损坏
 * 2. 并发安全 - 多个并发写入是否会产生竞态条件
 * 3. 数据完整性 - 是否能检测/恢复损坏的数据
 * 4. 高频写入 - 频繁写入的性能影响
 *
 * 使用方式：
 * ```ts
 * import { createStorageSafetyTests } from './safety-scenarios';
 *
 * describe('MyStorageAdapter', () => {
 *   createStorageSafetyTests({
 *     name: 'IndexedDB',
 *     createAdapter: () => createIndexedDBAdapter(),
 *     isAsync: true,
 *     supportsAtomicWrite: true,   // IndexedDB 单操作原子性
 *     supportsTransaction: true,   // IndexedDB 支持事务
 *     hasBuiltinChecksum: false,   // IndexedDB 无内置校验
 *   });
 * });
 * ```
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { StorageAdapter } from "../../storage/adapter";

// ============ 类型定义 ============

export interface StorageSafetyTestConfig {
	/** 存储方案名称 */
	name: string;
	/** 创建适配器的工厂函数 */
	createAdapter: () => StorageAdapter | Promise<StorageAdapter>;
	/** 清理适配器（可选） */
	cleanupAdapter?: (adapter: StorageAdapter) => void | Promise<void>;
	/** 是否为异步适配器 */
	isAsync: boolean;
	/** 是否支持单操作原子写入 */
	supportsAtomicWrite: boolean;
	/** 是否支持跨操作事务 */
	supportsTransaction: boolean;
	/** 是否有内置数据校验（如 MMKV 的 CRC） */
	hasBuiltinChecksum: boolean;
	/** 是否支持模拟崩溃（用于原子性测试） */
	canSimulateCrash?: boolean;
	/** 创建可崩溃适配器（用于原子性测试） */
	createCrashableAdapter?: () => CrashableStorageAdapter | Promise<CrashableStorageAdapter>;
}

export interface CrashableStorageAdapter extends StorageAdapter {
	/** 模拟在下次写入时崩溃 */
	simulateCrashOnNextWrite: () => void;
	/** 重置崩溃状态 */
	resetCrashState: () => void;
	/** 获取底层存储数据（用于检查部分写入） */
	getRawData: () => Map<string, string>;
}

export interface StorageSafetyTestResult {
	/** 测试场景名称 */
	scenario: string;
	/** 是否通过 */
	passed: boolean;
	/** 详细信息 */
	details: string;
	/** 存储方案是否安全 */
	isSafe: boolean;
}

// ============ 测试场景工厂 ============

/**
 * 创建存储安全性测试套件
 */
export function createStorageSafetyTests(config: StorageSafetyTestConfig) {
	const {
		name,
		createAdapter,
		cleanupAdapter,
		isAsync,
		supportsAtomicWrite,
		supportsTransaction,
		hasBuiltinChecksum,
		canSimulateCrash,
		createCrashableAdapter,
	} = config;

	describe(`${name} 存储安全性测试`, () => {
		let adapter: StorageAdapter;

		beforeEach(async () => {
			adapter = await createAdapter();
		});

		afterEach(async () => {
			if (cleanupAdapter) {
				await cleanupAdapter(adapter);
			}
		});

		// ============ 场景 1: 基本读写 ============
		describe("场景 1: 基本读写", () => {
			it("应该正确存储和读取数据", async () => {
				const testData = JSON.stringify({ vaults: [{ id: "1", name: "Test" }] });

				if (isAsync) {
					await adapter.setItem("test-key", testData);
					const result = await adapter.getItem("test-key");
					expect(result).toBe(testData);
				} else {
					adapter.setItem("test-key", testData);
					expect(adapter.getItem("test-key")).toBe(testData);
				}
			});

			it("应该正确处理 JSON 数据", async () => {
				const complexData = {
					wallets: [
						{ id: "w1", accounts: [{ address: "0x123" }] },
						{ id: "w2", accounts: [{ address: "0x456" }] },
					],
					settings: { theme: "dark", currency: "USD" },
				};
				const serialized = JSON.stringify(complexData);

				if (isAsync) {
					await adapter.setItem("complex", serialized);
					const result = await adapter.getItem("complex");
					expect(JSON.parse(result!)).toEqual(complexData);
				} else {
					adapter.setItem("complex", serialized);
					const result = adapter.getItem("complex") as string;
					expect(JSON.parse(result)).toEqual(complexData);
				}
			});
		});

		// ============ 场景 2: 并发写入竞态 ============
		describe("场景 2: 并发写入竞态", () => {
			it("并发写入同一 key - 最后一个写入应该获胜", async () => {
				const results: string[] = [];

				if (isAsync) {
					// 并发写入
					const p1 = adapter.setItem("race-key", "value-1") as Promise<void>;
					const p2 = adapter.setItem("race-key", "value-2") as Promise<void>;
					const p3 = adapter.setItem("race-key", "value-3") as Promise<void>;

					await Promise.all([
						p1.then(() => results.push("1")),
						p2.then(() => results.push("2")),
						p3.then(() => results.push("3")),
					]);

					const finalValue = await adapter.getItem("race-key");
					// 最终值应该是其中一个（取决于执行顺序）
					expect(["value-1", "value-2", "value-3"]).toContain(finalValue);
				} else {
					// 同步适配器不存在真正的并发问题
					adapter.setItem("race-key", "value-1");
					adapter.setItem("race-key", "value-2");
					adapter.setItem("race-key", "value-3");
					expect(adapter.getItem("race-key")).toBe("value-3");
				}
			});

			it("读-修改-写 竞态条件测试", async () => {
				const initialValue = JSON.stringify({ count: 0 });

				if (isAsync) {
					await adapter.setItem("counter", initialValue);

					// 模拟多个并发的读-修改-写操作
					const increment = async () => {
						const current = (await adapter.getItem("counter")) as string;
						const data = JSON.parse(current);
						data.count += 1;
						await adapter.setItem("counter", JSON.stringify(data));
					};

					// 并发执行 10 次增加
					await Promise.all(Array.from({ length: 10 }, () => increment()));

					const finalValue = (await adapter.getItem("counter")) as string;
					const finalCount = JSON.parse(finalValue).count;

					// 如果存储不支持事务，可能会丢失更新
					if (supportsTransaction) {
						expect(finalCount).toBe(10);
					} else {
						// 没有事务保护，最终值可能小于 10（丢失更新）
						console.log(`[${name}] 读-修改-写 竞态结果: 期望 10, 实际 ${finalCount}`);
						// 这里不断言，只是记录行为
					}
				}
			});
		});

		// ============ 场景 3: 高频写入性能 ============
		describe("场景 3: 高频写入性能", () => {
			it("高频写入 - 100 次连续写入", async () => {
				const startTime = performance.now();

				for (let i = 0; i < 100; i++) {
					const data = JSON.stringify({ index: i, timestamp: Date.now() });
					if (isAsync) {
						await adapter.setItem("high-freq", data);
					} else {
						adapter.setItem("high-freq", data);
					}
				}

				const elapsed = performance.now() - startTime;
				console.log(`[${name}] 100 次写入耗时: ${elapsed.toFixed(2)}ms`);

				// 验证最终数据正确
				const finalData = isAsync
					? await adapter.getItem("high-freq")
					: (adapter.getItem("high-freq") as string);
				expect(JSON.parse(finalData!).index).toBe(99);
			});

			it("高频写入 - 无防抖 vs 有防抖对比", async () => {
				// 这个测试用于展示 debounce 的价值
				const writeCount = { without: 0 };

				// 创建一个追踪写入次数的包装器
				const trackedAdapter = createTrackedAdapter(adapter);

				// 模拟快速输入场景（如用户打字）
				const text = "hello world";
				for (let i = 0; i < text.length; i++) {
					const partial = text.slice(0, i + 1);
					if (isAsync) {
						await trackedAdapter.setItem("input", partial);
					} else {
						trackedAdapter.setItem("input", partial);
					}
				}

				writeCount.without = trackedAdapter.writeCount;

				console.log(`[${name}] 无防抖写入次数: ${writeCount.without}`);
				console.log(`[${name}] 建议: 使用 withDebounce 可将写入次数减少到 1-2 次`);
			});
		});

		// ============ 场景 4: 数据完整性 ============
		describe("场景 4: 数据完整性", () => {
			it("应该正确处理 Unicode 和特殊字符", async () => {
				const specialData = JSON.stringify({
					name: "钱包 🔐",
					description: 'Test "quotes" and \n newlines',
					emoji: "🎉🚀💰",
				});

				if (isAsync) {
					await adapter.setItem("special", specialData);
					expect(await adapter.getItem("special")).toBe(specialData);
				} else {
					adapter.setItem("special", specialData);
					expect(adapter.getItem("special")).toBe(specialData);
				}
			});

			it("应该正确处理大数据", async () => {
				// 模拟大量钱包数据
				const largeData = JSON.stringify({
					wallets: Array.from({ length: 100 }, (_, i) => ({
						id: `wallet-${i}`,
						name: `Wallet ${i}`,
						accounts: Array.from({ length: 10 }, (_, j) => ({
							id: `account-${i}-${j}`,
							address: `0x${"a".repeat(40)}`,
							balance: "1000000000000000000",
						})),
					})),
				});

				if (isAsync) {
					await adapter.setItem("large", largeData);
					expect(await adapter.getItem("large")).toBe(largeData);
				} else {
					adapter.setItem("large", largeData);
					expect(adapter.getItem("large")).toBe(largeData);
				}

				console.log(`[${name}] 大数据大小: ${(largeData.length / 1024).toFixed(2)}KB`);
			});
		});

		// ============ 场景 5: 原子性（崩溃恢复）============
		if (canSimulateCrash && createCrashableAdapter) {
			describe("场景 5: 原子性（崩溃恢复）", () => {
				it("写入过程中崩溃 - 数据应该保持一致", async () => {
					const crashableAdapter = await createCrashableAdapter();

					// 先写入初始数据
					if (isAsync) {
						await crashableAdapter.setItem("atomic-test", "initial-value");
					} else {
						crashableAdapter.setItem("atomic-test", "initial-value");
					}

					// 模拟崩溃
					crashableAdapter.simulateCrashOnNextWrite();

					// 尝试写入新数据（会崩溃）
					try {
						if (isAsync) {
							await crashableAdapter.setItem("atomic-test", "new-value");
						} else {
							crashableAdapter.setItem("atomic-test", "new-value");
						}
					} catch {
						// 预期崩溃
					}

					// 重置崩溃状态
					crashableAdapter.resetCrashState();

					// 读取数据 - 应该是初始值或新值，不应该是损坏的
					const result = isAsync
						? await crashableAdapter.getItem("atomic-test")
						: crashableAdapter.getItem("atomic-test");

					if (supportsAtomicWrite) {
						// 支持原子写入的存储应该保持初始值
						expect(result).toBe("initial-value");
						console.log(`[${name}] ✅ 崩溃后数据保持一致`);
					} else {
						// 不支持原子写入的可能损坏
						console.log(`[${name}] ⚠️ 崩溃后数据状态: ${result}`);
					}
				});
			});
		}

		// ============ 场景 6: 安全性总结 ============
		describe("安全性总结", () => {
			it("打印存储方案安全性报告", () => {
				console.log("\n" + "=".repeat(60));
				console.log(`📊 ${name} 存储安全性报告`);
				console.log("=".repeat(60));
				console.log(`单操作原子性: ${supportsAtomicWrite ? "✅ 支持" : "❌ 不支持"}`);
				console.log(`跨操作事务:   ${supportsTransaction ? "✅ 支持" : "❌ 不支持"}`);
				console.log(`内置数据校验: ${hasBuiltinChecksum ? "✅ 有" : "❌ 无"}`);
				console.log("=".repeat(60));

				if (supportsAtomicWrite && !supportsTransaction) {
					console.log("💡 建议: 对于 zustand persist 场景（单 key 写入），安全性足够");
					console.log("💡 建议: 添加 withDebounce 优化高频写入性能");
				}

				if (!supportsAtomicWrite) {
					console.log("⚠️ 警告: 建议使用 withAtomic 增强器提供原子性保护");
					console.log("⚠️ 警告: 建议使用 withChecksum 增强器提供数据校验");
				}

				console.log("=".repeat(60) + "\n");
			});
		});
	});
}

// ============ 辅助工具 ============

/**
 * 创建追踪写入次数的适配器包装器
 */
function createTrackedAdapter(base: StorageAdapter) {
	let writeCount = 0;

	return {
		getItem: (key: string) => base.getItem(key),
		setItem: (key: string, value: string) => {
			writeCount++;
			return base.setItem(key, value);
		},
		removeItem: (key: string) => base.removeItem(key),
		get writeCount() {
			return writeCount;
		},
		resetCount() {
			writeCount = 0;
		},
	};
}

/**
 * 创建可崩溃的内存适配器（用于测试原子性）
 */
export function createCrashableMemoryAdapter(): CrashableStorageAdapter {
	const storage = new Map<string, string>();
	let shouldCrash = false;

	return {
		getItem: (key: string) => storage.get(key) ?? null,

		setItem: (key: string, value: string) => {
			if (shouldCrash) {
				// 模拟部分写入（写入过程中崩溃）
				storage.set(key, value.slice(0, Math.floor(value.length / 2)));
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

		resetCrashState: () => {
			shouldCrash = false;
		},

		getRawData: () => new Map(storage),
	};
}

/**
 * 创建异步可崩溃适配器
 */
export function createAsyncCrashableMemoryAdapter(
	delay = 10,
): CrashableStorageAdapter & { _storage: Map<string, string> } {
	const storage = new Map<string, string>();
	let shouldCrash = false;

	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	return {
		_storage: storage,

		getItem: async (key: string) => {
			await sleep(delay);
			return storage.get(key) ?? null;
		},

		setItem: async (key: string, value: string) => {
			await sleep(delay / 2);
			if (shouldCrash) {
				// 模拟部分写入
				storage.set(key, value.slice(0, Math.floor(value.length / 2)));
				throw new Error("Simulated crash during write");
			}
			await sleep(delay / 2);
			storage.set(key, value);
		},

		removeItem: async (key: string) => {
			await sleep(delay);
			storage.delete(key);
		},

		simulateCrashOnNextWrite: () => {
			shouldCrash = true;
		},

		resetCrashState: () => {
			shouldCrash = false;
		},

		getRawData: () => new Map(storage),
	};
}

// ============ 预定义的测试配置 ============

/**
 * localStorage 测试配置
 * - 单操作原子性：❌ 无（可能被中断）
 * - 跨操作事务：❌ 无
 * - 内置校验：❌ 无
 */
export const localStorageTestConfig: Omit<StorageSafetyTestConfig, "createAdapter"> = {
	name: "localStorage",
	isAsync: false,
	supportsAtomicWrite: false,
	supportsTransaction: false,
	hasBuiltinChecksum: false,
	canSimulateCrash: true,
};

/**
 * MMKV 测试配置
 * - 单操作原子性：✅ 有（append-only + CRC）
 * - 跨操作事务：❌ 无
 * - 内置校验：✅ CRC32
 */
export const mmkvTestConfig: Omit<StorageSafetyTestConfig, "createAdapter"> = {
	name: "MMKV",
	isAsync: false,
	supportsAtomicWrite: true,
	supportsTransaction: false,
	hasBuiltinChecksum: true,
	canSimulateCrash: false, // MMKV 真实环境难以模拟崩溃
};

/**
 * IndexedDB 测试配置
 * - 单操作原子性：✅ 有（事务）
 * - 跨操作事务：✅ 有
 * - 内置校验：✅ 数据库级别
 */
export const indexedDBTestConfig: Omit<StorageSafetyTestConfig, "createAdapter"> = {
	name: "IndexedDB",
	isAsync: true,
	supportsAtomicWrite: true,
	supportsTransaction: true,
	hasBuiltinChecksum: true,
	canSimulateCrash: false,
};

/**
 * SQLite 测试配置
 * - 单操作原子性：✅ 有（事务）
 * - 跨操作事务：✅ 有
 * - 内置校验：✅ 页级校验和
 */
export const sqliteTestConfig: Omit<StorageSafetyTestConfig, "createAdapter"> = {
	name: "SQLite",
	isAsync: true,
	supportsAtomicWrite: true,
	supportsTransaction: true,
	hasBuiltinChecksum: true,
	canSimulateCrash: false,
};

/**
 * AsyncStorage (React Native) 测试配置
 * - 单操作原子性：⚠️ 部分（依赖底层实现）
 * - 跨操作事务：❌ 无
 * - 内置校验：❌ 无
 */
export const asyncStorageTestConfig: Omit<StorageSafetyTestConfig, "createAdapter"> = {
	name: "AsyncStorage",
	isAsync: true,
	supportsAtomicWrite: false,
	supportsTransaction: false,
	hasBuiltinChecksum: false,
	canSimulateCrash: true,
};

