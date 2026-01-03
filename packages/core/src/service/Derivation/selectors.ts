import { defineSelectors, type Derivation } from "./schema";

/**
 * Derivation Selectors
 *
 * 纯函数选择器，配合 Zustand 原生使用：
 * - store.useStore(selectors.all) - React Hook
 * - selectors.all(store.getState()) - 直接调用
 * - store.subscribe((state) => state.derivations, callback) - 订阅
 */
export const selectors = defineSelectors({
	// ============ 基础选择器 ============

	/** 获取所有 Derivation */
	all: (state) => state.derivations,

	/** 获取 Derivation 数量 */
	count: (state) => state.derivations.length,

	/** 是否有 Derivation */
	hasAny: (state) => state.derivations.length > 0,

	/** 获取所有 Derivation ID */
	allIds: (state) => state.derivations.map((d) => d.id),

	// ============ 可见性筛选 ============

	/** 获取可见的 Derivation（未隐藏） */
	visible: (state) => state.derivations.filter((d) => !d.hidden),

	/** 获取隐藏的 Derivation */
	hidden: (state) => state.derivations.filter((d) => d.hidden),

	/** 可见 Derivation 列表（按 HD Index 排序，用于 UI 展示） */
	visibleSorted: (state) =>
		state.derivations
			.filter((d) => !d.hidden)
			.sort((a, b) => a.hdIndex - b.hdIndex),

	// ============ 分组 ============

	/** 按 Vault ID 分组 */
	groupedByVaultId: (state) =>
		state.derivations.reduce(
			(acc, derivation) => {
				const group = acc[derivation.vaultId];
				if (!group) {
					acc[derivation.vaultId] = [derivation];
				} else {
					group.push(derivation);
				}
				return acc;
			},
			{} as Record<string, Derivation[]>,
		),

	/** 获取所有关联的 Vault ID（去重） */
	uniqueVaultIds: (state) => [...new Set(state.derivations.map((d) => d.vaultId))],

	/** 所有关联的 Vault ID 集合 */
	linkedVaultIdSet: (state) => new Set(state.derivations.map((d) => d.vaultId)),

	// ============ 排序 ============

	/** 按 HD Index 排序 */
	sortedByHdIndex: (state) => [...state.derivations].sort((a, b) => a.hdIndex - b.hdIndex),

	/** 按名称排序 */
	sortedByName: (state) =>
		[...state.derivations].sort((a, b) => a.name.localeCompare(b.name)),

	// ============ 统计 ============

	/** Derivation 统计信息 */
	stats: (state) => ({
		total: state.derivations.length,
		visible: state.derivations.filter((d) => !d.hidden).length,
		hidden: state.derivations.filter((d) => d.hidden).length,
		uniqueVaults: new Set(state.derivations.map((d) => d.vaultId)).size,
	}),

	/** 每个 Vault 的 Derivation 数量映射 */
	countPerVault: (state) =>
		state.derivations.reduce(
			(acc, d) => {
				acc[d.vaultId] = (acc[d.vaultId] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		),

	/** 每个 Vault 的最大 HD Index 映射 */
	maxHdIndexPerVault: (state) =>
		state.derivations.reduce(
			(acc, d) => {
				acc[d.vaultId] = Math.max(acc[d.vaultId] ?? -1, d.hdIndex);
				return acc;
			},
			{} as Record<string, number>,
		),

	/** 所有 Derivation 的 ID 集合（用于快速查找） */
	derivationIdSet: (state) => new Set(state.derivations.map((d) => d.id)),

	/** Vault 是否只有一个 Derivation（用于删除检查） */
	vaultsWithSingleDerivation: (state) => {
		const counts = state.derivations.reduce(
			(acc, d) => {
				acc[d.vaultId] = (acc[d.vaultId] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);
		return new Set(Object.entries(counts).filter(([, count]) => count === 1).map(([id]) => id));
	},
});

