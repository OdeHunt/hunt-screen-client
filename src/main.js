 import { io } from "socket.io-client";
import { patchUrlMappings } from "@discord/embedded-app-sdk";
import "./style.css";


/* ========================================
   CONFIGURAÇÃO
======================================== */

const SERVER_URL =
  "https://hunt-screen-server.onrender.com";

const ROOM_ID =
  "hunt-screen-main";


/* ========================================
   DISCORD ACTIVITY
======================================== */

const isDiscordActivity =
  window.location.hostname.endsWith(
    ".discordsays.com"
  );


console.log(
  "HUNT: Discord Activity:",
  isDiscordActivity
);


/* ========================================
   DISCORD URL MAPPING
======================================== */

if (isDiscordActivity) {

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
      "HUNT: URL Mapping configurado"
    );

  }

  catch (error) {

    console.warn(
      "HUNT: erro no patchUrlMappings:",
      error
    );

  }

}


/* ========================================
   SOCKET.IO
======================================== */

const socket =
  io(
    isDiscordActivity
      ? window.location.origin
      : SERVER_URL,
    {

      path:
        "/hunt-socket",

      transports: [
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


/* ========================================
   WEBRTC NORMAL
======================================== */

let peer =
  null;

let broadcasterId =
  null;

let pendingCandidates =
  [];


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


/* ========================================
   ACTIVITY MEDIA SOURCE
======================================== */

let activityMediaSource =
  null;

let activitySourceBuffer =
  null;

let activityMimeType =
  null;

let activityQueue =
  [];

let activityAppending =
  false;

let activityStreaming =
  false;


/* ========================================
   APP
======================================== */

const app =
  document.getElementById(
    "app"
  );


/* ========================================
   MODO
======================================== */

let currentPlayerMode =
  "wide";


/* ========================================
   FULLSCREEN
======================================== */

let huntFullscreen =
  false;


/* ========================================
   HOME
======================================== */

function showHome() {

  if (!app) {
    return;
  }


  closeViewer();

  stopActivityPlayback();


  huntFullscreen =
    false;


  document.body.classList.remove(
    "hunt-fullscreen-active"
  );


  app.innerHTML = `

    <div class="hunt-screen home-screen">

      <div class="hunt-logo">
        HUNT
      </div>

      <div class="hunt-subtitle">
        SCREEN
      </div>

      <div class="hunt-menu">

        <button
          id="viewerButton"
          class="hunt-button">

          👁️ ESPECTADOR

        </button>

        <button
          id="broadcastButton"
          class="hunt-button">

          📺 TRANSMITIR

        </button>

      </div>

      <div
        id="homeStatus"
        class="hunt-status">

        CONECTANDO...

      </div>

    </div>

  `;


  document
    .getElementById("viewerButton")
    ?.addEventListener(
      "click",
      startViewer
    );


  document
    .getElementById("broadcastButton")
    ?.addEventListener(
      "click",
      openBroadcaster
    );


  updateHomeStatus();

}


/* ========================================
   HOME STATUS
======================================== */

function updateHomeStatus() {

  const status =
    document.getElementById(
      "homeStatus"
    );


  if (!status) {
    return;
  }


  status.textContent =
    socket.connected
      ? "● SERVIDOR ONLINE"
      : "● CONECTANDO...";

}


/* ========================================
   BROADCASTER
======================================== */

function openBroadcaster() {

  window.location.href =
    "/broadcaster.html";

}


/* ========================================
   START VIEWER
======================================== */

function startViewer() {

  if (!app) {
    return;
  }


  closeViewer();

  stopActivityPlayback();


  huntFullscreen =
    false;


  document.body.classList.remove(
    "hunt-fullscreen-active"
  );


  app.innerHTML = `

    <div
      class="hunt-screen viewer-screen"
      id="viewerScreen">


      <div class="viewer-header">

        <div class="viewer-brand">

          <span class="viewer-logo">
            HUNT
          </span>

          <span class="viewer-brand-divider">
            /
          </span>

          <span class="viewer-brand-screen">
            SCREEN
          </span>

        </div>


        <div class="viewer-mode-selector">

          <button
            id="wideModeButton"
            class="mode-button active">

            WIDE

          </button>

          <button
            id="normalModeButton"
            class="mode-button">

            NORMAL

          </button>

        </div>

      </div>


      <div
        id="viewerContainer"
        class="viewer-container wide-mode">


        <div
          id="viewerMessage"
          class="viewer-message">

          PROCURANDO TRANSMISSÃO...

        </div>


        <video
          id="remoteVideo"
          autoplay
          playsinline
          controls
          preload="none">
        </video>


        <button
          id="huntFullscreenButton"
          class="hunt-fullscreen-button"
          type="button">

          ⛶

        </button>


        <button
          id="huntExitFullscreenButton"
          class="hunt-exit-fullscreen-button"
          type="button">

          ✕

        </button>


      </div>


      <div class="viewer-bottom">

        <div class="viewer-controls">

          <button
            id="refreshButton"
            class="hunt-button small-button">

            🔄 ATUALIZAR

          </button>


          <button
            id="fullscreenButton"
            class="hunt-button small-button">

            ⛶ TELA CHEIA

          </button>


          <button
            id="backButton"
            class="hunt-button secondary small-button">

            ← VOLTAR

          </button>

        </div>


        <div
          id="viewerStatus"
          class="hunt-status">

          CONECTANDO...

        </div>

      </div>

    </div>

  `;


  document
    .getElementById("refreshButton")
    ?.addEventListener(
      "click",
      refreshViewer
    );


  document
    .getElementById("backButton")
    ?.addEventListener(
      "click",
      async () => {

        await exitHuntFullscreen();

        closeViewer();

        stopActivityPlayback();

        showHome();

      }
    );


  document
    .getElementById("wideModeButton")
    ?.addEventListener(
      "click",
      () => setPlayerMode("wide")
    );


  document
    .getElementById("normalModeButton")
    ?.addEventListener(
      "click",
      () => setPlayerMode("normal")
    );


  document
    .getElementById("fullscreenButton")
    ?.addEventListener(
      "click",
      toggleHuntFullscreen
    );


  document
    .getElementById("huntFullscreenButton")
    ?.addEventListener(
      "click",
      toggleHuntFullscreen
    );


  document
    .getElementById("huntExitFullscreenButton")
    ?.addEventListener(
      "click",
      exitHuntFullscreen
    );


  const video =
    document.getElementById(
      "remoteVideo"
    );


  if (video) {

    video.volume =
      1;

    video.muted =
      false;

  }


  setPlayerMode(
    currentPlayerMode
  );


  updateFullscreenButtons();

  updateViewerStatus();


  /*
   * Se estiver dentro da Activity,
   * usa o novo transporte.
   */

  if (isDiscordActivity) {

    socket.emit(
      "activity-join",
      {
        roomId:
          ROOM_ID
      }
    );


    console.log(
      "HUNT ACTIVITY: espectador entrou."
    );

  }

  else {

    /*
     * Navegador normal continua com WebRTC.
     */

    if (socket.connected) {

      socket.emit(
        "join-room",
        ROOM_ID
      );

    }

  }

}


/* ========================================
   FULLSCREEN
======================================== */

async function toggleHuntFullscreen() {

  if (huntFullscreen) {

    await exitHuntFullscreen();

  }

  else {

    await enterHuntFullscreen();

  }

}


async function enterHuntFullscreen() {

  const viewerScreen =
    document.getElementById(
      "viewerScreen"
    );

  const container =
    document.getElementById(
      "viewerContainer"
    );


  if (!viewerScreen || !container) {
    return;
  }


  try {

    if (
      typeof viewerScreen.requestFullscreen ===
      "function"
    ) {

      await viewerScreen.requestFullscreen();

    }

  }

  catch (error) {

    console.warn(
      "HUNT: fullscreen real bloqueado:",
      error
    );

  }


  huntFullscreen =
    true;


  document.body.classList.add(
    "hunt-fullscreen-active"
  );


  viewerScreen.classList.add(
    "hunt-player-fullscreen"
  );


  container.classList.add(
    "hunt-fullscreen-container"
  );


  updateFullscreenButtons();

}


async function exitHuntFullscreen() {

  const viewerScreen =
    document.getElementById(
      "viewerScreen"
    );

  const container =
    document.getElementById(
      "viewerContainer"
    );


  try {

    if (
      document.fullscreenElement &&
      document.exitFullscreen
    ) {

      await document.exitFullscreen();

    }

  }

  catch {}


  huntFullscreen =
    false;


  document.body.classList.remove(
    "hunt-fullscreen-active"
  );


  viewerScreen
    ?.classList.remove(
      "hunt-player-fullscreen"
    );


  container
    ?.classList.remove(
      "hunt-fullscreen-container"
    );


  updateFullscreenButtons();

}


document.addEventListener(
  "fullscreenchange",
  () => {

    if (!document.fullscreenElement) {

      huntFullscreen =
        false;

      document.body.classList.remove(
        "hunt-fullscreen-active"
      );

      document
        .getElementById("viewerScreen")
        ?.classList.remove(
          "hunt-player-fullscreen"
        );

      document
        .getElementById("viewerContainer")
        ?.classList.remove(
          "hunt-fullscreen-container"
        );

    }


    updateFullscreenButtons();

  }
);


/* ========================================
   FULLSCREEN BUTTONS
======================================== */

function updateFullscreenButtons() {

  const fullscreenButton =
    document.getElementById(
      "fullscreenButton"
    );

  const enterButton =
    document.getElementById(
      "huntFullscreenButton"
    );

  const exitButton =
    document.getElementById(
      "huntExitFullscreenButton"
    );


  if (fullscreenButton) {

    fullscreenButton.textContent =
      huntFullscreen
        ? "✕ SAIR DA TELA CHEIA"
        : "⛶ TELA CHEIA";

  }


  if (enterButton) {

    enterButton.style.display =
      huntFullscreen
        ? "none"
        : "flex";

  }


  if (exitButton) {

    exitButton.style.display =
      huntFullscreen
        ? "flex"
        : "none";

  }

}


/* ========================================
   ESC
======================================== */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape" &&
      huntFullscreen
    ) {

      exitHuntFullscreen();

    }

  }
);


/* ========================================
   PLAYER MODE
======================================== */

function setPlayerMode(
  mode
) {

  if (
    mode !== "wide" &&
    mode !== "normal"
  ) {

    mode =
      "wide";

  }


  currentPlayerMode =
    mode;


  const container =
    document.getElementById(
      "viewerContainer"
    );


  if (!container) {
    return;
  }


  container.classList.remove(
    "wide-mode",
    "normal-mode"
  );


  container.classList.add(
    `${mode}-mode`
  );


  document
    .getElementById("wideModeButton")
    ?.classList.toggle(
      "active",
      mode === "wide"
    );


  document
    .getElementById("normalModeButton")
    ?.classList.toggle(
      "active",
      mode === "normal"
    );

}


/* ========================================
   VIEWER STATUS
======================================== */

function updateViewerStatus() {

  const status =
    document.getElementById(
      "viewerStatus"
    );


  if (!status) {
    return;
  }


  status.textContent =
    socket.connected
      ? "● CONECTADO"
      : "● CONECTANDO...";

}


/* ========================================
   REFRESH
======================================== */

function refreshViewer() {

  closeViewer();

  stopActivityPlayback();


  const message =
    document.getElementById(
      "viewerMessage"
    );


  if (message) {

    message.textContent =
      "PROCURANDO TRANSMISSÃO...";

    message.style.display =
      "flex";

  }


  if (isDiscordActivity) {

    socket.emit(
      "activity-join",
      {
        roomId:
          ROOM_ID
      }
    );

  }

  else {

    socket.emit(
      "join-room",
      ROOM_ID
    );

  }

}


/* ========================================
   FECHAR VIEWER WEBRTC
======================================== */

function closeViewer() {

  if (peer) {

    try {

      peer.ontrack =
        null;

      peer.onicecandidate =
        null;

      peer.close();

    }

    catch {}

  }


  peer =
    null;

  broadcasterId =
    null;

  pendingCandidates =
    [];


  const video =
    document.getElementById(
      "remoteVideo"
    );


  if (
    video &&
    !isDiscordActivity
  ) {

    try {
      video.pause();
    }
    catch {}


    video.srcObject =
      null;

  }

}


/* ========================================
   ACTIVITY — PARAR
======================================== */

function stopActivityPlayback() {

  activityStreaming =
    false;


  activityQueue =
    [];


  activitySourceBuffer =
    null;


  activityMediaSource =
    null;


  activityAppending =
    false;


  activityMimeType =
    null;


  const video =
    document.getElementById(
      "remoteVideo"
    );


  if (!video) {
    return;
  }


  if (
    video.src &&
    video.src.startsWith(
      "blob:"
    )
  ) {

    URL.revokeObjectURL(
      video.src
    );

  }


  video.removeAttribute(
    "src"
  );


  try {
    video.load();
  }
  catch {}

}


/* ========================================
   ACTIVITY — INICIAR MEDIA SOURCE
======================================== */

function startActivityPlayback(
  mimeType
) {

  const video =
    document.getElementById(
      "remoteVideo"
    );


  if (!video) {
    return;
  }


  if (
    !window.MediaSource
  ) {

    showViewerMessage(
      "MEDIA SOURCE NÃO É SUPORTADO"
    );

    return;

  }


  if (
    !MediaSource.isTypeSupported(
      mimeType
    )
  ) {

    console.error(
      "HUNT ACTIVITY: MIME não suportado:",
      mimeType
    );


    showViewerMessage(
      "FORMATO DE VÍDEO NÃO SUPORTADO"
    );


    return;

  }


  stopActivityPlayback();


  activityMimeType =
    mimeType;


  activityMediaSource =
    new MediaSource();


  video.src =
    URL.createObjectURL(
      activityMediaSource
    );


  activityMediaSource.addEventListener(
    "sourceopen",
    () => {

      try {

        activitySourceBuffer =
          activityMediaSource.addSourceBuffer(
            activityMimeType
          );


        activitySourceBuffer.mode =
          "sequence";


        activitySourceBuffer.addEventListener(
          "updateend",
          processActivityQueue
        );


        activityStreaming =
          true;


        processActivityQueue();


        video.play()
          .catch(
            error => {

              console.warn(
                "HUNT ACTIVITY: autoplay:",
                error
              );

            }
          );


        showViewerMessage(
          ""
        );


        const status =
          document.getElementById(
            "viewerStatus"
          );


        if (status) {

          status.textContent =
            "🔴 TRANSMISSÃO AO VIVO";

        }

      }

      catch (error) {

        console.error(
          "HUNT ACTIVITY: erro SourceBuffer:",
          error
        );


        showViewerMessage(
          "ERRO AO INICIAR VÍDEO"
        );

      }

    },
    {
      once: true
    }
  );

}


/* ========================================
   ACTIVITY — RECEBER CHUNK
======================================== */

async function receiveActivityChunk(
  chunk
) {

  if (!activityStreaming) {
    return;
  }


  if (!activitySourceBuffer) {
    return;
  }


  try {

    let buffer;


    if (
      chunk instanceof Blob
    ) {

      buffer =
        await chunk.arrayBuffer();

    }

    else if (
      chunk instanceof ArrayBuffer
    ) {

      buffer =
        chunk;

    }

    else if (
      ArrayBuffer.isView(
        chunk
      )
    ) {

      buffer =
        chunk.buffer.slice(
          chunk.byteOffset,
          chunk.byteOffset +
          chunk.byteLength
        );

    }

    else {

      console.warn(
        "HUNT ACTIVITY: chunk desconhecido:",
        chunk
      );

      return;

    }


    activityQueue.push(
      buffer
    );


    processActivityQueue();

  }

  catch (error) {

    console.error(
      "HUNT ACTIVITY: erro recebendo chunk:",
      error
    );

  }

}


/* ========================================
   ACTIVITY — FILA
======================================== */

function processActivityQueue() {

  if (
    !activitySourceBuffer ||
    activityAppending ||
    activityQueue.length === 0
  ) {

    return;

  }


  if (
    activitySourceBuffer.updating
  ) {

    return;

  }


  const buffer =
    activityQueue.shift();


  try {

    activityAppending =
      true;


    activitySourceBuffer.appendBuffer(
      buffer
    );

  }

  catch (error) {

    activityAppending =
      false;


    console.error(
      "HUNT ACTIVITY: erro appendBuffer:",
      error
    );


    /*
     * Se o buffer estiver cheio,
     * removemos uma pequena parte antiga.
     */

    if (
      error.name ===
      "QuotaExceededError"
    ) {

      try {

        const currentTime =
          document
            .getElementById(
              "remoteVideo"
            )
            ?.currentTime || 0;


        if (
          currentTime > 10
        ) {

          activitySourceBuffer.remove(
            0,
            currentTime - 5
          );

        }

      }

      catch {}

    }

  }

}


/* ========================================
   ACTIVITY — SOURCE BUFFER UPDATE
======================================== */

function setupActivityQueueEvents() {

  if (!activitySourceBuffer) {
    return;
  }


  activitySourceBuffer.addEventListener(
    "error",
    error => {

      console.error(
        "HUNT ACTIVITY: SourceBuffer:",
        error
      );

    }
  );

}


/* ========================================
   SOCKET CONNECT
======================================== */

socket.on(
  "connect",
  () => {

    console.log(
      "HUNT SERVER conectado:",
      socket.id
    );


    updateHomeStatus();

    updateViewerStatus();


    /*
     * Se a Activity já estiver no viewer,
     * entrar novamente na sala.
     */

    if (
      isDiscordActivity &&
      document.getElementById(
        "remoteVideo"
      )
    ) {

      socket.emit(
        "activity-join",
        {
          roomId:
            ROOM_ID
        }
      );

    }


    /*
     * Site normal = WebRTC.
     */

    else if (
      !isDiscordActivity &&
      document.getElementById(
        "remoteVideo"
      )
    ) {

      socket.emit(
        "join-room",
        ROOM_ID
      );

    }

  }
);


/* ========================================
   DISCONNECT
======================================== */

socket.on(
  "disconnect",
  reason => {

    console.warn(
      "HUNT: servidor desconectado:",
      reason
    );


    updateHomeStatus();

    updateViewerStatus();

  }
);


/* ========================================
   CONNECT ERROR
======================================== */

socket.on(
  "connect_error",
  error => {

    console.error(
      "HUNT: erro de conexão:",
      error
    );


    updateHomeStatus();

    updateViewerStatus();

  }
);


/* ========================================
   WEBRTC — TRANSMISSÃO DISPONÍVEL
======================================== */

socket.on(
  "stream-started",
  data => {

    if (
      isDiscordActivity
    ) {

      return;

    }


    if (
      !data ||
      !data.broadcasterId
    ) {

      return;

    }


    broadcasterId =
      data.broadcasterId;


    createViewerPeer();

  }
);


/* ========================================
   WEBRTC — CRIAR PEER
======================================== */

function createViewerPeer() {

  if (
    isDiscordActivity
  ) {

    return;

  }


  if (peer) {

    try {
      peer.close();
    }
    catch {}

  }


  peer =
    null;

  pendingCandidates =
    [];


  const RTC =
    window.RTCPeerConnection ||
    window.webkitRTCPeerConnection;


  if (
    typeof RTC !==
    "function"
  ) {

    showViewerMessage(
      "WEBRTC NÃO ESTÁ DISPONÍVEL"
    );

    return;

  }


  try {

    peer =
      new RTC(
        rtcConfig
      );

  }

  catch {

    showViewerMessage(
      "ERRO AO INICIAR WEBRTC"
    );

    return;

  }


  peer.ontrack =
    event => {

      const video =
        document.getElementById(
          "remoteVideo"
        );


      if (!video) {
        return;
      }


      if (
        event.streams &&
        event.streams.length
      ) {

        video.srcObject =
          event.streams[0];

      }


      video.muted =
        false;

      video.volume =
        1;


      video.play()
        .catch(
          () => {}
        );


      showViewerMessage(
        ""
      );


      const status =
        document.getElementById(
          "viewerStatus"
        );


      if (status) {

        status.textContent =
          "🔴 TRANSMISSÃO AO VIVO";

      }

    };


  peer.onicecandidate =
    event => {

      if (
        !event.candidate ||
        !broadcasterId
      ) {

        return;

      }


      socket.emit(
        "webrtc-ice-candidate",
        {

          target:
            broadcasterId,

          candidate:
            event.candidate

        }
      );

    };


  peer.onconnectionstatechange =
    () => {

      if (!peer) {
        return;
      }


      if (
        peer.connectionState ===
        "connected"
      ) {

        const status =
          document.getElementById(
            "viewerStatus"
          );


        if (status) {

          status.textContent =
            "🔴 TRANSMISSÃO AO VIVO";

        }

      }


      if (
        peer.connectionState ===
        "failed"
      ) {

        showViewerMessage(
          "FALHA NA TRANSMISSÃO"
        );

      }

    };

}


/* ========================================
   WEBRTC — OFFER
======================================== */

socket.on(
  "webrtc-offer",
  async data => {

    if (
      isDiscordActivity
    ) {

      return;

    }


    if (
      !data ||
      !data.sender ||
      !data.offer
    ) {

      return;

    }


    broadcasterId =
      data.sender;


    if (!peer) {

      createViewerPeer();

    }


    if (!peer) {
      return;
    }


    try {

      await peer.setRemoteDescription(
        data.offer
      );


      for (
        const candidate
        of pendingCandidates
      ) {

        try {

          await peer.addIceCandidate(
            candidate
          );

        }

        catch {}

      }


      pendingCandidates =
        [];


      const answer =
        await peer.createAnswer();


      await peer.setLocalDescription(
        answer
      );


      socket.emit(
        "webrtc-answer",
        {

          target:
            data.sender,

          answer:
            peer.localDescription

        }
      );

    }

    catch (error) {

      console.error(
        "HUNT: erro OFFER:",
        error
      );


      showViewerMessage(
        "ERRO AO CONECTAR"
      );

    }

  }
);


/* ========================================
   WEBRTC — ICE
======================================== */

socket.on(
  "webrtc-ice-candidate",
  async data => {

    if (
      isDiscordActivity
    ) {

      return;

    }


    if (
      !data ||
      !data.sender ||
      !data.candidate
    ) {

      return;

    }


    if (
      !peer ||
      !peer.remoteDescription
    ) {

      pendingCandidates.push(
        data.candidate
      );

      return;

    }


    try {

      await peer.addIceCandidate(
        data.candidate
      );

    }

    catch (error) {

      console.error(
        "HUNT: ICE:",
        error
      );

    }

  }
);


/* ========================================
   ACTIVITY — STREAM STARTED
======================================== */

socket.on(
  "activity-stream-started",
  data => {

    console.log(
      "HUNT ACTIVITY: stream encontrado:",
      data
    );


    if (
      !isDiscordActivity
    ) {

      return;

    }


    if (
      !data ||
      !data.broadcasterId
    ) {

      return;

    }


    broadcasterId =
      data.broadcasterId;


    const mimeType =
      data.mimeType ||
      "video/webm;codecs=vp8,opus";


    startActivityPlayback(
      mimeType
    );

  }
);


/* ========================================
   ACTIVITY — STREAM START
======================================== */

socket.on(
  "activity-stream-start",
  data => {

    console.log(
      "HUNT ACTIVITY: stream começou:",
      data
    );


    if (
      !isDiscordActivity
    ) {

      return;

    }


    if (
      !data
    ) {

      return;

    }


    broadcasterId =
      data.broadcasterId ||
      broadcasterId;


    const mimeType =
      data.mimeType ||
      "video/webm;codecs=vp8,opus";


    if (
      activityStreaming &&
      activityMimeType === mimeType
    ) {

      return;

    }


    startActivityPlayback(
      mimeType
    );

  }
);


/* ========================================
   ACTIVITY — CHUNK
======================================== */

socket.on(
  "activity-stream-chunk",
  chunkData => {

    if (
      !isDiscordActivity
    ) {

      return;

    }


    if (
      !chunkData ||
      !chunkData.chunk
    ) {

      return;

    }


    receiveActivityChunk(
      chunkData.chunk
    );

  }
);


/* ========================================
   ACTIVITY — STOP
======================================== */

socket.on(
  "activity-stream-stop",
  data => {

    console.log(
      "HUNT ACTIVITY: transmissão parada:",
      data
    );


    if (
      !isDiscordActivity
    ) {

      return;

    }


    stopActivityPlayback();


    showViewerMessage(
      "NENHUMA TRANSMISSÃO ATIVA"
    );


    const status =
      document.getElementById(
        "viewerStatus"
      );


    if (status) {

      status.textContent =
        "● TRANSMISSÃO ENCERRADA";

    }

  }
);


/* ========================================
   TRANSMISSÃO WEBRTC PAROU
======================================== */

socket.on(
  "stream-stopped",
  data => {

    console.log(
      "HUNT: transmissão encerrada:",
      data
    );


    closeViewer();


    if (
      isDiscordActivity
    ) {

      stopActivityPlayback();

    }


    showViewerMessage(
      "NENHUMA TRANSMISSÃO ATIVA"
    );


    const status =
      document.getElementById(
        "viewerStatus"
      );


    if (status) {

      status.textContent =
        "● TRANSMISSÃO ENCERRADA";

    }

  }
);


/* ========================================
   MENSAGEM
======================================== */

function showViewerMessage(
  message
) {

  const element =
    document.getElementById(
      "viewerMessage"
    );


  if (!element) {
    return;
  }


  element.textContent =
    message;


  element.style.display =
    message
      ? "flex"
      : "none";

}


/* ========================================
   INICIALIZAÇÃO
======================================== */

showHome();


console.log(
  "HUNT: aplicação iniciada"
);