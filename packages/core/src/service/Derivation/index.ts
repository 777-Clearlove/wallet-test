import type { StoreConfig } from "../../service-factory";
import { actions } from "./action";
import { effects } from "./effects";
import { type DerivationState, DerivationStateSchema } from "./schema";

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

export { actions, effects };
export type { DerivationState };
export * from "./schema";
