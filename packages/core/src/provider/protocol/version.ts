/**
 * Protocol Version
 *
 * 用于 handshake 时验证协议兼容性
 */
export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

