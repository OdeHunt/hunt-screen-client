import { io } from "socket.io-client";
import { patchUrlMappings } from "@discord/embedded-app-sdk";
import "./broadcaster.css";


/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const SERVER_URL =
  "https://hunt-screen-server.onrender.com";

const ROOM_ID =
  "hunt-screen-main";


const DISCORD_CLIENT_ID =
  "1542940402733162496";


/* =========================================================
   DETECTAR DISCORD
========================================================= */

const isDiscordActivity =
  window.location.hostname.endsWith(
    ".discordsays.com"
  );


console.log(
  "HUNT: Discord Activity:",
  isDiscordActivity
);


/* =========================================================
   ELEMENTOS
========================================================= */

const preview =
  document.getElementById("preview");

const emptyPreview =
  document.getElementById("emptyPreview");

const chooseButton =
  document.getElementById("chooseButton");

const startButton =
  document.getElementById("startButton");

const stopButton =
  document.getElementById("stopButton");

const backButton =
  document.getElementById("backButton");

const status =
  document.getElementById("status");

const errorBox =
  document.getElementById("error");

const quality =
  document.getElementById("quality");

const fps =
  document.getElementById("fps");


/* =========================================================
   VARIÁVEIS
========================================================= */

let socket =
  null;

let screenStream =
  null;

let transmitting =
  false;


/*
 * Cada espectador possui
 * seu próprio PeerConnection.
 */

const peers =
  new Map();


/* =========================================================
   CONFIGURAÇÃO DAS QUALIDADES
========================================================= */

const QUALITY_CONFIG = {

  360: {

    width:
      640,

    height:
      360,

    bitrate:
      1000000

  },


  480: {

    width:
      854,

    height:
      480,

    bitrate:
      2000000

  },


  720: {

    width:
      1280,

    height:
      720,

    bitrate:
      4000000

  },


  1080: {

    width:
      1920,

    height:
      1080,

    bitrate:
      8000000

  }

};


/* =========================================================
   WEBRTC
========================================================= */

const rtcConfig = {

  iceServers: [

    {
      urls:
        "stun:stun.l.google.com:19302"
    },

    {
      urls:
        "stun:stun1.l.google.com:19302"
    }

  ]

};


/* =========================================================
   STATUS
========================================================= */

function setStatus(
  message,
  live = false
) {

  status.textContent =
    message;

  status.classList.toggle(
    "live",
    live
  );

}


/* =========================================================
   ERRO
========================================================= */

function showError(
  message
) {

  console.error(
    "HUNT:",
    message
  );

  errorBox.textContent =
    message;

  errorBox.classList.add(
    "visible"
  );

}


function hideError() {

  errorBox.textContent =
    "";

  errorBox.classList.remove(
    "visible"
  );

}


/* =========================================================
   OBTER CONFIGURAÇÃO ATUAL
========================================================= */

function getSelectedQuality() {

  const selected =
    Number(
      quality.value
    );


  return (
    QUALITY_CONFIG[selected] ||
    QUALITY_CONFIG[1080]
  );

}


function getSelectedFPS() {

  return Number(
    fps.value
  );

}


/* =========================================================
   DISCORD URL MAPPING
========================================================= */

function setupDiscordNetworking() {

  if (!isDiscordActivity) {

    console.log(
      "HUNT: navegador normal."
    );

    return;

  }


  console.log(
    "HUNT: configurando URL Mapping do Discord..."
  );


  try {

    patchUrlMappings([

      {
        prefix:
          "/hunt-socket",

        target:
          "hunt-screen-server.onrender.com"
      }

    ]);


    console.log(
      "HUNT: URL Mapping configurado."
    );

  }

  catch (error) {

    console.error(
      "HUNT: erro no patchUrlMappings:",
      error
    );


    showError(
      "Erro ao configurar a conexão do Discord."
    );

  }

}


/* =========================================================
   SOCKET.IO
========================================================= */

function connectSocket() {

  console.log(
    "HUNT: iniciando Socket.IO..."
  );


  const socketURL =
    isDiscordActivity
      ? window.location.origin
      : SERVER_URL;


  console.log(
    "HUNT: Socket URL:",
    socketURL
  );


  socket =
    io(
      socketURL,
      {

        path:
          "/hunt-socket",

        /*
         * Permite polling como fallback
         * e mantém WebSocket disponível.
         */
        transports:
          ["polling", "websocket"],

        reconnection:
          true,

        reconnectionAttempts:
          Infinity,

        reconnectionDelay:
          1000,

        reconnectionDelayMax:
          5000,

        timeout:
          20000

      }
    );


  socket.on(
    "connect",
    () => {

      console.log(
        "HUNT SERVER conectado:",
        socket.id
      );


      setStatus(
        "● ONLINE"
      );


      hideError();


      socket.emit(
        "join-room",
        ROOM_ID
      );


      console.log(
        "HUNT: entrou na sala:",
        ROOM_ID
      );

    }
  );


  socket.on(
    "disconnect",
    reason => {

      console.warn(
        "HUNT: Socket desconectado:",
        reason
      );


      if (!transmitting) {

        setStatus(
          "● DESCONECTADO"
        );

      }

    }
  );


  socket.on(
    "connect_error",
    error => {

      console.error(
        "HUNT: erro de conexão:",
        error
      );


      console.error(
        "HUNT: detalhes:",
        {

          message:
            error?.message,

          description:
            error?.description,

          context:
            error?.context,

          type:
            error?.type

        }
      );


      setStatus(
        "● ERRO DE CONEXÃO"
      );


      showError(
        "Não foi possível conectar ao servidor."
      );

    }
  );


  /* =======================================================
     NOVO ESPECTADOR
  ======================================================= */

  socket.on(
    "user-joined",
    async data => {

      console.log(
        "HUNT: novo espectador:",
        data
      );


      if (!transmitting) {

        return;

      }


      if (
        !data ||
        !data.socketId
      ) {

        return;

      }


      await createOffer(
        data.socketId
      );

    }
  );


  /* =======================================================
     ANSWER
  ======================================================= */

  socket.on(
    "webrtc-answer",
    async data => {

      console.log(
        "HUNT: ANSWER recebida:",
        data
      );


      if (
        !data ||
        !data.sender ||
        !data.answer
      ) {

        return;

      }


      const peer =
        peers.get(
          data.sender
        );


      if (!peer) {

        console.warn(
          "HUNT: Peer não encontrado:",
          data.sender
        );

        return;

      }


      try {

        await peer.setRemoteDescription(
          data.answer
        );


        console.log(
          "HUNT: ANSWER aplicada."
        );

      }

      catch (error) {

        console.error(
          "HUNT: erro aplicando ANSWER:",
          error
        );

      }

    }
  );


  /* =======================================================
     ICE
  ======================================================= */

  socket.on(
    "webrtc-ice-candidate",
    async data => {

      if (
        !data ||
        !data.sender ||
        !data.candidate
      ) {

        return;

      }


      const peer =
        peers.get(
          data.sender
        );


      if (!peer) {

        console.warn(
          "HUNT: Peer não encontrado para ICE:",
          data.sender
        );

        return;

      }


      try {

        await peer.addIceCandidate(
          data.candidate
        );


        console.log(
          "HUNT: ICE aplicado:",
          data.sender
        );

      }

      catch (error) {

        console.error(
          "HUNT: erro aplicando ICE:",
          error
        );

      }

    }
  );

}


/* =========================================================
   APLICAR QUALIDADE NA CAPTURA
========================================================= */

async function applyVideoConstraints() {

  if (!screenStream) {

    return false;

  }


  const videoTrack =
    screenStream.getVideoTracks()[0];


  if (!videoTrack) {

    console.warn(
      "HUNT: nenhuma faixa de vídeo encontrada."
    );

    return false;

  }


  const selectedQuality =
    getSelectedQuality();

  const selectedFPS =
    getSelectedFPS();


  console.log(
    "HUNT: aplicando qualidade:",
    {

      width:
        selectedQuality.width,

      height:
        selectedQuality.height,

      fps:
        selectedFPS

    }
  );


  try {

    await videoTrack.applyConstraints({

      width: {

        ideal:
          selectedQuality.width,

        max:
          selectedQuality.width

      },

      height: {

        ideal:
          selectedQuality.height,

        max:
          selectedQuality.height

      },

      frameRate: {

        ideal:
          selectedFPS,

        max:
          selectedFPS

      }

    });


    console.log(
      "HUNT: qualidade aplicada."
    );


    return true;

  }

  catch (error) {

    console.warn(
      "HUNT: não foi possível aplicar todas as constraints:",
      error
    );


    return false;

  }

}


/* =========================================================
   APLICAR BITRATE
========================================================= */

async function applyBitrateToPeer(
  peer
) {

  if (!peer) {

    return;

  }


  const selectedQuality =
    getSelectedQuality();


  try {

    const senders =
      peer.getSenders();


    for (
      const sender
      of senders
    ) {

      if (
        !sender ||
        !sender.track ||
        sender.track.kind !==
          "video"
      ) {

        continue;

      }


      const parameters =
        sender.getParameters();


      if (
        !parameters.encodings ||
        !parameters.encodings.length
      ) {

        parameters.encodings =
          [{}];

      }


      parameters.encodings
        .forEach(
          encoding => {

            encoding.maxBitrate =
              selectedQuality.bitrate;

          }
        );


      await sender.setParameters(
        parameters
      );


      console.log(
        "HUNT: bitrate aplicado:",
        selectedQuality.bitrate
      );

    }

  }

  catch (error) {

    console.warn(
      "HUNT: não foi possível aplicar bitrate:",
      error
    );

  }

}


/* =========================================================
   ALTERAR QUALIDADE
========================================================= */

async function changeQuality() {

  if (!screenStream) {

    return;

  }


  await applyVideoConstraints();


  for (
    const peer
    of peers.values()
  ) {

    await applyBitrateToPeer(
      peer
    );

  }


  if (transmitting) {

    setStatus(
      `🔴 TRANSMITINDO • ${quality.value}p • ${fps.value} FPS`,
      true
    );

  }

}


/* =========================================================
   ALTERAR FPS
========================================================= */

async function changeFPS() {

  if (!screenStream) {

    return;

  }


  await applyVideoConstraints();


  if (transmitting) {

    setStatus(
      `🔴 TRANSMITINDO • ${quality.value}p • ${fps.value} FPS`,
      true
    );

  }

}


/* =========================================================
   ESCOLHER TELA
========================================================= */

async function chooseScreen() {

  hideError();


  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getDisplayMedia
  ) {

    showError(
      "Este ambiente não permite captura de tela."
    );

    return;

  }


  try {

    const selectedQuality =
      getSelectedQuality();

    const selectedFPS =
      getSelectedFPS();


    console.log(
      "HUNT: solicitando captura:",
      {

        width:
          selectedQuality.width,

        height:
          selectedQuality.height,

        fps:
          selectedFPS

      }
    );


    screenStream =
      await navigator.mediaDevices.getDisplayMedia({

        video: {

          width: {

            ideal:
              selectedQuality.width,

            max:
              selectedQuality.width

          },

          height: {

            ideal:
              selectedQuality.height,

            max:
              selectedQuality.height

          },

          frameRate: {

            ideal:
              selectedFPS,

            max:
              selectedFPS

          }

        },

        audio:
          true

      });


    preview.srcObject =
      screenStream;


    preview.style.display =
      "block";


    emptyPreview.style.display =
      "none";


    chooseButton.classList.add(
      "hidden"
    );


    startButton.classList.remove(
      "hidden"
    );


    stopButton.classList.add(
      "hidden"
    );


    /*
     * Agora garantimos que o track
     * tente realmente assumir a qualidade
     * selecionada.
     */

    await applyVideoConstraints();


    const videoTrack =
      screenStream.getVideoTracks()[0];


    if (videoTrack) {

      const settings =
        videoTrack.getSettings();


      console.log(
        "HUNT: captura REAL iniciada:",
        {

          width:
            settings.width,

          height:
            settings.height,

          fps:
            settings.frameRate,

          displaySurface:
            settings.displaySurface

        }
      );


      videoTrack.addEventListener(
        "ended",
        () => {

          console.log(
            "HUNT: captura encerrada pelo usuário."
          );


          stopTransmission();

        }
      );

    }


    setStatus(
      `● TELA SELECIONADA • ${quality.value}p`
    );


    console.log(
      "HUNT: tela selecionada."
    );

  }

  catch (error) {

    console.error(
      "HUNT: erro ao capturar tela:",
      error
    );


    screenStream =
      null;


    showError(
      "A captura da tela foi cancelada."
    );

  }

}


/* =========================================================
   COMEÇAR TRANSMISSÃO
========================================================= */

function startTransmission() {

  hideError();


  if (!screenStream) {

    showError(
      "Escolha uma tela primeiro."
    );

    return;

  }


  if (
    !socket ||
    !socket.connected
  ) {

    showError(
      "O servidor ainda não está conectado."
    );

    return;

  }


  if (transmitting) {

    return;

  }


  transmitting =
    true;


  setStatus(
    `🔴 TRANSMITINDO • ${quality.value}p • ${fps.value} FPS`,
    true
  );


  chooseButton.classList.add(
    "hidden"
  );


  startButton.classList.add(
    "hidden"
  );


  stopButton.classList.remove(
    "hidden"
  );


  socket.emit(
    "start-stream",
    {

      roomId:
        ROOM_ID

    }
  );


  console.log(
    "HUNT: transmissão iniciada:",
    {

      quality:
        quality.value,

      fps:
        fps.value

    }
  );

}


/* =========================================================
   CRIAR PEER
========================================================= */

function createPeer(
  viewerId
) {

  console.log(
    "HUNT: criando PeerConnection:",
    viewerId
  );


  /*
   * IMPORTANTE:
   *
   * Mantemos exatamente o acesso
   * que já foi confirmado como funcional.
   */

  const PeerConnection =
    window.RTCPeerConnection;


  if (
    typeof PeerConnection !==
    "function"
  ) {

    throw new Error(
      "RTCPeerConnection não está disponível neste ambiente."
    );

  }


  const peer =
    new PeerConnection(
      rtcConfig
    );


  /*
   * ADICIONAR A TELA
   */

  if (screenStream) {

    screenStream
      .getTracks()
      .forEach(
        track => {

          peer.addTrack(
            track,
            screenStream
          );

        }
      );

  }


  /*
   * ICE
   */

  peer.onicecandidate =
    event => {

      if (
        !event.candidate
      ) {

        return;

      }


      if (
        !socket ||
        !socket.connected
      ) {

        return;

      }


      socket.emit(
        "webrtc-ice-candidate",
        {

          target:
            viewerId,

          candidate:
            event.candidate

        }
      );


      console.log(
        "HUNT: ICE enviado:",
        viewerId
      );

    };


  /*
   * Estado
   */

  peer.onconnectionstatechange =
    () => {

      console.log(
        "HUNT: estado WebRTC:",
        viewerId,
        peer.connectionState
      );


      if (
        peer.connectionState ===
          "failed" ||

        peer.connectionState ===
          "closed" ||

        peer.connectionState ===
          "disconnected"
      ) {

        peers.delete(
          viewerId
        );

      }

    };


  peers.set(
    viewerId,
    peer
  );


  /*
   * Aplicar bitrate
   *
   * Depois que os tracks foram adicionados.
   */

  applyBitrateToPeer(
    peer
  );


  return peer;

}


/* =========================================================
   CRIAR OFFER
========================================================= */

async function createOffer(
  viewerId
) {

  console.log(
    "HUNT: criando OFFER:",
    viewerId
  );


  try {

    /*
     * Se já existe um Peer para esse
     * espectador, fechamos o anterior.
     */

    const existingPeer =
      peers.get(
        viewerId
      );


    if (existingPeer) {

      try {

        existingPeer.close();

      }

      catch {

        // ignorar

      }


      peers.delete(
        viewerId
      );

    }


    const peer =
      createPeer(
        viewerId
      );


    const offer =
      await peer.createOffer();


    await peer.setLocalDescription(
      offer
    );


    socket.emit(
      "webrtc-offer",
      {

        target:
          viewerId,

        offer:
          peer.localDescription

      }
    );


    console.log(
      "HUNT: OFFER enviada:",
      viewerId
    );

  }

  catch (error) {

    console.error(
      "HUNT: erro criando OFFER:",
      error
    );

  }

}


/* =========================================================
   PARAR TRANSMISSÃO
========================================================= */

function stopTransmission() {

  console.log(
    "HUNT: parando transmissão..."
  );


  transmitting =
    false;


  /*
   * Avisar servidor ANTES
   * de destruir tudo.
   */

  if (
    socket &&
    socket.connected
  ) {

    socket.emit(
      "stop-stream",
      {

        roomId:
          ROOM_ID

      }
    );

  }


  /*
   * Fechar peers.
   */

  for (
    const peer
    of peers.values()
  ) {

    try {

      peer.close();

    }

    catch {

      // ignorar

    }

  }


  peers.clear();


  /*
   * Parar captura.
   */

  if (screenStream) {

    screenStream
      .getTracks()
      .forEach(
        track => {

          try {

            track.stop();

          }

          catch {

            // ignorar

          }

        }
      );

  }


  screenStream =
    null;


  preview.srcObject =
    null;


  preview.style.display =
    "none";


  emptyPreview.style.display =
    "flex";


  chooseButton.classList.remove(
    "hidden"
  );


  startButton.classList.add(
    "hidden"
  );


  stopButton.classList.add(
    "hidden"
  );


  setStatus(
    socket?.connected
      ? "● ONLINE"
      : "● DESCONECTADO"
  );


  console.log(
    "HUNT: transmissão encerrada."
  );

}


/* =========================================================
   VOLTAR
========================================================= */

function goBack() {

  console.log(
    "HUNT: voltando..."
  );


  if (transmitting) {

    stopTransmission();

  }


  window.location.href =
    "/";

}


/* =========================================================
   EVENTOS
========================================================= */

chooseButton.addEventListener(
  "click",
  chooseScreen
);


startButton.addEventListener(
  "click",
  startTransmission
);


stopButton.addEventListener(
  "click",
  stopTransmission
);


backButton.addEventListener(
  "click",
  goBack
);


/*
 * QUALIDADE
 *
 * Pode ser alterada antes OU durante
 * a transmissão.
 */

quality.addEventListener(
  "change",
  changeQuality
);


/*
 * FPS
 */

fps.addEventListener(
  "change",
  changeFPS
);


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function initialize() {

  console.log(
    "HUNT: broadcaster iniciando..."
  );


  setStatus(
    "CONECTANDO..."
  );


  setupDiscordNetworking();


  connectSocket();


  console.log(
    "HUNT: broadcaster pronto."
  );

}


initialize();