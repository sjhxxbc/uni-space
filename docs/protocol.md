# 共享清单 · 前后端协作协议

> 前端仓库：`uni-space`（本仓库）  
> 后端仓库：另建 `list-server`（Spring Boot）  
> 两边 Cursor / 开发都以本文为准；**改接口先改文档，再改代码。**

---

## 1. 产品目标（第一版）

- **先打通微信登录**（小程序为主），再做清单业务
- 多人共享清单：创建清单、邀请码加入、增删条目、勾选/取消
- 勾选后实时同步，展示 **谁、几点** 做的
- 技术：`uni-app (Vue3+TS)` + `Spring Boot` + `REST` + `WebSocket`
- **不做昵称占位登录**；无有效微信身份则不能使用业务接口

---

## 2. 本地联调约定

| 项 | 约定 |
|---|---|
| 后端 HTTP | `http://localhost:8080` |
| 后端 WebSocket | `ws://localhost:8080/ws` |
| 前端 H5 | Vite / HBuilderX 本地端口（如 `5173`） |
| 鉴权 | HTTP Header：`Authorization: Bearer <token>` |
| 时间 | 一律用 **服务器时间**，ISO-8601，如 `2026-07-23T20:23:00+08:00` |
| 字符集 | UTF-8；JSON 字段名 **camelCase** |

后端需开启 CORS，允许本地前端源（至少 H5 开发地址）。

---

## 3. 统一响应格式

### 3.1 成功

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

- `data` 可以是对象或数组；无数据时可为 `null`。

### 3.2 失败

```json
{
  "code": 40001,
  "message": "邀请码无效",
  "data": null
}
```

| code | 含义 |
|---|---|
| 0 | 成功 |
| 40100 | 未登录 / token 无效 |
| 40300 | 无权限（非清单成员） |
| 40400 | 资源不存在 |
| 40000 | 参数错误（通用） |
| 50000 | 服务器内部错误 |

前端：`code !== 0` 时统一 toast `message`。

---

## 4. 数据模型

### 4.1 User（用户）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 业务用户 ID（对外暴露，不要用 openid 当主键返回） |
| openid | string | 微信小程序 openid（**仅存后端，勿下发给前端**） |
| unionId | string \| null | 开放平台 unionId，可空 |
| nickname | string | 微信昵称（用户授权后更新，可先有默认名） |
| avatarUrl | string \| null | 头像 URL |

### 4.2 List（清单）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 清单 ID |
| title | string | 标题 |
| inviteCode | string | 邀请码（加入用） |
| ownerId | string | 创建者 |
| createdAt | string | 创建时间 |

### 4.3 Member（成员）

| 字段 | 类型 | 说明 |
|---|---|---|
| listId | string | |
| userId | string | |
| nickname | string | 冗余展示用 |
| role | string | `owner` \| `member` |
| joinedAt | string | |

### 4.4 Item（条目）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | |
| listId | string | |
| title | string | 条目文案 |
| done | boolean | 是否完成 |
| doneBy | string \| null | 勾选人 userId；未完成则为 null |
| doneByName | string \| null | 勾选人昵称；展示用 |
| doneAt | string \| null | 勾选时间；未完成则为 null |
| sortOrder | number | 排序，越小越靠前 |
| createdAt | string | |
| updatedAt | string | |

**取消勾选时：** `done=false`，`doneBy` / `doneByName` / `doneAt` 置为 `null`。

---

## 5. REST API

Base：`http://localhost:8080/api`

### 5.1 认证（微信小程序登录 · 优先实现）

> 主端：微信小程序。H5 / App 的微信登录第二期再补，本协议先定小程序链路。

#### 流程概览

```
小程序 uni.login()
  → 得到临时 code
  → POST /api/auth/wx-login { code, nickname?, avatarUrl? }
  → 后端用 code 调微信 jscode2session 换 openid
  → 查找或创建用户，签发 JWT
  → 前端存储 token + user
```

#### POST `/api/auth/wx-login`

请求：

```json
{
  "code": "081xxx",
  "nickname": "张三",
  "avatarUrl": "https://..."
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| code | 是 | `uni.login` 返回的 code，一次性 |
| nickname | 否 | 用户授权后的昵称；未提供则后端用默认名如「微信用户」 |
| avatarUrl | 否 | 用户选择的头像 URL |

响应 `data`：

```json
{
  "token": "jwt-xxx",
  "user": {
    "id": "u_1",
    "nickname": "张三",
    "avatarUrl": "https://..."
  }
}
```

**前端：**

1. 登录页：按钮触发 `uni.login({ provider: 'weixin' })` 取 `code`
2. 昵称/头像：按微信小程序现行规范用头像昵称填写能力（如 `chooseAvatar`、昵称输入），再一并传给后端（不要用已废弃的随意拉取用户信息方式）
3. 调用 `/api/auth/wx-login`，成功后 `uni.setStorageSync` 存 `token`、`user`
4. 无 token 访问业务页 → 跳转登录页；`40100` → 清 token 并跳转登录

**后端：**

1. 配置小程序 `appId`、`appSecret`（环境变量 / 配置中心，勿提交仓库）
2. 用 `code` 请求微信 `jscode2session`，拿到 `openid`（及可选 `unionid`、`session_key`）
3. `session_key` 仅服务端如需解密时使用，**不要返回前端**
4. 按 `openid` 查用户：无则创建，有则按需更新昵称/头像
5. 签发 JWT（sub=业务 userId）；后续过滤器校验 Bearer token
6. `code` 无效/过期 → `40000` 或专用业务码，message 明确

#### GET `/api/auth/me`

校验登录态，返回当前用户。

响应 `data`：与上面 `user` 结构相同。

**前端：** 启动或进首页时可调一次，刷新本地用户信息。  
**后端：** 需登录。

#### 开发准备（两边都要知道）

| 项 | 谁 | 说明 |
|---|---|---|
| 小程序 AppID | 前端 `manifest.json` / 微信开发者工具 | 与后端同一应用 |
| AppSecret | **仅后端** | 用于 jscode2session |
| 服务器域名 | 小程序后台 | request / socket 合法域名；本地可用开发工具「不校验域名」 |
| 测试 | 真机或开发者工具 | `uni.login` 在开发者工具可测，联调需后端能访问微信接口 |

---

### 5.2 清单

#### POST `/api/lists`

创建清单。

请求：

```json
{
  "title": "周五买菜"
}
```

响应 `data`：`List` 对象（含 `inviteCode`）。

**前端：** 创建成功后进入该清单详情页。  
**后端：** 生成 `id`、`inviteCode`；创建者写入 Member（role=owner）。

#### POST `/api/lists/join`

用邀请码加入。

请求：

```json
{
  "inviteCode": "A3K9P2"
}
```

响应 `data`：`List` 对象。

**前端：** 加入成功后跳转详情。  
**后端：** 校验邀请码；已是成员则直接返回该清单；写入 Member。

#### GET `/api/lists`

当前用户加入的清单列表。

响应 `data`：`List[]`

**前端：** 首页展示。  
**后端：** 按当前用户查 Member → List。

#### GET `/api/lists/{listId}`

清单详情（含条目与成员，一次拉全量，便于 WS 断线恢复）。

响应 `data`：

```json
{
  "list": { "id": "", "title": "", "inviteCode": "", "ownerId": "", "createdAt": "" },
  "members": [],
  "items": []
}
```

**前端：** 进详情页先调此接口；WS 重连后再调一次做全量对齐。  
**后端：** 校验是否为成员；按 `sortOrder` 返回 items。

---

### 5.3 条目

#### POST `/api/lists/{listId}/items`

新增条目。

请求：

```json
{
  "title": "牛奶"
}
```

响应 `data`：`Item`

**前端：** 成功后插入列表；若已连 WS，也可等广播（建议以广播或 HTTP 返回二选一，避免重复——见下文「去重」）。  
**后端：** 校验成员；落库后 **向该 listId 房间广播** `item.created`。

#### PATCH `/api/items/{itemId}`

更新条目。第一版主要用于勾选。

请求（勾选）：

```json
{
  "done": true
}
```

请求（改标题，可选）：

```json
{
  "title": "低脂牛奶"
}
```

响应 `data`：完整 `Item`（含 `doneBy`、`doneByName`、`doneAt`）。

**规则（后端必须遵守）：**

- `done: true` → 写入当前用户为 `doneBy` / `doneByName`，`doneAt` = 服务器当前时间
- `done: false` → 上述三字段置 null
- 不允许客户端自己传 `doneBy` / `doneAt` 覆盖（即使传了也忽略）

落库成功后广播 `item.updated`。

#### DELETE `/api/items/{itemId}`

删除条目。

响应 `data`：`null` 或 `{ "id": "..." }`

**后端：** 校验成员；删除后广播 `item.deleted`。

---

## 6. WebSocket 协议

### 6.1 连接

- URL：`ws://localhost:8080/ws?token=<jwt>`  
  （若实现不便，也可连接后发首帧鉴权，但联调优先 query token）
- 鉴权失败：关闭连接，前端退回登录

### 6.2 客户端 → 服务端

#### 加入清单房间（进详情页后发送）

```json
{
  "type": "list.subscribe",
  "listId": "list_1"
}
```

#### 离开房间（可选，离开详情页）

```json
{
  "type": "list.unsubscribe",
  "listId": "list_1"
}
```

> 第一版：**勾选不走 WS 发送**，只走 HTTP PATCH；WS 只负责收推送。更简单、更好查问题。

### 6.3 服务端 → 客户端（广播）

同一 `listId` 房间内所有在线成员都收到（**包括操作者自己**；前端需做去重或幂等更新）。

#### `item.created`

```json
{
  "type": "item.created",
  "listId": "list_1",
  "item": { "id": "", "listId": "", "title": "", "done": false, "doneBy": null, "doneByName": null, "doneAt": null, "sortOrder": 0, "createdAt": "", "updatedAt": "" }
}
```

#### `item.updated`（勾选/改标题后）

```json
{
  "type": "item.updated",
  "listId": "list_1",
  "item": { "id": "", "done": true, "doneBy": "u_1", "doneByName": "张三", "doneAt": "2026-07-23T20:23:00+08:00", "...": "..." }
}
```

#### `item.deleted`

```json
{
  "type": "item.deleted",
  "listId": "list_1",
  "itemId": "item_1"
}
```

#### `member.joined`（可选，第二期）

```json
{
  "type": "member.joined",
  "listId": "list_1",
  "member": { "userId": "", "nickname": "", "role": "member", "joinedAt": "" }
}
```

### 6.4 心跳（建议）

- 客户端每隔 30s 发：`{ "type": "ping" }`
- 服务端回：`{ "type": "pong" }`
- 超时未 pong → 前端重连

### 6.5 断线恢复

1. 重连 WS  
2. 再发 `list.subscribe`  
3. 再调 `GET /api/lists/{listId}` 全量覆盖本地  
4. 继续收增量事件  

---

## 7. 前端需要做什么（本仓库）

### 7.1 工程与基础设施

- [ ] 配置微信小程序 AppID（`manifest.json`）
- [ ] 封装 `uni.request`：基址、自动带 token、`code !== 0` 与 `40100` 处理
- [ ] 本地存储：token、当前用户；启动时检查登录态
- [ ] 环境配置：开发基址（本地后端 IP/域名，真机联调不要写死仅 localhost）
- [ ]（P1）封装 WebSocket：`connect` / `subscribe` / `onMessage` / 重连 / 心跳

### 7.2 页面（建议）

| 页面 | 路径建议 | 职责 |
|---|---|---|
| 登录 | `pages/login/login` | 微信一键登录：`uni.login` + 头像昵称填写 → `/api/auth/wx-login` |
| 清单列表 | `pages/home/home` | 我的清单、创建、跳转加入（需已登录） |
| 加入清单 | `pages/join/join` | 输入邀请码 |
| 清单详情 | `pages/list/detail` | 条目列表、勾选、新增、展示谁/几点；进页拉全量 + 订阅 WS |

在 `pages.json` 注册上述页面；详情页标题可用清单名。

### 7.3 交互细节

- **最先做登录页与鉴权拦截**，再做清单页
- 勾选：先调 `PATCH /api/items/{id}`；可用乐观更新（先改 UI），失败则回滚
- 收到 `item.updated`：按 `item.id` 替换本地对应项（幂等）
- 展示：已完成项显示 `doneByName` + 格式化后的 `doneAt`（如 `昨天 20:23` / `07-23 20:23`）
- 分享邀请码：详情页展示 `inviteCode`，可复制

### 7.4 第一期可以不做

- H5 / App 微信登录
- 系统推送通知
- 离线队列
- 复杂冲突合并（以服务端为准即可）

---

## 8. 后端需要做什么（list-server）

### 8.1 工程

- [ ] Spring Boot 3 项目
- [ ] MySQL（或开发期 H2）+ 表：user / list / member / item（user 含 openid 唯一索引）
- [ ] **微信 jscode2session 客户端**（appId/appSecret 配置化）
- [ ] JWT 签发与过滤器（业务接口均需登录；openid 不落日志明文过多）
- [ ] CORS 配置（H5 调试如需要）
- [ ] 统一响应体 `{ code, message, data }`
- [ ]（P1）WebSocket 端点 `/ws`，按 `listId` 房间订阅与广播

### 8.2 业务规则

- **无有效 JWT 不得访问清单/条目接口**（除 wx-login）
- 所有清单/条目接口校验「当前用户是成员」
- 勾选人、时间只由服务端写入（昵称取库中用户 nickname）
- **先写库成功，再 WS 广播**
- `inviteCode` 唯一、可读（如 6 位字母数字）

### 8.3 表字段建议

与第 4 节模型对齐；`user.openid` 唯一；主键可用 UUID 或雪花 ID（字符串返回前端）。

### 8.4 联调顺序建议

1. **微信登录打通**（开发者工具 / 真机 → wx-login → 拿到 token → `/api/auth/me`）  
2. 创建清单 + 拉列表  
3. 加入 + 详情全量  
4. 增删改条目（HTTP）  
5. WebSocket 订阅 + 广播  
6. 两台设备验证「一勾就显示谁和几点」

---

## 9. 去重约定（避免一条变两条）

操作者自己也会收到 WS 广播。前端约定：

- 以 `item.id` 为键更新本地 Map/列表  
- 已存在则 **替换**，不存在则 **插入**  
- 不要「HTTP 返回插一条 + WS 再插一条」

---

## 10. 分期

| 期 | 范围 |
|---|---|
| **P0** | **微信小程序登录**（wx-login + JWT + me）+ 前端登录页与鉴权 |
| P1 | 清单 REST 全通 + 详情页可用（可暂时轮询） |
| P2 | WebSocket 实时 + 谁/几点展示 |
| P3 | 成员列表 UI、踢人/退出；H5 登录等 |

---

## 11. 变更流程

1. 改本文档（双方知道）  
2. 后端实现 / 调整  
3. 前端对接  
4. 联调勾选项打 ✔  

文档版本：`v1.1` · 2026-07-23  
变更：去掉昵称占位登录；认证改为微信小程序登录优先（P0）。
