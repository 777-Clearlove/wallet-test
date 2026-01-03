/**
 * EIP-155 Protocol
 *
 * 以太坊 JSON-RPC 方法处理
 */
import { createProtocolDef } from "../protocol";
import { PermissionScope, WhenLocked } from "../types";

// ============ Services 切片 ============

/** EIP-155 所需的 Services */
export type Eip155Services = {
	network: {
		getActiveChain(): { chainId: string; chainRef: string };
		switchChain(chainRef: string): Promise<void>;
	};
	accounts: {
		getAccounts(params: { chainRef: string }): string[];
	};
	permission: {
		getPermittedAccounts(origin: string, chainRef: string): string[];
		hasPermission(origin: string, permission: string, chainRef: string): boolean;
	};
};

// 创建类型绑定的定义器
const define = createProtocolDef<Eip155Services>();

// ============ Protocol Definition ============

export const eip155 = define({
	name: "eip155",
	prefixes: ["eth_", "personal_", "wallet_", "net_", "web3_"],

	methods: {
		// ─────────────────────────────────────────
		// 基础方法 (public)
		// ─────────────────────────────────────────

		eth_chainId: {
			scope: PermissionScope.Public,
			locked: WhenLocked.allow(),
			handler: ({ services }) => services.network.getActiveChain().chainId,
		},

		// ─────────────────────────────────────────
		// 账户方法
		// ─────────────────────────────────────────

		eth_accounts: {
			scope: PermissionScope.Accounts,
			locked: WhenLocked.respond([]),
			handler: ({ context, services }) => {
				const { chainRef } = services.network.getActiveChain();
				return services.permission.getPermittedAccounts(context.origin, chainRef);
			},
		},

		eth_requestAccounts: {
			scope: PermissionScope.Accounts,
			approval: true,
			bootstrap: true,
			handler: async ({ services }) => {
				// TODO: 集成审批流程
				const { chainRef } = services.network.getActiveChain();
				return services.accounts.getAccounts({ chainRef });
			},
		},

		// ─────────────────────────────────────────
		// 链管理
		// ─────────────────────────────────────────

		wallet_switchEthereumChain: {
			scope: PermissionScope.Public,
			approval: true,
			handler: async ({ request, services }) => {
				const params = request.params as [{ chainId: string }] | undefined;
				const chainId = params?.[0]?.chainId;
				if (!chainId) throw new Error("Missing chainId parameter");

				// 转换 chainId 为 chainRef (eip155:xxx)
				const decimal = Number.parseInt(chainId, 16);
				const chainRef = `eip155:${decimal}`;

				await services.network.switchChain(chainRef);
				return null;
			},
		},

		// ─────────────────────────────────────────
		// 签名方法 (待实现)
		// ─────────────────────────────────────────

		// personal_sign: { ... }
		// eth_signTypedData_v4: { ... }
		// eth_sendTransaction: { ... }
	},

	// ─────────────────────────────────────────
	// 代理方法 - 直通 RPC 节点
	// ─────────────────────────────────────────

	proxy: {
		methods: [
			// 区块
			"eth_blockNumber",
			"eth_getBlockByNumber",
			"eth_getBlockByHash",
			"eth_getBlockTransactionCountByHash",
			"eth_getBlockTransactionCountByNumber",

			// 状态查询
			"eth_getBalance",
			"eth_getTransactionCount",
			"eth_getCode",
			"eth_getStorageAt",
			"eth_call",
			"eth_estimateGas",

			// 交易查询
			"eth_getTransactionByHash",
			"eth_getTransactionByBlockHashAndIndex",
			"eth_getTransactionByBlockNumberAndIndex",
			"eth_getTransactionReceipt",
			"eth_getLogs",

			// Gas
			"eth_gasPrice",
			"eth_feeHistory",
			"eth_maxPriorityFeePerGas",

			// 网络
			"net_version",
			"net_listening",
			"web3_clientVersion",
		],

		whenLocked: [
			"eth_blockNumber",
			"eth_getBlockByNumber",
			"eth_getBlockByHash",
			"eth_getBalance",
			"eth_getCode",
			"eth_call",
			"eth_estimateGas",
			"eth_getTransactionByHash",
			"eth_getTransactionReceipt",
			"eth_getLogs",
			"eth_gasPrice",
			"eth_feeHistory",
			"net_version",
			"web3_clientVersion",
		],
	},
});

// ============ 类型导出 ============

export type Eip155Protocol = typeof eip155;
