const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const crypto=require('crypto');

const app=express();
app.get('/',(req,res)=>res.send('Dominó Azul multiplayer online OK'));
app.get('/health',(req,res)=>res.json({ok:true,service:'domino-azul'}));

const server=http.createServer(app);
const io=new Server(server,{cors:{origin:'*',methods:['GET','POST']}});

const rooms=new Map();

function makeCode(){let c;do{c=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(c));return c}
function deck(){let d=[];for(let a=0;a<=6;a++)for(let b=a;b<=6;b++)d.push([a,b]);return d.sort(()=>Math.random()-.5)}
function playable(t,chain){if(!chain.length)return true;let l=chain[0][0],r=chain[chain.length-1][1];return t[0]===l||t[1]===l||t[0]===r||t[1]===r}
function orient(t,n){return t[0]===n?t:[t[1],t[0]]}

function publicState(room,socketId){
 const p=room.players.find(x=>x.id===socketId);
 return {code:room.code,chain:room.chain,hand:p?p.hand:[],turn:room.turn,message:room.players.length<2?'Aguardando o segundo jogador...':(room.turn===socketId?'Sua vez':'Vez do adversário')};
}
function broadcast(room){
 room.players.forEach(p=>io.to(p.id).emit('state',publicState(room,p.id)));
}
function finish(room,winnerId){
 io.to(room.code).emit('match_result',{winner:winnerId});
 rooms.delete(room.code);
}
io.on('connection',socket=>{
 socket.on('create_room',()=>{
   const code=makeCode(); const room={code,players:[{id:socket.id,hand:[]}],chain:[],pile:[],turn:null};
   rooms.set(code,room); socket.join(code); socket.data.room=code;
   socket.emit('room_created',{code}); broadcast(room);
 });
 socket.on('join_room',({code})=>{
   const room=rooms.get(String(code||'').toUpperCase());
   if(!room){socket.emit('error_message',{message:'Sala não encontrada.'});return}
   if(room.players.length>=2){socket.emit('error_message',{message:'Sala cheia.'});return}
   room.players.push({id:socket.id,hand:[]});socket.join(room.code);socket.data.room=room.code;
   socket.emit('room_joined',{code:room.code,message:'Você entrou na sala.'});
   const d=deck();room.players.forEach(p=>p.hand=d.splice(0,7));room.pile=d;
   room.turn=room.players[0].id;
   io.to(room.code).emit('room_ready',{code:room.code});
   broadcast(room);
 });
 socket.on('play',({side,index})=>{
   const room=rooms.get(socket.data.room);if(!room||room.players.length<2||room.turn!==socket.id)return;
   const p=room.players.find(x=>x.id===socket.id);if(!p||index<0||index>=p.hand.length)return;
   const t=p.hand[index];
   if(!playable(t,room.chain)){socket.emit('error_message',{message:'Essa peça não pode ser jogada.'});return}
   if(!room.chain.length)room.chain=[t];
   else if(side==='left'){const n=room.chain[0][0];if(!playable(t,room.chain)){return}room.chain.unshift(orient(t,n))}
   else {const n=room.chain[room.chain.length-1][1];if(!playable(t,room.chain)){return}room.chain.push(orient(t,n))}
   p.hand.splice(index,1);
   if(!p.hand.length){finish(room,socket.id);return}
   room.turn=room.players.find(x=>x.id!==socket.id).id;broadcast(room);
 });
 socket.on('draw',()=>{
   const room=rooms.get(socket.data.room);if(!room||room.turn!==socket.id)return;
   const p=room.players.find(x=>x.id===socket.id);
   if(room.pile.length){p.hand.push(room.pile.pop());broadcast(room);return}
   socket.emit('error_message',{message:'Não há mais peças para comprar. Você pode passar.'});
 });
 socket.on('pass',()=>{
   const room=rooms.get(socket.data.room);if(!room||room.turn!==socket.id)return;
   const other=room.players.find(x=>x.id!==socket.id);if(!other)return;
   room.turn=other.id;broadcast(room);
 });
 socket.on('leave_room',()=>{
   const room=rooms.get(socket.data.room);if(room){room.players=room.players.filter(p=>p.id!==socket.id);if(room.players.length)io.to(room.players[0].id).emit('opponent_left');else rooms.delete(room.code)}
   socket.leave(socket.data.room);socket.data.room=null;
 });
 socket.on('disconnect',()=>{
   const code=socket.data.room,room=rooms.get(code);if(!room)return;
   room.players=room.players.filter(p=>p.id!==socket.id);
   if(room.players.length)io.to(room.players[0].id).emit('opponent_left');else rooms.delete(code);
 });
});
const PORT=process.env.PORT||10000;
server.listen(PORT,'0.0.0.0',()=>console.log('Dominó Azul server on '+PORT));
