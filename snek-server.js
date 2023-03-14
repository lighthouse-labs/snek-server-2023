const SNEK_PORT = 50541;
const BASE_SNEK_SIZE = 4;
const GRID_WIDTH = 80;
const GRID_HEIGHT = 40;
const MIN_FOOD = 3;

const EventEmitter = require("events");
const net = require("net");
const { v4: uuidv4 } = require("uuid");

const snekEvents = new EventEmitter();

const grid = {
  sneks: {},
  foods: [],
  width: GRID_WIDTH,
  height: GRID_HEIGHT,
};

const generateSnekHelpers = (grid, snekEvents) => {
  const helpers = {};

  const generateRandomPosition = (isNewSnek) => {
    const width = isNewSnek ? GRID_WIDTH - (BASE_SNEK_SIZE + 1) : GRID_WIDTH;
    const height = GRID_HEIGHT;

    const x = Math.round(Math.random() * width);
    const y = Math.round(Math.random() * height);

    return [x, y];
  };

  const checkGridPointStatus = (coords) => {
    // Check for boundary
    if (
      coords[0] < 0 ||
      coords[1] < 0 ||
      coords[0] > grid.width - 1 ||
      coords[1] > grid.height - 1
    ) {
      return { type: "oob", coords };
    }
    // Check for food
    for (const food of grid.foods) {
      if (coords[0] === food[0] && coords[1] === food[1]) {
        return { type: "food", coords };
      }
    }
    // Check for other sneks
    for (const snekId in grid.sneks) {
      const snek = grid.sneks[snekId];
      const snekBody = snek.body;

      for (const part of snekBody) {
        if (coords[0] === part[0] && coords[1] === part[1]) {
          return { type: "body", coords };
        }
      }
    }
    return { type: "empty", coords };
  };

  const checkEmptyMultipleCoords = (listOfCoords) => {
    for (const coords of listOfCoords) {
      const status = checkGridPointStatus(coords, grid);
      if (status.type !== "empty") {
        return false;
      }
    }
    return true;
  };

  const randomColors = () => {
    const r = Math.floor(Math.random() * 200);
    const g = Math.floor(Math.random() * 200);
    const b = Math.floor(Math.random() * 200);

    const color = {
      head: `rgb(${b},${g},${r})`,
      body: `rgb(${r},${g},${b})`,
    };
    return color;
  };

  const generateSnek = () => {
    const snekId = uuidv4();
    let bodyCoords = [];
    let retries = 0;
    const maxRetries = 100;

    while (bodyCoords.length === 0 && retries < maxRetries) {
      const tempBody = [];
      const headCoords = generateRandomPosition(true);
      tempBody.push(headCoords);
      for (let i = 1; i < BASE_SNEK_SIZE + 1; i++) {
        tempBody.push([headCoords[0] + i, headCoords[1]]);
      }

      if (checkEmptyMultipleCoords(tempBody, grid)) {
        bodyCoords = [...tempBody];
      } else {
        retries++;
        console.log("Something collided with snake");
      }
    }

    if (bodyCoords.length !== 0) {
      const newSnek = {
        id: snekId,
        body: bodyCoords,
        color: randomColors(),
        message: "",
      };

      return newSnek;
    }
    return null;
  };

  const generateFood = () => {
    let retries = 0;
    const maxRetries = 100;
    let foodCoords = null;

    while (!foodCoords && retries < maxRetries) {
      const tempFoodCoords = generateRandomPosition(false);

      if (checkEmptyMultipleCoords(tempFoodCoords, grid)) {
        foodCoords = tempFoodCoords;
      } else {
        retries++;
        console.log("Something collided with food");
      }
    }

    if (foodCoords) {
      return foodCoords;
    }
    return null;
  };

  const addFood = () => {
    const food = generateFood(grid);
    if (food) {
      console.log("gen food");
      grid.foods.push(food);
    }
    return food;
  };

  helpers.addSnek = () => {
    const snek = generateSnek(grid);
    addFood();
    if (snek) {
      grid.sneks[snek.id] = snek;
    }
    return snek.id;
  };

  helpers.ensureMinFood = () => {
    const amountOfFood = grid.foods.length;

    for (let i = 0; i < MIN_FOOD - amountOfFood; i++) {
      addFood();
    }
  };

  helpers.moveSnek = (id, direction) => {
    const directions = {
      left: [-1, 0],
      right: [1, 0],
      up: [0, -1],
      down: [0, 1],
    };

    if (!Object.keys(directions).includes(direction)) {
      return { err: null };
    }
    const currentSnek = grid.sneks[id];

    const head = currentSnek.body[0];
    const newHead = [
      head[0] + directions[direction][0],
      head[1] + directions[direction][1],
    ];

    const { type, coords } = checkGridPointStatus(newHead, grid);

    if (
      newHead[0] === currentSnek.body[1][0] &&
      newHead[1] === currentSnek.body[1][1]
    ) {
      return { err: null };
    }

    if (type === "empty") {
      currentSnek.body.pop();
      currentSnek.body = [newHead, ...currentSnek.body];
      snekEvents.emit("refresh");
      return { err: null };
    }
    if (type === "food") {
      currentSnek.body = [newHead, ...currentSnek.body];
      const newFoods = grid.foods.filter(
        ([x, y]) => x !== newHead[0] || y !== newHead[1]
      );
      grid.foods = newFoods;
      addFood();
      snekEvents.emit("refresh");
      return { err: null };
    }
    delete grid.sneks[id];
    snekEvents.emit("refresh");
    return { err: "collision" };
  };

  helpers.updateMessage = (id, message) => {
    const currentSnek = grid.sneks[id];

    currentSnek.message = message;
    snekEvents.emit("refresh");

    setTimeout(() => {
      currentSnek.message = "";
      snekEvents.emit("refresh");
    }, 4000);
  };

  helpers.removeSnake = (id) => {
    delete grid.sneks[id];
    snekEvents.emit("refresh");
  };

  return helpers;
};

const helpers = generateSnekHelpers(grid, snekEvents);

const snekServer = net.createServer((connection) => {
  connection.setEncoding("utf-8");

  const snekId = helpers.addSnek();
  helpers.ensureMinFood();
  snekEvents.emit("refresh");

  connection.on("end", () => helpers.removeSnake(snekId));
  connection.on("error", () => helpers.removeSnake(snekId));
  connection.on("timeout", () => helpers.removeSnake(snekId));

  const killSnek = () => {
    helpers.removeSnake(snekId);
    connection.write("You're dead since you idled!");
    connection.end();
  };
  let snekTimer = setTimeout(killSnek, 5000);

  connection.on("data", (string) => {
    clearTimeout(snekTimer);
    snekTimer = setTimeout(killSnek, 5000);

    const moveCommand = string.slice(0, 4);
    const sayCommand = string.slice(0, 3);
    const nameCommand = string.slice(0, 4);

    console.log("data", string);
    if (moveCommand === "Move") {
      const direction = string.slice(6);
      const { err } = helpers.moveSnek(snekId, direction);
      if (err === "collision") {
        connection.write("You're dead since you collided with something!");

        connection.end();
      }
    }
    if (sayCommand === "Say") {
      const message = string.slice(5);
      helpers.updateMessage(snekId, message);
    }
    if (nameCommand === "Name") {
      const name = string.slice(6);
      helpers.updateMessage(snekId, name);
    }
  });
});

snekServer.listen(50541);

// const { Server } = require("socket.io");

// const io = new Server({
//   // options
// });

// io.on("connection", (socket) => {
//   console.log("client connected");
// });

// io.listen(SOCKET_PORT);

module.exports = { grid, snekEvents };
