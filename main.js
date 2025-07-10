const BACKEND_URL = "https://web-production-c6494.up.railway.app";
const WS_URL = BACKEND_URL.replace("https://", "wss://");

let currentScreen = "menu";
let websocket = null;
let currentRoom = null;
let playerId = null;
let playerName = "";

const screens = {
  menu: document.getElementById("menu-screen"),
  lobby: document.getElementById("lobby-screen"),
  game: document.getElementById("game-screen"),
};

document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
  setupEventListeners();
  checkBackendStatus();
});

function initializeApp() {
  showScreen("menu");
}

function setupEventListeners() {
  document.getElementById("create-room-btn").addEventListener("click", createRoom);
  document.getElementById("join-room-btn").addEventListener("click", joinRoom);
  document.getElementById("roll-dice-btn").addEventListener("click", rollDice);
  document.getElementById("start-game-btn").addEventListener("click", startGame);

  document.getElementById("player-name").addEventListener("keypress", (e) => {
    if (e.key === "Enter") createRoom();
  });

  document.getElementById("room-id-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") joinRoom();
  });
}

async function checkBackendStatus() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    document.getElementById("backend-status").textContent = "Connected";
    document.querySelector(".dot").className = "dot online";
  } catch (error) {
    document.getElementById("backend-status").textContent = `Offline (${error.message})`;
    document.querySelector(".dot").className = "dot offline";
    console.error("Backend not available:", error);
  }
}

async function createRoom() {
  playerName = document.getElementById("player-name").value.trim();
  if (!playerName) {
    alert("Please enter your name!");
    return;
  }

  console.log("Creating room with player_name:", playerName);

  try {
    const response = await fetch(`${BACKEND_URL}/create-room`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ player_name: playerName }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to create room: ${errorData.detail || errorData.error || response.statusText}`);
    }

    const data = await response.json();

    if (data.room_id) {
      playerId = data.player_id;
      connectToRoom(data.room_id);
    } else {
      alert("Failed to create room: " + (data.detail || data.error || "Unknown error"));
    }
  } catch (error) {
    alert("Failed to create room: " + error.message);
    console.error("Create room error:", error);
  }
}

async function joinRoom() {
  playerName = document.getElementById("player-name").value.trim();
  const roomId = document.getElementById("room-id-input").value.trim().toUpperCase();

  if (!playerName || !roomId) {
    alert("Please enter your name and room ID!");
    return;
  }

  console.log("Joining room with room_id:", roomId, "player_name:", playerName);

  try {
    const response = await fetch(`${BACKEND_URL}/join-room`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ room_id: roomId, player_name: playerName }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Join room response error:", errorData);
      throw new Error(`Failed to join room: ${errorData.detail || errorData.error || response.statusText}`);
    }

    const data = await response.json();

    if (data.room_id) {
      playerId = data.player_id;
      connectToRoom(data.room_id);
    } else {
      alert("Failed to join room: " + (data.detail || data.error || "Unknown error"));
    }
  } catch (error) {
    alert("Failed to join room: " + error.message);
    console.error("Join room error:", error);
  }
}

function connectToRoom(roomId) {
  currentRoom = { id: roomId };
  websocket = new WebSocket(`${WS_URL}/ws/${roomId}`);

  websocket.onopen = () => {
    console.log("Connected to room:", roomId);
    updateConnectionStatus("connected");
    showScreen("lobby");
    document.getElementById("room-code").textContent = roomId;
    document.getElementById("game-room-code").textContent = roomId;
  };

  websocket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log("Received message:", message);
    handleWebSocketMessage(message);
  };

  websocket.onclose = () => {
    console.log("Disconnected from room");
    updateConnectionStatus("disconnected");
  };

  websocket.onerror = (error) => {
    console.error("WebSocket error:", error);
    updateConnectionStatus("disconnected");
  };
}

function handleWebSocketMessage(message) {
  switch (message.type) {
    case "room_update":
      updateRoomState(message.room);
      break;
    case "game_started":
      updateRoomState(message.room);
      showScreen("game");
      setupPieceListeners();
      break;
    case "dice_rolled":
      updateDiceResult(message.dice);
      updateRoomState(message.room);
      break;
    case "piece_moved":
      updateRoomState(message.room);
      break;
  }
}

function updateRoomState(room) {
  currentRoom = room;

  if (currentScreen === "lobby") {
    renderLobbyPlayers(room.players);
    updateStartButton(room.players.length);
  } else if (currentScreen === "game") {
    console.log("Rendering game board for room:", room);
    renderGameBoard(room);
    renderGamePlayers(room.players);
    updateGameControls(room);
  }
}

function renderLobbyPlayers(players) {
  const grid = document.getElementById("players-grid");
  grid.innerHTML = "";

  players.forEach((player) => {
    const slot = document.createElement("div");
    slot.className = "player-slot filled";
    slot.innerHTML = `
      <div class="player-avatar ${player.color}"></div>
      <div class="player-name">${player.name}</div>
    `;
    grid.appendChild(slot);
  });

  const maxPlayers = 4;
  for (let i = players.length; i < maxPlayers; i++) {
    const slot = document.createElement("div");
    slot.className = "player-slot empty";
    slot.innerHTML = `
      <div class="player-avatar" style="background: #ccc;"></div>
      <div class="player-name">Waiting...</div>
    `;
    grid.appendChild(slot);
  }

  document.getElementById("player-count").textContent = `${players.length}/${maxPlayers} players joined`;
}

function updateStartButton(playerCount) {
  const startBtn = document.getElementById("start-game-btn");
  startBtn.disabled = playerCount < 2;
  startBtn.textContent = playerCount < 2 ? "Need 2+ players" : "▶️ Start Game";
}

function renderGameBoard(room) {
  const homeIds = {
    red: ["g_r1", "g_r2", "g_r3", "g_r4"],
    green: ["g_g1", "g_g2", "g_g3", "g_g4"],
    yellow: ["g_y1", "g_y2", "g_y3", "g_y4"],
    blue: ["g_b1", "g_b2", "g_b3", "g_b4"],
  };

  // Clear all board positions
  document.querySelectorAll("#board .box, #board .g_red, #board .g_green, #board .g_yellow, #board .g_blue").forEach(cell => {
    cell.innerHTML = "";
  });

  room.players.forEach(player => {
    player.pieces.forEach(piece => {
      const pieceEl = document.createElement("div");
      pieceEl.id = piece.id.split("-").pop(); // e.g., "r1", "b2"
      pieceEl.className = piece.id.split("-").pop(); // Use piece ID as class for styling
      const target = piece.home ? document.getElementById(homeIds[player.color][parseInt(piece.id.split("-").pop()[1]) - 1]) : document.getElementById(piece.position);
      if (target) {
        target.appendChild(pieceEl);
      } else {
        console.error(`Target not found for piece ${piece.id} at position ${piece.position}`);
      }
    });
  });
}

function setupPieceListeners() {
  const pieceIds = ["r1", "r2", "r3", "r4", "b1", "b2", "b3", "b4", "g1", "g2", "g3", "g4", "y1", "y2", "y3", "y4"];
  pieceIds.forEach(id => {
    const piece = document.getElementById(id);
    if (piece) {
      piece.addEventListener("click", () => {
        if (currentRoom && currentRoom.dice_result && currentRoom.players[currentRoom.current_turn].id === playerId) {
          websocket.send(JSON.stringify({
            action: "move_piece",
            player_id: playerId,
            piece_id: `${playerName}-${id}`,
          }));
        }
      });
    }
  });
}

function renderGamePlayers(players) {
  const list = document.getElementById("game-players-list");
  list.innerHTML = "";

  players.forEach((player, index) => {
    const item = document.createElement("div");
    item.className = `player-item ${index === currentRoom.current_turn ? "active" : ""}`;
    item.innerHTML = `
      <div class="player-item-avatar ${player.color}"></div>
      <div class="player-item-info">
        <div class="player-item-name">${player.name}</div>
        <div class="player-item-position">Pieces: ${player.pieces.map(p => p.position).join(", ")}</div>
      </div>
    `;
    list.appendChild(item);
  });
}

function updateGameControls(room) {
  const rollBtn = document.getElementById("roll-dice-btn");
  const turnMsg = document.getElementById("turn-message");
  const currentTurnSpan = document.getElementById("current-turn");

  const currentPlayer = room.players[room.current_turn];
  const isMyTurn = currentPlayer && currentPlayer.id === playerId;

  currentTurnSpan.textContent = currentPlayer ? currentPlayer.name : "Unknown";

  if (isMyTurn && !room.dice_result) {
    rollBtn.disabled = false;
    rollBtn.textContent = "🎲 Roll Dice";
    turnMsg.textContent = "It's your turn!";
  } else if (isMyTurn && room.dice_result) {
    rollBtn.disabled = true;
    rollBtn.textContent = "🎲 Select a piece";
    turnMsg.textContent = `You rolled a ${room.dice_result}. Select a piece.`;
  } else {
    rollBtn.disabled = true;
    rollBtn.textContent = "🎲 Roll Dice";
    turnMsg.textContent = `Wait for ${currentPlayer?.name || "other player"}'s turn`;
  }
}

function updateDiceResult(diceValue) {
  const diceDisplay = document.getElementById("dice-result");
  const diceEmojis = ["🎲", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  diceDisplay.textContent = diceEmojis[diceValue] || "🎲";
}

function startGame() {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({ action: "start_game" }));
  }
}

function rollDice() {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({ action: "roll_dice" }));
  }
}

function updateConnectionStatus(status) {
  const badge = document.getElementById("connection-badge");
  if (status === "connected") {
    badge.textContent = "Connected";
    badge.className = "connection-badge connected";
  } else {
    badge.textContent = "Disconnected";
    badge.className = "connection-badge disconnected";
  }
}

function showScreen(screenName) {
  console.log("Switching to screen:", screenName);
  Object.values(screens).forEach((screen) => {
    screen.classList.remove("active");
  });
  screens[screenName].classList.add("active");
  currentScreen = screenName;
}

const style = document.createElement("style");
style.textContent = `
  .player-avatar.red, .player-item-avatar.red { background: #dc3545; }
  .player-avatar.blue, .player-item-avatar.blue { background: #007bff; }
  .player-avatar.green, .player-item-avatar.green { background: #28a745; }
  .player-avatar.yellow, .player-item-avatar.yellow { background: #ffc107; }
`;
document.head.appendChild(style);
