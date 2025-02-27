const status = document.getElementById("status");
const usernameInput = document.getElementById("username");
const connectBtn = document.getElementById("connectBtn");
const talkBtn = document.getElementById("talkBtn");
const talkContainer = document.getElementById("talk-container");
const recentlyJoinedList = document.getElementById("recentlyJoined");
const beepSound = document.getElementById("beepSound");
const talkieSound = document.getElementById("talkieSound");
const connectSound = document.getElementById("connectSound");

// Sidebar Elements
const toggleBtn = document.getElementById("toggleBtn");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const closeBtn = document.getElementById("closeBtn");

let ws, mediaRecorder, audioChunks = [], username = "", reconnectTimeout, connectingInterval, activeChatUser = null;

// Play Incoming Audio Message
function playAudio(audioBase64) {
    const audio = new Audio(audioBase64);
    audio.play().catch(err => console.warn("Audio play error:", err));
}

// Play Beep Sound on Receiver's Device
function playBeepSound() {
    if (beepSound) {
        beepSound.currentTime = 0;
        beepSound.play().catch(err => console.warn("Beep sound play error:", err));
    }
}

// Play Talkie Sound on Sender's Device
function playTalkieSound() {
    if (talkieSound) {
        talkieSound.currentTime = 0;
        talkieSound.play().catch(err => console.warn("Talkie sound play error:", err));
    }
}

// Play Connect Sound
function playConnectSound() {
    if (connectSound) {
        connectSound.currentTime = 0;
        connectSound.play().catch(err => console.warn("Connect sound play error:", err));
    }
}

// Send Ring Request
function sendRingRequest(targetUsername) {
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ring", from: username, to: targetUsername }));
        activeChatUser = targetUsername;
    } else {
        console.warn("WebSocket not connected. Cannot send ring request.");
    }
}

// Animated Connecting Dots
function animateConnectingDots() {
    let dots = "";
    connectingInterval = setInterval(() => {
        dots = dots.length < 3 ? dots + "." : "";
        status.textContent = `Connecting${dots}`;
    }, 500);
}

// Stop Connecting Animation
function stopConnectingDots() {
    clearInterval(connectingInterval);
}

// Add User to Recently Joined
function addUserToRecentlyJoined(user) {
    if (!user || !user.username) return;

    if ([...recentlyJoinedList.children].some(li => li.dataset.username === user.username)) return;

    const li = document.createElement("li");
    li.className = "flex justify-between items-center px-4 py-2 bg-gray-800 rounded-md";
    li.dataset.username = user.username;
    li.innerHTML = `
        <span class="font-medium">${user.username}</span>
        <span class="${user.online ? 'wave' : 'text-red-400'}">
            ${user.online ? "" : "Offline"}
        </span>
        <button class="talkBtn bg-blue-500 px-3 py-1 rounded text-white text-sm hover:bg-blue-600 transition"
            data-username="${user.username}" ${!user.online ? 'disabled' : ''}>
            Talk
        </button>
    `;

    recentlyJoinedList.appendChild(li);
    li.querySelector(".talkBtn").addEventListener("click", () => {
        sendRingRequest(user.username);
    });
}

// Remove User from Recently Joined
function removeUserFromRecentlyJoined(username) {
    const userElement = recentlyJoinedList.querySelector(`[data-username="${username}"]`);
    if (userElement) {
        userElement.remove();
    }
}

// Handle Recording Status
function handleRecordingStatus(user, isRecording) {
    const userElement = recentlyJoinedList.querySelector(`[data-username="${user}"]`);
    if (userElement) {
        const statusText = userElement.querySelector("span:nth-child(2)");
        if (statusText) {
            statusText.textContent = isRecording ? "Recording... 🎤" : "";
            statusText.classList.toggle("text-yellow-400", isRecording);
            statusText.classList.toggle("wave", !isRecording);
        }
    }
}

// Fetch users from the server and update UI
async function fetchRecentlyJoined() {
    try {
        const response = await fetch("/get-users");
        const data = await response.json();
        if (data.users && Array.isArray(data.users)) {
            recentlyJoinedList.innerHTML = "";
            data.users.forEach(user => addUserToRecentlyJoined({ username: user, online: true }));
        }
    } catch (error) {
        console.error("Error fetching users:", error);
    }
}

// Connect to WebSocket
function connectToServer() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    status.textContent = "Connecting";
    animateConnectingDots();

    const wsUrl = window.location.hostname === "localhost"
        ? "ws://localhost:8080/ws"
        : "wss://walkie-talkie-3i76.onrender.com/ws";  

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        stopConnectingDots();
        console.log("Connected to WebSocket");
        clearTimeout(reconnectTimeout);
        ws.send(JSON.stringify({ type: "join", username }));
        updateUIOnConnect();
    };

    ws.onclose = () => {
        status.textContent = "Disconnected ❌";
        status.classList.replace("text-green-400", "text-red-400");

        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectToServer, 5000);
    };

    ws.onerror = (error) => console.error("WebSocket error:", error);

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case "audio":
                    if (data.to === username || !data.to) {
                        playAudio(data.audio);
                    }
                    break;
                case "user_joined":
                    addUserToRecentlyJoined({ username: data.username, online: true });
                    break;
                case "user_left":
                    removeUserFromRecentlyJoined(data.username);
                    break;
                case "user_list":
                    if (Array.isArray(data.users)) {
                        recentlyJoinedList.innerHTML = "";
                        data.users.forEach(user => addUserToRecentlyJoined({ username: user, online: true }));
                    }
                    break;
                case "ring":
                    if (data.to === username) playBeepSound();
                    break;
                case "recording":
                    handleRecordingStatus(data.username, data.status);
                    break;
                default:
                    console.warn("Unknown message type:", data);
            }
        } catch (error) {
            console.error("Error parsing message:", error);
        }
    };
}

// Connect Button Click Handler
connectBtn.addEventListener("click", () => {
    username = usernameInput.value.trim();
    if (!username) return alert("Please enter a username");
    
    fetch('/save-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    }).then(() => {
        playConnectSound();
        connectToServer();
    });
});

function updateUIOnConnect() {
    status.textContent = `Connected as ${username} ✅`;
    status.classList.replace("text-yellow-400", "text-green-400");
    connectBtn.style.display = "none";
    usernameInput.style.display = "none";
    talkContainer.classList.remove("hidden");
    localStorage.setItem("username", username);
}

// Handle Audio Sending with Personal Chat Feature
function sendAudio(blob) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return console.warn("WebSocket not connected.");
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
        ws.send(JSON.stringify({ type: "audio", audio: reader.result, from: username, to: activeChatUser }));
    };
}

// Start Recording
talkBtn.addEventListener("mousedown", async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
        mediaRecorder.onstop = () => sendAudio(new Blob(audioChunks, { type: "audio/webm" }));

        mediaRecorder.start();
        talkBtn.textContent = "Recording... 🎤";
        talkBtn.classList.add("bg-red-500");

    } catch (error) {
        alert("Microphone access is required.");
    }
});

// Stop Recording
talkBtn.addEventListener("mouseup", () => {
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
    talkBtn.textContent = "🎤 Hold to Talk";
    talkBtn.classList.remove("bg-red-500");
});