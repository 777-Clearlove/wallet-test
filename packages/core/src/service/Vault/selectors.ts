import { defineSelectors, type Vault, type VaultType, type MnemonicVault } from "./schema";

/**
 * Vault Selectors
 *
 * 纯函数选择器，配合 Zustand 原生使用：
 * - store.useStore(selectors.all) - React Hook
 * - selectors.all(store.getState()) - 直接调用
 * - store.subscribe((state) => state.vaults, callback) - 订阅
 */
export const selectors = defineSelectors({
	// ============ 基础选择器 ============

	/** 获取所有 Vault */
	all: (state) => state.vaults,

	/** 获取 Vault 数量 */
	count: (state) => state.vaults.length,

	/** 是否有 Vault */
	hasAny: (state) => state.vaults.length > 0,

	/** 获取所有 Vault ID */
	allIds: (state) => state.vaults.map((v) => v.id),

	// ============ 按类型筛选 ============

	/** 获取 mnemonic 类型的 Vault */
	mnemonicVaults: (state) => state.vaults.filter((v) => v.type === "mnemonic"),

	/** 获取 privateKey 类型的 Vault */
	privateKeyVaults: (state) => state.vaults.filter((v) => v.type === "privateKey"),

	/** 获取 hardware 类型的 Vault */
	hardwareVaults: (state) => state.vaults.filter((v) => v.type === "hardware"),

	/** 获取 public 类型的 Vault（观察钱包） */
	publicVaults: (state) => state.vaults.filter((v) => v.type === "public"),

	// ============ 分组 ============

	/** 按类型分组 */
	groupedByType: (state) =>
		state.vaults.reduce(
			(acc, vault) => {
				if (!acc[vault.type]) acc[vault.type] = [];
				acc[vault.type].push(vault);
				return acc;
			},
			{} as Record<VaultType, Vault[]>,
		),

	/** 按来源分组（create/import） */
	groupedBySource: (state) =>
		state.vaults.reduce(
			(acc, vault) => {
				if (!acc[vault.source]) acc[vault.source] = [];
				acc[vault.source].push(vault);
				return acc;
			},
			{} as Record<Vault["source"], Vault[]>,
		),

	// ============ 备份相关 ============

	/** 获取已备份的 mnemonic Vault */
	backedUpMnemonicVaults: (state) =>
		state.vaults
			.filter((v): v is MnemonicVault => v.type === "mnemonic")
			.filter((v) => v.isBackup),

	/** 获取未备份的 mnemonic Vault（需要提醒用户备份） */
	needsBackup: (state) =>
		state.vaults
			.filter((v): v is MnemonicVault => v.type === "mnemonic")
			.filter((v) => !v.isBackup),

	// ============ 排序 ============

	/** 按创建时间排序（最新优先） */
	sortedByCreatedAt: (state) =>
		[...state.vaults].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),

	/** 最近创建的 Vault（最多5个） */
	recentVaults: (state) =>
		[...state.vaults]
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
			.slice(0, 5),

	// ============ 统计 ============

	/** Vault 统计信息 */
	stats: (state) => ({
		total: state.vaults.length,
		byType: {
			mnemonic: state.vaults.filter((v) => v.type === "mnemonic").length,
			privateKey: state.vaults.filter((v) => v.type === "privateKey").length,
			hardware: state.vaults.filter((v) => v.type === "hardware").length,
			public: state.vaults.filter((v) => v.type === "public").length,
		},
		bySource: {
			create: state.vaults.filter((v) => v.source === "create").length,
			import: state.vaults.filter((v) => v.source === "import").length,
		},
	}),

	/** 类型分布比例 */
	typeDistribution: (state) => {
		const total = state.vaults.length;
		if (total === 0) return {} as Record<VaultType, number>;

		const counts = state.vaults.reduce(
			(acc, v) => {
				acc[v.type] = (acc[v.type] || 0) + 1;
				return acc;
			},
			{} as Record<VaultType, number>,
		);

		return Object.fromEntries(
			Object.entries(counts).map(([type, count]) => [type, count / total]),
		) as Record<VaultType, number>;
	},

	/** 所有 Vault 的 ID 集合（用于快速查找） */
	vaultIdSet: (state) => new Set(state.vaults.map((v) => v.id)),
});

