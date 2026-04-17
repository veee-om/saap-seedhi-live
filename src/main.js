import { BOARD_SIZE, buildBoardCells } from "./game.js";

const socket = window.io();
const boardCells = buildBoardCells();

const elements = {
  appShell: document.querySelector("#app-shell"),
  joinPanel: document.querySelector("#join-panel"),
  gamePanel: document.querySelector("#game-panel"),
  joinForm: document.querySelector("#join-form"),
  playerName: document.querySelector("#player-name"),
  roomCodeInput: document.querySelector("#room-code"),
  createRoomButton: document.querySelector("#create-room-button"),
  banner: document.querySelector("#banner"),
  copyRoomButton: document.querySelector("#copy-room-button"),
  gameStatus: document.querySelector("#game-status"),
  gameHint: document.querySelector("#game-hint"),
  players: document.querySelector("#players"),
  startButton: document.querySelector("#start-button"),
  resetButton: document.querySelector("#reset-button"),
  turnLabel: document.querySelector("#turn-label"),
  diceValue: document.querySelector("#dice-value"),
  moveSummary: document.querySelector("#move-summary"),
  board: document.querySelector("#board"),
  rollButton: document.querySelector("#roll-button"),
  winnerModal: document.querySelector("#winner-modal"),
  winnerTitle: document.querySelector("#winner-title"),
  winnerText: document.querySelector("#winner-text"),
  winnerButton: document.querySelector("#winner-button")
};

const state = {
  room: null,
  playerId: null
};

renderBoard();
syncUi();

elements.createRoomButton.addEventListener("click", () => {
  sendRoomAction("room:create", { name: getName() });
});

elements.joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendRoomAction("room:join", {
    name: getName(),
    code: elements.roomCodeInput.value
  });
});

elements.startButton.addEventListener("click", () => {
  sendRoomAction("room:start");
});

elements.resetButton.addEventListener("click", () => {
  sendRoomAction("room:reset");
});

elements.rollButton.addEventListener("click", () => {
  sendRoomAction("room:roll");
});

elements.winnerButton.addEventListener("click", () => {
  sendRoomAction("room:reset");
});

elements.copyRoomButton.addEventListener("click", async () => {
  if (!state.room?.code) {
    return;
  }

  try {
    await navigator.clipboard.writeText(state.room.code);
    showBanner("Room code copied.");
  } catch (_error) {
    showBanner(`Room code: ${state.room.code}`);
  }
});

socket.on("room:update", (room) => {
  state.room = room;
  syncUi();
});

socket.on("connect", () => {
  showBanner("");
});

socket.on("disconnect", () => {
  showBanner("Connection lost. Trying to reconnect...");
});

function sendRoomAction(eventName, payload = {}) {
  showBanner("");
  socket.emit(eventName, payload, (response) => {
    if (!response?.ok) {
      showBanner(response?.error || "Something went wrong.");
      return;
    }

    state.playerId = response.playerId || state.playerId;
    state.room = response.room;
    syncUi();
  });
}

function syncUi() {
  const hasRoom = Boolean(state.room);
  elements.joinPanel.hidden = hasRoom;
  elements.gamePanel.hidden = !hasRoom;
  elements.appShell.dataset.mode = hasRoom ? "game" : "landing";

  if (!hasRoom) {
    updateBoardTokens([]);
    hideWinnerModal();
    return;
  }

  const room = state.room;
  const game = room.game;
  const me = room.players.find((player) => player.id === state.playerId);
  const isHost = room.hostId === state.playerId;
  const activePlayer = game?.players[game.currentTurn] || null;
  const winner = game?.players.find((player) => player.id === game.winnerId) || null;

  elements.copyRoomButton.textContent = room.code;
  elements.gameStatus.textContent = formatStatus(room, winner);
  elements.gameHint.textContent = getHint(room, me, activePlayer);
  elements.startButton.disabled = !isHost || room.status !== "lobby" || room.players.length < 2;
  elements.resetButton.disabled = !isHost;
  elements.rollButton.disabled =
    room.status !== "playing" || game?.status !== "playing" || activePlayer?.id !== state.playerId;

  elements.turnLabel.textContent = activePlayer ? activePlayer.name : "Waiting";
  elements.diceValue.textContent = game?.lastRoll ? String(game.lastRoll.dice) : "-";
  elements.moveSummary.textContent = room.message || "Waiting for players.";

  renderPlayers(room, game, activePlayer);
  updateBoardTokens(game?.players || []);
  renderWinnerModal(game, winner);
}

function renderPlayers(room, game, activePlayer) {
  elements.players.replaceChildren();

  room.players.forEach((player, index) => {
    const gamePlayer = game?.players.find((entry) => entry.id === player.id);
    const card = document.createElement("article");
    card.className = "player-card";
    if (activePlayer?.id === player.id && game?.status === "playing") {
      card.classList.add("player-card--active");
    }
    if (game?.winnerId === player.id) {
      card.classList.add("player-card--winner");
    }

    const token = document.createElement("span");
    token.className = `token token--${player.color}`;
    token.textContent = player.token;

    const text = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = player.name;

    const meta = document.createElement("p");
    meta.textContent = getPlayerMeta(player, index, gamePlayer);

    text.append(name, meta);
    card.append(token, text);
    elements.players.append(card);
  });
}

function renderBoard() {
  elements.board.replaceChildren();

  boardCells.forEach((cell) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.style.gridRowStart = String(cell.row + 1);
    tile.style.gridColumnStart = String(cell.column + 1);
    tile.dataset.value = String(cell.value);

    if (cell.destination) {
      tile.classList.add(cell.destination > cell.value ? "tile--ladder" : "tile--snake");
    }

    tile.classList.add((cell.row + cell.column) % 2 === 0 ? "tile--warm" : "tile--cool");
    if (cell.value === 1) {
      tile.classList.add("tile--start");
    }
    if (cell.value === BOARD_SIZE) {
      tile.classList.add("tile--finish");
    }

    const number = document.createElement("span");
    number.className = "tile__number";
    number.textContent = String(cell.value);

    const marker = document.createElement("span");
    marker.className = "tile__marker";
    marker.textContent = cell.destination
      ? `${cell.destination > cell.value ? "L" : "S"} ${cell.destination}`
      : "";

    const tokens = document.createElement("div");
    tokens.className = "tile__tokens";

    tile.append(number, marker, tokens);
    elements.board.append(tile);
  });
}

function updateBoardTokens(players) {
  boardCells.forEach((cell) => {
    const tokenLayer = elements.board.querySelector(`[data-value="${cell.value}"] .tile__tokens`);
    tokenLayer.replaceChildren();

    players
      .filter((player) => player.position === cell.value)
      .forEach((player) => {
        const token = document.createElement("span");
        token.className = `token token--${player.color}`;
        token.textContent = player.token;
        token.title = player.name;
        tokenLayer.append(token);
      });
  });
}

function renderWinnerModal(game, winner) {
  const visible = game?.status === "finished" && Boolean(winner);
  elements.winnerModal.classList.toggle("hidden", !visible);

  if (!winner) {
    return;
  }

  elements.winnerTitle.textContent = `${winner.name} wins`;
  elements.winnerText.textContent = `${winner.name} reached square 100 first. The host can send everyone back to the lobby.`;
}

function hideWinnerModal() {
  elements.winnerModal.classList.add("hidden");
}

function getName() {
  return elements.playerName.value.trim();
}

function showBanner(message) {
  elements.banner.textContent = message;
}

function formatStatus(room, winner) {
  if (winner) {
    return `${winner.name} won`;
  }

  if (room.status === "playing") {
    return "Match live";
  }

  return `${room.players.length}/4 players in lobby`;
}

function getHint(room, me, activePlayer) {
  if (!me) {
    return "You are watching this room.";
  }

  if (room.status === "lobby") {
    return room.hostId === state.playerId
      ? "Share the code, then start once at least two players join."
      : "Waiting for the host to start.";
  }

  if (room.status === "finished") {
    return "Match complete. The host can return everyone to the lobby.";
  }

  return activePlayer?.id === state.playerId ? "Your turn to roll." : `Waiting for ${activePlayer?.name}.`;
}

function getPlayerMeta(player, index, gamePlayer) {
  const labels = [];
  labels.push(player.host ? "Host" : `Player ${index + 1}`);
  labels.push(player.connected ? "Online" : "Offline");

  if (gamePlayer) {
    labels.push(`Square ${gamePlayer.position}`);
  }

  return labels.join(" - ");
}
