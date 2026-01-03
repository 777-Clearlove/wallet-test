/**
 * Transport Types
 *
 * 页面侧 Transport 接口定义
 */
import type {
	Json,
	JsonRpcError,
	JsonRpcParams,
	JsonRpcRequest,
	JsonRpcResponse,
	JsonRpcSuccess,
	JsonRpcVersion2,
} from "@metamask/utils";

import type { EIP1193ProviderRpcError, RequestArguments } from "./eip1193";

export type JsonRpcId = JsonRpcRequest<JsonRpcParams>["id"];
export type TransportRequest = JsonRpcRequest<JsonRpcParams>;
export type TransportSuccess = JsonRpcSuccess<Json>;
export type TransportError = JsonRpcError;
export type TransportResponse = JsonRpcResponse<Json>;

/**
 * Transport 元数据
 */
export type TransportMeta = {
	/** 当前活跃链 (CAIP-2 格式，如 "eip155:1") */
	activeChain: string;
	/** 当前活跃命名空间 (如 "eip155") */
	activeNamespace: string;
	/** 支持的链列表 (CAIP-2 格式) */
	supportedChains: string[];
};

/**
 * Transport 连接状态
 */
export type TransportState = {
	connected: boolean;
	chainId: string | null;
	caip2: string | null;
	accounts: string[];
	isUnlocked: boolean | null;
	meta: TransportMeta | null;
};

/**
 * Transport 请求选项
 */
export type TransportRequestOptions = {
	timeoutMs?: number;
};

/**
 * Transport 接口
 *
 * 页面侧用于与 content script / background 通信
 */
export interface Transport {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	isConnected(): boolean;
	getConnectionState(): TransportState;
	request(args: RequestArguments, options?: TransportRequestOptions): Promise<unknown>;
	on(event: string, listener: (...args: unknown[]) => void): void;
	removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * 事件消息
 */
export interface EventMessage {
	type: "event";
	eventName: string;
	params: unknown[];
}

export type TransportMessage = TransportRequest | TransportResponse | EventMessage;

export type { JsonRpcVersion2, EIP1193ProviderRpcError };

