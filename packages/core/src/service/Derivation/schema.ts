import { z } from "zod";

export const DerivationSchema = z.object({
	version: z.number(),

	id: z.uuid(),
	hdIndex: z.number(),
	name: z.string(),
	hidden: z.boolean(),

	vaultId: z.uuid(),
});

export const DerivationStateSchema = z.object({
	derivations: z.array(DerivationSchema),
});

export type Derivation = z.infer<typeof DerivationSchema>;
export type DerivationState = {
	derivations: Derivation[];
};

