/**
 * Storage Adapter 单元测试
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultLocalStorageAdapter, type StorageAdapter } from "../../storage/adapter";
import { createMemoryStorageAdapter, createAsyncMemoryStorageAdapter } from "../test-utils";

describe("StorageAdapter 接口", () => {
	describe("createMemoryStorageAdapter（同步内存适配器）", () => {
		let adapter: StorageAdapter;

		beforeEach(() => {
			adapter = createMemoryStorageAdapter();
		});

		it("应该正确存储和读取数据", () => {
			adapter.setItem("test-key", "test-value");
			expect(adapter.getItem("test-key")).toBe("test-value");
		});

		it("读取不存在的 key 应该返回 null", () => {
			expect(adapter.getItem("non-existent")).toBeNull();
		});

		it("应该正确删除数据", () => {
			adapter.setItem("test-key", "test-value");
			adapter.removeItem("test-key");
			expect(adapter.getItem("test-key")).toBeNull();
		});

		it("应该正确覆盖已有的值", () => {
			adapter.setItem("key", "value1");
			adapter.setItem("key", "value2");
			expect(adapter.getItem("key")).toBe("value2");
		});

		it("应该支持存储 JSON 字符串", () => {
			const data = { vaults: [{ id: "1", name: "test" }] };
			adapter.setItem("data", JSON.stringify(data));
			expect(JSON.parse(adapter.getItem("data")!)).toEqual(data);
		});

		it("应该支持存储空字符串", () => {
			adapter.setItem("empty", "");
			expect(adapter.getItem("empty")).toBe("");
		});

		it("不同的 key 应该互不影响", () => {
			adapter.setItem("key1", "value1");
			adapter.setItem("key2", "value2");
			expect(adapter.getItem("key1")).toBe("value1");
			expect(adapter.getItem("key2")).toBe("value2");
		});
	});

	describe("createAsyncMemoryStorageAdapter（异步内存适配器）", () => {
		it("应该异步存储和读取数据", async () => {
			const adapter = createAsyncMemoryStorageAdapter(5);

			await adapter.setItem("async-key", "async-value");
			const result = await adapter.getItem("async-key");

			expect(result).toBe("async-value");
		});

		it("异步读取不存在的 key 应该返回 null", async () => {
			const adapter = createAsyncMemoryStorageAdapter(5);
			const result = await adapter.getItem("non-existent");
			expect(result).toBeNull();
		});

		it("应该正确异步删除数据", async () => {
			const adapter = createAsyncMemoryStorageAdapter(5);

			await adapter.setItem("key", "value");
			await adapter.removeItem("key");
			const result = await adapter.getItem("key");

			expect(result).toBeNull();
		});

		it("应该存在延迟", async () => {
			const adapter = createAsyncMemoryStorageAdapter(50);

			const start = Date.now();
			await adapter.setItem("key", "value");
			const elapsed = Date.now() - start;

			expect(elapsed).toBeGreaterThanOrEqual(40); // 允许一些误差
		});

		it("getItem 返回值应该是 Promise", () => {
			const adapter = createAsyncMemoryStorageAdapter(5);
			const result = adapter.getItem("key");
			expect(result).toBeInstanceOf(Promise);
		});

		it("setItem 返回值应该是 Promise", () => {
			const adapter = createAsyncMemoryStorageAdapter(5);
			const result = adapter.setItem("key", "value");
			expect(result).toBeInstanceOf(Promise);
		});

		it("removeItem 返回值应该是 Promise", () => {
			const adapter = createAsyncMemoryStorageAdapter(5);
			const result = adapter.removeItem("key");
			expect(result).toBeInstanceOf(Promise);
		});
	});
});

describe("defaultLocalStorageAdapter", () => {
	const originalWindow = global.window;
	const originalLocalStorage = global.localStorage;

	beforeEach(() => {
		// 模拟 localStorage
		const storage = new Map<string, string>();
		global.localStorage = {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
			removeItem: (key: string) => storage.delete(key),
			clear: () => storage.clear(),
			key: (index: number) => Array.from(storage.keys())[index] ?? null,
			get length() {
				return storage.size;
			},
		};
		global.window = { localStorage: global.localStorage } as Window & typeof globalThis;
	});

	afterEach(() => {
		global.window = originalWindow;
		global.localStorage = originalLocalStorage;
	});

	it("应该正确存储和读取数据", () => {
		defaultLocalStorageAdapter.setItem("test", "value");
		expect(defaultLocalStorageAdapter.getItem("test")).toBe("value");
	});

	it("应该正确删除数据", () => {
		defaultLocalStorageAdapter.setItem("test", "value");
		defaultLocalStorageAdapter.removeItem("test");
		expect(defaultLocalStorageAdapter.getItem("test")).toBeNull();
	});

	describe("SSR 环境（无 window）", () => {
		beforeEach(() => {
			// @ts-ignore
			delete global.window;
		});

		it("getItem 在无 window 时应该返回 null 并警告", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			const result = defaultLocalStorageAdapter.getItem("key");

			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalledWith(
				"localStorage not available, using in-memory storage",
			);

			warnSpy.mockRestore();
		});

		it("setItem 在无 window 时应该不抛错并警告", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			expect(() => {
				defaultLocalStorageAdapter.setItem("key", "value");
			}).not.toThrow();

			expect(warnSpy).toHaveBeenCalledWith(
				"localStorage not available, skipping setItem",
			);

			warnSpy.mockRestore();
		});

		it("removeItem 在无 window 时应该不抛错并警告", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			expect(() => {
				defaultLocalStorageAdapter.removeItem("key");
			}).not.toThrow();

			expect(warnSpy).toHaveBeenCalledWith(
				"localStorage not available, skipping removeItem",
			);

			warnSpy.mockRestore();
		});
	});

	describe("无 localStorage 的 window", () => {
		beforeEach(() => {
			global.window = {} as Window & typeof globalThis;
		});

		it("getItem 应该返回 null", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const result = defaultLocalStorageAdapter.getItem("key");
			expect(result).toBeNull();
			warnSpy.mockRestore();
		});
	});
});

describe("StorageAdapter 类型兼容性", () => {
	it("同步适配器应该符合接口", () => {
		const adapter: StorageAdapter = {
			getItem: (_key: string) => null,
			setItem: (_key: string, _value: string) => {},
			removeItem: (_key: string) => {},
		};

		expect(adapter).toBeDefined();
	});

	it("异步适配器应该符合接口", () => {
		const adapter: StorageAdapter = {
			getItem: async (_key: string) => null,
			setItem: async (_key: string, _value: string) => {},
			removeItem: async (_key: string) => {},
		};

		expect(adapter).toBeDefined();
	});

	it("混合适配器（部分异步）应该符合接口", () => {
		const adapter: StorageAdapter = {
			getItem: async (_key: string) => null,
			setItem: (_key: string, _value: string) => {}, // 同步
			removeItem: async (_key: string) => {},
		};

		expect(adapter).toBeDefined();
	});
});

