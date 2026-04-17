import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

import { createRoomStore, publicRoom } from "./src/rooms.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});
const store = createRoomStore();

app.use(express.static(__dirname));

app.get("/health", (_request, response) => {
  response.json({ ok: true, game: "Snake Ladder Live" });
});

app.get("*", (request, response, next) => {
  if (request.path.startsWith("/socket.io")) {
    next();
    return;
  }

  response.sendFile(path.join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  socket.on("room:create", (payload = {}, acknowledge) => {
    handleAction(socket, acknowledge, () => {
      const room = store.createRoom(socket.id, payload.name);
      socket.data.roomCode = room.code;
      socket.join(room.code);
      return room;
    });
  });

  socket.on("room:join", (payload = {}, acknowledge) => {
    handleAction(socket, acknowledge, () => {
      const room = store.joinRoom(payload.code, socket.id, payload.name);
      socket.data.roomCode = room.code;
      socket.join(room.code);
      return room;
    });
  });

  socket.on("room:start", (_payload, acknowledge) => {
    handleAction(socket, acknowledge, () => store.startRoom(socket.data.roomCode, socket.id));
  });

  socket.on("room:roll", (_payload, acknowledge) => {
    handleAction(socket, acknowledge, () => store.rollForRoom(socket.data.roomCode, socket.id));
  });

  socket.on("room:reset", (_payload, acknowledge) => {
    handleAction(socket, acknowledge, () => store.resetRoom(socket.data.roomCode, socket.id));
  });

  socket.on("disconnect", () => {
    const changedRooms = store.disconnect(socket.id);
    changedRooms.forEach((room) => broadcastRoom(room));
  });
});

server.listen(PORT, () => {
  console.log(`Snake Ladder Live is running on http://localhost:${PORT}`);
});

function handleAction(socket, acknowledge, action) {
  try {
    const room = action();
    const payload = publicRoom(room);
    acknowledge?.({ ok: true, room: payload, playerId: socket.id });
    broadcastRoom(room);
  } catch (error) {
    acknowledge?.({ ok: false, error: error.message });
  }
}

function broadcastRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
