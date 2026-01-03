/**
 * Message Envelope
 *
 * 定义页面与 content script 之间的消息格式
 */
import type { TransportMeta, TransportRequest, TransportResponse } from "../types/transport";
import { CHANNEL } from "./channel";
import type { ProtocolVersion } from "./version";
import { PROTOCOL_VERSION } from "./version";

/**
 * Handshake 请求载荷
 */
export type HandshakePayload = {
	protocolVersion?: ProtocolVersion | number;
	handshakeId: string;
};

/**
 * Handshake 响应载荷
 */
export type HandshakeAckPayload = {
	protocolVersion?: ProtocolVersion | number;
	handshakeId: string;
	chainId: string;
	caip2: string;
	accounts: string[];
	isUnlocked: boolean;
	meta: TransportMeta;
};

/**
 * 消息信封类型
 */
export type Envelope =
	| { channel: typeof CHANNEL; sessionId: string; type: "handshake"; payload: HandshakePayload }
	| { channel: typeof CHANNEL; sessionId: string; type: "handshake_ack"; payload: HandshakeAckPayload }
	| { channel: typeof CHANNEL; sessionId: string; type: "request"; id: string; payload: TransportRequest }
	| { channel: typeof CHANNEL; sessionId: string; type: "response"; id: string; payload: TransportResponse }
	| { channel: typeof CHANNEL; sessionId: string; type: "event"; payload: { event: string; params?: unknown[] } };

/**
 * 验证消息是否为有效的 Envelope
 */
export const isEnvelope = (value: unknown): value is Envelope => {
	if (!value || typeof value !== "object") return false;
	const candidate = value as { channel?: unknown; type?: unknown; sessionId?: unknown };
	return (
		candidate.channel === CHANNEL && typeof candidate.type === "string" && typeof candidate.sessionId === "string"
	);
};

/**
 * 解析协议版本
 */
export const resolveProtocolVersion = (value: unknown): ProtocolVersion | number => {
	if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
	return PROTOCOL_VERSION;
};

