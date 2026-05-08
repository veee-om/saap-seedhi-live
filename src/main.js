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
  tokenAnimationLayer: document.querySelector("#token-animation-layer"),
  rollButton: document.querySelector("#roll-button"),
  winnerModal: document.querySelector("#winner-modal"),
  winnerTitle: document.querySelector("#winner-title"),
  winnerText: document.querySelector("#winner-text"),
  winnerButton: document.querySelector("#winner-button")
};

const state = {
  room: null,
  playerId: null,
  lastRollKey: null,
  lastAnimatedMoveKey: null,
  animatingPlayerId: null,
  animationSequence: 0
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
    clearAnimationLayer();
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

  const moveKey = getLastRollKey(game);
  if (game?.lastRoll && moveKey !== state.lastAnimatedMoveKey) {
    state.lastAnimatedMoveKey = moveKey;
    startMoveAnimation(game, winner);
  }

  renderPlayers(elements.players, room, game, activePlayer);
  renderPlayers(elements.gamePlayers, room, game, activePlayer);
  updateBoardTokens(game?.players || []);
  renderWinnerModal(
    winner && state.animatingPlayerId === winner.id ? null : game,
    winner && state.animatingPlayerId === winner.id ? null : winner
  );
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
  appendBoardDefs();

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
      .filter((player) => player.position === cell.value && player.id !== state.animatingPlayerId)
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

function getLastRollKey(game) {
  if (!game?.lastRoll) {
    return null;
  }

  return `${game.lastRoll.playerId}-${game.lastRoll.dice}-${game.lastRoll.from}-${game.lastRoll.to}`;
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

async function startMoveAnimation(game, winner) {
  if (!game?.lastRoll) {
    return;
  }

  const sequence = state.animationSequence + 1;
  state.animationSequence = sequence;
  state.animatingPlayerId = game.lastRoll.playerId;
  updateBoardTokens(game.players);

  const player = game.players.find((entry) => entry.id === game.lastRoll.playerId);
  if (!player) {
    state.animatingPlayerId = null;
    return;
  }

  const floatingToken = document.createElement("span");
  floatingToken.className = `token token--${player.color} token-float token-float--instant`;
  floatingToken.textContent = player.token;
  floatingToken.title = player.name;
  elements.tokenAnimationLayer.replaceChildren(floatingToken);

  moveFloatingToken(floatingToken, game.lastRoll.from);
  floatingToken.getBoundingClientRect();
  floatingToken.classList.remove("token-float--instant");

  const landingPosition = game.lastRoll.attempted > BOARD_SIZE ? game.lastRoll.from : game.lastRoll.attempted;

  await animateFloatingToken(floatingToken, landingPosition, "move", sequence);

  if (game.lastRoll.to !== landingPosition) {
    await animateFloatingToken(floatingToken, game.lastRoll.to, game.lastRoll.movementType, sequence);
  }

  if (sequence !== state.animationSequence) {
    return;
  }

  state.animatingPlayerId = null;
  clearAnimationLayer();
  updateBoardTokens(state.room?.game?.players || []);
  renderWinnerModal(state.room?.game, winner);
}

function animateFloatingToken(token, position, phase, sequence) {
  return new Promise((resolve) => {
    token.classList.remove("token-float--move", "token-float--ladder", "token-float--snake");
    token.classList.add(`token-float--${phase}`);

    window.requestAnimationFrame(() => {
      if (sequence !== state.animationSequence) {
        resolve();
        return;
      }

      moveFloatingToken(token, position);
      window.setTimeout(resolve, phase === "move" ? 360 : 560);
    });
  });
}

function moveFloatingToken(token, position) {
  const { x, y } = getCellCenter(position);
  token.style.left = `${x}%`;
  token.style.top = `${y}%`;
}

function clearAnimationLayer() {
  elements.tokenAnimationLayer.replaceChildren();
}

function drawSnake(from, to, index) {
  const start = getCellCenter(from);
  const end = getCellCenter(to);
  const bend = index % 2 === 0 ? 1 : -1;
  const midX = (start.x + end.x) / 2 + bend * 7;
  const midY = (start.y + end.y) / 2;
  const bodyColor = index % 3 === 0 ? "emerald" : index % 3 === 1 ? "berry" : "sun";
  const pathData = `M ${start.x} ${start.y} C ${start.x + bend * 6} ${start.y + 8}, ${midX} ${midY - 10}, ${(start.x + end.x) / 2} ${midY} S ${end.x - bend * 5} ${end.y - 7}, ${end.x} ${end.y}`;
  const snakeGroup = createSvgElement("g", {
    class: `snake snake--${bodyColor}`
  });

  const shadow = createSvgElement("path", {
    d: pathData,
    class: "snake-shadow"
  });
  const body = createSvgElement("path", {
    d: pathData,
    class: "snake-path"
  });
  const highlight = createSvgElement("path", {
    d: pathData,
    class: "snake-highlight"
  });
  const belly = createSvgElement("path", {
    d: pathData,
    class: "snake-belly"
  });

  const spotOffsets = [0.16, 0.32, 0.49, 0.66, 0.82];
  const spots = spotOffsets.map((offset, spotIndex) => {
    const point = getPointOnCubicPath(start, end, bend, offset);
    return createSvgElement("ellipse", {
      cx: point.x,
      cy: point.y,
      rx: spotIndex % 2 === 0 ? 1.35 : 1.05,
      ry: spotIndex % 2 === 0 ? 0.82 : 0.68,
      class: "snake-spot"
    });
  });

  const head = createSvgElement("circle", {
    cx: end.x,
    cy: end.y,
    r: 2.15,
    class: "snake-head"
  });
  const muzzle = createSvgElement("ellipse", {
    cx: end.x,
    cy: end.y + 0.5,
    rx: 1.55,
    ry: 1.05,
    class: "snake-muzzle"
  });
  const eyeLeft = createSvgElement("circle", {
    cx: end.x - 0.72,
    cy: end.y - 0.4,
    r: 0.24,
    class: "snake-eye"
  });
  const eyeRight = createSvgElement("circle", {
    cx: end.x + 0.72,
    cy: end.y - 0.4,
    r: 0.24,
    class: "snake-eye"
  });
  const tongue = createSvgElement("path", {
    d: `M ${end.x} ${end.y + 1.4} l -1.4 2 M ${end.x} ${end.y + 1.4} l 1.4 2`,
    class: "snake-tongue"
  });

  snakeGroup.append(shadow, body, highlight, belly, ...spots, head, muzzle, eyeLeft, eyeRight, tongue);
  elements.boardArt.append(snakeGroup);
}

function drawLadder(from, to, index) {
  const start = getCellCenter(from);
  const end = getCellCenter(to);
  const offset = index % 2 === 0 ? 1.4 : -1.4;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const normalX = Math.cos(angle + Math.PI / 2) * 1.8;
  const normalY = Math.sin(angle + Math.PI / 2) * 1.8;
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

  const ladderGroup = createSvgElement("g", { class: "ladder" });

  ladderGroup.append(
    createSvgElement("line", { ...railA, class: "ladder-shadow" }),
    createSvgElement("line", { ...railB, class: "ladder-shadow" }),
    createSvgElement("line", { ...railA, class: "ladder-rail" }),
    createSvgElement("line", { ...railB, class: "ladder-rail" })
  );

  for (let rung = 1; rung <= 4; rung += 1) {
    const progress = rung / 5;
    const rungAttrs = {
      x1: railA.x1 + (railA.x2 - railA.x1) * progress,
      y1: railA.y1 + (railA.y2 - railA.y1) * progress,
      x2: railB.x1 + (railB.x2 - railB.x1) * progress,
      y2: railB.y1 + (railB.y2 - railB.y1) * progress
    };
    ladderGroup.append(
      createSvgElement("line", {
        ...rungAttrs,
        class: "ladder-rung-shadow"
      }),
      createSvgElement("line", {
        ...rungAttrs,
        class: "ladder-rung"
      })
    );
  }

  const capTop = createSvgElement("circle", {
    cx: (railA.x2 + railB.x2) / 2,
    cy: (railA.y2 + railB.y2) / 2,
    r: 1.15,
    class: "ladder-cap"
  });
  const capBottom = createSvgElement("circle", {
    cx: (railA.x1 + railB.x1) / 2,
    cy: (railA.y1 + railB.y1) / 2,
    r: 1.15,
    class: "ladder-cap"
  });

  ladderGroup.append(capTop, capBottom);
  elements.boardArt.append(ladderGroup);
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

function appendBoardDefs() {
  const defs = createSvgElement("defs", {});
  defs.append(
    createSvgElement("linearGradient", {
      id: "snakeGradientEmerald",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "100%"
    }),
    createSvgElement("linearGradient", {
      id: "snakeGradientBerry",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "100%"
    }),
    createSvgElement("linearGradient", {
      id: "snakeGradientSun",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "100%"
    }),
    createSvgElement("linearGradient", {
      id: "ladderWood",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "100%"
    })
  );

  const gradients = defs.querySelectorAll("linearGradient");
  gradients[0].append(
    createSvgElement("stop", { offset: "0%", "stop-color": "#37b48b" }),
    createSvgElement("stop", { offset: "100%", "stop-color": "#155945" })
  );
  gradients[1].append(
    createSvgElement("stop", { offset: "0%", "stop-color": "#ff6b9a" }),
    createSvgElement("stop", { offset: "100%", "stop-color": "#8f1d4d" })
  );
  gradients[2].append(
    createSvgElement("stop", { offset: "0%", "stop-color": "#ffca55" }),
    createSvgElement("stop", { offset: "100%", "stop-color": "#b86411" })
  );
  gradients[3].append(
    createSvgElement("stop", { offset: "0%", "stop-color": "#d59b52" }),
    createSvgElement("stop", { offset: "55%", "stop-color": "#9e5c1f" }),
    createSvgElement("stop", { offset: "100%", "stop-color": "#744015" })
  );

  elements.boardArt.append(defs);
}

function getPointOnCubicPath(start, end, bend, t) {
  const p0 = start;
  const p1 = { x: start.x + bend * 6, y: start.y + 8 };
  const p2 = { x: (start.x + end.x) / 2 + bend * 7, y: (start.y + end.y) / 2 - 10 };
  const p3 = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

  const first = cubicInterpolate(p0, p1, p2, p3, Math.min(t, 0.5) * 2);
  const q0 = p3;
  const q1 = { x: (start.x + end.x) / 2 - bend * 7, y: (start.y + end.y) / 2 + 10 };
  const q2 = { x: end.x - bend * 5, y: end.y - 7 };
  const q3 = end;
  const second = cubicInterpolate(q0, q1, q2, q3, Math.max(0, t - 0.5) * 2);

  return t <= 0.5 ? first : second;
}

function cubicInterpolate(p0, p1, p2, p3, t) {
  const inv = 1 - t;
  const x =
    inv * inv * inv * p0.x +
    3 * inv * inv * t * p1.x +
    3 * inv * t * t * p2.x +
    t * t * t * p3.x;
  const y =
    inv * inv * inv * p0.y +
    3 * inv * inv * t * p1.y +
    3 * inv * t * t * p2.y +
    t * t * t * p3.y;

  return { x, y };
}
