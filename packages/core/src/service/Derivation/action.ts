import { defineActions, validated } from "../../service-factory";
import type { Services } from "..";
import { DerivationSchema, type Derivation, type DerivationState } from "./schema";

/**
 * Derivation Actions
 *
 * defineActions<State, Services> 第二个泛型参数是 Services 类型
 * factory 函数的第三个参数是 getServices
 */
export const actions = defineActions<DerivationState, Services>()((set, get, getServices) => ({
	add: validated(DerivationSchema, (derivation) => {
		set((draft) => {
			draft.derivations.push(derivation);
		});
	}),

	remove(id: string) {
		set((draft) => {
			const index = draft.derivations.findIndex((v) => v.id === id);
			if (index !== -1) draft.derivations.splice(index, 1);
		});
	},

	/** 跨 Service Action: 添加 Derivation，带 Vault 存在性检查 */
	addWithVaultCheck(d: Derivation) {
		const { vault } = getServices();
		const vaultExists = vault.getState().vaults.some((v) => v.id === d.vaultId);
		if (!vaultExists) throw new Error(`Vault ${d.vaultId} not found`);
		set((draft) => {
			draft.derivations.push(d);
		});
	},

	/** 跨 Service Action: 删除 Derivation，检查是否是 Vault 的最后一个 */
	removeWithCheck(id: string) {
		const derivations = get().derivations;
		const target = derivations.find((d) => d.id === id);
		if (!target) return;
		if (derivations.filter((d) => d.vaultId === target.vaultId).length <= 1) {
			throw new Error("Cannot remove the last derivation of a vault");
		}
		set((draft) => {
			const index = draft.derivations.findIndex((v) => v.id === id);
			if (index !== -1) draft.derivations.splice(index, 1);
		});
	},
}));
