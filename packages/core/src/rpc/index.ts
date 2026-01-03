/**
 * RPC Module
 *
 * 基于 @metamask/json-rpc-engine v2 的钱包 RPC 架构
 *
 * @example
 * ```ts
 * // 1. 定义 Services
 * type MyServices = {
 *   vault: { isUnlocked(): boolean };
 *   network: { getChainId(): string };
 *   // ...
 * };
 *
 * // 2. 定义协议
 * const define = createProtocolDef<MyServices>();
 * const eip155 = define({
 *   name: "eip155",
 *   prefixes: ["eth_", "wallet_"],
 *   methods: {
 *     eth_chainId: {
 *       scope: PermissionScope.Public,
 *       handler: ({ services }) => services.network.getChainId(),
 *     },
 *   },
 * });
 *
 * // 3. 创建引擎
 * const engine = createWalletEngine({
 *   services: myServices,
 *   middleware: [
 *     createLoggerMiddleware(),
 *     createLockedGuardMiddleware({
 *       isUnlocked: (s) => s.vault.isUnlocked(),
 *       resolveLockedBehavior: (method, s) => {
 *         const def = eip155.methods[method];
 *         return def?.locked;
 *       },
 *     }),
 *     createPermissionGuardMiddleware({
 *       resolvePermissionScope: (method) => eip155.methods[method]?.scope,
 *       hasPermission: (origin, scope, chainId, s) => s.permission.check(...),
 *     }),
 *     createExecutorMiddleware({
 *       protocols: [eip155],
 *       onProxy: (chainId, method, params) => rpcClient.request(...),
 *     }),
 *   ],
 * });
 *
 * // 4. 处理请求
 * const result = await engine.handle(request, {
 *   origin: "https://dapp.example",
 *   chainId: "eip155:1",
 *   namespace: "eip155",
 *   source: "dapp",
 * });
 * ```
 */

// ============ Types ============
export {
	RpcErrorCode,
	PermissionScope,
	ProviderEvent,
	WhenLocked,
} from "./types";

export type {
	Json,
	JsonRpcParams,
	JsonRpcRequest,
	JsonRpcResponse,
	JsonRpcError,
	RpcContext,
	RpcSource,
	PermissionScopeType,
	ProviderEventType,
	LockedBehavior,
} from "./types";

// ============ Engine ============
export {
	createWalletEngine,
	getRpcContext,
	getServices,
	RPC_CONTEXT_KEY,
	SERVICES_KEY,
} from "./engine";

export type {
	WalletEngine,
	WalletEngineOptions,
	WalletMiddleware,
	WalletMiddlewareContext,
} from "./engine";

// ============ Protocol ============
export { createProtocolDef } from "./protocol";

export type {
	ProtocolDef,
	MethodConfig,
	Handler,
	HandlerInput,
	ProxyConfig,
	InferServices,
	InferMethods,
	MethodNames,
} from "./protocol";

// ============ Middlewares ============
export {
	// Guards
	createLockedGuardMiddleware,
	createPermissionGuardMiddleware,
	// Executor
	createExecutorMiddleware,
	// Utilities
	createLoggerMiddleware,
	createPerformanceMiddleware,
	createDedupeMiddleware,
} from "./middlewares";

export type {
	LockedGuardDeps,
	PermissionGuardDeps,
	ExecutorDeps,
	PerformanceMiddlewareOptions,
	DedupeMiddlewareOptions,
} from "./middlewares";

// ============ Transport ============
export { createSessionManager } from "./transport";

export type {
	Transport,
	TransportFactory,
	Connection,
	ConnectionState,
	ConnectionEvent,
	Session,
	SessionManager,
	SessionManagerConfig,
} from "./transport";

// ============ Bridge ============
export { createBridge } from "./bridge";

export type { Bridge, BridgeConfig, BridgeListeners } from "./bridge";
