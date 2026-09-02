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

const PRO_VERSION_URL =
  "https://hunt-screen-client.onrender.com/";


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
   WEBRTC
======================================== */

let peer =
  null;

let broadcasterId =
  null;

let pendingCandidates =
  [];


/* ========================================
   ELEMENTO PRINCIPAL
======================================== */

const app =
  document.getElementById(
    "app"
  );


if (!app) {

  console.error(
    "HUNT: elemento #app não encontrado."
  );

}


/* ========================================
   RTC
======================================== */

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


console.log(
  "HUNT: verificando WebRTC..."
);

console.log(
  "HUNT: RTCPeerConnection:",
  window.RTCPeerConnection
);


/* ========================================
   MODO DO PLAYER
======================================== */

let currentPlayerMode =
  "wide";


/* ========================================
   FULLSCREEN HUNT
======================================== */

let huntFullscreen =
  false;


/* ========================================
   TELA PRINCIPAL
======================================== */

function showHome() {

  if (!app) {
    return;
  }

  closeViewer();

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


  const viewerButton =
    document.getElementById(
      "viewerButton"
    );


  const broadcastButton =
    document.getElementById(
      "broadcastButton"
    );


  if (viewerButton) {

    viewerButton.addEventListener(
      "click",
      startViewer
    );

  }


  if (broadcastButton) {

    broadcastButton.addEventListener(
      "click",
      openBroadcaster
    );

  }


  updateHomeStatus();

}


/* ========================================
   STATUS HOME
======================================== */

function updateHomeStatus() {

  const status =
    document.getElementById(
      "homeStatus"
    );


  if (!status) {
    return;
  }


  if (socket.connected) {

    status.textContent =
      "● SERVIDOR ONLINE";

  }

  else {

    status.textContent =
      "● CONECTANDO...";

  }

}


/* ========================================
   ABRIR BROADCASTER
======================================== */

function openBroadcaster() {

  console.log(
    "HUNT: abrindo broadcaster"
  );

  window.location.href =
    "/broadcaster.html";

}


/* ========================================
   ABRIR VERSÃO PRO
======================================== */

function openProVersion() {

  console.log(
    "HUNT: abrindo Versão Pro"
  );

  window.open(
    PRO_VERSION_URL,
    "_blank",
    "noopener,noreferrer"
  );

}


/* ========================================
   INICIAR VIEWER
======================================== */

function startViewer() {

  console.log(
    "HUNT: entrando como espectador"
  );


  if (!app) {
    return;
  }


  closeViewer();

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
            class="hunt-button small-button fullscreen-control-button">

            ⛶ TELA CHEIA

          </button>


          <button
            id="proButton"
            class="hunt-button small-button pro-button">

            🚀 VERSÃO PRO

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


  const refreshButton =
    document.getElementById(
      "refreshButton"
    );


  const backButton =
    document.getElementById(
      "backButton"
    );


  const proButton =
    document.getElementById(
      "proButton"
    );


  const wideButton =
    document.getElementById(
      "wideModeButton"
    );


  const normalButton =
    document.getElementById(
      "normalModeButton"
    );


  const fullscreenButton =
    document.getElementById(
      "fullscreenButton"
    );


  /* ======================================
     ATUALIZAR
  ====================================== */

  if (refreshButton) {

    refreshButton.addEventListener(
      "click",
      refreshViewer
    );

  }


  /* ======================================
     VERSÃO PRO
  ====================================== */

  if (proButton) {

    proButton.addEventListener(
      "click",
      openProVersion
    );

  }


  /* ======================================
     VOLTAR
  ====================================== */

  if (backButton) {

    backButton.addEventListener(
      "click",
      async () => {

        await exitHuntFullscreen();

        closeViewer();

        showHome();

      }
    );

  }


  /* ======================================
     WIDE
  ====================================== */

  if (wideButton) {

    wideButton.addEventListener(
      "click",
      () => {

        setPlayerMode(
          "wide"
        );

      }
    );

  }


  /* ======================================
     NORMAL
  ====================================== */

  if (normalButton) {

    normalButton.addEventListener(
      "click",
      () => {

        setPlayerMode(
          "normal"
        );

      }
    );

  }


  /* ======================================
     FULLSCREEN
  ====================================== */

  if (fullscreenButton) {

    fullscreenButton.addEventListener(
      "click",
      toggleHuntFullscreen
    );

  }


  /* ======================================
     VÍDEO
  ====================================== */

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


  /* ======================================
     ENTRAR NA SALA
  ====================================== */

  if (socket.connected) {

    socket.emit(
      "join-room",
      ROOM_ID
    );

    console.log(
      "HUNT: viewer entrou na sala"
    );

  }

  else {

    console.log(
      "HUNT: aguardando Socket.IO..."
    );

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


/* ========================================
   ENTRAR FULLSCREEN
======================================== */

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


  /*
    Primeiro tentamos o fullscreen
    real do navegador.
  */

  try {

    if (
      document.fullscreenElement !==
      viewerScreen
    ) {

      if (
        typeof viewerScreen.requestFullscreen ===
        "function"
      ) {

        await viewerScreen.requestFullscreen();

        console.log(
          "HUNT: Fullscreen API ativada"
        );

      }

    }

  }

  catch (error) {

    console.warn(
      "HUNT: Fullscreen API não disponível ou bloqueada:",
      error
    );

  }


  /*
    Ativa também o modo visual.
    Isso funciona como fallback dentro
    da Discord Activity.
  */

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


  console.log(
    "HUNT: fullscreen ativado"
  );

}


/* ========================================
   SAIR FULLSCREEN
======================================== */

async function exitHuntFullscreen() {

  const viewerScreen =
    document.getElementById(
      "viewerScreen"
    );

  const container =
    document.getElementById(
      "viewerContainer"
    );


  /*
    Sai do fullscreen REAL.
  */

  try {

    if (
      document.fullscreenElement
    ) {

      if (
        typeof document.exitFullscreen ===
        "function"
      ) {

        await document.exitFullscreen();

      }

    }

  }

  catch (error) {

    console.warn(
      "HUNT: erro saindo do fullscreen:",
      error
    );

  }


  /*
    Remove o fallback visual.
  */

  huntFullscreen =
    false;


  document.body.classList.remove(
    "hunt-fullscreen-active"
  );


  if (viewerScreen) {

    viewerScreen.classList.remove(
      "hunt-player-fullscreen"
    );

  }


  if (container) {

    container.classList.remove(
      "hunt-fullscreen-container"
    );

  }


  updateFullscreenButtons();


  console.log(
    "HUNT: fullscreen desativado"
  );

}


/* ========================================
   FULLSCREEN REAL ALTERADO
======================================== */

document.addEventListener(
  "fullscreenchange",
  () => {

    const viewerScreen =
      document.getElementById(
        "viewerScreen"
      );

    const container =
      document.getElementById(
        "viewerContainer"
      );


    /*
      O usuário apertou ESC ou saiu pelo
      controle do navegador.
    */

    if (
      !document.fullscreenElement
    ) {

      if (huntFullscreen) {

        huntFullscreen =
          false;

        document.body.classList.remove(
          "hunt-fullscreen-active"
        );

        if (viewerScreen) {

          viewerScreen.classList.remove(
            "hunt-player-fullscreen"
          );

        }

        if (container) {

          container.classList.remove(
            "hunt-fullscreen-container"
          );

        }

        updateFullscreenButtons();

      }

    }

    else {

      /*
        Fullscreen real confirmado.
      */

      huntFullscreen =
        true;

      document.body.classList.add(
        "hunt-fullscreen-active"
      );

      if (viewerScreen) {

        viewerScreen.classList.add(
          "hunt-player-fullscreen"
        );

      }

      if (container) {

        container.classList.add(
          "hunt-fullscreen-container"
        );

      }

      updateFullscreenButtons();

    }

  }
);


/* ========================================
   BOTÃO FULLSCREEN
======================================== */

function updateFullscreenButtons() {

  const fullscreenButton =
    document.getElementById(
      "fullscreenButton"
    );


  if (!fullscreenButton) {
    return;
  }


  fullscreenButton.textContent =
    huntFullscreen
      ? "✕ SAIR DA TELA CHEIA"
      : "⛶ TELA CHEIA";

}


/* ========================================
   TECLA ESC
======================================== */

document.addEventListener(
  "keydown",
  async event => {

    if (
      event.key === "Escape" &&
      huntFullscreen
    ) {

      await exitHuntFullscreen();

    }

  }
);


/* ========================================
   ALTERAR MODO
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


  const wideButton =
    document.getElementById(
      "wideModeButton"
    );


  const normalButton =
    document.getElementById(
      "normalModeButton"
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


  if (wideButton) {

    wideButton.classList.toggle(
      "active",
      mode === "wide"
    );

  }


  if (normalButton) {

    normalButton.classList.toggle(
      "active",
      mode === "normal"
    );

  }


  console.log(
    "HUNT: modo do player:",
    mode
  );

}


/* ========================================
   STATUS VIEWER
======================================== */

function updateViewerStatus() {

  const status =
    document.getElementById(
      "viewerStatus"
    );


  if (!status) {
    return;
  }


  if (socket.connected) {

    status.textContent =
      "● CONECTADO";

  }

  else {

    status.textContent =
      "● CONECTANDO...";

  }

}


/* ========================================
   ATUALIZAR VIEWER
======================================== */

function refreshViewer() {

  console.log(
    "HUNT: atualizando transmissão"
  );


  closeViewer();


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


  const status =
    document.getElementById(
      "viewerStatus"
    );


  if (status) {

    status.textContent =
      "● PROCURANDO...";

  }


  if (socket.connected) {

    socket.emit(
      "join-room",
      ROOM_ID
    );

  }

}


/* ========================================
   FECHAR VIEWER
======================================== */

function closeViewer() {

  console.log(
    "HUNT: fechando viewer"
  );


  if (peer) {

    try {

      peer.ontrack =
        null;

      peer.onicecandidate =
        null;

      peer.onconnectionstatechange =
        null;

      peer.oniceconnectionstatechange =
        null;

      peer.close();

    }

    catch (error) {

      console.warn(
        "HUNT: erro fechando Peer:",
        error
      );

    }

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


  if (video) {

    try {

      video.pause();

    }

    catch {

      // ignorar

    }


    video.srcObject =
      null;

  }

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


    if (
      document.getElementById(
        "remoteVideo"
      )
    ) {

      socket.emit(
        "join-room",
        ROOM_ID
      );


      console.log(
        "HUNT: viewer entrou na sala após conexão"
      );

    }

  }
);


/* ========================================
   SOCKET DISCONNECT
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
   SOCKET ERROR
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
   TRANSMISSÃO DISPONÍVEL
======================================== */

socket.on(
  "stream-started",
  data => {

    console.log(
      "HUNT: transmissão disponível:",
      data
    );


    if (
      !data ||
      !data.broadcasterId
    ) {

      console.warn(
        "HUNT: broadcasterId não recebido"
      );

      return;

    }


    broadcasterId =
      data.broadcasterId;


    if (
      document.getElementById(
        "remoteVideo"
      )
    ) {

      createViewerPeer();

    }

  }
);


/* ========================================
   CRIAR PEER
======================================== */

function createViewerPeer() {

  console.log(
    "HUNT: criando RTCPeerConnection..."
  );


  if (peer) {

    try {

      peer.close();

    }

    catch {

      // ignorar

    }

  }


  peer =
    null;

  pendingCandidates =
    [];


  const RTC =
    window.RTCPeerConnection;


  const RTCCtor =
    typeof RTC === "function"
      ? RTC
      : window.webkitRTCPeerConnection;


  if (
    typeof RTCCtor !==
    "function"
  ) {

    console.error(
      "HUNT: RTCPeerConnection não disponível."
    );


    showViewerMessage(
      "WEBRTC NÃO ESTÁ DISPONÍVEL"
    );


    return;

  }


  try {

    peer =
      new RTCCtor(
        rtcConfig
      );

  }

  catch (error) {

    console.error(
      "HUNT: erro criando Peer:",
      error
    );


    peer =
      null;


    showViewerMessage(
      "ERRO AO INICIAR WEBRTC"
    );


    return;

  }


  /* ======================================
     TRACK
  ====================================== */

  peer.ontrack =
    event => {

      console.log(
        "HUNT: VÍDEO RECEBIDO"
      );


      const video =
        document.getElementById(
          "remoteVideo"
        );


      if (!video) {
        return;
      }


      if (
        event.streams &&
        event.streams.length > 0
      ) {

        video.srcObject =
          event.streams[0];

      }

      else {

        if (!video.srcObject) {

          try {

            const stream =
              new MediaStream();

            stream.addTrack(
              event.track
            );

            video.srcObject =
              stream;

          }

          catch (error) {

            console.error(
              "HUNT: erro MediaStream:",
              error
            );

          }

        }

      }


      video.volume =
        1;

      video.muted =
        false;


      video.play()
        .then(
          () => {

            console.log(
              "HUNT: vídeo reproduzindo"
            );

          }
        )
        .catch(
          error => {

            console.warn(
              "HUNT: autoplay bloqueado:",
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

    };


  /* ======================================
     ICE
  ====================================== */

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


  /* ======================================
     CONNECTION STATE
  ====================================== */

  peer.onconnectionstatechange =
    () => {

      if (!peer) {
        return;
      }


      console.log(
        "HUNT: estado WebRTC:",
        peer.connectionState
      );


      const status =
        document.getElementById(
          "viewerStatus"
        );


      if (
        peer.connectionState ===
        "connected"
      ) {

        if (status) {

          status.textContent =
            "🔴 TRANSMISSÃO AO VIVO";

        }

      }


      if (
        peer.connectionState ===
        "connecting"
      ) {

        if (status) {

          status.textContent =
            "● CONECTANDO À TRANSMISSÃO";

        }

      }


      if (
        peer.connectionState ===
        "failed"
      ) {

        showViewerMessage(
          "FALHA NA CONEXÃO COM A TRANSMISSÃO"
        );

      }


      if (
        peer.connectionState ===
        "disconnected"
      ) {

        showViewerMessage(
          "TRANSMISSÃO DESCONECTADA"
        );

      }

    };


  /* ======================================
     ICE STATE
  ====================================== */

  peer.oniceconnectionstatechange =
    () => {

      if (!peer) {
        return;
      }


      console.log(
        "HUNT: ICE:",
        peer.iceConnectionState
      );

    };

}


/* ========================================
   OFFER
======================================== */

socket.on(
  "webrtc-offer",
  async data => {

    console.log(
      "HUNT: OFFER recebida:",
      data
    );


    if (
      !data ||
      !data.sender ||
      !data.offer
    ) {

      return;

    }


    const video =
      document.getElementById(
        "remoteVideo"
      );


    if (!video) {
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


      if (
        pendingCandidates.length >
        0
      ) {

        for (
          const candidate
          of pendingCandidates
        ) {

          try {

            await peer.addIceCandidate(
              candidate
            );

          }

          catch (error) {

            console.warn(
              "HUNT: erro ICE pendente:",
              error
            );

          }

        }


        pendingCandidates =
          [];

      }


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


      console.log(
        "HUNT: ANSWER enviada"
      );

    }

    catch (error) {

      console.error(
        "HUNT: erro processando OFFER:",
        error
      );


      showViewerMessage(
        "ERRO AO CONECTAR À TRANSMISSÃO"
      );

    }

  }
);


/* ========================================
   ICE RECEBIDO
======================================== */

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


    if (!peer) {

      pendingCandidates.push(
        data.candidate
      );

      return;

    }


    if (
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
        "HUNT: erro aplicando ICE:",
        error
      );

    }

  }
);


/* ========================================
   TRANSMISSÃO PAROU
======================================== */

socket.on(
  "stream-stopped",
  data => {

    console.log(
      "HUNT: transmissão encerrada:",
      data
    );


    closeViewer();


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
   MENSAGEM VIEWER
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