const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('VOID Chat Server Running');
});

const wss = new WebSocket.Server({ server });

// rooms = { roomCode: Set of { ws, username } }
const rooms = {};

function getRoomClients(room) {
  return rooms[room] || new Set();
}

function broadcast(room, data, excludeWs = null) {
  const clients = getRoomClients(room);
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

function getRoomOnlineCount(room) {
  return getRoomClients(room).size;
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentUser = null;

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.type === 'join') {
      const room = String(data.room || '').trim().toLowerCase();
      const user = String(data.user || 'anonymous').trim().slice(0, 24);

      if (!room) return;

      currentRoom = room;
      currentUser = user;

      if (!rooms[room]) rooms[room] = new Set();
      rooms[room].add({ ws, username: user });

      // Tell everyone else this user joined
      broadcast(room, { type: 'join', user }, ws);

      // Send online count to the new user
      ws.send(JSON.stringify({ type: 'online', count: getRoomOnlineCount(room) }));

      // Send online count update to everyone
      broadcast(room, { type: 'online', count: getRoomOnlineCount(room) });

    } else if (data.type === 'msg') {
      if (!currentRoom) return;
      const text = String(data.text || '').trim().slice(0, 2000);
      if (!text) return;
      broadcast(currentRoom, { type: 'msg', user: currentUser, text }, ws);

    } else if (data.type === 'img') {
      if (!currentRoom) return;
      const imgData = String(data.data || '');
      if (!imgData) return;
      broadcast(currentRoom, { type: 'img', user: currentUser, data: imgData }, ws);

    } else if (data.type === 'typing') {
      if (!currentRoom) return;
      broadcast(currentRoom, { type: 'typing', user: currentUser }, ws);

    } else if (data.type === 'stop_typing') {
      if (!currentRoom) return;
      broadcast(currentRoom, { type: 'stop_typing', user: currentUser }, ws);
    }
  });

  ws.on('close', () => {
    if (!currentRoom || !rooms[currentRoom]) return;

    // Remove this client from the room
    for (const client of rooms[currentRoom]) {
      if (client.ws === ws) {
        rooms[currentRoom].delete(client);
        break;
      }
    }

    // Clean up empty rooms
    if (rooms[currentRoom].size === 0) {
      delete rooms[currentRoom];
    } else {
      broadcast(currentRoom, { type: 'leave', user: currentUser });
      broadcast(currentRoom, { type: 'online', count: getRoomOnlineCount(currentRoom) });
    }
  });

  ws.on('error', () => ws.terminate());
});

server.listen(PORT, () => {
  console.log(`VOID Chat server running on port ${PORT}`);
});
