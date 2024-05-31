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

server.listen(PORT);

const usersInChat = new Map();
const pictureReceivers = new Map();
let keepAliveId;

wss.on("connection", function (ws) {
    const userID = generateUniqueID();

    ws.on("message", data => {
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
    clearInterval(keepAliveId);
    keepAliveId = null;
});

function generateUniqueID() {
    return Math.random().toString(36).substr(2, 9);
}

function handleMessage(ws, data, userID) {
    try {
        const messageData = JSON.parse(data);
        if (messageData.command === 'Picture Receiver') {
            pictureReceivers.set(userID, ws);
        } else if (messageData.type === 'screenshot' && messageData.data.startsWith('data:image/png;base64')) {
            broadcastToPictureReceivers(messageData.data);
        } else if (messageData.action === 'screenshot_result') {
            broadcastToPictureReceivers(messageData.data);
        } else {
            broadcastToAllExceptPictureReceivers(ws, JSON.stringify(messageData), true);
        }
    } catch (e) {
        console.error('Error parsing data:', e);
    }
}

function broadcastToPictureReceivers(data) {
    const chunkSize = 16384; // 16 KB
    const dataSize = data.length;
    const totalChunks = Math.ceil(dataSize / chunkSize);

    pictureReceivers.forEach((ws, userId) => {
        if (ws.readyState === WebSocket.OPEN) {
            const promises = [];
            for (let i = 0; i < totalChunks; i++) {
                const chunkData = data.slice(i * chunkSize, (i + 1) * chunkSize);
                const chunkMessage = JSON.stringify({
                    type: 'screenshot_chunk',
                    chunk: i,
                    totalChunks: totalChunks,
                    data: chunkData
                });
                promises.push(
                    new Promise((resolve, reject) => {
                        ws.send(chunkMessage, error => {
                            if (error) {
                                console.error("Error sending message to receiver:", error);
                                reject(error);
                            } else {
                                resolve();
                            }
                        });
                    })
                );
            }
            Promise.all(promises).then(() => {
                console.log('All chunks sent');
            }).catch(err => {
                console.error('Error sending chunks:', err);
            });
        }
    });
}

function broadcastToAllExceptPictureReceivers(senderWs, message, includeSelf) {
    wss.clients.forEach(client => {
        if (!pictureReceivers.has(client) && client.readyState === WebSocket.OPEN && (includeSelf || client !== senderWs)) {
            client.send(message);
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
                client.ping();
            }
        });
    }, 30000);
}
