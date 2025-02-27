const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

let clients = {}; // Store WebSocket connections
let onlineUsers = []; // Track online users
const userFilePath = path.join(__dirname, "data", "userrequest.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// Load users from JSON file
function loadUsers() {
    if (fs.existsSync(userFilePath)) {
        try {
            onlineUsers = JSON.parse(fs.readFileSync(userFilePath));
            onlineUsers.forEach(user => (clients[user] = null)); // Initialize empty client sockets
        } catch (error) {
            console.error("Error loading user data:", error);
        }
    }
}

// Save users to JSON file
function saveUsers() {
    fs.writeFileSync(userFilePath, JSON.stringify(onlineUsers, null, 2));
}

// API to save a new username
app.post("/save-username", (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Username is required" });

    if (!onlineUsers.includes(username)) {
        onlineUsers.push(username);
        saveUsers();
    }

    res.json({ message: "Username saved successfully" });
});

// API to get recently joined users
app.get("/recently-joined", (req, res) => {
    res.json(onlineUsers);
});

// Serve index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Start Express server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket running at ${
        process.env.PORT ? `wss://walkie-talkie-3i76.onrender.com/ws` : `ws://localhost:${PORT}`
    }`);
});

// Attach WebSocket to the server
const wss = new WebSocket.Server({ server, path: "/ws" });

// Broadcast messages to all connected clients except the sender
function broadcast(data, sender = null) {
    Object.entries(clients).forEach(([user, client]) => {
        if (client && client.readyState === WebSocket.OPEN && user !== sender) {
            client.send(JSON.stringify(data));
        }
    });
}

wss.on("connection", (ws) => {
    let username = null;

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);

            // Handle user joining
            if (data.type === "join") {
                username = data.username.trim();
                if (!username || clients[username]) {
                    ws.send(JSON.stringify({ type: "error", message: "Username already taken." }));
                    ws.close();
                    return;
                }

                clients[username] = ws;
                onlineUsers.push(username);
                saveUsers();

                console.log(`${username} joined`);

                // Notify others about the new user
                broadcast({ type: "user_joined", username });
                broadcast({ type: "user_list", users: onlineUsers });

                // Send the updated user list to the new user
                ws.send(JSON.stringify({ type: "user_list", users: onlineUsers }));
            }

            // Handle audio message (with Recording Status)
            else if (data.type === "audio" && username) {
                console.log(`Audio received from ${username}`);

                // Notify clients that this user is speaking
                broadcast({ type: "recording", username, status: true });

                broadcast({ type: "audio", audio: data.audio, username }, username);

                // After a short delay, reset the user's status
                setTimeout(() => {
                    broadcast({ type: "recording", username, status: false });
                }, 3000); // Adjust time as needed
            }

            // Handle "ring" event
            else if (data.type === "ring" && data.to) {
                if (clients[data.to] && clients[data.to].readyState === WebSocket.OPEN) {
                    clients[data.to].send(JSON.stringify({ type: "ring", from: data.from, to: data.to }));
                    console.log(`Ring event sent from ${data.from} to ${data.to}`);
                } else {
                    console.log(`Ring event failed: ${data.to} is not online.`);
                }
            }
        } catch (error) {
            console.error("Message processing error:", error);
        }
    });

    ws.on("close", () => {
        if (username) {
            delete clients[username];
            onlineUsers = onlineUsers.filter(user => user !== username);
            saveUsers();

            console.log(`${username} disconnected`);

            // Notify others that the user left
            broadcast({ type: "user_left", username });
            broadcast({ type: "user_list", users: onlineUsers });
        }
    });

    ws.on("error", (error) => {
        console.error(`WebSocket error for ${username}:`, error);
    });
});

// Load users on startup
loadUsers();
