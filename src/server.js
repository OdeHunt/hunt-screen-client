const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);


// ======================================================
// CONFIGURAÇÃO HTTP
// ======================================================

app.use(express.json());


// ======================================================
// CORS
// ======================================================

app.use((req, res, next) => {

  res.header(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {

    return res.sendStatus(204);

  }

  next();

});


// ======================================================
// CONFIGURAÇÃO DO DISCORD
// ======================================================

const DISCORD_API =
  "https://discord.com/api/v10";

const DISCORD_CLIENT_ID =
  process.env.DISCORD_CLIENT_ID;

const DISCORD_CLIENT_SECRET =
  process.env.DISCORD_CLIENT_SECRET;


// ======================================================
// SOCKET.IO
// ======================================================

const io = new Server(server, {

  path: "/hunt-socket",

  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },

  maxHttpBufferSize:
    10 * 1024 * 1024

});


const PORT =
  process.env.PORT || 3000;


// ======================================================
// SALAS
// ======================================================

const rooms = new Map();


// Estrutura:
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
// IDENTIFICAR SALA POR GUILD
// ======================================================

function getGuildRoomId(guildId) {

  if (!guildId) {
    return null;
  }

  return `hunt-screen:${guildId}`;

}


// ======================================================
// VERIFICAR SE É UMA SALA DO DISCORD
// ======================================================

function isGuildRoom(roomId) {

  return (
    typeof roomId === "string" &&
    roomId.startsWith("hunt-screen:")
  );

}


// ======================================================
// PEGAR GUILD ID DA SALA
// ======================================================

function getGuildIdFromRoom(roomId) {

  if (!isGuildRoom(roomId)) {
    return null;
  }

  return roomId.substring(
    "hunt-screen:".length
  );

}


// ======================================================
// TESTE DO SERVIDOR
// ======================================================

app.get("/", (req, res) => {

  res.send(
    "HUNT SERVER ONLINE"
  );

});


// ======================================================
// DISCORD OAUTH
// ======================================================
//
// Troca o código temporário recebido do Discord
// pelo access token.
//
// O CLIENT SECRET fica SOMENTE no Render.
// Nunca é enviado para o navegador.
// ======================================================

app.post("/api/token", async (req, res) => {

  const code =
    req.body &&
    req.body.code;


  // ----------------------------------------------------
  // VERIFICAR CÓDIGO
  // ----------------------------------------------------

  if (!code) {

    console.log(
      "HUNT AUTH: código de autorização não informado"
    );

    return res.status(400).json({

      error:
        "Código de autorização não informado."

    });

  }


  // ----------------------------------------------------
  // VERIFICAR CREDENCIAIS
  // ----------------------------------------------------

  if (
    !DISCORD_CLIENT_ID ||
    !DISCORD_CLIENT_SECRET
  ) {

    console.error(
      "HUNT AUTH: DISCORD_CLIENT_ID ou DISCORD_CLIENT_SECRET não configurado."
    );

    return res.status(500).json({

      error:
        "Configuração do Discord ausente no servidor."

    });

  }


  // ----------------------------------------------------
  // TROCAR CODE POR ACCESS TOKEN
  // ----------------------------------------------------

  try {

    console.log(
      "HUNT AUTH: trocando código do Discord..."
    );


    const response = await fetch(
      "https://discord.com/api/oauth2/token",
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/x-www-form-urlencoded"

        },

        body: new URLSearchParams({

          client_id:
            DISCORD_CLIENT_ID,

          client_secret:
            DISCORD_CLIENT_SECRET,

          grant_type:
            "authorization_code",

          code:
            code

        })

      }
    );


    const data =
      await response.json();


    // --------------------------------------------------
    // DISCORD RECUSOU
    // --------------------------------------------------

    if (!response.ok) {

      console.error(
        "HUNT AUTH: Discord recusou o código:",
        response.status,
        data
      );


      return res.status(502).json({

        error:
          "Discord recusou o código de autenticação."

      });

    }


    // --------------------------------------------------
    // VERIFICAR ACCESS TOKEN
    // --------------------------------------------------

    if (!data.access_token) {

      console.error(
        "HUNT AUTH: Discord não retornou access_token."
      );


      return res.status(502).json({

        error:
          "Discord não retornou um token de acesso."

      });

    }


    // --------------------------------------------------
    // SUCESSO
    // ----------------------------------------------------

    console.log(
      "HUNT AUTH: autenticação com Discord concluída."
    );


    return res.json({

      access_token:
        data.access_token

    });

  }
  catch (error) {

    console.error(
      "HUNT AUTH: erro ao comunicar com o Discord:",
      error
    );


    return res.status(500).json({

      error:
        "Erro interno ao autenticar com o Discord."

    });

  }

});


// ======================================================
// FUNÇÃO PARA PEGAR USUÁRIO DO DISCORD
// ======================================================

async function getDiscordUser(accessToken) {

  if (!accessToken) {
    return null;
  }


  try {

    const response = await fetch(
      `${DISCORD_API}/users/@me`,
      {

        headers: {

          Authorization:
            `Bearer ${accessToken}`

        }

      }
    );


    if (!response.ok) {

      console.error(
        "HUNT AUTH: erro buscando usuário:",
        response.status
      );

      return null;

    }


    return await response.json();

  }
  catch (error) {

    console.error(
      "HUNT AUTH: erro buscando usuário:",
      error
    );

    return null;

  }

}


// ======================================================
// FUNÇÃO PARA PEGAR SERVIDORES DO DISCORD
// ======================================================

async function getDiscordGuilds(accessToken) {

  if (!accessToken) {
    return [];
  }


  try {

    const response = await fetch(
      `${DISCORD_API}/users/@me/guilds`,
      {

        headers: {

          Authorization:
            `Bearer ${accessToken}`

        }

      }
    );


    if (!response.ok) {

      console.error(
        "HUNT AUTH: erro buscando servidores:",
        response.status
      );

      return [];

    }


    return await response.json();

  }
  catch (error) {

    console.error(
      "HUNT AUTH: erro buscando servidores:",
      error
    );

    return [];

  }

}


// ======================================================
// API: USUÁRIO ATUAL
// ======================================================

app.get("/api/me", async (req, res) => {

  const authorization =
    req.headers.authorization;


  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {

    return res.status(401).json({

      error:
        "Token de acesso não informado."

    });

  }


  const accessToken =
    authorization.substring(
      "Bearer ".length
    );


  const user =
    await getDiscordUser(
      accessToken
    );


  if (!user) {

    return res.status(401).json({

      error:
        "Token do Discord inválido ou expirado."

    });

  }


  return res.json({

    id:
      user.id,

    username:
      user.username,

    global_name:
      user.global_name || null,

    avatar:
      user.avatar || null

  });

});


// ======================================================
// API: SERVIDORES DO USUÁRIO
// ======================================================
//
// Retorna somente os servidores aos quais o usuário
// realmente pertence.
//
// O navegador NÃO pode inventar essa lista.
// ======================================================

app.get("/api/guilds", async (req, res) => {

  const authorization =
    req.headers.authorization;


  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {

    return res.status(401).json({

      error:
        "Token de acesso não informado."

    });

  }


  const accessToken =
    authorization.substring(
      "Bearer ".length
    );


  const guilds =
    await getDiscordGuilds(
      accessToken
    );


  if (!guilds.length) {

    return res.json([]);

  }


  // ----------------------------------------------------
  // Retornar somente informações necessárias
  // ----------------------------------------------------

  const result =
    guilds.map((guild) => ({

      id:
        guild.id,

      name:
        guild.name,

      icon:
        guild.icon || null,

      owner:
        Boolean(guild.owner),

      permissions:
        guild.permissions || "0"

    }));


  return res.json(result);

});


// ======================================================
// API: VALIDAR SERVIDOR
// ======================================================
//
// Confirma no backend que o usuário realmente pertence
// ao servidor escolhido.
// ======================================================

app.get(
  "/api/validate-guild",
  async (req, res) => {

    const authorization =
      req.headers.authorization;


    const guildId =
      req.query.guildId;


    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {

      return res.status(401).json({

        valid: false,

        error:
          "Token de acesso não informado."

      });

    }


    if (!guildId) {

      return res.status(400).json({

        valid: false,

        error:
          "guildId não informado."

      });

    }


    const accessToken =
      authorization.substring(
        "Bearer ".length
      );


    const guilds =
      await getDiscordGuilds(
        accessToken
      );


    const guild =
      guilds.find(
        (item) =>
          item.id === guildId
      );


    if (!guild) {

      return res.status(403).json({

        valid: false,

        error:
          "Você não pertence a este servidor."

      });

    }


    return res.json({

      valid: true,

      guild: {

        id:
          guild.id,

        name:
          guild.name,

        icon:
          guild.icon || null,

        owner:
          Boolean(guild.owner),

        permissions:
          guild.permissions || "0"

      }

    });

  }
);


// ======================================================
// SOCKET.IO — AUTENTICAÇÃO
// ======================================================
//
// O access token é enviado através de:
//
// socket.auth.access_token
//
// Nunca pela URL.
// ======================================================

io.use(
  async (socket, next) => {

    try {

      const accessToken =
        socket.handshake.auth &&
        socket.handshake.auth.access_token;


      // ------------------------------------------------
      // SISTEMA ANTIGO
      // ------------------------------------------------
      //
      // Mantemos conexões sem token temporariamente
      // para não quebrar o sistema antigo enquanto
      // atualizamos main.js e broadcaster.js.
      //

      if (!accessToken) {

        socket.discordUser =
          null;

        socket.discordGuilds =
          [];

        socket.authenticated =
          false;

        return next();

      }


      // ------------------------------------------------
      // IDENTIFICAR USUÁRIO
      // ------------------------------------------------

      const user =
        await getDiscordUser(
          accessToken
        );


      if (!user) {

        console.log(
          "HUNT AUTH: token inválido para socket:",
          socket.id
        );

        return next(
          new Error(
            "DISCORD_AUTH_INVALID"
          )
        );

      }


      // ------------------------------------------------
      // BUSCAR SERVIDORES
      // ------------------------------------------------

      const guilds =
        await getDiscordGuilds(
          accessToken
        );


      // ------------------------------------------------
      // SALVAR IDENTIDADE NO SOCKET
      // ------------------------------------------------

      socket.discordUser =
        user;

      socket.discordGuilds =
        guilds;

      socket.discordAccessToken =
        accessToken;

      socket.authenticated =
        true;


      console.log(
        "HUNT AUTH: usuário autenticado:",
        user.username,
        user.id
      );


      console.log(
        "HUNT AUTH: servidores encontrados:",
        guilds.length
      );


      next();

    }
    catch (error) {

      console.error(
        "HUNT AUTH: erro autenticando Socket.IO:",
        error
      );


      next(
        new Error(
          "DISCORD_AUTH_ERROR"
        )
      );

    }

  }
);


// ======================================================
// VERIFICAR ACESSO À SALA
// ======================================================

function canAccessRoom(socket, roomId) {

  // ----------------------------------------------------
  // SALA ANTIGA
  // ----------------------------------------------------
  //
  // Mantida para compatibilidade.
  //

  if (
    roomId === "hunt-screen-main"
  ) {

    return true;

  }


  // ----------------------------------------------------
  // SALA DE SERVIDOR DISCORD
  // ----------------------------------------------------

  if (
    isGuildRoom(roomId)
  ) {

    // Para salas novas, autenticação é obrigatória.

    if (
      !socket.authenticated
    ) {

      return false;

    }


    const guildId =
      getGuildIdFromRoom(
        roomId
      );


    if (!guildId) {
      return false;
    }


    const belongs =
      socket.discordGuilds.some(
        (guild) =>
          guild.id === guildId
      );


    return belongs;

  }


  // ----------------------------------------------------
  // OUTRAS SALAS
  // ----------------------------------------------------

  // Para preservar compatibilidade com o sistema
  // antigo.

  return true;

}


// ======================================================
// SOCKET.IO
// ======================================================

io.on("connection", (socket) => {

  console.log(
    "Cliente conectado:",
    socket.id
  );


  if (
    socket.authenticated &&
    socket.discordUser
  ) {

    console.log(
      "HUNT AUTH: conexão autenticada:",
      socket.discordUser.username,
      socket.discordUser.id
    );

  }
  else {

    console.log(
      "HUNT AUTH: conexão sem autenticação Discord"
    );

  }


  // ====================================================
  // ENTRAR NA SALA
  // ====================================================

  socket.on(
    "join-room",
    (roomId) => {

      if (!roomId) {
        return;
      }


      // ------------------------------------------------
      // VERIFICAR PERMISSÃO
      // ------------------------------------------------

      if (
        !canAccessRoom(
          socket,
          roomId
        )
      ) {

        console.log(
          "HUNT AUTH: acesso negado à sala:",
          socket.id,
          roomId
        );


        socket.emit(
          "room-access-denied",
          {

            roomId,

            error:
              "Você não tem acesso a este servidor."

          }
        );


        return;

      }


      socket.join(roomId);


      socket.currentRoomId =
        roomId;


      console.log(
        `${socket.id} entrou na sala ${roomId}`
      );


      const room =
        getRoom(roomId);


      // ------------------------------------------------
      // JÁ EXISTE UMA TRANSMISSÃO?
      // ------------------------------------------------

      if (room.broadcaster) {

        console.log(
          "Transmissão já existente:",
          room.broadcaster
        );


        // Avisar o novo usuário

        socket.emit(
          "stream-started",
          {

            broadcasterId:
              room.broadcaster

          }
        );


        // Avisar o transmissor

        io.to(
          room.broadcaster
        ).emit(
          "user-joined",
          {

            socketId:
              socket.id

          }
        );

      }

    }
  );


  // ====================================================
  // INICIAR TRANSMISSÃO
  // ====================================================

  socket.on(
    "start-stream",
    (data) => {

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


      // ------------------------------------------------
      // VERIFICAR ACESSO
      // ------------------------------------------------

      if (
        !canAccessRoom(
          socket,
          roomId
        )
      ) {

        console.log(
          "HUNT AUTH: transmissão negada:",
          socket.id,
          roomId
        );


        socket.emit(
          "room-access-denied",
          {

            roomId,

            error:
              "Você não tem acesso a este servidor."

          }
        );


        return;

      }


      const room =
        getRoom(roomId);


      // ------------------------------------------------
      // EVITAR DOIS TRANSMISSORES
      // ------------------------------------------------

      if (
        room.broadcaster &&
        room.broadcaster !== socket.id
      ) {

        console.log(
          "HUNT: sala já possui transmissor:",
          room.broadcaster
        );


        socket.emit(
          "stream-already-started",
          {

            broadcasterId:
              room.broadcaster

          }
        );


        return;

      }


      // ------------------------------------------------
      // REGISTRAR TRANSMISSOR
      // ------------------------------------------------

      room.broadcaster =
        socket.id;


      socket.currentRoomId =
        roomId;


      console.log(
        `HUNT: ${socket.id} está transmitindo na sala ${roomId}`
      );


      if (
        socket.authenticated &&
        socket.discordUser
      ) {

        console.log(
          "HUNT AUTH: transmissor:",
          socket.discordUser.username,
          socket.discordUser.id
        );

      }


      // ------------------------------------------------
      // AVISAR USUÁRIOS
      // ------------------------------------------------

      socket.to(
        roomId
      ).emit(
        "stream-started",
        {

          broadcasterId:
            socket.id

        }
      );


      // ------------------------------------------------
      // ESPECTADORES EXISTENTES
      // ------------------------------------------------

      io.in(
        roomId
      ).fetchSockets()
        .then(
          (clients) => {

            for (
              const client
              of clients
            ) {

              if (
                client.id === socket.id
              ) {

                continue;

              }


              io.to(
                socket.id
              ).emit(
                "user-joined",
                {

                  socketId:
                    client.id

                }
              );

            }

          }
        )
        .catch(
          (error) => {

            console.error(
              "HUNT: erro buscando espectadores da sala:",
              error
            );

          }
        );

    }
  );


  // ====================================================
  // WEBRTC OFFER
  // ====================================================

  socket.on(
    "webrtc-offer",
    (data) => {

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


      io.to(
        data.target
      ).emit(
        "webrtc-offer",
        {

          sender:
            socket.id,

          offer:
            data.offer

        }
      );

    }
  );


  // ====================================================
  // WEBRTC ANSWER
  // ====================================================

  socket.on(
    "webrtc-answer",
    (data) => {

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


      io.to(
        data.target
      ).emit(
        "webrtc-answer",
        {

          sender:
            socket.id,

          answer:
            data.answer

        }
      );

    }
  );


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


      io.to(
        data.target
      ).emit(
        "webrtc-ice-candidate",
        {

          sender:
            socket.id,

          candidate:
            data.candidate

        }
      );

    }
  );


  // ====================================================
  // ====================================================
  // DISCORD ACTIVITY
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


      // ------------------------------------------------
      // VERIFICAR ACESSO
      // ------------------------------------------------

      if (
        !canAccessRoom(
          socket,
          roomId
        )
      ) {

        console.log(
          "HUNT AUTH: Activity sem acesso à sala:",
          socket.id,
          roomId
        );


        socket.emit(
          "room-access-denied",
          {

            roomId,

            error:
              "Você não tem acesso a este servidor."

          }
        );


        return;

      }


      const room =
        getRoom(roomId);


      // ------------------------------------------------
      // GUARDAR ESPECTADOR
      // ------------------------------------------------

      room.activityViewers.add(
        socket.id
      );


      socket.activityRoomId =
        roomId;


      console.log(
        `HUNT ACTIVITY: ${socket.id} entrou como espectador em ${roomId}`
      );


      // ------------------------------------------------
      // EXISTE TRANSMISSÃO?
      // ------------------------------------------------

      if (
        room.broadcaster
      ) {

        socket.emit(
          "activity-stream-started",
          {

            broadcasterId:
              room.broadcaster

          }
        );


        io.to(
          room.broadcaster
        ).emit(
          "activity-viewer-joined",
          {

            viewerId:
              socket.id

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


      if (
        !canAccessRoom(
          socket,
          roomId
        )
      ) {

        return;

      }


      const room =
        rooms.get(roomId);


      if (!room) {

        console.log(
          "HUNT ACTIVITY: sala inexistente"
        );

        return;

      }


      // ------------------------------------------------
      // SOMENTE O TRANSMISSOR
      // ------------------------------------------------

      if (
        room.broadcaster !==
        socket.id
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


      // ------------------------------------------------
      // AVISAR ACTIVITIES
      // ------------------------------------------------

      for (
        const viewerId
        of room.activityViewers
      ) {

        io.to(
          viewerId
        ).emit(
          "activity-stream-start",
          {

            broadcasterId:
              socket.id,

            mimeType:
              data.mimeType ||
              "video/webm"

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


      if (
        !canAccessRoom(
          socket,
          roomId
        )
      ) {

        return;

      }


      const room =
        rooms.get(roomId);


      if (!room) {
        return;
      }


      // ------------------------------------------------
      // SOMENTE O TRANSMISSOR
      // ------------------------------------------------

      if (
        room.broadcaster !==
        socket.id
      ) {

        return;

      }


      const chunk =
        data.chunk;


      if (!chunk) {
        return;
      }


      // ------------------------------------------------
      // REPASSAR PARA ACTIVITIES
      // ------------------------------------------------

      for (
        const viewerId
        of room.activityViewers
      ) {

        io.to(
          viewerId
        ).emit(
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


      if (
        !canAccessRoom(
          socket,
          roomId
        )
      ) {

        return;

      }


      const room =
        rooms.get(roomId);


      if (!room) {
        return;
      }


      // ------------------------------------------------
      // SOMENTE O TRANSMISSOR
      // ------------------------------------------------

      if (
        room.broadcaster !==
        socket.id
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

        io.to(
          viewerId
        ).emit(
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

      removeActivityViewer(
        socket
      );

    }
  );


  // ====================================================
  // PARAR TRANSMISSÃO NORMAL
  // ====================================================

  socket.on(
    "stop-stream",
    (data) => {

      const roomId =
        data &&
        data.roomId;


      if (!roomId) {
        return;
      }


      if (
        !canAccessRoom(
          socket,
          roomId
        )
      ) {

        return;

      }


      const room =
        rooms.get(roomId);


      if (!room) {
        return;
      }


      // ------------------------------------------------
      // SOMENTE O TRANSMISSOR
      // ------------------------------------------------

      if (
        room.broadcaster ===
        socket.id
      ) {

        room.broadcaster =
          null;


        console.log(
          `HUNT: transmissão encerrada na sala ${roomId}`
        );


        socket.to(
          roomId
        ).emit(
          "stream-stopped",
          {

            broadcasterId:
              socket.id

          }
        );


        // ------------------------------------------------
        // AVISAR ACTIVITIES
        // ------------------------------------------------

        for (
          const viewerId
          of room.activityViewers
        ) {

          io.to(
            viewerId
          ).emit(
            "activity-stream-stop",
            {

              broadcasterId:
                socket.id

            }
          );

        }

      }

    }
  );


  // ====================================================
  // DESCONECTAR
  // ====================================================

  socket.on(
    "disconnect",
    () => {

      console.log(
        "Cliente desconectado:",
        socket.id
      );


      // ------------------------------------------------
      // REMOVER ACTIVITY
      // ------------------------------------------------

      removeActivityViewer(
        socket
      );


      // ------------------------------------------------
      // VERIFICAR TRANSMISSOR
      // ------------------------------------------------

      for (
        const [roomId, room]
        of rooms
      ) {

        if (
          room.broadcaster ===
          socket.id
        ) {

          room.broadcaster =
            null;


          console.log(
            `HUNT: transmissão removida da sala ${roomId}`
          );


          socket.to(
            roomId
          ).emit(
            "stream-stopped",
            {

              broadcasterId:
                socket.id

            }
          );


          // ------------------------------------------------
          // AVISAR ACTIVITIES
          // ------------------------------------------------

          for (
            const viewerId
            of room.activityViewers
          ) {

            io.to(
              viewerId
            ).emit(
              "activity-stream-stop",
              {

                broadcasterId:
                  socket.id

              }
            );

          }

        }

      }

    }
  );

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


  // ----------------------------------------------------
  // AVISAR BROADCASTER
  // ----------------------------------------------------

  if (
    room.broadcaster
  ) {

    io.to(
      room.broadcaster
    ).emit(
      "activity-viewer-left",
      {

        viewerId:
          socket.id

      }
    );

  }


  socket.activityRoomId =
    null;

}


// ======================================================
// LIMPEZA DE SALAS VAZIAS
// ======================================================

setInterval(
  () => {

    for (
      const [roomId, room]
      of rooms
    ) {

      if (
        !room.broadcaster &&
        room.activityViewers.size === 0
      ) {

        rooms.delete(
          roomId
        );


        console.log(
          `HUNT: sala removida por estar vazia: ${roomId}`
        );

      }

    }

  },
  60 * 1000
);


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

    console.log(
      "HUNT AUTH: Discord Client ID:",
      DISCORD_CLIENT_ID
        ? "CONFIGURADO"
        : "AUSENTE"
    );

    console.log(
      "HUNT AUTH: Discord Client Secret:",
      DISCORD_CLIENT_SECRET
        ? "CONFIGURADO"
        : "AUSENTE"
    );

  }
);