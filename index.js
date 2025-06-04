const express = require("express");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args)); // 用于支持 ES Module 形式的 node-fetch

const app = express();
const port = process.env.PORT || 3001;

// OpenRouter API 地址
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1";

app.use(express.json()); // 解析 JSON 请求体

// 根路径的简单响应，用于测试服务是否运行
app.get("/", (req, res) => {
  res.send("OpenRouter to OpenAI Proxy is running!");
});

// 代理 OpenRouter 的 chat completions 接口
// 目标是模拟 OpenAI 的 /v1/chat/completions 接口
app.post("/v1/chat/completions", async (req, res) => {
  const openRouterApiKey = req.headers.authorization; // 从请求头中获取 OpenRouter API Key

  if (!openRouterApiKey) {
    return res.status(401).json({
      error: "Authorization header with OpenRouter API Key is required.",
    });
  }

  try {
    const requestBody = req.body;

    // 准备向 OpenRouter 发送的请求
    const openRouterResponse = await fetch(
      `${OPENROUTER_API_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: openRouterApiKey,
          "Content-Type": "application/json",
          // OpenRouter 可能需要的一些特定头部，可以根据需要添加
          // 'HTTP-Referer': 'YOUR_SITE_URL', // 可选，你的网站 URL
          // 'X-Title': 'YOUR_SITE_NAME', // 可选，你的应用名称
        },
        body: JSON.stringify(requestBody),
      }
    );

    // 处理流式响应
    if (requestBody.stream) {
      res.status(400).json({ error: "Stream is not supported." });
      res.end();
    } else {
      // 处理非流式响应
      const responseData = await openRouterResponse.json();

      // 转换 reasoning 字段
      if (responseData.choices && responseData.choices.length > 0) {
        responseData.choices.forEach((choice) => {
          if (choice.message && choice.message.hasOwnProperty("reasoning")) {
            if (choice.message.reasoning) {
              choice.message.content = "<think>" + choice.message.reasoning + "</think>" + choice.message.content;
            }
            delete choice.message.reasoning;
          }
        });
      }

      res.status(openRouterResponse.status).json(responseData);
    }
  } catch (error) {
    console.error("Error proxying request to OpenRouter:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to proxy request to OpenRouter." });
    } else {
      // 如果头部已发送 (例如在流式传输中途出错)，则只能结束响应
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`OpenRouter Proxy server listening at http://localhost:${port}`);
});

// 添加启动脚本到 package.json
// "scripts": {
//   "start": "node index.js",
//   "test": "echo \"Error: no test specified\" && exit 1"
// },
