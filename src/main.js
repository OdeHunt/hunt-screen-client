import { io } from "socket.io-client";
import {
  DiscordSDK,
  patchUrlMappings
} from "@discord/embedded-app-sdk";
import "./style.css";

const SERVER_URL = "https://hunt-screen-server.onrender.com";
const ROOM_ID = "hunt-screen-main";
const PRO_VERSION_URL = "https://hunt-screen-client.onrender.com/";

const isDiscordActivity =
  window.location.hostname.endsWith(".discordsays.com");

let discordSdk = null;
let discordSdkInitPromise = null;

let socket = null;
let peer = null;
let broadcasterId = null;
let pendingCandidates = [];

let currentPlayerMode = "wide";
let huntFullscreen = false;

/* =========================================================
   DISCORD SDK
========================================================= */

async function initializeDiscordSDK() {
  if (!isDiscordActivity) {
    return null;
  }

  if (discordSdk) {
    return discordSdk;
  }

  if (discordSdkInitPromise) {
    return discordSdkInitPromise;
  }

  discordSdkInitPromise = (async () => {
    const clientId =
      import.meta.env.VITE_DISCORD_CLIENT_ID;

    if (!clientId) {
      console.error(
        "VITE_DISCORD_CLIENT_ID não foi encontrado."
      );

      return null;
    }

    try {
      discordSdk = new DiscordSDK(clientId);

      await discordSdk.ready();

      console.log(
        "Discord SDK conectado."
      );

      return discordSdk;

    } catch (error) {
      console.error(
        "Erro ao inicializar Discord SDK:",
        error
      );

      discordSdk = null;

      return null;
    }
  })();

  return discordSdkInitPromise;
}

/* =========================================================
   SOCKET.IO
========================================================= */

if (isDiscordActivity) {
  patchUrlMappings([
    {
      prefix: "/hunt-socket",
      target: "hunt-screen-server.onrender.com"
    }
  ]);
}

socket = io(
  isDiscordActivity
    ? window.location.origin
    : SERVER_URL,
  {
    path: "/hunt-socket",
    transports: [
      "polling",
      "websocket"
    ],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
  }
);

/* =========================================================
   SOCKET STATUS
========================================================= */

socket.on("connect", () => {
  console.log(
    "Socket conectado:",
    socket.id
  );

  const status =
    document.getElementById(
      "viewerStatus"
    );

  if (status) {
    status.textContent =
      "🟢 CONECTADO AO SERVIDOR";
  }
});

socket.on("disconnect", () => {
  console.log(
    "Socket desconectado."
  );

  const status =
    document.getElementById(
      "viewerStatus"
    );

  if (status) {
    status.textContent =
      "🔴 DESCONECTADO";
  }
});

socket.on(
  "connect_error",
  (error) => {
    console.error(
      "Erro de conexão Socket.IO:",
      error
    );

    const status =
      document.getElementById(
        "viewerStatus"
      );

    if (status) {
      status.textContent =
        "🟡 CONECTANDO...";
    }
  }
);

/* =========================================================
   HOME
========================================================= */

function showHome() {
  document.body.classList.remove(
    "hunt-fullscreen-active"
  );

  huntFullscreen = false;

  document.body.innerHTML = `
    <div class="hunt-screen home-screen">

      <div class="hunt-logo">
        HUNT
      </div>

      <div class="hunt-subtitle">
        SCREEN
      </div>

      <div class="hunt-menu">

        <button
          id="spectatorButton"
          class="hunt-button"
        >
          👁️ ESPECTADOR
        </button>

        <button
          id="broadcastButton"
          class="hunt-button"
        >
          📺 TRANSMITIR
        </button>

      </div>

      <div class="hunt-status">
        HUNT SCREEN
      </div>

    </div>
  `;

  document
    .getElementById(
      "spectatorButton"
    )
    .addEventListener(
      "click",
      startViewer
    );

  document
    .getElementById(
      "broadcastButton"
    )
    .addEventListener(
      "click",
      openBroadcaster
    );
}

/* =========================================================
   BROADCASTER
========================================================= */

function openBroadcaster() {
  window.location.href =
    "/broadcaster.html";
}

/* =========================================================
   VERSÃO PRO
========================================================= */

async function openProVersion() {
  const url =
    PRO_VERSION_URL;

  console.log(
    "================================="
  );

  console.log(
    "🚀 BOTÃO VERSÃO PRO CLICADO"
  );

  console.log(
    "URL:",
    url
  );

  console.log(
    "Discord Activity:",
    isDiscordActivity
  );

  console.log(
    "SDK atual:",
    discordSdk
  );

  console.log(
    "================================="
  );

  /* =====================================================
     FORA DO DISCORD
  ===================================================== */

  if (!isDiscordActivity) {
    console.log(
      "🌐 Abrindo fora do Discord..."
    );

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );

    return;
  }

  /* =====================================================
     DENTRO DO DISCORD
  ===================================================== */

  try {
    console.log(
      "🔵 Inicializando Discord SDK..."
    );

    const sdk =
      await initializeDiscordSDK();

    if (!sdk) {
      console.error(
        "❌ Discord SDK não foi inicializado."
      );

      alert(
        "Não foi possível conectar ao Discord."
      );

      return;
    }

    console.log(
      "✅ Discord SDK inicializado:",
      sdk
    );

    if (!sdk.commands) {
      console.error(
        "❌ sdk.commands não existe."
      );

      alert(
        "O Discord SDK não disponibilizou os comandos."
      );

      return;
    }

    if (
      typeof sdk.commands.openExternalLink !==
      "function"
    ) {
      console.error(
        "❌ openExternalLink não está disponível."
      );

      console.log(
        "Comandos disponíveis:",
        Object.keys(sdk.commands)
      );

      alert(
        "O Discord não disponibilizou a abertura de links externos."
      );

      return;
    }

    console.log(
      "🟢 Abrindo link externo..."
    );

    const result =
      await sdk.commands.openExternalLink({
        url: url
      });

    console.log(
      "✅ openExternalLink executado:",
      result
    );

  } catch (error) {
    console.error(
      "❌ ERRO AO ABRIR VERSÃO PRO:",
      error
    );

    alert(
      "Não foi possível abrir a Versão Pro."
    );
  }
}

/* =========================================================
   VIEWER
========================================================= */

function startViewer() {
  document.body.classList.remove(
    "hunt-fullscreen-active"
  );

  huntFullscreen = false;

  document.body.innerHTML = `
    <div class="hunt-screen viewer-screen">

      <header class="viewer-header">

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
            class="mode-button active"
          >
            WIDE
          </button>

          <button
            id="normalModeButton"
            class="mode-button"
          >
            NORMAL
          </button>

        </div>

      </header>

      <div
        id="viewerContainer"
        class="viewer-container wide-mode"
      >

        <div
          id="viewerMessage"
          class="viewer-message"
        >
          📺 NENHUMA TRANSMISSÃO ATIVA
        </div>

        <video
          id="remoteVideo"
          autoplay
          playsinline
          controls
          preload="none"
        ></video>

      </div>

      <div class="viewer-bottom">

        <div class="viewer-controls">

          <button
            id="refreshButton"
            class="hunt-button small-button"
          >
            🔄 ATUALIZAR
          </button>

          <button
            id="fullscreenButton"
            class="hunt-button small-button"
          >
            ⛶ TELA CHEIA
          </button>

          <button
            id="proButton"
            class="hunt-button small-button pro-button"
          >
            🚀 VERSÃO PRO
          </button>

          <button
            id="backButton"
            class="hunt-button small-button secondary"
          >
            ← VOLTAR
          </button>

        </div>

        <div
          id="viewerStatus"
          class="hunt-status"
        >
          🟡 CONECTANDO...
        </div>

      </div>

    </div>
  `;

  const remoteVideo =
    document.getElementById(
      "remoteVideo"
    );

  const viewerMessage =
    document.getElementById(
      "viewerMessage"
    );

  const viewerContainer =
    document.getElementById(
      "viewerContainer"
    );

  const refreshButton =
    document.getElementById(
      "refreshButton"
    );

  const fullscreenButton =
    document.getElementById(
      "fullscreenButton"
    );

  const proButton =
    document.getElementById(
      "proButton"
    );

  const backButton =
    document.getElementById(
      "backButton"
    );

  const wideModeButton =
    document.getElementById(
      "wideModeButton"
    );

  const normalModeButton =
    document.getElementById(
      "normalModeButton"
    );

  /* =======================================================
     WIDE
  ======================================================= */

  wideModeButton.addEventListener(
    "click",
    () => {
      currentPlayerMode =
        "wide";

      viewerContainer.classList.remove(
        "normal-mode"
      );

      viewerContainer.classList.add(
        "wide-mode"
      );

      wideModeButton.classList.add(
        "active"
      );

      normalModeButton.classList.remove(
        "active"
      );
    }
  );

  /* =======================================================
     NORMAL
  ======================================================= */

  normalModeButton.addEventListener(
    "click",
    () => {
      currentPlayerMode =
        "normal";

      viewerContainer.classList.remove(
        "wide-mode"
      );

      viewerContainer.classList.add(
        "normal-mode"
      );

      normalModeButton.classList.add(
        "active"
      );

      wideModeButton.classList.remove(
        "active"
      );
    }
  );

  /* =======================================================
     ATUALIZAR
  ======================================================= */

  refreshButton.addEventListener(
    "click",
    () => {
      if (peer) {
        try {
          peer.close();
        } catch {}
      }

      peer = null;
      broadcasterId = null;
      pendingCandidates = [];

      remoteVideo.srcObject =
        null;

      viewerMessage.style.display =
        "flex";

      viewerMessage.textContent =
        "🔄 PROCURANDO TRANSMISSÃO...";

      if (socket.connected) {
        socket.emit(
          "join-room",
          ROOM_ID
        );
      }
    }
  );

  /* =======================================================
     VERSÃO PRO
  ======================================================= */

  proButton.addEventListener(
    "click",
    openProVersion
  );

  /* =======================================================
     VOLTAR
  ======================================================= */

  backButton.addEventListener(
    "click",
    () => {
      if (peer) {
        try {
          peer.close();
        } catch {}
      }

      peer = null;
      broadcasterId = null;
      pendingCandidates = [];

      remoteVideo.srcObject =
        null;

      showHome();
    }
  );

  /* =======================================================
     FULLSCREEN
  ======================================================= */

  fullscreenButton.addEventListener(
    "click",
    toggleFullscreen
  );

  updateFullscreenButtons();

  /* =======================================================
     ENTRAR NA SALA
  ======================================================= */

  if (socket.connected) {
    socket.emit(
      "join-room",
      ROOM_ID
    );
  }

  viewerMessage.style.display =
    "flex";

  viewerMessage.textContent =
    "🟡 PROCURANDO TRANSMISSÃO...";
}

/* =========================================================
   WEBRTC
========================================================= */

function createViewerPeer(
  targetId
) {
  const RTCPeerConnectionClass =
    window.RTCPeerConnection ||
    window.webkitRTCPeerConnection;

  if (!RTCPeerConnectionClass) {
    console.error(
      "WebRTC não está disponível."
    );

    const message =
      document.getElementById(
        "viewerMessage"
      );

    if (message) {
      message.style.display =
        "flex";

      message.textContent =
        "⚠️ WEBRTC NÃO DISPONÍVEL";
    }

    return null;
  }

  const connection =
    new RTCPeerConnectionClass({
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
    });

  connection.onicecandidate =
    (event) => {
      if (
        event.candidate &&
        targetId
      ) {
        socket.emit(
          "webrtc-ice-candidate",
          {
            target:
              targetId,
            candidate:
              event.candidate
          }
        );
      }
    };

  connection.ontrack =
    async (event) => {
      const video =
        document.getElementById(
          "remoteVideo"
        );

      const message =
        document.getElementById(
          "viewerMessage"
        );

      const status =
        document.getElementById(
          "viewerStatus"
        );

      if (!video) {
        return;
      }

      if (
        event.streams &&
        event.streams[0]
      ) {
        video.srcObject =
          event.streams[0];
      } else {
        const stream =
          new MediaStream();

        stream.addTrack(
          event.track
        );

        video.srcObject =
          stream;
      }

      video.muted = false;
      video.volume = 1;

      try {
        await video.play();
      } catch (error) {
        console.warn(
          "Autoplay bloqueado:",
          error
        );
      }

      if (message) {
        message.style.display =
          "none";
      }

      if (status) {
        status.textContent =
          "🟢 TRANSMISSÃO AO VIVO";
      }
    };

  connection.onconnectionstatechange =
    () => {
      console.log(
        "Estado WebRTC:",
        connection.connectionState
      );

      const status =
        document.getElementById(
          "viewerStatus"
        );

      if (!status) {
        return;
      }

      if (
        connection.connectionState ===
        "connected"
      ) {
        status.textContent =
          "🟢 TRANSMISSÃO AO VIVO";
      }

      if (
        connection.connectionState ===
        "connecting"
      ) {
        status.textContent =
          "🟡 CONECTANDO À TRANSMISSÃO...";
      }

      if (
        connection.connectionState ===
        "disconnected"
      ) {
        status.textContent =
          "🟠 TRANSMISSÃO DESCONECTADA";
      }

      if (
        connection.connectionState ===
          "failed" ||
        connection.connectionState ===
          "closed"
      ) {
        status.textContent =
          "🔴 TRANSMISSÃO ENCERRADA";
      }
    };

  return connection;
}

/* =========================================================
   STREAM STARTED
========================================================= */

socket.on(
  "stream-started",
  (data) => {
    console.log(
      "Transmissão iniciada:",
      data
    );

    const message =
      document.getElementById(
        "viewerMessage"
      );

    const status =
      document.getElementById(
        "viewerStatus"
      );

    if (message) {
      message.style.display =
        "flex";

      message.textContent =
        "🟡 CONECTANDO À TRANSMISSÃO...";
    }

    if (status) {
      status.textContent =
        "🟡 TRANSMISSÃO ENCONTRADA";
    }

    if (
      data &&
      data.broadcasterId
    ) {
      broadcasterId =
        data.broadcasterId;
    }

    if (broadcasterId) {
      socket.emit(
        "viewer-joined",
        {
          roomId:
            ROOM_ID,
          broadcasterId
        }
      );
    }
  }
);

/* =========================================================
   VIEWER JOINED
========================================================= */

socket.on(
  "viewer-joined",
  (data) => {
    console.log(
      "Viewer entrou:",
      data
    );
  }
);

/* =========================================================
   WEBRTC OFFER
========================================================= */

socket.on(
  "webrtc-offer",
  async (data) => {
    console.log(
      "Oferta WebRTC recebida:",
      data
    );

    if (!data) {
      return;
    }

    const senderId =
      data.sender ||
      data.from ||
      data.broadcasterId;

    const offer =
      data.offer ||
      data.description;

    if (!offer) {
      console.error(
        "Oferta WebRTC inválida."
      );

      return;
    }

    broadcasterId =
      senderId ||
      broadcasterId;

    if (peer) {
      try {
        peer.close();
      } catch {}
    }

    peer =
      createViewerPeer(
        broadcasterId
      );

    if (!peer) {
      return;
    }

    try {
      await peer.setRemoteDescription(
        new RTCSessionDescription(
          offer
        )
      );

      for (
        const candidate of
        pendingCandidates
      ) {
        try {
          await peer.addIceCandidate(
            new RTCIceCandidate(
              candidate
            )
          );
        } catch (error) {
          console.warn(
            "Erro ao adicionar ICE pendente:",
            error
          );
        }
      }

      pendingCandidates = [];

      const answer =
        await peer.createAnswer();

      await peer.setLocalDescription(
        answer
      );

      socket.emit(
        "webrtc-answer",
        {
          target:
            broadcasterId,
          answer:
            peer.localDescription
        }
      );

      console.log(
        "Resposta WebRTC enviada."
      );

    } catch (error) {
      console.error(
        "Erro ao processar oferta WebRTC:",
        error
      );
    }
  }
);

/* =========================================================
   WEBRTC ICE
========================================================= */

socket.on(
  "webrtc-ice-candidate",
  async (data) => {
    if (!data) {
      return;
    }

    const candidate =
      data.candidate;

    if (!candidate) {
      return;
    }

    if (!peer) {
      pendingCandidates.push(
        candidate
      );

      return;
    }

    try {
      await peer.addIceCandidate(
        new RTCIceCandidate(
          candidate
        )
      );

    } catch (error) {
      console.warn(
        "Erro ao adicionar ICE:",
        error
      );
    }
  }
);

/* =========================================================
   STREAM STOPPED
========================================================= */

socket.on(
  "stream-stopped",
  () => {
    console.log(
      "Transmissão encerrada."
    );

    if (peer) {
      try {
        peer.close();
      } catch {}
    }

    peer = null;
    broadcasterId = null;
    pendingCandidates = [];

    const video =
      document.getElementById(
        "remoteVideo"
      );

    const message =
      document.getElementById(
        "viewerMessage"
      );

    const status =
      document.getElementById(
        "viewerStatus"
      );

    if (video) {
      video.srcObject =
        null;
    }

    if (message) {
      message.style.display =
        "flex";

      message.textContent =
        "📺 NENHUMA TRANSMISSÃO ATIVA";
    }

    if (status) {
      status.textContent =
        "⚪ AGUARDANDO TRANSMISSÃO";
    }
  }
);

/* =========================================================
   FULLSCREEN
========================================================= */

async function toggleFullscreen() {
  const viewerScreen =
    document.querySelector(
      ".viewer-screen"
    );

  if (!viewerScreen) {
    return;
  }

  const isNativeFullscreen =
    document.fullscreenElement ||
    document.webkitFullscreenElement;

  if (isNativeFullscreen) {
    try {
      if (
        document.exitFullscreen
      ) {
        await document.exitFullscreen();

      } else if (
        document.webkitExitFullscreen
      ) {
        await document.webkitExitFullscreen();
      }

    } catch (error) {
      console.warn(
        "Erro ao sair do fullscreen:",
        error
      );
    }

    huntFullscreen = false;

    document.body.classList.remove(
      "hunt-fullscreen-active"
    );

    updateFullscreenButtons();

    return;
  }

  try {
    if (
      viewerScreen.requestFullscreen
    ) {
      await viewerScreen.requestFullscreen();

      huntFullscreen = true;

      document.body.classList.add(
        "hunt-fullscreen-active"
      );

    } else if (
      viewerScreen.webkitRequestFullscreen
    ) {
      viewerScreen.webkitRequestFullscreen();

      huntFullscreen = true;

      document.body.classList.add(
        "hunt-fullscreen-active"
      );

    } else {
      huntFullscreen =
        !huntFullscreen;

      document.body.classList.toggle(
        "hunt-fullscreen-active",
        huntFullscreen
      );
    }

  } catch (error) {
    console.warn(
      "Fullscreen nativo indisponível:",
      error
    );

    huntFullscreen =
      !huntFullscreen;

    document.body.classList.toggle(
      "hunt-fullscreen-active",
      huntFullscreen
    );
  }

  updateFullscreenButtons();
}

/* =========================================================
   FULLSCREEN CHANGE
========================================================= */

document.addEventListener(
  "fullscreenchange",
  () => {
    huntFullscreen =
      !!document.fullscreenElement;

    document.body.classList.toggle(
      "hunt-fullscreen-active",
      huntFullscreen
    );

    updateFullscreenButtons();
  }
);

document.addEventListener(
  "webkitfullscreenchange",
  () => {
    huntFullscreen =
      !!document.webkitFullscreenElement;

    document.body.classList.toggle(
      "hunt-fullscreen-active",
      huntFullscreen
    );

    updateFullscreenButtons();
  }
);

/* =========================================================
   FULLSCREEN BUTTON
========================================================= */

function updateFullscreenButtons() {
  const button =
    document.getElementById(
      "fullscreenButton"
    );

  if (!button) {
    return;
  }

  const nativeFullscreen =
    document.fullscreenElement ||
    document.webkitFullscreenElement;

  if (
    nativeFullscreen ||
    huntFullscreen
  ) {
    button.textContent =
      "⛶ SAIR DA TELA CHEIA";
  } else {
    button.textContent =
      "⛶ TELA CHEIA";
  }
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

initializeDiscordSDK();

showHome();