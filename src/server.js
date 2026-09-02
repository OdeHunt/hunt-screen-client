const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  path: "/hunt-socket",

  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },

  // Permite transportar os dados da Activity
  // sem limitar demais o tamanho dos pacotes.
  maxHttpBufferSize: 10 * 1024 * 1024
});

const PORT = process.env.PORT || 3000;


// ======================================================
// SALAS
// ======================================================

const rooms = new Map();


// Estrutura de uma sala:
//
// {
//   broadcaster: socketId,
//   activityViewers: Set()
// }


// ======================================================
// FUNÇÃO PARA GARANTIR QUE A SALA EXISTE
// ======================================================

function getRoom(roomId) {

  if (!rooms.has(roomId)) {

    rooms.set(roomId, {
      broadcaster: null,
      activityViewers: new Set()
    });

  }

  return rooms.get(roomId);
}


// ======================================================
// TESTE DO SERVIDOR
// ======================================================

app.get("/", (req, res) => {

  res.send("HUNT SERVER ONLINE");

});


// ======================================================
// SOCKET.IO
// ======================================================

io.on("connection", (socket) => {

  console.log(
    "Cliente conectado:",
    socket.id
  );


  // ====================================================
  // ENTRAR NA SALA
  // ====================================================

  socket.on("join-room", (roomId) => {

    if (!roomId) {
      return;
    }

    socket.join(roomId);

    console.log(
      `${socket.id} entrou na sala ${roomId}`
    );


    const room = getRoom(roomId);


    // --------------------------------------------------
    // JÁ EXISTE UMA TRANSMISSÃO?
    // --------------------------------------------------

    if (room.broadcaster) {

      console.log(
        "Transmissão já existente:",
        room.broadcaster
      );


      // Avisar o novo usuário
      socket.emit(
        "stream-started",
        {
          broadcasterId: room.broadcaster
        }
      );


      // Avisar o transmissor
      io.to(room.broadcaster).emit(
        "viewer-joined",
        {
          viewerId: socket.id
        }
      );

    }

  });


  // ====================================================
  // INICIAR TRANSMISSÃO
  // ====================================================

  socket.on("start-stream", (data) => {

    console.log(
      "HUNT: start-stream recebido:",
      socket.id
    );


    const roomId =
      data &&
      data.roomId;


    if (!roomId) {

      console.log(
        "HUNT: roomId não informado"
      );

      return;
    }


    const room = getRoom(roomId);


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


  // ====================================================
  // WEBRTC OFFER
  // ====================================================

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


  // ====================================================
  // WEBRTC ANSWER
  // ====================================================

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


  // ====================================================
  // WEBRTC ICE CANDIDATE
  // ====================================================

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


  // ====================================================
  // ====================================================
  // NOVO SISTEMA — DISCORD ACTIVITY
  // ====================================================
  // ====================================================


  // ====================================================
  // ACTIVITY: ENTRAR COMO ESPECTADOR
  // ====================================================

  socket.on(
    "activity-join",
    (data) => {

      const roomId =
        data &&
        data.roomId;


      if (!roomId) {

        console.log(
          "HUNT ACTIVITY: roomId não informado"
        );

        return;
      }


      const room = getRoom(roomId);


      // Guardar o espectador
      room.activityViewers.add(
        socket.id
      );


      // Guardar a sala no socket
      socket.activityRoomId = roomId;


      console.log(
        `HUNT ACTIVITY: ${socket.id} entrou como espectador em ${roomId}`
      );


      // ------------------------------------------------
      // EXISTE TRANSMISSÃO?
      // ------------------------------------------------

      if (room.broadcaster) {

        socket.emit(
          "activity-stream-started",
          {
            broadcasterId:
              room.broadcaster
          }
        );


        // Avisar o transmissor que uma Activity
        // entrou para assistir.
        io.to(room.broadcaster).emit(
          "activity-viewer-joined",
          {
            viewerId: socket.id
          }
        );

      }

    }
  );


  // ====================================================
  // ACTIVITY: INICIAR STREAM DE MÍDIA
  // ====================================================

  socket.on(
    "activity-stream-start",
    (data) => {

      const roomId =
        data &&
        data.roomId;


      if (!roomId) {

        console.log(
          "HUNT ACTIVITY: roomId não informado no start"
        );

        return;
      }


      const room = rooms.get(roomId);


      if (!room) {

        console.log(
          "HUNT ACTIVITY: sala inexistente"
        );

        return;
      }


      // Apenas o transmissor pode iniciar
      // o Activity stream.
      if (
        room.broadcaster !== socket.id
      ) {

        console.log(
          "HUNT ACTIVITY: tentativa de iniciar stream por usuário que não é broadcaster:",
          socket.id
        );

        return;
      }


      console.log(
        `HUNT ACTIVITY: stream iniciado na sala ${roomId}`
      );


      // Avisar as Activities
      for (
        const viewerId
        of room.activityViewers
      ) {

        io.to(viewerId).emit(
          "activity-stream-start",
          {
            broadcasterId:
              socket.id,

            mimeType:
              data.mimeType || "video/webm"
          }
        );

      }

    }
  );


  // ====================================================
  // ACTIVITY: CHUNK DE VÍDEO
  // ====================================================

  socket.on(
    "activity-stream-chunk",
    (data) => {

      const roomId =
        data &&
        data.roomId;


      if (!roomId) {
        return;
      }


      const room =
        rooms.get(roomId);


      if (!room) {
        return;
      }


      // Somente o transmissor pode enviar
      // os dados da transmissão.
      if (
        room.broadcaster !== socket.id
      ) {

        return;
      }


      const chunk =
        data.chunk;


      if (!chunk) {
        return;
      }


      // ------------------------------------------------
      // REPASSAR PARA TODAS AS ACTIVITIES
      // ------------------------------------------------

      for (
        const viewerId
        of room.activityViewers
      ) {

        io.to(viewerId).emit(
          "activity-stream-chunk",
          {
            broadcasterId:
              socket.id,

            chunk
          }
        );

      }

    }
  );


  // ====================================================
  // ACTIVITY: PARAR STREAM
  // ====================================================

  socket.on(
    "activity-stream-stop",
    (data) => {

      const roomId =
        data &&
        data.roomId;


      if (!roomId) {
        return;
      }


      const room =
        rooms.get(roomId);


      if (!room) {
        return;
      }


      // Somente o transmissor
      if (
        room.broadcaster !== socket.id
      ) {

        return;
      }


      console.log(
        `HUNT ACTIVITY: stream parado na sala ${roomId}`
      );


      for (
        const viewerId
        of room.activityViewers
      ) {

        io.to(viewerId).emit(
          "activity-stream-stop",
          {
            broadcasterId:
              socket.id
          }
        );

      }

    }
  );


  // ====================================================
  // ACTIVITY: SAIR
  // ====================================================

  socket.on(
    "activity-leave",
    () => {

      removeActivityViewer(socket);

    }
  );


  // ====================================================
  // PARAR TRANSMISSÃO NORMAL
  // ====================================================

  socket.on("stop-stream", (data) => {

    const roomId =
      data &&
      data.roomId;


    if (!roomId) {
      return;
    }


    const room =
      rooms.get(roomId);


    if (!room) {
      return;
    }


    // Somente o transmissor pode parar
    if (
      room.broadcaster === socket.id
    ) {

      room.broadcaster = null;


      console.log(
        `HUNT: transmissão encerrada na sala ${roomId}`
      );


      socket.to(roomId).emit(
        "stream-stopped",
        {
          broadcasterId:
            socket.id
        }
      );


      // Também avisar Activities
      for (
        const viewerId
        of room.activityViewers
      ) {

        io.to(viewerId).emit(
          "activity-stream-stop",
          {
            broadcasterId:
              socket.id
          }
        );

      }

    }

  });


  // ====================================================
  // DESCONECTAR
  // ====================================================

  socket.on("disconnect", () => {

    console.log(
      "Cliente desconectado:",
      socket.id
    );


    // --------------------------------------------------
    // REMOVER ACTIVITY
    // --------------------------------------------------

    removeActivityViewer(socket);


    // --------------------------------------------------
    // VERIFICAR TRANSMISSOR
    // --------------------------------------------------

    for (
      const [roomId, room]
      of rooms
    ) {

      if (
        room.broadcaster === socket.id
      ) {

        room.broadcaster = null;


        console.log(
          `HUNT: transmissão removida da sala ${roomId}`
        );


        socket.to(roomId).emit(
          "stream-stopped",
          {
            broadcasterId:
              socket.id
          }
        );


        // Avisar Activities
        for (
          const viewerId
          of room.activityViewers
        ) {

          io.to(viewerId).emit(
            "activity-stream-stop",
            {
              broadcasterId:
                socket.id
            }
          );

        }

      }

    }

  });

});


// ======================================================
// REMOVER ACTIVITY VIEWER
// ======================================================

function removeActivityViewer(socket) {

  const roomId =
    socket.activityRoomId;


  if (!roomId) {
    return;
  }


  const room =
    rooms.get(roomId);


  if (!room) {
    return;
  }


  room.activityViewers.delete(
    socket.id
  );


  console.log(
    `HUNT ACTIVITY: ${socket.id} saiu da sala ${roomId}`
  );


  // Se houver transmissor, avisar
  if (room.broadcaster) {

    io.to(room.broadcaster).emit(
      "activity-viewer-left",
      {
        viewerId:
          socket.id
      }
    );

  }


  socket.activityRoomId = null;

}


// ======================================================
// LIMPEZA DE SALAS VAZIAS
// ======================================================

setInterval(() => {

  for (
    const [roomId, room]
    of rooms
  ) {

    if (
      !room.broadcaster &&
      room.activityViewers.size === 0
    ) {

      rooms.delete(roomId);

      console.log(
        `HUNT: sala removida por estar vazia: ${roomId}`
      );

    }

  }

}, 60 * 1000);


// ======================================================
// INICIAR SERVIDOR
// ======================================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `HUNT SERVER rodando na porta ${PORT}`
    );

  }
);