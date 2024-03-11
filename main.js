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
let keepAliveId;

wss.on("connection", function (ws) {
    ws.binaryType = 'nodebuffer'; // Đảm bảo nhận binary data dưới dạng Buffer

    ws.on("message", function (data) {
        if (data instanceof Buffer) {
            // Broadcast dữ liệu binary đến tất cả clients
            broadcastBinaryData(data);
        } else {
            // Xử lý dữ liệu text
            const userID = generateUniqueID(); // Đảm bảo bạn tạo ID người dùng ở đâu đó phù hợp
            handleMessage(ws, data, userID);
        }
    });
});


wss.on("close", () => {
    clearInterval(keepAliveId);
});

function generateUniqueID() {
    return Math.random().toString(36).substr(2, 9);
}

function handleMessage(ws, data, userID) {
    try {
        const messageData = JSON.parse(data.toString());
        if (messageData.command === 'join_chat') {
            usersInChat.set(userID, { username: messageData.sender, ws: ws });
            updateAllClientsWithUserList();
        }
        broadcast(ws, JSON.stringify(messageData), false);
    } catch (e) {
        console.error('Error:', e);
    }
}

function broadcastBinaryData(binaryData) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(binaryData); // Gửi dữ liệu binary tới mỗi client
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
            client.send(message);
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
