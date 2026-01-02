import { z } from "zod";

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

export type Vault = Omit<z.infer<typeof VaultSchema>, "id"> & {
	readonly id: string;
};
export type VaultType = Vault["type"];
export type VaultSource = Vault["source"];

export type VaultsState = {
	vaults: Vault[];
};
