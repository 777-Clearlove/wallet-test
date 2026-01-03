/**
 * Port Transport - Browser Extension 实现
 *
 * 使用 browser.runtime.Port 实现 Transport 接口
 * 适用于 Chrome/Firefox 扩展的 background script
 *
 * @example
 * ```ts
 * // background.ts
 * import browser from "webextension-polyfill";
 *
 * const transport = createPortTransport({
 *   channel: "wallet-rpc",
 *   resolveOrigin: (port) => new URL(port.sender?.url ?? "").origin,
 *   onConnect: browser.runtime.onConnect,
 * });
 * ```
 */
import type { Connection, ConnectionEvent, Transport } from "../transport";
import type { ProviderEventType, RpcRequest, RpcResponse } from "../types";

// ============ 类型定义 ============

/** 模拟 webextension-polyfill 的 Port 类型 */
type Port = {
	name: string;
	sender?: {
		url?: string;
		tab?: { id?: number };
	};
	onMessage: {
		addListener(callback: (message: unknown) => void): void;
		removeListener(callback: (message: unknown) => void): void;
	};
	onDisconnect: {
		addListener(callback: () => void): void;
		removeListener(callback: () => void): void;
	};
	postMessage(message: unknown): void;
	disconnect(): void;
};

type OnConnectEvent = {
	addListener(callback: (port: Port) => void): void;
	removeListener(callback: (port: Port) => void): void;
};

// ============ 消息协议 ============

const PROTOCOL_VERSION = 1;

type Envelope =
	| { type: "handshake"; sessionId: string; payload: { handshakeId: string } }
	| { type: "handshake_ack"; sessionId: string; payload: HandshakeAckPayload }
	| { type: "request"; sessionId: string; id: string; payload: RpcRequest }
	| { type: "response"; sessionId: string; id: string; payload: RpcResponse }
	| { type: "event"; sessionId: string; payload: { event: string; params: unknown[] } };

type HandshakeAckPayload = {
	protocolVersion: number;
	handshakeId: string;
	chainId: string;
	accounts: string[];
	isUnlocked: boolean;
};

// ============ Config ============

export type PortTransportConfig = {
	/** 频道名称，用于过滤连接 */
	channel: string;
	/** 从 Port 解析 origin */
	resolveOrigin: (port: Port) => string;
	/** browser.runtime.onConnect 事件 */
	onConnect: OnConnectEvent;
	/** 获取初始握手数据 */
	getHandshakeData?: () => {
		chainId: string;
		accounts: string[];
		isUnlocked: boolean;
	};
};

// ============ Transport Factory ============

/**
 * 创建 Port Transport
 */
export const createPortTransport = (config: PortTransportConfig): Transport => {
	const { channel, resolveOrigin, onConnect, getHandshakeData } = config;

	const ports = new Map<string, Port>();
	const sessions = new Map<string, string>(); // connectionId -> sessionId
	const eventHandlers = new Set<(event: ConnectionEvent) => void>();

	let connectListener: ((port: Port) => void) | null = null;

	// ============ 内部方法 ============

	const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

	const emit = (event: ConnectionEvent) => {
		for (const handler of eventHandlers) {
			try {
				handler(event);
			} catch (e) {
				console.error("[PortTransport] Event handler error:", e);
			}
		}
	};

	const sendEnvelope = (connectionId: string, envelope: Envelope): boolean => {
		const port = ports.get(connectionId);
		if (!port) return false;

		try {
			port.postMessage(envelope);
			return true;
		} catch (e) {
			console.warn("[PortTransport] postMessage failed:", e);
			return false;
		}
	};

	const handlePort = (port: Port) => {
		if (port.name !== channel) return;

		const connectionId = generateId();
		const origin = resolveOrigin(port);

		ports.set(connectionId, port);

		// 消息处理
		const onMessage = (message: unknown) => {
			const envelope = message as Envelope | undefined;
			if (!envelope || typeof envelope !== "object") return;

			switch (envelope.type) {
				case "handshake": {
					sessions.set(connectionId, envelope.sessionId);

					const data = getHandshakeData?.() ?? {
						chainId: "0x1",
						accounts: [],
						isUnlocked: false,
					};

					const ackEnvelope: Envelope = {
						type: "handshake_ack",
						sessionId: envelope.sessionId,
						payload: {
							protocolVersion: PROTOCOL_VERSION,
							handshakeId: envelope.payload.handshakeId,
							...data,
						},
					};

					sendEnvelope(connectionId, ackEnvelope);

					emit({
						type: "connected",
						connection: {
							id: connectionId,
							origin,
							sessionId: envelope.sessionId,
							state: "connected",
							connectedAt: Date.now(),
						},
					});
					break;
				}

				case "request": {
					const sessionId = sessions.get(connectionId);
					if (!sessionId || sessionId !== envelope.sessionId) return;

					emit({
						type: "request",
						connectionId,
						request: envelope.payload,
					});
					break;
				}
			}
		};

		// 断开处理
		const onDisconnect = () => {
			port.onMessage.removeListener(onMessage);
			port.onDisconnect.removeListener(onDisconnect);

			const sessionId = sessions.get(connectionId);
			ports.delete(connectionId);
			sessions.delete(connectionId);

			if (sessionId) {
				emit({
					type: "disconnected",
					connectionId,
					reason: "port disconnected",
				});
			}
		};

		port.onMessage.addListener(onMessage);
		port.onDisconnect.addListener(onDisconnect);
	};

	// ============ Transport 接口实现 ============

	const start = () => {
		if (connectListener) return;
		connectListener = handlePort;
		onConnect.addListener(connectListener);
	};

	const stop = () => {
		if (!connectListener) return;
		onConnect.removeListener(connectListener);
		connectListener = null;

		// 断开所有连接
		for (const [connectionId, port] of ports) {
			try {
				port.disconnect();
			} catch {
				// ignore
			}
			emit({ type: "disconnected", connectionId, reason: "transport stopped" });
		}
		ports.clear();
		sessions.clear();
	};

	const send = (connectionId: string, response: RpcResponse) => {
		const sessionId = sessions.get(connectionId);
		if (!sessionId) return;

		sendEnvelope(connectionId, {
			type: "response",
			sessionId,
			id: String(response.id),
			payload: response,
		});
	};

	const broadcast = (event: ProviderEventType, params: unknown[]) => {
		for (const [connectionId] of ports) {
			const sessionId = sessions.get(connectionId);
			if (!sessionId) continue;

			sendEnvelope(connectionId, {
				type: "event",
				sessionId,
				payload: { event, params },
			});
		}
	};

	const emitEvent = (connectionId: string, event: ProviderEventType, params: unknown[]) => {
		const sessionId = sessions.get(connectionId);
		if (!sessionId) return;

		sendEnvelope(connectionId, {
			type: "event",
			sessionId,
			payload: { event, params },
		});
	};

	const disconnect = (connectionId: string, reason?: string) => {
		const port = ports.get(connectionId);
		if (!port) return;

		try {
			port.disconnect();
		} catch {
			// ignore
		}

		ports.delete(connectionId);
		sessions.delete(connectionId);
		emit({ type: "disconnected", connectionId, reason });
	};

	const getConnections = (): Connection[] => {
		const result: Connection[] = [];
		for (const [connectionId, port] of ports) {
			const sessionId = sessions.get(connectionId);
			if (!sessionId) continue;

			result.push({
				id: connectionId,
				origin: resolveOrigin(port),
				sessionId,
				state: "connected",
				connectedAt: 0, // 可以存储实际时间
			});
		}
		return result;
	};

	const onEvent = (handler: (event: ConnectionEvent) => void) => {
		eventHandlers.add(handler);
		return () => eventHandlers.delete(handler);
	};

	return {
		start,
		stop,
		send,
		broadcast,
		emit: emitEvent,
		disconnect,
		getConnections,
		onEvent,
	};
};

