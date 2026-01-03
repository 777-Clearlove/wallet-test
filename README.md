# New Mega Wallet

一个现代化、模块化的跨平台钱包核心架构。基于最佳实践重新设计，参考 MetaMask Core 和 Arx 的架构思想。

## 📋 目录

- [架构概览](#架构概览)
- [与 Old Mega Wallet 的演进](#与-old-mega-wallet-的演进)
- [核心模块](#核心模块)
  - [Provider System](#provider-system---provider-系统)
  - [RPC Engine](#rpc-engine---rpc-引擎)
  - [Service Layer](#service-layer---业务服务层)
  - [Service Factory](#service-factory---状态工厂层)
  - [Error System](#error-system---统一错误处理)
- [代码阅读指南](#代码阅读指南)
- [Quick Start](#quick-start)

---

## 架构概览

### 完整请求链路

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DApp 页面                                       │
│   window.ethereum.request({ method: 'eth_sendTransaction', params: [...] }) │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ window.postMessage
                                     ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Provider (inpage.js)                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  WindowPostMessageTransport → EIP1193Provider → ProviderHost            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ postMessage / Port
                                     ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Content Script / Background                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         RPC Engine                                       ││
│  │  Request → Logger → Dedupe → LockedGuard → PermissionGuard → Executor   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                     │                                        │
│                                     ↓ 调用                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Service Layer                                     ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       ││
│  │  │  Vault   │ │ Network  │ │ Account  │ │Permission│ │Transaction│      ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                     │                                        │
│                                     ↓ 持久化                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      Storage Adapter                                     ││
│  │  localStorage / IndexedDB / MMKV / chrome.storage / electron-store       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 模块层次

```
┌─────────────────────────────────────────────────────────────────────┐
│                     应用层 (apps/)                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │  Extension  │ │   Mobile    │ │   Desktop   │ │    Web      │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
└────────────────────────────┬────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      核心层 (packages/core/)                         │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Provider System  │ 注入 window.ethereum, Transport 抽象        │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ RPC Engine       │ 中间件栈, Protocol 定义, 请求路由            │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ Service Layer    │ Vault, Network, Account, Permission 等业务  │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ Service Factory  │ Zustand + Immer + Zod, Storage Adapter      │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ Error System     │ WalletError, 错误码体系, JSON-RPC 兼容      │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 设计原则

1. **分层解耦** - 清晰的层级边界，依赖单向流动
2. **平台无关** - Core 层不依赖任何平台 API
3. **类型安全** - TypeScript 优先，利用类型推断减少样板代码
4. **可测试性** - 依赖注入，易于 Mock

---

## 与 Old Mega Wallet 的演进

Old Mega Wallet 已经是一个完整可用的钱包实现。New Mega Wallet 在其基础上进行了架构升级，主要改进方向如下：

### 主要演进方向

| 方面 | Old Mega Wallet | New Mega Wallet |
|------|-----------------|-----------------|
| **服务组织** | 单例模式 `service.xxx` | 工厂模式 + 依赖注入 |
| **存储层** | `@autoStorage` 装饰器 | `StorageAdapter` 统一抽象 |
| **错误处理** | 分散的 Error 类型 | 统一 `WalletError` + 错误码 |
| **Provider/Bridge** | 分布在多个仓库 | 整合到 `packages/core` |
| **数据校验** | 运行时手动检查 | Zod Schema 声明式校验 |

### 1. 服务组织方式

Old Mega Wallet 使用经典的单例 + 相互引用模式，开发简单直接：

```typescript
// Old: 单例模式，所有服务通过 this.service 互相访问
export default class Service {
  wallet = new Wallet(this)
  auth = new Auth(this)
  network = new Network(this)
}
export const service = new Service()
```

New Mega Wallet 改用工厂模式，便于测试和按需实例化：

```typescript
// New: 工厂模式
const services = createServices({ storageAdapter });
// 支持 Mock，每个测试可以独立实例
```

### 2. Provider/Bridge 整合

Old Mega Wallet 将 Provider 和 Bridge 分布在三个仓库，各端分别维护：

```
Old 结构：
mega-wallet/            # 主应用
mega-wallet-provider/   # Provider（独立仓库）
mega-wallet-js-bridge/  # Bridge（独立仓库）
```

New Mega Wallet 将通信层整合到 core 包，统一 Transport 抽象：

```
New 结构：
packages/core/
├── provider/          # Provider + Transport 抽象
│   ├── host/          # ProviderHost（注入）
│   ├── transport/     # Transport 接口
│   └── namespaces/    # EIP155 等实现
└── rpc/               # RPC Engine + 中间件
```

### 3. 错误处理统一

```typescript
// Old: 各种 Error 类型
throw new errorUtils.KeyringError('invalid mnemonic!')

// New: 统一错误码体系
throw walletErrors.vaultDecryptionFailed({
  message: 'Failed to decrypt vault',
  data: { vaultId },
});
// 支持 JSON-RPC 错误格式，便于前端统一处理
```

---

## 核心模块

> 按请求链路顺序介绍：Provider → RPC → Service → Factory

### Provider System - Provider 系统

> 📁 `packages/core/src/provider/`

**职责**：向 DApp 页面注入标准 Provider（EIP-1193 / EIP-6963），并通过 Transport 与钱包通信。

#### 目录结构

```
provider/
├── protocol/              # 消息协议定义
│   ├── envelope.ts        # 消息信封格式
│   ├── channel.ts         # 通道标识
│   └── version.ts         # 协议版本
├── transport/             # Transport 抽象与实现
│   └── windowPostMessageTransport.ts
├── host/                  # Provider 注入管理
│   └── providerHost.ts
├── namespaces/            # 协议实现
│   └── eip155/
│       ├── provider.ts    # EIP-1193 Provider 实现
│       ├── state.ts       # Provider 状态管理
│       ├── constants.ts   # 超时配置、方法分类
│       └── injected.ts    # 注入脚本
├── registry/              # Provider 工厂注册表
├── types/                 # 类型定义
├── errors.ts              # Provider 错误
└── utils/
```

#### Transport 抽象层

```typescript
// Transport 接口 - 平台无关的通信抽象
interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  request(args: RequestArguments, options?: TransportRequestOptions): Promise<unknown>;
  isConnected(): boolean;
  getConnectionState(): TransportState;
  on(event: string, handler: Function): void;
  removeListener(event: string, handler: Function): void;
}

// TransportState - 连接状态
type TransportState = {
  connected: boolean;
  chainId: string | null;
  caip2: string | null;        // CAIP-2 格式，如 "eip155:1"
  accounts: string[];
  isUnlocked: boolean | null;
  meta: TransportMeta | null;
};

// 各平台实现不同的 Transport：
// - WindowPostMessageTransport（页面 ↔ Content Script）
// - PortTransport（Extension Background ↔ Popup）
// - WebViewTransport（Mobile WebView ↔ Native）
```

#### 消息信封格式 (Envelope)

```typescript
// 定义页面与 content script 之间的消息格式
type Envelope =
  | { channel; sessionId; type: "handshake"; payload: HandshakePayload }
  | { channel; sessionId; type: "handshake_ack"; payload: HandshakeAckPayload }
  | { channel; sessionId; type: "request"; id; payload: TransportRequest }
  | { channel; sessionId; type: "response"; id; payload: TransportResponse }
  | { channel; sessionId; type: "event"; payload: { event; params } };

// Handshake 响应载荷
type HandshakeAckPayload = {
  protocolVersion: number;
  handshakeId: string;
  chainId: string;
  caip2: string;
  accounts: string[];
  isUnlocked: boolean;
  meta: TransportMeta;
};
```

#### ProviderHost

```typescript
// 管理 Provider 注入
const host = new ProviderHost({
  targetWindow: window,
  transport: new WindowPostMessageTransport(),
  features: { eip6963: true },
});

host.initialize();
// → 注入 window.ethereum
// → 响应 eip6963:requestProvider 事件
// → 广播 eip6963:announceProvider 事件
```

#### EIP-1193 Provider (Eip155Provider)

```typescript
// 完整的 EIP-1193 Provider 实现
class Eip155Provider extends EventEmitter implements EIP1193Provider {
  // 状态属性
  get chainId(): string | null;
  get selectedAddress(): string | null;
  get isUnlocked(): boolean | null;
  get caip2(): string | null;
  
  // 标准方法
  request(args: RequestArguments): Promise<unknown>;
  isConnected(): boolean;
  
  // Legacy 兼容方法
  enable(): Promise<string[]>;
  send(method, params): Promise<LegacyResponse>;
  sendAsync(payload, callback): void;
  
  // 事件：connect, disconnect, chainChanged, accountsChanged
}

// 使用示例
const provider = new Eip155Provider({ transport });
const accounts = await provider.request({ method: 'eth_requestAccounts' });
```

#### Handshake 协议

```
Page (inpage.js)                     Content Script
      │                                    │
      │ ──────── handshake ───────────────>│
      │    { protocolVersion, handshakeId }│
      │                                    │
      │ <─────── handshake_ack ────────────│
      │    { chainId, caip2, accounts,     │
      │      isUnlocked, meta }            │
      │                                    │
      │ ──────── request ─────────────────>│
      │    { id, jsonrpc, method, params } │
      │                                    │
      │ <─────── response ─────────────────│
      │    { id, jsonrpc, result/error }   │
      │                                    │
      │ <─────── event ────────────────────│
      │    { event: 'chainChanged', ... }  │
```

---

### RPC Engine - RPC 引擎

> 📁 `packages/core/src/rpc/`

**职责**：处理 JSON-RPC 请求，基于 `@metamask/json-rpc-engine` v2 构建。

#### 目录结构

```
rpc/
├── engine.ts              # 核心引擎 createWalletEngine
├── protocol.ts            # Protocol 定义器 createProtocolDef
├── types.ts               # RpcContext, PermissionScope, LockedBehavior
├── middlewares/
│   ├── logger.ts          # 日志记录
│   ├── dedupe.ts          # 请求去重
│   ├── lockedGuard.ts     # 锁定状态检查
│   ├── permissionGuard.ts # 权限检查
│   ├── executor.ts        # 方法执行/代理
│   └── performance.ts     # 性能监控
├── namespaces/
│   └── eip155.ts          # EIP-155 协议定义
├── bridge.ts              # Transport 桥接
└── transports/            # RPC 层 Transport
```

#### 中间件栈架构

```
Request → Logger → Dedupe → LockedGuard → PermissionGuard → Executor → Response
            │         │           │              │              │
            │         │           │              │              └─ 调用 Service / 代理到节点
            │         │           │              └─ 检查 DApp 权限
            │         │           └─ 检查钱包锁定状态
            │         └─ 去重相同只读请求
            └─ 日志记录
```

#### RpcContext 上下文

```typescript
// 请求执行上下文
type RpcContext = {
  readonly origin: string;      // 请求来源 (DApp origin)
  readonly chainId: string;     // 目标链 ID (CAIP-2 格式)
  readonly namespace: string;   // 协议命名空间
  readonly sessionId?: string;  // 会话 ID
  readonly source: RpcSource;   // 'dapp' | 'internal'
};

// 锁定行为
type LockedBehavior =
  | { type: 'allow' }                    // 允许执行
  | { type: 'deny' }                     // 拒绝执行
  | { type: 'respond'; value: Json };    // 返回预设值

// 权限范围
const PermissionScope = {
  Public: 'public',           // 无需权限
  Accounts: 'accounts',       // 账户访问
  Sign: 'sign',               // 签名权限
  Transaction: 'transaction', // 交易权限
};
```

#### Protocol 定义

```typescript
// 声明式定义协议
const define = createProtocolDef<MyServices>();

export const eip155 = define({
  name: 'eip155',
  prefixes: ['eth_', 'personal_', 'wallet_', 'net_', 'web3_'],
  
  methods: {
    // 公开方法 - 锁定时也允许
    eth_chainId: {
      scope: PermissionScope.Public,
      locked: WhenLocked.allow(),
      handler: ({ services }) => services.network.getActiveChain().chainId,
    },
    
    // 账户方法 - 锁定时返回空数组
    eth_accounts: {
      scope: PermissionScope.Accounts,
      locked: WhenLocked.respond([]),
      handler: ({ context, services }) => {
        const { chainRef } = services.network.getActiveChain();
        return services.permission.getPermittedAccounts(context.origin, chainRef);
      },
    },
    
    // 引导方法 - 跳过权限检查，触发授权流程
    eth_requestAccounts: {
      scope: PermissionScope.Accounts,
      approval: true,
      bootstrap: true,
      handler: async ({ services }) => {
        const { chainRef } = services.network.getActiveChain();
        return services.accounts.getAccounts({ chainRef });
      },
    },
    
    // 链切换 - 需要用户审批
    wallet_switchEthereumChain: {
      scope: PermissionScope.Public,
      approval: true,
      handler: async ({ request, services }) => {
        const chainId = (request.params as [{ chainId: string }])?.[0]?.chainId;
        const decimal = parseInt(chainId, 16);
        await services.network.switchChain(`eip155:${decimal}`);
        return null;
      },
    },
  },
  
  // 代理方法 - 直接转发到 RPC 节点
  proxy: {
    methods: [
      'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBlockByHash',
      'eth_getBalance', 'eth_getTransactionCount', 'eth_getCode',
      'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_feeHistory',
      'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getLogs',
      'net_version', 'web3_clientVersion',
      // ... 共 34 个方法
    ],
    whenLocked: [
      'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBalance',
      'eth_call', 'eth_estimateGas', 'eth_gasPrice',
      // ... 锁定时仍允许的只读方法
    ],
  },
});
```

#### 创建引擎

```typescript
const engine = createWalletEngine({
  services: myServices,
  middleware: [
    createLoggerMiddleware(),
    createDedupeMiddleware({
      methods: ['eth_chainId', 'eth_blockNumber', 'eth_getBalance', ...],
    }),
    createLockedGuardMiddleware({
      isUnlocked: (s) => s.vault.isUnlocked(),
      isInternalOrigin: (origin) => origin === 'internal',
      resolveLockedBehavior: (method, s) => eip155.methods[method]?.locked,
      requestUnlockAttention: ({ origin, method }) => {
        // 弹出解锁 UI
      },
    }),
    createPermissionGuardMiddleware({
      resolvePermissionScope: (method, s) => eip155.methods[method]?.scope,
      isBootstrapMethod: (method, s) => eip155.methods[method]?.bootstrap,
      hasPermission: (origin, scope, chainId, s) => s.permission.check(...),
    }),
    createExecutorMiddleware({
      protocols: [eip155],
      defaultProtocol: 'eip155',
      onProxy: (chainId, method, params) => rpcClient.request(...),
    }),
  ],
});

// 处理请求
const result = await engine.handle(request, {
  origin: 'https://uniswap.org',
  chainId: 'eip155:1',
  namespace: 'eip155',
  source: 'dapp',
});
```

---

### Service Layer - 业务服务层

> 📁 `packages/core/src/service/`

**职责**：定义业务逻辑（State、Actions、Effects、Selectors），被 RPC Engine 调用。

#### 目录结构

```
service/
├── index.ts           # createServices 统一入口 + 类型注册
├── Vault/             # ✅ 已实现 - 密钥库管理
│   ├── schema.ts      # Zod Schema + State 类型 + Typed Definers
│   ├── action.ts      # Actions 定义
│   ├── selectors.ts   # 纯函数选择器
│   └── index.ts       # 导出整合
├── Derivation/        # ✅ 已实现 - 派生账户管理
│   ├── schema.ts
│   ├── action.ts
│   ├── effect.ts      # Effects（监听 Vault 变化）
│   ├── selectors.ts
│   └── index.ts
├── Address/           # ⚠️ 部分实现
│   └── schema.ts
├── Network/           # ⚠️ 部分实现
│   └── schema.ts
└── Wallet/            # 🚧 待实现
```

#### 类型推断改进 (createTypedDefiners)

在 `schema.ts` 中同时绑定 State 和 Services 类型，让 `action.ts` / `effect.ts` **完全无需泛型**：

```typescript
// ===== schema.ts =====
import { z } from "zod";
import { createTypedDefiners } from "@repo/core/service-factory";
import type { Services } from "..";

export const VaultsStateSchema = z.object({ vaults: z.array(VaultSchema) });
export type VaultsState = z.infer<typeof VaultsStateSchema>;

// 创建类型绑定的 definers（State 和 Services 都绑定）
export const { defineActions, defineEffects, defineSelectors } =
  createTypedDefiners<VaultsState, Services>();

// ===== action.ts =====
import { defineActions, VaultSchema } from "./schema";

// 无需任何泛型！类型完全自动推断
export const actions = defineActions((set, get, getServices) => ({
  add: validated(VaultSchema, (vault) => {
    set((draft) => { draft.vaults.push(vault); });
  }),
  
  findById(id: string) {
    return get().vaults.find((v) => v.id === id);
  },
  
  addWithCheck(vault) {
    const { derivation } = getServices();  // ✅ 类型正确推断
    // ...
  },
}));
```

---

### Service Factory - 状态工厂层

> 📁 `packages/core/src/service-factory/`

**职责**：提供跨平台的状态管理框架，封装 Zustand + Immer + Zod。

#### 核心概念

```typescript
// 1. 定义 Store 配置
const VaultStoreConfig: StoreConfig<VaultsState> = {
  name: 'VaultsStore',
  schema: VaultsStateSchema,           // Zod Schema（可选）
  version: 1,                          // 数据版本
  onValidationFail: 'reset',           // 校验失败策略
};

// 2. 使用工厂创建 Store
const vault = createServiceFactory({
  ...VaultStoreConfig,
  storageAdapter,                      // 存储适配器（平台相关）
  skipHydration: false,
})(initialState, { actions, getServices });

// 3. 使用 Store
vault.useStore((s) => s.vaults);       // React Hook
vault.getState().add(newVault);        // 直接调用 Action
await vault.waitForHydration();        // 等待数据加载
```

#### Storage Adapter 抽象

支持任何符合 `getItem/setItem/removeItem` 接口的存储：

| 平台 | 适配器 | 特点 |
|------|--------|------|
| Web | `localStorage` | 同步，默认 |
| React Native | `MMKV` | 高性能，自带事务安全 |
| Electron | `electron-store` | 支持加密 |
| Extension | `chrome.storage` / `IndexedDB` | 异步，自带事务安全 |

#### Storage Enhancers（增强器）

现代存储后端（MMKV、IndexedDB）本身已具备事务安全和原子性。增强器主要用于特定场景优化：

```typescript
// 高频写入场景（如编辑器实时保存）使用防抖
const adapter = withDebounce({ wait: 300, maxWait: 1000 })(baseAdapter);
```

可用增强器：
- `withDebounce` - **常用**，高频写入防抖，减少 IO

---

### Error System - 统一错误处理

> 📁 `packages/core/src/errors/`

**职责**：提供类型安全的统一错误处理机制。

#### 错误码体系

```typescript
// JSON-RPC 2.0 标准错误 (-32700 ~ -32600)
ParseError, InvalidRequest, MethodNotFound, InvalidParams, InternalError

// EIP-1193 Provider 错误 (4001, 4100, 4200, 4900, 4901)
UserRejected, Unauthorized, UnsupportedMethod, Disconnected, ChainDisconnected

// 钱包业务错误 (-32000 ~ -32099)
GenericError, ValidationFailed, WalletLocked, ChainNotSupported, Timeout,
VaultNotFound, AccountNotFound, InsufficientBalance, PermissionDenied, ...
```

#### WalletError 类

```typescript
class WalletError extends Error {
  readonly code: ErrorCode;
  readonly data?: unknown;

  // 转换为 JSON-RPC 错误格式
  toJsonRpcError(): { code: number; message: string; data?: unknown };

  // 从各种来源创建
  static from(error: unknown): WalletError;
  static fromJsonRpcError(rpcError): WalletError;
  static fromZodError(zodError): WalletError;
}
```

#### 错误工厂

```typescript
// RPC 错误
rpcErrors.methodNotFound({ message: 'Method not supported' });
rpcErrors.invalidParams({ data: { expected: 'string', got: 'number' } });

// Provider 错误
providerErrors.userRejected({ message: 'User cancelled the request' });
providerErrors.unauthorized();

// 业务错误
walletErrors.vaultNotFound({ data: { vaultId: '123' } });
walletErrors.insufficientBalance({ message: 'Not enough ETH for gas' });
```

---

## 代码阅读指南

### 🎯 推荐阅读顺序

建议按**请求链路**顺序阅读，从 DApp 入口到底层状态：

#### 第一阶段：理解 Provider（请求入口）

1. **`packages/core/src/provider/transport/windowPostMessageTransport.ts`**
   - 理解：页面与钱包的通信机制（Handshake、Request/Response）

2. **`packages/core/src/provider/host/providerHost.ts`**
   - 理解：Provider 注入流程、EIP-6963 支持

3. **`packages/core/src/provider/namespaces/eip155/`**
   - 理解：EIP-1193 Provider 实现

#### 第二阶段：理解 RPC Engine（请求处理）

4. **`packages/core/src/rpc/types.ts`**
   - 核心：`RpcContext`, `PermissionScope`, `LockedBehavior`

5. **`packages/core/src/rpc/engine.ts`**
   - 核心：`createWalletEngine`
   - 理解：中间件栈架构

6. **`packages/core/src/rpc/protocol.ts`**
   - 核心：`createProtocolDef`
   - 理解：声明式协议定义

7. **`packages/core/src/rpc/middlewares/`**
   - `lockedGuard.ts` → `permissionGuard.ts` → `executor.ts`
   - 理解：各中间件职责

#### 第三阶段：理解 Service Layer（业务逻辑）

8. **`packages/core/src/service/index.ts`**
   - 核心：`createServices` 函数
   - 理解：服务编排，Effects 初始化

9. **`packages/core/src/service/Vault/`** (按顺序)
   - `schema.ts` → `action.ts` → `selectors.ts` → `index.ts`
   - 理解：业务服务的标准结构

10. **`packages/core/src/service/Derivation/effect.ts`**
    - 理解：跨服务响应机制

#### 第四阶段：理解 Service Factory（基础设施）

11. **`packages/core/src/service-factory/factory.ts`**
    - 核心：`createServiceFactory` 函数
    - 理解：如何创建类型安全的 Store

12. **`packages/core/src/service-factory/storage/adapter.ts`**
    - 核心：`StorageAdapter` 接口
    - 理解：存储抽象层设计

#### 第五阶段：理解 Error System

13. **`packages/core/src/errors/codes.ts`**
    - 理解：错误码分类设计

14. **`packages/core/src/errors/walletError.ts`**
    - 理解：错误类实现，错误工厂模式

---

## Quick Start

### 安装依赖

```bash
bun install
```

### 开发

```bash
# 启动所有应用
turbo dev

# 只启动 web
turbo dev --filter=web

# 运行测试
turbo test

# 类型检查
turbo lint
```

### 创建新服务

1. 在 `packages/core/src/service/` 下创建目录

```
service/
└── MyService/
    ├── schema.ts      # 定义 State 和 Zod Schema
    ├── action.ts      # 定义 Actions
    ├── selectors.ts   # 定义 Selectors（可选）
    ├── effect.ts      # 定义 Effects（可选）
    └── index.ts       # 导出整合
```

2. 在 `service/index.ts` 中注册

```typescript
import { config as MyServiceConfig, ... } from './MyService';

export function createServices(platform?: PlatformConfig) {
  // ...
  const myService = createServiceFactory({
    ...MyServiceConfig,
    storageAdapter,
  })(initialState, { actions: myServiceActions, getServices });

  services = { vault, derivation, myService } as Services;
  // ...
}
```

### 添加新的 RPC 方法

在 `packages/core/src/rpc/namespaces/` 中扩展或创建协议定义：

```typescript
export const eip155 = define({
  // ...
  methods: {
    // 添加新方法
    wallet_myNewMethod: {
      scope: PermissionScope.Accounts,
      handler: async ({ context, services }) => {
        // 实现逻辑
      },
    },
  },
});
```

---

## 技术栈

| 依赖 | 用途 |
|------|------|
| `zustand` | 状态管理核心 |
| `immer` | 不可变状态更新 |
| `zod` | Schema 验证 |
| `rxjs` | Hydration 状态流 |
| `lodash-es` | 工具函数 |
| `@metamask/json-rpc-engine` | RPC 引擎基础 |
| `eventemitter3` | 事件发射器 |


---

## License

MIT
