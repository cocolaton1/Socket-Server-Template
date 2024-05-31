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
    console.log(`Server is listening on port ${PORT}`);
});

const usersInChat = new Map();
const pictureReceivers = new Map(); 
let keepAliveId;

wss.on("connection", function (ws) {
    const userID = generateUniqueID();  
    ws.send(JSON.stringify({ type: 'assign_id', id: userID }));  // Gửi ID duy nhất cho client
    usersInChat.set(userID, ws);  // Lưu client vào danh sách

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

app.get('/clients', (req, res) => {
    const clients = Array.from(usersInChat.keys()).map(clientId => {
        return {
            id: clientId,
            isSpecial: pictureReceivers.has(clientId)
        };
    });
    res.json({ clients });
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
            broadcastToPictureReceivers({
                type: 'screenshot',
                action: messageData.action,
                screen: messageData.screen,
                data: messageData.data
            }, userID);
        } else if (messageData.action === 'screenshot_result') {
            broadcastToPictureReceivers({
                type: 'screenshot',
                action: messageData.action,
                screen: messageData.screen,
                data: messageData.data
            }, userID);
        } else {
            broadcastToAllExceptPictureReceivers(ws, JSON.stringify(messageData), true);
        }
    } catch (e) {
        console.error('Error parsing data:', e);
    }
}

function broadcastToPictureReceivers(message, senderID) {
    const data = JSON.stringify(message);
    let myClientWs;

    // Gửi cho bạn trước
    pictureReceivers.forEach((ws, userId) => {
        if (userId === senderID && ws.readyState === WebSocket.OPEN) {
            myClientWs = ws;
        }
    });

    if (myClientWs) {
        myClientWs.send(data, error => {
            if (error) console.error("Error sending message to yourself:", error);
        });
    }

    // Gửi cho các client còn lại
    pictureReceivers.forEach((ws, userId) => {
        if (userId !== senderID && ws.readyState === WebSocket.OPEN) {
            ws.send(data, error => {
                if (error) console.error("Error sending message to receiver:", error);
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
