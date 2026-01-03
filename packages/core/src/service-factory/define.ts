/**
 * 类型推断改进
 *
 * 提供 createTypedDefiners，在 schema.ts 中同时绑定 State 和 Services 类型，
 * 让 action.ts/effects.ts 完全无需泛型
 */

import type { z } from "zod";
import type { ActionsFactory, ActionsObject, EffectsCleanup, EffectsFactory, ImmerSet } from "./factory";

// ============ 核心类型 ============

/**
 * 从 Zod Schema 推断 State 类型
 */
export type InferState<Schema extends z.ZodType> = z.infer<Schema>;

/**
 * 类型绑定的 Actions 定义器
 */
export type TypedActionsDefiner<State extends object, S> = <A extends ActionsObject>(
	factory: (set: ImmerSet<State>, get: () => State, getServices: () => S) => A,
) => ActionsFactory<State, A, S>;

/**
 * 类型绑定的 Effects 定义器
 */
export type TypedEffectsDefiner<State extends object, S> = (
	factory: (get: () => State, getServices: () => S) => EffectsCleanup | EffectsCleanup[],
) => EffectsFactory<State, S>;

/**
 * 类型绑定的 Selectors 定义器
 */
export type TypedSelectorsDefiner<State extends object> = <Sel extends Record<string, (state: State) => unknown>>(
	selectors: Sel,
) => Sel;

/**
 * Typed Definers 集合（State 和 Services 类型都已绑定）
 */
export interface TypedDefiners<State extends object, S = unknown> {
	/** 定义 Actions，State 和 Services 类型都已绑定 */
	defineActions: TypedActionsDefiner<State, S>;
	/** 定义 Effects，State 和 Services 类型都已绑定 */
	defineEffects: TypedEffectsDefiner<State, S>;
	/** 定义 Selectors，State 类型已绑定 */
	defineSelectors: TypedSelectorsDefiner<State>;
}

/**
 * 创建类型绑定的 Definers（同时绑定 State 和 Services 类型）
 *
 * 在 schema.ts 中使用，导出给 action.ts/effects.ts 使用
 *
 * @example
 * ```ts
 * // ===== schema.ts =====
 * import { z } from "zod";
 * import { createTypedDefiners } from "@repo/core/service-factory";
 * import type { Services } from "..";
 *
 * export const VaultsStateSchema = z.object({ vaults: z.array(VaultSchema) });
 * export type VaultsState = z.infer<typeof VaultsStateSchema>;
 *
 * // 创建类型绑定的 definers（State 和 Services 都绑定）
 * export const { defineActions, defineEffects } = createTypedDefiners<VaultsState, Services>();
 *
 * // ===== action.ts =====
 * import { defineActions, VaultSchema } from "./schema";
 *
 * // 无需任何泛型！
 * export const actions = defineActions((set, get, getServices) => ({
 *   add: (vault) => set(draft => { draft.vaults.push(vault); }),
 *   addWithCheck(d) {
 *     const { vault } = getServices();  // 类型正确推断
 *     // ...
 *   }
 * }));
 * ```
 */
export function createTypedDefiners<State extends object, S = unknown>(): TypedDefiners<State, S> {
	return {
		defineActions: <A extends ActionsObject>(
			factory: (set: ImmerSet<State>, get: () => State, getServices: () => S) => A,
		) => factory as ActionsFactory<State, A, S>,

		defineEffects: (factory: (get: () => State, getServices: () => S) => EffectsCleanup | EffectsCleanup[]) =>
			factory as EffectsFactory<State, S>,

		defineSelectors: <Sel extends Record<string, (state: State) => unknown>>(selectors: Sel) => selectors,
	};
}

/**
 * 从 Schema 创建类型绑定的 Definers（类型从 schema 推断）
 *
 * @example
 * ```ts
 * // schema.ts - 直接从 schema 推断，不需要手动指定类型
 * export const { defineActions, defineEffects } = createTypedDefinersFromSchema<typeof MySchema, Services>(MySchema);
 * ```
 */
export function createTypedDefinersFromSchema<Schema extends z.ZodType<object>, S = unknown>(
	_schema: Schema,
): TypedDefiners<z.infer<Schema>, S> {
	return createTypedDefiners<z.infer<Schema>, S>();
}
