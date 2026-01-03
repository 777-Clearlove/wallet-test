/**
 * Provider Host
 *
 * 负责管理和注入 Provider 到页面
 */
import {
	createProviderRegistry,
	EIP155_NAMESPACE,
	type ProviderEntry,
	type ProviderRegistry,
} from "../registry";
import type { EIP1193Provider, Transport, TransportMeta, TransportState } from "../types";

const WINDOW_ETH_PROP = "ethereum";

/**
 * Provider Host 功能配置
 */
export type ProviderHostFeatures = {
	/** 是否启用 EIP-6963 */
	eip6963?: boolean;
};

/**
 * TypeScript 的 lib.dom 没有将 Event/CustomEvent 建模为 Window 属性，
 * 但它们在运行时存在于每个 realm 中。
 * 我们使用提供的 targetWindow 的构造函数来确保事件在正确的 realm 中创建。
 */
export type ProviderHostWindow = Window & {
	Event: typeof Event;
	CustomEvent: typeof CustomEvent;
};

/**
 * Provider Host 配置
 */
export type ProviderHostOptions = {
	targetWindow: ProviderHostWindow;
	transport: Transport;
	registry?: ProviderRegistry;
	features?: ProviderHostFeatures;
};

/**
 * Provider Host
 *
 * 管理 Provider 的注册、创建和注入
 */
export class ProviderHost {
	#targetWindow: ProviderHostWindow;
	#transport: Transport;
	#providers = new Map<string, ProviderEntry>();
	#registry: ProviderRegistry;

	#features: Required<ProviderHostFeatures>;

	#eip6963Registered = false;
	#injectedEthereum: EIP1193Provider | null = null;

	#initialized = false;
	#initializedEventDispatched = false;

	constructor(options: ProviderHostOptions) {
		this.#targetWindow = options.targetWindow;
		this.#transport = options.transport;
		this.#registry = options.registry ?? createProviderRegistry();
		this.#features = { eip6963: options.features?.eip6963 ?? true };
	}

	/**
	 * 初始化 Provider Host
	 *
	 * - 注册 transport 监听器
	 * - 创建并注入 Provider
	 * - 注册 EIP-6963 支持
	 */
	initialize() {
		if (this.#initialized) return;
		this.#initialized = true;

		this.#registerTransportListeners();

		this.#getOrCreateProvider(EIP155_NAMESPACE);

		if (this.#features.eip6963) {
			this.#registerEip6963Listener();
			this.#announceProviders();
		}

		this.#dispatchEthereumInitialized();
		void this.#connectToTransport();
	}

	async #connectToTransport() {
		try {
			await this.#transport.connect();
		} catch (error) {
			// Best-effort: 不阻塞注入流程
			console.debug("[provider-host] transport connect failed", error);
			return;
		}

		this.#syncProvidersFromState(this.#transport.getConnectionState());
	}

	#dispatchEthereumInitialized() {
		if (this.#initializedEventDispatched) return;
		if (!this.#injectedEthereum) return;

		this.#initializedEventDispatched = true;
		this.#targetWindow.dispatchEvent(new this.#targetWindow.Event("ethereum#initialized"));
	}

	#registerTransportListeners() {
		this.#transport.on("connect", this.#handleTransportConnect);
		this.#transport.on("disconnect", this.#handleTransportDisconnect);
	}

	#getOrCreateProvider(namespace: string): EIP1193Provider | null {
		if (this.#providers.has(namespace)) return this.#providers.get(namespace)!.proxy;

		const factory = this.#registry.factories[namespace];
		if (!factory) return null;

		const entry = factory({ transport: this.#transport });
		this.#providers.set(namespace, entry);

		const injection = this.#registry.injectionByNamespace[namespace];
		if (injection?.windowKey) {
			this.#injectWindowProvider(injection.windowKey, entry.proxy);
		}

		return entry.proxy;
	}

	#injectWindowProvider(windowKey: string, provider: EIP1193Provider) {
		if (windowKey === WINDOW_ETH_PROP) {
			this.#injectWindowEthereum(provider);
			return;
		}
	}

	#syncProvidersFromState(state: TransportState) {
		const namespaces = this.#extractNamespaces(state.meta, state.caip2);
		for (const namespace of namespaces) {
			this.#getOrCreateProvider(namespace);
		}
	}

	#extractNamespaces(meta: TransportMeta | null | undefined, fallback: string | null) {
		const namespaces = new Set<string>();

		if (meta?.activeNamespace) namespaces.add(meta.activeNamespace);

		if (meta?.supportedChains?.length) {
			for (const chainRef of meta.supportedChains) {
				const [namespace] = chainRef.split(":");
				if (namespace) namespaces.add(namespace);
			}
		}

		if (fallback) {
			const [namespace] = fallback.split(":");
			if (namespace) namespaces.add(namespace);
		}

		return namespaces;
	}

	#registerEip6963Listener() {
		if (this.#eip6963Registered) return;
		this.#targetWindow.addEventListener("eip6963:requestProvider", this.#handleProviderRequest);
		this.#eip6963Registered = true;
	}

	#handleProviderRequest = () => {
		this.#syncProvidersFromState(this.#transport.getConnectionState());
		this.#announceProviders();
	};

	#announceProviders() {
		const evmEntry = this.#providers.get(EIP155_NAMESPACE);
		if (!evmEntry) return;

		this.#targetWindow.dispatchEvent(
			new this.#targetWindow.CustomEvent("eip6963:announceProvider", {
				detail: { info: evmEntry.info, provider: evmEntry.proxy },
			}),
		);
	}

	#injectWindowEthereum(proxy: EIP1193Provider) {
		if (this.#injectedEthereum === proxy) return;

		const hostWindow = this.#targetWindow as unknown as Window;
		const hasProvider = Object.hasOwn(hostWindow, WINDOW_ETH_PROP);
		if (hasProvider) return;

		Object.defineProperty(hostWindow, WINDOW_ETH_PROP, {
			configurable: true,
			enumerable: false,
			value: proxy,
			writable: false,
		});

		this.#injectedEthereum = proxy;
	}

	#handleTransportConnect = () => {
		const state = this.#transport.getConnectionState();
		this.#syncProvidersFromState(state);
	};

	#handleTransportDisconnect = () => {
		// no-op
	};
}

/**
 * 创建 Provider Host
 */
export const createProviderHost = (options: ProviderHostOptions) => new ProviderHost(options);

