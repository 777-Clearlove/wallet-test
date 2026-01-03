import { validated } from "../../service-factory";
import { defineActions, DerivationSchema, type Derivation } from "./schema";


export const actions = defineActions((set, get, getServices) => ({
	/** 添加 Derivation（带 schema 验证） */
	add: validated(DerivationSchema, (derivation) => {
		set((draft) => {
			draft.derivations.push(derivation);
		});
	}),

	/** 根据 ID 删除 Derivation */
	remove(id: string) {
		set((draft) => {
			const index = draft.derivations.findIndex((v) => v.id === id);
			if (index !== -1) draft.derivations.splice(index, 1);
		});
	},

	/** 更新 Derivation */
	update(id: string, updates: Partial<Pick<Derivation, "name" | "hidden" | "version">>) {
		set((draft) => {
			const derivation = draft.derivations.find((d) => d.id === id);
			if (derivation) {
				if (updates.name !== undefined) derivation.name = updates.name;
				if (updates.hidden !== undefined) derivation.hidden = updates.hidden;
				if (updates.version !== undefined) derivation.version = updates.version;
			}
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

	/** 根据 ID 查找 Derivation */
	findById(id: string): Derivation | undefined {
		return get().derivations.find((d) => d.id === id);
	},

	/** 根据 Vault ID 获取所有 Derivation */
	findByVaultId(vaultId: string): Derivation[] {
		return get().derivations.filter((d) => d.vaultId === vaultId);
	},

	/** 切换 Derivation 的隐藏状态 */
	toggleHidden(id: string) {
		set((draft) => {
			const derivation = draft.derivations.find((d) => d.id === id);
			if (derivation) {
				derivation.hidden = !derivation.hidden;
			}
		});
	},

	/** 获取 Vault 下一个可用的 HD Index */
	getNextHdIndex(vaultId: string): number {
		const vaultDerivations = get().derivations.filter((d) => d.vaultId === vaultId);
		if (vaultDerivations.length === 0) return 0;
		return Math.max(...vaultDerivations.map((d) => d.hdIndex)) + 1;
	},

	/** 批量删除指定 Vault 的所有 Derivation */
	removeByVaultId(vaultId: string) {
		set((draft) => {
			draft.derivations = draft.derivations.filter((d) => d.vaultId !== vaultId);
		});
	},
}));
