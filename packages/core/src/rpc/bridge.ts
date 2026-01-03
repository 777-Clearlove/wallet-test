/**
 * RPC Bridge
 *
 * 连接 Transport（平台层）和 Engine（核心层）
 * 处理连接管理、请求路由、事件广播
 */
import type { WalletEngine } from "./engine";
import type { ConnectionEvent, SessionManager, Transport } from "./transport";
import { type ProviderEventType, ProviderEvent, RpcErrorCode } from "./types";

// ============ Bridge Config ============

export type BridgeConfig<S> = {
	/** RPC 执行引擎 */
	readonly engine: WalletEngine<S>;
	/** 传输层 */
	readonly transport: Transport;
	/** 会话管理器 */
	readonly sessions: SessionManager;
	/** 事件监听器 */
	readonly listeners?: BridgeListeners;
};

export type BridgeListeners = {
	/** 连接建立时 */
	onConnect?: (connectionId: string, origin: string) => void;
	/** 连接断开时 */
	onDisconnect?: (connectionId: string, origin: string) => void;
	/** 请求前 */
	onRequest?: (connectionId: string, method: string) => void;
	/** 响应后 */
	onResponse?: (connectionId: string, method: string, durationMs: number) => void;
	/** 错误时 */
	onError?: (connectionId: string, method: string, error: unknown) => void;
};

// ============ Bridge Factory ============

/**
 * 创建 RPC Bridge
 *
 * @example
 * ```ts
 * const bridge = createBridge({
 *   engine,
 *   transport: createPortTransport({ ... }),
 *   sessions: createSessionManager({ ... }),
 * });
 *
 * // 启动监听
 * bridge.start();
 *
 * // 广播事件
 * bridge.broadcastAccountsChanged(["0x..."]);
 * bridge.broadcastChainChanged("0x1");
 *
 * // 停止
 * bridge.stop();
 * ```
 */
export const createBridge = <S>(config: BridgeConfig<S>) => {
	const { engine, transport, sessions, listeners } = config;
	let unsubscribe: (() => void) | null = null;

	// 处理连接事件
	const handleEvent = async (event: ConnectionEvent) => {
		switch (event.type) {
			case "connected": {
				const { connection } = event;
				sessions.create(connection.id, connection.origin);
				listeners?.onConnect?.(connection.id, connection.origin);
				break;
			}

			case "disconnected": {
				const session = sessions.get(event.connectionId);
				if (session) {
					listeners?.onDisconnect?.(event.connectionId, session.origin);
					sessions.remove(event.connectionId);
				}
				break;
			}

			case "request": {
				const { connectionId, request } = event;
				const ctx = sessions.toContext(connectionId);

				if (!ctx) {
					// 无效连接
					transport.disconnect(connectionId, "Invalid session");
					return;
				}

				sessions.touch(connectionId);
				listeners?.onRequest?.(connectionId, request.method);

				const startTime = Date.now();

				try {
					const result = await engine.handle(request, ctx);
					transport.send(connectionId, {
						jsonrpc: "2.0",
						id: request.id,
						result,
					});
					listeners?.onResponse?.(connectionId, request.method, Date.now() - startTime);
				} catch (error) {
					listeners?.onError?.(connectionId, request.method, error);

					// 编码错误
					const rpcError =
						error && typeof error === "object" && "code" in error
							? (error as { code: number; message: string; data?: unknown })
							: { code: RpcErrorCode.InternalError, message: "Internal error" };

					transport.send(connectionId, {
						jsonrpc: "2.0",
						id: request.id,
						error: rpcError,
					});
				}
				break;
			}
		}
	};

	// ============ 公共 API ============

	const start = () => {
		if (unsubscribe) return;
		unsubscribe = transport.onEvent(handleEvent);
		transport.start();
	};

	const stop = () => {
		transport.stop();
		unsubscribe?.();
		unsubscribe = null;
	};

	// 广播账户变更（带权限过滤）
	const broadcastAccountsChanged = (
		accounts: string[],
		getPermittedAccounts?: (origin: string, chainId: string) => string[],
	) => {
		if (getPermittedAccounts) {
			// 每个连接发送其有权限的账户
			for (const conn of transport.getConnections()) {
				const session = sessions.get(conn.id);
				if (!session) continue;
				const permitted = getPermittedAccounts(session.origin, session.chainId);
				transport.emit(conn.id, ProviderEvent.AccountsChanged, [permitted]);
			}
		} else {
			transport.broadcast(ProviderEvent.AccountsChanged, [accounts]);
		}
	};

	const broadcastChainChanged = (chainId: string) => {
		// 更新所有会话的 chainId
		for (const session of sessions.getAll()) {
			sessions.update(session.id, { chainId });
		}
		transport.broadcast(ProviderEvent.ChainChanged, [chainId]);
	};

	const broadcastConnect = (chainId: string) => {
		transport.broadcast(ProviderEvent.Connect, [{ chainId }]);
	};

	const broadcastDisconnect = (error?: { code: number; message: string }) => {
		transport.broadcast(ProviderEvent.Disconnect, error ? [error] : []);
	};

	const emitToOrigin = (origin: string, event: ProviderEventType, params: unknown[]) => {
		for (const session of sessions.getByOrigin(origin)) {
			transport.emit(session.id, event, params);
		}
	};

	const disconnectOrigin = (origin: string, reason?: string) => {
		for (const session of sessions.getByOrigin(origin)) {
			transport.disconnect(session.id, reason);
		}
	};

	const getConnectedOrigins = () => {
		const origins = new Set<string>();
		for (const session of sessions.getAll()) {
			origins.add(session.origin);
		}
		return [...origins];
	};

	return {
		// 生命周期
		start,
		stop,

		// 广播
		broadcastAccountsChanged,
		broadcastChainChanged,
		broadcastConnect,
		broadcastDisconnect,

		// 定向操作
		emitToOrigin,
		disconnectOrigin,

		// 查询
		getConnectedOrigins,
		getSessions: sessions.getAll,
	};
};

export type Bridge<S> = ReturnType<typeof createBridge<S>>;
