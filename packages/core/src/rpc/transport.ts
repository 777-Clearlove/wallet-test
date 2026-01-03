/**
 * Transport Layer Abstractions
 *
 * 平台无关的传输层接口定义
 * 具体实现由各平台提供（Extension Port、Mobile WebView 等）
 */
import type { JsonRpcRequest, JsonRpcResponse } from "@metamask/utils";
import type { ProviderEventType, RpcContext } from "./types";

// ============ Connection ============

/** 连接状态 */
export type ConnectionState = "connecting" | "connected" | "disconnected";

/** 单个连接 */
export type Connection = {
	/** 连接 ID */
	readonly id: string;
	/** 来源 */
	readonly origin: string;
	/** 会话 ID */
	readonly sessionId: string;
	/** 连接状态 */
	readonly state: ConnectionState;
	/** 连接时间 */
	readonly connectedAt: number;
	/** 扩展元数据 */
	readonly meta?: Record<string, unknown>;
};

/** 连接事件 */
export type ConnectionEvent =
	| { type: "connected"; connection: Connection }
	| { type: "disconnected"; connectionId: string; reason?: string }
	| { type: "request"; connectionId: string; request: JsonRpcRequest };

// ============ Transport Interface ============

/**
 * 传输层接口
 *
 * 各平台实现此接口以提供：
 * - Extension: browser.runtime.Port
 * - Mobile: WebView postMessage
 * - Web: iframe / WalletConnect
 */
export type Transport = {
	/** 启动监听 */
	readonly start: () => void;
	/** 停止监听 */
	readonly stop: () => void;
	/** 发送响应 */
	readonly send: (connectionId: string, response: JsonRpcResponse) => void;
	/** 广播事件 */
	readonly broadcast: (event: ProviderEventType, params: unknown[]) => void;
	/** 向单个连接发送事件 */
	readonly emit: (connectionId: string, event: ProviderEventType, params: unknown[]) => void;
	/** 断开连接 */
	readonly disconnect: (connectionId: string, reason?: string) => void;
	/** 获取所有活跃连接 */
	readonly getConnections: () => Connection[];
	/** 订阅连接事件 */
	readonly onEvent: (handler: (event: ConnectionEvent) => void) => () => void;
};

// ============ Transport Factory ============

/**
 * 创建 Transport 的工厂函数类型
 *
 * 各平台实现此函数
 */
export type TransportFactory<TOptions = unknown> = (options: TOptions) => Transport;

// ============ Session Manager ============

/** 会话信息 */
export type Session = {
	readonly id: string;
	readonly origin: string;
	readonly chainId: string;
	readonly namespace: string;
	readonly accounts: readonly string[];
	readonly createdAt: number;
	readonly lastActiveAt: number;
};

/** 会话管理器配置 */
export type SessionManagerConfig = {
	/** 获取默认链 ID */
	readonly getDefaultChainId: () => string;
	/** 获取默认命名空间 */
	readonly getDefaultNamespace: () => string;
	/** 获取 origin 的已授权账户 */
	readonly getPermittedAccounts: (origin: string, chainId: string) => string[];
};

/**
 * 创建会话管理器
 */
export const createSessionManager = (config: SessionManagerConfig) => {
	const sessions = new Map<string, Session>();

	const create = (connectionId: string, origin: string): Session => {
		const chainId = config.getDefaultChainId();
		const namespace = config.getDefaultNamespace();
		const accounts = config.getPermittedAccounts(origin, chainId);

		const session: Session = {
			id: connectionId,
			origin,
			chainId,
			namespace,
			accounts,
			createdAt: Date.now(),
			lastActiveAt: Date.now(),
		};

		sessions.set(connectionId, session);
		return session;
	};

	const get = (connectionId: string) => sessions.get(connectionId);

	const update = (connectionId: string, updates: Partial<Pick<Session, "chainId" | "accounts">>) => {
		const session = sessions.get(connectionId);
		if (!session) return;

		sessions.set(connectionId, {
			...session,
			...updates,
			lastActiveAt: Date.now(),
		});
	};

	const remove = (connectionId: string) => {
		sessions.delete(connectionId);
	};

	const touch = (connectionId: string) => {
		const session = sessions.get(connectionId);
		if (session) {
			sessions.set(connectionId, { ...session, lastActiveAt: Date.now() });
		}
	};

	const getByOrigin = (origin: string): Session[] => {
		return [...sessions.values()].filter((s) => s.origin === origin);
	};

	const getAll = () => [...sessions.values()];

	const toContext = (connectionId: string): RpcContext | undefined => {
		const session = sessions.get(connectionId);
		if (!session) return undefined;

		return {
			origin: session.origin,
			chainId: session.chainId,
			namespace: session.namespace,
			sessionId: session.id,
			source: "dapp",
		};
	};

	return {
		create,
		get,
		update,
		remove,
		touch,
		getByOrigin,
		getAll,
		toContext,
	};
};

export type SessionManager = ReturnType<typeof createSessionManager>;
