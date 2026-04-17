import { MAX_PLAYERS, MIN_PLAYERS, createGame, normalizePlayerName, rollTurn } from "./game.js";

export const ROOM_CODE_LENGTH = 5;

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createRoomStore() {
  const rooms = new Map();

  function createRoom(socketId, playerName) {
    const code = createUniqueRoomCode(rooms);
    const player = createPlayer(socketId, playerName, 0, true);
    const room = {
      code,
      hostId: socketId,
      status: "lobby",
      players: [player],
      game: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      message: `${player.name} created the room.`
    };

    rooms.set(code, room);
    return room;
  }

  function joinRoom(code, socketId, playerName) {
    const room = rooms.get(normalizeRoomCode(code));
    if (!room) {
      throw new Error("Room not found.");
    }

    const existing = room.players.find((player) => player.id === socketId);
    if (existing) {
      existing.connected = true;
      existing.name = normalizePlayerName(playerName, existing.name);
      touch(room, `${existing.name} rejoined.`);
      return room;
    }

    if (room.players.length >= MAX_PLAYERS) {
      throw new Error("This room already has 4 players.");
    }

    if (room.status !== "lobby") {
      throw new Error("This match already started.");
    }

    const player = createPlayer(socketId, playerName, room.players.length, false);
    room.players.push(player);
    touch(room, `${player.name} joined the room.`);
    return room;
  }

  function startRoom(code, socketId) {
    const room = requireRoom(rooms, code);
    requireHost(room, socketId);

    if (room.players.length < MIN_PLAYERS) {
      throw new Error("Need at least 2 players to start.");
    }

    room.game = createGame(room.players);
    room.status = "playing";
    touch(room, "The match has started.");
    return room;
  }

  function rollForRoom(code, socketId, randomValue = Math.random()) {
    const room = requireRoom(rooms, code);
    if (room.status !== "playing" || !room.game) {
      throw new Error("Start the match before rolling.");
    }

    room.game = rollTurn(room.game, socketId, randomValue);
    room.status = room.game.status === "finished" ? "finished" : "playing";
    touch(room, describeLastRoll(room));
    return room;
  }

  function resetRoom(code, socketId) {
    const room = requireRoom(rooms, code);
    requireHost(room, socketId);

    room.game = null;
    room.status = "lobby";
    room.players.forEach((player, index) => {
      player.slot = index;
    });
    touch(room, "Back in the lobby for another round.");
    return room;
  }

  function disconnect(socketId) {
    const changedRooms = [];

    for (const room of rooms.values()) {
      const player = room.players.find((entry) => entry.id === socketId);
      if (!player) {
        continue;
      }

      player.connected = false;
      if (room.status === "lobby") {
        room.players = room.players.filter((entry) => entry.id !== socketId);
      }

      if (room.players.length === 0 || room.players.every((entry) => !entry.connected)) {
        rooms.delete(room.code);
        continue;
      }

      if (room.hostId === socketId) {
        const nextHost = room.players.find((entry) => entry.connected) || room.players[0];
        room.hostId = nextHost.id;
        room.players.forEach((entry) => {
          entry.host = entry.id === room.hostId;
        });
      }

      touch(room, `${player.name} left the room.`);
      changedRooms.push(room);
    }

    return changedRooms;
  }

  return {
    rooms,
    createRoom,
    joinRoom,
    startRoom,
    rollForRoom,
    resetRoom,
    disconnect,
    getRoom: (code) => rooms.get(normalizeRoomCode(code)) || null
  };
}

export function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    message: room.message,
    updatedAt: room.updatedAt,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      token: player.token,
      color: player.color,
      connected: player.connected,
      host: player.id === room.hostId
    })),
    game: room.game
  };
}

export function normalizeRoomCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

function createPlayer(id, name, slot, host) {
  return {
    id,
    name: normalizePlayerName(name, `Player ${slot + 1}`),
    token: ["A", "B", "C", "D"][slot],
    color: ["sun", "leaf", "berry", "sky"][slot],
    connected: true,
    host
  };
}

function createUniqueRoomCode(rooms) {
  let code = makeRoomCode();
  while (rooms.has(code)) {
    code = makeRoomCode();
  }
  return code;
}

function makeRoomCode() {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function requireRoom(rooms, code) {
  const room = rooms.get(normalizeRoomCode(code));
  if (!room) {
    throw new Error("Room not found.");
  }
  return room;
}

function requireHost(room, socketId) {
  if (room.hostId !== socketId) {
    throw new Error("Only the host can do that.");
  }
}

function touch(room, message) {
  room.message = message;
  room.updatedAt = Date.now();
}

function describeLastRoll(room) {
  const roll = room.game.lastRoll;
  const player = room.game.players.find((entry) => entry.id === roll.playerId);
  const actor = player?.name ?? "A player";

  if (roll.attempted > 100) {
    return `${actor} rolled ${roll.dice} and stayed on ${roll.from}.`;
  }

  if (roll.movementType === "ladder") {
    return `${actor} rolled ${roll.dice} and climbed to ${roll.to}.`;
  }

  if (roll.movementType === "snake") {
    return `${actor} rolled ${roll.dice} and slid to ${roll.to}.`;
  }

  if (room.game.status === "finished") {
    return `${actor} reached 100 and won the match.`;
  }

  return `${actor} rolled ${roll.dice} and moved to ${roll.to}.`;
}
