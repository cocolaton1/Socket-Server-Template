const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

const wss = new WebSocket.Server({ noServer: true });
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

server.listen(PORT, () => {
    console.log(`Server started on port ${PORT} in stage ${process.env.NODE_ENV}`);
});

const usersInChat = new Map();
const specialUsers = new Map(); // Danh sách đặc biệt
let keepAliveId;

wss.on("connection", function (ws) {
    const userID = generateUniqueID();

    ws.on("message", (data) => {
        handleMessage(ws, data, userID);
    });

    ws.on("close", () => {
        handleDisconnect(userID);
        ws.removeAllListeners();
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

function handleMessage(ws, data, userID) {
    try {
        if (isBinaryData(data)) { // Kiểm tra dữ liệu nhị phân
            broadcastToSpecialUsers(ws, data); // Chỉ gửi đến những người dùng đặc biệt
        } else {
            const messageData = JSON.parse(data.toString());
            if (messageData.command === 'join_chat') {
                usersInChat.set(userID, { username: messageData.sender, ws: ws });
                updateAllClientsWithUserList();
            } else if (messageData.command === 'Binary Connect') {
                specialUsers.set(userID, { username: messageData.sender, ws: ws });
            }
            broadcast(ws, JSON.stringify(messageData), false);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

function handleDisconnect(userID) {
    usersInChat.delete(userID);
    specialUsers.delete(userID);
    updateAllClientsWithUserList();
}

function updateAllClientsWithUserList() {
    const userList = Array.from(usersInChat.values()).map(user => user.username);
    broadcast(null, JSON.stringify({ command: 'update_user_list', users: userList }), true);
}

function broadcast(senderWs, message, includeSelf) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && (includeSelf || client !== senderWs)) {
            client.send(message);
        }
    });
}

function broadcastToSpecialUsers(senderWs, message) {
    specialUsers.forEach((user) => {
        if (user.ws.readyState === WebSocket.OPEN && user.ws !== senderWs) {
            user.ws.send(message);
        }
    });
}

function isBinaryData(data) {
    return data instanceof Buffer; // Kiểm tra liệu dữ liệu có phải là dạng Buffer (binary) không
}

const keepServerAlive = () => {
    keepAliveId = setInterval(() => {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.ping();
            }
        });
    }, 30000);
};
