import { validated, z } from "../../service-factory";
import { defineActions, VaultSchema, type Vault } from "./schema";

/**
 * Vault Actions
 *
 * 使用从 schema.ts 导出的 defineActions
 * State 和 Services 类型都已在 schema.ts 中绑定，无需泛型
 */
export const actions = defineActions((set, get, getServices) => ({
	/** 添加 Vault（带 schema 验证） */
	add: validated(VaultSchema, (vault) => {
		set((draft) => {
			draft.vaults.push(vault);
		});
	}),

	/** 根据 ID 删除 Vault */
	remove(id: string) {
		set((draft) => {
			const index = draft.vaults.findIndex((v) => v.id === id);
			if (index !== -1) draft.vaults.splice(index, 1);
		});
	},

	/** 更新 Vault 信息（带 schema 验证） */
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

	/** 根据 ID 查找 Vault */
	findById(id: string): Vault | undefined {
		return get().vaults.find((v) => v.id === id);
	},

	/** 根据类型筛选 Vault */
	findByType(type: Vault["type"]): Vault[] {
		return get().vaults.filter((v) => v.type === type);
	},

	/** 检查 Vault 是否存在 */
	exists(id: string): boolean {
		return get().vaults.some((v) => v.id === id);
	},

	/** 批量删除 Vault */
	removeMany(ids: string[]) {
		set((draft) => {
			draft.vaults = draft.vaults.filter((v) => !ids.includes(v.id));
		});
	},
}));
