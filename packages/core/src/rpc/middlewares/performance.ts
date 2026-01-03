/**
 * Performance Middleware
 *
 * 记录请求处理耗时
 */
import type { WalletMiddleware } from "../engine";

export type PerformanceMiddlewareOptions = {
	/** 慢请求阈值 (毫秒)，超过此值打印警告 */
	slowThreshold?: number;
};

/**
 * 创建性能监控中间件
 */
export const createPerformanceMiddleware = <S>(
	options: PerformanceMiddlewareOptions = {},
): WalletMiddleware<S> => {
	const { slowThreshold = 1000 } = options;

	return async ({ request, next }) => {
		const start = performance.now();

		try {
			const result = await next();
			const duration = performance.now() - start;

			if (duration > slowThreshold) {
				console.warn(`[Slow RPC] ${request.method} took ${duration.toFixed(2)}ms`);
			}

			return result;
		} catch (error) {
			const duration = performance.now() - start;
			console.warn(`[Failed RPC] ${request.method} took ${duration.toFixed(2)}ms`);
			throw error;
		}
	};
};
