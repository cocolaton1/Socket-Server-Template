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
    console.log(`Server started on port ${PORT}`);
});

const usersInChat = new Map();
let keepAliveId;

wss.on("connection", function (ws) {
    const userID = generateUniqueID();
    usersInChat.set(userID, { ws, wantsBinary: false });

    ws.on("message", (data) => {
        handleMessage(ws, data, userID);
    });

    ws.on("close", () => {
        handleDisconnect(userID);
    });

    if (wss.clients.size === 1) {
        keepServerAlive();
    }
});

function generateUniqueID() {
    return Math.random().toString(36).substr(2, 9);
}

function handleMessage(ws, data, userID) {
    if (data instanceof Buffer) {
        // Handle binary data
        broadcastBinary(ws, data);
    } else {
        try {
            const messageData = JSON.parse(data.toString());
            switch (messageData.command) {
                case 'join_chat':
                    usersInChat.get(userID).username = messageData.sender;
                    updateAllClientsWithUserList();
                    break;
                case 'set_binary_preference':
                    usersInChat.get(userID).wantsBinary = messageData.wantsBinary;
                    break;
                default:
                    broadcast(ws, JSON.stringify(messageData), false);
            }
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
    broadcast(null, JSON.stringify({ command: 'update_user_list', users: userList }), true);
}

function broadcast(senderWs, message, includeSelf) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && (includeSelf || client !== senderWs)) {
            client.send(message);
        }
    });
}

function broadcastBinary(senderWs, binaryData) {
    wss.clients.forEach((client) => {
        const user = usersInChat.get(client._ultron.id);
        if (user && user.wantsBinary && client.readyState === WebSocket.OPEN) {
            client.send(binaryData);
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
