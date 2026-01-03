/**
 * EIP-155 Provider Constants
 */

export const DEFAULT_NAMESPACE = "eip155" as const;

/**
 * Provider 信息 (EIP-6963)
 */
export const PROVIDER_INFO = {
	uuid: "mega-wallet-eip155-provider",
	name: "Mega Wallet",
	icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiByeD0iNDAiIGZpbGw9IiMxQTFBMkUiLz4KPHBhdGggZD0iTTYwIDEzMFY3MEw5NSAxMDBMMTMwIDcwVjEzMCIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjEyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTE0NSA3MEwxNDUgMTMwIiBzdHJva2U9IiNGRkZGRkYiIHN0cm9rZS13aWR0aD0iMTIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K",
	rdns: "wallet.mega",
} as const;

/**
 * 可在未完全就绪时提前响应的方法
 */
export const READONLY_EARLY = new Set(["eth_chainId", "eth_accounts"]);

/**
 * 超时配置
 */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 10 * 60_000;
export const DEFAULT_NORMAL_TIMEOUT_MS = 120_000;
export const DEFAULT_READONLY_TIMEOUT_MS = 60_000;

export const DEFAULT_READY_TIMEOUT_MS = 10_000;
export const DEFAULT_ETH_ACCOUNTS_WAIT_MS = 200;

/**
 * 需要用户审批的方法（超时较长）
 */
export const DEFAULT_APPROVAL_METHODS = new Set<string>([
	"eth_requestAccounts",
	"personal_sign",
	"eth_sign",
	"eth_signTypedData",
	"eth_signTypedData_v3",
	"eth_signTypedData_v4",
	"eth_sendTransaction",
	"wallet_addEthereumChain",
	"wallet_switchEthereumChain",
	"wallet_requestPermissions",
	"wallet_watchAsset",
]);

/**
 * 只读方法（超时较短）
 */
export const DEFAULT_READONLY_METHODS = new Set<string>([
	"eth_chainId",
	"eth_accounts",
	"net_version",
	"web3_clientVersion",
	"eth_blockNumber",
	"eth_getBalance",
	"eth_getCode",
	"eth_call",
	"eth_getTransactionCount",
	"eth_getLogs",
	"eth_getBlockByHash",
	"eth_getBlockByNumber",
	"eth_getTransactionByHash",
	"eth_getTransactionReceipt",
	"eth_feeHistory",
	"eth_gasPrice",
	"eth_maxPriorityFeePerGas",
]);

