/**
 * Protocol Definition
 *
 * 声明式协议定义，类型从实现推导
 */
import type { Json, JsonRpcParams } from "@metamask/utils";
import type { LockedBehavior, PermissionScopeType, RpcContext } from "./types";

// ============ Handler ============

/** Handler 输入 */
export type HandlerInput<S> = {
	readonly context: RpcContext;
	readonly request: {
		readonly method: string;
		readonly params?: JsonRpcParams;
	};
	readonly services: S;
};

/** 方法处理器 */
export type Handler<S> = (input: HandlerInput<S>) => Promise<Json> | Json;

// ============ Method Config ============

/** 方法配置 */
export type MethodConfig<S> = {
	/** 所需权限范围 */
	readonly scope?: PermissionScopeType;
	/** 需要用户审批 */
	readonly approval?: boolean;
	/** 锁定时行为 */
	readonly locked?: LockedBehavior;
	/** Bootstrap 方法 (无需预先授权，如 eth_requestAccounts) */
	readonly bootstrap?: boolean;
	/** 处理器 */
	readonly handler: Handler<S>;
};

// ============ Proxy Config ============

/** 代理配置 - 直接转发到 RPC 节点的只读方法 */
export type ProxyConfig = {
	/** 允许代理的方法 */
	readonly methods: readonly string[];
	/** 锁定时仍允许的方法子集 */
	readonly whenLocked?: readonly string[];
};

// ============ Protocol Definition ============

/** 协议定义 */
export type ProtocolDef<S, M extends Record<string, MethodConfig<S>>> = {
	/** 协议名称 (如 "eip155") */
	readonly name: string;
	/** 方法前缀，用于路由 (如 ["eth_", "wallet_"]) */
	readonly prefixes: readonly string[];
	/** 方法定义 */
	readonly methods: M;
	/** 代理配置 */
	readonly proxy?: ProxyConfig;
};

/**
 * 创建协议定义器（绑定 Services 类型）
 *
 * @example
 * ```ts
 * const define = createProtocolDef<MyServices>();
 *
 * export const eip155 = define({
 *   name: "eip155",
 *   prefixes: ["eth_", "wallet_"],
 *   methods: {
 *     eth_chainId: {
 *       handler: ({ services }) => services.network.getChainId(),
 *     },
 *   },
 * });
 * ```
 */
export const createProtocolDef =
	<S>() =>
	<M extends Record<string, MethodConfig<S>>>(def: ProtocolDef<S, M>) =>
		def;

// ============ Type Utilities ============

/** 从 Protocol 推导 Services 类型 */
export type InferServices<P> = P extends ProtocolDef<infer S, infer _M> ? S : never;

/** 从 Protocol 推导 Methods */
export type InferMethods<P> = P extends ProtocolDef<infer _S, infer M> ? M : never;

/** 获取所有方法名 */
export type MethodNames<P> = keyof InferMethods<P> & string;
