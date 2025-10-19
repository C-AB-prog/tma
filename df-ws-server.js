// Minimal realtime server for Diamond Feed v1.5
// Usage:
//   npm i ws
//   node server.js
// Then open your app with ?ws=ws://localhost:8787
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8787 });

// in-memory maps
const sockets = new Map();            // ws -> { uid, following:Set }
const byUser = new Map();             // uid -> ws
const followers = new Map();          // uid -> Set(followerUid)

function send(ws, msg){ try{ ws.send(JSON.stringify(msg)); }catch(e){} }
function fanout(uids, msg){ for (const uid of uids){ const ws = byUser.get(uid); if (ws && ws.readyState===1) send(ws, msg); } }

wss.on('connection', (ws)=>{
  sockets.set(ws, { uid:null, following:new Set() });

  ws.on('message', (data)=>{
    let msg = null; try{ msg = JSON.parse(data.toString()) }catch(e){}
    if (!msg || !msg.type) return;

    if (msg.type==='hello'){
      const { uid, following=[] } = msg.payload||{};
      sockets.get(ws).uid = uid;
      sockets.get(ws).following = new Set(following);
      byUser.set(uid, ws);
      // rebuild followers reverse index
      followers.forEach(set=> set.delete(uid));
      for (const f of following){ (followers.get(f) || followers.set(f, new Set()).get(f)).add(uid); }
      return;
    }

    if (msg.type==='social:set'){
      const { uid, following=[] } = msg.payload||{};
      sockets.get(ws).following = new Set(following);
      followers.forEach(set=> set.delete(uid));
      for (const f of following){ (followers.get(f) || followers.set(f, new Set()).get(f)).add(uid); }
      return;
    }

    // Relay these events to followers of the author (plus the author)
    if (['post:new','post:boost','post:stats','pin:update','presence:ping'].includes(msg.type)){
      const metaUid = sockets.get(ws).uid;
      const recipients = new Set([metaUid]);
      const subs = followers.get(metaUid); if (subs) subs.forEach(u=> recipients.add(u));
      fanout(recipients, msg);
      return;
    }

    // default: echo to everyone
    wss.clients.forEach(client=>{ if (client!==ws && client.readyState===1) send(client, msg); });
  });

  ws.on('close', ()=>{
    const info = sockets.get(ws); if (!info) return; sockets.delete(ws); byUser.delete(info.uid);
    followers.forEach(set=> set.delete(info.uid));
  });
});

console.log('WS server on ws://localhost:8787');
