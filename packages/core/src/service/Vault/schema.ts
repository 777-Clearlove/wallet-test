import { z } from "zod";
import { createTypedDefiners } from "../../service-factory";
import type { Services } from "..";

// ============ Schemas ============

const BaseVaultSchema = z.object({
	version: z.number(),

	id: z.uuid(),
	name: z.string().min(1),
	source: z.enum(["create", "import"]),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date().optional(),
});

export const VaultSchema = z.discriminatedUnion("type", [
	BaseVaultSchema.extend({
		type: z.literal("privateKey"),
		value: z.string(),
	}),
	BaseVaultSchema.extend({
		type: z.literal("mnemonic"),
		value: z.string(),
		isBackup: z.boolean(),
	}),
	BaseVaultSchema.extend({
		type: z.literal("public"),
	}).strict(),
	BaseVaultSchema.extend({
		type: z.literal("hardware"),
	}).strict(),
]);

export const VaultsStateSchema = z.object({
	vaults: z.array(VaultSchema),
});

// ============ Types ============

/** 原始 Zod 推断类型 */
type VaultInferred = z.infer<typeof VaultSchema>;

/** Vault 类型 - 保持 discriminated union 特性 */
export type Vault = VaultInferred;

/** Mnemonic 类型的 Vault */
export type MnemonicVault = Extract<Vault, { type: "mnemonic" }>;

/** PrivateKey 类型的 Vault */
export type PrivateKeyVault = Extract<Vault, { type: "privateKey" }>;

/** Public 类型的 Vault */
export type PublicVault = Extract<Vault, { type: "public" }>;

/** Hardware 类型的 Vault */
export type HardwareVault = Extract<Vault, { type: "hardware" }>;

export type VaultType = Vault["type"];
export type VaultSource = Vault["source"];

export type VaultsState = {
	vaults: Vault[];
};

// ============ Typed Definers (State 和 Services 类型都已绑定) ============

/**
 * 使用 createTypedDefiners 同时绑定 State 和 Services
 * action.ts 中不再需要写任何泛型
 */
export const { defineActions, defineEffects, defineSelectors } =
	createTypedDefiners<VaultsState, Services>();

