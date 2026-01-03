/**
 * Provider Errors
 *
 * 页面侧 Provider 错误工厂
 * 基于统一错误模块，提供向后兼容的 API
 *
 * @see https://eips.ethereum.org/EIPS/eip-1193
 * @see https://eips.ethereum.org/EIPS/eip-1474
 */
import {
	WalletError,
	ErrorCodes,
	RpcErrorCodes,
	ProviderErrorCodes,
	type WalletErrorOptions,
} from "../errors";

// Re-export for convenience
export { ErrorCodes, RpcErrorCodes, ProviderErrorCodes };

// ============ Legacy Types (for backward compatibility) ============

export type RpcErrorPayload = { message?: string; data?: unknown };
export type ProviderErrorPayload = { message?: string; data?: unknown };
export type ProviderCustomPayload = { code: number; message: string; data?: unknown };

export type RpcErrorInstance = WalletError;
export type ProviderErrorInstance = WalletError;

// ============ Error Codes (legacy alias) ============

/** @deprecated Use ErrorCodes from @repo/core/errors instead */
export const errorCodes = {
	rpc: {
		parse: RpcErrorCodes.ParseError,
		invalidRequest: RpcErrorCodes.InvalidRequest,
		methodNotFound: RpcErrorCodes.MethodNotFound,
		invalidParams: RpcErrorCodes.InvalidParams,
		internal: RpcErrorCodes.InternalError,
	},
	provider: {
		userRejectedRequest: ProviderErrorCodes.UserRejected,
		unauthorized: ProviderErrorCodes.Unauthorized,
		unsupportedMethod: ProviderErrorCodes.UnsupportedMethod,
		disconnected: ProviderErrorCodes.Disconnected,
		chainDisconnected: ProviderErrorCodes.ChainDisconnected,
	},
} as const;

// ============ Factory Types ============

export type RpcErrorFactory = {
	parse(args?: RpcErrorPayload): WalletError;
	invalidRequest(args?: RpcErrorPayload): WalletError;
	invalidParams(args?: RpcErrorPayload): WalletError;
	methodNotFound(args?: RpcErrorPayload): WalletError;
	internal(args?: RpcErrorPayload): WalletError;
};

export type ProviderErrorFactory = {
	disconnected(args?: ProviderErrorPayload): WalletError;
	chainDisconnected(args?: ProviderErrorPayload): WalletError;
	unauthorized(args?: ProviderErrorPayload): WalletError;
	userRejectedRequest(args?: ProviderErrorPayload): WalletError;
	unsupportedMethod(args?: ProviderErrorPayload): WalletError;
	custom(args: ProviderCustomPayload): WalletError;
};

// ============ Helper ============

const toOptions = (args?: RpcErrorPayload): WalletErrorOptions | undefined => {
	if (!args) return undefined;
	return { message: args.message, data: args.data };
};

// ============ Factory Implementations ============

export const createEvmRpcErrors = (): RpcErrorFactory => ({
	parse: (args) => new WalletError(ErrorCodes.ParseError, toOptions(args)),
	invalidRequest: (args) => new WalletError(ErrorCodes.InvalidRequest, toOptions(args)),
	invalidParams: (args) => new WalletError(ErrorCodes.InvalidParams, toOptions(args)),
	methodNotFound: (args) => new WalletError(ErrorCodes.MethodNotFound, toOptions(args)),
	internal: (args) => new WalletError(ErrorCodes.InternalError, toOptions(args)),
});

export const createEvmProviderErrors = (): ProviderErrorFactory => ({
	disconnected: (args) => new WalletError(ErrorCodes.Disconnected, toOptions(args)),
	chainDisconnected: (args) => new WalletError(ErrorCodes.ChainDisconnected, toOptions(args)),
	unauthorized: (args) => new WalletError(ErrorCodes.Unauthorized, toOptions(args)),
	userRejectedRequest: (args) => new WalletError(ErrorCodes.UserRejected, toOptions(args)),
	unsupportedMethod: (args) => new WalletError(ErrorCodes.UnsupportedMethod, toOptions(args)),
	custom: (args) => new WalletError(args.code as any, { message: args.message, data: args.data }),
});

/** 预创建的 RPC 错误工厂实例 */
export const evmRpcErrors = createEvmRpcErrors();

/** 预创建的 Provider 错误工厂实例 */
export const evmProviderErrors = createEvmProviderErrors();
