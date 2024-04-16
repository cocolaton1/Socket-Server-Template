const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const WSS_PORT = process.env.WSS_PORT || 5001;
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
const binaryDataUsers = new Set(); // Thêm một Set để quản lý user có khả năng nhận binary data

let keepAliveId;

wss.on("connection", function (ws) {
    const userID = generateUniqueID();

    ws.on("message", (data) => {
        handleMessage(ws, data, userID);
    });

    ws.on("close", () => {
        handleDisconnect(userID);
        ws.removeAllListeners();
        binaryDataUsers.delete(userID); // Xóa userID khi user disconnect
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
    // Kiểm tra kiểu dữ liệu nhận được
    if (typeof data === 'string') {
        if (data === 'binary') {
            binaryDataUsers.add(userID); // Thêm user vào Set khi nhận thông điệp 'binary'
            return;
        }
        try {
            const messageData = JSON.parse(data);
            if (messageData.command === 'join_chat') {
                usersInChat.set(userID, { username: messageData.sender, ws: ws });
                updateAllClientsWithUserList();
            }
            broadcast(ws, JSON.stringify(messageData), false);
        } catch (e) {
            console.error('Error:', e);
        }
    } else if (data instanceof Buffer) {
        // Xử lý dữ liệu binary ở đây
        broadcastBinary(data);
    }
}


function broadcastBinary(binaryData) {
    binaryDataUsers.forEach(userId => {
        const user = usersInChat.get(userId);
        if (user && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(binaryData);
        }
    });
}


function handleDisconnect(userID) {
    usersInChat.delete(userID);
    updateAllClientsWithUserList();
}

function updateAllClientsWithUserList() {
    const userList = Array.from(usersInChat.values()).map(user => user.username);
    broadcast(null, JSON.stringify({ command: 'update_user_list', users: userList }), true);
}

function broadcast(senderWs, message, includeSelf) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && (includeSelf || client !== senderWs)) {
            if (binaryDataUsers.has(client._ultron.id)) {
                client.send(message); // Gửi binary data nếu client có trong Set
            } else {
                client.send(message); // Gửi thông thường
            }
        }
    });
}

const keepServerAlive = () => {
    keepAliveId = setInterval(() => {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.ping();
            }
        });
    }, 30000); // Adjusted interval to 30 seconds
};
