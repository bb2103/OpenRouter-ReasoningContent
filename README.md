# OpenRouter to OpenAI-Compatible API Proxy

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个非常简单的 Node.js Express 代理服务，用于将 [OpenRouter](https://openrouter.ai/) API 转换为 OpenAI API 兼容格式，特别处理 `reasoning` 字段到 `reasoning_content` 字段的转换，以适配如 [Dify](https://dify.ai/) 等上层应用。

## 核心功能

- **OpenAI API 兼容**：提供与 OpenAI `/v1/chat/completions` 接口兼容的端点。
- **`reasoning` 字段转换**：自动将 OpenRouter 响应中的 `reasoning` 字段（包括流式响应的每个块）转换为上层应用期望的 `reasoning_content` 字段。
- **流式响应支持**：完全支持 OpenRouter 的流式响应，并实时转换字段。
- **API Key 转发**：安全地从客户端请求的 `Authorization` 头部获取 OpenRouter API Key 并转发给 OpenRouter。

## 为什么需要这个代理？

OpenRouter API 在其响应（包括流式响应的每个消息块）中，使用 `reasoning` 字段来传递模型的中间思考步骤。然而，一些上层应用（例如 Dify）期望通过一个名为 `reasoning_content` 的字段来获取并展示这些思考过程。此代理服务解决了这一不兼容问题。

## 安装与运行

### 前提条件

- [Node.js](https://nodejs.org/) (建议使用 LTS 版本，例如 v18.x 或更高版本)
- [npm](https://www.npmjs.com/) (通常随 Node.js 一起安装)

### 步骤

1.  **克隆仓库** (或者如果您直接下载了代码，请解压):
    ```bash
    git clone https://your-repository-url/openrouter-proxy.git
    cd openrouter-proxy
    ```

2.  **安装依赖**:
    ```bash
    npm install
    ```

3.  **启动服务**:
    ```bash
    npm start
    ```
    默认情况下，服务将在 `http://localhost:3000` 上运行。您可以通过设置 `PORT` 环境变量来更改端口，例如：
    ```bash
    PORT=8080 npm start
    ```

## 使用方法

启动代理服务后，您可以将原本直接请求 OpenAI API `https://api.openai.com/v1/chat/completions` 的客户端配置为指向本代理服务的地址，例如 `http://localhost:3000/v1/chat/completions`。

**关键请求头部**:

-   `Authorization`: 必须包含您的 OpenRouter API Key (例如: `Bearer YOUR_OPENROUTER_API_KEY`)。本服务会将此 Key 用于向 OpenRouter 发出请求。
-   `Content-Type`: 应为 `application/json`。

### 示例 (使用 cURL)

**非流式请求**:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-pro",
    "messages": [
      {"role": "user", "content": "你好，请介绍一下你自己。"}
    ]
  }'
```

**流式请求**:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "model": "google/gemini-pro",
    "messages": [
      {"role": "user", "content": "写一个关于太空旅行的小故事。"}
    ],
    "stream": true
  }'
```

### Dify 配置

在 Dify 或类似平台的模型配置中：

1.  选择一个支持 OpenAI API 兼容的提供商。
2.  **API Endpoint / 服务器 URL**: 设置为您的代理服务地址，例如 `http://<your-proxy-server-ip-or-domain>:3000/v1` (注意，这里通常只需要基础 URL，路径 `/chat/completions` 会由 Dify 自动附加)。
3.  **API Key**: 填入您的 OpenRouter API Key。
4.  选择您想通过 OpenRouter 使用的模型。

然后，Dify 在请求时，就会通过此代理，并且 `reasoning` 字段会被正确转换为 `reasoning_content`。

## API 端点

### `POST /v1/chat/completions`

-   **描述**: 代理 OpenRouter 的 `/chat/completions` 接口，并转换 `reasoning` 字段。
-   **请求体**: 与 OpenAI `chat/completions` API 的请求体相同。您需要指定 OpenRouter 支持的 `model`。
-   **响应体**: 与 OpenAI `chat/completions` API 的响应体兼容，其中 `reasoning` 字段已转换为 `reasoning_content`。支持流式和非流式响应。

## 技术栈

-   Node.js
-   Express.js
-   node-fetch

## 贡献

欢迎提交 Pull Requests 或创建 Issues 来改进此项目！

## 许可证

本项目使用 [MIT 许可证](./LICENSE)。
