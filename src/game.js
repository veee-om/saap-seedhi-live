export const BOARD_SIZE = 100;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const STARTING_POSITION = 1;

export const TRANSPORTS = {
  4: 14,
  9: 31,
  17: 7,
  20: 38,
  28: 84,
  40: 59,
  51: 67,
  54: 34,
  62: 19,
  63: 81,
  64: 60,
  71: 91,
  87: 24,
  93: 73,
  95: 75,
  99: 78
};

const PLAYER_COLORS = ["sun", "leaf", "berry", "sky"];
const PLAYER_TOKENS = ["A", "B", "C", "D"];

export function createGame(playerEntries) {
  if (!Array.isArray(playerEntries)) {
    throw new Error("Player list is required.");
  }

  const cleanedPlayers = playerEntries
    .map((player, index) => ({
      id: String(player?.id || `player-${index + 1}`),
      name: normalizePlayerName(player?.name, `Player ${index + 1}`)
    }))
    .filter((player) => player.name);

  if (cleanedPlayers.length < MIN_PLAYERS || cleanedPlayers.length > MAX_PLAYERS) {
    throw new Error(`Choose between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`);
  }

  return {
    status: "playing",
    players: cleanedPlayers.map((player, index) => ({
      ...player,
      position: STARTING_POSITION,
      token: PLAYER_TOKENS[index],
      color: PLAYER_COLORS[index]
    })),
    currentTurn: 0,
    lastRoll: null,
    winnerId: null
  };
}

export function createLocalGame(playerNames) {
  return createGame(
    playerNames.map((name, index) => ({
      id: `player-${index + 1}`,
      name
    }))
  );
}

export function rollTurn(gameState, playerId, randomValue = Math.random()) {
  if (gameState.status === "finished") {
    throw new Error("This game is already finished.");
  }

  const player = gameState.players[gameState.currentTurn];
  if (player.id !== playerId) {
    throw new Error("Wait for your turn.");
  }

  const dice = Math.max(1, Math.min(6, Math.floor(randomValue * 6) + 1));
  const attemptedPosition = player.position + dice;
  const landedPosition = attemptedPosition <= BOARD_SIZE ? attemptedPosition : player.position;
  const transportTarget = TRANSPORTS[landedPosition] ?? landedPosition;
  const movementType =
    transportTarget > landedPosition ? "ladder" : transportTarget < landedPosition ? "snake" : "move";
  const didWin = transportTarget === BOARD_SIZE;
  const keepsTurn = dice === 6 && !didWin;

  const players = gameState.players.map((entry, index) =>
    index === gameState.currentTurn
      ? {
          ...entry,
          position: transportTarget
        }
      : entry
  );

  return {
    ...gameState,
    players,
    currentTurn: didWin
      ? gameState.currentTurn
      : keepsTurn
        ? gameState.currentTurn
        : (gameState.currentTurn + 1) % gameState.players.length,
    lastRoll: {
      playerId: player.id,
      dice,
      from: player.position,
      to: transportTarget,
      attempted: attemptedPosition,
      movementType,
      keepsTurn
    },
    status: didWin ? "finished" : "playing",
    winnerId: didWin ? player.id : null
  };
}

export function buildBoardCells(size = BOARD_SIZE) {
  return Array.from({ length: size }, (_, index) => {
    const value = size - index;
    const row = Math.floor((value - 1) / 10);
    const columnOffset = (value - 1) % 10;
    const column = row % 2 === 0 ? columnOffset : 9 - columnOffset;

    return {
      value,
      row,
      column,
      destination: TRANSPORTS[value] ?? null
    };
  });
}

export function normalizePlayerName(name, fallback = "Player") {
  const trimmedName = String(name || "").trim().replace(/\s+/g, " ");
  return (trimmedName || fallback).slice(0, 20);
}
