# @repo/core

钱包核心业务逻辑层，提供跨平台的状态管理、数据持久化和验证机制。

## 📐 架构概览

```
@repo/core
├── service-factory/      # 核心工厂（内部实现）
│   ├── factory.ts        # createServiceFactory 主逻辑
│   ├── validation.ts     # Zod 验证包装器
│   └── storage/          # 跨端存储适配器系统
│
└── service/              # 业务服务层
    ├── index.ts          # createServices 入口 ← 统一使用入口
    ├── Vault/            # 保险库服务（助记词、私钥管理）
    ├── Address/          # 地址服务
    ├── Derivation/       # 派生路径服务
    ├── Network/          # 网络配置服务
    └── Wallet/           # 钱包服务
```

## 🧱 核心特性

- ✅ **类型安全** - 完整的 TypeScript 类型推断
- ✅ **自动持久化** - 集成 zustand/persist
- ✅ **Hydration 管理** - 支持等待数据加载完成
- ✅ **双重 Schema 验证** - Hydration 和 Action 两处校验
- ✅ **跨标签页同步** - 可选的 storage 事件监听
- ✅ **DevTools 集成** - 开发环境自动启用

---

## 🚀 快速开始

### 初始化 Services

```typescript
import { createServices } from "@repo/core/service";
import { createSafeStorageAdapter } from "@repo/core/service-factory";

// ✅ Web 端（默认使用 localStorage）
const services = createServices();

// ✅ React Native 端
const rnAdapter = createSafeStorageAdapter(AsyncStorage, {
  queue: true,      // RN 异步存储必须
  checksum: true,   // 推荐
});
const services = createServices({ storageAdapter: rnAdapter });

// ✅ Electron 端
const electronAdapter = createSafeStorageAdapter(electronStore, {
  queue: true,
  atomic: true,
});
const services = createServices({ storageAdapter: electronAdapter });
```

### 存储增强器选择指南

| 平台 | `queue` | `atomic` | `checksum` | 说明 |
|------|---------|----------|------------|------|
| Web (localStorage) | 可选 | ✅ 推荐 | ✅ 推荐 | 同步 API |
| React Native | **必须** | ❌ 禁用 | ✅ 推荐 | 异步 API，atomic 不兼容 |
| Electron | **必须** | ✅ 推荐 | ✅ 推荐 | 异步 API |
| 浏览器插件 | **必须** | ❌ 禁用 | ✅ 推荐 | 异步 API |

### 在 React 中使用

```tsx
import { createServices } from "@repo/core/service";

const services = createServices();
const { vault } = services;

function VaultList() {
  // 使用整个 state
  const { vaults, add, remove } = vault.useStore();
  
  // 或使用 selector 优化渲染
  const vaults = vault.useStore((s) => s.vaults);
  const addVault = vault.useStore((s) => s.add);
  
  return (
    <ul>
      {vaults.map((v) => (
        <li key={v.id}>{v.name}</li>
      ))}
    </ul>
  );
}
```

---

## ⏳ Hydration 管理

### 等待所有 Service 加载完成

```typescript
const services = createServices();

// 等待所有 Service hydration 完成
const result = await services.waitForAllHydration();

console.log(result.allHydrated);   // true - 所有 Service 都已完成
console.log(result.anyFallback);   // false - 是否有任何 Service 使用了 fallback
console.log(result.anyError);      // false - 是否有任何 hydration 错误
console.log(result.errors);        // [] - 错误列表 [{ service: 'vault', error: Error }]
```

### 在 React 中使用

```tsx
function App() {
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState<Array<{ service: string; error: Error }>>([]);

  useEffect(() => {
    const services = createServices();
    
    services.waitForAllHydration().then((result) => {
      if (result.anyError) {
        setErrors(result.errors);
      }
      setReady(true);
    });
  }, []);

  if (!ready) return <SplashScreen />;
  if (errors.length > 0) {
    return <ErrorScreen errors={errors.map((e) => `${e.service}: ${e.error.message}`)} />;
  }
  
  return <MainApp />;
}
```

### 其他 Hydration API

```typescript
// 同步获取所有 Service 的当前 hydration 状态
const currentState = services.getAllHydrationState();
console.log(currentState.allHydrated);  // 可能为 false（还在加载中）

// 监听所有 Service 的 hydration 状态变化（RxJS Observable）
services.allHydrationState$.subscribe((state) => {
  console.log("Hydration state changed:", state);
});

// 只等待 hydration 完成（只发出一次值）
services.allHydrated$.subscribe((state) => {
  console.log("All services hydrated:", state);
});
```

---

## 🔍 验证错误处理

Action 执行时如果验证失败，会抛出 `ValidationError`：

```typescript
import { ValidationError } from "@repo/core/service-factory";

try {
  vault.getState().add(invalidData);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.friendlyMessage);      // "name: 不能为空; email: 格式错误"
    console.log(error.getFieldErrors());     // { name: ["不能为空"], email: ["格式错误"] }
  }
}
```

---

## 📋 API 参考

### `createServices(config?)` 返回值

```typescript
interface PlatformConfig {
  storageAdapter?: StorageAdapter;  // 存储适配器
  skipHydration?: boolean;          // 跳过自动 Hydration
}

const services = createServices(config);

// 各 Service 实例
services.vault          // VaultService 实例
services.wallet         // WalletService 实例
// ...其他 Service

// 全局 Hydration API
services.waitForAllHydration()   // Promise<AllHydrationState> - 等待所有 Service hydration 完成
services.getAllHydrationState()  // AllHydrationState - 同步获取当前状态
services.allHydrationState$      // Observable<AllHydrationState> - 状态变化流
services.allHydrated$            // Observable<AllHydrationState> - 只在全部完成时发出一次
```

### Service 实例 API

```typescript
const { vault } = services;

// 核心 API
vault.useStore()            // React Hook - 获取整个 state
vault.useStore(selector)    // React Hook - 使用 selector
vault.getState()            // 获取当前状态（非 React 环境）
vault.subscribe(fn)         // 订阅变化

// Hydration API
vault.hydrate()              // 手动触发 hydration
vault.hasHydrated()          // 是否已完成 hydration
vault.usedFallback()         // 是否使用了 fallback
vault.waitForHydration()     // Promise，等待 hydration 完成
vault.getHydrationState()    // 获取完整 hydration 状态

// 其他
vault.clearStorage()  // 清除持久化数据
vault.destroy()       // 销毁 store
```

### AllHydrationState 类型

```typescript
interface AllHydrationState<T> {
  states: { [K in keyof T]: HydrationState };  // 各 Service 的状态
  allHydrated: boolean;                         // 是否全部完成
  anyFallback: boolean;                         // 是否有使用 fallback
  anyError: boolean;                            // 是否有错误
  errors: Array<{ service: keyof T; error: Error }>;  // 错误列表
}

interface HydrationState {
  hasHydrated: boolean;
  hydrationError: Error | null;
  usedFallback: boolean;
}
```

---

## 🏗️ 技术栈

| 依赖 | 用途 |
|------|------|
| `zustand` | 状态管理核心 |
| `immer` | 不可变状态更新 |
| `zod` | Schema 验证 |
| `rxjs` | Hydration 状态流 |
| `async-mutex` | 写入队列锁 |
| `lodash-es` | 工具函数 |
