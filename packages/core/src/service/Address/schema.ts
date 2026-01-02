import { z } from "zod";

export const AddressSchema = z.object({
	version: z.number(),

	id: z.uuid(),
	publicAddress: z.string(),
	privateKey: z.string().optional(),

	derivationId: z.uuid(),
	networkId: z.uuid(),
});

export type Address = z.infer<typeof AddressSchema>;
