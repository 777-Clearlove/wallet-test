import type { StoreConfig } from "../../service-factory";
import { actions } from "./action";
import { effects } from "./effect";
import { selectors } from "./selectors";
import { type DerivationState, DerivationStateSchema } from "./schema";

// ============ Store Config ============

export const config: StoreConfig<DerivationState> = {
	name: "DerivationService",
	schema: DerivationStateSchema,
	onValidationFail: "keep",
	partialize: (state) => ({
		derivations: state.derivations,
	}),
};

export const initialState: DerivationState = {
	derivations: [],
};

// ============ Exports ============

export { actions, effects, selectors };
export type { DerivationState };
export * from "./schema";
