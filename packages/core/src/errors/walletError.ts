/**
 * WalletError - 统一钱包错误类
 *
 * 特点：
 * - 统一的错误码体系
 * - 支持错误链 (cause)
 * - 可序列化为 JSON-RPC 错误格式
 * - 支持附加数据
 * - 类型安全的错误创建
 */
import type { JsonRpcError as MetaMaskJsonRpcError } from "@metamask/utils";
import type { z } from "zod";
import { type ErrorCode, getDefaultMessage, ErrorCodes } from "./codes";

// ============ Error Options ============

export type WalletErrorOptions = {
	/** 错误消息（可选，默认使用错误码对应的消息） */
	message?: string;
	/** 附加数据 */
	data?: unknown;
	/** 原始错误（用于错误链） */
	cause?: unknown;
};

// ============ WalletError Class ============

/**
 * 统一钱包错误类
 */
export class WalletError extends Error {
	/** 错误码 */
	readonly code: ErrorCode;
	/** 附加数据 */
	readonly data?: unknown;

	constructor(code: ErrorCode, options: WalletErrorOptions = {}) {
		const message = options.message ?? getDefaultMessage(code);
		super(message, { cause: options.cause });

		this.name = "WalletError";
		this.code = code;
		if (options.data !== undefined) {
			this.data = options.data;
		}
	}

	/**
	 * 转换为 JSON-RPC 错误格式
	 */
	toJsonRpcError(): { code: number; message: string; data?: unknown } {
		return {
			code: this.code,
			message: this.message,
			...(this.data !== undefined ? { data: this.data } : {}),
		};
	}

	/**
	 * 转换为 JSON 格式（用于序列化）
	 */
	toJSON(): { code: number; message: string; data?: unknown; stack?: string } {
		return {
			code: this.code,
			message: this.message,
			...(this.data !== undefined ? { data: this.data } : {}),
			...(this.stack ? { stack: this.stack } : {}),
		};
	}

	/**
	 * 检查是否为特定错误码
	 */
	is(code: ErrorCode): boolean {
		return this.code === code;
	}

	/**
	 * 从未知错误创建 WalletError
	 */
	static from(error: unknown, defaultCode: ErrorCode = ErrorCodes.InternalError): WalletError {
		if (error instanceof WalletError) {
			return error;
		}

		if (error instanceof Error) {
			// 检查是否有 code 属性
			const maybeCodedError = error as { code?: number; data?: unknown };
			if (typeof maybeCodedError.code === "number") {
				return new WalletError(maybeCodedError.code as ErrorCode, {
					message: error.message,
					data: maybeCodedError.data,
					cause: error,
				});
			}

			return new WalletError(defaultCode, {
				message: error.message,
				cause: error,
			});
		}

		return new WalletError(defaultCode, {
			message: String(error),
			data: { originalError: error },
		});
	}

	/**
	 * 从 JSON-RPC 错误对象创建
	 */
	static fromJsonRpcError(
		rpcError: { code: number; message: string; data?: unknown },
		cause?: unknown,
	): WalletError {
		return new WalletError(rpcError.code as ErrorCode, {
			message: rpcError.message,
			data: rpcError.data,
			cause,
		});
	}

	/**
	 * 从 Zod 验证错误创建
	 */
	static fromZodError(zodError: z.ZodError, message?: string): WalletError {
		const flattened = zodError.flatten();
		const fieldEntries = Object.entries(flattened.fieldErrors);
		const fieldErrors = fieldEntries
			.filter(([, errors]) => Array.isArray(errors) && errors.length > 0)
			.map(([field, errors]) => `${field}: ${(errors as string[]).join(", ")}`)
			.join("; ");

		const formErrs = Array.isArray(flattened.formErrors) ? flattened.formErrors : [];
		const formErrors = formErrs.length > 0 ? formErrs.join("; ") : null;

		const errorDetails = [fieldErrors, formErrors].filter(Boolean).join("; ");
		const finalMessage = message ?? (errorDetails || "Validation failed");

		return new WalletError(ErrorCodes.ValidationFailed, {
			message: finalMessage,
			data: {
				zodError: zodError.format(),
				fieldErrors: flattened.fieldErrors,
				formErrors: flattened.formErrors,
			},
			cause: zodError,
		});
	}

	/**
	 * 检查一个错误是否为 WalletError
	 */
	static isWalletError(error: unknown): error is WalletError {
		return error instanceof WalletError;
	}
}

// ============ Type Guards ============

/**
 * 检查错误是否包含指定错误码
 */
export const hasErrorCode = (error: unknown, code: ErrorCode): boolean => {
	if (error instanceof WalletError) {
		return error.code === code;
	}
	if (error && typeof error === "object" && "code" in error) {
		return (error as { code: unknown }).code === code;
	}
	return false;
};

// ============ Error Factories ============

/**
 * 创建特定错误码的工厂函数
 */
const createErrorFactory =
	(code: ErrorCode) =>
	(options?: Omit<WalletErrorOptions, "code">) =>
		new WalletError(code, options);

// JSON-RPC 标准错误
export const rpcErrors = {
	parseError: createErrorFactory(ErrorCodes.ParseError),
	invalidRequest: createErrorFactory(ErrorCodes.InvalidRequest),
	methodNotFound: createErrorFactory(ErrorCodes.MethodNotFound),
	invalidParams: createErrorFactory(ErrorCodes.InvalidParams),
	internal: createErrorFactory(ErrorCodes.InternalError),
} as const;

// EIP-1193 Provider 错误
export const providerErrors = {
	userRejected: createErrorFactory(ErrorCodes.UserRejected),
	unauthorized: createErrorFactory(ErrorCodes.Unauthorized),
	unsupportedMethod: createErrorFactory(ErrorCodes.UnsupportedMethod),
	disconnected: createErrorFactory(ErrorCodes.Disconnected),
	chainDisconnected: createErrorFactory(ErrorCodes.ChainDisconnected),
} as const;

// 钱包业务错误
export const walletErrors = {
	// 通用
	generic: createErrorFactory(ErrorCodes.GenericError),
	validation: createErrorFactory(ErrorCodes.ValidationFailed),
	locked: createErrorFactory(ErrorCodes.WalletLocked),
	chainNotSupported: createErrorFactory(ErrorCodes.ChainNotSupported),
	timeout: createErrorFactory(ErrorCodes.Timeout),

	// Vault
	vaultNotFound: createErrorFactory(ErrorCodes.VaultNotFound),
	vaultAlreadyExists: createErrorFactory(ErrorCodes.VaultAlreadyExists),
	vaultTypeMismatch: createErrorFactory(ErrorCodes.VaultTypeMismatch),
	vaultDecryptionFailed: createErrorFactory(ErrorCodes.VaultDecryptionFailed),

	// Account
	accountNotFound: createErrorFactory(ErrorCodes.AccountNotFound),
	invalidDerivationPath: createErrorFactory(ErrorCodes.InvalidDerivationPath),
	derivationFailed: createErrorFactory(ErrorCodes.DerivationFailed),
	accountAlreadyExists: createErrorFactory(ErrorCodes.AccountAlreadyExists),

	// Transaction
	insufficientBalance: createErrorFactory(ErrorCodes.InsufficientBalance),
	invalidNonce: createErrorFactory(ErrorCodes.InvalidNonce),
	gasEstimationFailed: createErrorFactory(ErrorCodes.GasEstimationFailed),
	transactionRejected: createErrorFactory(ErrorCodes.TransactionRejected),
	signatureFailed: createErrorFactory(ErrorCodes.SignatureFailed),

	// Permission
	permissionDenied: createErrorFactory(ErrorCodes.PermissionDenied),
	permissionExpired: createErrorFactory(ErrorCodes.PermissionExpired),

	// Network
	networkUnavailable: createErrorFactory(ErrorCodes.NetworkUnavailable),
	rpcRequestFailed: createErrorFactory(ErrorCodes.RpcRequestFailed),

	// Storage
	storageReadFailed: createErrorFactory(ErrorCodes.StorageReadFailed),
	storageWriteFailed: createErrorFactory(ErrorCodes.StorageWriteFailed),
	hydrationFailed: createErrorFactory(ErrorCodes.HydrationFailed),
} as const;

/**
 * 自定义错误码的错误创建
 */
export const customError = (code: number, options?: WalletErrorOptions) => new WalletError(code as ErrorCode, options);

