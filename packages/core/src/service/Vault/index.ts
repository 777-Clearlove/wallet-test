
import type { StoreConfig } from "../../service-factory";
import { actions } from "./action";
import { type VaultsState, VaultsStateSchema } from "./schema";

export const config: StoreConfig<VaultsState> = {
	name: "VaultService",
	schema: VaultsStateSchema,
	onValidationFail: "keep",
};


export const initialState: VaultsState = {
	vaults: [],
};

export { actions };
export type { VaultsState };
export * from "./schema";
