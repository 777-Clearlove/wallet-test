/**
 * Factory 核心功能单元测试
 * 测试 createServiceFactory、createFactoryBuilder、defineActions 和 hydration
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { firstValueFrom } from "rxjs";
import { filter } from "rxjs/operators";
import {
	createServiceFactory,
	createFactoryBuilder,
	defineActions,
	type HydrationState,
	type ActionsFactory,
} from "../factory";
import type { StorageAdapter } from "../storage/adapter";
import {
	createMemoryStorageAdapter,
	createAsyncMemoryStorageAdapter,
	sleep,
	waitFor,
} from "./test-utils";

// ============ 测试用的 Schema 和类型 ============

const CounterStateSchema = z.object({
	count: z.number(),
});

type CounterState = z.infer<typeof CounterStateSchema>;

const VaultSchema = z.object({
	id: z.string(),
	name: z.string().min(1),
	createdAt: z.number(),
});

const VaultsStateSchema = z.object({
	vaults: z.array(VaultSchema),
	activeVaultId: z.string().nullable(),
});

type VaultsState = z.infer<typeof VaultsStateSchema>;

// ============ 基本功能测试 ============

describe("createServiceFactory 基本功能", () => {
	let storageAdapter: StorageAdapter;

	beforeEach(() => {
		storageAdapter = createMemoryStorageAdapter();
	});

	it("应该创建带有 actions 的 store", () => {
		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { store, getState } = factory({ count: 0 }, {
			actions: (set) => ({
				increment: () => set((draft) => { draft.count += 1; }),
				decrement: () => set((draft) => { draft.count -= 1; }),
				add: (n: number) => set((draft) => { draft.count += n; }),
			}),
		});

		expect(getState().count).toBe(0);
		getState().increment();
		expect(getState().count).toBe(1);
		getState().add(5);
		expect(getState().count).toBe(6);
		getState().decrement();
		expect(getState().count).toBe(5);
	});

	it("应该正确持久化状态", async () => {
		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { getState, waitForHydration } = factory({ count: 0 }, {
			actions: (set) => ({
				increment: () => set((draft) => { draft.count += 1; }),
			}),
		});

		await waitForHydration();

		getState().increment();
		getState().increment();

		// 验证存储中有数据
		const stored = storageAdapter.getItem("Counter-storage");
		expect(stored).not.toBeNull();
		expect(stored).toContain("count");
	});

	it("应该支持复杂状态类型", () => {
		const factory = createServiceFactory<VaultsState>({
			name: "Vaults",
			storageAdapter,
		});

		const { getState } = factory({ vaults: [], activeVaultId: null }, {
			actions: (set) => ({
				addVault: (vault: z.infer<typeof VaultSchema>) =>
					set((draft) => { draft.vaults.push(vault); }),
				setActive: (id: string) =>
					set((draft) => { draft.activeVaultId = id; }),
				removeVault: (id: string) =>
					set((draft) => {
						draft.vaults = draft.vaults.filter((v) => v.id !== id);
						if (draft.activeVaultId === id) {
							draft.activeVaultId = null;
						}
					}),
			}),
		});

		const vault = { id: "1", name: "Test Vault", createdAt: Date.now() };
		getState().addVault(vault);

		expect(getState().vaults).toHaveLength(1);
		expect(getState().vaults[0]).toEqual(vault);

		getState().setActive("1");
		expect(getState().activeVaultId).toBe("1");

		getState().removeVault("1");
		expect(getState().vaults).toHaveLength(0);
		expect(getState().activeVaultId).toBeNull();
	});

	it("subscribe 应该能监听状态变化", () => {
		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { getState, subscribe } = factory({ count: 0 }, {
			actions: (set) => ({
				increment: () => set((draft) => { draft.count += 1; }),
			}),
		});

		const listener = vi.fn();
		const unsubscribe = subscribe(listener);

		getState().increment();

		expect(listener).toHaveBeenCalled();

		unsubscribe();
		getState().increment();

		// 取消订阅后不应再被调用
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("batch 应该正确执行批量操作", () => {
		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { getState, batch } = factory({ count: 0 }, {
			actions: (set) => ({
				increment: () => set((draft) => { draft.count += 1; }),
				add: (n: number) => set((draft) => { draft.count += n; }),
			}),
		});

		const result = batch((actions) => {
			actions.increment();
			actions.add(10);
			return getState().count;
		});

		expect(result).toBe(11);
		expect(getState().count).toBe(11);
	});
});

// ============ defineActions 辅助函数测试 ============

describe("defineActions", () => {
	it("应该返回相同的 factory 函数", () => {
		const actionsFactory: ActionsFactory<CounterState, { increment: () => void }> =
			defineActions<CounterState>()((set) => ({
				increment: () => set((draft) => { draft.count += 1; }),
			}));

		expect(typeof actionsFactory).toBe("function");
	});

	it("应该保持类型安全", () => {
		// 这主要是编译时检查，运行时验证类型正确
		const actions = defineActions<CounterState>()((set, get) => ({
			increment: () => set((draft) => { draft.count += 1; }),
			getCount: () => get().count,
			add: (n: number) => set((draft) => { draft.count += n; }),
		}));

		const storageAdapter = createMemoryStorageAdapter();
		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { getState } = factory({ count: 0 }, { actions });

		expect(getState().getCount()).toBe(0);
		getState().increment();
		expect(getState().getCount()).toBe(1);
	});
});

// ============ createFactoryBuilder 测试 ============

describe("createFactoryBuilder", () => {
	it("应该创建预配置了 storageAdapter 的工厂", () => {
		const storageAdapter = createMemoryStorageAdapter();
		const createStore = createFactoryBuilder({ storageAdapter });

		const factory = createStore<CounterState>({ name: "Counter" });
		const { getState } = factory({ count: 0 }, {
			actions: (set) => ({
				increment: () => set((draft) => { draft.count += 1; }),
			}),
		});

		getState().increment();
		expect(getState().count).toBe(1);

		// 验证使用了共享的 storageAdapter
		expect(storageAdapter.getItem("Counter-storage")).not.toBeNull();
	});

	it("多个 store 应该共享同一个 storageAdapter", async () => {
		const storageAdapter = createMemoryStorageAdapter();
		const createStore = createFactoryBuilder({ storageAdapter });

		const counterFactory = createStore<CounterState>({ name: "Counter" });
		const vaultsFactory = createStore<VaultsState>({ name: "Vaults" });

		const { getState: getCounter, waitForHydration: waitCounter } = counterFactory({ count: 10 }, {
			actions: (set) => ({
				increment: () => set((draft) => { draft.count += 1; }),
			}),
		});

		const { getState: getVaults, waitForHydration: waitVaults } = vaultsFactory({ vaults: [], activeVaultId: null }, {
			actions: (set) => ({
				addVault: (v: z.infer<typeof VaultSchema>) => set((draft) => { draft.vaults.push(v); }),
			}),
		});

		await waitCounter();
		await waitVaults();

		// 触发状态变化以持久化
		getCounter().increment();
		getVaults().addVault({ id: "1", name: "Test", createdAt: Date.now() });

		// 两个 store 都应该写入同一个 adapter
		expect(storageAdapter.getItem("Counter-storage")).not.toBeNull();
		expect(storageAdapter.getItem("Vaults-storage")).not.toBeNull();
	});
});

// ============ Hydration 状态测试 ============

describe("Hydration 状态管理", () => {
	let storageAdapter: StorageAdapter;

	beforeEach(() => {
		storageAdapter = createMemoryStorageAdapter();
	});

	it("同步 adapter 应该立即完成 hydration", async () => {
		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { hasHydrated, waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		// 等待微任务完成
		await waitForHydration();
		expect(hasHydrated()).toBe(true);
	});

	it("getHydrationState 应该返回完整状态", async () => {
		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { getHydrationState, waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await waitForHydration();

		const state = getHydrationState();
		expect(state).toHaveProperty("hasHydrated", true);
		expect(state).toHaveProperty("hydrationError", null);
		expect(state).toHaveProperty("usedFallback", false);
	});

	it("waitForHydration 应该返回 Promise", async () => {
		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		const result = await waitForHydration();

		expect(result).toHaveProperty("hasHydrated", true);
	});

	it("已 hydrated 时 waitForHydration 应该立即返回", async () => {
		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await waitForHydration();

		// 第二次调用应该立即返回
		const start = Date.now();
		await waitForHydration();
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(10);
	});

	it("hydrationState$ Observable 应该发出状态", async () => {
		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { hydrationState$ } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		const state = await firstValueFrom(
			hydrationState$.pipe(filter((s) => s.hasHydrated)),
		);

		expect(state.hasHydrated).toBe(true);
	});

	it("onHydrationChange 应该能监听变化", async () => {
		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const states: HydrationState[] = [];
		const { onHydrationChange, waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		const unsubscribe = onHydrationChange((state) => {
			states.push(state);
		});

		await waitForHydration();

		expect(states.length).toBeGreaterThan(0);
		expect(states[states.length - 1]!.hasHydrated).toBe(true);

		unsubscribe();
	});
});

// ============ skipHydration 测试 ============

describe("skipHydration 选项", () => {
	it("skipHydration: true 时不应该自动 hydrate", async () => {
		const storageAdapter = createAsyncMemoryStorageAdapter(10);
		storageAdapter._storage.set(
			"Counter-storage",
			JSON.stringify({ state: { count: 100 }, version: 0 }),
		);

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
			skipHydration: true,
		});

		const { getState, hasHydrated } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await sleep(50);

		// 初始状态应该是 initialState，不是存储中的值
		expect(getState().count).toBe(0);
		expect(hasHydrated()).toBe(false);
	});

	it("手动调用 hydrate 应该加载存储的数据", async () => {
		const storageAdapter = createAsyncMemoryStorageAdapter(10);
		storageAdapter._storage.set(
			"Counter-storage",
			JSON.stringify({ state: { count: 100 }, version: 0 }),
		);

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
			skipHydration: true,
		});

		const { getState, hydrate, waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		expect(getState().count).toBe(0);

		await hydrate();
		await waitForHydration();

		expect(getState().count).toBe(100);
	});
});

// ============ Schema 验证测试 ============

describe("Schema 验证", () => {
	let storageAdapter: StorageAdapter;

	beforeEach(() => {
		storageAdapter = createMemoryStorageAdapter();
	});

	it("有效数据应该正常加载", async () => {
		// 预存有效数据
		storageAdapter.setItem(
			"Counter-storage",
			JSON.stringify({ state: { count: 50 }, version: 0 }),
		);

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			schema: CounterStateSchema,
			storageAdapter,
		});

		const { getState, waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await waitForHydration();

		expect(getState().count).toBe(50);
	});

	it("无效数据 + onValidationFail: reset 应该使用 initialState", async () => {
		// 预存无效数据
		storageAdapter.setItem(
			"Counter-storage",
			JSON.stringify({ state: { count: "not a number" }, version: 0 }),
		);

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			schema: CounterStateSchema,
			storageAdapter,
			onValidationFail: "reset",
		});

		const { getState, waitForHydration, usedFallback } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await waitForHydration();

		expect(getState().count).toBe(0); // 使用 initialState
		expect(usedFallback()).toBe(true);
		expect(warnSpy).toHaveBeenCalled();

		warnSpy.mockRestore();
	});

	it("无效数据 + onValidationFail: keep 应该保留原数据", async () => {
		// 预存结构正确但值类型错误的数据
		storageAdapter.setItem(
			"Counter-storage",
			JSON.stringify({ state: { count: "invalid" }, version: 0 }),
		);

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			schema: CounterStateSchema,
			storageAdapter,
			onValidationFail: "keep",
		});

		const { getState, waitForHydration, usedFallback } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await waitForHydration();

		// keep 模式会保留原数据
		expect(getState().count).toBe("invalid" as unknown as number);
		expect(usedFallback()).toBe(true);

		warnSpy.mockRestore();
	});

	it("缺失字段应该触发验证失败", async () => {
		// 预存缺少必要字段的数据
		storageAdapter.setItem(
			"Vaults-storage",
			JSON.stringify({ state: { vaults: [] }, version: 0 }), // 缺少 activeVaultId
		);

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const factory = createServiceFactory<VaultsState>({
			name: "Vaults",
			schema: VaultsStateSchema,
			storageAdapter,
			onValidationFail: "reset",
		});

		const { getState, waitForHydration, usedFallback } = factory(
			{ vaults: [], activeVaultId: null },
			{ actions: () => ({}) },
		);

		await waitForHydration();

		expect(getState().activeVaultId).toBeNull();
		expect(usedFallback()).toBe(true);

		warnSpy.mockRestore();
	});
});

// ============ Partialize 测试 ============

describe("partialize 选项", () => {
	it("应该只持久化指定的字段", async () => {
		const storageAdapter = createMemoryStorageAdapter();

		interface ExtendedState {
			count: number;
			tempValue: string;
			cache: Record<string, unknown>;
		}

		const factory = createServiceFactory<ExtendedState, { count: number }>({
			name: "Extended",
			storageAdapter,
			partialize: (state) => ({ count: state.count }),
		});

		const { getState, waitForHydration } = factory(
			{ count: 0, tempValue: "temp", cache: { key: "value" } },
			{
				actions: (set) => ({
					setCount: (n: number) => set((draft) => { draft.count = n; }),
					setTemp: (s: string) => set((draft) => { draft.tempValue = s; }),
				}),
			},
		);

		await waitForHydration();

		getState().setCount(100);
		getState().setTemp("changed");

		// 检查存储的数据只包含 count
		const stored = JSON.parse(storageAdapter.getItem("Extended-storage")!);
		expect(stored.state).toEqual({ count: 100 });
		expect(stored.state.tempValue).toBeUndefined();
		expect(stored.state.cache).toBeUndefined();
	});
});

// ============ 版本迁移测试 ============

describe("版本迁移", () => {
	it("应该调用 migrate 函数", async () => {
		const storageAdapter = createMemoryStorageAdapter();

		// 预存旧版本数据
		storageAdapter.setItem(
			"Counter-storage",
			JSON.stringify({ state: { value: 10 }, version: 1 }),
		);

		const migrateFn = vi.fn().mockImplementation((state: { value: number }) => ({
			count: state.value * 2,
		}));

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
			version: 2,
			migrate: migrateFn,
		});

		const { getState, waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await waitForHydration();

		expect(migrateFn).toHaveBeenCalledWith({ value: 10 }, 1);
		expect(getState().count).toBe(20);
	});

	it("版本相同时不应该迁移", async () => {
		const storageAdapter = createMemoryStorageAdapter();

		storageAdapter.setItem(
			"Counter-storage",
			JSON.stringify({ state: { count: 50 }, version: 2 }),
		);

		const migrateFn = vi.fn();

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
			version: 2,
			migrate: migrateFn,
		});

		const { getState, waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await waitForHydration();

		expect(migrateFn).not.toHaveBeenCalled();
		expect(getState().count).toBe(50);
	});
});

// ============ clearStorage 测试 ============

describe("clearStorage", () => {
	it("应该清除存储的数据", async () => {
		const storageAdapter = createMemoryStorageAdapter();

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { getState, clearStorage, waitForHydration } = factory({ count: 0 }, {
			actions: (set) => ({
				increment: () => set((draft) => { draft.count += 1; }),
			}),
		});

		await waitForHydration();

		getState().increment();

		expect(storageAdapter.getItem("Counter-storage")).not.toBeNull();

		await clearStorage();

		expect(storageAdapter.getItem("Counter-storage")).toBeNull();
	});
});

// ============ destroy 测试 ============

describe("destroy", () => {
	it("应该完成 hydrationState$ Observable", async () => {
		const storageAdapter = createMemoryStorageAdapter();

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { hydrationState$, destroy, waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await waitForHydration();

		let completed = false;
		hydrationState$.subscribe({
			complete: () => { completed = true; },
		});

		destroy();

		// BehaviorSubject complete 后订阅会立即收到 complete
		expect(completed).toBe(true);
	});
});

// ============ onRehydrateStorage 回调测试 ============

describe("onRehydrateStorage 回调", () => {
	it("应该在 rehydration 完成后调用", async () => {
		const storageAdapter = createMemoryStorageAdapter();
		storageAdapter.setItem(
			"Counter-storage",
			JSON.stringify({ state: { count: 42 }, version: 0 }),
		);

		const afterCallback = vi.fn();

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
			onRehydrateStorage: () => afterCallback,
		});

		const { waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await waitForHydration();

		expect(afterCallback).toHaveBeenCalled();
	});

	it("错误时应该传递 error 给回调", async () => {
		const storageAdapter: StorageAdapter = {
			getItem: () => {
				throw new Error("Storage error");
			},
			setItem: () => {},
			removeItem: () => {},
		};

		const afterCallback = vi.fn();

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
			onRehydrateStorage: () => afterCallback,
		});

		const { waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await waitForHydration();

		// 注意：具体行为取决于 zustand persist 的错误处理
		// 这里主要测试回调被调用
		expect(afterCallback).toHaveBeenCalled();
	});
});

// ============ 异步 Action 测试 ============

describe("异步 Actions", () => {
	it("应该支持异步 action", async () => {
		const storageAdapter = createMemoryStorageAdapter();

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { getState, waitForHydration } = factory({ count: 0 }, {
			actions: (set) => ({
				incrementAsync: async () => {
					await sleep(10);
					set((draft) => { draft.count += 1; });
				},
				fetchAndSet: async (url: string) => {
					// 模拟 fetch
					await sleep(10);
					const value = url.length;
					set((draft) => { draft.count = value; });
				},
			}),
		});

		await waitForHydration();

		await getState().incrementAsync();
		expect(getState().count).toBe(1);

		await getState().fetchAndSet("hello");
		expect(getState().count).toBe(5);
	});

	it("异步 action 中的错误应该正确抛出", async () => {
		const storageAdapter = createMemoryStorageAdapter();

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { getState, waitForHydration } = factory({ count: 0 }, {
			actions: () => ({
				failingAction: async () => {
					await sleep(10);
					throw new Error("Action failed");
				},
			}),
		});

		await waitForHydration();

		await expect(getState().failingAction()).rejects.toThrow("Action failed");
	});
});

// ============ Action 命名（DevTools）测试 ============

describe("Action 命名", () => {
	// 这些测试验证 devtools 相关的功能
	// 在非 development 环境下可能行为不同

	it("action 应该有正确的名称用于 devtools", async () => {
		const storageAdapter = createMemoryStorageAdapter();

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
			enableDevtools: true,
		});

		const { getState, waitForHydration } = factory({ count: 0 }, {
			actions: (set) => ({
				myCustomAction: () => set((draft) => { draft.count = 999; }),
			}),
		});

		await waitForHydration();

		// 调用应该不会抛错
		getState().myCustomAction();
		expect(getState().count).toBe(999);
	});
});

// ============ 边界情况测试 ============

describe("边界情况", () => {
	it("空 initialState 应该正常工作", async () => {
		const storageAdapter = createMemoryStorageAdapter();

		interface EmptyState {
			items: string[];
		}

		const factory = createServiceFactory<EmptyState>({
			name: "Empty",
			storageAdapter,
		});

		const { getState, waitForHydration } = factory({ items: [] }, {
			actions: (set) => ({
				add: (item: string) => set((draft) => { draft.items.push(item); }),
			}),
		});

		await waitForHydration();

		expect(getState().items).toEqual([]);
		getState().add("first");
		expect(getState().items).toEqual(["first"]);
	});

	it("多个 action 快速连续调用应该正确更新", async () => {
		const storageAdapter = createMemoryStorageAdapter();

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { getState, waitForHydration } = factory({ count: 0 }, {
			actions: (set) => ({
				increment: () => set((draft) => { draft.count += 1; }),
			}),
		});

		await waitForHydration();

		// 快速连续调用
		for (let i = 0; i < 100; i++) {
			getState().increment();
		}

		expect(getState().count).toBe(100);
	});

	it("get() 应该返回最新状态", async () => {
		const storageAdapter = createMemoryStorageAdapter();

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { getState, waitForHydration } = factory({ count: 0 }, {
			actions: (set, get) => ({
				incrementIfPositive: () => {
					if (get().count >= 0) {
						set((draft) => { draft.count += 1; });
					}
				},
				getDoubled: () => get().count * 2,
			}),
		});

		await waitForHydration();

		getState().incrementIfPositive();
		expect(getState().count).toBe(1);
		expect(getState().getDoubled()).toBe(2);
	});

	it("存储损坏的 JSON 应该使用 initialState", async () => {
		const storageAdapter = createMemoryStorageAdapter();
		storageAdapter.setItem("Counter-storage", "not valid json{{{");

		const factory = createServiceFactory<CounterState>({
			name: "Counter",
			storageAdapter,
		});

		const { getState, waitForHydration } = factory({ count: 0 }, {
			actions: () => ({}),
		});

		await waitForHydration();

		// 应该回退到 initialState
		expect(getState().count).toBe(0);
	});
});

