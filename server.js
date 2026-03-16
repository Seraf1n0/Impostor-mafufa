const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- Word categories ---
const categories = {
  'Animales': ['Perro', 'Gato', 'Elefante', 'Águila', 'Tiburón', 'Caballo', 'Serpiente', 'Delfín', 'León', 'Oso', 'Tortuga', 'Lobo', 'Conejo', 'Búho', 'Cebra'],
  'Comidas': ['Pizza', 'Sushi', 'Tacos', 'Hamburguesa', 'Paella', 'Lasagna', 'Ceviche', 'Empanada', 'Ramen', 'Arepa', 'Pasta', 'Ensalada', 'Curry', 'Hot Dog', 'Burrito'],
  'Países': ['Japón', 'Brasil', 'Egipto', 'Australia', 'México', 'Francia', 'India', 'Argentina', 'Canadá', 'Italia', 'Alemania', 'Rusia', 'Colombia', 'España', 'Perú'],
  'Deportes': ['Fútbol', 'Tenis', 'Natación', 'Boxeo', 'Surf', 'Baloncesto', 'Béisbol', 'Ciclismo', 'Golf', 'Karate', 'Rugby', 'Voleibol', 'Esquí', 'Atletismo', 'Esgrima'],
  'Profesiones': ['Doctor', 'Chef', 'Piloto', 'Bombero', 'Astronauta', 'Detective', 'Arquitecto', 'Veterinario', 'Músico', 'Profesor', 'Abogado', 'Ingeniero', 'Fotógrafo', 'Periodista', 'Enfermero'],
  'Películas': ['Titanic', 'Matrix', 'Avatar', 'Frozen', 'Shrek', 'Batman', 'Jurassic Park', 'Toy Story', 'Coco', 'Gladiador', 'Rocky', 'Alien', 'Up', 'Cars', 'Moana'],
  'Instrumentos': ['Guitarra', 'Piano', 'Batería', 'Violín', 'Flauta', 'Trompeta', 'Saxofón', 'Arpa', 'Bajo', 'Ukelele', 'Acordeón', 'Clarinete', 'Maracas', 'Tambor', 'Banjo'],
  'Lugares': ['Playa', 'Hospital', 'Aeropuerto', 'Biblioteca', 'Estadio', 'Museo', 'Parque', 'Supermercado', 'Cine', 'Iglesia', 'Gimnasio', 'Restaurante', 'Zoo', 'Universidad', 'Discoteca'],
  'Objetos': ['Espejo', 'Reloj', 'Paraguas', 'Tijeras', 'Vela', 'Llave', 'Almohada', 'Mochila', 'Martillo', 'Brújula', 'Escalera', 'Candado', 'Cuchara', 'Linterna', 'Silla'],
  'Frutas': ['Mango', 'Piña', 'Sandía', 'Fresa', 'Uva', 'Plátano', 'Cereza', 'Kiwi', 'Naranja', 'Manzana', 'Limón', 'Papaya', 'Durazno', 'Pera', 'Coco'],
  'Ropa': ['Sombrero', 'Bufanda', 'Corbata', 'Botas', 'Guantes', 'Vestido', 'Chaqueta', 'Pantalón', 'Camiseta', 'Falda', 'Sudadera', 'Pijama', 'Chaleco', 'Gorra', 'Sandalias'],
  'Superhéroes': ['Spider-Man', 'Batman', 'Superman', 'Wonder Woman', 'Iron Man', 'Thor', 'Hulk', 'Flash', 'Aquaman', 'Wolverine', 'Deadpool', 'Black Panther', 'Captain America', 'Ant-Man', 'Robin'],
};

// --- Game rooms ---
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateRoomCode() : code;
}

function pickWord() {
  const cats = Object.keys(categories);
  const category = cats[Math.floor(Math.random() * cats.length)];
  const words = categories[category];
  const word = words[Math.floor(Math.random() * words.length)];
  return { category, word };
}

function broadcastRoom(room) {
  const players = room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }));
  room.players.forEach(p => {
    io.to(p.id).emit('room-update', {
      code: room.code,
      players,
      state: room.state,
      minPlayers: 3,
    });
  });
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('create-room', (playerName) => {
    const code = generateRoomCode();
    const room = {
      code,
      players: [{ id: socket.id, name: playerName, isHost: true }],
      state: 'lobby',
      word: null,
      category: null,
      impostorId: null,
    };
    rooms.set(code, room);
    currentRoom = code;
    socket.emit('room-joined', { code, playerId: socket.id });
    broadcastRoom(room);
  });

  socket.on('join-room', ({ code, playerName }) => {
    const room = rooms.get(code.toUpperCase());
    if (!room) return socket.emit('error-msg', 'Sala no encontrada');
    if (room.state !== 'lobby') return socket.emit('error-msg', 'La partida ya empezó');
    if (room.players.length >= 15) return socket.emit('error-msg', 'Sala llena (máx 15)');
    if (room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
      return socket.emit('error-msg', 'Ya hay alguien con ese nombre');
    }
    room.players.push({ id: socket.id, name: playerName, isHost: false });
    currentRoom = code;
    socket.emit('room-joined', { code: room.code, playerId: socket.id });
    broadcastRoom(room);
  });

  socket.on('start-game', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;
    if (room.players.length < 3) return socket.emit('error-msg', 'Se necesitan al menos 3 jugadores');

    const { category, word } = pickWord();
    room.category = category;
    room.word = word;
    room.state = 'playing';
    const impostorIndex = Math.floor(Math.random() * room.players.length);
    room.impostorId = room.players[impostorIndex].id;

    room.players.forEach(p => {
      const isImpostor = p.id === room.impostorId;
      io.to(p.id).emit('game-started', {
        category,
        word: isImpostor ? null : word,
        isImpostor,
      });
    });
    broadcastRoom(room);
  });

  socket.on('reveal', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;

    room.state = 'reveal';
    const impostor = room.players.find(p => p.id === room.impostorId);
    room.players.forEach(p => {
      io.to(p.id).emit('game-reveal', {
        word: room.word,
        category: room.category,
        impostorName: impostor ? impostor.name : '???',
      });
    });
    broadcastRoom(room);
  });

  socket.on('new-round', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;

    room.state = 'lobby';
    room.word = null;
    room.category = null;
    room.impostorId = null;
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) {
      rooms.delete(currentRoom);
      return;
    }
    // Transfer host
    if (!room.players.some(p => p.isHost)) {
      room.players[0].isHost = true;
    }
    broadcastRoom(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
