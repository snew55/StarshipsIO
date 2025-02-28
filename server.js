import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from "socket.io";

// Express initializes app to be a function handler that can supply to an HTTP server
const app = express();
const server = createServer(app);
const io = new Server(server); // Initialize a new instance of socket.io by passing the server (the HTTP server) object 

const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(express.static(__dirname));

// global variables
let players = {};
let asteroids = [];
let collectables = [];
let collectableTypes = ["ammo", "health", "boost"];
let bullets = [];

let width = 5000;
let height = 5000;
let asteroidMass = 0;
let asteroidMassTarget = 10000;
let asteroidCountTarget = 150;
let collectableCountTarget = 300;
let aiCount = 0;
let aiTarget = 0;

// define a route handler / that gets called when we hit website home
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'html/index.html'));
});

// Define a route handler for the game page
app.get('/game', (req, res) => {
  res.sendFile(join(__dirname, 'html/game.html'));
});
app.get('/audio-player', (req, res) => {
  res.sendFile(join(__dirname, 'html/audio-player.html'));
});

// Then listen on the connection event for incoming sockets and log it to the console
io.on('connection', (socket) => {
  console.log("user " + socket.id + " connected")

  //When the client connects it sends their ship which is linked to their id.
  socket.on('newClient', (player) => {
    player.id = socket.id;
    players[socket.id] = player;
    socket.emit("updateID", socket.id);
  });

  //When the user wants to update their player on the server it sends updatePlayer
  socket.on("updatePlayer", async (id, ship) => {
    players[id] = ship
    delete players[null];
  });
  socket.on("updateAsteroid", async (asteroid, index) => {
    asteroids[index] = asteroid;
  });
  socket.on("updateCollectables", async (piece, index) => {
    collectables[index] = piece;
  });
  socket.on("removeCollectable", async (index) => {
    collectables.splice(index, 1);
  });
  socket.on("makeBullet", async (bx, by, bvelocityX, bvelocityY, bdamage, bid) => makeBullet(bx, by, bvelocityX, bvelocityY, bdamage, bid));
  function makeBullet(bx, by, bvelocityX, bvelocityY, bdamage, bid) {
    bullets.push({
      x: bx,
      y: by,
      velocityX: bvelocityX,
      velocityY: bvelocityY,
      updatesLeft: 50,
      damage: bdamage,
      id: bid,
    });
  }

  //Remove player from list of players when they disconnect.
  socket.on('disconnect', () => {
    console.log("user " + socket.id + " disconnected");
    try {
      delete players[socket.id];
    } catch (error) {
      // Ignoring the start screen players
    }
  });
});

function makeCollectables() {
  while (collectables.length < 300) {
    const type = Math.round(Math.random() * 100);

    let collectableType = collectableTypes[0];
    if (type < 15) collectableType = collectableTypes[1];
    if (type < 5) collectableType = collectableTypes[2];

    collectables.push({
      x: Math.random() * width,
      y: Math.random() * height,
      amount: 1 + Math.round(Math.random() * 2),
      type: collectableType,
    });
  }
  while (collectables.length > collectableCountTarget) {
    const toDelete = Math.round(Math.random() * collectables.length);
    collectables.splice(toDelete, 1);
  }
  io.emit("collectables", collectables);
}
setInterval(makeCollectables, 128);

function generateAsteroidShape(size) {
  const points = [];
  const sides = Math.floor(Math.random() * 8) + 12;

  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const radius = size / 2 + (Math.random() - 0.5) * (size / 3); // Slight variation in radius
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    points.push([x, y]);
  }
  return points;
}
function makeAsteroids() {
  while (asteroidMass < asteroidMassTarget && asteroids.length < asteroidCountTarget) {
    const size = 50 + (Math.random() * 150)
    const health = 1 + (Math.random() * (size / 20));
    const speedMultiplier = 4 - ((size / 50) * 2);
    let x, y;
    let validPosition = false;

    for(let attempts = 0; attempts < 5 && !validPosition; attempts ++){
      x = Math.random() * width;
      y = Math.random() * height;

      validPosition = true;
      Object.values(players).forEach(player => {
        validPosition = Math.sqrt((x - player.x) ** 2 + (y - player.y) ** 2) > 500;
        if(!validPosition){
          return;
        }
      });
    }

    asteroids.push({
      x: x,
      y: y,
      velocityX: (Math.random() - 0.5) * speedMultiplier,
      velocityY: (Math.random() - 0.5) * speedMultiplier,
      size: size,
      health: health,
      angle: Math.random() * 360,
      shape: generateAsteroidShape(size),
      angleVelocity: (Math.random() - 0.5),
      collisionUpdatesCooldownLeft: 0,
    });
    asteroidMass += size;
  }
}
makeAsteroids();

function updateAsteroids() {
  asteroids.forEach((asteroid, asteroidIndex) => {
    asteroid.x += asteroid.velocityX;
    asteroid.y += asteroid.velocityY;
    asteroid.angle += asteroid.angleVelocity;

    if (asteroid.collisionUpdatesCooldownLeft > 0) asteroid.collisionUpdatesCooldownLeft -= 1;

    // Wrap asteroids around the screen if they go off the edges
    if (asteroid.x < 0 - asteroid.size) asteroid.x = 5000 + asteroid.size;
    if (asteroid.x > 5000 + asteroid.size) asteroid.x = 0 - asteroid.size;
    if (asteroid.y < 0 - asteroid.size) asteroid.y = 5000 + asteroid.size;
    if (asteroid.y > 5000 + asteroid.size) asteroid.y = 0 - asteroid.size;

    // Check collisions with other asteroids
    for (let otherIndex = asteroidIndex + 1; otherIndex < asteroids.length; otherIndex++) {
      const other = asteroids[otherIndex];
      if (!other) return;
      const a = (other.x + (other.size / 2)) - (asteroid.x + (asteroid.size / 2));
      const b = (other.y + (other.size / 2)) - (asteroid.y + (asteroid.size / 2));
      const distance = Math.sqrt((a ** 2) + (b ** 2));

      // Check if the asteroids are colliding
      if (distance < (asteroid.size / 2) + (other.size / 2) && other.collisionUpdatesCooldownLeft == 0 && asteroid.collisionUpdatesCooldownLeft == 0) {
        const normalX = a / distance; // Normal vector (x-component)
        const normalY = b / distance; // Normal vector (y-component)
        const tangentX = -normalY;
        const tangentY = normalX;
        const mass1 = asteroid.size;
        const mass2 = other.size;
        // Project velocities onto the normal and tangent vectors
        const dotProductNormal1 = asteroid.velocityX * normalX + asteroid.velocityY * normalY;
        const dotProductNormal2 = other.velocityX * normalX + other.velocityY * normalY;
        const dotProductTangent1 = asteroid.velocityX * tangentX + asteroid.velocityY * tangentY;
        const dotProductTangent2 = other.velocityX * tangentX + other.velocityY * tangentY;
        // Use conservation of momentum to calculate new normal velocities
        const newDotProductNormal1 = (dotProductNormal1 * (mass1 - mass2) + 2 * mass2 * dotProductNormal2) / (mass1 + mass2);
        const newDotProductNormal2 = (dotProductNormal2 * (mass2 - mass1) + 2 * mass1 * dotProductNormal1) / (mass1 + mass2);
        // Update velocities
        asteroid.velocityX = tangentX * dotProductTangent1 + normalX * newDotProductNormal1;
        asteroid.velocityY = tangentY * dotProductTangent1 + normalY * newDotProductNormal1;
        other.velocityX = tangentX * dotProductTangent2 + normalX * newDotProductNormal2;
        other.velocityY = tangentY * dotProductTangent2 + normalY * newDotProductNormal2;
        // Slightly separate the asteroids to avoid overlap
        const overlap = ((asteroid.size / 2) + (other.size / 2)) - distance;
        asteroid.x -= normalX * overlap / 2;
        asteroid.y -= normalY * overlap / 2;
        other.x += normalX * overlap / 2;
        other.y += normalY * overlap / 2;

        asteroid.health -= 1;
        asteroid.collisionUpdatesCooldownLeft = 10;
        other.health -= 1;
        other.collisionUpdatesCooldownLeft = 10;
      }
    }

    //Handle an asteroid dying.
    if (asteroid.health <= 0 && asteroid.size <= 50) {
      //Make it drop things
      const type = Math.round(Math.random() * 10);
      let collectableType = collectableTypes[0];
      if (type == 0) collectableType = collectableTypes[1];

      collectables.push({
        x: Math.random() * width,
        y: Math.random() * height,
        amount: 5 + Math.round(Math.random() * 2),
        type: collectableType,
      });
      //Delete the asteroid
      asteroidMass -= asteroid.size;
      asteroids.splice(asteroidIndex, 1);
      if (asteroidMass < asteroidMassTarget) {
        makeAsteroids();
      }
    } else if (asteroid.health <= 0) {
      //Split the asteroid if it is bigger than 50
      const numSplits = 1 + Math.round(Math.random() * 2);
      let sizeLeft = asteroid.size;
      let healthLeft = Math.random() * (asteroid.size / 20);
      for (let i = 0; i < numSplits; i++) {
        let newSize = 25 + (Math.random() * sizeLeft / 2);
        let newHealth = Math.max(1, (newSize / sizeLeft) * healthLeft);
        const speedMultiplier = 4 - ((newSize / 100) * 2);
        asteroids.push({
          x: asteroid.x + ((Math.random() - 0.5) * asteroid.size / 2),
          y: asteroid.y + ((Math.random() - 0.5) * asteroid.size / 2),
          velocityX: 1 + (Math.random() - 0.5) * speedMultiplier,
          velocityY: 1 + (Math.random() - 0.5) * speedMultiplier,
          size: newSize,
          health: newHealth,
          angle: Math.random() * 360,
          shape: generateAsteroidShape(newSize),
          angleVelocity: (Math.random() - 0.5),
          collisionUpdatesCooldownLeft: 20,
        });
        sizeLeft -= newSize * 0.5;
        healthLeft -= newHealth;
        asteroidMass += newSize;
      }
      asteroidMass -= asteroid.size;
      asteroids.splice(asteroidIndex, 1);
    }
  });

  // Emit updated asteroid positions to all connected clients
  io.emit('asteroids', asteroids);
}
setInterval(updateAsteroids, 32);

function updateBullets() {
  bullets.forEach(bullet => {
    bullet.x += bullet.velocityX;
    bullet.y += bullet.velocityY;

    //Handle bullet collisions with asteroids
    asteroids.forEach(asteroid => {
      const a = bullet.x - (asteroid.x + (asteroid.size / 2));
      const b = bullet.y - (asteroid.y + (asteroid.size / 2));
      const distance = Math.sqrt((a ** 2) + (b ** 2));

      if (distance > 0) { // Avoid division by zero
        const gravityStrength = asteroid.size * 100; // Adjust this constant to control gravity strength
        const gravitationalPull = gravityStrength / (distance ** 2); // Gravity decreases with the square of the distance

        // Update bullet velocity
        bullet.velocityX -= (a / distance) * gravitationalPull;
        bullet.velocityY -= (b / distance) * gravitationalPull;
      }

      if (distance < asteroid.size / 2) {
        asteroid.health -= bullet.damage;
        bullet.updatesLeft = 0;

        //Increase player score for killing an asteroid
        if (asteroid.health <= 0) {
          if (!players[bullet.id]) return;
          players[bullet.id].score += Math.round(asteroid.size / 2);
        }
      }
    });
    //Handle bullet collisions with players
    Object.values(players).forEach(player => {
      const a = bullet.x - (player.x + (player.size / 2));
      const b = bullet.y - (player.y + (player.size / 2));
      const distance = Math.sqrt((a ** 2) + (b ** 2));

      if (distance > 0 && bullet.id != player.id) { // Avoid division by zero
        const gravityStrength = player.size * 100; // Adjust this constant to control gravity strength
        const gravitationalPull = gravityStrength / (distance ** 2); // Gravity decreases with the square of the distance

        // Update bullet velocity
        bullet.velocityX -= (a / distance) * gravitationalPull;
        bullet.velocityY -= (b / distance) * gravitationalPull;
      }

      if (distance < player.size / 2 && bullet.id != player.id) {
        console.log(bullet.id, player.id);
        player.health -= bullet.damage;

        if(player.health <= 0 && players[bullet.id]){
          players[bullet.id].score += player.score / 2;
          io.to(bullet.id).emit("increaseScore", player.score / 2);
        }
        bullet.updatesLeft = 0;
        io.to(player.id).emit("playerShot", bullet.damage);
      }
    });

    //Update the bullets or remove the bullets if they expired.
    if (bullet.updatesLeft > 0) {
      bullet.updatesLeft -= 1;
    } else {
      const index = bullets.indexOf(bullet);
      if (index > -1) bullets.splice(index, 1);
    }
  });
  io.emit('bullets', bullets);
}
setInterval(updateBullets, 32);

function updatePlayers() {
  io.emit('players', players);

  Object.values(players).forEach(player => {
    if(player.health <= 0){

      /*collectables.push({
        x: player.x,
        y: player.y,
        amount: player.ammo,
        type: "ammo",
      });*/

      io.to(player.id).emit("returnToTitle");
      delete players[player.id];
    }
  })
}
setInterval(updatePlayers, 16);

function makeAI() {
  while (aiCount < aiTarget) {
    const id = "ai" + Math.round(Math.random() * 1000000);
    players[id] = {
      name: "AI",
      id: id,
      x: Math.random() * width,
      y: Math.random() * height,
      velocityX: 0,
      velocityY: 0,
      angle: 0,
      size: 20,
      health: 5,
      damage: 1,
      score: 0,
      ammo: 0,
      boostLeft: 0,
    };
    aiCount += 1;
  }
}
makeAI();

function updateAI() {
  Object.values(players).forEach(player => {
    if (player.id[0] + player.id[1] !== "ai") return; //If the player isn't an AI return.

    let target = null; 
    let minDistance = 1000; //Only look at things close to it

    Object.values(players).forEach(other => { //Target players closer than 1000 first
      if (player.id !== other.id) {
        const a = (other.x + (other.size / 2)) - (player.x + (player.size / 2));
        const b = (other.y + (other.size / 2)) - (player.y + (player.size / 2));
        const distance = Math.sqrt((a ** 2) + (b ** 2));

        if (distance < minDistance) {
          minDistance = distance;
          target = { type: "player", object: other };
        }
      }
    });
    if (!target) { //If there aren't any players
      asteroids.forEach(asteroid => { //Look for asteroids
        const a = (asteroid.x + (asteroid.size / 2)) - (player.x + (player.size / 2));
        const b = (asteroid.y + (asteroid.size / 2)) - (player.y + (player.size / 2));
        const distance = Math.sqrt((a ** 2) + (b ** 2));

        if (distance < minDistance) {
          minDistance = distance;
          target = { type: "asteroid", object: asteroid };
        }
      });
    }
    if (!target) { //If no players or asteroids go for closest collectables.
      collectables.forEach(collectable => {
        const a = (collectable.x + (collectable.size / 2)) - (player.x + (player.size / 2));
        const b = (collectable.y + (collectable.size / 2)) - (player.y + (player.size / 2));
        const distance = Math.sqrt((a ** 2) + (b ** 2));

        if (distance < minDistance) {
          minDistance = distance;
          target = { type: "collectable", object: collectable };
        }
      });
    }
    if (target) { //If there is a target avoid it or pursue it. 
      let angleToTarget = Math.atan2(target.object.y - player.y, target.object.x - player.x) * (180 / Math.PI);
      if (target.type === "player" || target.type === "asteroid") {
        const angleDifference = Math.abs(Math.atan2(player.y - target.object.y, player.x - target.object.x) * (180 / Math.PI) - target.object.angle);
        const targetVector = Math.sqrt(target.object.velocityX ** 2 + target.object.velocityY ** 2);

        if (angleDifference <= 10 || Math.abs(angleDifference - 360) <= 10 && minDistance / targetVector > 50) {
          angleToTarget += player.angle > 90;

          if (Math.abs(player.velocityX) < 3) player.velocityX += Math.sin(player.angle * Math.PI / 180) * 0.01;
          if (Math.abs(player.velocityY) < 3) player.velocityY += Math.cos(player.angle * Math.PI / 180) * 0.01;
        }
      }
      if (angleToTarget <= player.angle + 10 && angleToTarget >= player.angle - 10) {
        if (Math.abs(player.velocityX) < 3) player.velocityX += Math.sin(player.angle * Math.PI / 180) * 0.01;
        if (Math.abs(player.velocityY) < 3) player.velocityY += Math.cos(player.angle * Math.PI / 180) * 0.01;
      }else {
        player.velocityX *= 0.75;
        player.velocityY *= 0.75;
      }
      player.angle += (angleToTarget - player.angle) * 0.25;
      player.x += player.velocityX;
      player.y += player.velocityY;
    }
  });
}
setInterval(updateAI, 32);

function logStuff() {
  console.log("Asteroid count: " + asteroids.length);
  console.log("Asteroid mass: " + asteroidMass)
  console.log("Collectables: " + collectables.length);
  console.log("Bullet count: " + bullets.length);
}
//setInterval(logStuff, 1000);

// Start the server
server.listen(3130, () => {
  console.log('server running at http://localhost:3130');
});