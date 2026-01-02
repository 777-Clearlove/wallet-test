/**
 * 真实 localStorage 测试
 * 使用 happy-dom 环境提供的真实 localStorage API
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultLocalStorageAdapter } from "../../storage/adapter";
import {
	createSafeStorage,
	withAtomic,
	withChecksum,
	withDebounce,
	withQueue,
} from "../../storage/enhancers";
import type { StorageAdapter } from "../../storage/adapter";

describe("真实 localStorage 测试", () => {
	beforeEach(() => {
		// 清理 localStorage
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	describe("defaultLocalStorageAdapter", () => {
		it("应该正确存储和读取数据到真实 localStorage", () => {
			defaultLocalStorageAdapter.setItem("test-key", "test-value");

			// 验证适配器返回值
			expect(defaultLocalStorageAdapter.getItem("test-key")).toBe("test-value");

			// 验证真实 localStorage 也有数据
			expect(localStorage.getItem("test-key")).toBe("test-value");
		});

		it("应该正确删除数据", () => {
			localStorage.setItem("to-delete", "value");

			defaultLocalStorageAdapter.removeItem("to-delete");

			expect(localStorage.getItem("to-delete")).toBeNull();
			expect(defaultLocalStorageAdapter.getItem("to-delete")).toBeNull();
		});

		it("应该能读取已存在的 localStorage 数据", () => {
			// 直接写入 localStorage
			localStorage.setItem("existing-key", "existing-value");

			// 通过适配器读取
			expect(defaultLocalStorageAdapter.getItem("existing-key")).toBe("existing-value");
		});
	});

	describe("withAtomic + 真实 localStorage", () => {
		it("应该创建备份文件", () => {
			const atomicAdapter = withAtomic(defaultLocalStorageAdapter);

			atomicAdapter.setItem("data", "version1");
			atomicAdapter.setItem("data", "version2");

			// 检查备份
			expect(localStorage.getItem("data.bak")).toBe("version1");
			expect(localStorage.getItem("data")).toBe("version2");
		});

		it("应该清理临时文件", () => {
			const atomicAdapter = withAtomic(defaultLocalStorageAdapter);

			atomicAdapter.setItem("data", "value");

			// 临时文件应该被清理
			expect(localStorage.getItem("data.tmp")).toBeNull();
		});

		it("主数据丢失时应该从备份恢复", () => {
			const atomicAdapter = withAtomic(defaultLocalStorageAdapter);

			atomicAdapter.setItem("data", "original");
			atomicAdapter.setItem("data", "updated");

			// 模拟主数据丢失
			localStorage.removeItem("data");

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { /* noop */ });
			const recovered = atomicAdapter.getItem("data");

			expect(recovered).toBe("original");
			warnSpy.mockRestore();
		});
	});

	describe("withChecksum + 真实 localStorage", () => {
		it("应该存储带校验和的数据", () => {
			const checksumAdapter = withChecksum(defaultLocalStorageAdapter);

			checksumAdapter.setItem("data", "hello");

			// 读取原始数据
			const raw = localStorage.getItem("data");
			expect(raw).not.toBe("hello");

			const parsed = JSON.parse(raw!);
			expect(parsed.d).toBe("hello");
			expect(typeof parsed.c).toBe("number");
			expect(typeof parsed.t).toBe("number");

			// 通过适配器读取应该返回原始值
			expect(checksumAdapter.getItem("data")).toBe("hello");
		});

		it("手动损坏数据后应该返回 null", () => {
			const checksumAdapter = withChecksum(defaultLocalStorageAdapter);

			checksumAdapter.setItem("data", "original");

			// 手动损坏数据
			const raw = localStorage.getItem("data");
			const parsed = JSON.parse(raw!);
			parsed.d = "tampered";
			localStorage.setItem("data", JSON.stringify(parsed));

			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { /* noop */ });
			expect(checksumAdapter.getItem("data")).toBeNull();
			errorSpy.mockRestore();
		});
	});

	describe("createSafeStorage + 真实 localStorage", () => {
		it("应该完整工作（Atomic + Checksum + Queue）", async () => {
			const safeAdapter = createSafeStorage(defaultLocalStorageAdapter);

			await safeAdapter.setItem("wallet", JSON.stringify({ vaults: [] }));

			const result = await safeAdapter.getItem("wallet");
			expect(JSON.parse(result!)).toEqual({ vaults: [] });

			// 验证存储了包含校验和的数据
			const raw = localStorage.getItem("wallet");
			expect(raw).toContain('"c"');
			expect(raw).toContain('"d"');
		});

		it("应该在数据损坏时从备份恢复", async () => {
			const safeAdapter = createSafeStorage(defaultLocalStorageAdapter);

			await safeAdapter.setItem("data", "v1");
			await safeAdapter.setItem("data", "v2");

			// 删除主数据
			localStorage.removeItem("data");

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { /* noop */ });
			const result = await safeAdapter.getItem("data");

			expect(result).toBe("v1");
			warnSpy.mockRestore();
		});

		it("应该顺序处理写入", async () => {
			const safeAdapter = createSafeStorage(defaultLocalStorageAdapter);

			// 顺序写入（同步适配器不应该并发调用 withAtomic）
			await safeAdapter.setItem("counter", "1");
			await safeAdapter.setItem("counter", "2");
			await safeAdapter.setItem("counter", "3");

			const result = await safeAdapter.getItem("counter");
			expect(result).toBe("3");
		});
	});

	describe("跨适配器数据兼容性", () => {
		it("checksum 适配器不应该读取非 checksum 数据", () => {
			// 直接存储普通数据
			localStorage.setItem("plain", "plain-value");

			const checksumAdapter = withChecksum(defaultLocalStorageAdapter);

			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { /* noop */ });
			// checksum 适配器无法解析普通数据
			expect(checksumAdapter.getItem("plain")).toBeNull();
			errorSpy.mockRestore();
		});

		it("普通适配器可以读取任何数据（包括 checksum 包装的）", () => {
			const checksumAdapter = withChecksum(defaultLocalStorageAdapter);
			checksumAdapter.setItem("wrapped", "value");

			// 普通适配器读取到的是包装后的 JSON
			const raw = defaultLocalStorageAdapter.getItem("wrapped");
			expect(raw).toContain('"d":"value"');
		});
	});

	describe("localStorage 限制测试", () => {
		it("应该正确处理大量数据", async () => {
			const safeAdapter = createSafeStorage(defaultLocalStorageAdapter);

			// 创建约 100KB 的数据
			const largeData = "x".repeat(100000);
			await safeAdapter.setItem("large", largeData);

			const result = await safeAdapter.getItem("large");
			expect(result).toBe(largeData);
		});

		it("应该正确处理 Unicode 数据", async () => {
			const safeAdapter = createSafeStorage(defaultLocalStorageAdapter);

			const unicodeData = "你好世界 🌍 مرحبا العالم 🚀";
			await safeAdapter.setItem("unicode", unicodeData);

			const result = await safeAdapter.getItem("unicode");
			expect(result).toBe(unicodeData);
		});

		it("应该正确处理特殊 JSON 字符", async () => {
			const safeAdapter = createSafeStorage(defaultLocalStorageAdapter);

			const jsonData = JSON.stringify({
				quote: 'He said "Hello"',
				newline: "Line1\nLine2",
				tab: "Col1\tCol2",
				backslash: "path\\to\\file",
			});

			await safeAdapter.setItem("special", jsonData);

			const result = await safeAdapter.getItem("special");
			expect(result).toBe(jsonData);
		});
	});
});

describe("基于 localStorage 的异步适配器模拟", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	/**
	 * 创建基于真实 localStorage 的异步适配器
	 * 模拟 React Native AsyncStorage 的行为
	 */
	function createAsyncLocalStorageAdapter(delay = 10): StorageAdapter {
		return {
			getItem: async (key: string) => {
				await new Promise((resolve) => setTimeout(resolve, delay));
				return localStorage.getItem(key);
			},
			setItem: async (key: string, value: string) => {
				await new Promise((resolve) => setTimeout(resolve, delay));
				localStorage.setItem(key, value);
			},
			removeItem: async (key: string) => {
				await new Promise((resolve) => setTimeout(resolve, delay));
				localStorage.removeItem(key);
			},
		};
	}

	it("异步适配器应该正确读写真实 localStorage", async () => {
		const asyncAdapter = createAsyncLocalStorageAdapter(5);

		await asyncAdapter.setItem("async-key", "async-value");

		// 验证真实 localStorage
		expect(localStorage.getItem("async-key")).toBe("async-value");

		// 验证异步读取
		const result = await asyncAdapter.getItem("async-key");
		expect(result).toBe("async-value");
	});

	it("createSafeStorage + atomic: false 应该正确处理异步适配器", async () => {
		const asyncAdapter = createAsyncLocalStorageAdapter(5);
		// 异步适配器使用 createSafeStorage 配置
		const safeAdapter = createSafeStorage(asyncAdapter, { atomic: false });

		await safeAdapter.setItem("data", "value");

		// 验证读取
		const result = await safeAdapter.getItem("data");
		expect(result).toBe("value");
	});

	it("异步适配器并发写入应该被序列化", async () => {
		const asyncAdapter = createAsyncLocalStorageAdapter(10);
		const safeAdapter = createSafeStorage(asyncAdapter, { atomic: false });

		// 并发写入
		await Promise.all([
			safeAdapter.setItem("key", "1"),
			safeAdapter.setItem("key", "2"),
			safeAdapter.setItem("key", "3"),
		]);

		const result = await safeAdapter.getItem("key");
		expect(result).toBe("3");
	});

	it("withChecksum + 异步 localStorage 适配器", async () => {
		const asyncAdapter = createAsyncLocalStorageAdapter(5);
		const checksumAdapter = withChecksum(asyncAdapter);

		await checksumAdapter.setItem("data", "value");

		// 验证真实 localStorage 中的数据格式
		const raw = localStorage.getItem("data");
		expect(raw).toContain('"c"');

		// 验证读取
		const result = await checksumAdapter.getItem("data");
		expect(result).toBe("value");
	});
});

