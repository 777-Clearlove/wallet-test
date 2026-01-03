/**
 * Service Layer - 统一实例化所有 Service
 *
 * 架构特点：
 * 1. 使用 createTypedDefiners 在 schema.ts 同时绑定 State 和 Services 类型
 * 2. action.ts/effect.ts 无需指定任何泛型
 * 3. selectors 是纯函数，配合 Zustand 原生选择器使用
 */
import { combineLatest, filter, map, take, type Observable } from "rxjs";
import {
	createServiceFactory,
	type HydrationState,
	type StorageAdapter,
	defaultStorageAdapter,
} from "../service-factory";

import {
	config as VaultConfig,
	initialState as VaultInitialState,
	actions as vaultActions,
	selectors as vaultSelectors,
} from "./Vault";
import {
	config as DerivationConfig,
	initialState as DerivationInitialState,
	actions as derivationActions,
	effects as derivationEffects,
	selectors as derivationSelectors,
} from "./Derivation";

// ============ 类型注册表（声明合并） ============
export interface ServiceRegistry {}
export type Services = ServiceRegistry;

// ============ 类型导出 ============
export type { Vault, VaultType, VaultSource, VaultsState } from "./Vault";
export type { Derivation, DerivationState } from "./Derivation";
export { VaultSchema, VaultsStateSchema } from "./Vault";
export { DerivationSchema, DerivationStateSchema } from "./Derivation";

// ============ Selectors 导出 ============
export const selectors = {
	vault: vaultSelectors,
	derivation: derivationSelectors,
} as const;

// ============ 配置接口 ============
export interface PlatformConfig {
	storageAdapter?: StorageAdapter;
	skipHydration?: boolean;
}

// ============ Hydration Helpers ============
interface ServiceInstance {
	waitForHydration: () => Promise<HydrationState>;
	getHydrationState: () => HydrationState;
	hydrationState$: Observable<HydrationState>;
}

export interface AllHydrationState<T extends Record<string, ServiceInstance>> {
	states: { [K in keyof T]: HydrationState };
	allHydrated: boolean;
	anyFallback: boolean;
	anyError: boolean;
	errors: Array<{ service: keyof T; error: Error }>;
}

function createHydrationHelpers<T extends Record<string, ServiceInstance>>(services: T) {
	const serviceEntries = Object.entries(services) as [keyof T, ServiceInstance][];

	const buildAllHydrationState = (states: { [K in keyof T]: HydrationState }): AllHydrationState<T> => {
		const entries = Object.entries(states) as [keyof T, HydrationState][];
		return {
			states,
			allHydrated: entries.every(([, s]) => s.hasHydrated),
			anyFallback: entries.some(([, s]) => s.usedFallback),
			anyError: entries.some(([, s]) => s.hydrationError !== null),
			errors: entries
				.filter(([, s]) => s.hydrationError !== null)
				.map(([key, s]) => ({ service: key, error: s.hydrationError! })),
		};
	};

	return {
		waitForAllHydration: async (): Promise<AllHydrationState<T>> => {
			const results = await Promise.all(
				serviceEntries.map(async ([key, service]) => [key, await service.waitForHydration()] as const),
			);
			return buildAllHydrationState(Object.fromEntries(results) as { [K in keyof T]: HydrationState });
		},

		getAllHydrationState: (): AllHydrationState<T> => {
			const states = Object.fromEntries(
				serviceEntries.map(([key, service]) => [key, service.getHydrationState()]),
			) as { [K in keyof T]: HydrationState };
			return buildAllHydrationState(states);
		},

		allHydrationState$: combineLatest(
			Object.fromEntries(serviceEntries.map(([key, service]) => [key, service.hydrationState$])) as {
				[K in keyof T]: Observable<HydrationState>;
			},
		).pipe(map((states) => buildAllHydrationState(states as { [K in keyof T]: HydrationState }))),

		allHydrated$: combineLatest(
			Object.fromEntries(serviceEntries.map(([key, service]) => [key, service.hydrationState$])) as {
				[K in keyof T]: Observable<HydrationState>;
			},
		).pipe(
			map((states) => buildAllHydrationState(states as { [K in keyof T]: HydrationState })),
			filter((state) => state.allHydrated),
			take(1),
		),
	};
}

// ============ createServices ============
export function createServices(platform?: PlatformConfig) {
	const { storageAdapter = defaultStorageAdapter, skipHydration = false } = platform ?? {};

	// 延迟绑定 services（解决循环依赖）
	let services: Services;
	const getServices = (): Services => services;

	// 统一实例化所有 Store
	const vault = createServiceFactory({
		...VaultConfig,
		storageAdapter,
		skipHydration,
	})(VaultInitialState, { actions: vaultActions, getServices });

	const derivation = createServiceFactory({
		...DerivationConfig,
		storageAdapter,
		skipHydration,
	})(DerivationInitialState, { actions: derivationActions, getServices });

	// 组装 services
	services = { vault, derivation } as Services;

	// 初始化 Effects
	const cleanups: (() => void)[] = [];

	// Derivation Effects: 监听 Vault 变化，自动管理 Derivation
	const derivationCleanups = derivationEffects(
		() => derivation.getState(),
		getServices,
	);
	cleanups.push(...(Array.isArray(derivationCleanups) ? derivationCleanups : [derivationCleanups]));

	// Hydration helpers
	const hydrationHelpers = createHydrationHelpers({ vault, derivation });

	return {
		// Services
		vault,
		derivation,

		// Hydration
		...hydrationHelpers,

		// Lifecycle
		destroy: () => {
			for (const cleanup of cleanups) cleanup();
			vault.destroy();
			derivation.destroy();
		},
	};
}

// ============ 导出类型 ============
export type ServicesInstance = ReturnType<typeof createServices>;
export type VaultStore = ServicesInstance["vault"];
export type DerivationStore = ServicesInstance["derivation"];

// ============ 声明合并：注册 Store 类型 ============
declare module "." {
	interface ServiceRegistry {
		vault: VaultStore;
		derivation: DerivationStore;
	}
}
