/**
 * Permission Guard Middleware
 *
 * 检查方法调用权限
 */
import type { WalletMiddleware } from "../engine";
import { getRpcContext, getServices } from "../engine";
import type { PermissionScopeType } from "../types";
import { RpcErrorCode } from "../types";

// ============ Types ============

export type PermissionGuardDeps<S> = {
	/** 检查是否为内部来源 (内部来源跳过权限检查) */
	isInternalOrigin?: (origin: string) => boolean;
	/** 解析方法所需权限 */
	resolvePermissionScope: (method: string, services: S) => PermissionScopeType | undefined;
	/** 检查方法是否为 bootstrap 方法 (如 eth_requestAccounts) */
	isBootstrapMethod?: (method: string, services: S) => boolean;
	/** 检查权限 */
	hasPermission: (origin: string, scope: PermissionScopeType, chainId: string, services: S) => boolean;
};

// ============ Middleware Factory ============

/**
 * 创建权限守卫中间件
 */
export const createPermissionGuardMiddleware = <S>(
	deps: PermissionGuardDeps<S>,
): WalletMiddleware<S> => {
	const {
		isInternalOrigin = () => false,
		resolvePermissionScope,
		isBootstrapMethod = () => false,
		hasPermission,
	} = deps;

	return async ({ request, context, next }) => {
		const rpcCtx = getRpcContext(context);
		const services = getServices(context);

		// 1. 内部来源始终放行
		if (isInternalOrigin(rpcCtx.origin)) {
			return next();
		}

		// 2. 获取方法所需权限
		const scope = resolvePermissionScope(request.method, services);

		// 3. 无权限要求 (public method)，放行
		if (!scope || scope === "public") {
			return next();
		}

		// 4. Bootstrap 方法 (如 eth_requestAccounts) 跳过权限检查
		if (isBootstrapMethod(request.method, services)) {
			return next();
		}

		// 5. 检查权限
		if (hasPermission(rpcCtx.origin, scope, rpcCtx.chainId, services)) {
			return next();
		}

		// 6. 无权限，抛出错误
		throw {
			code: RpcErrorCode.Unauthorized,
			message: `Permission denied for "${request.method}" (requires: ${scope})`,
		};
	};
};

