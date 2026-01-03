import { defineEffects, type Derivation } from "./schema";

/**
 * Derivation Effects
 *
 * 使用从 schema.ts 导出的 defineEffects
 * State 和 Services 类型都已在 schema.ts 中绑定，无需泛型
 *
 * 监听 Vault 的变化，自动管理 Derivation：
 * - Vault 新增时：为 mnemonic 类型的 Vault 自动创建初始 Derivation
 * - Vault 删除时：自动删除该 Vault 下的所有 Derivation
 */
export const effects = defineEffects((get, getServices) => {
	const { vault, derivation } = getServices();

	// 监听 vault 变化，处理新增和删除
	const unsubscribeVaultWatch = vault.subscribe(
		(state) => state.vaults,
		(vaults, prevVaults) => {
			const prevIds = new Set(prevVaults?.map((v) => v.id) ?? []);
			const currentIds = new Set(vaults.map((v) => v.id));

			// 处理新增的 vault：为 mnemonic 类型创建初始 derivation
			const newVaults = vaults.filter((v) => !prevIds.has(v.id));
			for (const newVault of newVaults) {
				// 只有 mnemonic 类型需要自动创建 derivation
				if (newVault.type !== "mnemonic") continue;

				const newDerivation: Derivation = {
					version: 1,
					id: crypto.randomUUID(),
					hdIndex: 0,
					name: "Account 1",
					hidden: false,
					vaultId: newVault.id,
				};

				derivation.getState().add(newDerivation);
			}

			// 处理删除的 vault：使用批量删除更高效
			const removedVaultIds = (prevVaults ?? [])
				.filter((v) => !currentIds.has(v.id))
				.map((v) => v.id);

			for (const vaultId of removedVaultIds) {
				derivation.getState().removeByVaultId(vaultId);
			}
		},
		{ fireImmediately: false },
	);

	return [unsubscribeVaultWatch];
});

