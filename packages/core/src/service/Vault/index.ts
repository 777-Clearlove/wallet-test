import type { StoreConfig } from "../../service-factory";
import { actions } from "./action";
import { selectors } from "./selectors";
import { type VaultsState, VaultsStateSchema } from "./schema";

// ============ Store Config ============

export const config: StoreConfig<VaultsState> = {
	name: "VaultService",
	schema: VaultsStateSchema,
	onValidationFail: "keep",
	partialize: (state) => ({
		vaults: state.vaults,
	}),
};

export const initialState: VaultsState = {
	vaults: [],
};

// ============ Exports ============

export { actions, selectors };
export type { VaultsState };
export * from "./schema";
