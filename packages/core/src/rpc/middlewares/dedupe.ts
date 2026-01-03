/**
 * Dedupe Middleware
 *
 * 请求去重 - 防止短时间内重复发送相同的只读请求
 */
import type { Json } from "@metamask/utils";
import type { WalletMiddleware } from "../engine";
import { getRpcContext } from "../engine";

const DEFAULT_DEDUPE_METHODS = [
	"eth_chainId",
	"eth_blockNumber",
	"eth_getBalance",
	"eth_getCode",
	"eth_gasPrice",
	"eth_estimateGas",
	"eth_call",
	"net_version",
	"web3_clientVersion",
];

export type DedupeMiddlewareOptions = {
	/** 允许去重的方法白名单 */
	methods?: string[];
};

/**
 * 创建请求去重中间件
 *
 * 如果一个请求正在处理中，后续相同的请求 (method + params) 会等待并复用结果
 */
export const createDedupeMiddleware = <S>(
	options: DedupeMiddlewareOptions = {},
): WalletMiddleware<S> => {
	const { methods = DEFAULT_DEDUPE_METHODS } = options;

	// 存储正在进行的请求 Promise
	const inflightRequests = new Map<string, Promise<Json | undefined>>();

	return async ({ request, context, next }) => {
		// 1. 如果不在白名单内，直接跳过
		if (!methods.includes(request.method)) {
			return next();
		}

		// 2. 生成请求指纹
		const rpcCtx = getRpcContext(context);
		const paramsKey = request.params ? JSON.stringify(request.params) : "[]";
		const dedupKey = `${rpcCtx.origin}::${request.method}::${paramsKey}`;

		// 3. 检查是否有正在进行的相同请求
		const existingPromise = inflightRequests.get(dedupKey);
		if (existingPromise) {
			return existingPromise;
		}

		// 4. 执行请求并缓存 Promise
		const promise = next();
		inflightRequests.set(dedupKey, promise);

		try {
			return await promise;
		} finally {
			inflightRequests.delete(dedupKey);
		}
	};
};
