// *** 加在檔案最上方 ***
console.log('--- [API LOG] app.js execution started ---');
require('dotenv').config(); // ✅ 加載 .env 文件
console.log('--- [API LOG] dotenv configured ---');
console.log('--- [API LOG] app.js execution started ---');

// 捕捉未處理的 Promise 拒絕
process.on('unhandledRejection', (reason, promise) => {
  console.error('--- [API LOG] Unhandled Rejection at:', promise, 'reason:', reason);
  // 應用程式因未處理的 Promise 拒絕而崩潰可能不會觸發 exit 事件
  // 在這裡退出可以確保 Zeabur 知道出錯了
  process.exit(1);
});

// 捕捉未捕獲的同步異常
process.on('uncaughtException', (err, origin) => {
  console.error(`--- [API LOG] Caught exception: ${err}\n` + `Exception origin: ${origin}`);
  console.error(err.stack); // 打印完整的錯誤堆疊
  process.exit(1); // 強制退出，以便 Zeabur 知道發生了嚴重錯誤
});


const express = require('express');
console.log('--- [API LOG] Express required ---');
const cors = require('cors');
console.log('--- [API LOG] CORS required ---');
const newDivinationRoutes = require('./newDivinationController'); // ✅ 新的路由
const imageRoutes = require('./imageController'); // ✅ 圖像生成路由
const divinationRoutes = require('./divinationController');
console.log('--- [API LOG] Routes required ---');


const app = express();
const PORT = process.env.PORT || 3000;
console.log(`--- [API LOG] Attempting to run on PORT: ${PORT} ---`);


const corsOptions = {
  origin: true, // ✅ 會自動設定為 request 的 origin
  credentials: true
};

app.use(cors(corsOptions));
console.log('--- [API LOG] CORS middleware enabled ---');
app.use(express.json({ limit: '10mb' })); // ✅ 增加 JSON body 大小限制 (以防 base64 圖片)
console.log('--- [API LOG] JSON middleware enabled ---');


// 在掛載路由前先加一個簡單的日誌中間件
app.use((req, res, next) => {
  console.log(`--- [API LOG] Request received: ${req.method} ${req.path} ---`);
  next();
});

// 掛載新的路由
app.use('/api/divination', newDivinationRoutes); // ✅ 使用新的占卜路由
app.use('/api/image', imageRoutes); // ✅ 掛載圖像生成路由
console.log('--- [API LOG] New divination and image routes mounted ---');


app.get('/', (req, res) => {
  console.log('--- [API LOG] Root path / requested ---');
  res.send('API 啟動成功 - v3'); // 加個版本號，確認是新代碼
});

// *** 修改 app.listen 部分，增加錯誤處理 ***
const server = app.listen(PORT, () => {
  console.log(`--- [API LOG] Server is successfully listening on port ${PORT} ---`);
});

// *** 非常重要：監聽 'error' 事件 ***
server.on('error', (error) => {
  console.error('--- [API LOG] Server failed to start listening:', error);
  // 如果是端口已被佔用或其他監聽錯誤
  if (error.syscall !== 'listen') {
    throw error; // 抛出非監聽相關的錯誤
  }

  // 根據錯誤碼提供更具體的日誌
  switch (error.code) {
    case 'EACCES':
      console.error(`--- [API LOG] Port ${PORT} requires elevated privileges ---`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`--- [API LOG] Port ${PORT} is already in use ---`);
      process.exit(1);
      break;
    default:
      console.error('--- [API LOG] An unknown error occurred during server listen:', error);
      throw error; // 抛出未知錯誤
  }
});

console.log('--- [API LOG] app.js execution finished setting up listen ---');