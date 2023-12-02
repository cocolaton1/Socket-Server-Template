const http = require("http");
const express = require("express");
const app = express();
const WebSocket = require("ws");

app.use(express.static("public"));

const serverPort = process.env.PORT || 3000;
const server = http.createServer(app);

const wss = process.env.NODE_ENV === "production"
            ? new WebSocket.Server({ server })
            : new WebSocket.Server({ port: 5001 });

server.listen(serverPort);
console.log(`Server started on port ${serverPort} in stage ${process.env.NODE_ENV}`);

let keepAliveId;

wss.on("connection", function (ws, req) {
  console.log("Connection Opened");
  console.log("Client size: ", wss.clients.size);

  if (wss.clients.size === 1) {
    console.log("First connection. Starting keepalive");
    keepServerAlive();
  }

  ws.on("message", (data) => {
    try {
      // Chuyển đổi Buffer thành chuỗi
      const messageString = data.toString();

      // Phân tích cú pháp chuỗi thành JSON (nếu dữ liệu đến là JSON)
      const messageData = JSON.parse(messageString);
      console.log('Received JSON data:', messageData);

      // Xử lý dữ liệu JSON và broadcast (nếu cần)yhg
      broadcast(ws, JSON.stringify(messageData), false);
    } catch (e) {
      console.log('Received string data:', data.toString());
      broadcast(ws, data.toString(), false);
    }
  });

  ws.on("close", (data) => {
    console.log("Closing connection");

    if (wss.clients.size === 0) {
      console.log("Last client disconnected, stopping keepAlive interval");
      clearInterval(keepAliveId);
    }
  });
});

// Implement broadcast function
const broadcast = (ws, message, includeSelf) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && (includeSelf || client !== ws)) {
      client.send(message);
    }
  });
};

// Sends a ping message to all connected clients every 50 seconds
const keepServerAlive = () => {
  keepAliveId = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send('ping');
      }
    });
  }, 50000);
};

app.get('/', (req, res) => {
  res.send('Hello World!');
});
