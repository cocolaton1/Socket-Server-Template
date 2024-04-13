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
let keepAliveId;

wss.on("connection", function (ws) {
    const userID = generateUniqueID();
    usersInChat.set(userID, ws);

    ws.on("message", (data) => {
        if (data instanceof Buffer) {
            // Handle and broadcast binary data
            broadcastBinary(ws, data);
        } else {
            // Handle text data
            handleMessage(ws, data.toString(), userID);
        }
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

function handleMessage(ws, message, userID) {
    try {
        const messageData = JSON.parse(message);
        if (messageData.command === 'join_chat') {
            usersInChat.set(userID, { username: messageData.sender, ws: ws });
            updateAllClientsWithUserList();
        }
        broadcast(ws, JSON.stringify(messageData), false);
    } catch (e) {
        console.error('Error:', e);
    }
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
            client.send(message);
        }
    });
}

function broadcastBinary(senderWs, data) {
    // Giả định phần đầu tiên là JSON mô tả hành động, kết thúc bởi một dấu xuống dòng
    const separatorIndex = data.indexOf(10); // Tìm vị trí của dấu xuống dòng (LF - line feed)
    const actionData = data.slice(0, separatorIndex).toString(); // Lấy phần JSON
    const imageData = data.slice(separatorIndex + 1); // Lấy phần dữ liệu hình ảnh

    let action;
    try {
        action = JSON.parse(actionData); // Phân tích cú pháp JSON
    } catch (error) {
        console.error('Error parsing action data:', error);
        return;
    }

    // Kiểm tra hành động để xử lý hình ảnh hoặc broadcast nó
    console.log('Received action:', action.action); // In hành động nhận được

    // Broadcast dữ liệu hình ảnh đến các clients khác (giả sử là hình ảnh)
    wss.clients.forEach((client) => {
        if (client !== senderWs && client.readyState === WebSocket.OPEN) {
            client.send(imageData, { binary: true });
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
