import test from "node:test";
import assert from "node:assert/strict";

import { createRoomStore, normalizeRoomCode } from "../src/rooms.js";

test("creates and joins rooms with up to four players", () => {
  const store = createRoomStore();
  const room = store.createRoom("a", "Asha");

  store.joinRoom(room.code, "b", "Rohan");
  store.joinRoom(room.code, "c", "Meera");
  store.joinRoom(room.code, "d", "Kabir");

  assert.equal(room.players.length, 4);
  assert.throws(() => store.joinRoom(room.code, "e", "Nia"), /already has 4 players/);
});

test("host can start and only active player can roll", () => {
  const store = createRoomStore();
  const room = store.createRoom("a", "Asha");
  store.joinRoom(room.code, "b", "Rohan");
  store.startRoom(room.code, "a");

  assert.equal(room.status, "playing");
  assert.throws(() => store.rollForRoom(room.code, "b", 0.33), /Wait for your turn/);

  store.rollForRoom(room.code, "a", 0.33);
  assert.equal(room.game.players[0].position, 3);
});

test("only host can start or reset", () => {
  const store = createRoomStore();
  const room = store.createRoom("a", "Asha");
  store.joinRoom(room.code, "b", "Rohan");

  assert.throws(() => store.startRoom(room.code, "b"), /Only the host/);
  store.startRoom(room.code, "a");
  assert.throws(() => store.resetRoom(room.code, "b"), /Only the host/);
});

test("normalizes room codes", () => {
  assert.equal(normalizeRoomCode(" ab-c12 "), "ABC12");
});
