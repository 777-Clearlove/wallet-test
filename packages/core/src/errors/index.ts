/**
 * Unified Error Module
 *
 * 统一的错误处理模块，提供：
 * - 统一的错误码体系 (JSON-RPC + EIP-1193 + 业务错误)
 * - WalletError 类及工厂函数
 * - 错误转换和类型守卫
 *
 * @example
 * ```ts
 * import { WalletError, ErrorCodes, rpcErrors, walletErrors } from "@repo/core/errors";
 *
 * // 使用工厂函数创建错误
 * throw rpcErrors.invalidParams({ message: "Missing required field" });
 * throw walletErrors.vaultNotFound({ data: { vaultId: "123" } });
 *
 * // 从其他错误转换
 * catch (error) {
 *   throw WalletError.from(error);
 * }
 *
 * // 检查错误类型
 * if (WalletError.isWalletError(error) && error.is(ErrorCodes.WalletLocked)) {
 *   // 处理钱包锁定错误
 * }
 * ```
 */

// Error Codes
export {
	RpcErrorCodes,
	ProviderErrorCodes,
	WalletErrorCodes,
	ErrorCodes,
	defaultMessages,
	getDefaultMessage,
	isRpcErrorCode,
	isProviderErrorCode,
	isWalletErrorCode,
	type RpcErrorCode,
	type ProviderErrorCode,
	type WalletErrorCode,
	type ErrorCode,
} from "./codes";

// WalletError Class & Factories
export {
	WalletError,
	type WalletErrorOptions,
	hasErrorCode,
	rpcErrors,
	providerErrors,
	walletErrors,
	customError,
} from "./walletError";

