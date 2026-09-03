import { io } from "socket.io-client";
import "./style.css";

/* ========================================
   CONFIGURAÇÃO
======================================== */

const SERVER_URL =
  "https://hunt-screen-server.onrender.com";

/* ========================================
   SOCKET.IO
======================================== */

const socket = io(
  SERVER_URL,
  {
    path: "/hunt-socket",

    transports: [
      "polling",
      "websocket"
    ],

    reconnection: true,

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
   ELEMENTO PRINCIPAL
======================================== */

const app =
  document.getElementById("app");

if (!app) {

  console.error(
    "HUNT: elemento #app não encontrado."
  );

}

/* ========================================
   ESTADO DA APLICAÇÃO
======================================== */

let currentScreen =
  "home";

let currentRole =
  null;

let currentRoom =
  null;

let currentAccessToken =
  null;

let rooms = [];

let roomsRefreshInterval =
  null;

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
   RTC CONFIG
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
   PLAYER
======================================== */

let currentPlayerMode =
  "wide";

let huntFullscreen =
  false;

/* ========================================
   SOCKET STATUS
======================================== */

socket.on(
  "connect",
  () => {

    console.log(
      "HUNT SERVER conectado:",
      socket.id
    );

    updateGlobalStatus();

    updateRoomStatus();

  }
);

socket.on(
  "disconnect",
  reason => {

    console.warn(
      "HUNT: servidor desconectado:",
      reason
    );

    updateGlobalStatus();

    updateRoomStatus();

  }
);

socket.on(
  "connect_error",
  error => {

    console.error(
      "HUNT: erro de conexão:",
      error
    );

    updateGlobalStatus();

    updateRoomStatus();

  }
);

/* ========================================
   HOME
======================================== */

function showHome() {

  currentScreen =
    "home";

  currentRole =
    null;

  currentRoom =
    null;

  currentAccessToken =
    null;

  stopRoomsRefresh();

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
      () => {

        openRooms(
          "viewer"
        );

      }
    );

  }

  if (broadcastButton) {

    broadcastButton.addEventListener(
      "click",
      () => {

        openRooms(
          "broadcaster"
        );

      }
    );

  }

  updateGlobalStatus();

}

/* ========================================
   STATUS HOME
======================================== */

function updateGlobalStatus() {

  const status =
    document.getElementById(
      "homeStatus"
    );

  if (!status) return;

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
   ABRIR SALAS
======================================== */

async function openRooms(
  role
) {

  currentRole =
    role;

  currentScreen =
    "rooms";

  closeViewer();

  huntFullscreen =
    false;

  document.body.classList.remove(
    "hunt-fullscreen-active"
  );

  renderRoomsScreen();

  await loadRooms();

  startRoomsRefresh();

}

/* ========================================
   TELA DE SALAS
======================================== */

function renderRoomsScreen() {

  app.innerHTML = `

    <div class="hunt-screen rooms-screen">

      <div class="rooms-header">

        <div class="rooms-title">

          <span class="rooms-title-main">
            HUNT
          </span>

          <span class="rooms-title-divider">
            /
          </span>

          <span class="rooms-title-sub">
            SALAS
          </span>

        </div>

        <button
          id="roomsBackButton"
          class="hunt-button secondary small-button">

          ← VOLTAR

        </button>

      </div>


      <div class="rooms-role">

        ${
          currentRole ===
          "broadcaster"

            ? "📺 ESCOLHA UMA SALA PARA TRANSMITIR"

            : "👁️ ESCOLHA UMA SALA PARA ASSISTIR"
        }

      </div>


      <div
        id="roomsList"
        class="rooms-list">

        <div class="rooms-loading">

          CARREGANDO SALAS...

        </div>

      </div>


      <button
        id="createRoomButton"
        class="create-room-button"
        type="button"
        aria-label="Criar sala">

        +

      </button>


      <div
        id="roomsStatus"
        class="hunt-status">

        CONECTANDO...

      </div>

    </div>

  `;

  const backButton =
    document.getElementById(
      "roomsBackButton"
    );

  const createButton =
    document.getElementById(
      "createRoomButton"
    );

  if (backButton) {

    backButton.addEventListener(
      "click",
      () => {

        stopRoomsRefresh();

        showHome();

      }
    );

  }

  if (createButton) {

    createButton.addEventListener(
      "click",
      showCreateRoom
    );

  }

  updateRoomStatus();

}

/* ========================================
   STATUS SALAS
======================================== */

function updateRoomStatus() {

  const status =
    document.getElementById(
      "roomsStatus"
    );

  if (!status) return;

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
   CARREGAR SALAS
======================================== */

async function loadRooms() {

  const list =
    document.getElementById(
      "roomsList"
    );

  if (!list) return;

  try {

    const response =
      await fetch(
        `${SERVER_URL}/api/rooms`,
        {
          method:
            "GET",

          cache:
            "no-store"
        }
      );

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }

    const data =
      await response.json();

    rooms =
      Array.isArray(data.rooms)
        ? data.rooms
        : [];

    renderRoomsList();

  }

  catch (error) {

    console.error(
      "HUNT: erro carregando salas:",
      error
    );

    list.innerHTML = `

      <div class="rooms-empty">

        NÃO FOI POSSÍVEL CARREGAR AS SALAS

        <button
          id="retryRoomsButton"
          class="hunt-button small-button">

          🔄 TENTAR NOVAMENTE

        </button>

      </div>

    `;

    const retryButton =
      document.getElementById(
        "retryRoomsButton"
      );

    if (retryButton) {

      retryButton.addEventListener(
        "click",
        loadRooms
      );

    }

  }

}

/* ========================================
   RENDERIZAR SALAS
======================================== */

function renderRoomsList() {

  const list =
    document.getElementById(
      "roomsList"
    );

  if (!list) return;

  if (!rooms.length) {

    list.innerHTML = `

      <div class="rooms-empty">

        <div class="rooms-empty-icon">
          📺
        </div>

        <div class="rooms-empty-title">
          NENHUMA SALA ATIVA
        </div>

        <div class="rooms-empty-text">

          ${
            currentRole ===
            "broadcaster"

              ? "Clique no + para criar uma sala."

              : "Aguarde alguém criar uma sala."
          }

        </div>

      </div>

    `;

    return;

  }

  list.innerHTML =
    rooms
      .map(
        room => {

          const live =
            Boolean(
              room.live
            );

          return `

            <button
              class="room-card"
              data-room-id="${escapeHtml(room.id)}"
              type="button">

              <div class="room-card-left">

                <div class="room-card-icon">

                  ${
                    live
                      ? "🔴"
                      : "⚫"
                  }

                </div>

                <div class="room-card-info">

                  <div class="room-card-name">

                    ${escapeHtml(room.name)}

                  </div>

                  <div class="room-card-meta">

                    ${
                      live
                        ? "TRANSMISSÃO AO VIVO"
                        : "AGUARDANDO TRANSMISSÃO"
                    }

                    • ${room.viewers || 0} espectador(es)

                  </div>

                </div>

              </div>

              <div class="room-card-arrow">

                →

              </div>

            </button>

          `;

        }
      )
      .join("");

  const cards =
    list.querySelectorAll(
      ".room-card"
    );

  cards.forEach(
    card => {

      card.addEventListener(
        "click",
        () => {

          const roomId =
            card.dataset.roomId;

          const room =
            rooms.find(
              item =>
                item.id ===
                roomId
            );

          if (!room) return;

          selectRoom(
            room
          );

        }
      );

    }
  );

}

/* ========================================
   ESCAPAR HTML
======================================== */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}

/* ========================================
   ATUALIZAÇÃO AUTOMÁTICA DAS SALAS
======================================== */

function startRoomsRefresh() {

  stopRoomsRefresh();

  roomsRefreshInterval =
    setInterval(
      () => {

        if (
          currentScreen ===
          "rooms"
        ) {

          loadRooms();

        }

      },
      5000
    );

}

/* ========================================
   PARAR ATUALIZAÇÃO
======================================== */

function stopRoomsRefresh() {

  if (
    roomsRefreshInterval
  ) {

    clearInterval(
      roomsRefreshInterval
    );

    roomsRefreshInterval =
      null;

  }

}

/* ========================================
   CRIAR SALA
======================================== */

function showCreateRoom() {

  stopRoomsRefresh();

  app.innerHTML = `

    <div class="hunt-screen create-room-screen">

      <div class="create-room-box">

        <div class="create-room-logo">
          HUNT
        </div>

        <div class="create-room-title">
          CRIAR SALA
        </div>

        <div class="create-room-subtitle">
          CRIE UMA SALA PARA SUA TRANSMISSÃO
        </div>


        <label
          class="room-form-label"
          for="roomName">

          NOME DA SALA

        </label>

        <input
          id="roomName"
          class="room-form-input"
          type="text"
          maxlength="50"
          placeholder="Ex.: Minha transmissão"
          autocomplete="off"
        >


        <label
          class="room-form-label"
          for="roomPassword">

          SENHA

        </label>

        <input
          id="roomPassword"
          class="room-form-input"
          type="password"
          maxlength="100"
          placeholder="Digite uma senha"
          autocomplete="new-password"
        >


        <div
          id="createRoomError"
          class="room-form-error">
        </div>


        <div class="create-room-actions">

          <button
            id="cancelCreateRoomButton"
            class="hunt-button secondary">

            ← VOLTAR

          </button>

          <button
            id="confirmCreateRoomButton"
            class="hunt-button">

            + CRIAR SALA

          </button>

        </div>

      </div>

    </div>

  `;

  const cancelButton =
    document.getElementById(
      "cancelCreateRoomButton"
    );

  const confirmButton =
    document.getElementById(
      "confirmCreateRoomButton"
    );

  if (cancelButton) {

    cancelButton.addEventListener(
      "click",
      () => {

        openRooms(
          currentRole
        );

      }
    );

  }

  if (confirmButton) {

    confirmButton.addEventListener(
      "click",
      createRoom
    );

  }

  const passwordInput =
    document.getElementById(
      "roomPassword"
    );

  if (passwordInput) {

    passwordInput.addEventListener(
      "keydown",
      event => {

        if (
          event.key ===
          "Enter"
        ) {

          createRoom();

        }

      }
    );

  }

}

/* ========================================
   CRIAR SALA API
======================================== */

async function createRoom() {

  const nameInput =
    document.getElementById(
      "roomName"
    );

  const passwordInput =
    document.getElementById(
      "roomPassword"
    );

  const errorElement =
    document.getElementById(
      "createRoomError"
    );

  const button =
    document.getElementById(
      "confirmCreateRoomButton"
    );

  if (
    !nameInput ||
    !passwordInput
  ) return;

  const name =
    nameInput.value.trim();

  const password =
    passwordInput.value;

  if (!name) {

    showCreateRoomError(
      "Digite o nome da sala."
    );

    return;

  }

  if (password.length < 4) {

    showCreateRoomError(
      "A senha precisa ter pelo menos 4 caracteres."
    );

    return;

  }

  if (button) {

    button.disabled =
      true;

    button.textContent =
      "CRIANDO...";

  }

  if (errorElement) {

    errorElement.textContent =
      "";

  }

  try {

    const response =
      await fetch(
        `${SERVER_URL}/api/rooms`,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              name,
              password

            })

        }
      );

    const data =
      await response.json()
        .catch(
          () => ({})
        );

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Não foi possível criar a sala."
      );

    }

    if (
      !data.room ||
      !data.room.id
    ) {

      throw new Error(
        "O servidor não retornou a sala criada."
      );

    }

    currentRoom =
      data.room;

    /*
     * O servidor atual retorna o token
     * apenas ao entrar pela senha.
     *
     * Para o transmissor, usamos a mesma
     * senha criada para entrar imediatamente.
     */

    const joinResponse =
      await fetch(
        `${SERVER_URL}/api/rooms/${encodeURIComponent(data.room.id)}/join`,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              password

            })

        }
      );

    const joinData =
      await joinResponse.json()
        .catch(
          () => ({})
        );

    if (!joinResponse.ok) {

      throw new Error(
        joinData.error ||
        "Sala criada, mas não foi possível liberar o acesso."
      );

    }

    currentAccessToken =
      joinData.accessToken;

    /*
     * Agora que temos o token,
     * vamos para broadcaster.html.
     */

    stopRoomsRefresh();

    sessionStorage.setItem(
      "HUNT_ROOM",
      JSON.stringify({

        id:
          data.room.id,

        name:
          data.room.name,

        accessToken:
          currentAccessToken,

        role:
          "broadcaster"

      })
    );

    window.location.href =
      "/broadcaster.html";

  }

  catch (error) {

    console.error(
      "HUNT: erro criando sala:",
      error
    );

    showCreateRoomError(
      error.message ||
      "Erro ao criar sala."
    );

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "+ CRIAR SALA";

    }

  }

}

/* ========================================
   ERRO CRIAÇÃO
======================================== */

function showCreateRoomError(
  message
) {

  const element =
    document.getElementById(
      "createRoomError"
    );

  if (!element) return;

  element.textContent =
    message;

}

/* ========================================
   SELECIONAR SALA
======================================== */

function selectRoom(
  room
) {

  stopRoomsRefresh();

  app.innerHTML = `

    <div class="hunt-screen password-screen">

      <div class="password-box">

        <div class="password-room-icon">

          ${
            room.live
              ? "🔴"
              : "🔐"
          }

        </div>

        <div class="password-title">

          ${escapeHtml(room.name)}

        </div>

        <div class="password-subtitle">

          ${
            currentRole ===
            "broadcaster"

              ? "ENTRAR COMO TRANSMISSOR"

              : "ENTRAR COMO ESPECTADOR"
          }

        </div>


        <label
          class="room-form-label"
          for="joinPassword">

          SENHA DA SALA

        </label>

        <input
          id="joinPassword"
          class="room-form-input"
          type="password"
          placeholder="Digite a senha"
          autocomplete="current-password"
        >


        <div
          id="joinRoomError"
          class="room-form-error">
        </div>


        <div class="create-room-actions">

          <button
            id="cancelJoinButton"
            class="hunt-button secondary">

            ← VOLTAR

          </button>

          <button
            id="joinRoomButton"
            class="hunt-button">

            ENTRAR

          </button>

        </div>

      </div>

    </div>

  `;

  const cancelButton =
    document.getElementById(
      "cancelJoinButton"
    );

  const joinButton =
    document.getElementById(
      "joinRoomButton"
    );

  if (cancelButton) {

    cancelButton.addEventListener(
      "click",
      () => {

        openRooms(
          currentRole
        );

      }
    );

  }

  if (joinButton) {

    joinButton.addEventListener(
      "click",
      () => {

        joinRoom(
          room
        );

      }
    );

  }

  const passwordInput =
    document.getElementById(
      "joinPassword"
    );

  if (passwordInput) {

    passwordInput.focus();

    passwordInput.addEventListener(
      "keydown",
      event => {

        if (
          event.key ===
          "Enter"
        ) {

          joinRoom(
            room
          );

        }

      }
    );

  }

}

/* ========================================
   ENTRAR NA SALA
======================================== */

async function joinRoom(
  room
) {

  const passwordInput =
    document.getElementById(
      "joinPassword"
    );

  const errorElement =
    document.getElementById(
      "joinRoomError"
    );

  const button =
    document.getElementById(
      "joinRoomButton"
    );

  if (!passwordInput) {
    return;
  }

  const password =
    passwordInput.value;

  if (!password) {

    showJoinRoomError(
      "Digite a senha da sala."
    );

    return;

  }

  if (button) {

    button.disabled =
      true;

    button.textContent =
      "VERIFICANDO...";

  }

  if (errorElement) {

    errorElement.textContent =
      "";

  }

  try {

    const response =
      await fetch(
        `${SERVER_URL}/api/rooms/${encodeURIComponent(room.id)}/join`,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              password

            })

        }
      );

    const data =
      await response.json()
        .catch(
          () => ({})
        );

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Não foi possível entrar na sala."
      );

    }

    if (
      !data.accessToken
    ) {

      throw new Error(
        "O servidor não retornou um token de acesso."
      );

    }

    currentRoom =
      data.room ||
      room;

    currentAccessToken =
      data.accessToken;

    if (
      currentRole ===
      "broadcaster"
    ) {

      sessionStorage.setItem(
        "HUNT_ROOM",
        JSON.stringify({

          id:
            currentRoom.id,

          name:
            currentRoom.name,

          accessToken:
            currentAccessToken,

          role:
            "broadcaster"

        })
      );

      window.location.href =
        "/broadcaster.html";

      return;

    }

    startViewer(
      currentRoom,
      currentAccessToken
    );

  }

  catch (error) {

    console.error(
      "HUNT: erro entrando na sala:",
      error
    );

    showJoinRoomError(
      error.message ||
      "Senha incorreta."
    );

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "ENTRAR";

    }

  }

}

/* ========================================
   ERRO ENTRADA
======================================== */

function showJoinRoomError(
  message
) {

  const element =
    document.getElementById(
      "joinRoomError"
    );

  if (!element) return;

  element.textContent =
    message;

}

/* ========================================
   INICIAR VIEWER
======================================== */

function startViewer(
  room,
  accessToken
) {

  currentScreen =
    "viewer";

  currentRoom =
    room;

  currentAccessToken =
    accessToken;

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

          ${
            room.live
              ? "CONECTANDO À TRANSMISSÃO..."
              : "AGUARDANDO TRANSMISSÃO..."
          }

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
          type="button"
          title="Tela cheia"
          aria-label="Entrar em tela cheia">

          ⛶

        </button>

        <button
          id="huntExitFullscreenButton"
          class="hunt-exit-fullscreen-button"
          type="button"
          title="Sair da tela cheia"
          aria-label="Sair da tela cheia">

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
            class="hunt-button small-button fullscreen-control-button">

            ⛶ TELA CHEIA

          </button>

          <button
            id="backButton"
            class="hunt-button secondary small-button">

            ← SALAS

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

  const huntFullscreenButton =
    document.getElementById(
      "huntFullscreenButton"
    );

  const huntExitFullscreenButton =
    document.getElementById(
      "huntExitFullscreenButton"
    );

  if (refreshButton) {

    refreshButton.addEventListener(
      "click",
      refreshViewer
    );

  }

  if (backButton) {

    backButton.addEventListener(
      "click",
      async () => {

        await exitHuntFullscreen();

        closeViewer();

        openRooms(
          "viewer"
        );

      }
    );

  }

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

  if (fullscreenButton) {

    fullscreenButton.addEventListener(
      "click",
      toggleHuntFullscreen
    );

  }

  if (huntFullscreenButton) {

    huntFullscreenButton.addEventListener(
      "click",
      toggleHuntFullscreen
    );

  }

  if (huntExitFullscreenButton) {

    huntExitFullscreenButton.addEventListener(
      "click",
      exitHuntFullscreen
    );

  }

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
   * Entrar na sala através do
   * Socket.IO com o token.
   */

  if (socket.connected) {

    socket.emit(
      "join-room",
      {

        roomId:
          room.id,

        accessToken:
          accessToken,

        role:
          "viewer"

      }
    );

    console.log(
      "HUNT: viewer entrou na sala:",
      room.id
    );

  }

  else {

    console.log(
      "HUNT: aguardando Socket.IO..."
    );

  }

}

/* ========================================
   ATUALIZAR VIEWER
======================================== */

function refreshViewer() {

  if (
    !currentRoom ||
    !currentAccessToken
  ) {

    return;

  }

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
      {

        roomId:
          currentRoom.id,

        accessToken:
          currentAccessToken,

        role:
          "viewer"

      }
    );

  }

}

/* ========================================
   STATUS VIEWER
======================================== */

function updateViewerStatus() {

  const status =
    document.getElementById(
      "viewerStatus"
    );

  if (!status) return;

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

    catch {}

    video.srcObject =
      null;

  }

}

/* ========================================
   STREAM STARTED
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

      return;

    }

    broadcasterId =
      data.broadcasterId;

    const message =
      document.getElementById(
        "viewerMessage"
      );

    if (message) {

      message.textContent =
        "CONECTANDO À TRANSMISSÃO...";

      message.style.display =
        "flex";

    }

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
   CRIAR PEER VIEWER
======================================== */

function createViewerPeer() {

  console.log(
    "HUNT: criando RTCPeerConnection..."
  );

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
    window.RTCPeerConnection;

  const RTCCtor =
    typeof RTC ===
    "function"

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

  peer.ontrack =
    event => {

      console.log(
        "HUNT: VÍDEO RECEBIDO"
      );

      const video =
        document.getElementById(
          "remoteVideo"
        );

      if (!video) return;

      if (
        event.streams &&
        event.streams.length > 0
      ) {

        video.srcObject =
          event.streams[0];

      }

      else if (
        !video.srcObject
      ) {

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

      if (!peer) return;

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

  peer.oniceconnectionstatechange =
    () => {

      if (!peer) return;

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

    if (!video) return;

    broadcasterId =
      data.sender;

    if (!peer) {

      createViewerPeer();

    }

    if (!peer) return;

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
   STREAM STOPPED
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
   SALA FECHADA
======================================== */

socket.on(
  "room-closed",
  data => {

    console.log(
      "HUNT: sala fechada:",
      data
    );

    if (
      currentScreen ===
      "viewer"
    ) {

      closeViewer();

      showViewerMessage(
        "ESTA SALA FOI ENCERRADA"
      );

      const status =
        document.getElementById(
          "viewerStatus"
        );

      if (status) {

        status.textContent =
          "● SALA ENCERRADA";

      }

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

  if (!element) return;

  element.textContent =
    message;

  element.style.display =
    message
      ? "flex"
      : "none";

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

  if (
    !viewerScreen ||
    !container
  ) {

    return;

  }

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

      }

    }

  }

  catch (error) {

    console.warn(
      "HUNT: Fullscreen API não disponível:",
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

/* ========================================
   FULLSCREEN CHANGE
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

    if (!document.fullscreenElement) {

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
   BOTÕES FULLSCREEN
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
  async event => {

    if (
      event.key ===
      "Escape" &&
      huntFullscreen
    ) {

      await exitHuntFullscreen();

    }

  }
);

/* ========================================
   MODO PLAYER
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

  if (!container) return;

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

}

/* ========================================
   EVENTO USER JOINED
======================================== */

socket.on(
  "user-joined",
  data => {

    console.log(
      "HUNT: novo espectador entrou:",
      data
    );

  }
);

/* ========================================
   ACESSO NEGADO
======================================== */

socket.on(
  "room-access-denied",
  data => {

    console.warn(
      "HUNT: acesso à sala negado:",
      data
    );

    if (
      currentScreen ===
      "viewer"
    ) {

      closeViewer();

      showViewerMessage(
        "ACESSO À SALA NEGADO"
      );

    }

  }
);

/* ========================================
   TRANSMISSÃO JÁ EXISTENTE
======================================== */

socket.on(
  "stream-already-started",
  data => {

    console.warn(
      "HUNT: sala já possui transmissão:",
      data
    );

  }
);

/* ========================================
   INICIALIZAÇÃO
======================================== */

showHome();

console.log(
  "HUNT: aplicação iniciada."
);