const HTTP_PORT = 8081;

const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");
const { grid, snekEvents } = require("./snek-server");

const httpServer = http.createServer((req, res) => {
  const file = fs.readFileSync("./index.html");
  res.writeHead(200, {
    "Content-Type": "text/html",
  });

  res.end(file);
});

const io = new Server(httpServer);

io.on("connection", (socket) => {
  console.log("client connected");
  socket.emit("grid", grid);
});

snekEvents.on("refresh", () => {
  io.emit("grid", grid);
});

httpServer.listen(HTTP_PORT);
