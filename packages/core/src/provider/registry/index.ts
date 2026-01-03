/**
 * Provider Registry
 *
 * 管理不同命名空间的 Provider 工厂和注入配置
 */
import { createEip155InjectedProvider } from "../namespaces/eip155/injected";
import { Eip155Provider, type Eip155ProviderTimeouts } from "../namespaces/eip155/provider";
import type { EIP1193Provider, Transport } from "../types";

export const EIP155_NAMESPACE = "eip155" as const;

/**
 * Provider 条目
 */
export type ProviderEntry = {
	/** 原始 Provider 实例 */
	raw: EIP1193Provider;
	/** 代理后的 Provider（用于注入） */
	proxy: EIP1193Provider;
	/** Provider 信息 (EIP-6963) */
	info: typeof Eip155Provider.providerInfo;
};

/**
 * Provider 工厂函数
 */
export type ProviderFactory = (opts: { transport: Transport }) => ProviderEntry;

/**
 * Provider 注册表
 */
export type ProviderRegistry = {
	factories: Record<string, ProviderFactory>;
	injectionByNamespace: Record<string, { windowKey: string } | undefined>;
};

/**
 * Provider 注册表配置
 */
export type ProviderRegistryOptions = {
	ethereum?: {
		timeouts?: Eip155ProviderTimeouts;
	};
};

/**
 * 创建 Provider 注册表
 */
export const createProviderRegistry = (options: ProviderRegistryOptions = {}): ProviderRegistry => {
	const factories: Record<string, ProviderFactory> = {
		[EIP155_NAMESPACE]: ({ transport }) => {
			const timeouts = options.ethereum?.timeouts;
			const raw = timeouts ? new Eip155Provider({ transport, timeouts }) : new Eip155Provider({ transport });
			const proxy = createEip155InjectedProvider(raw);
			return { raw, proxy, info: Eip155Provider.providerInfo };
		},
	};

	const injectionByNamespace: Record<string, { windowKey: string } | undefined> = {
		[EIP155_NAMESPACE]: { windowKey: "ethereum" },
	};

	return { factories, injectionByNamespace };
};

