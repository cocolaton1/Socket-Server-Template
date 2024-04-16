const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const WSS_PORT = process.env.WSS_PORT || 5001;
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
const specialUsers = new Map(); // New collection for "Binary Connect" users
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
        if (messageData.command === 'join_chat') {
            usersInChat.set(userID, { username: messageData.sender, ws: ws });
            updateAllClientsWithUserList();
        } else if (messageData.command === 'Binary Connect') { // Checking for special message
            specialUsers.set(userID, { username: messageData.sender, ws: ws }); // Add to special users array
        }
        broadcast(ws, JSON.stringify(messageData), false);
    } catch (e) {
        console.error('Error:', e);
    }
}

function handleDisconnect(userID) {
    usersInChat.delete(userID);
    specialUsers.delete(userID); // Also remove from special users if present
    updateAllClientsWithUserList();
}

function updateAllClientsWithUserList() {
    const userList = Array.from(usersInChat.values()).map(user => user.username);
    const specialList = Array.from(specialUsers.values()).map(user => user.username); // Optionally, update clients with special users list
    broadcast(null, JSON.stringify({ command: 'update_user_list', users: userList, specialUsers: specialList }), true);
}

function broadcast(senderWs, message, includeSelf) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && (includeSelf || client !== senderWs)) {
            client.send(message);
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
