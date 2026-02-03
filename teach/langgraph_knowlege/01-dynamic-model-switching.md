# 运行时动态切换模型（execution_plane + Control Plane + UI）

目标：实现类似 LangChain 官网 Ask AI 那种“下拉框切模型”，并且做到**每次请求可选不同模型**。

本仓库的现状要先讲清楚：

- 执行面不是 LangServe：我们运行的是 **LangGraph Agent Server**（`langgraph dev` / Docker compose）。证据：`execution_plane/README.md`。
- 对外（前端）是 Control Plane（FastAPI）输出 SSE（AG-UI 契约），执行面只给 Control Plane 用。
- 当前 execution_plane 的模型选择是**启动时（import 时）**定死的，不支持 per-request 切换。

---

## 1) 术语澄清：你要切的是什么？

通常“切模型”会拆成两个维度：

1) `provider`：OpenAI / DeepSeek / Zhipu(GLM via OpenAI-compatible)
2) `model`：同 provider 下的具体 model id（例如 `gpt-4o-mini`、`deepseek-chat`、`GLM-4.6`）

安全边界：

- 建议 UI 只能选“白名单里的 provider+model”，不要让用户传任意字符串直接拼到 SDK 里。
- API Key / base_url 必须由服务端环境变量管理，不要从前端透传（否则等于把密钥治理交给用户输入）。

---

## 2) 本仓库当前模型选择发生在哪里？（为什么现在不能动态切）

### 2.1 execution_plane 的“默认模型工厂”

文件：`execution_plane/src/ep/shared/llm/factory.py`

现状：

- `get_default_llm()` 通过环境变量选择 provider：`EP_LLM_PROVIDER=zhipu|deepseek|openai`
- 各 provider 的默认模型 id 来自：`ZHIPU_MODEL` / `DEEPSEEK_MODEL` / `OPENAI_MODEL`

这套机制能做到：

- “部署级”切模型（改 env，重启服务）

但做不到：

- “请求级”切模型（同一个 deployment 上，不同 run 选择不同 model）

### 2.2 SQL agent 把 LLM 定死在模块全局变量

文件：`execution_plane/src/ep/agents/sql_agent/graph.py`

关键点：

- `_llm = get_default_llm()` 在 import 时执行
- `graph = create_agent(model=_llm, ...)` 把 model 绑定进 graph

因此：

- 即便 Control Plane / UI 传了“我想用另一个模型”，graph 也没有地方读取这个选择。

### 2.3 Control Plane 目前也没有把“选择”转发给执行面

文件：`control_plane/gateway/routers/runs.py`

关键点：

- 调用 `stream_run(..., context=None, ...)`
- 注释明确写了 Phase-1 不转发 context

所以 end-to-end 的链路现在是断的：

- 前端 -> Control Plane：就算你传了 model selection（放 `context` 或 `forwarded_props`），也会被丢掉
- Control Plane -> execution_plane：也没传到 LangGraph run 的 runtime context

---

## 3) 动态切模型的“正确形态”（在 LangGraph 体系里）

一句话：**把模型选择变成 runtime 参数**，并让“调用 LLM 的节点”每次执行都读取这个参数。

LangGraph 里常见两条路：

### 路线 A：用 LangGraph Runtime Context 做选择（推荐，跨 provider 最稳）

思路：

- execution_plane 维护一个 `MODELS` registry（provider+model -> model instance）
- 在 graph node 内部根据 `runtime.context`（或 `config.configurable`）取出本次要用的模型

优点：

- 能跨 provider（OpenAI/DeepSeek/Zhipu）做统一选择
- 选择逻辑可加白名单/成本分层/灰度

落地要点（面向本仓库）：

1) Control Plane 把 UI 选择写进 LangGraph SDK 的 `context` 参数（注意 SDK 要求 `context` 是 object）
2) execution_plane 在“调用 LLM 的节点”读取 `runtime.context` 并选择模型

注意：

- 如果你继续用 `langchain.agents.create_agent(model=_llm, ...)` 这种“提前绑定 model”的写法，路线上会卡住。
- 你需要让“最终执行 LLM 的地方”可感知 runtime context。

### 路线 B：用 LangChain Configurable Model（适合同一抽象下切 model/provider）

LangChain 文档里提供了 `init_chat_model(..., configurable_fields=...)`，然后在 `invoke(..., config={"configurable": {...}})` 时切换。

优点：

- 调用侧 API 很干净（每次 invoke 传 config）

限制：

- 你需要确认你使用的 provider 是否都能通过 `init_chat_model` 的统一入口覆盖；否则还是得回到“registry + 手工选择”。

官方文档（供查证）：

- LangChain configurable models：`https://docs.langchain.com/oss/python/langchain/models`

---

## 4) 建议的工程拆分（避免把逻辑散落在各 agent graph 里）

结合本仓库结构，建议把“可切模型”的能力集中在共享层：

- 新增/演进位置：`execution_plane/src/ep/shared/llm/`

推荐抽象：

1) `registry.py`
   - 定义允许的 provider、每个 provider 允许的 model 列表
   - 从 env 或代码常量加载（Phase-1 建议先 hardcode 白名单，后续再做配置化）
2) `selector.py`
   - `select_model(context: dict) -> BaseChatModel`
   - 做兜底：不传就走 `get_default_llm()`

然后各 agent 的 graph 在需要调用 LLM 的节点使用 selector，而不是 module-level `_llm = ...`。

---

## 5) “支持哪些模型”应该从哪里来？

你提到“切换不同模型看 execution_plane 中支持什么模型”，在本仓库里可以拆两层：

### 5.1 provider 能力（代码依赖层）

文件：`execution_plane/pyproject.toml`

目前依赖里已经明确包含：

- `langchain-openai`
- `langchain-deepseek`

Zhipu/GLM 是通过 `ChatOpenAI(base_url=...)` 的 OpenAI-compatible 方式接入（见 `execution_plane/src/ep/shared/llm/factory.py`）。

### 5.2 model 白名单（治理层，建议你们明确写出来）

目前 `.env.example` 只给了默认值：

- `ZHIPU_MODEL=GLM-4.6`
- `DEEPSEEK_MODEL=deepseek-chat`
- `OPENAI_MODEL=gpt-4o-mini`

如果要做 UI 下拉框：

- 你需要一个“权威来源”告诉前端有哪些可选项

工程上最稳的是：Control Plane 提供一个只读接口（例如 `/v1/llms`），返回 allowlist。

allowlist 的来源可以是：

1) Control Plane 配置文件/环境变量（平台治理层决定能用哪些模型）
2) execution_plane 同步一份配置（执行面只负责按 selection 执行）

不建议：

- 运行时去探测 provider 支持的所有模型（不可控、容易导致 UI 出现不可用选项）

### 5.3 建议的“模型目录（catalog）”接口形态（给 UI 下拉框用）

推荐由 **Control Plane** 暴露一个只读接口（平台治理层做决策），例如：

- `GET /v1/llms`

返回一个稳定、可缓存的 allowlist（示例）：

```json
{
  "default": {"provider": "zhipu", "model": "GLM-4.6"},
  "providers": [
    {
      "id": "zhipu",
      "displayName": "Zhipu (OpenAI-compatible)",
      "models": [
        {"id": "GLM-4.6", "displayName": "GLM-4.6"}
      ]
    },
    {
      "id": "deepseek",
      "displayName": "DeepSeek",
      "models": [
        {"id": "deepseek-chat", "displayName": "deepseek-chat"}
      ]
    },
    {
      "id": "openai",
      "displayName": "OpenAI",
      "models": [
        {"id": "gpt-4o-mini", "displayName": "gpt-4o-mini"}
      ]
    }
  ]
}
```

实现来源建议（二选一即可，先简单后演进）：

1) Phase-1（最快）：Control Plane 读环境变量/配置文件，直接维护 allowlist（平台治理一处维护）。
2) Phase-2：Control Plane 从 DB（比如 tenant policy）读 allowlist，支持租户级配额/灰度。

注意：allowlist 里不要包含 `api_key` / `base_url` 这类敏感信息；执行面只需要 provider+model key。

---

## 6) 最小闭环（你要改哪些地方，按链路）

这里只列“闭环必改点”，不做代码实现（避免在知识库里硬塞补丁）。

1) 前端：在 run 请求里带上模型选择（建议放 `forwarded_props` 或 `context`）
   - 见 schema：`control_plane/gateway/schemas/agui.py`（`RunAgentInput.forwarded_props` / `RunAgentInput.context`）
2) Control Plane：把这个选择转成 LangGraph SDK 的 `context` object 并传给执行面
   - 见调用点：`control_plane/gateway/adapters/langgraph_adapter.py#stream_run`
   - 见当前丢弃位置：`control_plane/gateway/routers/runs.py`（`context=None`）
3) execution_plane：让 graph 的 LLM 选择发生在“每次 run 的执行期”而不是 import 时
   - 当前写死位置：`execution_plane/src/ep/agents/sql_agent/graph.py`（`_llm = get_default_llm()`）
   - 推荐方式：node 内按 runtime context 选择 model，或改用 configurable model

---

## 7) 常见坑（提前避雷）

1) 把 `model` 作为纯字符串透传但不做白名单
   - 结果：用户可以选到你不想开的模型（成本/能力/合规不可控）
2) 让前端传 `base_url` / `api_key`
   - 结果：密钥治理失控，审计与隔离做不下去
3) 仍然在模块 import 时构建 `_llm`
   - 结果：看似“支持切模型”，实际上必须重启 deployment 才生效
