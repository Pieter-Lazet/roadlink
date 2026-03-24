// server.js
// Change PORT for production. Use a reverse proxy (nginx) with wss:// for HTTPS.

const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_RIDERS = 6;

// sessions: Map<sessionCode, Map<riderId, ws>>
const sessions = new Map();

// wsToRider: Map<ws, { session, riderId }> — for cleanup on disconnect
const wsToRider = new Map();

const wss = new WebSocketServer({ port: PORT });

console.log(`[RoadLink Server] Listening on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.error('[RoadLink Server] Invalid JSON received');
      return;
    }

    switch (msg.type) {
      case 'join':
        handleJoin(ws, msg);
        break;
      case 'offer':
        handleForward(ws, msg, 'offer');
        break;
      case 'answer':
        handleForward(ws, msg, 'answer');
        break;
      case 'ice':
        handleForward(ws, msg, 'ice');
        break;
      case 'transmitting':
        handleTransmitting(ws, msg);
        break;
      case 'leave':
        handleLeave(ws, msg.session, msg.riderId);
        break;
      default:
        console.warn(`[RoadLink Server] Unknown message type: ${msg.type}`);
    }
  });

  ws.on('close', () => {
    const info = wsToRider.get(ws);
    if (info) {
      handleLeave(ws, info.session, info.riderId);
    }
  });

  ws.on('error', (err) => {
    console.error('[RoadLink Server] WebSocket error:', err.message);
  });
});

function send(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function handleJoin(ws, msg) {
  const { session, riderId } = msg;

  if (!session || !riderId) {
    send(ws, { type: 'error', message: 'Ongeldige join opdracht.' });
    return;
  }

  const sessionCode = session.toUpperCase();

  if (!sessions.has(sessionCode)) {
    sessions.set(sessionCode, new Map());
  }

  const room = sessions.get(sessionCode);

  if (room.size >= MAX_RIDERS) {
    send(ws, { type: 'error', message: 'Sessie is vol (max 6 rijders)' });
    ws.close();
    return;
  }

  // If rider already in session (reconnect), remove old entry
  if (room.has(riderId)) {
    room.delete(riderId);
  }

  room.set(riderId, ws);
  wsToRider.set(ws, { session: sessionCode, riderId });

  const existingRiders = [...room.keys()].filter(id => id !== riderId);

  console.log(`[RoadLink Server] Rider ${riderId} joined session ${sessionCode} (${room.size}/${MAX_RIDERS} riders)`);

  // Confirm join to the joining rider, send list of existing riders
  send(ws, {
    type: 'joined',
    session: sessionCode,
    riderId,
    existingRiders
  });

  // Notify all other riders that a new rider joined
  room.forEach((riderWs, id) => {
    if (id !== riderId) {
      send(riderWs, { type: 'rider-joined', riderId });
    }
  });
}

function handleForward(ws, msg, type) {
  const { to, from, sdp, candidate } = msg;

  const info = wsToRider.get(ws);
  if (!info) return;

  const room = sessions.get(info.session);
  if (!room) return;

  const targetWs = room.get(to);
  if (!targetWs) {
    console.warn(`[RoadLink Server] Target rider ${to} not found in session ${info.session}`);
    return;
  }

  if (type === 'offer') {
    console.log(`[RoadLink Server] Forwarding offer from ${from || info.riderId} to ${to}`);
    send(targetWs, { type: 'offer', from: from || info.riderId, sdp });
  } else if (type === 'answer') {
    console.log(`[RoadLink Server] Forwarding answer from ${from || info.riderId} to ${to}`);
    send(targetWs, { type: 'answer', from: from || info.riderId, sdp });
  } else if (type === 'ice') {
    send(targetWs, { type: 'ice', from: from || info.riderId, candidate });
  }
}

function handleTransmitting(ws, msg) {
  const { session, riderId, active } = msg;
  const sessionCode = session ? session.toUpperCase() : null;

  if (!sessionCode) return;

  const room = sessions.get(sessionCode);
  if (!room) return;

  room.forEach((riderWs, id) => {
    if (id !== riderId) {
      send(riderWs, { type: 'transmitting', riderId, active });
    }
  });
}

function handleLeave(ws, session, riderId) {
  if (!session || !riderId) return;

  const sessionCode = session.toUpperCase();
  const room = sessions.get(sessionCode);

  if (!room) return;

  if (!room.has(riderId)) return;

  room.delete(riderId);
  wsToRider.delete(ws);

  console.log(`[RoadLink Server] Rider ${riderId} left session ${sessionCode} (${room.size}/${MAX_RIDERS} riders)`);

  // Notify remaining riders
  room.forEach((riderWs) => {
    send(riderWs, { type: 'rider-left', riderId });
  });

  // Clean up empty sessions
  if (room.size === 0) {
    sessions.delete(sessionCode);
    console.log(`[RoadLink Server] Session ${sessionCode} closed (empty)`);
  }
}
