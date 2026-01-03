/**
 * Unified Error Codes
 *
 * 统一的错误码定义，覆盖：
 * - JSON-RPC 2.0 标准错误 (-32700 ~ -32600)
 * - EIP-1193 Provider 错误 (4001, 4100, 4200, 4900, 4901)
 * - 钱包业务错误 (-32000 ~ -32099)
 *
 * @see https://www.jsonrpc.org/specification#error_object
 * @see https://eips.ethereum.org/EIPS/eip-1193
 * @see https://eips.ethereum.org/EIPS/eip-1474
 */

// ============ JSON-RPC 2.0 Standard Errors ============

/** JSON-RPC 2.0 标准错误码 */
export const RpcErrorCodes = {
	/** 无效 JSON (-32700) */
	ParseError: -32700,
	/** 无效请求 (-32600) */
	InvalidRequest: -32600,
	/** 方法不存在 (-32601) */
	MethodNotFound: -32601,
	/** 无效参数 (-32602) */
	InvalidParams: -32602,
	/** 内部错误 (-32603) */
	InternalError: -32603,
} as const;

export type RpcErrorCode = (typeof RpcErrorCodes)[keyof typeof RpcErrorCodes];

// ============ EIP-1193 Provider Errors ============

/** EIP-1193 Provider 错误码 */
export const ProviderErrorCodes = {
	/** 用户拒绝请求 (4001) */
	UserRejected: 4001,
	/** 未授权 (4100) */
	Unauthorized: 4100,
	/** 不支持的方法 (4200) */
	UnsupportedMethod: 4200,
	/** Provider 断开连接 (4900) */
	Disconnected: 4900,
	/** 链断开连接 (4901) */
	ChainDisconnected: 4901,
} as const;

export type ProviderErrorCode = (typeof ProviderErrorCodes)[keyof typeof ProviderErrorCodes];

// ============ Wallet Business Errors (-32000 ~ -32099) ============

/** 钱包业务错误码 */
export const WalletErrorCodes = {
	// 通用 (-32000 ~ -32009)
	/** 通用钱包错误 */
	GenericError: -32000,
	/** 验证失败 */
	ValidationFailed: -32001,
	/** 钱包已锁定 */
	WalletLocked: -32002,
	/** 链不支持 */
	ChainNotSupported: -32003,
	/** 操作超时 */
	Timeout: -32004,

	// Vault 相关 (-32010 ~ -32019)
	/** Vault 不存在 */
	VaultNotFound: -32010,
	/** Vault 已存在 */
	VaultAlreadyExists: -32011,
	/** Vault 类型不匹配 */
	VaultTypeMismatch: -32012,
	/** Vault 解密失败 */
	VaultDecryptionFailed: -32013,

	// 账户/派生 相关 (-32020 ~ -32029)
	/** 账户不存在 */
	AccountNotFound: -32020,
	/** 派生路径无效 */
	InvalidDerivationPath: -32021,
	/** 派生失败 */
	DerivationFailed: -32022,
	/** 账户已存在 */
	AccountAlreadyExists: -32023,

	// 交易相关 (-32030 ~ -32039)
	/** 余额不足 */
	InsufficientBalance: -32030,
	/** Nonce 错误 */
	InvalidNonce: -32031,
	/** Gas 估算失败 */
	GasEstimationFailed: -32032,
	/** 交易被拒绝 */
	TransactionRejected: -32033,
	/** 交易签名失败 */
	SignatureFailed: -32034,

	// 权限相关 (-32040 ~ -32049)
	/** 权限不足 */
	PermissionDenied: -32040,
	/** 权限已过期 */
	PermissionExpired: -32041,

	// 网络相关 (-32050 ~ -32059)
	/** 网络不可用 */
	NetworkUnavailable: -32050,
	/** RPC 请求失败 */
	RpcRequestFailed: -32051,

	// 存储相关 (-32060 ~ -32069)
	/** 存储读取失败 */
	StorageReadFailed: -32060,
	/** 存储写入失败 */
	StorageWriteFailed: -32061,
	/** 数据恢复失败 */
	HydrationFailed: -32062,
} as const;

export type WalletErrorCode = (typeof WalletErrorCodes)[keyof typeof WalletErrorCodes];

// ============ All Error Codes ============

/** 所有错误码 */
export const ErrorCodes = {
	...RpcErrorCodes,
	...ProviderErrorCodes,
	...WalletErrorCodes,
} as const;

export type ErrorCode = RpcErrorCode | ProviderErrorCode | WalletErrorCode;

// ============ Default Messages ============

/** 错误码对应的默认消息 */
export const defaultMessages: Record<ErrorCode, string> = {
	// JSON-RPC 2.0
	[RpcErrorCodes.ParseError]:
		"Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.",
	[RpcErrorCodes.InvalidRequest]: "The JSON sent is not a valid Request object.",
	[RpcErrorCodes.MethodNotFound]: "The method does not exist / is not available.",
	[RpcErrorCodes.InvalidParams]: "Invalid method parameter(s).",
	[RpcErrorCodes.InternalError]: "Internal JSON-RPC error.",

	// EIP-1193 Provider
	[ProviderErrorCodes.UserRejected]: "User rejected the request.",
	[ProviderErrorCodes.Unauthorized]: "The requested account and/or method has not been authorized by the user.",
	[ProviderErrorCodes.UnsupportedMethod]: "The requested method is not supported by this Ethereum provider.",
	[ProviderErrorCodes.Disconnected]: "The provider is disconnected from all chains.",
	[ProviderErrorCodes.ChainDisconnected]: "The provider is disconnected from the specified chain.",

	// Wallet Business
	[WalletErrorCodes.GenericError]: "An unexpected wallet error occurred.",
	[WalletErrorCodes.ValidationFailed]: "Validation failed.",
	[WalletErrorCodes.WalletLocked]: "Wallet is locked.",
	[WalletErrorCodes.ChainNotSupported]: "The requested chain is not supported.",
	[WalletErrorCodes.Timeout]: "Operation timed out.",

	[WalletErrorCodes.VaultNotFound]: "Vault not found.",
	[WalletErrorCodes.VaultAlreadyExists]: "Vault already exists.",
	[WalletErrorCodes.VaultTypeMismatch]: "Vault type mismatch.",
	[WalletErrorCodes.VaultDecryptionFailed]: "Failed to decrypt vault.",

	[WalletErrorCodes.AccountNotFound]: "Account not found.",
	[WalletErrorCodes.InvalidDerivationPath]: "Invalid derivation path.",
	[WalletErrorCodes.DerivationFailed]: "Derivation failed.",
	[WalletErrorCodes.AccountAlreadyExists]: "Account already exists.",

	[WalletErrorCodes.InsufficientBalance]: "Insufficient balance.",
	[WalletErrorCodes.InvalidNonce]: "Invalid nonce.",
	[WalletErrorCodes.GasEstimationFailed]: "Failed to estimate gas.",
	[WalletErrorCodes.TransactionRejected]: "Transaction was rejected.",
	[WalletErrorCodes.SignatureFailed]: "Failed to sign.",

	[WalletErrorCodes.PermissionDenied]: "Permission denied.",
	[WalletErrorCodes.PermissionExpired]: "Permission has expired.",

	[WalletErrorCodes.NetworkUnavailable]: "Network is unavailable.",
	[WalletErrorCodes.RpcRequestFailed]: "RPC request failed.",

	[WalletErrorCodes.StorageReadFailed]: "Failed to read from storage.",
	[WalletErrorCodes.StorageWriteFailed]: "Failed to write to storage.",
	[WalletErrorCodes.HydrationFailed]: "Failed to restore data from storage.",
};

/**
 * 获取错误码对应的默认消息
 */
export const getDefaultMessage = (code: ErrorCode): string => {
	return defaultMessages[code] ?? "Unknown error";
};

/**
 * 判断错误码是否为 JSON-RPC 标准错误
 */
export const isRpcErrorCode = (code: number): code is RpcErrorCode => {
	return code >= -32700 && code <= -32600;
};

/**
 * 判断错误码是否为 EIP-1193 Provider 错误
 */
export const isProviderErrorCode = (code: number): code is ProviderErrorCode => {
	return code >= 4001 && code <= 4901;
};

/**
 * 判断错误码是否为钱包业务错误
 */
export const isWalletErrorCode = (code: number): code is WalletErrorCode => {
	return code >= -32099 && code <= -32000;
};

