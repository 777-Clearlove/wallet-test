# 工厂构建器使用指南

## 概述

`createFactoryBuilder` 实现了"工厂的工厂"模式，允许你在应用入口配置一次存储适配器，然后在所有 Service 层复用，避免重复配置。

## 为什么需要工厂构建器？

### 问题：重复配置

```typescript
// ❌ 不好：每个 Service 都要配置一遍 storageAdapter
const createVaultStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: someAdapter,  // 重复
});

const createNetworkStore = createStoreFactory({
  name: 'NetworkStore',
  schema: NetworkStateSchema,
  storageAdapter: someAdapter,  // 重复
});

const createAddressStore = createStoreFactory({
  name: 'AddressStore',
  schema: AddressStateSchema,
  storageAdapter: someAdapter,  // 重复
});
```

### 解决方案：工厂构建器

```typescript
// ✅ 好：应用入口配置一次
export const createServiceFactory = createFactoryBuilder({
  storageAdapter: safeAdapter,
});

// Service 层保持纯粹
const createVaultStore = createServiceFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  // 不需要配置 storageAdapter
});
```

## 使用步骤（推荐）

### 步骤 1: 各端配置存储适配器

```typescript
// apps/mobile/src/lib/store-factory.ts
import { MMKV } from 'react-native-mmkv';
import {
  createFactoryBuilder,
  createSafeStorageAdapter,
} from '@repo/core/service-factory';
import { createMMKVAdapter } from '@repo/core/adapters';

// 1. 创建存储实例
const mmkv = new MMKV();

// 2. 创建存储适配器（带安全装饰器）
const storageAdapter = createSafeStorageAdapter(
  createMMKVAdapter(mmkv),
  {
    enableQueue: true,      // 防止并发冲突
    enableDebounce: true,   // 减少写入频率
    debounceWait: 300,
  }
);

// 3. 导出配置好的工厂
export const createServiceFactory = createFactoryBuilder({
  storageAdapter,
});
```

### 步骤 2: 各端初始化所有 Service（一次调用）

#### Web 端

```typescript
// apps/web/src/stores/index.ts
import { createStoreFactory } from '@repo/core/service-factory';
import { createServices } from '@repo/core/service';

// 一次调用，创建所有 Service
export const services = createServices(createStoreFactory);

// 导出各个 Service
export const {
  vault,   // { store, useStore, getState, batch, ... }
  // network,
  // address,
} = services;

// 方便使用
export const useVaultStore = vault.useStore;
export const vaultStore = vault.store;
```

#### Mobile 端

```typescript
// apps/mobile/src/stores/index.ts
import { createServiceFactory } from '@/lib/store-factory'; // 预配置了 MMKV
import { createServices } from '@repo/core/service';

// 一次调用，创建所有 Service（使用 MMKV）
export const services = createServices(createServiceFactory);

// 导出各个 Service
export const {
  vault,
  // network,
  // address,
} = services;

// 方便使用
export const useVaultStore = vault.useStore;
export const vaultStore = vault.store;
```

#### Desktop 端

```typescript
// apps/desktop/src/stores/index.ts
import { createServiceFactory } from '@/lib/store-factory'; // 预配置了 electron-store
import { createServices } from '@repo/core/service';

// 一次调用，创建所有 Service（使用 electron-store）
export const services = createServices(createServiceFactory);

// 导出各个 Service
export const {
  vault,
  // network,
  // address,
} = services;

// 方便使用
export const useVaultStore = vault.useStore;
export const vaultStore = vault.store;
```

### 步骤 3: 在代码中使用

```typescript
// 组件中使用
import { useVaultStore, vaultStore } from '@/stores';

function VaultList() {
  // 使用 React Hook
  const vaults = useVaultStore((state) => state.vaults);

  const handleAdd = () => {
    // 直接调用 action
    vaultStore.getState().add(newVault);

    // 或批量操作
    vaultStore.batch((actions) => {
      actions.add(vault1);
      actions.add(vault2);
    });
  };

  return <div>{vaults.map(v => <div key={v.id}>{v.name}</div>)}</div>;
}
```

---

## 各平台配置示例

### Web 端（localStorage）

```typescript
// apps/web/src/lib/store-factory.ts
import {
  createFactoryBuilder,
  defaultStorageAdapter,
} from '@repo/core/service-factory';

export const createServiceFactory = createFactoryBuilder({
  storageAdapter: defaultStorageAdapter,  // 直接使用默认的 localStorage
});
```

### React Native（MMKV）

```typescript
// apps/mobile/src/lib/store-factory.ts
import { MMKV } from 'react-native-mmkv';
import {
  createFactoryBuilder,
  createSafeStorageAdapter,
} from '@repo/core/service-factory';
import { createMMKVAdapter } from '@repo/core/adapters';

const mmkv = new MMKV();

export const createServiceFactory = createFactoryBuilder({
  storageAdapter: createSafeStorageAdapter(
    createMMKVAdapter(mmkv),
    {
      enableQueue: true,      // 必须：防止并发冲突
      enableDebounce: true,   // 推荐：减少写入频率
      debounceWait: 300,
    }
  ),
});
```

### Electron

```typescript
// apps/desktop/src/lib/store-factory.ts
import Store from 'electron-store';
import {
  createFactoryBuilder,
  createSafeStorageAdapter,
} from '@repo/core/service-factory';
import { createElectronStoreAdapter } from '@repo/core/adapters';

const electronStore = new Store({
  name: 'wallet-data',
  encryptionKey: process.env.ENCRYPTION_KEY,  // 可选：加密
});

export const createServiceFactory = createFactoryBuilder({
  storageAdapter: createSafeStorageAdapter(
    createElectronStoreAdapter(electronStore),
    {
      enableQueue: true,      // 必须：防止并发冲突
      enableDebounce: true,
      debounceWait: 300,
    }
  ),
});
```

### 浏览器插件（Chrome Extension）

```typescript
// apps/extension/src/lib/store-factory.ts
import {
  createFactoryBuilder,
  createSafeStorageAdapter,
} from '@repo/core/service-factory';
import { createChromeStorageAdapter } from '@repo/core/adapters';

export const createServiceFactory = createFactoryBuilder({
  storageAdapter: createSafeStorageAdapter(
    createChromeStorageAdapter('local'),  // 或 'sync'
    {
      enableQueue: true,      // 必须：防止并发冲突
      enableDebounce: true,
      debounceWait: 300,
    }
  ),
});
```

## 安全装饰器配置

### 什么时候需要安全装饰器？

| 平台 | 推荐配置 | 原因 |
|------|---------|------|
| **Web (localStorage)** | 可选 | localStorage 是同步的，冲突风险低 |
| **RN (MMKV/AsyncStorage)** | **必须** | 异步存储，容易并发冲突 |
| **Electron** | **必须** | 文件 I/O 异步 |
| **浏览器插件** | **必须** | chrome.storage 异步 |

### 配置选项

```typescript
createSafeStorageAdapter(baseAdapter, {
  enableQueue: true,        // 防止并发写入冲突（推荐所有异步存储）
  enableDebounce: true,     // 减少写入频率（可选）
  debounceWait: 300,        // 防抖延迟（毫秒）
  maxWait: 1000,            // 最大等待时间（毫秒）
})
```

**组合效果**：
1. **队列化** - 所有读写操作顺序执行，避免冲突
2. **防抖** - 高频更新时减少实际写入次数
3. **原子写入** - 使用 double buffer 防止写入中断
4. **Checksum 校验** - 检测数据损坏并自动恢复

## 对比：直接使用 vs 工厂构建器

### 直接使用 createStoreFactory

```typescript
// 每个 Service 都要配置
const createVaultStore = createStoreFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  storageAdapter: someAdapter,  // 需要传递
});

const createNetworkStore = createStoreFactory({
  name: 'NetworkStore',
  schema: NetworkStateSchema,
  storageAdapter: someAdapter,  // 重复配置
});
```

**适用场景**：
- 单个 Service 的应用
- 不同 Service 需要不同的存储配置

### 使用 createFactoryBuilder

```typescript
// 应用入口配置一次
export const createServiceFactory = createFactoryBuilder({
  storageAdapter: safeAdapter,
});

// 所有 Service 复用
const createVaultStore = createServiceFactory({
  name: 'VaultsStore',
  schema: VaultsStateSchema,
  // 不需要传 storageAdapter
});

const createNetworkStore = createServiceFactory({
  name: 'NetworkStore',
  schema: NetworkStateSchema,
  // 不需要传 storageAdapter
});
```

**适用场景**：
- 多个 Service 的应用（推荐）
- 所有 Service 使用相同的存储配置
- 跨端应用（Web/RN/Electron）

## 最佳实践

### 1. 单一配置文件

```typescript
// ✅ 好：所有平台共用一个配置逻辑
// lib/store-factory.ts
import { Platform } from 'react-native';

const getStorageAdapter = () => {
  if (Platform.OS === 'web') {
    return defaultStorageAdapter;
  }

  // RN/Electron 使用安全适配器
  return createSafeStorageAdapter(
    createMMKVAdapter(new MMKV()),
    { enableQueue: true, enableDebounce: true }
  );
};

export const createServiceFactory = createFactoryBuilder({
  storageAdapter: getStorageAdapter(),
});
```

### 2. 环境变量控制

```typescript
// 开发环境：使用内存存储（便于测试）
// 生产环境：使用持久化存储
const storageAdapter = __DEV__
  ? createMemoryStorageAdapter()
  : createSafeStorageAdapter(createMMKVAdapter(new MMKV()));

export const createServiceFactory = createFactoryBuilder({
  storageAdapter,
});
```

### 3. 类型安全

```typescript
// 导出带类型的工厂
import type { FactoryBuilderConfig } from '@repo/core/service-factory';

const config: FactoryBuilderConfig = {
  storageAdapter: safeAdapter,
};

export const createServiceFactory = createFactoryBuilder(config);
```

## 常见问题

### Q: 可以为不同 Service 使用不同的存储吗？

**A**: 可以，但不推荐。如果确实需要，直接使用 `createStoreFactory`：

```typescript
// 大部分 Service 使用默认工厂
const createVaultStore = createServiceFactory({ ... });

// 特殊 Service 单独配置
const createCacheStore = createStoreFactory({
  name: 'CacheStore',
  schema: CacheSchema,
  storageAdapter: sessionStorageAdapter,  // 使用 sessionStorage
});
```

### Q: 工厂构建器有性能损耗吗？

**A**: 没有。`createFactoryBuilder` 只是一个配置包装器，运行时性能和直接使用 `createStoreFactory` 完全相同。

### Q: 可以动态切换存储适配器吗？

**A**: 不推荐。存储适配器应该在应用启动时配置一次。如果需要切换，建议重新初始化整个应用。

## 总结

工厂构建器的优势：

- ✅ **配置一次，复用多次** - 避免重复配置
- ✅ **类型安全** - 完整的 TypeScript 支持
- ✅ **无全局状态** - 显式传递，易于测试
- ✅ **零性能损耗** - 纯编译时抽象
- ✅ **灵活扩展** - 可以混用直接配置和工厂构建器

**推荐使用场景**：所有多 Service 的应用！
