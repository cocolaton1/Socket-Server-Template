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
    try {
        const messageData = JSON.parse(data.toString());
        if (messageData.command === 'Picture Receiver') {
            pictureReceivers.set(userID, ws); 
        if ((messageData.type === 'screenshot' && messageData.data.startsWith('data:image/jpeg;base64')) || 
            (messageData.action === 'screenshot_result')) {
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
        console.error('Error parsing data:', e);
    }
}

function broadcastToPictureReceivers(message) {
    const data = JSON.stringify(message);
    const sendPromises = Array.from(pictureReceivers.values()).map(ws => {
        return new Promise((resolve, reject) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data, error => {
                    if (error) reject(error);
                    else resolve();
                });
            } else {
                resolve(); 
            }
        });
    });

    return Promise.all(sendPromises)
        .then(() => {
            console.log("All messages sent successfully.");
        })
        .catch(error => {
            console.error("Error sending message:", error);
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
