/**
 * 测试工具增强
 *
 * 提供 createTestServices、状态快照、mock 等测试辅助功能
 */

import type { StorageAdapter } from "./storage/adapter";

// ============ 类型定义 ============

/** 内存存储适配器（带辅助方法） */
export interface MemoryStorageAdapter extends StorageAdapter {
	/** 底层存储 Map */
	readonly _storage: Map<string, string>;
	/** 清空所有存储 */
	clear: () => void;
	/** 获取所有存储的 keys */
	keys: () => string[];
	/** 获取存储大小 */
	size: () => number;
	/** 导出所有数据为对象 */
	toJSON: () => Record<string, string>;
	/** 从对象导入数据 */
	fromJSON: (data: Record<string, string>) => void;
}

/** 测试 Services 配置 */
export interface TestServicesConfig {
	/** 初始存储数据 */
	initialStorage?: Record<string, string>;
	/** 是否跳过 hydration，默认 true */
	skipHydration?: boolean;
	/** 模拟延迟（ms），用于测试异步场景 */
	delay?: number;
}

/** Store 实例接口（最小化） */
interface StoreInstance<State> {
	store: {
		getState: () => State;
		setState: (partial: Partial<State> | ((state: State) => Partial<State>), replace?: boolean) => void;
	};
	getState: () => State;
	waitForHydration: () => Promise<unknown>;
	clearStorage: () => void | Promise<void>;
	destroy: () => void;
}

/** 测试 Services 扩展 */
export interface TestServicesExtension<Services extends Record<string, StoreInstance<unknown>>> {
	/** 重置所有 Services 到初始状态 */
	__reset: () => Promise<void>;
	/** 清空存储 */
	__clearStorage: () => void;
	/** 获取存储适配器 */
	__getStorage: () => MemoryStorageAdapter;
	/** 设置指定 Service 的状态 */
	__setState: <K extends keyof Services>(
		serviceName: K,
		state: Partial<Services[K] extends StoreInstance<infer S> ? S : never>,
	) => void;
	/** 获取指定 Service 的状态快照 */
	__getSnapshot: <K extends keyof Services>(
		serviceName: K,
	) => Services[K] extends StoreInstance<infer S> ? S : never;
	/** 获取所有 Services 的状态快照 */
	__getAllSnapshots: () => {
		[K in keyof Services]: Services[K] extends StoreInstance<infer S> ? S : never;
	};
	/** 等待所有 Services hydration 完成 */
	__waitForAllHydration: () => Promise<void>;
	/** 销毁所有 Services */
	__destroy: () => void;
}

/** 完整的测试 Services 类型 */
export type TestServices<Services extends Record<string, StoreInstance<unknown>>> = Services &
	TestServicesExtension<Services>;

// ============ 内存存储适配器 ============

/**
 * 创建增强的内存存储适配器
 */
export function createMemoryStorage(initialData?: Record<string, string>): MemoryStorageAdapter {
	const storage = new Map<string, string>(initialData ? Object.entries(initialData) : undefined);

	return {
		_storage: storage,

		getItem: (key: string) => storage.get(key) ?? null,

		setItem: (key: string, value: string) => {
			storage.set(key, value);
		},

		removeItem: (key: string) => {
			storage.delete(key);
		},

		clear: () => {
			storage.clear();
		},

		keys: () => [...storage.keys()],

		size: () => storage.size,

		toJSON: () => Object.fromEntries(storage),

		fromJSON: (data: Record<string, string>) => {
			storage.clear();
			for (const [key, value] of Object.entries(data)) {
				storage.set(key, value);
			}
		},
	};
}

/**
 * 创建异步内存存储适配器
 */
export function createAsyncMemoryStorage(
	delay = 10,
	initialData?: Record<string, string>,
): MemoryStorageAdapter {
	const storage = new Map<string, string>(initialData ? Object.entries(initialData) : undefined);

	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

		clear: () => {
			storage.clear();
		},

		keys: () => [...storage.keys()],

		size: () => storage.size,

		toJSON: () => Object.fromEntries(storage),

		fromJSON: (data: Record<string, string>) => {
			storage.clear();
			for (const [key, value] of Object.entries(data)) {
				storage.set(key, value);
			}
		},
	};
}

// ============ 测试 Services 工厂 ============

/**
 * 创建测试用 Services 工厂
 *
 * 包装 createServices 函数，添加测试辅助方法
 *
 * @example
 * ```ts
 * // 在测试文件中
 * import { createServices } from '@repo/core/service';
 * import { createTestServicesFactory } from '@repo/core/service-factory/testing';
 *
 * const createTestServices = createTestServicesFactory(createServices);
 *
 * describe('Vault Service', () => {
 *   let services: ReturnType<typeof createTestServices>;
 *
 *   beforeEach(async () => {
 *     services = createTestServices();
 *     await services.__waitForAllHydration();
 *   });
 *
 *   afterEach(() => {
 *     services.__destroy();
 *   });
 *
 *   it('should add vault', () => {
 *     services.vault.getState().add({ ... });
 *     expect(services.vault.getState().vaults).toHaveLength(1);
 *   });
 *
 *   it('should reset state', async () => {
 *     services.vault.getState().add({ ... });
 *     await services.__reset();
 *     expect(services.vault.getState().vaults).toHaveLength(0);
 *   });
 * });
 * ```
 */
export function createTestServicesFactory<
	Config extends { storageAdapter?: StorageAdapter; skipHydration?: boolean },
	Services extends Record<string, StoreInstance<unknown>>,
>(
	createServices: (config?: Config) => Services,
	defaultConfig?: Partial<TestServicesConfig>,
): (config?: TestServicesConfig) => TestServices<Services> {
	return (config?: TestServicesConfig): TestServices<Services> => {
		const { initialStorage, skipHydration = true, delay } = { ...defaultConfig, ...config };

		// 创建存储适配器
		const storageAdapter = delay
			? createAsyncMemoryStorage(delay, initialStorage)
			: createMemoryStorage(initialStorage);

		// 创建 services
		const services = createServices({
			storageAdapter,
			skipHydration,
		} as Config);

		// 添加测试辅助方法
		const testExtension: TestServicesExtension<Services> = {
			__reset: async () => {
				// 清空存储
				storageAdapter.clear();

				// 清空每个 service 的存储
				for (const service of Object.values(services)) {
					await service.clearStorage();
				}
			},

			__clearStorage: () => {
				storageAdapter.clear();
			},

			__getStorage: () => storageAdapter,

			__setState: (serviceName, state) => {
				const service = services[serviceName];
				if (service?.store) {
					service.store.setState(state as Partial<unknown>);
				}
			},

			__getSnapshot: (serviceName) => {
				const service = services[serviceName];
				return service?.getState() as Services[typeof serviceName] extends StoreInstance<infer S> ? S : never;
			},

			__getAllSnapshots: () => {
				const snapshots = {} as {
					[K in keyof Services]: Services[K] extends StoreInstance<infer S> ? S : never;
				};
				for (const [name, service] of Object.entries(services)) {
					// biome-ignore lint/suspicious/noExplicitAny: dynamic typing
					(snapshots as any)[name] = service.getState();
				}
				return snapshots;
			},

			__waitForAllHydration: async () => {
				await Promise.all(Object.values(services).map((s) => s.waitForHydration()));
			},

			__destroy: () => {
				for (const service of Object.values(services)) {
					service.destroy();
				}
				storageAdapter.clear();
			},
		};

		return Object.assign(services, testExtension);
	};
}

// ============ 快照工具 ============

/**
 * 创建状态快照
 */
export function createSnapshot<T>(state: T): T {
	return structuredClone(state);
}

/**
 * 比较两个状态快照
 */
export function compareSnapshots<T>(a: T, b: T): {
	isEqual: boolean;
	diff: Partial<T>;
} {
	const diff: Partial<T> = {};
	let isEqual = true;

	const aObj = a as Record<string, unknown>;
	const bObj = b as Record<string, unknown>;

	for (const key of new Set([...Object.keys(aObj), ...Object.keys(bObj)])) {
		if (JSON.stringify(aObj[key]) !== JSON.stringify(bObj[key])) {
			isEqual = false;
			(diff as Record<string, unknown>)[key] = { from: aObj[key], to: bObj[key] };
		}
	}

	return { isEqual, diff };
}

// ============ Mock 工具 ============

/**
 * 创建 Mock Service
 *
 * @example
 * ```ts
 * const mockVault = createMockService({
 *   vaults: [{ id: '1', name: 'Test' }],
 * }, {
 *   add: vi.fn(),
 *   remove: vi.fn(),
 * });
 * ```
 */
export function createMockService<State extends object, Actions extends Record<string, unknown>>(
	initialState: State,
	actions: Actions,
): {
	store: { getState: () => State & Actions; setState: (state: Partial<State>) => void };
	getState: () => State & Actions;
	subscribe: (listener: () => void) => () => void;
	waitForHydration: () => Promise<{ hasHydrated: true }>;
	hasHydrated: () => true;
	clearStorage: () => void;
	destroy: () => void;
} {
	let state = { ...initialState, ...actions } as State & Actions;
	const listeners = new Set<() => void>();

	return {
		store: {
			getState: () => state,
			setState: (partial: Partial<State>) => {
				state = { ...state, ...partial };
				for (const listener of listeners) listener();
			},
		},
		getState: () => state,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		waitForHydration: async () => ({ hasHydrated: true as const }),
		hasHydrated: () => true as const,
		clearStorage: () => {},
		destroy: () => listeners.clear(),
	};
}

// ============ 断言工具 ============

/**
 * 等待状态满足条件
 */
export async function waitForState<State>(
	getState: () => State,
	predicate: (state: State) => boolean,
	options: { timeout?: number; interval?: number } = {},
): Promise<State> {
	const { timeout = 5000, interval = 50 } = options;
	const start = Date.now();

	while (true) {
		const state = getState();
		if (predicate(state)) {
			return state;
		}

		if (Date.now() - start > timeout) {
			throw new Error(`waitForState timeout after ${timeout}ms`);
		}

		await new Promise((resolve) => setTimeout(resolve, interval));
	}
}

/**
 * 等待 action 被调用
 */
export async function waitForAction<T>(
	mock: { mock: { calls: T[][] } },
	options: { timeout?: number; callCount?: number } = {},
): Promise<T[][]> {
	const { timeout = 5000, callCount = 1 } = options;
	const start = Date.now();

	while (mock.mock.calls.length < callCount) {
		if (Date.now() - start > timeout) {
			throw new Error(`waitForAction timeout: expected ${callCount} calls, got ${mock.mock.calls.length}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	return mock.mock.calls;
}

