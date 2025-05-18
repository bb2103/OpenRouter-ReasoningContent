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
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const decoder = new TextDecoder();
      let buffer = "";

      // 检查 openRouterResponse.body 是否存在
      if (openRouterResponse.body) {
        try {
          // 使用 for await...of 迭代 ReadableStream
          for await (const chunk of openRouterResponse.body) {
            buffer += decoder.decode(chunk, { stream: true });

            // 按行处理 SSE 事件
            let eolIndex;
            while ((eolIndex = buffer.indexOf("\n")) >= 0) {
              const line = buffer.substring(0, eolIndex).trim();
              buffer = buffer.substring(eolIndex + 1);

              if (line.startsWith("data: ")) {
                const jsonData = line.substring("data: ".length);
                if (jsonData === "[DONE]") {
                  res.write(`data: ${jsonData}\n\n`);
                } else {
                  try {
                    const parsedChunk = JSON.parse(jsonData);
                    // 转换 reasoning 字段
                    if (parsedChunk.choices && parsedChunk.choices.length > 0) {
                      parsedChunk.choices.forEach((choice) => {
                        if (
                          choice.delta &&
                          choice.delta.hasOwnProperty("reasoning")
                        ) {
                          choice.delta.reasoning_content =
                            choice.delta.reasoning;
                          delete choice.delta.reasoning;
                        }
                        if (
                          choice.message &&
                          choice.message.hasOwnProperty("reasoning")
                        ) {
                          choice.message.reasoning_content =
                            choice.message.reasoning;
                          delete choice.message.reasoning;
                        }
                      });
                    }
                    res.write(`data: ${JSON.stringify(parsedChunk)}\n\n`);
                  } catch (parseError) {
                    console.error(
                      "Error parsing JSON chunk:",
                      parseError,
                      "Original data:",
                      jsonData
                    );
                    // 如果解析失败，可以考虑直接转发原始数据或发送错误事件
                    // res.write(`${line}\n\n`);
                  }
                }
              } else if (line) {
                // 转发其他非 data 行 (例如 event: completion)
                res.write(`${line}\n\n`);
              }
            }
          }
        } catch (streamError) {
          console.error("Error reading from OpenRouter stream:", streamError);
          if (!res.headersSent) {
            res
              .status(500)
              .json({ error: "Error processing stream from OpenRouter." });
          } else {
            res.end(); // 尝试结束响应，如果头部已发送
          }
          return; // 从路由处理函数返回，防止进一步执行
        }
      } else {
        console.error(
          "OpenRouter response body is null or undefined for stream."
        );
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: "Received empty body from OpenRouter for stream." });
        } else {
          res.end();
        }
        return; // 从路由处理函数返回
      }

      // 处理可能残留在 buffer 中的数据
      if (buffer.trim().startsWith("data: ")) {
        const jsonData = buffer.trim().substring("data: ".length);
        if (jsonData === "[DONE]") {
          res.write(`data: ${jsonData}\n\n`);
        } else {
          try {
            const chunk = JSON.parse(jsonData);
            if (chunk.choices && chunk.choices.length > 0) {
              chunk.choices.forEach((choice) => {
                if (choice.delta && choice.delta.hasOwnProperty("reasoning")) {
                  choice.delta.reasoning_content = choice.delta.reasoning;
                  delete choice.delta.reasoning;
                }
                if (
                  choice.message &&
                  choice.message.hasOwnProperty("reasoning")
                ) {
                  choice.message.reasoning_content = choice.message.reasoning;
                  delete choice.message.reasoning;
                }
              });
            }
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          } catch (e) {
            console.error(
              "Error parsing JSON chunk from remaining buffer:",
              e,
              "Original data:",
              jsonData
            );
          }
        }
      }

      res.end();
    } else {
      // 处理非流式响应
      const responseData = await openRouterResponse.json();

      // 转换 reasoning 字段
      if (responseData.choices && responseData.choices.length > 0) {
        responseData.choices.forEach((choice) => {
          if (choice.message && choice.message.hasOwnProperty("reasoning")) {
            choice.message.reasoning_content = choice.message.reasoning;
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
