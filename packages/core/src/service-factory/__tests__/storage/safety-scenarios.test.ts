/**
 * 存储安全性测试场景 - 示例用法
 *
 * 这个文件展示如何使用 safety-scenarios.ts 中的测试套件
 * 在实际项目中，你应该在各端（web/mobile）分别运行这些测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	createStorageSafetyTests,
	createCrashableMemoryAdapter,
	createAsyncCrashableMemoryAdapter,
	localStorageTestConfig,
	mmkvTestConfig,
	indexedDBTestConfig,
} from "./safety-scenarios";
import { createMemoryStorageAdapter, createAsyncMemoryStorageAdapter } from "../test-utils";
import { withAtomic, withDebounce, withChecksum, createSafeStorage } from "../../storage/enhancers";

// ============ 1. 内存适配器测试（模拟 localStorage 行为）============

createStorageSafetyTests({
	...localStorageTestConfig,
	name: "内存适配器 (模拟 localStorage)",
	createAdapter: () => createMemoryStorageAdapter(),
	canSimulateCrash: true,
	createCrashableAdapter: () => createCrashableMemoryAdapter(),
});

// ============ 2. 内存适配器 + withAtomic 测试 ============

createStorageSafetyTests({
	name: "内存适配器 + withAtomic",
	createAdapter: () => withAtomic(createMemoryStorageAdapter()),
	isAsync: false,
	supportsAtomicWrite: true, // 通过 enhancer 提供
	supportsTransaction: false,
	hasBuiltinChecksum: false,
});

// ============ 3. 内存适配器 + createSafeStorage 测试 ============

createStorageSafetyTests({
	name: "内存适配器 + createSafeStorage (全保护)",
	createAdapter: () => createSafeStorage(createMemoryStorageAdapter()),
	isAsync: false,
	supportsAtomicWrite: true,
	supportsTransaction: false,
	hasBuiltinChecksum: true, // withChecksum 提供
});

// ============ 4. 异步适配器测试（模拟 AsyncStorage/MMKV 行为）============

createStorageSafetyTests({
	name: "异步内存适配器 (模拟 AsyncStorage)",
	createAdapter: () => createAsyncMemoryStorageAdapter(5),
	isAsync: true,
	supportsAtomicWrite: false,
	supportsTransaction: false,
	hasBuiltinChecksum: false,
	canSimulateCrash: true,
	createCrashableAdapter: () => createAsyncCrashableMemoryAdapter(5),
});

// ============ 5. 异步适配器 + withAtomic 测试 ============

createStorageSafetyTests({
	name: "异步适配器 + withAtomic",
	createAdapter: () => withAtomic(createAsyncMemoryStorageAdapter(5)),
	isAsync: true,
	supportsAtomicWrite: true,
	supportsTransaction: false,
	hasBuiltinChecksum: false,
});

// ============ 专项测试：验证具体问题 ============

describe("专项测试：存储问题验证", () => {
	describe("问题 1: localStorage 无原子性", () => {
		it("模拟写入中断 - 数据可能损坏", () => {
			const crashable = createCrashableMemoryAdapter();

			// 写入初始数据
			crashable.setItem("key", "initial-valid-data");

			// 模拟写入时崩溃
			crashable.simulateCrashOnNextWrite();

			try {
				crashable.setItem("key", "new-data-to-write");
			} catch {
				// 预期崩溃
			}

			// 检查数据状态
			const result = crashable.getItem("key");
			console.log("崩溃后的数据:", result);

			// 数据被部分写入了！
			expect(result).not.toBe("initial-valid-data");
			expect(result).not.toBe("new-data-to-write");
			// 这就是为什么需要 withAtomic
		});

		it("使用 withAtomic 后 - 崩溃时可以从备份恢复", () => {
			const base = createMemoryStorageAdapter();
			const atomic = withAtomic(base);

			// 写入数据（会创建备份）
			atomic.setItem("key", "value-1");
			atomic.setItem("key", "value-2");

			// 模拟主数据损坏
			base.removeItem("key");

			// 读取时应该从备份恢复
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const result = atomic.getItem("key");

			expect(result).toBe("value-1"); // 从备份恢复
			expect(warnSpy).toHaveBeenCalledWith("[Atomic] Restored from backup: key");

			warnSpy.mockRestore();
		});
	});

	describe("问题 2: 读-修改-写 竞态", () => {
		it("无保护的异步存储 - 可能丢失更新", async () => {
			const adapter = createAsyncMemoryStorageAdapter(10);

			await adapter.setItem("counter", JSON.stringify({ count: 0 }));

			// 模拟 3 个并发的增加操作
			const increment = async () => {
				const current = await adapter.getItem("counter");
				const data = JSON.parse(current!);
				// 模拟一些处理延迟
				await new Promise((r) => setTimeout(r, 5));
				data.count += 1;
				await adapter.setItem("counter", JSON.stringify(data));
			};

			await Promise.all([increment(), increment(), increment()]);

			const final = JSON.parse((await adapter.getItem("counter"))!);
			console.log(`期望 count=3, 实际 count=${final.count}`);

			// 由于竞态条件，最终值可能小于 3
			// 这就是为什么复杂操作需要事务支持
		});
	});

	describe("问题 3: 高频写入性能", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("无防抖 - 每次状态变化都写入", () => {
			const base = createMemoryStorageAdapter();
			let writeCount = 0;

			const tracked = {
				...base,
				setItem: (key: string, value: string) => {
					writeCount++;
					base.setItem(key, value);
				},
			};

			// 模拟用户快速输入
			for (let i = 0; i < 100; i++) {
				tracked.setItem("input", `value-${i}`);
			}

			console.log(`无防抖: ${writeCount} 次写入`);
			expect(writeCount).toBe(100);
		});

		it("有防抖 - 合并多次写入为一次", () => {
			const base = createMemoryStorageAdapter();
			let writeCount = 0;

			const tracked = {
				...base,
				setItem: (key: string, value: string) => {
					writeCount++;
					base.setItem(key, value);
				},
			};

			const debounced = withDebounce({ wait: 300 })(tracked);

			// 模拟用户快速输入
			for (let i = 0; i < 100; i++) {
				debounced.setItem("input", `value-${i}`);
			}

			// 推进时间
			vi.advanceTimersByTime(300);

			console.log(`有防抖: ${writeCount} 次写入`);
			expect(writeCount).toBe(1); // 只有 1 次！
		});
	});

	describe("问题 4: 数据校验", () => {
		it("无 checksum - 静默数据损坏无法检测", () => {
			const adapter = createMemoryStorageAdapter();

			adapter.setItem("key", JSON.stringify({ important: "data" }));

			// 模拟数据被意外修改（比如存储介质问题）
			adapter.setItem("key", "corrupted-data-not-json");

			// 读取时会得到损坏的数据，无法检测
			const result = adapter.getItem("key");
			expect(result).toBe("corrupted-data-not-json");

			// 尝试解析会失败
			expect(() => JSON.parse(result!)).toThrow();
		});

		it("有 checksum - 可以检测数据损坏", () => {
			const base = createMemoryStorageAdapter();
			const checksummed = withChecksum(base);

			checksummed.setItem("key", JSON.stringify({ important: "data" }));

			// 直接修改底层数据（模拟损坏）
			const raw = base.getItem("key")!;
			const parsed = JSON.parse(raw);
			parsed.d = "corrupted";
			base.setItem("key", JSON.stringify(parsed));

			// 读取时会检测到损坏
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const result = checksummed.getItem("key");

			expect(result).toBeNull(); // 返回 null 而不是损坏的数据
			expect(errorSpy).toHaveBeenCalledWith("[Checksum] Data corrupted");

			errorSpy.mockRestore();
		});
	});
});

// ============ 对比测试：不同存储方案 ============

describe("存储方案对比", () => {
	it("打印存储方案对比表", () => {
		console.log("\n");
		console.log("╔════════════════════════════════════════════════════════════════╗");
		console.log("║                    存储方案安全性对比表                         ║");
		console.log("╠════════════════╦═══════════╦═══════════╦═══════════╦═══════════╣");
		console.log("║ 存储方案       ║ 单操作    ║ 跨操作    ║ 内置      ║ 推荐      ║");
		console.log("║                ║ 原子性    ║ 事务      ║ 校验      ║ enhancer  ║");
		console.log("╠════════════════╬═══════════╬═══════════╬═══════════╬═══════════╣");
		console.log("║ localStorage   ║    ❌     ║    ❌     ║    ❌     ║ 全部      ║");
		console.log("║ AsyncStorage   ║    ⚠️     ║    ❌     ║    ❌     ║ 全部      ║");
		console.log("║ MMKV           ║    ✅     ║    ❌     ║    ✅     ║ debounce  ║");
		console.log("║ IndexedDB      ║    ✅     ║    ✅     ║    ✅     ║ debounce  ║");
		console.log("║ SQLite         ║    ✅     ║    ✅     ║    ✅     ║ debounce  ║");
		console.log("╚════════════════╩═══════════╩═══════════╩═══════════╩═══════════╝");
		console.log("\n");
		console.log("结论:");
		console.log("1. localStorage/AsyncStorage: 需要全部 enhancers (atomic + checksum + debounce)");
		console.log("2. MMKV/IndexedDB/SQLite: 只需要 debounce 优化性能");
		console.log("\n");
	});
});

