# 靈石法相 - 後端 API (Stone API Backend)

[![Node.js CI](https://github.com/BOHARRY/stoneAPI/actions/workflows/node.js.yml/badge.svg)](https://github.com/BOHARRY/stoneAPI/actions/workflows/node.js.yml)

## 專案說明

此專案是「靈石法相」應用程式的後端 API 服務。主要負責處理前端的請求，與外部 AI 服務 (OpenAI, Stability AI) 互動，生成具有連續故事性的請示三問內容、圖像、以及最終的綜合分析報告。

## 主要功能

*   接收使用者初始心聲，啟動請示流程。
*   根據使用者回應、先前故事及抽牌結果，動態生成故事續篇、引導性問題及選項。
*   代理圖像生成請求，將提示詞發送給 Stability AI 並返回圖像數據。
*   整合完整互動歷程，生成最終的 AI 分析報告。
*   安全地管理外部 API 金鑰。

## 技術棧

*   **後端框架:** Node.js, Express.js
*   **資料處理:** JSON
*   **外部服務:**
    *   OpenAI API (GPT-4o 或其他模型，用於文本生成)
    *   Stability AI API (Stable Diffusion 模型，用於圖像生成)
*   **工具:**
    *   `dotenv`: 管理本地環境變數
    *   `cors`: 處理跨來源資源共用
    *   `uuid`: 生成唯一 ID

## 環境需求

*   Node.js (建議使用 LTS 版本)
*   npm 或 yarn

## 本地開發設定 (Getting Started Locally)

1.  **Clone 倉庫:**
    ```bash
    git clone https://github.com/BOHARRY/stoneAPI.git
    cd stoneAPI
    ```

2.  **安裝依賴:**
    ```bash
    npm install
    # 或
    # yarn install
    ```

3.  **設定環境變數:**
    *   在專案根目錄建立一個名為 `.env` 的檔案。
    *   **!!! 非常重要 !!!** 請將 `.env` 檔案加入您的 `.gitignore` 檔案中，**絕對不要**將此檔案 commit 到 Git 倉庫！
    *   在 `.env` 檔案中加入以下內容，並填入您自己的 API 金鑰：

      ```env
      # .env - 本地開發環境變數 (請勿 commit!)

      OPENAI_API_KEY=sk-proj-你的OpenAI金鑰...
      STABILITY_API_KEY=sk-你的StabilityAI金鑰...

      # 可選：指定模型或風格
      # OPENAI_MODEL=gpt-4o
      # STABILITY_STYLE_PRESET=fantasy-art
      ```

4.  **啟動本地伺服器:**
    ```bash
    npm start
    ```
    伺服器預設會在 `http://localhost:3000` (或 `process.env.PORT` 指定的端口) 啟動。您可以在終端機看到啟動日誌。

## 部署 (Deployment)

此專案目前部署於 [Render.com](https://render.com/)。

**重要:** 在 Render 上部署時，**請勿**上傳 `.env` 檔案。您**必須**在 Render 服務的 **Environment** 設定頁面中，將 `OPENAI_API_KEY` 和 `STABILITY_API_KEY` (以及其他需要的環境變數) 設定為 **Environment Variables**。Render 會在部署時將這些變數注入到您的應用程式環境中。修改環境變數後，通常需要手動觸發一次重新部署 (Manual Deploy)。

部署的公開 URL 為：`https://stoneapi.onrender.com`

## API 端點文件

**基礎 URL:** `https://stoneapi.onrender.com`

**通用請求標頭:**

*   `Content-Type: application/json` (適用於所有 POST 請求)

**通用回應格式:**

*   **成功:** HTTP `200 OK`, JSON Body: `{ "success": true, ...其他數據 }`
*   **失敗:** HTTP `4xx` 或 `5xx`, JSON Body: `{ "success": false, "error": "錯誤訊息" }`

---

### 1. 啟動請示三問互動

*   **端點:** `POST /api/divination/start`
*   **目的:** 開始一次新的請示互動。
*   **請求 Body:**
    ```json
    {
      "userInput": "使用者初始心聲 (String, Required)"
    }
    ```
*   **成功回應 Body:**
    ```json
    {
      "success": true,
      "interactionId": "唯一互動 ID (String)",
      "storySegment": "第一段故事 (String)",
      "guidingQuestion": "第一個問題 (String)",
      "imagePrompt": "英文圖像提示詞 (String)",
      "options": [ "選項1", "選項2", "選項3" ] // (Array<String>)
    }
    ```
*   **說明:** 這是流程的第一步。前端需儲存 `interactionId` 並使用 `imagePrompt` 請求圖像。

---

### 2. 請求圖像生成

*   **端點:** `POST /api/image/generate`
*   **目的:** 根據提示詞生成圖像。
*   **請求 Body:**
    ```json
    {
      "prompt": "英文圖像提示詞 (String, Required)",
      "interactionId": "對應的互動 ID (String, Optional)"
    }
    ```
*   **成功回應 Body:**
    ```json
    {
      "success": true,
      "imageUrl": "data:image/webp;base64,..." // Base64 Data URI (String)
    }
    ```
*   **說明:** 在收到 `/start` 或 `/continue` 的 `imagePrompt` 後呼叫。`imageUrl` 可直接用於 `<img>` 標籤。

---

### 3. 繼續請示三問互動

*   **端點:** `POST /api/divination/continue`
*   **目的:** 提交使用者回應和抽牌結果，獲取下一幕內容。
*   **請求 Body:**
    ```json
    {
      "interactionId": "當前互動 ID (String, Required)",
      "round": 1, // 或 2 (Number, Required), 代表回應第幾輪
      "userResponse": "使用者回應文字 (String, Required)",
      "previousStorySegment": "上一輪故事 (String, Required)",
      "previousGuidingQuestion": "上一輪問題 (String, Required)",
      "drawnCard": { // 上一輪抽到的卡牌 (Object, Required)
        "id": "卡牌ID",
        "name": "卡牌名",
        "image": "圖片路徑"
      }
    }
    ```
*   **成功回應 Body:**
    ```json
    {
      "success": true,
      "interactionId": "同請求 ID (String)",
      "aiReply": "AI 回應短語 (String | null)",
      "storySegment": "下一段故事 (String)",
      "guidingQuestion": "下一個問題 (String)",
      "imagePrompt": "下一個圖像提示詞 (String)",
      "options": [ "新選項1", "新選項2", "新選項3" ] // (Array<String>)
    }
    ```
*   **說明:** 用於生成第二、三幕。前端需傳遞正確的上下文和 `round`。收到回應後需再次請求圖像。

---

### 4. 請求最終分析報告

*   **端點:** `POST /api/divination/analyze`
*   **目的:** 提交完整互動歷程，獲取最終分析報告。
*   **請求 Body:**
    ```json
    {
      "interactionId": "當前互動 ID (String, Required)",
      "initialUserInput": "初始心聲 (String, Required)",
      "interactions": [ // 三輪互動數據 (Array<Object>, Required)
        {
          "storySegment": "...", "guidingQuestion": "...", "imagePrompt": "...",
          "userResponse": "...", "drawnCard": { ... }
        },
        { /* 第二輪數據 */ },
        { /* 第三輪數據 */ }
      ]
    }
    ```
*   **成功回應 Body:**
    ```json
    {
      "success": true,
      "analysis": "<h4>玄機解析</h4><p>...</p>", // HTML 格式分析報告 (String)
      "sessionId": "可選會話 ID (String | null)",
      "canSave": false // 可選是否可儲存 (Boolean)
    }
    ```
*   **說明:** 流程最後一步。前端需收集所有互動資料。回傳的 `analysis` 為 HTML，可直接渲染。

---

## 錯誤處理

API 發生錯誤時，會返回非 200 的 HTTP 狀態碼，並在回應 Body 中包含 `{ "success": false, "error": "錯誤描述" }`。前端應根據 `success` 欄位判斷請求是否成功，並向使用者顯示適當的提示訊息。詳細錯誤原因可在 Render 服務的 Logs 中查看。
