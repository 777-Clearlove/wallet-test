/**
 * Validation 工具单元测试
 * 测试验证包装器和 ValidationError
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validated, validatedSafe, ValidationError } from "../validation";

// 测试用的 Schema
const UserSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(50),
	email: z.string().email(),
	age: z.number().int().positive().optional(),
});

type User = z.infer<typeof UserSchema>;

const VaultSchema = z.object({
	id: z.string(),
	name: z.string().min(1),
	accounts: z.array(
		z.object({
			address: z.string(),
			type: z.enum(["EOA", "Contract"]),
		}),
	),
});

// ============ validated 函数测试 ============

describe("validated（抛出异常的验证包装器）", () => {
	describe("验证通过", () => {
		it("应该正常执行 action 并返回结果", () => {
			const action = validated(UserSchema, (user: User) => {
				return `Hello, ${user.name}!`;
			});

			const result = action({
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "Alice",
				email: "alice@example.com",
			});

			expect(result).toBe("Hello, Alice!");
		});

		it("应该传递完整的验证后数据给 action", () => {
			let receivedUser: User | null = null;

			const action = validated(UserSchema, (user: User) => {
				receivedUser = user;
			});

			const input = {
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "Bob",
				email: "bob@example.com",
				age: 25,
			};

			action(input);

			expect(receivedUser).toEqual(input);
		});

		it("Zod v4 默认会过滤掉 schema 中不存在的字段", () => {
			// Zod v4 默认行为是 strip（过滤额外字段）
			const LooseSchema = z.object({
				name: z.string(),
			});

			let receivedData: unknown = null;
			const action = validated(LooseSchema, (data) => {
				receivedData = data;
			});

			action({ name: "test", extra: "field" } as { name: string });

			// Zod v4 默认会过滤额外字段
			expect(receivedData).toEqual({ name: "test" });
		});

		it("使用 passthrough() 可以保留额外字段", () => {
			const PassthroughSchema = z.object({
				name: z.string(),
			}).passthrough();

			let receivedData: unknown = null;
			const action = validated(PassthroughSchema, (data) => {
				receivedData = data;
			});

			action({ name: "test", extra: "field" } as { name: string });

			// passthrough 会保留额外字段
			expect(receivedData).toEqual({ name: "test", extra: "field" });
		});

		it("应该支持返回 void", () => {
			const sideEffects: string[] = [];

			const action = validated(UserSchema, (user: User) => {
				sideEffects.push(user.name);
				// 不返回任何值
			});

			action({
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "Charlie",
				email: "charlie@example.com",
			});

			expect(sideEffects).toEqual(["Charlie"]);
		});

		it("应该支持复杂返回类型", () => {
			const action = validated(VaultSchema, (vault) => {
				return {
					summary: `Vault ${vault.name} has ${vault.accounts.length} accounts`,
					accountAddresses: vault.accounts.map((a) => a.address),
				};
			});

			const result = action({
				id: "vault-1",
				name: "My Vault",
				accounts: [
					{ address: "0x123", type: "EOA" },
					{ address: "0x456", type: "Contract" },
				],
			});

			expect(result).toEqual({
				summary: "Vault My Vault has 2 accounts",
				accountAddresses: ["0x123", "0x456"],
			});
		});
	});

	describe("验证失败", () => {
		it("应该抛出 ValidationError", () => {
			const action = validated(UserSchema, () => {});

			expect(() => {
				action({
					id: "not-a-uuid",
					name: "",
					email: "invalid-email",
				});
			}).toThrow(ValidationError);
		});

		it("ValidationError 应该包含友好的错误消息", () => {
			const action = validated(UserSchema, () => {});

			try {
				action({
					id: "not-a-uuid",
					name: "",
					email: "invalid",
				});
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationError);
				const validationError = error as ValidationError;

				// 错误消息应该包含字段信息
				expect(validationError.message).toContain("id");
				expect(validationError.message).toContain("name");
				expect(validationError.message).toContain("email");
			}
		});

		it("ValidationError.getFieldErrors() 应该返回字段级错误", () => {
			const action = validated(UserSchema, () => {});

			try {
				action({
					id: "not-a-uuid",
					name: "",
					email: "invalid",
				});
			} catch (error) {
				const validationError = error as ValidationError;
				const fieldErrors = validationError.getFieldErrors();

				expect(fieldErrors.id).toBeDefined();
				expect(fieldErrors.name).toBeDefined();
				expect(fieldErrors.email).toBeDefined();
			}
		});

		it("应该保留原始 ZodError", () => {
			const action = validated(UserSchema, () => {});

			try {
				action({
					id: "not-a-uuid",
					name: "Valid Name",
					email: "valid@email.com",
				});
			} catch (error) {
				const validationError = error as ValidationError;
				expect(validationError.zodError).toBeInstanceOf(z.ZodError);
			}
		});

		it("空输入应该触发验证错误", () => {
			const action = validated(UserSchema, () => {});

			expect(() => {
				// @ts-expect-error - 故意传入错误类型
				action(null);
			}).toThrow(ValidationError);

			expect(() => {
				// @ts-expect-error - 故意传入错误类型
				action(undefined);
			}).toThrow(ValidationError);
		});

		it("类型错误应该触发验证错误", () => {
			const NumberSchema = z.number();
			const action = validated(NumberSchema, (n) => n * 2);

			expect(() => {
				// @ts-expect-error - 故意传入错误类型
				action("not a number");
			}).toThrow(ValidationError);
		});
	});

	describe("边界情况", () => {
		it("应该处理可选字段", () => {
			const action = validated(UserSchema, (user: User) => user.age);

			// 不传 age
			const result1 = action({
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "Test",
				email: "test@example.com",
			});
			expect(result1).toBeUndefined();

			// 传 age
			const result2 = action({
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "Test",
				email: "test@example.com",
				age: 30,
			});
			expect(result2).toBe(30);
		});

		it("应该处理嵌套对象验证", () => {
			const action = validated(VaultSchema, (vault) => vault.accounts.length);

			const result = action({
				id: "v1",
				name: "Vault",
				accounts: [
					{ address: "0x1", type: "EOA" },
					{ address: "0x2", type: "EOA" },
				],
			});

			expect(result).toBe(2);
		});

		it("嵌套对象验证失败应该正确报错", () => {
			const action = validated(VaultSchema, () => {});

			expect(() => {
				action({
					id: "v1",
					name: "Vault",
					accounts: [
						// @ts-expect-error - 故意传入错误的 type
						{ address: "0x1", type: "Invalid" },
					],
				});
			}).toThrow(ValidationError);
		});
	});
});

// ============ validatedSafe 函数测试 ============

describe("validatedSafe（返回 Result 的验证包装器）", () => {
	describe("验证通过", () => {
		it("应该返回 success: true 和 data", () => {
			const action = validatedSafe(UserSchema, (user: User) => `Hello, ${user.name}!`);

			const result = action({
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "Alice",
				email: "alice@example.com",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBe("Hello, Alice!");
			}
		});

		it("应该正确处理 void 返回值", () => {
			const sideEffects: string[] = [];

			const action = validatedSafe(UserSchema, (user: User) => {
				sideEffects.push(user.name);
			});

			const result = action({
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "Bob",
				email: "bob@example.com",
			});

			expect(result.success).toBe(true);
			expect(sideEffects).toEqual(["Bob"]);
		});
	});

	describe("验证失败", () => {
		it("应该返回 success: false 和 error", () => {
			const action = validatedSafe(UserSchema, () => {});

			const result = action({
				id: "not-a-uuid",
				name: "",
				email: "invalid",
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBeInstanceOf(z.ZodError);
			}
		});

		it("不应该抛出异常", () => {
			const action = validatedSafe(UserSchema, () => {});

			expect(() => {
				action({
					id: "not-a-uuid",
					name: "",
					email: "invalid",
				});
			}).not.toThrow();
		});

		it("error 应该包含详细的验证错误", () => {
			const action = validatedSafe(UserSchema, () => {});

			const result = action({
				id: "not-a-uuid",
				name: "",
				email: "invalid",
			});

			if (!result.success) {
				const flattened = result.error.flatten();
				expect(flattened.fieldErrors.id).toBeDefined();
				expect(flattened.fieldErrors.name).toBeDefined();
				expect(flattened.fieldErrors.email).toBeDefined();
			}
		});
	});

	describe("类型安全", () => {
		it("成功结果应该有正确的类型", () => {
			const action = validatedSafe(UserSchema, (user: User) => ({
				greeting: `Hello, ${user.name}!`,
				isAdult: user.age ? user.age >= 18 : false,
			}));

			const result = action({
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "Alice",
				email: "alice@example.com",
				age: 25,
			});

			if (result.success) {
				// TypeScript 应该能正确推断 data 的类型
				expect(result.data.greeting).toBe("Hello, Alice!");
				expect(result.data.isAdult).toBe(true);
			}
		});
	});
});

// ============ ValidationError 类测试 ============

describe("ValidationError", () => {
	it("应该是 Error 的实例", () => {
		const zodError = new z.ZodError([]);
		const error = new ValidationError(zodError, "Test error");

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(ValidationError);
	});

	it("name 属性应该是 ValidationError", () => {
		const zodError = new z.ZodError([]);
		const error = new ValidationError(zodError, "Test error");

		expect(error.name).toBe("ValidationError");
	});

	it("message 应该是 friendlyMessage", () => {
		const zodError = new z.ZodError([]);
		const error = new ValidationError(zodError, "User-friendly message");

		expect(error.message).toBe("User-friendly message");
		expect(error.friendlyMessage).toBe("User-friendly message");
	});

	it("zodError 应该保留原始 ZodError", () => {
		const zodError = new z.ZodError([
			{
				code: "invalid_type",
				expected: "string",
				received: "number",
				path: ["name"],
				message: "Expected string, received number",
			},
		]);
		const error = new ValidationError(zodError, "Test error");

		expect(error.zodError).toBe(zodError);
		expect(error.zodError.issues).toHaveLength(1);
	});

	it("getFieldErrors() 应该返回字段级错误映射", () => {
		const zodError = new z.ZodError([
			{
				code: "invalid_type",
				expected: "string",
				received: "number",
				path: ["name"],
				message: "Expected string, received number",
			},
			{
				code: "too_small",
				minimum: 1,
				type: "string",
				inclusive: true,
				exact: false,
				path: ["email"],
				message: "String must contain at least 1 character(s)",
			},
		]);
		const error = new ValidationError(zodError, "Test error");

		const fieldErrors = error.getFieldErrors();

		expect(fieldErrors.name).toBeDefined();
		expect(fieldErrors.name).toContain("Expected string, received number");
		expect(fieldErrors.email).toBeDefined();
	});

	it("空 ZodError 的 getFieldErrors() 应该返回空对象", () => {
		const zodError = new z.ZodError([]);
		const error = new ValidationError(zodError, "No errors");

		const fieldErrors = error.getFieldErrors();

		expect(fieldErrors).toEqual({});
	});
});

// ============ 复杂场景测试 ============

describe("复杂验证场景", () => {
	it("应该支持数组验证", () => {
		const TagsSchema = z.array(z.string().min(1)).min(1).max(10);

		const action = validated(TagsSchema, (tags) => tags.join(", "));

		expect(action(["a", "b", "c"])).toBe("a, b, c");
		expect(() => action([])).toThrow(ValidationError);
	});

	it("应该支持 union 类型", () => {
		const InputSchema = z.union([z.string(), z.number()]);

		const action = validated(InputSchema, (input) => `Value: ${input}`);

		expect(action("hello")).toBe("Value: hello");
		expect(action(123)).toBe("Value: 123");
		expect(() => action(true as unknown as string)).toThrow(ValidationError);
	});

	it("应该支持 discriminated union", () => {
		const EventSchema = z.discriminatedUnion("type", [
			z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
			z.object({ type: z.literal("scroll"), delta: z.number() }),
		]);

		const action = validated(EventSchema, (event) => {
			if (event.type === "click") {
				return `Click at (${event.x}, ${event.y})`;
			}
			return `Scroll by ${event.delta}`;
		});

		expect(action({ type: "click", x: 10, y: 20 })).toBe("Click at (10, 20)");
		expect(action({ type: "scroll", delta: 100 })).toBe("Scroll by 100");
	});

	it("应该支持 transform", () => {
		const DateSchema = z.string().transform((s) => new Date(s));

		const action = validated(DateSchema, (date) => date.getFullYear());

		expect(action("2024-01-15")).toBe(2024);
	});

	it("应该支持 refine", () => {
		const PasswordSchema = z
			.string()
			.min(8)
			.refine((s) => /[A-Z]/.test(s), "Must contain uppercase")
			.refine((s) => /[0-9]/.test(s), "Must contain number");

		const action = validated(PasswordSchema, (pwd) => pwd.length);

		expect(action("Password1")).toBe(9);
		expect(() => action("password1")).toThrow(ValidationError); // 无大写
		expect(() => action("Password")).toThrow(ValidationError); // 无数字
	});
});

