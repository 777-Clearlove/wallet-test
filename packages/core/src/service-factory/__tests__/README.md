# Service Factory 单元测试

本目录包含 `service-factory` 模块的完整测试套件。

## 测试结构

```
__tests__/
├── test-utils.ts                    # 测试工具和模拟适配器
├── validation.test.ts               # 验证包装器测试
├── factory.test.ts                  # 工厂函数和 hydration 测试
├── storage/
│   ├── adapter.test.ts              # StorageAdapter 接口测试
│   └── enhancers.test.ts            # 存储增强器测试
└── README.md
```

## 运行测试

```bash
# 运行所有测试
bun run test

# 监听模式
bun run test:watch

# 带覆盖率
bun run test:coverage
```

## 测试覆盖范围

### storage/adapter.test.ts
- `createMemoryStorageAdapter` - 同步内存适配器
- `createAsyncMemoryStorageAdapter` - 异步内存适配器
- `defaultLocalStorageAdapter` - 默认 localStorage 适配器
- SSR 环境兼容性测试

### storage/enhancers.test.ts
- `withAtomic` - 原子写入增强器（Double Buffer + 备份）
- `withChecksum` - CRC32 校验增强器
- `withDebounce` - 防抖写入增强器
- `withQueue` - 写入队列增强器（Mutex）
- `createSafeStorage` - 安全存储组合工具
- 增强器组合测试
- 边界情况测试（空字符串、大数据、Unicode 等）

### validation.test.ts
- `validated` - 抛出异常的验证包装器
- `validatedSafe` - 返回 Result 的验证包装器
- `ValidationError` 类
- 复杂验证场景（数组、union、transform、refine 等）

### factory.test.ts
- `createServiceFactory` - 核心工厂函数
- `createFactoryBuilder` - 预配置工厂构建器
- `defineActions` - Actions 定义辅助函数
- Hydration 状态管理
- Schema 验证和 fallback 策略
- `partialize` 部分持久化
- 版本迁移
- 异步 Actions
- 边界情况测试

## 测试工具

`test-utils.ts` 提供了以下测试工具：

```typescript
// 创建内存存储适配器（同步）
createMemoryStorageAdapter(): StorageAdapter

// 创建异步内存存储适配器（模拟 AsyncStorage）
createAsyncMemoryStorageAdapter(delay?: number): StorageAdapter

// 创建基于 localStorage 的异步适配器
createLocalStorageAsyncAdapter(delay?: number): StorageAdapter

// 创建可失败的存储适配器（测试错误处理）
createFailableStorageAdapter(base, options): StorageAdapter

// 创建可追踪操作的存储适配器
createTrackedStorageAdapter(base): StorageAdapter & { operations, clear }

// 辅助函数
sleep(ms: number): Promise<void>
waitFor(condition, timeout?, interval?): Promise<void>
clearTestStorage(): void
```

## 注意事项

1. **异步适配器与 createSafeStorage**: 
   - `withAtomic` 在内部会多次调用底层适配器，与 `withQueue` 组合时可能造成死锁
   - 建议对异步适配器使用 `flow(withQueue, withChecksum)` 而非完整的 `createSafeStorage`

2. **Fake Timers**:
   - 测试 `withDebounce` 时使用 `vi.useFakeTimers()` 和 `vi.advanceTimersByTimeAsync()`
   - 测试结束后记得调用 `vi.useRealTimers()`

3. **Hydration 测试**:
   - 同步适配器会通过 `queueMicrotask` 自动完成 hydration
   - 使用 `waitForHydration()` 等待 hydration 完成

