/**
 * Executor Middleware
 *
 * 核心执行器，根据 Protocol 定义执行方法或代理到 RPC 节点
 */
import type { Json } from "@metamask/utils";
import type { WalletMiddleware } from "../engine";
import { getRpcContext, getServices } from "../engine";
import type { ProtocolDef, MethodConfig } from "../protocol";
import { RpcErrorCode } from "../types";

// ============ Types ============

export type ExecutorDeps<S> = {
	/** 已注册的协议 */
	protocols: readonly ProtocolDef<S, Record<string, MethodConfig<S>>>[];
	/** 默认协议名称 */
	defaultProtocol?: string;
	/** 代理请求处理器 (直通 RPC 节点) */
	onProxy?: (chainId: string, method: string, params: unknown) => Promise<Json>;
};

// ============ Middleware Factory ============

/**
 * 创建执行器中间件
 */
export const createExecutorMiddleware = <S>(deps: ExecutorDeps<S>): WalletMiddleware<S> => {
	const { protocols, defaultProtocol, onProxy } = deps;

	return async ({ request, context }) => {
		const rpcCtx = getRpcContext(context);
		const services = getServices(context);

		// 1. 查找协议
		const protocol = findProtocol(protocols, request.method, rpcCtx.namespace, defaultProtocol);

		if (!protocol) {
			throw {
				code: RpcErrorCode.MethodNotFound,
				message: `Method not found: ${request.method}`,
			};
		}

		// 2. 查找方法定义
		const methodDef = protocol.methods[request.method];

		if (methodDef) {
			// 执行已定义的方法
			return methodDef.handler({
				context: rpcCtx,
				request: { method: request.method, params: request.params },
				services,
			});
		}

		// 3. 检查是否为代理方法
		const proxyMethods = protocol.proxy?.methods ?? [];

		if (proxyMethods.includes(request.method)) {
			if (!onProxy) {
				throw {
					code: RpcErrorCode.InternalError,
					message: "Proxy not configured",
				};
			}

			return onProxy(rpcCtx.chainId, request.method, request.params);
		}

		// 4. 方法未找到
		throw {
			code: RpcErrorCode.MethodNotFound,
			message: `Method not found: ${request.method}`,
		};
	};
};

// ============ Helpers ============

const findProtocol = <S>(
	protocols: readonly ProtocolDef<S, Record<string, MethodConfig<S>>>[],
	method: string,
	namespace?: string,
	defaultName?: string,
): ProtocolDef<S, Record<string, MethodConfig<S>>> | undefined => {
	// 1. 精确匹配 namespace
	if (namespace) {
		const exact = protocols.find((p) => p.name === namespace);
		if (exact) return exact;
	}

	// 2. 从方法前缀推断
	for (const protocol of protocols) {
		if (protocol.prefixes.some((prefix) => method.startsWith(prefix))) {
			return protocol;
		}
	}

	// 3. 默认协议
	if (defaultName) {
		return protocols.find((p) => p.name === defaultName);
	}

	// 4. 第一个
	return protocols[0];
};

