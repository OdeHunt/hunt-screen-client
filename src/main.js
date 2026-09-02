import { io } from "socket.io-client";
import { patchUrlMappings } from "@discord/embedded-app-sdk";
import "./style.css";

const SERVER_URL = "https://hunt-screen-server.onrender.com";
const ROOM_ID = "hunt-screen-main";

const isDiscordActivity =
  window.location.hostname.endsWith(".discordsays.com");

if (isDiscordActivity) {
  patchUrlMappings([
    {
      prefix: "/hunt-socket",
      target: "hunt-screen-server.onrender.com"
    }
  ]);
}

const socket = io(
  isDiscordActivity ? window.location.origin : SERVER_URL,
  {
    path: "/hunt-socket",
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
  }
);

const rtcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    }
  ]
};

let currentPlayerMode = "wide";
let huntFullscreen = false;

let viewerPeer = null;
let viewerRemoteDescriptionSet = false;
let viewerPendingCandidates = [];

let currentView = "home";


// ======================================================
// SOCKET
// ======================================================

socket.on("connect", () => {
  console.log("Socket conectado:", socket.id);

  if (currentView === "viewer") {
    socket.emit("join-room", ROOM_ID);
  }
});

socket.on("connect_error", (error) => {
  console.error("Erro de conexão:", error);
});

socket.on("disconnect", (reason) => {
  console.log("Socket desconectado:", reason);
});


// ======================================================
// HOME
// ======================================================

function showHome() {
  currentView = "home";

  cleanupViewer();

  document.body.classList.remove("hunt-fullscreen-active");
  document.body.classList.remove("hunt-player-fullscreen");
  document.body.classList.remove("hunt-fullscreen-container");

  huntFullscreen = false;

  document.body.innerHTML = `
    <main class="home-screen">

      <div class="home-logo">
        <div class="hunt-logo">HUNT</div>
        <div class="screen-logo">SCREEN</div>
      </div>

      <div class="home-subtitle">
        TRANSMISSÃO DE TELA
      </div>

      <div class="home-buttons">

        <button id="viewerButton" class="home-button">
          👁️ ESPECTADOR
        </button>

        <button id="broadcasterButton" class="home-button">
          📺 TRANSMITIR
        </button>

      </div>

    </main>
  `;

  document
    .getElementById("viewerButton")
    .addEventListener("click", startViewer);

  document
    .getElementById("broadcasterButton")
    .addEventListener("click", openBroadcaster);
}


// ======================================================
// ABRIR BROADCASTER
// ======================================================

function openBroadcaster() {
  window.location.href = "/broadcaster.html";
}


// ======================================================
// VIEWER
// ======================================================

function startViewer() {
  currentView = "viewer";

  document.body.innerHTML = `
    <main class="viewer-screen">

      <header class="viewer-header">

        <div class="viewer-brand">
          <span class="hunt-logo">HUNT</span>
          <span class="screen-logo">SCREEN</span>
        </div>

        <div class="viewer-mode-selector">

          <button
            id="wideModeButton"
            class="viewer-mode-button active"
          >
            WIDE
          </button>

          <button
            id="normalModeButton"
            class="viewer-mode-button"
          >
            NORMAL
          </button>

        </div>

      </header>


      <section
        id="viewerContainer"
        class="viewer-container wide-mode"
      >

        <video
          id="remoteVideo"
          autoplay
          playsinline
          controls
          preload="none"
        ></video>

        <div id="viewerMessage" class="viewer-message">
          <div class="viewer-message-title">
            NENHUMA TRANSMISSÃO
          </div>

          <div class="viewer-message-text">
            Aguardando alguém começar uma transmissão...
          </div>
        </div>

      </section>


      <div class="viewer-controls">

        <button
          id="refreshViewerButton"
          class="viewer-control-button"
        >
          🔄 ATUALIZAR
        </button>

        <button
          id="fullscreenButton"
          class="viewer-control-button fullscreen-control-button"
        >
          ⛶ TELA CHEIA
        </button>

        <button
          id="backViewerButton"
          class="viewer-control-button back-button"
        >
          ← VOLTAR
        </button>

      </div>

    </main>
  `;

  const wideModeButton =
    document.getElementById("wideModeButton");

  const normalModeButton =
    document.getElementById("normalModeButton");

  const viewerContainer =
    document.getElementById("viewerContainer");

  const remoteVideo =
    document.getElementById("remoteVideo");

  const viewerMessage =
    document.getElementById("viewerMessage");

  const refreshViewerButton =
    document.getElementById("refreshViewerButton");

  const fullscreenButton =
    document.getElementById("fullscreenButton");

  const backViewerButton =
    document.getElementById("backViewerButton");


  // ====================================================
  // MODO WIDE
  // ====================================================

  wideModeButton.addEventListener("click", () => {
    currentPlayerMode = "wide";

    viewerContainer.classList.remove("normal-mode");
    viewerContainer.classList.add("wide-mode");

    wideModeButton.classList.add("active");
    normalModeButton.classList.remove("active");
  });


  // ====================================================
  // MODO NORMAL
  // ====================================================

  normalModeButton.addEventListener("click", () => {
    currentPlayerMode = "normal";

    viewerContainer.classList.remove("wide-mode");
    viewerContainer.classList.add("normal-mode");

    normalModeButton.classList.add("active");
    wideModeButton.classList.remove("active");
  });


  // ====================================================
  // ATUALIZAR
  // ====================================================

  refreshViewerButton.addEventListener("click", () => {
    cleanupViewer();

    viewerMessage.style.display = "flex";

    viewerMessage.innerHTML = `
      <div class="viewer-message-title">
        ATUALIZANDO...
      </div>

      <div class="viewer-message-text">
        Procurando uma transmissão ativa...
      </div>
    `;

    setTimeout(() => {
      if (socket.connected) {
        socket.emit("join-room", ROOM_ID);
      }
    }, 300);
  });


  // ====================================================
  // TELA CHEIA
  // ====================================================

  fullscreenButton.addEventListener("click", () => {
    toggleHuntFullscreen();
  });


  // ====================================================
  // VOLTAR
  // ====================================================

  backViewerButton.addEventListener("click", () => {
    showHome();
  });


  // ====================================================
  // SOCKET JOIN
  // ====================================================

  if (socket.connected) {
    socket.emit("join-room", ROOM_ID);
  }


  // ====================================================
  // FUNÇÃO DE TELA CHEIA
  // ====================================================

  function updateFullscreenButtons() {
    const button =
      document.getElementById("fullscreenButton");

    if (!button) return;

    if (huntFullscreen) {
      button.textContent = "✕ SAIR DA TELA CHEIA";
    } else {
      button.textContent = "⛶ TELA CHEIA";
    }
  }

  updateFullscreenButtons();
}


// ======================================================
// TELA CHEIA HUNT
// ======================================================

async function toggleHuntFullscreen() {
  if (huntFullscreen) {
    await exitHuntFullscreen();
  } else {
    await enterHuntFullscreen();
  }
}


async function enterHuntFullscreen() {
  const viewerScreen =
    document.querySelector(".viewer-screen");

  if (!viewerScreen) return;

  try {
    if (viewerScreen.requestFullscreen) {
      await viewerScreen.requestFullscreen();
    }
  } catch (error) {
    console.warn(
      "Fullscreen nativo indisponível:",
      error
    );
  }

  huntFullscreen = true;

  document.body.classList.add(
    "hunt-fullscreen-active"
  );

  document.body.classList.add(
    "hunt-player-fullscreen"
  );

  document.body.classList.add(
    "hunt-fullscreen-container"
  );

  updateFullscreenState();
}


async function exitHuntFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
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

  document.body.classList.remove(
    "hunt-player-fullscreen"
  );

  document.body.classList.remove(
    "hunt-fullscreen-container"
  );

  updateFullscreenState();
}


function updateFullscreenState() {
  const fullscreenButton =
    document.getElementById("fullscreenButton");

  if (fullscreenButton) {
    if (huntFullscreen) {
      fullscreenButton.textContent =
        "✕ SAIR DA TELA CHEIA";
    } else {
      fullscreenButton.textContent =
        "⛶ TELA CHEIA";
    }
  }
}


// ======================================================
// FULLSCREEN CHANGE
// ======================================================

document.addEventListener(
  "fullscreenchange",
  () => {

    if (!document.fullscreenElement) {

      huntFullscreen = false;

      document.body.classList.remove(
        "hunt-fullscreen-active"
      );

      document.body.classList.remove(
        "hunt-player-fullscreen"
      );

      document.body.classList.remove(
        "hunt-fullscreen-container"
      );

    } else {

      huntFullscreen = true;

      document.body.classList.add(
        "hunt-fullscreen-active"
      );

      document.body.classList.add(
        "hunt-player-fullscreen"
      );

      document.body.classList.add(
        "hunt-fullscreen-container"
      );
    }

    updateFullscreenState();
  }
);


// ======================================================
// ESCAPE
// ======================================================

document.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Escape" &&
      huntFullscreen
    ) {
      exitHuntFullscreen();
    }

  }
);


// ======================================================
// WEBRTC — VIEWER
// ======================================================

socket.on("stream-started", () => {

  if (currentView !== "viewer") {
    return;
  }

  const viewerMessage =
    document.getElementById("viewerMessage");

  if (viewerMessage) {
    viewerMessage.style.display = "none";
  }
});


socket.on("viewer-joined", () => {

  if (currentView !== "viewer") {
    return;
  }

  console.log(
    "Outro usuário entrou na sala."
  );
});


socket.on("webrtc-offer", async (offer) => {

  if (currentView !== "viewer") {
    return;
  }

  try {

    cleanupViewerPeer();

    viewerPeer =
      new RTCPeerConnection(rtcConfig);

    viewerRemoteDescriptionSet = false;
    viewerPendingCandidates = [];


    viewerPeer.ontrack = (event) => {

      const remoteVideo =
        document.getElementById("remoteVideo");

      if (!remoteVideo) return;

      if (
        event.streams &&
        event.streams[0]
      ) {
        remoteVideo.srcObject =
          event.streams[0];
      } else {

        const stream =
          new MediaStream();

        stream.addTrack(event.track);

        remoteVideo.srcObject =
          stream;
      }

      remoteVideo.volume = 1;
      remoteVideo.muted = false;

      const playPromise =
        remoteVideo.play();

      if (playPromise) {
        playPromise.catch(
          (error) => {
            console.warn(
              "Autoplay bloqueado:",
              error
            );
          }
        );
      }

      const viewerMessage =
        document.getElementById(
          "viewerMessage"
        );

      if (viewerMessage) {
        viewerMessage.style.display =
          "none";
      }
    };


    viewerPeer.onicecandidate =
      (event) => {

        if (
          event.candidate
        ) {

          socket.emit(
            "webrtc-ice-candidate",
            {
              roomId: ROOM_ID,
              candidate:
                event.candidate
            }
          );

        }

      };


    viewerPeer.onconnectionstatechange =
      () => {

        if (!viewerPeer) return;

        console.log(
          "Estado WebRTC:",
          viewerPeer.connectionState
        );

        if (
          viewerPeer.connectionState ===
            "failed" ||
          viewerPeer.connectionState ===
            "disconnected" ||
          viewerPeer.connectionState ===
            "closed"
        ) {

          const viewerMessage =
            document.getElementById(
              "viewerMessage"
            );

          if (viewerMessage) {

            viewerMessage.style.display =
              "flex";

            viewerMessage.innerHTML = `
              <div class="viewer-message-title">
                CONEXÃO PERDIDA
              </div>

              <div class="viewer-message-text">
                A transmissão foi desconectada.
              </div>
            `;

          }

        }

      };


    await viewerPeer.setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    viewerRemoteDescriptionSet = true;


    // Aplicar ICE pendente
    for (
      const candidate of
      viewerPendingCandidates
    ) {

      try {

        await viewerPeer.addIceCandidate(
          candidate
        );

      } catch (error) {

        console.warn(
          "Erro ao aplicar ICE pendente:",
          error
        );

      }

    }

    viewerPendingCandidates = [];


    const answer =
      await viewerPeer.createAnswer();

    await viewerPeer.setLocalDescription(
      answer
    );


    socket.emit(
      "webrtc-answer",
      {
        roomId: ROOM_ID,
        answer:
          viewerPeer.localDescription
      }
    );

  } catch (error) {

    console.error(
      "Erro ao processar oferta WebRTC:",
      error
    );

  }

});


socket.on(
  "webrtc-ice-candidate",
  async (candidate) => {

    if (
      currentView !== "viewer"
    ) {
      return;
    }

    if (
      !candidate
    ) {
      return;
    }


    try {

      const iceCandidate =
        new RTCIceCandidate(
          candidate
        );


      if (
        viewerPeer &&
        viewerRemoteDescriptionSet
      ) {

        await viewerPeer.addIceCandidate(
          iceCandidate
        );

      } else {

        viewerPendingCandidates.push(
          iceCandidate
        );

      }

    } catch (error) {

      console.warn(
        "Erro ao adicionar ICE candidate:",
        error
      );

    }

  }
);


socket.on(
  "stream-stopped",
  () => {

    if (
      currentView !== "viewer"
    ) {
      return;
    }

    cleanupViewerPeer();


    const remoteVideo =
      document.getElementById(
        "remoteVideo"
      );

    if (remoteVideo) {
      remoteVideo.srcObject = null;
    }


    const viewerMessage =
      document.getElementById(
        "viewerMessage"
      );

    if (viewerMessage) {

      viewerMessage.style.display =
        "flex";

      viewerMessage.innerHTML = `
        <div class="viewer-message-title">
          TRANSMISSÃO ENCERRADA
        </div>

        <div class="viewer-message-text">
          A transmissão foi encerrada.
        </div>
      `;

    }

  }
);


// ======================================================
// LIMPEZA WEBRTC
// ======================================================

function cleanupViewerPeer() {

  if (viewerPeer) {

    try {
      viewerPeer.ontrack = null;
      viewerPeer.onicecandidate = null;
      viewerPeer.onconnectionstatechange = null;
      viewerPeer.close();
    } catch (error) {
      console.warn(
        "Erro ao fechar peer:",
        error
      );
    }

  }

  viewerPeer = null;

  viewerRemoteDescriptionSet = false;

  viewerPendingCandidates = [];
}


function cleanupViewer() {

  cleanupViewerPeer();

  const remoteVideo =
    document.getElementById(
      "remoteVideo"
    );

  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }

  if (socket.connected) {
    socket.emit(
      "leave-room",
      ROOM_ID
    );
  }
}


// ======================================================
// INICIALIZAÇÃO
// ======================================================

showHome();