const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

let clients = {}; // Store active WebSocket connections
let onlineUsers = new Set(); // Track currently online users

const userFilePath = path.join(__dirname, "data", "userrequest.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// Load users from JSON file (with error handling)
function loadUsers() {
    if (fs.existsSync(userFilePath)) {
        try {
            const users = JSON.parse(fs.readFileSync(userFilePath, "utf8"));
            if (Array.isArray(users)) {
                onlineUsers = new Set(users);
            }
        } catch (error) {
            console.error("Error loading user data:", error);
            onlineUsers = new Set();
        }
    }
}

// Save users to JSON file safely
function saveUsers() {
    try {
        fs.writeFileSync(userFilePath, JSON.stringify([...onlineUsers], null, 2));
    } catch (error) {
        console.error("Error saving user data:", error);
    }
}

// API to save a new username
app.post("/save-username", (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== "string" || !username.trim()) {
        return res.status(400).json({ error: "Valid username is required" });
    }

    if (!onlineUsers.has(username.trim())) {
        onlineUsers.add(username.trim());
        saveUsers();
    }

    res.json({ message: "Username saved successfully" });
});

// API to fetch users from userrequest.json
app.get("/get-users", (req, res) => {
    try {
        if (!fs.existsSync(userFilePath)) {
            return res.json({ users: [] }); // Return empty array if file doesn't exist
        }

        const users = JSON.parse(fs.readFileSync(userFilePath, "utf8"));
        res.json({ users: Array.isArray(users) ? users : [] });
    } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).json({ error: "Failed to retrieve users." });
    }
});

// API to get recently joined users
app.get("/recently-joined", (req, res) => {
    res.json([...onlineUsers]);
});

// Serve index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Start Express server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket available at ${
        process.env.PORT ? `wss://walkie-talkie-3i76.onrender.com/ws` : `ws://localhost:${PORT}/ws`
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

// WebSocket Handling
wss.on("connection", (ws) => {
    let username = null;

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);

            // Handle user joining
            if (data.type === "join") {
                username = data.username.trim();

                if (!username) {
                    ws.send(JSON.stringify({ type: "error", message: "Invalid username." }));
                    ws.close();
                    return;
                }

                if (clients[username]) {
                    ws.send(JSON.stringify({ type: "error", message: "Username already taken." }));
                    ws.close();
                    return;
                }

                clients[username] = ws;
                onlineUsers.add(username);
                saveUsers();

                console.log(`${username} joined`);

                // Notify all users about the new user
                broadcast({ type: "user_joined", username });

                // Send the updated user list to all
                const userList = [...onlineUsers];
                broadcast({ type: "user_list", users: userList });
                ws.send(JSON.stringify({ type: "user_list", users: userList }));
            }

            // Handle audio message (with recording status)
            else if (data.type === "audio" && username) {
                console.log(`Audio received from ${username}`);

                if (!data.audio) {
                    console.warn("Empty audio data received.");
                    return;
                }

                // Notify clients that this user is speaking
                broadcast({ type: "recording", username, status: true });

                // Send the audio to all clients except sender
                broadcast({ type: "audio", audio: data.audio, username }, username);

                // After a short delay, reset the user's status
                setTimeout(() => {
                    broadcast({ type: "recording", username, status: false });
                }, 1000);
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
            onlineUsers.delete(username);
            saveUsers();

            console.log(`${username} disconnected`);

            // Notify others that the user left
            broadcast({ type: "user_left", username });

            // Send updated user list to all clients
            broadcast({ type: "user_list", users: [...onlineUsers] });
        }
    });

    ws.on("error", (error) => {
        console.error(`WebSocket error for ${username}:`, error);
    });
});

// Load users on startup
loadUsers();
