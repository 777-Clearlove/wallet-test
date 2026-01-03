import { compact } from "lodash-es";
import { z } from "zod";
import { WalletError, ErrorCodes } from "../errors";

export type ValidationResult<T> =
	| { success: true; data: T }
	| { success: false; error: z.ZodError };

export { z };

// ============ ValidationError ============

/**
 * 验证错误类
 *
 * 继承自 WalletError，提供 Zod 错误的额外信息
 * 保持向后兼容的同时集成统一错误系统
 */
export class ValidationError extends WalletError {
	/** 原始 Zod 错误 */
	readonly zodError: z.ZodError;

	constructor(zodError: z.ZodError, friendlyMessage?: string) {
		const message = friendlyMessage ?? buildErrorMessage(zodError);
		super(ErrorCodes.ValidationFailed, {
			message,
			data: {
				zodError: zodError.format(),
				fieldErrors: zodError.flatten().fieldErrors,
				formErrors: zodError.flatten().formErrors,
			},
			cause: zodError,
		});

		this.name = "ValidationError";
		this.zodError = zodError;
	}

	/**
	 * 获取字段级别的错误信息
	 */
	getFieldErrors(): Record<string, string[]> {
		return this.zodError.flatten().fieldErrors as Record<string, string[]>;
	}

	/**
	 * 获取表单级别的错误信息
	 */
	getFormErrors(): string[] {
		return this.zodError.flatten().formErrors;
	}

	/**
	 * 检查是否为 ValidationError
	 */
	static isValidationError(error: unknown): error is ValidationError {
		return error instanceof ValidationError;
	}

	/**
	 * 从 WalletError 或普通错误恢复 ValidationError
	 * 如果 data 中有 zodError 信息，可以部分恢复
	 */
	static fromWalletError(error: WalletError): ValidationError | null {
		if (error.code !== ErrorCodes.ValidationFailed) return null;
		if (!error.data || typeof error.data !== "object") return null;

		const data = error.data as { zodError?: unknown };
		if (!data.zodError) return null;

		// 无法完全恢复 ZodError，但可以保留信息
		if (error.cause instanceof z.ZodError) {
			return new ValidationError(error.cause, error.message);
		}

		// 如果没有原始 ZodError，返回 null
		return null;
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
			throw new ValidationError(result.error);
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

/**
 * 验证输入并抛出 ValidationError
 *
 * @example
 * ```ts
 * const vault = assertValid(VaultSchema, input);
 * // vault 类型已推断，且已通过验证
 * ```
 */
export function assertValid<T extends z.ZodType>(
	schema: T,
	input: unknown,
	message?: string,
): z.infer<T> {
	const result = schema.safeParse(input);
	if (!result.success) {
		throw new ValidationError(result.error, message);
	}
	return result.data;
}
