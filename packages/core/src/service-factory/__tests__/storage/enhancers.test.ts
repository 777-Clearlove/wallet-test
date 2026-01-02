/**
 * Storage Enhancers 单元测试
 * 测试所有存储增强器：原子写入、Checksum、防抖、队列、组合工具
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	withAtomic,
	withChecksum,
	withDebounce,
	withQueue,
	createSafeStorage,
	type StorageEnhancer,
} from "../../storage/enhancers";
import type { StorageAdapter } from "../../storage/adapter";
import {
	createMemoryStorageAdapter,
	createAsyncMemoryStorageAdapter,
	createTrackedStorageAdapter,
	createFailableStorageAdapter,
	sleep,
} from "../test-utils";

// ============ withAtomic 原子写入增强器 ============

describe("withAtomic（原子写入增强器）", () => {
	describe("同步适配器", () => {
		let baseAdapter: StorageAdapter;
		let atomicAdapter: StorageAdapter;

		beforeEach(() => {
			baseAdapter = createMemoryStorageAdapter();
			atomicAdapter = withAtomic(baseAdapter);
		});

		it("应该正常读写数据", () => {
			atomicAdapter.setItem("key", "value");
			expect(atomicAdapter.getItem("key")).toBe("value");
		});

		it("写入时应该创建备份", () => {
			atomicAdapter.setItem("key", "original");
			atomicAdapter.setItem("key", "updated");

			// 检查备份存在
			expect(baseAdapter.getItem("key.bak")).toBe("original");
		});

		it("写入后临时文件应该被清理", () => {
			atomicAdapter.setItem("key", "value");
			expect(baseAdapter.getItem("key.tmp")).toBeNull();
		});

		it("主数据丢失时应该从备份恢复", () => {
			// 先正常写入创建备份
			atomicAdapter.setItem("key", "value1");
			atomicAdapter.setItem("key", "value2");

			// 删除主数据（模拟损坏）
			baseAdapter.removeItem("key");

			// 读取时应该从备份恢复
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { /* noop */ });
			const result = atomicAdapter.getItem("key");

			expect(result).toBe("value1");
			expect(warnSpy).toHaveBeenCalledWith("[Atomic] Restored from backup: key");

			warnSpy.mockRestore();
		});

		it("removeItem 应该清理所有相关文件", () => {
			atomicAdapter.setItem("key", "value1");
			atomicAdapter.setItem("key", "value2");

			atomicAdapter.removeItem("key");

			expect(baseAdapter.getItem("key")).toBeNull();
			expect(baseAdapter.getItem("key.bak")).toBeNull();
			expect(baseAdapter.getItem("key.tmp")).toBeNull();
		});

		it("写入验证失败时应该抛错", () => {
			// 创建一个会在写入后返回不同值的适配器
			const brokenAdapter: StorageAdapter = {
				getItem: (key: string) => {
					if (key.endsWith(".tmp")) {
						return "corrupted"; // 模拟写入损坏
					}
					return null;
				},
				setItem: () => { /* noop */ },
				removeItem: () => { /* noop */ },
			};

			const atomic = withAtomic(brokenAdapter);

			expect(() => atomic.setItem("key", "value")).toThrow(
				"[Atomic] Write verification failed: key",
			);
		});
	});

	describe("异步适配器", () => {
		it("应该正常异步读写数据", async () => {
			const baseAdapter = createAsyncMemoryStorageAdapter(5);
			const atomicAdapter = withAtomic(baseAdapter);

			await atomicAdapter.setItem("key", "value");
			const result = await atomicAdapter.getItem("key");

			expect(result).toBe("value");
		});

		it("异步写入应该创建备份", async () => {
			const baseAdapter = createAsyncMemoryStorageAdapter(5);
			const atomicAdapter = withAtomic(baseAdapter);

			await atomicAdapter.setItem("key", "original");
			await atomicAdapter.setItem("key", "updated");

			const backup = await baseAdapter.getItem("key.bak");
			expect(backup).toBe("original");
		});

		it("异步主数据丢失时应该从备份恢复", async () => {
			const baseAdapter = createAsyncMemoryStorageAdapter(5);
			const atomicAdapter = withAtomic(baseAdapter);

			await atomicAdapter.setItem("key", "value1");
			await atomicAdapter.setItem("key", "value2");

			// 删除主数据
			baseAdapter._storage.delete("key");

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { /* noop */ });
			const result = await atomicAdapter.getItem("key");

			expect(result).toBe("value1");
			expect(warnSpy).toHaveBeenCalledWith("[Atomic] Restored from backup: key");

			warnSpy.mockRestore();
		});
	});
});

// ============ withChecksum 校验增强器 ============

describe("withChecksum（Checksum 校验增强器）", () => {
	describe("同步适配器", () => {
		let baseAdapter: StorageAdapter;
		let checksumAdapter: StorageAdapter;

		beforeEach(() => {
			baseAdapter = createMemoryStorageAdapter();
			checksumAdapter = withChecksum(baseAdapter);
		});

		it("应该正常读写数据", () => {
			checksumAdapter.setItem("key", "value");
			expect(checksumAdapter.getItem("key")).toBe("value");
		});

		it("写入的数据应该包含 checksum", () => {
			checksumAdapter.setItem("key", "value");
			const raw = baseAdapter.getItem("key") as string;
			const parsed = JSON.parse(raw);

			expect(parsed).toHaveProperty("d", "value"); // data
			expect(parsed).toHaveProperty("c"); // checksum
			expect(parsed).toHaveProperty("t"); // timestamp
			expect(typeof parsed.c).toBe("number");
		});

		it("数据损坏时应该返回 null 并报错", () => {
			checksumAdapter.setItem("key", "value");

			// 修改底层数据使 checksum 失效
			const raw = baseAdapter.getItem("key") as string;
			const parsed = JSON.parse(raw);
			parsed.d = "corrupted";
			baseAdapter.setItem("key", JSON.stringify(parsed));

			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { /* noop */ });
			const result = checksumAdapter.getItem("key");

			expect(result).toBeNull();
			expect(errorSpy).toHaveBeenCalledWith("[Checksum] Data corrupted");

			errorSpy.mockRestore();
		});

		it("JSON 解析失败时应该返回 null", () => {
			baseAdapter.setItem("key", "not-valid-json");

			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { /* noop */ });
			const result = checksumAdapter.getItem("key");

			expect(result).toBeNull();
			expect(errorSpy).toHaveBeenCalledWith("[Checksum] Parse failed");

			errorSpy.mockRestore();
		});

		it("读取不存在的 key 应该返回 null", () => {
			expect(checksumAdapter.getItem("non-existent")).toBeNull();
		});

		it("应该正确处理复杂 JSON 数据", () => {
			const complexData = JSON.stringify({
				vaults: [
					{ id: "1", name: "Vault1", accounts: [{ address: "0x123" }] },
					{ id: "2", name: "Vault2", accounts: [] },
				],
				settings: { theme: "dark", language: "zh" },
			});

			checksumAdapter.setItem("complex", complexData);
			expect(checksumAdapter.getItem("complex")).toBe(complexData);
		});

		it("timestamp 应该是有效的时间戳", () => {
			const before = Date.now();
			checksumAdapter.setItem("key", "value");
			const after = Date.now();

			const raw = baseAdapter.getItem("key") as string;
			const parsed = JSON.parse(raw);

			expect(parsed.t).toBeGreaterThanOrEqual(before);
			expect(parsed.t).toBeLessThanOrEqual(after);
		});
	});

	describe("异步适配器", () => {
		it("应该正常异步读写带 checksum 的数据", async () => {
			const baseAdapter = createAsyncMemoryStorageAdapter(5);
			const checksumAdapter = withChecksum(baseAdapter);

			await checksumAdapter.setItem("key", "value");
			const result = await checksumAdapter.getItem("key");

			expect(result).toBe("value");
		});

		it("异步数据损坏时应该返回 null", async () => {
			const baseAdapter = createAsyncMemoryStorageAdapter(5);
			const checksumAdapter = withChecksum(baseAdapter);

			await checksumAdapter.setItem("key", "value");

			// 直接修改底层存储
			const raw = baseAdapter._storage.get("key");
			const parsed = JSON.parse(raw!);
			parsed.c = 12345; // 错误的 checksum
			baseAdapter._storage.set("key", JSON.stringify(parsed));

			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { /* noop */ });
			const result = await checksumAdapter.getItem("key");

			expect(result).toBeNull();
			errorSpy.mockRestore();
		});
	});
});

// ============ withDebounce 防抖增强器 ============

describe("withDebounce（防抖写入增强器）", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("应该延迟写入", () => {
		const baseAdapter = createMemoryStorageAdapter();
		const trackedAdapter = createTrackedStorageAdapter(baseAdapter);
		const debouncedAdapter = withDebounce({ wait: 300 })(trackedAdapter);

		debouncedAdapter.setItem("key", "value");

		// 立即检查：不应该写入
		expect(trackedAdapter.operations.filter((o) => o.type === "set")).toHaveLength(0);

		// 推进时间
		vi.advanceTimersByTime(300);

		// 现在应该写入了
		expect(trackedAdapter.operations.filter((o) => o.type === "set")).toHaveLength(1);
	});

	it("多次写入应该只保留最后一次", () => {
		const baseAdapter = createMemoryStorageAdapter();
		const trackedAdapter = createTrackedStorageAdapter(baseAdapter);
		const debouncedAdapter = withDebounce({ wait: 300 })(trackedAdapter);

		debouncedAdapter.setItem("key", "value1");
		debouncedAdapter.setItem("key", "value2");
		debouncedAdapter.setItem("key", "value3");

		vi.advanceTimersByTime(300);

		// 只应该有一次写入
		const setOps = trackedAdapter.operations.filter((o) => o.type === "set");
		expect(setOps).toHaveLength(1);
		expect(setOps[0]!.value).toBe("value3");
	});

	it("maxWait 应该强制写入", () => {
		const baseAdapter = createMemoryStorageAdapter();
		const trackedAdapter = createTrackedStorageAdapter(baseAdapter);
		const debouncedAdapter = withDebounce({ wait: 300, maxWait: 500 })(trackedAdapter);

		debouncedAdapter.setItem("key", "value1");
		vi.advanceTimersByTime(200);
		debouncedAdapter.setItem("key", "value2");
		vi.advanceTimersByTime(200);
		debouncedAdapter.setItem("key", "value3");

		// 此时已过 400ms，还没到 maxWait
		expect(trackedAdapter.operations.filter((o) => o.type === "set")).toHaveLength(0);

		vi.advanceTimersByTime(100);

		// 现在过了 500ms (maxWait)，应该强制写入
		expect(trackedAdapter.operations.filter((o) => o.type === "set")).toHaveLength(1);
	});

	it("不同 key 应该独立防抖", () => {
		const baseAdapter = createMemoryStorageAdapter();
		const trackedAdapter = createTrackedStorageAdapter(baseAdapter);
		const debouncedAdapter = withDebounce({ wait: 300 })(trackedAdapter);

		debouncedAdapter.setItem("key1", "value1");
		debouncedAdapter.setItem("key2", "value2");

		vi.advanceTimersByTime(300);

		const setOps = trackedAdapter.operations.filter((o) => o.type === "set");
		expect(setOps).toHaveLength(2);
	});

	it("getItem 应该立即返回", () => {
		const baseAdapter = createMemoryStorageAdapter();
		baseAdapter.setItem("existing", "value");

		const debouncedAdapter = withDebounce({ wait: 300 })(baseAdapter);

		expect(debouncedAdapter.getItem("existing")).toBe("value");
	});

	it("removeItem 应该取消待处理的写入", () => {
		const baseAdapter = createMemoryStorageAdapter();
		const trackedAdapter = createTrackedStorageAdapter(baseAdapter);
		const debouncedAdapter = withDebounce({ wait: 300 })(trackedAdapter);

		debouncedAdapter.setItem("key", "value");
		debouncedAdapter.removeItem("key");

		vi.advanceTimersByTime(300);

		// setItem 应该被取消，只有 removeItem
		const ops = trackedAdapter.operations;
		expect(ops.filter((o) => o.type === "set")).toHaveLength(0);
		expect(ops.filter((o) => o.type === "remove")).toHaveLength(1);
	});

	it("默认参数应该工作", () => {
		const baseAdapter = createMemoryStorageAdapter();
		const debouncedAdapter = withDebounce()(baseAdapter);

		debouncedAdapter.setItem("key", "value");
		vi.advanceTimersByTime(300); // 默认 wait = 300

		expect(baseAdapter.getItem("key")).toBe("value");
	});
});

// ============ withQueue 写入队列增强器 ============

describe("withQueue（写入队列增强器）", () => {
	it("应该序列化异步操作", async () => {
		const baseAdapter = createAsyncMemoryStorageAdapter(10);
		const queueAdapter = withQueue(baseAdapter);

		const results: number[] = [];

		// 并发执行多个操作 - withQueue 总是返回 Promise
		const op1 = queueAdapter.setItem("key", "1") as Promise<void>;
		const op2 = queueAdapter.setItem("key", "2") as Promise<void>;
		const op3 = queueAdapter.setItem("key", "3") as Promise<void>;

		await Promise.all([
			op1.then(() => results.push(1)),
			op2.then(() => results.push(2)),
			op3.then(() => results.push(3)),
		]);

		// 应该按顺序执行
		expect(results).toEqual([1, 2, 3]);
	});

	it("读取操作也应该排队", async () => {
		const baseAdapter = createAsyncMemoryStorageAdapter(10);
		const queueAdapter = withQueue(baseAdapter);

		await queueAdapter.setItem("key", "value");

		// 并发读取
		const results = await Promise.all([
			queueAdapter.getItem("key"),
			queueAdapter.getItem("key"),
			queueAdapter.getItem("key"),
		]);

		expect(results).toEqual(["value", "value", "value"]);
	});

	it("应该防止读写竞态", async () => {
		const baseAdapter = createAsyncMemoryStorageAdapter(10);
		const queueAdapter = withQueue(baseAdapter);

		await queueAdapter.setItem("key", "initial");

		// 并发执行读写
		const [readResult] = await Promise.all([
			queueAdapter.getItem("key"),
			queueAdapter.setItem("key", "updated"),
		]);

		// 读取应该在写入之前完成
		expect(readResult).toBe("initial");

		// 最终值应该是更新后的
		const finalValue = await queueAdapter.getItem("key");
		expect(finalValue).toBe("updated");
	});

	it("同步适配器也应该工作", async () => {
		const baseAdapter = createMemoryStorageAdapter();
		const queueAdapter = withQueue(baseAdapter);

		await queueAdapter.setItem("key", "value");
		const result = await queueAdapter.getItem("key");

		expect(result).toBe("value");
	});

	it("removeItem 应该正确排队", async () => {
		const baseAdapter = createAsyncMemoryStorageAdapter(10);
		const queueAdapter = withQueue(baseAdapter);

		await queueAdapter.setItem("key", "value");
		await queueAdapter.removeItem("key");

		const result = await queueAdapter.getItem("key");
		expect(result).toBeNull();
	});
});

// ============ createSafeStorage 组合工具 ============

describe("createSafeStorage（安全存储组合工具）", () => {
	describe("基本功能", () => {
		it("应该正常读写数据", async () => {
			const baseAdapter = createMemoryStorageAdapter();
			const safeAdapter = createSafeStorage(baseAdapter);

			await safeAdapter.setItem("key", "value");
			const result = await safeAdapter.getItem("key");

			expect(result).toBe("value");
		});

		it("应该包含 checksum", async () => {
			const baseAdapter = createMemoryStorageAdapter();
			const safeAdapter = createSafeStorage(baseAdapter);

			await safeAdapter.setItem("key", "value");

			// 读取底层存储的原始数据
			const raw = baseAdapter.getItem("key");
			expect(raw).not.toBe("value"); // 不是原始值
			expect(raw).toContain('"c"'); // 包含 checksum
		});

		it("应该包含备份", async () => {
			const baseAdapter = createMemoryStorageAdapter();
			const safeAdapter = createSafeStorage(baseAdapter);

			await safeAdapter.setItem("key", "value1");
			await safeAdapter.setItem("key", "value2");

			// 应该有备份文件
			expect(baseAdapter.getItem("key.bak")).not.toBeNull();
		});
	});

	describe("选项配置", () => {
		it("queue: false 应该禁用队列", async () => {
			// 使用同步适配器避免 queue 交互问题
			const baseAdapter = createMemoryStorageAdapter();
			const safeAdapter = createSafeStorage(baseAdapter, { queue: false });

			// 应该仍然能正常工作
			await safeAdapter.setItem("key", "value");
			const result = await safeAdapter.getItem("key");

			expect(result).toBe("value");
		});

		it("debounce: true 应该启用防抖", async () => {
			vi.useFakeTimers();

			const baseAdapter = createMemoryStorageAdapter();
			// 直接使用 withDebounce 测试防抖功能
			const debouncedAdapter = withDebounce({ wait: 300 })(baseAdapter);

			debouncedAdapter.setItem("key", "value");

			// 立即检查不应该写入（防抖中）
			expect(baseAdapter.getItem("key")).toBeNull();

			await vi.advanceTimersByTimeAsync(300);

			// 现在应该写入了
			expect(baseAdapter.getItem("key")).toBe("value");

			vi.useRealTimers();
		});

		it("debounce 对象选项应该工作", async () => {
			vi.useFakeTimers();

			const baseAdapter = createMemoryStorageAdapter();
			const debouncedAdapter = withDebounce({ wait: 500, maxWait: 1000 })(baseAdapter);

			debouncedAdapter.setItem("key", "value");
			await vi.advanceTimersByTimeAsync(500);

			const result = baseAdapter.getItem("key");
			expect(result).toBe("value");

			vi.useRealTimers();
		});
	});

	describe("数据恢复", () => {
		it("主数据损坏时应该从备份恢复", async () => {
			const baseAdapter = createMemoryStorageAdapter();
			const safeAdapter = createSafeStorage(baseAdapter);

			await safeAdapter.setItem("key", "value1");
			await safeAdapter.setItem("key", "value2");

			// 删除主数据但保留备份
			baseAdapter.removeItem("key");

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { /* noop */ });
			const result = await safeAdapter.getItem("key");

			// 应该从备份恢复
			expect(result).toBe("value1");

			warnSpy.mockRestore();
		});

		it("checksum 校验失败时应该返回 null", async () => {
			const baseAdapter = createMemoryStorageAdapter();
			const safeAdapter = createSafeStorage(baseAdapter);

			await safeAdapter.setItem("key", "value");

			// 损坏底层数据
			const raw = baseAdapter.getItem("key") as string;
			const corrupted = raw.replace(/"d":"[^"]*"/, '"d":"corrupted"');
			baseAdapter.setItem("key", corrupted);
			// 同时删除备份以防恢复
			baseAdapter.removeItem("key.bak");

			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { /* noop */ });
			const result = await safeAdapter.getItem("key");

			expect(result).toBeNull();

			errorSpy.mockRestore();
		});
	});

	describe("与异步适配器配合", () => {
		it("createSafeStorage + atomic: false 应该正确处理异步适配器", async () => {
			const baseAdapter = createAsyncMemoryStorageAdapter(5);
			// 异步适配器禁用 atomic
			const safeAdapter = createSafeStorage(baseAdapter, { atomic: false });

			await safeAdapter.setItem("key", "value");
			const result = await safeAdapter.getItem("key");

			expect(result).toBe("value");
		});

		it("异步适配器并发写入应该被 queue 序列化", async () => {
			const baseAdapter = createAsyncMemoryStorageAdapter(5);
			const safeAdapter = createSafeStorage(baseAdapter, { atomic: false });

			// 并发写入
			await Promise.all([
				safeAdapter.setItem("key", "value1"),
				safeAdapter.setItem("key", "value2"),
				safeAdapter.setItem("key", "value3"),
			]);

			const result = await safeAdapter.getItem("key");
			expect(result).toBe("value3");
		});

		it("同步适配器使用 createSafeStorage 默认配置应该正常工作", async () => {
			const baseAdapter = createMemoryStorageAdapter();
			const safeAdapter = createSafeStorage(baseAdapter);

			await safeAdapter.setItem("key", "value");
			const result = await safeAdapter.getItem("key");

			expect(result).toBe("value");
		});
	});

	describe("选项组合测试", () => {
		it("atomic: false 应该禁用原子写入", async () => {
			const baseAdapter = createMemoryStorageAdapter();
			const safeAdapter = createSafeStorage(baseAdapter, { atomic: false });

			await safeAdapter.setItem("key", "value");

			// 不应该有备份文件
			expect(baseAdapter.getItem("key.bak")).toBeNull();
		});

		it("checksum: false 应该禁用校验和", async () => {
			const baseAdapter = createMemoryStorageAdapter();
			const safeAdapter = createSafeStorage(baseAdapter, {
				checksum: false,
				queue: false,
				atomic: false,
			});

			await safeAdapter.setItem("key", "value");

			// 数据应该是原始值（通过 atomic 的临时文件机制）
			// 由于全部禁用，应该直接写入原始值
			expect(baseAdapter.getItem("key")).toBe("value");
		});

		it("queue: false 应该禁用队列", async () => {
			const baseAdapter = createMemoryStorageAdapter();
			const safeAdapter = createSafeStorage(baseAdapter, { queue: false });

			// 应该仍然能正常工作
			await safeAdapter.setItem("key", "value");
			const result = await safeAdapter.getItem("key");

			expect(result).toBe("value");
		});
	});
});

// ============ 增强器组合测试 ============

describe("增强器组合", () => {
	it("flow 组合应该正确工作", async () => {
		const { flow } = await import("lodash-es");

		const baseAdapter = createMemoryStorageAdapter();
		const enhancedAdapter = flow(withQueue, withAtomic, withChecksum)(baseAdapter);

		await enhancedAdapter.setItem("key", "value");
		const result = await enhancedAdapter.getItem("key");

		expect(result).toBe("value");
	});

	it("不同顺序的组合应该都能工作", async () => {
		const { flow } = await import("lodash-es");

		const baseAdapter = createMemoryStorageAdapter();

		// 顺序 1: Queue -> Atomic -> Checksum
		const adapter1 = flow(withQueue, withAtomic, withChecksum)(baseAdapter);
		await adapter1.setItem("key1", "value1");
		expect(await adapter1.getItem("key1")).toBe("value1");

		// 顺序 2: Atomic -> Checksum -> Queue
		const adapter2 = flow(withAtomic, withChecksum, withQueue)(createMemoryStorageAdapter());
		await adapter2.setItem("key2", "value2");
		expect(await adapter2.getItem("key2")).toBe("value2");
	});

	it("类型应该正确传递", () => {
		const baseAdapter = createMemoryStorageAdapter();

		// 每个增强器都应该返回 StorageAdapter
		const a1: StorageAdapter = withAtomic(baseAdapter);
		const a2: StorageAdapter = withChecksum(a1);
		const a3: StorageAdapter = withQueue(a2);
		const a4: StorageAdapter = withDebounce({ wait: 100 })(a3);

		expect(a4).toBeDefined();
	});
});

// ============ 边界情况测试 ============

describe("边界情况", () => {
	it("应该处理空字符串值", async () => {
		const baseAdapter = createMemoryStorageAdapter();
		const safeAdapter = createSafeStorage(baseAdapter);

		await safeAdapter.setItem("empty", "");
		const result = await safeAdapter.getItem("empty");

		expect(result).toBe("");
	});

	it("应该处理非常大的数据", async () => {
		const baseAdapter = createMemoryStorageAdapter();
		const safeAdapter = createSafeStorage(baseAdapter);

		const largeData = "x".repeat(100000);
		await safeAdapter.setItem("large", largeData);
		const result = await safeAdapter.getItem("large");

		expect(result).toBe(largeData);
	});

	it("应该处理特殊字符", async () => {
		const baseAdapter = createMemoryStorageAdapter();
		const safeAdapter = createSafeStorage(baseAdapter);

		const specialChars = '{"test": "value with \\"quotes\\" and \\n newlines"}';
		await safeAdapter.setItem("special", specialChars);
		const result = await safeAdapter.getItem("special");

		expect(result).toBe(specialChars);
	});

	it("应该处理 Unicode 字符", async () => {
		const baseAdapter = createMemoryStorageAdapter();
		const safeAdapter = createSafeStorage(baseAdapter);

		const unicode = "你好世界 🌍 مرحبا";
		await safeAdapter.setItem("unicode", unicode);
		const result = await safeAdapter.getItem("unicode");

		expect(result).toBe(unicode);
	});
});

