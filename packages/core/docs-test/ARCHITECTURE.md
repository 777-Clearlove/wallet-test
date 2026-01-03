# 架构说明

## 分层设计

```
┌─────────────────────────────────────────────────────────┐
│                    应用层（各端独立）                      │
├─────────────────────────────────────────────────────────┤
│  apps/web/         apps/mobile/       apps/desktop/     │
│  ├── stores/       ├── stores/        ├── stores/       │
│  │   └── index.ts  │   └── index.ts   │   └── index.ts  │
│  │       ↓          │       ↓           │       ↓        │
│  │   createServices(createStoreFactory)                 │
│  │   createServices(createServiceFactory-MMKV)          │
│  │   createServices(createServiceFactory-electron)      │
│  └── lib/          └── lib/           └── lib/          │
│      └── factory   │   └── factory     │   └── factory  │
│         (localStorage) (MMKV)           (electron-store)│
└─────────────────────────────────────────────────────────┘
                              ↓ 引用
┌─────────────────────────────────────────────────────────┐
│                   Service 层（共享代码）                    │
├─────────────────────────────────────────────────────────┤
│  packages/core/src/service/                             │
│  ├── index.ts  (createServices - 统一初始化)             │
│  ├── Vault/                                             │
│  │   ├── index.ts  (VaultStoreConfig, initialState)    │
│  │   ├── action.ts (actions)                           │
│  │   └── schema.ts (schema)                            │
│  ├── Network/                                           │
│  └── Address/                                           │
└─────────────────────────────────────────────────────────┘
                              ↓ 引用
┌─────────────────────────────────────────────────────────┐
│                  工厂层（状态管理框架）                     │
├─────────────────────────────────────────────────────────┤
│  packages/core/src/service-factory/                     │
│  ├── factory.ts           (createStoreFactory)          │
│  │                        (createFactoryBuilder)        │
│  ├── validation.ts        (zod 验证)                    │
│  └── storage/             (存储适配器)                   │
│      ├── adapter.ts       (StorageAdapter)              │
│      └── decorators.ts    (安全装饰器)                   │
└─────────────────────────────────────────────────────────┘
```

## 关键原则

### 1. Service 层提供统一初始化

**Service 层**
```typescript
// packages/core/src/service/index.ts
export function createServices(createFactory) {
  const createVaultStore = createFactory(Vault.VaultStoreConfig);
  const vault = createVaultStore(Vault.initialState, { actions: Vault.actions });

  const createNetworkStore = createFactory(Network.NetworkStoreConfig);
  const network = createNetworkStore(Network.initialState, { actions: Network.actions });

  return { vault, network };
}
```

**各端使用**
```typescript
// apps/web/src/stores/index.ts
import { createStoreFactory } from '@repo/core/service-factory';
import { createServices } from '@repo/core/service';

// ✅ 一次调用，创建所有 Service
export const services = createServices(createStoreFactory);
export const { vault, network } = services;
```

### 2. 各端独立实例化

**Web 端**
```typescript
// apps/web/src/stores/vault.ts
import { createStoreFactory } from '@repo/core/service-factory';
import { VaultStoreConfig, actions, initialState } from '@repo/core/service/Vault';

const createStore = createStoreFactory(VaultStoreConfig);
export const vaultStore = createStore(initialState, { actions });
```

**Mobile 端**
```typescript
// apps/mobile/src/stores/vault.ts
import { createServiceFactory } from '@/lib/store-factory'; // MMKV
import { VaultStoreConfig, actions, initialState } from '@repo/core/service/Vault';

const createStore = createServiceFactory(VaultStoreConfig);
export const vaultStore = createStore(initialState, { actions });
```

**Desktop 端**
```typescript
// apps/desktop/src/stores/vault.ts
import { createServiceFactory } from '@/lib/store-factory'; // electron-store
import { VaultStoreConfig, actions, initialState } from '@repo/core/service/Vault';

const createStore = createServiceFactory(VaultStoreConfig);
export const vaultStore = createStore(initialState, { actions });
```

### 3. 存储配置在各端

**Web 端**
```typescript
// apps/web/src/lib/store-factory.ts
import { createFactoryBuilder, defaultStorageAdapter } from '@repo/core/service-factory';

export const createServiceFactory = createFactoryBuilder({
  storageAdapter: defaultStorageAdapter, // localStorage
});
```

**Mobile 端**
```typescript
// apps/mobile/src/lib/store-factory.ts
import { MMKV } from 'react-native-mmkv';
import { createFactoryBuilder, createSafeStorageAdapter } from '@repo/core/service-factory';
import { createMMKVAdapter } from '@repo/core/adapters';

const storageAdapter = createSafeStorageAdapter(
  createMMKVAdapter(new MMKV()),
  { enableQueue: true, enableDebounce: true }
);

export const createServiceFactory = createFactoryBuilder({
  storageAdapter,
});
```

**Desktop 端**
```typescript
// apps/desktop/src/lib/store-factory.ts
import Store from 'electron-store';
import { createFactoryBuilder, createSafeStorageAdapter } from '@repo/core/service-factory';
import { createElectronStoreAdapter } from '@repo/core/adapters';

const storageAdapter = createSafeStorageAdapter(
  createElectronStoreAdapter(new Store()),
  { enableQueue: true, enableDebounce: true }
);

export const createServiceFactory = createFactoryBuilder({
  storageAdapter,
});
```

## 数据流

### 状态更新流程

```
User Action
    ↓
React Component
    ↓
vaultStore.add(vault)  ← 各端实例化的 store
    ↓
Immer middleware (draft mutation)
    ↓
Zod validation
    ↓
Storage adapter (localStorage/MMKV/electron-store)
    ↓
Persist middleware
    ↓
Subscribers notified
    ↓
React Component re-render
```

### 跨端适配流程

```
Service 层定义
    VaultStoreConfig
    actions
    initialState
        ↓
各端引用
    Web    → createStoreFactory → localStorage
    Mobile → createServiceFactory(MMKV) → MMKV
    Desktop → createServiceFactory(electron) → electron-store
        ↓
实例化
    vaultStore
        ↓
使用
    useVaultStore()
    vaultStore.getState()
    vaultStore.batch(...)
```

## 依赖方向

```
应用层 (apps/*)
    ↓ 依赖
Service 层 (packages/core/service)
    ↓ 依赖
工厂层 (packages/core/service-factory)
    ↓ 依赖
第三方库 (zustand, zod, rxjs)
```

**规则**：
- ✅ 应用层可以依赖 Service 层
- ✅ Service 层可以依赖工厂层
- ❌ Service 层不能依赖应用层（会导致循环依赖）
- ❌ 工厂层不能依赖 Service 层

## 为什么这样设计？

### 问题1：如果 Service 层实例化

```typescript
// ❌ Service 层实例化（错误）
// packages/core/src/service/Vault/index.ts
const createStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  // 问题：用什么 storageAdapter？
  // - Web 需要 localStorage
  // - Mobile 需要 MMKV
  // - Desktop 需要 electron-store
  // Service 层无法决定！
});

export const vaultStore = createStore({ vaults: [] }, { actions });
```

**后果**：
- Mobile 端引用时，用的是 localStorage（不存在）
- Desktop 端引用时，用的是 localStorage（不存在）
- 三端无法使用各自的存储方案

### 问题2：如果 Service 层导入各端的配置

```typescript
// ❌ Service 层导入应用层配置（错误）
// packages/core/src/service/Vault/index.ts
import { createServiceFactory } from '@/lib/store-factory';
//                                  ↑ 这个路径只在某一个端存在！

const createStore = createServiceFactory(VaultStoreConfig);
```

**后果**：
- Web 端找不到 `@/lib/store-factory`（不存在）
- 形成循环依赖：Service 层依赖应用层

### 解决方案：分离配置和实例化

```typescript
// ✅ Service 层导出配置（正确）
// packages/core/src/service/Vault/index.ts
export const VaultStoreConfig = { ... };
export const initialState = { ... };
export { actions };

// ✅ 各端实例化（正确）
// apps/web/src/stores/vault.ts
import { createServiceFactory } from '@/lib/store-factory'; // ✅ 各端有自己的配置
import { VaultStoreConfig, actions, initialState } from '@repo/core/service/Vault';

const createStore = createServiceFactory(VaultStoreConfig);
export const vaultStore = createStore(initialState, { actions });
```

**优势**：
- ✅ Service 层纯粹，不依赖应用层
- ✅ 各端可以自由选择存储方案
- ✅ 没有循环依赖
- ✅ 类型安全

## 总结

| 层级 | 职责 | 导出内容 | 不应该做 |
|------|------|---------|---------|
| **应用层** | 实例化 Store | `vaultStore`, `useVaultStore` | 定义业务逻辑 |
| **Service 层** | 定义配置和逻辑 | `VaultStoreConfig`, `actions` | 实例化 Store |
| **工厂层** | 提供状态管理框架 | `createStoreFactory`, `createFactoryBuilder` | 定义业务逻辑 |

**核心原则**：
1. Service 层只导出配置，不实例化
2. 各端独立实例化，自由选择存储
3. 依赖方向单向：应用层 → Service 层 → 工厂层
