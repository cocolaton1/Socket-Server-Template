const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const app = express();

app.use(express.static("public"));

const serverPort = process.env.PORT || 3000;
const server = http.createServer(app);

const wss = process.env.NODE_ENV === "production"
            ? new WebSocket.Server({ server })
            : new WebSocket.Server({ port: 5001 });

server.listen(serverPort);
console.log(`Server started on port ${serverPort} in stage ${process.env.NODE_ENV}`);

const connectedUsers = new Map();
let keepAliveId;

wss.on("connection", function (ws, req) {
  const userID = generateUniqueID();
  const userIPAddress = req.socket.remoteAddress;
  connectedUsers.set(userID, { ip: userIPAddress, ws: ws });

  updateAllClientsWithUserList();

  ws.on("message", (data) => {
    try {
      const messageString = data.toString();
      const messageData = JSON.parse(messageString);
      console.log('Received JSON data:', messageData);
      broadcast(ws, JSON.stringify(messageData), false);
    } catch (e) {
      console.log('Received string data:', data.toString());
      broadcast(ws, data.toString(), false);
    }
  });

  ws.on("close", () => {
    connectedUsers.delete(userID);
    updateAllClientsWithUserList();
  });

  if (wss.clients.size === 1) {
    keepServerAlive();
  }
});

wss.on("close", () => {
  clearInterval(keepAliveId);
});

function generateUniqueID() {
  return Math.random().toString(36).substr(2, 9);
}

function updateAllClientsWithUserList() {
  const userList = Array.from(connectedUsers.values()).map(user => user.ip);
  broadcast(null, JSON.stringify({ command: 'update_user_list', users: userList }), true);
}

function broadcast(senderWs, message, includeSelf) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && (includeSelf || client !== senderWs)) {
      client.send(message);
    }
  });
}

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
