const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// Guarda as transmissões de cada sala
const rooms = new Map();


// ================================
// TESTE DO SERVIDOR
// ================================

app.get("/", (req, res) => {
  res.send("HUNT SERVER ONLINE");
});


// ================================
// SOCKET.IO
// ================================

io.on("connection", (socket) => {

  console.log("Cliente conectado:", socket.id);


  // ================================
  // ENTRAR NA SALA
  // ================================

  socket.on("join-room", (roomId) => {

    if (!roomId) {
      return;
    }

    socket.join(roomId);

    console.log(
      `${socket.id} entrou na sala ${roomId}`
    );

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        broadcaster: null
      });
    }

    const room = rooms.get(roomId);


    // Se já existe uma transmissão
    if (room.broadcaster) {

      console.log(
        "Transmissão já existente:",
        room.broadcaster
      );

      // Avisar o novo usuário
      socket.emit("stream-started", {
        broadcasterId: room.broadcaster
      });


      // Avisar o transmissor
      io.to(room.broadcaster).emit(
        "viewer-joined",
        {
          viewerId: socket.id
        }
      );
    }

  });


  // ================================
  // INICIAR TRANSMISSÃO
  // ================================

  socket.on("start-stream", (data) => {

    console.log(
      "HUNT: start-stream recebido:",
      socket.id
    );

    const roomId = data && data.roomId;

    if (!roomId) {

      console.log(
        "HUNT: roomId não informado"
      );

      return;
    }


    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        broadcaster: null
      });
    }

    const room = rooms.get(roomId);


    // Registrar transmissor
    room.broadcaster = socket.id;


    console.log(
      `HUNT: ${socket.id} está transmitindo na sala ${roomId}`
    );


    // Avisar todos os outros usuários
    socket.to(roomId).emit(
      "stream-started",
      {
        broadcasterId: socket.id
      }
    );

  });


  // ================================
  // WEBRTC OFFER
  // ================================

  socket.on("webrtc-offer", (data) => {

    if (
      !data ||
      !data.target ||
      !data.offer
    ) {

      console.log(
        "HUNT: OFFER inválida"
      );

      return;
    }


    console.log(
      "HUNT: WEBRTC OFFER:",
      socket.id,
      "->",
      data.target
    );


    io.to(data.target).emit(
      "webrtc-offer",
      {
        sender: socket.id,
        offer: data.offer
      }
    );

  });


  // ================================
  // WEBRTC ANSWER
  // ================================

  socket.on("webrtc-answer", (data) => {

    if (
      !data ||
      !data.target ||
      !data.answer
    ) {

      console.log(
        "HUNT: ANSWER inválida"
      );

      return;
    }


    console.log(
      "HUNT: WEBRTC ANSWER:",
      socket.id,
      "->",
      data.target
    );


    io.to(data.target).emit(
      "webrtc-answer",
      {
        sender: socket.id,
        answer: data.answer
      }
    );

  });


  // ================================
  // ICE CANDIDATE
  // ================================

  socket.on(
    "webrtc-ice-candidate",
    (data) => {

      if (
        !data ||
        !data.target ||
        !data.candidate
      ) {

        return;
      }


      io.to(data.target).emit(
        "webrtc-ice-candidate",
        {
          sender: socket.id,
          candidate: data.candidate
        }
      );

    }
  );


  // ================================
  // PARAR TRANSMISSÃO
  // ================================

  socket.on("stop-stream", (data) => {

    const roomId = data && data.roomId;

    if (!roomId) {
      return;
    }


    const room = rooms.get(roomId);

    if (!room) {
      return;
    }


    // Só o transmissor pode parar sua própria transmissão
    if (room.broadcaster === socket.id) {

      room.broadcaster = null;


      console.log(
        `HUNT: transmissão encerrada na sala ${roomId}`
      );


      socket.to(roomId).emit(
        "stream-stopped",
        {
          broadcasterId: socket.id
        }
      );

    }

  });


  // ================================
  // DESCONECTAR
  // ================================

  socket.on("disconnect", () => {

    console.log(
      "Cliente desconectado:",
      socket.id
    );


    for (
      const [roomId, room]
      of rooms
    ) {

      if (
        room.broadcaster === socket.id
      ) {

        room.broadcaster = null;


        socket.to(roomId).emit(
          "stream-stopped",
          {
            broadcasterId: socket.id
          }
        );


        console.log(
          `HUNT: transmissão removida da sala ${roomId}`
        );

      }

    }

  });

});


// ================================
// INICIAR SERVIDOR
// ================================

server.listen(
  PORT,
  () => {

    console.log(
      `HUNT SERVER rodando na porta ${PORT}`
    );

  }
);