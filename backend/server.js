const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080; // Use dynamic port for deployment

let clients = {}; // Store WebSocket connections by username
let onlineUsers = []; // Array to track online users
const userFilePath = path.join(__dirname, "data", "userrequest.json"); // Path to user request JSON file

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend"))); // Serve static files from frontend

// Load existing users from userrequest.json
function loadUsers() {
    if (fs.existsSync(userFilePath)) {
        const data = fs.readFileSync(userFilePath);
        onlineUsers = JSON.parse(data);
        onlineUsers.forEach((user) => {
            clients[user] = null; // Initialize client entries for loaded users
        });
    }
}

// Save users to userrequest.json
function saveUsers() {
    fs.writeFileSync(userFilePath, JSON.stringify(onlineUsers, null, 2));
}

// Endpoint to save username
app.post("/save-username", (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: "Username is required" });
    }

    if (!onlineUsers.includes(username)) {
        onlineUsers.push(username);
        saveUsers();
    }

    res.json({ message: "Username saved successfully" });
});

// Endpoint to get the list of recently joined users
app.get("/recently-joined", (req, res) => {
    res.json(onlineUsers);
});

// Serve the index.html file for the root URL
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Start the Express server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(
        `WebSocket server running on ${
            process.env.PORT ? `wss://walkie-talkie-3i76.onrender.com` : `ws://localhost:${PORT}`
        }`
    );
});

// Attach WebSocket to the existing Express server
const wss = new WebSocket.Server({ server, path: "/ws" });

// Broadcast function to send messages to all clients except the sender
function broadcast(data, sender) {
    Object.keys(clients).forEach((user) => {
        if (clients[user]?.readyState === WebSocket.OPEN && user !== sender) {
            clients[user].send(JSON.stringify(data));
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
                username = data.username; // Store username for the session

                if (clients[username]) {
                    // If username already exists, reject the connection
                    ws.send(
                        JSON.stringify({ type: "error", message: "Username already taken." })
                    );
                    ws.close();
                    return;
                }

                clients[username] = ws; // Associate username with WebSocket connection
                onlineUsers.push(username); // Add user to online users
                console.log(`${username} joined`);

                // Save the updated online users list to the JSON file
                saveUsers();

                // Notify other users that this user has joined
                broadcast({ type: "user_joined", username });
                broadcast({ type: "user_list", users: onlineUsers }); // Send updated user list

                // Send the current list of online users to the newly connected user
                ws.send(JSON.stringify({ type: "user_list", users: onlineUsers }));
            }

            // Handle audio message
            else if (data.type === "audio") {
                console.log(`Received audio from ${username}`);
                broadcast(data, username); // Broadcast audio data to all clients except the sender
            }
        } catch (error) {
            console.error("Error processing message:", error);
        }
    });

    ws.on("close", (event) => {
        if (username) {
            delete clients[username]; // Remove the user from the clients list
            onlineUsers = onlineUsers.filter((user) => user !== username); // Remove user from online users
            console.log(`${username} disconnected: ${event.reason}`);

            // Save the updated online users list to the JSON file
            saveUsers();

            // Notify other users that this user has left
            broadcast({ type: "user_left", username });
            broadcast({ type: "user_list", users: onlineUsers }); // Send updated user list
        }
    });

    ws.on("error", (error) => {
        console.error(`WebSocket error for user ${username}:`, error);
    });
});

// Load users when the server starts
loadUsers();
