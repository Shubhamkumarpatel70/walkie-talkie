const status = document.getElementById("status");
const usernameInput = document.getElementById("username");
const connectBtn = document.getElementById("connectBtn");
const talkBtn = document.getElementById("talkBtn");
const talkContainer = document.getElementById("talk-container");
const recentlyJoinedList = document.getElementById("recentlyJoined");
const beepSound = document.getElementById("beepSound");

let ws, mediaRecorder, audioChunks = [], username = "";

connectBtn.addEventListener("click", () => {
    username = usernameInput.value.trim();
    if (!username) {
        alert("Please enter a username");
        return;
    }
    connectToServer();
});

function connectToServer() {
    const ws = new WebSocket(
        window.location.hostname === "localhost"
          ? "ws://localhost:8080"
          : "wss://walkie-talkie-3i76.onrender.com"
      );      

    ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join", username }));
        status.textContent = `Connected as ${username} ✅`;
        status.classList.replace("text-yellow-400", "text-green-400");
        connectBtn.style.display = "none";
        usernameInput.style.display = "none";
        talkContainer.classList.remove("hidden");
    };

    ws.onclose = () => {
        status.textContent = "Disconnected ❌";
        status.classList.replace("text-green-400", "text-red-400");
    };

    // Add the message event handler here
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "audio") {
            playAudio(data.audio);
        } else if (data.type === "user_joined") {
            console.log(`${data.username} has joined.`);
            addUserToRecentlyJoined(data.username); // Update the UI
        } else if (data.type === "user_left") {
            console.log(`${data.username} has left.`);
            removeUserFromRecentlyJoined(data.username); // Update the UI
        } else if (data.type === "user_list") {
            updateRecentlyJoinedList(data.users); // Update list when other users connect/disconnect
        }
    };
}

talkBtn.addEventListener("mousedown", async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        sendAudio(audioBlob);
        audioChunks = [];
    };

    mediaRecorder.start();
    talkBtn.textContent = "Recording... 🎤";
    talkBtn.classList.add("bg-red-500");
});

talkBtn.addEventListener("mouseup", () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        talkBtn.textContent = "🎤 Hold to Talk";
        talkBtn.classList.remove("bg-red-500");
    }
});

function sendAudio(blob) {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
        ws.send(JSON.stringify({ type: "audio", audio: reader.result, username }));
    };
}

function playAudio(audioData) {
    const audio = new Audio(audioData);
    audio.play();
}

// Function to play the beep sound
function playBeepSound() {
    beepSound.play();
}

// Functions to update the UI for user joins and leaves
function addUserToRecentlyJoined(username) {
    const li = document.createElement('li');
    li.className = "flex items-center justify-between p-2 bg-gray-800 rounded-md";
    li.innerHTML = `
        <span>${username} - Connected</span>
        <span class="flex items-center">
            <span class="dot online"></span>
            <button class="talkBtn bg-blue-500 px-2 py-1 rounded ml-2" data-username="${username}">Talk</button>
        </span>
    `;
    recentlyJoinedList.appendChild(li);

    // Add event listener to the "Talk" button
    const talkBtn = li.querySelector('.talkBtn');
    talkBtn.addEventListener('click', () => {
        playBeepSound(); // Play beep sound when the Talk button is clicked
    });
}

function removeUserFromRecentlyJoined(username) {
    const listItems = recentlyJoinedList.querySelectorAll('li');
    listItems.forEach(item => {
        if (item.textContent.includes(username)) {
            recentlyJoinedList.removeChild(item);
        }
    });
}

function updateRecentlyJoinedList(users) {
    recentlyJoinedList.innerHTML = ''; // Clear the current list
    users.forEach(user => {
        addUserToRecentlyJoined(user); // Add each user to the list
    });
}