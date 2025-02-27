const status = document.getElementById("status");
const usernameInput = document.getElementById("username");
const connectBtn = document.getElementById("connectBtn");
const talkBtn = document.getElementById("talkBtn");
const talkContainer = document.getElementById("talk-container");
const recentlyJoinedList = document.getElementById("recentlyJoined");
const beepSound = document.getElementById("beepSound");

let ws, mediaRecorder, audioChunks = [], username = "", reconnectTimeout;

// Connect Button Click Handler
connectBtn.addEventListener("click", () => {
    username = usernameInput.value.trim();
    if (!username) {
        alert("Please enter a username");
        return;
    }
    connectToServer();
});

function connectToServer() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("Already connected to WebSocket.");
        return;
    }

    const wsUrl = window.location.hostname === "localhost"
        ? "ws://localhost:8080/ws"
        : "wss://walkie-talkie-3i76.onrender.com/ws";  

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("Connected to WebSocket");
        ws.send(JSON.stringify({ type: "join", username }));
        status.textContent = `Connected as ${username} ✅`;
        status.classList.replace("text-yellow-400", "text-green-400");
        connectBtn.style.display = "none";
        usernameInput.style.display = "none";
        talkContainer.classList.remove("hidden");
    };

    ws.onclose = (event) => {
        console.warn("WebSocket closed:", event.reason);
        status.textContent = "Disconnected ❌";
        status.classList.replace("text-green-400", "text-red-400");

        // Attempt to reconnect after 5 seconds
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectToServer, 5000);
    };

    ws.onerror = (error) => {
        console.error("WebSocket error:", error);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case "audio":
                    playAudio(data.audio);
                    break;
                case "user_joined":
                    addUserToRecentlyJoined(data.username);
                    break;
                case "user_left":
                    removeUserFromRecentlyJoined(data.username);
                    break;
                case "user_list":
                    updateRecentlyJoinedList(data.users);
                    break;
                default:
                    console.warn("Unknown message type:", data);
            }
        } catch (error) {
            console.error("Error parsing message:", error);
        }
    };
}

// Handle Talk Button (Start Recording)
talkBtn.addEventListener("mousedown", async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
            sendAudio(audioBlob);
        };

        mediaRecorder.start();
        talkBtn.textContent = "Recording... 🎤";
        talkBtn.classList.add("bg-red-500");
    } catch (error) {
        console.error("Microphone access error:", error);
        alert("Microphone access is required to use the Walkie-Talkie feature.");
    }
});

// Handle Talk Button Release (Stop Recording)
talkBtn.addEventListener("mouseup", () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        talkBtn.textContent = "🎤 Hold to Talk";
        talkBtn.classList.remove("bg-red-500");
    }
});

// Send Audio Data to WebSocket
function sendAudio(blob) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("WebSocket is not connected. Cannot send audio.");
        return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
        ws.send(JSON.stringify({ type: "audio", audio: reader.result, username }));
    };
}

// Play Received Audio
function playAudio(audioData) {
    const audio = new Audio(audioData);
    audio.play().catch((error) => {
        console.error("Audio playback error:", error);
    });
}

// Play Beep Sound on "Talk" Button Click
function playBeepSound() {
    if (beepSound) {
        beepSound.play();
    }
}

// Update UI When a User Joins
function addUserToRecentlyJoined(user) {
    if (!user) return;

    // Check if user already exists in the list
    if ([...recentlyJoinedList.children].some(li => li.dataset.username === user)) return;

    const li = document.createElement("li");
    li.className = "flex items-center justify-between p-2 bg-gray-800 rounded-md";
    li.dataset.username = user;
    li.innerHTML = `
        <span>${user} - Connected</span>
        <span class="flex items-center">
            <span class="dot online"></span>
            <button class="talkBtn bg-blue-500 px-2 py-1 rounded ml-2" data-username="${user}">Talk</button>
        </span>
    `;
    recentlyJoinedList.appendChild(li);

    // Add Event Listener for "Talk" Button
    li.querySelector(".talkBtn").addEventListener("click", playBeepSound);
}

// Remove User from List When They Leave
function removeUserFromRecentlyJoined(user) {
    const item = [...recentlyJoinedList.children].find(li => li.dataset.username === user);
    if (item) recentlyJoinedList.removeChild(item);
}

// Update the Recently Joined Users List
function updateRecentlyJoinedList(users) {
    recentlyJoinedList.innerHTML = ""; // Clear current list
    users.forEach(user => addUserToRecentlyJoined(user));
}
