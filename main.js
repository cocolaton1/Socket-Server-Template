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
let keepAliveId;

wss.on("connection", function (ws) {
    const userID = generateUniqueID();

    ws.on("message", (data, isBinary) => {
        handleMessage(ws, data, userID, isBinary);
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

function handleMessage(ws, data, userID, isBinary) {
    if (isBinary) {
        // If the message is binary, broadcast it as is
        broadcast(ws, data, false, isBinary);
    } else {
        try {
            const messageData = JSON.parse(data.toString());
            if (messageData.command === 'join_chat') {
                usersInChat.set(userID, { username: messageData.sender, ws: ws });
                updateAllClientsWithUserList();
            }
            broadcast(ws, JSON.stringify(messageData), false, false);
        } catch (e) {
            console.error('Error:', e);
        }
    }
}

function handleDisconnect(userID) {
    usersInChat.delete(userID);
    updateAllClientsWithUserList();
}

function updateAllClientsWithUserList() {
    const userList = Array.from(usersInChat.values()).map(user => user.username);
    broadcast(null, JSON.stringify({ command: 'update_user_list', users: userList }), true, false);
}

function broadcast(senderWs, message, includeSelf, isBinary) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && (includeSelf || client !== senderWs)) {
            client.send(message, { binary: isBinary });
        }
    });
}

const keepServerAlive = () => {
    keepAliveId = setInterval(() => {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.ping();
            }
        });
    }, 30000); // Adjusted interval to 30 seconds
};
