/**
 * Transport Meta Utilities
 */
import type { TransportMeta } from "../types/transport";

/**
 * 深拷贝 TransportMeta
 */
export const cloneTransportMeta = (meta: TransportMeta): TransportMeta => ({
	activeChain: meta.activeChain,
	activeNamespace: meta.activeNamespace,
	supportedChains: [...meta.supportedChains],
});

/**
 * 验证是否为有效的 TransportMeta
 */
export const isTransportMeta = (value: unknown): value is TransportMeta => {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<TransportMeta>;
	if (typeof candidate.activeChain !== "string") return false;
	if (typeof candidate.activeNamespace !== "string") return false;
	if (!Array.isArray(candidate.supportedChains)) return false;
	return candidate.supportedChains.every((chain) => typeof chain === "string");
};

