import { combineLatest, filter, map, take, type Observable } from "rxjs";
import {
	createServiceFactory,
	type StorageAdapter,
	type HydrationState,
	defaultStorageAdapter,
} from "../service-factory";
import {
	config as VaultConfig,
	initialState as VaultInitialState,
	actions as VaultActions,
} from "./Vault";

export interface PlatformConfig {
	storageAdapter?: StorageAdapter;
	skipHydration?: boolean;
}

/** Service 实例的通用接口（用于 hydration 相关方法） */
interface ServiceInstance {
	waitForHydration: () => Promise<HydrationState>;
	getHydrationState: () => HydrationState;
	hydrationState$: Observable<HydrationState>;
}

/** 所有 Service 的 Hydration 状态汇总 */
export interface AllHydrationState<T extends Record<string, ServiceInstance>> {
	/** 各 Service 的 hydration 状态 */
	states: { [K in keyof T]: HydrationState };
	/** 是否所有 Service 都已完成 hydration */
	allHydrated: boolean;
	/** 是否有任何 Service 使用了 fallback */
	anyFallback: boolean;
	/** 是否有任何 Service 发生 hydration 错误 */
	anyError: boolean;
	/** 所有 hydration 错误列表 */
	errors: Array<{ service: keyof T; error: Error }>;
}

/**
 * 等待多个 Service 的 hydration 完成
 */
function createHydrationHelpers<T extends Record<string, ServiceInstance>>(
	services: T,
) {
	const serviceEntries = Object.entries(services) as [keyof T, ServiceInstance][];

	const buildAllHydrationState = (
		states: { [K in keyof T]: HydrationState },
	): AllHydrationState<T> => {
		const entries = Object.entries(states) as [keyof T, HydrationState][];
		const allHydrated = entries.every(([, s]) => s.hasHydrated);
		const anyFallback = entries.some(([, s]) => s.usedFallback);
		const anyError = entries.some(([, s]) => s.hydrationError !== null);
		const errors = entries
			.filter(([, s]) => s.hydrationError !== null)
			.map(([key, s]) => ({ service: key, error: s.hydrationError! }));

		return { states, allHydrated, anyFallback, anyError, errors };
	};

	return {
		/**
		 * 等待所有 Service 的 hydration 完成
		 *
		 * @example
		 * ```ts
		 * const { vault, wallet } = createServices();
		 * const result = await waitForAllHydration();
		 * if (result.anyError) {
		 *   console.error("Hydration errors:", result.errors);
		 * }
		 * ```
		 */
		waitForAllHydration: async (): Promise<AllHydrationState<T>> => {
			const results = await Promise.all(
				serviceEntries.map(async ([key, service]) => {
					const state = await service.waitForHydration();
					return [key, state] as const;
				}),
			);

			const states = Object.fromEntries(results) as { [K in keyof T]: HydrationState };
			return buildAllHydrationState(states);
		},

		/**
		 * 获取所有 Service 的当前 hydration 状态（同步）
		 */
		getAllHydrationState: (): AllHydrationState<T> => {
			const states = Object.fromEntries(
				serviceEntries.map(([key, service]) => [key, service.getHydrationState()]),
			) as { [K in keyof T]: HydrationState };
			return buildAllHydrationState(states);
		},

		/**
		 * 所有 Service 的 hydration 状态 Observable
		 * 当任意 Service 的 hydration 状态变化时发出新值
		 */
		allHydrationState$: combineLatest(
			Object.fromEntries(
				serviceEntries.map(([key, service]) => [key, service.hydrationState$]),
			) as { [K in keyof T]: Observable<HydrationState> },
		).pipe(map((states) => buildAllHydrationState(states as { [K in keyof T]: HydrationState }))),

		/**
		 * 等待所有 Service hydration 完成的 Observable（只发出一次值）
		 */
		allHydrated$: combineLatest(
			Object.fromEntries(
				serviceEntries.map(([key, service]) => [key, service.hydrationState$]),
			) as { [K in keyof T]: Observable<HydrationState> },
		).pipe(
			map((states) => buildAllHydrationState(states as { [K in keyof T]: HydrationState })),
			filter((state) => state.allHydrated),
			take(1),
		),
	};
}

export function createServices(platform?: PlatformConfig) {
	const { storageAdapter = defaultStorageAdapter, skipHydration = false } =
		platform ?? {};

	const createFactory = <State extends object, PersistedState extends Partial<State> = State>(
		config: Parameters<typeof createServiceFactory<State, PersistedState>>[0],
	) =>
		createServiceFactory<State, PersistedState>({
			...config,
			storageAdapter,
			skipHydration,
		});

	const createVaultStore = createFactory(VaultConfig);
	const vault = createVaultStore(VaultInitialState, { actions: VaultActions });

	// 所有 Service 实例
	const services = { vault };

	// Hydration 相关辅助方法
	const hydrationHelpers = createHydrationHelpers(services);

	return {
		...services,
		...hydrationHelpers,
	};
}
