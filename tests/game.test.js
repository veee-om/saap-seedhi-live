import test from "node:test";
import assert from "node:assert/strict";

import { buildBoardCells, createGame, createLocalGame, rollTurn } from "../src/game.js";

test("creates a local game with two to four players", () => {
  const game = createLocalGame(["Asha", "Rohan", "Meera"]);

  assert.equal(game.status, "playing");
  assert.equal(game.players.length, 3);
  assert.equal(game.players[2].name, "Meera");
  assert.equal(game.players[2].token, "C");
});

test("creates a live game with socket player ids", () => {
  const game = createGame([
    { id: "socket-a", name: "Asha" },
    { id: "socket-b", name: "Rohan" }
  ]);

  assert.equal(game.players[0].id, "socket-a");
  assert.equal(game.players[1].id, "socket-b");
});

test("rejects invalid player counts", () => {
  assert.throws(() => createLocalGame(["Solo"]), /Choose between 2 and 4 players/);
  assert.throws(
    () => createLocalGame(["A", "B", "C", "D", "E"]),
    /Choose between 2 and 4 players/
  );
});

test("moves the active player forward and passes the turn", () => {
  const game = createLocalGame(["Asha", "Rohan"]);
  const nextGame = rollTurn(game, "player-1", 0.33);

  assert.equal(nextGame.players[0].position, 3);
  assert.equal(nextGame.currentTurn, 1);
  assert.equal(nextGame.lastRoll.dice, 2);
});

test("blocks rolls from players whose turn has not arrived", () => {
  const game = createLocalGame(["Asha", "Rohan"]);
  assert.throws(() => rollTurn(game, "player-2", 0.33), /Wait for your turn/);
});

test("grants another turn on a roll of six", () => {
  const game = createLocalGame(["Asha", "Rohan", "Meera"]);
  const nextGame = rollTurn(game, "player-1", 0.99);

  assert.equal(nextGame.players[0].position, 7);
  assert.equal(nextGame.currentTurn, 0);
  assert.equal(nextGame.lastRoll.keepsTurn, true);
});

test("applies ladders and snakes", () => {
  const game = createLocalGame(["Asha", "Rohan"]);
  const ladderGame = rollTurn(game, "player-1", 0.34);

  assert.equal(ladderGame.players[0].position, 14);
  assert.equal(ladderGame.lastRoll.movementType, "ladder");

  const snakeReady = {
    ...ladderGame,
    currentTurn: 0,
    players: ladderGame.players.map((player, index) =>
      index === 0 ? { ...player, position: 16 } : player
    )
  };
  const snakeGame = rollTurn(snakeReady, "player-1", 0);

  assert.equal(snakeGame.players[0].position, 7);
  assert.equal(snakeGame.lastRoll.movementType, "snake");
});

test("requires an exact roll to finish", () => {
  const game = createLocalGame(["Asha", "Rohan"]);
  const overshootReady = {
    ...game,
    players: game.players.map((player, index) =>
      index === 0 ? { ...player, position: 98 } : player
    )
  };
  const overshootGame = rollTurn(overshootReady, "player-1", 0.66);

  assert.equal(overshootGame.players[0].position, 98);

  const winningReady = {
    ...game,
    players: game.players.map((player, index) =>
      index === 0 ? { ...player, position: 94 } : player
    )
  };
  const winningGame = rollTurn(winningReady, "player-1", 0.99);

  assert.equal(winningGame.players[0].position, 100);
  assert.equal(winningGame.status, "finished");
  assert.equal(winningGame.winnerId, "player-1");
});

test("builds a 10 by 10 serpentine board", () => {
  const cells = buildBoardCells();
  const start = cells.find((cell) => cell.value === 1);
  const end = cells.find((cell) => cell.value === 100);

  assert.equal(cells.length, 100);
  assert.deepEqual(start, { value: 1, row: 0, column: 0, destination: null });
  assert.deepEqual(end, { value: 100, row: 9, column: 0, destination: null });
});
