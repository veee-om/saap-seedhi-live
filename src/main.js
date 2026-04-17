import { BOARD_SIZE, buildBoardCells } from "./game.js";

const socket = window.io();
const boardCells = buildBoardCells();

const elements = {
  appShell: document.querySelector("#app-shell"),
  joinPanel: document.querySelector("#join-panel"),
  lobbyPanel: document.querySelector("#lobby-panel"),
  gamePanel: document.querySelector("#game-panel"),
  joinForm: document.querySelector("#join-form"),
  playerName: document.querySelector("#player-name"),
  roomCodeInput: document.querySelector("#room-code"),
  createRoomButton: document.querySelector("#create-room-button"),
  banner: document.querySelector("#banner"),
  lobbyTitle: document.querySelector("#lobby-title"),
  lobbyHint: document.querySelector("#lobby-hint"),
  lobbyMessage: document.querySelector("#lobby-message"),
  copyRoomButton: document.querySelector("#copy-room-button"),
  gameStatus: document.querySelector("#game-status"),
  gameHint: document.querySelector("#game-hint"),
  players: document.querySelector("#players"),
  gamePlayers: document.querySelector("#game-players"),
  startButton: document.querySelector("#start-button"),
  resetButton: document.querySelector("#reset-button"),
  turnLabel: document.querySelector("#turn-label"),
  diceValue: document.querySelector("#dice-value"),
  moveSummary: document.querySelector("#move-summary"),
  board: document.querySelector("#board"),
  boardArt: document.querySelector("#board-art"),
  rollButton: document.querySelector("#roll-button"),
  winnerModal: document.querySelector("#winner-modal"),
  winnerTitle: document.querySelector("#winner-title"),
  winnerText: document.querySelector("#winner-text"),
  winnerButton: document.querySelector("#winner-button")
};

const state = {
  room: null,
  playerId: null,
  lastRollKey: null
};

renderBoard();
renderBoardArt();
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
    showNotice("Room code copied.");
  } catch (_error) {
    showNotice(`Room code: ${state.room.code}`);
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
  const isLobby = hasRoom && state.room.status === "lobby";
  const isBoardVisible = hasRoom && state.room.status !== "lobby";
  elements.joinPanel.hidden = hasRoom;
  elements.lobbyPanel.hidden = !isLobby;
  elements.gamePanel.hidden = !isBoardVisible;
  elements.appShell.dataset.mode = !hasRoom ? "landing" : isLobby ? "lobby" : "game";

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
  elements.lobbyTitle.textContent = `${room.players.length}/4 players joined`;
  elements.lobbyHint.textContent = getLobbyHint(room, isHost);
  elements.lobbyMessage.textContent = getLobbyMessage(room, isHost);
  elements.gameStatus.textContent = formatStatus(room, winner);
  elements.gameHint.textContent = getHint(room, me, activePlayer);
  elements.startButton.disabled = !isHost || room.status !== "lobby" || room.players.length < 2;
  elements.resetButton.disabled = !isHost;
  elements.rollButton.disabled =
    room.status !== "playing" || game?.status !== "playing" || activePlayer?.id !== state.playerId;

  elements.turnLabel.textContent = activePlayer ? activePlayer.name : "Waiting";
  syncDice(game);
  elements.moveSummary.textContent = room.message || "Waiting for players.";

  renderPlayers(elements.players, room, game, activePlayer);
  renderPlayers(elements.gamePlayers, room, game, activePlayer);
  updateBoardTokens(game?.players || []);
  renderWinnerModal(game, winner);
}

function renderPlayers(container, room, game, activePlayer) {
  container.replaceChildren();

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
    container.append(card);
  });
}

function renderBoard() {
  elements.board.replaceChildren();

  boardCells.forEach((cell) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.style.gridRowStart = String(10 - cell.row);
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
    marker.textContent = cell.destination ? String(cell.destination) : "";

    const tokens = document.createElement("div");
    tokens.className = "tile__tokens";

    tile.append(number, marker, tokens);
    elements.board.append(tile);
  });
}

function renderBoardArt() {
  elements.boardArt.replaceChildren();

  boardCells
    .filter((cell) => cell.destination)
    .forEach((cell, index) => {
      if (cell.destination > cell.value) {
        drawLadder(cell.value, cell.destination, index);
        return;
      }

      drawSnake(cell.value, cell.destination, index);
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

function syncDice(game) {
  if (!game?.lastRoll) {
    elements.diceValue.textContent = "-";
    elements.diceValue.dataset.value = "";
    state.lastRollKey = null;
    return;
  }

  const rollKey = `${game.lastRoll.playerId}-${game.lastRoll.dice}-${game.lastRoll.from}-${game.lastRoll.to}`;
  elements.diceValue.textContent = String(game.lastRoll.dice);
  elements.diceValue.dataset.value = String(game.lastRoll.dice);

  if (rollKey !== state.lastRollKey) {
    state.lastRollKey = rollKey;
    elements.diceValue.classList.remove("dice--rolling");
    window.requestAnimationFrame(() => {
      elements.diceValue.classList.add("dice--rolling");
    });
  }
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

function showNotice(message) {
  showBanner(message);
  if (state.room?.status === "lobby") {
    elements.lobbyMessage.textContent = message;
  }
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

function getLobbyHint(room, isHost) {
  if (isHost) {
    return room.players.length < 2
      ? "Share the room code with at least one more player."
      : "Everyone is in. Start the match when the table is ready.";
  }

  return "You are in. Waiting for the host to start.";
}

function getLobbyMessage(room, isHost) {
  if (room.players.length < 2) {
    return "Need at least 2 players.";
  }

  return isHost ? "Ready to start." : "The host controls the start.";
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

function drawSnake(from, to, index) {
  const start = getCellCenter(from);
  const end = getCellCenter(to);
  const bend = index % 2 === 0 ? 1 : -1;
  const midX = (start.x + end.x) / 2 + bend * 7;
  const midY = (start.y + end.y) / 2;
  const pathData = `M ${start.x} ${start.y} Q ${midX} ${midY - 8} ${(start.x + end.x) / 2} ${midY} T ${end.x} ${end.y}`;

  const body = createSvgElement("path", {
    d: pathData,
    class: "snake-path"
  });
  const head = createSvgElement("circle", {
    cx: end.x,
    cy: end.y,
    r: 1.8,
    class: "snake-head"
  });
  const tongue = createSvgElement("path", {
    d: `M ${end.x} ${end.y + 1.4} l -1.4 2 M ${end.x} ${end.y + 1.4} l 1.4 2`,
    class: "snake-tongue"
  });

  elements.boardArt.append(body, head, tongue);
}

function drawLadder(from, to, index) {
  const start = getCellCenter(from);
  const end = getCellCenter(to);
  const offset = index % 2 === 0 ? 1.4 : -1.4;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const normalX = Math.cos(angle + Math.PI / 2) * 1.5;
  const normalY = Math.sin(angle + Math.PI / 2) * 1.5;
  const railA = {
    x1: start.x + normalX + offset,
    y1: start.y + normalY,
    x2: end.x + normalX + offset,
    y2: end.y + normalY
  };
  const railB = {
    x1: start.x - normalX + offset,
    y1: start.y - normalY,
    x2: end.x - normalX + offset,
    y2: end.y - normalY
  };

  elements.boardArt.append(createSvgElement("line", { ...railA, class: "ladder-rail" }));
  elements.boardArt.append(createSvgElement("line", { ...railB, class: "ladder-rail" }));

  for (let rung = 1; rung <= 4; rung += 1) {
    const progress = rung / 5;
    elements.boardArt.append(
      createSvgElement("line", {
        x1: railA.x1 + (railA.x2 - railA.x1) * progress,
        y1: railA.y1 + (railA.y2 - railA.y1) * progress,
        x2: railB.x1 + (railB.x2 - railB.x1) * progress,
        y2: railB.y1 + (railB.y2 - railB.y1) * progress,
        class: "ladder-rung"
      })
    );
  }
}

function getCellCenter(value) {
  const row = Math.floor((value - 1) / 10);
  const columnOffset = (value - 1) % 10;
  const column = row % 2 === 0 ? columnOffset : 9 - columnOffset;
  const displayRow = 9 - row;

  return {
    x: column * 10 + 5,
    y: displayRow * 10 + 5
  };
}

function createSvgElement(name, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}
