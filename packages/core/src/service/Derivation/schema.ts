import { z } from "zod";
import { createTypedDefiners } from "../../service-factory";
import type { Services } from "..";

// ============ Schemas ============

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

// ============ Types ============

export type Derivation = z.infer<typeof DerivationSchema>;
export type DerivationState = {
	derivations: Derivation[];
};

// ============ Typed Definers (State 和 Services 类型都已绑定) ============

export const { defineActions, defineEffects, defineSelectors } =
	createTypedDefiners<DerivationState, Services>();

