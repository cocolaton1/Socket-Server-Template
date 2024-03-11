const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server }); // Attach WebSocket server directly to the HTTP server

server.listen(PORT, () => {
    console.log(`Server started on port ${PORT} in stage ${process.env.NODE_ENV}`);
});

const usersInChat = new Map();

// Simplify connection event handling
wss.on("connection", (ws, request) => {
    const userID = generateUniqueID();
    usersInChat.set(userID, { ws });

    ws.on("message", (data) => {
        handleMessage(data, userID);
    });

    ws.on("close", () => {
        usersInChat.delete(userID);
        updateAllClientsWithUserList();
    });

    ws.on("pong", () => {
        ws.isAlive = true; // Use 'pong' event to mark the connection as alive
    });

    keepServerAlive();
});

// Ping connected clients to check if they are still alive
function keepServerAlive() {
    setInterval(() => {
        wss.clients.forEach((ws) => {
            if (!ws.isAlive) return ws.terminate();
            ws.isAlive = false;
            ws.ping(null, false, true);
        });
    }, 30000); // Adjusted interval to 30 seconds
}

function generateUniqueID() {
    return Math.random().toString(36).substr(2, 9);
}

function handleMessage(data, userID) {
    const messageData = JSON.parse(data.toString());
    if (messageData.command === 'join_chat') {
        const user = usersInChat.get(userID);
        user.username = messageData.sender;
        usersInChat.set(userID, user);
        updateAllClientsWithUserList();
    }
    broadcast(JSON.stringify(messageData), userID);
}

function updateAllClientsWithUserList() {
    const userList = Array.from(usersInChat.values()).map(user => user.username).filter(username => username);
    broadcast(JSON.stringify({ command: 'update_user_list', users: userList }));
}

function broadcast(message, senderUserID = null) {
    usersInChat.forEach((user, userID) => {
        if (user.ws.readyState === WebSocket.OPEN && (senderUserID !== userID || senderUserID === null)) {
            user.ws.send(message);
        }
    });
}
