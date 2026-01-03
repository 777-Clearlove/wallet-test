/**
 * RPC Engine
 *
 * 基于 @metamask/json-rpc-engine v2 的薄封装
 * 添加 Services 依赖注入和 RpcContext 支持
 */
import {
	JsonRpcEngineV2,
	type JsonRpcMiddleware,
	MiddlewareContext,
} from "@metamask/json-rpc-engine/v2";
import type { Json, JsonRpcParams, JsonRpcRequest } from "@metamask/utils";
import type { RpcContext } from "./types";

// ============ Context Keys ============

/** Context key for RpcContext */
export const RPC_CONTEXT_KEY = Symbol("rpcContext");
/** Context key for Services */
export const SERVICES_KEY = Symbol("services");

// ============ Extended Context Type ============

/**
 * 扩展的中间件上下文，包含 Services 和 RpcContext
 */
export type WalletMiddlewareContext<S = unknown> = MiddlewareContext<{
	[RPC_CONTEXT_KEY]: RpcContext;
	[SERVICES_KEY]: S;
}>;

// ============ Middleware Type ============

/**
 * 钱包中间件类型
 *
 * @example
 * ```ts
 * const myMiddleware: WalletMiddleware<MyServices> = async ({ request, context, next }) => {
 *   const rpcCtx = getRpcContext(context);
 *   const services = getServices(context);
 *   // ...
 *   return next();
 * };
 * ```
 */
export type WalletMiddleware<S = unknown> = JsonRpcMiddleware<
	JsonRpcRequest,
	Json,
	WalletMiddlewareContext<S>
>;

// ============ Engine Factory ============

export type WalletEngineOptions<S> = {
	/** Services 实例 (依赖注入) */
	services: S;
	/** 中间件栈 */
	middleware: WalletMiddleware<S>[];
};

/**
 * 创建钱包 RPC 引擎
 *
 * @example
 * ```ts
 * const engine = createWalletEngine({
 *   services: myServices,
 *   middleware: [
 *     createLoggerMiddleware(),
 *     createLockedGuardMiddleware(deps),
 *     createPermissionGuardMiddleware(deps),
 *     createExecutorMiddleware(protocols),
 *   ],
 * });
 *
 * const result = await engine.handle(request, rpcContext);
 * ```
 */
export const createWalletEngine = <S>(options: WalletEngineOptions<S>) => {
	const { services, middleware } = options;

	// Cast to avoid complex type inference issues with JsonRpcEngineV2.create
	const engine = JsonRpcEngineV2.create({ middleware }) as unknown as JsonRpcEngineV2<
		JsonRpcRequest,
		WalletMiddlewareContext<S>
	>;

	/**
	 * 处理 JSON-RPC 请求
	 */
	const handle = async <Params extends JsonRpcParams = JsonRpcParams>(
		request: JsonRpcRequest<Params>,
		rpcContext: RpcContext,
	): Promise<Json> => {
		const context = new MiddlewareContext({
			[RPC_CONTEXT_KEY]: rpcContext,
			[SERVICES_KEY]: services,
		});

		return engine.handle(request as JsonRpcRequest, { context });
	};

	/**
	 * 销毁引擎
	 */
	const destroy = () => engine.destroy();

	return { handle, destroy };
};

export type WalletEngine<S = unknown> = ReturnType<typeof createWalletEngine<S>>;

// ============ Context Helpers ============

/**
 * 从中间件 context 获取 RpcContext
 */
export const getRpcContext = <S>(context: WalletMiddlewareContext<S>): RpcContext => {
	const rpcContext = context.get(RPC_CONTEXT_KEY);
	if (!rpcContext) {
		throw new Error("RpcContext not found in middleware context");
	}
	return rpcContext;
};

/**
 * 从中间件 context 获取 Services
 */
export const getServices = <S>(context: WalletMiddlewareContext<S>): S => {
	const services = context.get(SERVICES_KEY);
	if (services === undefined) {
		throw new Error("Services not found in middleware context");
	}
	return services;
};
