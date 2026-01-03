/**
 * EIP-1193 Provider Types
 *
 * @see https://eips.ethereum.org/EIPS/eip-1193
 */
import type { JsonRpcParams, JsonRpcRequest } from "@metamask/utils";

export type RequestArguments = Readonly<Pick<JsonRpcRequest<JsonRpcParams>, "method" | "params">>;

export interface EIP1193Events {
	on(event: string, listener: (...args: unknown[]) => void): void;
	removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export interface EIP1193Provider extends EIP1193Events {
	request(args: RequestArguments): Promise<unknown>;
	isConnected(): boolean;
}

export interface EIP1193ProviderRpcError {
	code: number;
	message: string;
	data?: unknown;
}

