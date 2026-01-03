/**
 * Logger Middleware
 *
 * 记录请求和响应的基本信息
 */
import type { WalletMiddleware } from "../engine";
import { getRpcContext } from "../engine";

/**
 * 创建日志中间件
 */
export const createLoggerMiddleware = <S>(): WalletMiddleware<S> => {
	return async ({ request, context, next }) => {
		const rpcCtx = getRpcContext(context);
		const prefix = `[RPC][${rpcCtx.source}]`;

		console.log(`${prefix} -> ${request.method}`, request.params);

		try {
			const result = await next();
			console.log(`${prefix} <- ${request.method} Success`);
			return result;
		} catch (error) {
			console.error(`${prefix} <- ${request.method} Error:`, error);
			throw error;
		}
	};
};
