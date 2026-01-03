/**
 * RPC Types
 *
 * 业务类型定义，JSON-RPC 基础类型直接使用 @metamask/utils
 */
import type { Json } from "@metamask/utils";
import {
	ErrorCodes,
	RpcErrorCodes,
	ProviderErrorCodes,
	WalletErrorCodes,
} from "../errors";

// Re-export MetaMask types for convenience
export type {
	Json,
	JsonRpcParams,
	JsonRpcRequest,
	JsonRpcResponse,
	JsonRpcError,
} from "@metamask/utils";

// ============ RPC Context ============

/** 调用来源 */
export type RpcSource = "dapp" | "internal";

/** 请求执行上下文 */
export type RpcContext = {
	/** 请求来源 (dApp origin) */
	readonly origin: string;
	/** 目标链 ID (CAIP-2 格式，如 "eip155:1") */
	readonly chainId: string;
	/** 协议命名空间 (如 "eip155") */
	readonly namespace: string;
	/** 会话 ID */
	readonly sessionId?: string;
	/** 调用来源类型 */
	readonly source: RpcSource;
};

// ============ 错误码 (使用统一错误模块) ============

/**
 * RPC 错误码
 *
 * 整合了 JSON-RPC 2.0、EIP-1193 和钱包业务错误码
 * @see @repo/core/errors 获取完整错误码列表
 */
export const RpcErrorCode = {
	// JSON-RPC 2.0 标准
	ParseError: RpcErrorCodes.ParseError,
	InvalidRequest: RpcErrorCodes.InvalidRequest,
	MethodNotFound: RpcErrorCodes.MethodNotFound,
	InvalidParams: RpcErrorCodes.InvalidParams,
	InternalError: RpcErrorCodes.InternalError,

	// EIP-1193 Provider Errors
	UserRejected: ProviderErrorCodes.UserRejected,
	Unauthorized: ProviderErrorCodes.Unauthorized,
	UnsupportedMethod: ProviderErrorCodes.UnsupportedMethod,
	Disconnected: ProviderErrorCodes.Disconnected,
	ChainDisconnected: ProviderErrorCodes.ChainDisconnected,

	// 自定义 Wallet Errors
	WalletLocked: WalletErrorCodes.WalletLocked,
	ChainNotSupported: WalletErrorCodes.ChainNotSupported,
	ValidationFailed: WalletErrorCodes.ValidationFailed,
	VaultNotFound: WalletErrorCodes.VaultNotFound,
	AccountNotFound: WalletErrorCodes.AccountNotFound,
	PermissionDenied: WalletErrorCodes.PermissionDenied,
} as const;

export type RpcErrorCodeType = (typeof RpcErrorCode)[keyof typeof RpcErrorCode];

// ============ 权限类型 ============

export const PermissionScope = {
	/** 公开方法（无需权限） */
	Public: "public",
	/** 账户访问 */
	Accounts: "accounts",
	/** 签名权限 */
	Sign: "sign",
	/** 交易权限 */
	Transaction: "transaction",
} as const;

export type PermissionScopeType = (typeof PermissionScope)[keyof typeof PermissionScope];

// ============ Provider 事件 (EIP-1193) ============

export const ProviderEvent = {
	Connect: "connect",
	Disconnect: "disconnect",
	ChainChanged: "chainChanged",
	AccountsChanged: "accountsChanged",
	Message: "message",
} as const;

export type ProviderEventType = (typeof ProviderEvent)[keyof typeof ProviderEvent];

// ============ 锁定行为 ============

export type LockedBehavior =
	| { readonly type: "allow" }
	| { readonly type: "deny" }
	| { readonly type: "respond"; readonly value: Json };

export const WhenLocked = {
	allow: (): LockedBehavior => ({ type: "allow" }),
	deny: (): LockedBehavior => ({ type: "deny" }),
	respond: <T extends Json>(value: T): LockedBehavior => ({ type: "respond", value }),
} as const;
