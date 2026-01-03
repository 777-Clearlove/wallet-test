/**
 * Provider Module
 *
 * 提供页面侧 Provider 实现，用于 DApp 与钱包通信
 *
 * @example
 * ```ts
 * // inpage script (注入到 DApp 页面)
 * import { createProviderHost, WindowPostMessageTransport } from "@mega-wallet/core/provider";
 *
 * const transport = new WindowPostMessageTransport();
 * const host = createProviderHost({
 *   targetWindow: window,
 *   transport,
 * });
 *
 * host.initialize();
 * // window.ethereum 现在可用
 * ```
 */

// Types
export type {
	RequestArguments,
	EIP1193Events,
	EIP1193Provider,
	EIP1193ProviderRpcError,
	JsonRpcId,
	TransportRequest,
	TransportSuccess,
	TransportError,
	TransportResponse,
	TransportMeta,
	TransportState,
	TransportRequestOptions,
	Transport,
	EventMessage,
	TransportMessage,
	JsonRpcVersion2,
} from "./types";

// Protocol
export {
	CHANNEL,
	PROTOCOL_VERSION,
	type ProtocolVersion,
	type HandshakePayload,
	type HandshakeAckPayload,
	type Envelope,
	isEnvelope,
	resolveProtocolVersion,
} from "./protocol";

// Errors
export {
	errorCodes,
	evmRpcErrors,
	evmProviderErrors,
	createEvmRpcErrors,
	createEvmProviderErrors,
	type RpcErrorPayload,
	type ProviderErrorPayload,
	type ProviderCustomPayload,
	type RpcErrorInstance,
	type ProviderErrorInstance,
	type RpcErrorFactory,
	type ProviderErrorFactory,
} from "./errors";

// Transport
export { WindowPostMessageTransport, type WindowPostMessageTransportOptions } from "./transport";

// Utils
export { cloneTransportMeta, isTransportMeta } from "./utils";

// Namespaces
export {
	// Constants
	DEFAULT_NAMESPACE,
	PROVIDER_INFO,
	READONLY_EARLY,
	DEFAULT_APPROVAL_TIMEOUT_MS,
	DEFAULT_NORMAL_TIMEOUT_MS,
	DEFAULT_READONLY_TIMEOUT_MS,
	DEFAULT_READY_TIMEOUT_MS,
	DEFAULT_ETH_ACCOUNTS_WAIT_MS,
	DEFAULT_APPROVAL_METHODS,
	DEFAULT_READONLY_METHODS,
	// State
	Eip155ProviderState,
	type ProviderStateSnapshot,
	type ProviderSnapshot,
	type ProviderPatch,
	// Provider
	Eip155Provider,
	type Eip155ProviderOptions,
	type Eip155ProviderTimeouts,
	// Injected
	createEip155InjectedProvider,
} from "./namespaces/eip155";

// Registry
export {
	EIP155_NAMESPACE,
	createProviderRegistry,
	type ProviderEntry,
	type ProviderFactory,
	type ProviderRegistry,
	type ProviderRegistryOptions,
} from "./registry";

// Host
export {
	ProviderHost,
	createProviderHost,
	type ProviderHostFeatures,
	type ProviderHostWindow,
	type ProviderHostOptions,
} from "./host";

