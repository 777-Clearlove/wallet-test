import { isFunction, mapValues } from "lodash-es";
import { BehaviorSubject, type Observable, firstValueFrom } from "rxjs";
import { filter, shareReplay } from "rxjs/operators";
import type { z } from "zod";
import { useStore } from "zustand";
import {
	createJSONStorage,
	devtools,
	persist,
	subscribeWithSelector,
	type PersistOptions,
	type PersistStorage,
	type StateStorage,
	type StorageValue,
} from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";
import { defaultStorageAdapter, type StorageAdapter } from "./storage";

/**
 * 将 StorageAdapter 转换为 zustand 需要的 StateStorage 接口
 */
function toStateStorage(adapter: StorageAdapter): StateStorage {
	return {
		getItem: (name: string) => adapter.getItem(name),
		setItem: (name: string, value: string) => {
			adapter.setItem(name, value);
		},
		removeItem: (name: string) => {
			adapter.removeItem(name);
		},
	};
}

interface HydrationValidationOptions<S> {
	schema: z.ZodType<S>;
	storeName: string;
	onInvalid: "reset" | "keep";
	onFallback?: () => void;
}

/**
 * 为 PersistStorage 添加 hydration 时的 schema 验证
 * 装饰器模式：包装 baseStorage，在 getItem 时验证数据
 */
function withHydrationValidation<S extends object>(
	baseStorage: PersistStorage<S>,
	options: HydrationValidationOptions<S>,
): PersistStorage<S> {
	const { schema, storeName, onInvalid, onFallback } = options;

	const validate = (
		storageValue: StorageValue<S>,
	): StorageValue<S> | null => {
		const parseResult = schema.safeParse(storageValue.state);

		if (parseResult.success) {
			return { ...storageValue, state: parseResult.data };
		}

		console.warn(
			`[${storeName}] Hydration validation failed:`,
			parseResult.error.flatten(),
		);

		if (onInvalid === "keep") {
			console.warn(`[${storeName}] Keeping invalid data as-is (dangerous)`);
			onFallback?.();
			return storageValue;
		}

		// reset: 返回 null 让 zustand 使用 initialState
		onFallback?.();
		return null;
	};

	return {
		...baseStorage,
		getItem: (name: string) => {
			const result = baseStorage.getItem(name);

			if (result instanceof Promise) {
				return result.then((storageValue) => {
					if (!storageValue) return null;
					return validate(storageValue);
				});
			}

			if (!result) return null;
			return validate(result);
		},
	};
}

export type ImmerSet<State> = (fn: (draft: State) => void) => void;

// biome-ignore lint/suspicious/noExplicitAny: generic action signature
export type ActionsObject = Record<string, (...args: any[]) => any>;

export type ActionsFactory<State, A extends ActionsObject, S = unknown> = (
	set: ImmerSet<State>,
	get: () => State,
	getServices: () => S,
) => A;

export interface HydrationState {
	hasHydrated: boolean;
	hydrationError: Error | null;
	usedFallback: boolean;
}

export interface StoreConfig<
	State extends object,
	PersistedState extends Partial<State> = State,
> {
	name: string;
	schema?: z.ZodType<PersistedState>;
	partialize?: (state: State) => PersistedState;
	onRehydrateStorage?: PersistOptions<State, PersistedState>["onRehydrateStorage"];
	version?: number;
	migrate?: PersistOptions<State, PersistedState>["migrate"];
	skipHydration?: boolean;
	enableDevtools?: boolean;
	onValidationFail?: "reset" | "keep";
	storageAdapter?: StorageAdapter;
	enableCrossTabSync?: boolean;
}

export function defineActions<State, S = unknown>() {
	return <A extends ActionsObject>(
		factory: ActionsFactory<State, A, S>,
	): ActionsFactory<State, A, S> => factory;
}

// ============ Effects ============

/**
 * Effects 清理函数类型
 */
export type EffectsCleanup = () => void;

/**
 * Effects 工厂函数类型
 *
 * @param get - 获取当前 Service 的状态
 * @param getServices - 获取所有 Services（支持跨 Service 订阅）
 * @returns 清理函数或清理函数数组
 */
export type EffectsFactory<State, S = unknown> = (
	get: () => State,
	getServices: () => S,
) => EffectsCleanup | EffectsCleanup[];

/**
 * 定义 Effects（副作用）
 *
 * 用于监听其他 Service 的状态变化并做出响应
 * 类似 defineActions 的柯里化模式，支持类型推断
 *
 * @example
 * ```ts
 * export const effects = defineEffects<DerivationState, Services>()((get, getServices) => {
 *   const { vault, derivation } = getServices();
 *
 *   return vault.subscribe(
 *     (state) => state.vaults,
 *     (vaults, prevVaults) => {
 *       // 处理变化
 *     },
 *   );
 * });
 * ```
 */
export function defineEffects<State, S = unknown>() {
	return (factory: EffectsFactory<State, S>): EffectsFactory<State, S> => factory;
}

export interface FactoryBuilderConfig {
	storageAdapter: StorageAdapter;
}

export function createFactoryBuilder(config: FactoryBuilderConfig) {
	const { storageAdapter } = config;

	return function createServiceStoreFactory<
		State extends object,
		PersistedState extends Partial<State> = State,
	>(
		storeConfig: Omit<StoreConfig<State, PersistedState>, "storageAdapter">,
	) {
		return createServiceFactory<State, PersistedState>({
			...storeConfig,
			storageAdapter,
		});
	};
}


export function createServiceFactory<
	State extends object,
	PersistedState extends Partial<State> = State,
>(config: StoreConfig<State, PersistedState>) {
	const {
		name,
		schema,
		partialize,
		onRehydrateStorage: userOnRehydrateStorage,
		version = 0,
		migrate,
		skipHydration = false,
		enableDevtools = true,
		onValidationFail = "reset",
		storageAdapter = defaultStorageAdapter,
		enableCrossTabSync = false,
	} = config;

	return function factory<A extends ActionsObject, S = unknown>(
		initialState: State,
		definition: { actions: ActionsFactory<State, A, S>; getServices?: () => S },
	) {
		const { actions: actionsFactory, getServices = () => ({}) as S } = definition;

		const hydrationState$ = new BehaviorSubject<HydrationState>({
			hasHydrated: false,
			hydrationError: null,
			usedFallback: false,
		});

		const updateHydrationState = (updates: Partial<HydrationState>) => {
			hydrationState$.next({
				...hydrationState$.value,
				...updates,
			});
		};

		// 创建 storage：有 schema 时添加 hydration 验证装饰器
		const baseStorage = createJSONStorage<PersistedState>(
			() => toStateStorage(storageAdapter),
		)!;

		const storage = schema
			? withHydrationValidation(baseStorage, {
					schema,
					storeName: name,
					onInvalid: onValidationFail,
					onFallback: () => {
						updateHydrationState({ usedFallback: true });
					},
				})
			: baseStorage;

		const isDev =
			typeof process !== "undefined" &&
			process.env?.NODE_ENV === "development";

		const onRehydrateStorage: PersistOptions<
			State & A,
			PersistedState
		>["onRehydrateStorage"] = (state) => {
			const userCallback = userOnRehydrateStorage?.(state as State);

			return (rehydratedState, error) => {
				updateHydrationState({
					hasHydrated: true,
					hydrationError: error instanceof Error ? error : null,
				});
				userCallback?.(rehydratedState as State, error);
			};
		};

		const store = createStore<State & A>()(
			devtools(
				persist(
					subscribeWithSelector(
						immer((set, get) => {
							let currentActionName: string | undefined;

							const namedSet: ImmerSet<State> = (fn) => {
								(
									set as (
										fn: (draft: State & A) => void,
										replace: boolean,
										name: string,
									) => void
								)(
									fn as (draft: State & A) => void,
									false,
									currentActionName || "anonymous",
								);
							};

							const rawActions = actionsFactory(namedSet, get as () => State, getServices);

							const wrappedActions = mapValues(
								rawActions,
								(action: unknown, key: string) => {
									if (!isFunction(action)) return action;

									// biome-ignore lint/suspicious/noExplicitAny: generic action wrapper
									return (...args: any[]) => {
										currentActionName = key;
										try {
											// biome-ignore lint/suspicious/noExplicitAny: generic action call
											const result = (action as any)(...args);
											if (result instanceof Promise) {
												return result.finally(() => {
													currentActionName = undefined;
												});
											}
											currentActionName = undefined;
											return result;
										} catch (error) {
											currentActionName = undefined;
											throw error;
										}
									};
								},
							) as A;

							return {
								...initialState,
								...wrappedActions,
							};
						}),
					),
					{
						name: `${name}-storage`,
						version,
						migrate,
						skipHydration,
						partialize: (partialize ??
							((state: State & A) =>
								state as unknown as PersistedState)) as (
							state: State & A,
						) => PersistedState,
						onRehydrateStorage,
						storage,
					} as PersistOptions<State & A, PersistedState>,
				),
				{
					name,
					enabled: enableDevtools && isDev,
				},
			),
		);

		if (!skipHydration) {
			queueMicrotask(() => {
				if (!hydrationState$.value.hasHydrated) {
					updateHydrationState({ hasHydrated: true });
				}
			});
		}

		let crossTabCleanup: (() => void) | undefined;

		if (enableCrossTabSync && typeof window !== "undefined") {
			const storageKey = `${name}-storage`;

			const handleStorageChange = (e: StorageEvent) => {
				if (e.key !== storageKey || !e.newValue) return;

				const persistApi = store as unknown as {
					persist?: { rehydrate?: () => Promise<void> | void };
				};
				persistApi.persist?.rehydrate?.();
			};

			window.addEventListener("storage", handleStorageChange);

			crossTabCleanup = () => {
				window.removeEventListener("storage", handleStorageChange);
			};
		}

		function useStoreHook(): State & A;
		function useStoreHook<Selected>(
			selector: (state: State & A) => Selected,
		): Selected;
		function useStoreHook<Selected>(
			selector?: (state: State & A) => Selected,
		) {
			return useStore(
				store,
				selector ?? ((state) => state as unknown as Selected),
			);
		}

		return {
			store,
			useStore: useStoreHook,
			getState: store.getState,
			subscribe: store.subscribe,

			hydrate: async () => {
				const persistApi = store as unknown as {
					persist?: { rehydrate?: () => Promise<void> };
				};
				if (persistApi.persist?.rehydrate) {
					await persistApi.persist.rehydrate();
				}
			},

			getHydrationState: (): HydrationState => hydrationState$.value,
			hasHydrated: () => hydrationState$.value.hasHydrated,
			usedFallback: () => hydrationState$.value.usedFallback,

			waitForHydration: (): Promise<HydrationState> => {
				if (hydrationState$.value.hasHydrated) {
					return Promise.resolve(hydrationState$.value);
				}
				return firstValueFrom(
					hydrationState$.pipe(filter((state) => state.hasHydrated)),
				);
			},

			hydrationState$: hydrationState$.pipe(
				shareReplay({ bufferSize: 1, refCount: true }),
			) as Observable<HydrationState>,

			onHydrationChange: (
				listener: (state: HydrationState) => void,
			): (() => void) => {
				const subscription = hydrationState$.subscribe(listener);
				return () => subscription.unsubscribe();
			},

			clearStorage: () => {
				const result = storageAdapter.removeItem(`${name}-storage`);
				if (result instanceof Promise) {
					return result;
				}
			},

			destroy: () => {
				crossTabCleanup?.();
				hydrationState$.complete();
			},

			batch: <R>(fn: (actions: A) => R): R => {
				const state = store.getState() as unknown as State & A;
				return fn(state as unknown as A);
			},
		};
	};
}
