import { compact } from "lodash-es";
import { z } from "zod";


export type ValidationResult<T> =
	| { success: true; data: T }
	| { success: false; error: z.ZodError };


export { z };

// ============ ValidationError ============

/**
 * 验证错误类（包装 Zod 错误）
 */
export class ValidationError extends Error {
	constructor(
		public readonly zodError: z.ZodError,
		public readonly friendlyMessage: string,
	) {
		super(friendlyMessage);
		this.name = "ValidationError";
	}

	/**
	 * 获取字段级别的错误信息
	 */
	getFieldErrors(): Record<string, string[]> {
		return this.zodError.flatten().fieldErrors as Record<string, string[]>;
	}
}

// ============ 辅助函数 ============

/**
 * 从 Zod 错误构建友好的错误消息
 */
function buildErrorMessage(zodError: z.ZodError): string {
	const flattened = zodError.flatten();
	const fieldErrors = compact(
		Object.entries(flattened.fieldErrors).map(([field, errors]) => {
			const errorArray = errors as string[] | undefined;
			return errorArray?.length ? `${field}: ${errorArray.join(", ")}` : null;
		}),
	).join("; ");

	return fieldErrors || flattened.formErrors.join(", ") || "Validation failed";
}

// ============ 验证包装器 ============

/**
 * 用 Zod schema 包装 action，校验失败时抛出 ValidationError
 *
 * @example
 * ```ts
 * const createVault = validated(VaultSchema, (vault) => {
 *   // vault 类型已推断，且已通过验证
 *   state.vaults.push(vault);
 * });
 * ```
 */
export function validated<T extends z.ZodType, R>(
	schema: T,
	action: (input: z.infer<T>) => R,
): (input: z.infer<T>) => R {
	return (input: z.infer<T>) => {
		const result = schema.safeParse(input);
		if (!result.success) {
			throw new ValidationError(
				result.error,
				buildErrorMessage(result.error),
			);
		}
		return action(result.data);
	};
}

/**
 * validated 的安全版本，返回 Result 而不是抛出异常
 *
 * @example
 * ```ts
 * const result = validatedSafe(VaultSchema, createVault)(input);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function validatedSafe<T extends z.ZodType, R>(
	schema: T,
	action: (input: z.infer<T>) => R,
): (input: z.infer<T>) => ValidationResult<R> {
	return (input: z.infer<T>) => {
		const result = schema.safeParse(input);
		if (!result.success) {
			return { success: false, error: result.error };
		}
		return { success: true, data: action(result.data) };
	};
}
