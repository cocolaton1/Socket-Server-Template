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
const pictureReceivers = new Map(); // Người dùng nhận hình ảnh
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
        const messageData = JSON.parse(data.toString());
        if (messageData.command === 'Picture Receiver') {
            pictureReceivers.set(userID, ws); // Đánh dấu người dùng nhận hình ảnh
        }

        // Nếu là dữ liệu liên quan đến ảnh chụp
        if (messageData.action === 'screenshot_result') {
            // Chỉ gửi dữ liệu này đến các 'Picture Receiver'
            broadcastToPictureReceivers({
                action: messageData.action,
                screen: messageData.screen,
                data: messageData.data
            });
        } else {
            // Nếu không phải là dữ liệu ảnh chụp, broadcast đến tất cả client
            broadcastToAllExceptPictureReceivers(ws, JSON.stringify(messageData), true);
        }
    } catch (e) {
        console.error('Error parsing data:', e);
    }
}

function broadcastToPictureReceivers(message) {
    pictureReceivers.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    });
}

function broadcastToAllExceptPictureReceivers(senderWs, message, includeSelf) {
    wss.clients.forEach((client) => {
        // Kiểm tra nếu client không phải là Picture Receiver
        if (!pictureReceivers.has(client) && client.readyState === WebSocket.OPEN && (includeSelf || client !== senderWs)) {
            client.send(message);
        }
    });
}





function handleDisconnect(userID) {
    usersInChat.delete(userID);
    pictureReceivers.delete(userID);
}

function broadcastToPictureReceivers(data) {
    pictureReceivers.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'screenshot_result', data: data }));
        }
    });
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
    }, 30000);
};
