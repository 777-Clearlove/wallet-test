import { defineActions, validated, z } from "../../service-factory";
import type { Services } from "..";
import { VaultSchema, type VaultsState } from "./schema";

/**
 * Vault Actions
 *
 * defineActions<State, Services> 第二个泛型参数是 Services 类型
 * factory 函数的第三个参数是 getServices（这里暂时不需要访问其他 service）
 */
export const actions = defineActions<VaultsState, Services>()((set, _get, _getServices) => ({
	add: validated(VaultSchema, (vault) => {
		set((draft) => {
			draft.vaults.push(vault);
		});
	}),

	remove(id: string) {
		set((draft) => {
			const index = draft.vaults.findIndex((v) => v.id === id);
			if (index !== -1) draft.vaults.splice(index, 1);
		});
	},

	update: validated(
		z.object({
			id: z.uuid(),
			updates: z.object({
				name: z.string().min(1).optional(),
				updatedAt: z.coerce.date().optional(),
				version: z.number().optional(),
			}),
		}),
		({ id, updates }) => {
			set((draft) => {
				const vault = draft.vaults.find((v) => v.id === id);
				if (vault) {
					if (updates.name !== undefined) vault.name = updates.name;
					if (updates.updatedAt !== undefined) vault.updatedAt = updates.updatedAt;
					if (updates.version !== undefined) vault.version = updates.version;
				}
			});
		},
	),
}));
