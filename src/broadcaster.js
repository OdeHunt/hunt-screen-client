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


/* =========================================================
   DISCORD
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

let socket = null;

let screenStream = null;

let transmitting = false;


/*
 * WebRTC normal
 */

const peers = new Map();


/*
 * Activity MediaRecorder
 */

let activityRecorder = null;

let activityRecording = false;


/* =========================================================
   QUALIDADES
========================================================= */

const QUALITY_CONFIG = {

  360: {
    width: 640,
    height: 360,
    bitrate: 1000000
  },

  480: {
    width: 854,
    height: 480,
    bitrate: 2000000
  },

  720: {
    width: 1280,
    height: 720,
    bitrate: 4000000
  },

  1080: {
    width: 1920,
    height: 1080,
    bitrate: 8000000
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
   CONFIGURAÇÃO ATUAL
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


  socket =
    io(
      socketURL,
      {

        path:
          "/hunt-socket",

        transports:
          [
            "polling",
            "websocket"
          ],

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


      setStatus(
        "● ERRO DE CONEXÃO"
      );


      showError(
        "Não foi possível conectar ao servidor."
      );

    }
  );


  /* =======================================================
     ESPECTADOR WEBRTC
  ======================================================= */

  socket.on(
    "viewer-joined",
    async data => {

      console.log(
        "HUNT: novo espectador WebRTC:",
        data
      );


      if (!transmitting) {
        return;
      }


      if (
        !data ||
        !data.viewerId
      ) {

        return;
      }


      await createOffer(
        data.viewerId
      );

    }
  );


  /* =======================================================
     ANSWER
  ======================================================= */

  socket.on(
    "webrtc-answer",
    async data => {

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

        return;

      }


      try {

        await peer.setRemoteDescription(
          data.answer
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
        return;
      }


      try {

        await peer.addIceCandidate(
          data.candidate
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


  /* =======================================================
     NOVO: ACTIVITY ENTROU
  ======================================================= */

  socket.on(
    "activity-viewer-joined",
    async data => {

      console.log(
        "HUNT: Activity entrou:",
        data
      );


      if (!transmitting) {

        return;

      }


      /*
       * Se ainda não existe MediaRecorder,
       * iniciar agora.
       */

      await startActivityStream();

    }
  );


  /* =======================================================
     ACTIVITY SAIU
  ======================================================= */

  socket.on(
    "activity-viewer-left",
    data => {

      console.log(
        "HUNT: Activity saiu:",
        data
      );

    }
  );

}


/* =========================================================
   QUALIDADE DA CAPTURA
========================================================= */

async function applyVideoConstraints() {

  if (!screenStream) {
    return false;
  }


  const videoTrack =
    screenStream.getVideoTracks()[0];


  if (!videoTrack) {
    return false;
  }


  const selectedQuality =
    getSelectedQuality();

  const selectedFPS =
    getSelectedFPS();


  try {

    await videoTrack.applyConstraints({

      width: {

        min:
          320,

        ideal:
          selectedQuality.width,

        max:
          selectedQuality.width

      },

      height: {

        min:
          180,

        ideal:
          selectedQuality.height,

        max:
          selectedQuality.height

      },

      frameRate: {

        min:
          15,

        ideal:
          selectedFPS,

        max:
          selectedFPS

      }

    });


    console.log(
      "HUNT: qualidade aplicada:",
      videoTrack.getSettings()
    );


    return true;

  }

  catch (error) {

    console.warn(
      "HUNT: fallback de qualidade:",
      error
    );


    try {

      await videoTrack.applyConstraints({

        width:
          selectedQuality.width,

        height:
          selectedQuality.height,

        frameRate:
          selectedFPS

      });


      return true;

    }

    catch {

      showError(
        "Não foi possível alterar a qualidade."
      );


      return false;

    }

  }

}


/* =========================================================
   BITRATE WEBRTC
========================================================= */

async function applyBitrateToPeer(
  peer
) {

  if (!peer) {
    return;
  }


  const selectedQuality =
    getSelectedQuality();


  for (
    const sender
    of peer.getSenders()
  ) {

    if (
      !sender.track ||
      sender.track.kind !== "video"
    ) {

      continue;

    }


    try {

      const parameters =
        sender.getParameters();


      if (
        !parameters.encodings ||
        parameters.encodings.length === 0
      ) {

        parameters.encodings = [
          {}
        ];

      }


      for (
        const encoding
        of parameters.encodings
      ) {

        encoding.maxBitrate =
          selectedQuality.bitrate;

      }


      await sender.setParameters(
        parameters
      );

    }

    catch (error) {

      console.warn(
        "HUNT: bitrate não aplicado:",
        error
      );

    }

  }

}


/* =========================================================
   BITRATE TODOS
========================================================= */

async function applyBitrateToAllPeers() {

  for (
    const peer
    of peers.values()
  ) {

    await applyBitrateToPeer(
      peer
    );

  }

}


/* =========================================================
   QUALIDADE
========================================================= */

async function changeQuality() {

  hideError();


  if (!screenStream) {
    return;
  }


  await applyVideoConstraints();

  await applyBitrateToAllPeers();


  if (transmitting) {

    restartActivityStream();

    setStatus(
      `🔴 TRANSMITINDO • ${quality.value}p • ${fps.value} FPS`,
      true
    );

  }

  else {

    setStatus(
      `● TELA SELECIONADA • ${quality.value}p`
    );

  }

}


/* =========================================================
   FPS
========================================================= */

async function changeFPS() {

  hideError();


  if (!screenStream) {
    return;
  }


  await applyVideoConstraints();


  if (transmitting) {

    restartActivityStream();

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


    await applyVideoConstraints();


    const videoTrack =
      screenStream.getVideoTracks()[0];


    if (videoTrack) {

      videoTrack.addEventListener(
        "ended",
        () => {

          stopTransmission();

        }
      );

    }


    setStatus(
      `● TELA SELECIONADA • ${quality.value}p`
    );


  }

  catch (error) {

    console.error(
      "HUNT: erro capturando tela:",
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
   INICIAR TRANSMISSÃO
========================================================= */

async function startTransmission() {

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


  /*
   * Sistema WebRTC normal
   */

  socket.emit(
    "start-stream",
    {
      roomId:
        ROOM_ID
    }
  );


  /*
   * O Activity MediaRecorder só começa
   * quando uma Activity entrar.
   */


  console.log(
    "HUNT: transmissão iniciada."
  );

}


/* =========================================================
   ACTIVITY MEDIARECORDER
========================================================= */

function getActivityMimeType() {

  const types = [

    "video/webm;codecs=vp9,opus",

    "video/webm;codecs=vp8,opus",

    "video/webm"

  ];


  for (
    const type
    of types
  ) {

    if (
      MediaRecorder.isTypeSupported(
        type
      )
    ) {

      console.log(
        "HUNT ACTIVITY: MIME:",
        type
      );

      return type;

    }

  }


  return "";

}


/* =========================================================
   INICIAR ACTIVITY STREAM
========================================================= */

async function startActivityStream() {

  if (!transmitting) {
    return;
  }


  if (!screenStream) {
    return;
  }


  if (
    activityRecorder &&
    activityRecorder.state !== "inactive"
  ) {

    return;

  }


  const mimeType =
    getActivityMimeType();


  if (!mimeType) {

    console.error(
      "HUNT ACTIVITY: MediaRecorder WebM não suportado."
    );

    return;

  }


  try {

    activityRecorder =
      new MediaRecorder(
        screenStream,
        {

          mimeType,

          videoBitsPerSecond:
            getSelectedQuality().bitrate,

          audioBitsPerSecond:
            128000

        }
      );


    activityRecording =
      true;


    /*
     * Avisar Activity antes dos chunks.
     */

    socket.emit(
      "activity-stream-start",
      {

        roomId:
          ROOM_ID,

        mimeType

      }
    );


    activityRecorder.ondataavailable =
      event => {

        if (
          !event.data ||
          event.data.size === 0
        ) {

          return;

        }


        if (
          !socket ||
          !socket.connected ||
          !transmitting
        ) {

          return;

        }


        /*
         * Blob é enviado como binário
         * pelo Socket.IO.
         */

        socket.emit(
          "activity-stream-chunk",
          {

            roomId:
              ROOM_ID,

            chunk:
              event.data

          }
        );

      };


    activityRecorder.onerror =
      event => {

        console.error(
          "HUNT ACTIVITY: erro MediaRecorder:",
          event
        );

      };


    activityRecorder.onstop =
      () => {

        activityRecording =
          false;

        activityRecorder =
          null;

      };


    /*
     * 250ms = baixa latência.
     */

    activityRecorder.start(
      250
    );


    console.log(
      "HUNT ACTIVITY: MediaRecorder iniciado."
    );

  }

  catch (error) {

    console.error(
      "HUNT ACTIVITY: não foi possível iniciar MediaRecorder:",
      error
    );

    activityRecording =
      false;

    activityRecorder =
      null;

  }

}


/* =========================================================
   REINICIAR ACTIVITY STREAM
========================================================= */

function restartActivityStream() {

  if (!transmitting) {
    return;
  }


  if (!activityRecording) {
    return;
  }


  stopActivityStream();


  setTimeout(
    () => {

      if (transmitting) {

        startActivityStream();

      }

    },
    100
  );

}


/* =========================================================
   PARAR ACTIVITY STREAM
========================================================= */

function stopActivityStream() {

  if (!activityRecorder) {
    return;
  }


  try {

    if (
      activityRecorder.state !==
      "inactive"
    ) {

      activityRecorder.stop();

    }

  }

  catch (error) {

    console.warn(
      "HUNT ACTIVITY: erro parando recorder:",
      error
    );

  }


  activityRecording =
    false;


  activityRecorder =
    null;


  if (
    socket &&
    socket.connected
  ) {

    socket.emit(
      "activity-stream-stop",
      {
        roomId:
          ROOM_ID
      }
    );

  }

}


/* =========================================================
   WEBRTC PEER
========================================================= */

function createPeer(
  viewerId
) {

  const PeerConnection =
    window.RTCPeerConnection;


  if (
    typeof PeerConnection !==
    "function"
  ) {

    throw new Error(
      "RTCPeerConnection não está disponível."
    );

  }


  const peer =
    new PeerConnection(
      rtcConfig
    );


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


  peer.onicecandidate =
    event => {

      if (
        !event.candidate ||
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

    };


  peer.onconnectionstatechange =
    () => {

      console.log(
        "HUNT: WebRTC:",
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


  applyBitrateToPeer(
    peer
  );


  return peer;

}


/* =========================================================
   OFFER
========================================================= */

async function createOffer(
  viewerId
) {

  try {

    const existing =
      peers.get(
        viewerId
      );


    if (existing) {

      try {
        existing.close();
      }
      catch {}

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
   * Primeiro parar Activity.
   */

  stopActivityStream();


  /*
   * Avisar WebRTC.
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
   * Fechar WebRTC.
   */

  for (
    const peer
    of peers.values()
  ) {

    try {
      peer.close();
    }
    catch {}

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
          catch {}

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


quality.addEventListener(
  "change",
  changeQuality
);


fps.addEventListener(
  "change",
  changeFPS
);


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

function initialize() {

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