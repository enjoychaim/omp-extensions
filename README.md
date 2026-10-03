# OMP 本地扩展

本目录保存 OMP 启动时自动发现的 TypeScript 扩展。默认位置为：

```text
~/.omp/agent/extensions
```

如果设置了 `PI_CODING_AGENT_DIR`，实际位置为 `$PI_CODING_AGENT_DIR/extensions`。

## 扩展一览

| 文件 | 来源 | 作用 |
| --- | --- | --- |
| `litellm-images.ts` | 本地配置 | 注册 LiteLLM 图片模型，并将其归入 OMP 的 `image` 模型目录。 |
| `orca-agent-status.ts` | Orca 管理 | 将会话、模型、工具调用、审批和完成状态发送到 Orca 本地 Hook。 |
| `orca-prefill.ts` | Orca 管理 | 在 Orca 启动会话时，将预填内容写入 OMP 编辑器。 |
| `orca-titlebar-spinner.ts` | Orca 管理 | 在终端标题栏显示 Agent 运行和空闲压缩动画。 |

> `orca-*` 文件带有 `@orca-managed-pi-extension` 标记，并被 `.gitignore` 排除。Orca 可能在升级、启动或重新配置时覆盖这些文件；不要把手工修改长期保存在其中。

## 加载方式

OMP 默认发现扩展目录中的文件。修改扩展后，应新开一个 OMP 进程使其生效。

仅加载指定扩展进行排查：

```bash
omp --no-extensions -e ./litellm-images.ts
```

禁用自动发现的全部扩展：

```bash
omp --no-extensions
```

## LiteLLM 图片模型

`litellm-images.ts` 注册提供方 `litellm-images`，使用 OpenAI Images 兼容接口：

```text
http://127.0.0.1:4000/v1
```

已注册模型：

- `gpt-image-2.5`
- `gpt-image-2.5-flare`
- `gpt-image-2.5-sunburst`

扩展将这些模型标记为：

- `kind: image`
- `api: openai-images`
- 输入类型：文本和图片
- API Key：固定占位值 `local`

因此，真实鉴权、模型路由和上游连接应由监听 `127.0.0.1:4000` 的 LiteLLM 服务处理。若端口、路径或模型名发生变化，需要同步修改 `BASE_URL` 或 `MODELS`。

检查模型是否已进入图片模型目录：

```bash
omp models litellm-images --kind image
```

隔离其他扩展后检查：

```bash
omp models litellm-images --kind image --no-extensions -e ./litellm-images.ts
```

## Orca 集成

### 状态上报

`orca-agent-status.ts` 向回环地址上的 `/hook/omp` 发送状态。它覆盖以下主要事件：

- 会话 ID、会话文件和当前模型元数据（随其他事件发送）
- Agent 开始、结束和稳定
- 模型切换
- 工具开始、调用和结束
- 工具审批请求及结果
- 最后一条 Assistant 文本
- 子 Agent 生命周期

状态投递采用最新快照优先策略，单次请求超时为 1 秒，失败后最多重试 3 次。状态上报失败不会中断 OMP 会话。

Orca 正常启动 OMP 时会注入所需环境变量，通常不需要手工设置。关键变量如下：

| 变量 | 说明 |
| --- | --- |
| `ORCA_PANE_KEY` | 当前 Orca Pane 标识；缺失时不发送状态。 |
| `ORCA_AGENT_HOOK_ENDPOINT` | Hook 坐标文件，支持 `KEY=VALUE` 和 Windows `set KEY=VALUE` 格式。 |
| `ORCA_AGENT_HOOK_PORT` | Orca 本地 Hook 端口。 |
| `ORCA_AGENT_HOOK_TOKEN` | 请求令牌，通过 `X-Orca-Agent-Hook-Token` 发送。 |
| `ORCA_AGENT_HOOK_ENV` | 随状态附带的环境标识。 |
| `ORCA_AGENT_HOOK_VERSION` | 随状态附带的协议或运行时版本。 |
| `ORCA_AGENT_LAUNCH_TOKEN` | 当前 Agent 启动标识。 |
| `ORCA_TAB_ID` | Orca Tab 标识。 |
| `ORCA_WORKTREE_ID` | Orca Worktree 标识。 |

坐标文件中的值优先于同名进程环境变量。WSL 无法直接访问 Windows 回环地址时，扩展会尝试调用 `/mnt/c/Windows/System32/curl.exe` 转发请求。

扩展还注册 `orca-model` 命令，供 Orca 模型选择器切换当前 OMP 模型。模型已下线或缺少 API Key 时，OMP 会在 UI 中显示错误。

### 编辑器预填

`orca-prefill.ts` 在首次 `session_start` 时读取 `ORCA_OMP_PREFILL`，写入编辑器后立即删除该环境变量，避免同一进程中的后续会话重复使用旧内容。以下情况不会执行预填：

- 不在 Orca Pane 中运行；
- 无 UI；
- `ORCA_OMP_PREFILL` 为空；
- 当前运行时不支持 `ui.setEditorText()`。

### 标题栏状态

`orca-titlebar-spinner.ts` 仅在存在 `ORCA_PANE_KEY` 时启用：

- Agent 工作或执行空闲压缩时，标题前显示 Braille 动画；
- Agent 稳定、会话关闭或维护任务结束后恢复普通标题；
- 同一 Pane 重新加载扩展时，新实例会清理旧实例的定时器。

源码保留了 `!` 等待输入标记的状态和绘制逻辑，但当前版本没有注册启用该标记的事件处理器，因此实际可见行为只有运行/压缩动画与普通标题恢复。

终端或终端复用器必须允许进程修改标题栏，否则该扩展不会产生可见效果。

## 数据与安全

- Orca 状态仅发送到 `127.0.0.1`，并使用 Hook Token 校验。
- 状态负载可能包含用户提示、Assistant 最终文本、工具名和工具输入。
- 工具输入在发送前会复制并限制深度、节点数和字符数；循环对象、访问器、异常原型及凭据路径引用会被替换为 `{ "redacted": true }`。
- 已识别的敏感路径包括 `.ssh`、`.ssh-mcp`、`.mcp-secrets.env` 和 `.omp-backups-archive/omp-bak-keyfile`。
- LiteLLM 扩展使用占位 API Key，安全边界取决于本机 LiteLLM 服务。服务应保持仅监听可信接口，避免把未鉴权的图片生成端点暴露到公网。

## 故障排查

### 图片模型未出现

1. 确认文件名为 `litellm-images.ts`，且位于当前配置目录的 `extensions` 子目录。
2. 使用显式加载命令检查扩展本身：

   ```bash
   omp models litellm-images --kind image --no-extensions -e ./litellm-images.ts
   ```

3. 新开 OMP 进程，避免继续使用修改前已加载的扩展实例。

### 图片生成请求失败

1. 确认 LiteLLM 正在监听 `127.0.0.1:4000`。
2. 确认服务提供 `/v1` 下的 OpenAI Images 兼容接口。
3. 确认 LiteLLM 中存在与扩展一致的模型名。

### Orca 中没有状态更新

1. 确认 OMP 由 Orca 启动，且存在 `ORCA_PANE_KEY`。
2. 检查 `ORCA_AGENT_HOOK_ENDPOINT` 指向的文件是否存在且可读。
3. 检查 Hook 端口和 Token 是否有效。
4. WSL 环境中确认 Windows `curl.exe` 路径可用。
5. 若 stderr 出现 `[orca-pi-status]` 警告，优先修复坐标文件格式或本地 Hook 连通性。

### 标题栏没有动画

1. 确认存在 `ORCA_PANE_KEY`。
2. 确认终端允许应用修改窗口标题。
3. 新开 OMP 进程，排除旧扩展实例或终端状态残留。
