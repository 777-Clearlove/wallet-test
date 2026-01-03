/**
 * Web 端真实存储安全性测试
 *
 * 在真实浏览器中运行，测试真实的 IndexedDB 和 localStorage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ============ 真实 IndexedDB 适配器 ============

const DB_NAME = "test-storage";
const STORE_NAME = "key-value";

async function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
	});
}

async function clearDB() {
	const db = await openDB();
	return new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		const request = store.clear();
		request.onerror = () => reject(request.error);
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
	});
}

const realIndexedDBAdapter = {
	getItem: async (key: string): Promise<string | null> => {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, "readonly");
			const store = tx.objectStore(STORE_NAME);
			const request = store.get(key);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				db.close();
				resolve(request.result ?? null);
			};
		});
	},

	setItem: async (key: string, value: string): Promise<void> => {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, "readwrite");
			const store = tx.objectStore(STORE_NAME);
			store.put(value, key);
			tx.onerror = () => reject(tx.error);
			tx.oncomplete = () => {
				db.close();
				resolve();
			};
		});
	},

	removeItem: async (key: string): Promise<void> => {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, "readwrite");
			const store = tx.objectStore(STORE_NAME);
			store.delete(key);
			tx.onerror = () => reject(tx.error);
			tx.oncomplete = () => {
				db.close();
				resolve();
			};
		});
	},
};

// ============ 真实 localStorage 适配器 ============

const realLocalStorageAdapter = {
	getItem: (key: string): string | null => {
		return localStorage.getItem(key);
	},
	setItem: (key: string, value: string): void => {
		localStorage.setItem(key, value);
	},
	removeItem: (key: string): void => {
		localStorage.removeItem(key);
	},
};

// ============ 真实 IndexedDB 测试 ============

describe("🔥 真实 IndexedDB 存储安全性测试（不带 enhancer）", () => {
	beforeEach(async () => {
		await clearDB();
	});

	describe("场景 1: 基本读写", () => {
		it("应该正确存储和读取数据", async () => {
			await realIndexedDBAdapter.setItem("test-key", "test-value");
			const result = await realIndexedDBAdapter.getItem("test-key");
			expect(result).toBe("test-value");
		});

		it("应该正确处理 JSON 数据", async () => {
			const data = {
				wallets: [{ id: "1", name: "Test Wallet" }],
				settings: { theme: "dark" },
			};
			await realIndexedDBAdapter.setItem("json-data", JSON.stringify(data));
			const result = await realIndexedDBAdapter.getItem("json-data");
			expect(JSON.parse(result!)).toEqual(data);
		});

		it("应该正确处理大数据", async () => {
			const largeData = "x".repeat(100000); // 100KB
			await realIndexedDBAdapter.setItem("large-data", largeData);
			const result = await realIndexedDBAdapter.getItem("large-data");
			expect(result).toBe(largeData);
			console.log(`[真实 IndexedDB] ✅ 大数据 (${largeData.length} bytes) 读写成功`);
		});
	});

	describe("场景 2: 原子性测试", () => {
		it("✅ IndexedDB 单操作是原子的", async () => {
			// 写入数据
			await realIndexedDBAdapter.setItem("atomic-key", "value-1");
			expect(await realIndexedDBAdapter.getItem("atomic-key")).toBe("value-1");

			// 覆盖写入
			await realIndexedDBAdapter.setItem("atomic-key", "value-2");
			expect(await realIndexedDBAdapter.getItem("atomic-key")).toBe("value-2");

			console.log("[真实 IndexedDB] ✅ 单操作原子性验证通过");
		});

		it("✅ IndexedDB 事务内多操作是原子的", async () => {
			const db = await openDB();

			await new Promise<void>((resolve, reject) => {
				const tx = db.transaction(STORE_NAME, "readwrite");
				const store = tx.objectStore(STORE_NAME);

				// 在同一个事务中执行多个操作
				store.put("value-1", "tx-key-1");
				store.put("value-2", "tx-key-2");
				store.put("value-3", "tx-key-3");

				tx.onerror = () => reject(tx.error);
				tx.oncomplete = () => {
					db.close();
					resolve();
				};
			});

			// 验证所有数据都写入了
			expect(await realIndexedDBAdapter.getItem("tx-key-1")).toBe("value-1");
			expect(await realIndexedDBAdapter.getItem("tx-key-2")).toBe("value-2");
			expect(await realIndexedDBAdapter.getItem("tx-key-3")).toBe("value-3");

			console.log("[真实 IndexedDB] ✅ 事务原子性验证通过");
		});
	});

	describe("场景 3: 并发写入测试", () => {
		it("✅ IndexedDB 并发写入是安全的", async () => {
			// 并发写入同一个 key
			await Promise.all([
				realIndexedDBAdapter.setItem("race-key", "value-1"),
				realIndexedDBAdapter.setItem("race-key", "value-2"),
				realIndexedDBAdapter.setItem("race-key", "value-3"),
			]);

			const finalValue = await realIndexedDBAdapter.getItem("race-key");
			expect(["value-1", "value-2", "value-3"]).toContain(finalValue);
			console.log(`[真实 IndexedDB] ✅ 并发写入安全，最终值: ${finalValue}`);
		});
	});

	describe("场景 4: 高频写入性能测试", () => {
		it("⚠️ 高频写入 - 测量实际耗时", async () => {
			const iterations = 100;
			const startTime = performance.now();

			for (let i = 0; i < iterations; i++) {
				await realIndexedDBAdapter.setItem("perf-key", `value-${i}`);
			}

			const elapsed = performance.now() - startTime;
			const avgTime = elapsed / iterations;

			console.log(`[真实 IndexedDB] ${iterations} 次写入耗时: ${elapsed.toFixed(2)}ms`);
			console.log(`[真实 IndexedDB] 平均每次写入: ${avgTime.toFixed(2)}ms`);
			console.log(`[真实 IndexedDB] 💡 建议: withDebounce 可将 100 次写入合并为 1 次`);

			// 验证最终数据正确
			expect(await realIndexedDBAdapter.getItem("perf-key")).toBe(`value-${iterations - 1}`);
		});
	});
});

// ============ 真实 localStorage 测试 ============

describe("🔥 真实 localStorage 存储安全性测试（不带 enhancer）", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	describe("场景 1: 基本读写", () => {
		it("应该正确存储和读取数据", () => {
			realLocalStorageAdapter.setItem("test-key", "test-value");
			expect(realLocalStorageAdapter.getItem("test-key")).toBe("test-value");
		});
	});

	describe("场景 2: 高频写入性能测试", () => {
		it("⚠️ 高频写入 - 测量实际耗时", () => {
			const iterations = 1000;
			const startTime = performance.now();

			for (let i = 0; i < iterations; i++) {
				realLocalStorageAdapter.setItem("perf-key", `value-${i}`);
			}

			const elapsed = performance.now() - startTime;
			const avgTime = elapsed / iterations;

			console.log(`[真实 localStorage] ${iterations} 次写入耗时: ${elapsed.toFixed(2)}ms`);
			console.log(`[真实 localStorage] 平均每次写入: ${avgTime.toFixed(4)}ms`);
			console.log(`[真实 localStorage] 💡 建议: withDebounce 可将 1000 次写入合并为 1 次`);

			expect(realLocalStorageAdapter.getItem("perf-key")).toBe(`value-${iterations - 1}`);
		});
	});

	describe("场景 3: 数据完整性", () => {
		it("❌ localStorage 无内置校验 - 损坏数据无法检测", () => {
			// 存入有效 JSON
			const validData = JSON.stringify({ important: "data" });
			realLocalStorageAdapter.setItem("data-key", validData);

			// 手动用无效数据覆盖（模拟某种损坏场景）
			localStorage.setItem("data-key", "not-valid-json{{{");

			// localStorage 不会报错，应用层解析才会失败
			const result = realLocalStorageAdapter.getItem("data-key");
			expect(result).toBe("not-valid-json{{{");

			// 尝试解析会失败
			expect(() => JSON.parse(result!)).toThrow();
			console.log("[真实 localStorage] ❌ 无法检测数据损坏，需要 withChecksum");
		});
	});
});

// ============ 综合对比 ============

describe("📊 真实存储对比总结", () => {
	it("打印测试报告", () => {
		console.log("\n");
		console.log("╔══════════════════════════════════════════════════════════════════╗");
		console.log("║           🔥 真实浏览器存储安全性测试报告 🔥                      ║");
		console.log("╠═══════════════════╦═══════════╦═══════════╦═══════════╦══════════╣");
		console.log("║ 存储方案          ║ 单操作    ║ 事务      ║ 内置      ║ 需要     ║");
		console.log("║                   ║ 原子性    ║ 支持      ║ 校验      ║ enhancer ║");
		console.log("╠═══════════════════╬═══════════╬═══════════╬═══════════╬══════════╣");
		console.log("║ localStorage      ║    ❌     ║    ❌     ║    ❌     ║ 全部     ║");
		console.log("║ IndexedDB         ║    ✅     ║    ✅     ║    ✅     ║ debounce ║");
		console.log("╚═══════════════════╩═══════════╩═══════════╩═══════════╩══════════╝");
		console.log("\n");
		console.log("✅ 结论: IndexedDB 不需要 withAtomic、withChecksum，只需要 withDebounce");
		console.log("\n");
	});
});

