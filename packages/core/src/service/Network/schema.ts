import { z } from "zod";

export const NetworkSchema = z.object({
	version: z.number(),

	id: z.uuid(),
	name: z.string(),
	/** CAIP-2 */
	namespace: z.enum(["eip155", "solana", "cosmos"]),
	chainId: z.string(),
	endpoints: z
		.array(z.string())
		.refine((items) => new Set(items).size === items.length, {
			message: "endpoints must have unique items",
		}),
	icon: z.string(),
	scanUrl: z.string(),
	type: z.enum(["Mainnet", "Testnet", "Custom"]),
});

export type Network = z.infer<typeof NetworkSchema>;
export type NetworkNamespace = z.infer<typeof NetworkSchema>["namespace"];
export type NetworkType = z.infer<typeof NetworkSchema>["type"];
