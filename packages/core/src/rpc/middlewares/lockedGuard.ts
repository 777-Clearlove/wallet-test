/**
 * Locked Guard Middleware
 *
 * 检查钱包锁定状态，根据方法配置决定行为
 */
import type { Json } from "@metamask/utils";
import type { WalletMiddleware } from "../engine";
import { getRpcContext, getServices } from "../engine";
import type { LockedBehavior } from "../types";
import { RpcErrorCode } from "../types";

// ============ Types ============

export type LockedGuardDeps<S> = {
	/** 检查是否已解锁 */
	isUnlocked: (services: S) => boolean;
	/** 检查是否为内部来源 (内部来源跳过锁定检查) */
	isInternalOrigin?: (origin: string) => boolean;
	/** 解析方法的锁定行为 */
	resolveLockedBehavior: (method: string, services: S) => LockedBehavior | undefined;
	/** 请求解锁注意力 (可选，用于弹出解锁 UI) */
	requestUnlockAttention?: (params: {
		origin: string;
		method: string;
		chainId: string;
		namespace: string;
	}) => void;
};

// ============ Middleware Factory ============

/**
 * 创建锁定守卫中间件
 */
export const createLockedGuardMiddleware = <S>(
	deps: LockedGuardDeps<S>,
): WalletMiddleware<S> => {
	const {
		isUnlocked,
		isInternalOrigin = () => false,
		resolveLockedBehavior,
		requestUnlockAttention,
	} = deps;

	return async ({ request, context, next }) => {
		const rpcCtx = getRpcContext(context);
		const services = getServices(context);

		// 1. 内部来源始终放行
		if (isInternalOrigin(rpcCtx.origin)) {
			return next();
		}

		// 2. 已解锁，放行
		if (isUnlocked(services)) {
			return next();
		}

		// 3. 获取方法的锁定行为配置
		const lockedBehavior = resolveLockedBehavior(request.method, services);

		// 4. 未配置或 allow，放行
		if (!lockedBehavior || lockedBehavior.type === "allow") {
			return next();
		}

		// 5. respond 类型，返回预设值
		if (lockedBehavior.type === "respond") {
			return lockedBehavior.value;
		}

		// 6. deny 类型，请求解锁并抛出错误
		requestUnlockAttention?.({
			origin: rpcCtx.origin,
			method: request.method,
			chainId: rpcCtx.chainId,
			namespace: rpcCtx.namespace,
		});

		throw {
			code: RpcErrorCode.WalletLocked,
			message: `Request "${request.method}" requires an unlocked wallet`,
		};
	};
};

