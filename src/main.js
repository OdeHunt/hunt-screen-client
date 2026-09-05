import { io } from "socket.io-client";
import "./style.css";

/* ========================================
   CONFIGURAÇÃO
======================================== */

const SERVER_URL =
  "https://hunt-screen-server.onrender.com";

const SOCKET_PATH =
  "/hunt-socket";

/*
 * Discord Activity não permite que o
 * aplicativo faça requisições diretamente
 * para domínios externos.
 *
 * Dentro da Activity usamos os caminhos
 * relativos configurados nos URL Mappings:
 *
 * /api
 * /hunt-socket
 *
 * No site normal continuamos usando
 * SERVER_URL normalmente.
 */

const isLocalHost =
  window.location.hostname ===
    "localhost" ||
  window.location.hostname ===
    "127.0.0.1";

const isNormalHuntSite =
  window.location.hostname ===
  "hunt-screen-client.onrender.com";

const IS_DISCORD_ACTIVITY =
  !isLocalHost &&
  !isNormalHuntSite;

/*
 * Na Activity:
 *
 * API_BASE = ""
 *
 * Resultado:
 *
 * /api/rooms
 *
 * No site normal:
 *
 * API_BASE =
 * https://hunt-screen-server.onrender.com
 *
 * Resultado:
 *
 * https://hunt-screen-server.onrender.com/api/rooms
 */

const API_BASE =
  IS_DISCORD_ACTIVITY
    ? ""
    : SERVER_URL;

console.log(
  "HUNT: ambiente:",
  IS_DISCORD_ACTIVITY
    ? "DISCORD ACTIVITY"
    : "SITE NORMAL"
);

console.log(
  "HUNT: API:",
  IS_DISCORD_ACTIVITY
    ? "/api"
    : SERVER_URL
);

console.log(
  "HUNT: Socket.IO:",
  IS_DISCORD_ACTIVITY
    ? "CAMINHO RELATIVO"
    : SERVER_URL
);

/* ========================================
   SOCKET.IO
======================================== */

const socketOptions = {
  path:
    SOCKET_PATH,

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
    20000,

  autoConnect:
    true
};

const socket =
  IS_DISCORD_ACTIVITY
    ? io(
        socketOptions
      )
    : io(
        SERVER_URL,
        socketOptions
      );

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

let rooms =
  [];

let roomsRefreshInterval =
  null;

let viewerJoinPending =
  false;

let viewerJoinedRoomId =
  null;

/*
 * Controla se o usuário está executando
 * uma atualização manual da transmissão.
 *
 * Isso permite diferenciar uma reconexão
 * normal de um RESET manual do WebRTC.
 */

let viewerRefreshInProgress =
  false;

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

/*
 * Indica se o navegador realmente
 * entrou no Fullscreen API.
 *
 * É separado de huntFullscreen porque
 * a Activity pode bloquear a API nativa,
 * mas ainda podemos usar o fullscreen
 * visual através do CSS.
 */

let nativeFullscreenActive =
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

    /*
     * Se o viewer estava dentro de uma sala
     * e o Socket.IO reconectou, precisamos
     * registrar o novo socket novamente.
     */

    if (
      currentScreen ===
        "viewer" &&
      currentRoom &&
      currentAccessToken &&
      currentRole ===
        "viewer"
    ) {
      viewerJoinedRoomId =
        null;

      viewerJoinPending =
        true;

      joinCurrentViewerRoom();
    }
  }
);

socket.on(
  "disconnect",
  reason => {
    console.warn(
      "HUNT: servidor desconectado:",
      reason
    );

    viewerJoinedRoomId =
      null;

    viewerJoinPending =
      true;

    updateGlobalStatus();
    updateRoomStatus();

    if (
      currentScreen ===
      "viewer"
    ) {
      updateViewerStatus();
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

    updateGlobalStatus();
    updateRoomStatus();

    if (
      currentScreen ===
      "viewer"
    ) {
      updateViewerStatus();
    }
  }
);

/* ========================================
   HOME
======================================== */

function showHome() {
  /*
   * Se estiver em uma sala,
   * avisa o servidor antes de sair.
   */

  leaveCurrentRoom();

  currentScreen =
    "home";

  currentRole =
    null;

  currentRoom =
    null;

  currentAccessToken =
    null;

  viewerJoinPending =
    false;

  viewerJoinedRoomId =
    null;

  viewerRefreshInProgress =
    false;

  stopRoomsRefresh();

  closeViewer();

  huntFullscreen =
    false;

  nativeFullscreenActive =
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
          class="hunt-button"
          type="button">

          👁️ ESPECTADOR

        </button>

        <button
          id="broadcastButton"
          class="hunt-button"
          type="button">

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

  if (!status) {
    return;
  }

  if (socket.connected) {
    status.textContent =
      "● SERVIDOR ONLINE";
  } else {
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
  leaveCurrentRoom();

  closeViewer();

  currentRole =
    role;

  currentScreen =
    "rooms";

  currentRoom =
    null;

  currentAccessToken =
    null;

  viewerJoinPending =
    false;

  viewerJoinedRoomId =
    null;

  viewerRefreshInProgress =
    false;

  huntFullscreen =
    false;

  nativeFullscreenActive =
    false;

  document.body.classList.remove(
    "hunt-fullscreen-active"
  );

  renderRoomsScreen();

  await loadRooms();

  if (
    currentScreen ===
    "rooms"
  ) {
    startRoomsRefresh();
  }
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
          class="hunt-button secondary small-button"
          type="button">

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

  if (!status) {
    return;
  }

  if (socket.connected) {
    status.textContent =
      "● SERVIDOR ONLINE";
  } else {
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

  if (!list) {
    return;
  }

  try {
    const response =
      await fetch(
        `${API_BASE}/api/rooms`,
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
      Array.isArray(
        data.rooms
      )
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

        <div class="rooms-empty-title">
          NÃO FOI POSSÍVEL CARREGAR AS SALAS
        </div>

        <button
          id="retryRoomsButton"
          class="hunt-button small-button"
          type="button">

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

  if (!list) {
    return;
  }

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

          if (!room) {
            return;
          }

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
   ATUALIZAÇÃO AUTOMÁTICA
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
            class="hunt-button secondary"
            type="button">

            ← VOLTAR

          </button>

          <button
            id="confirmCreateRoomButton"
            class="hunt-button"
            type="button">

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

  const nameInput =
    document.getElementById(
      "roomName"
    );

  const passwordInput =
    document.getElementById(
      "roomPassword"
    );

  if (nameInput) {
    nameInput.focus();

    nameInput.addEventListener(
      "keydown",
      event => {

        if (
          event.key ===
          "Enter"
        ) {
          passwordInput?.focus();
        }

      }
    );
  }

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
  ) {
    return;
  }

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

  if (
    name.length >
    50
  ) {
    showCreateRoomError(
      "O nome da sala deve ter no máximo 50 caracteres."
    );

    return;
  }

  if (
    password.length <
    4
  ) {
    showCreateRoomError(
      "A senha precisa ter pelo menos 4 caracteres."
    );

    return;
  }

  if (
    password.length >
    100
  ) {
    showCreateRoomError(
      "A senha é muito longa."
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
        `${API_BASE}/api/rooms`,
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
      await response
        .json()
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

    const joinResponse =
      await fetch(
        `${API_BASE}/api/rooms/${encodeURIComponent(data.room.id)}/join`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              password,

              role:
                "broadcaster"
            })
        }
      );

    const joinData =
      await joinResponse
        .json()
        .catch(
          () => ({})
        );

    if (
      !joinResponse.ok
    ) {
      throw new Error(
        joinData.error ||
        "Sala criada, mas não foi possível liberar o acesso."
      );
    }

    if (
      !joinData.accessToken
    ) {
      throw new Error(
        "O servidor não retornou um token de acesso."
      );
    }

    currentAccessToken =
      joinData.accessToken;

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

    stopRoomsRefresh();

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

  if (!element) {
    return;
  }

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
          maxlength="100"
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
            class="hunt-button secondary"
            type="button">

            ← VOLTAR

          </button>

          <button
            id="joinRoomButton"
            class="hunt-button"
            type="button">

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
        `${API_BASE}/api/rooms/${encodeURIComponent(room.id)}/join`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              password,

              role:
                currentRole
            })
          }
      );

    const data =
      await response
        .json()
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

    viewerJoinedRoomId =
      null;

    viewerJoinPending =
      false;

    viewerRefreshInProgress =
      false;

    /* ================================
       TRANSMISSOR
    ================================= */

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

    /* ================================
       VIEWER
    ================================= */

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

  if (!element) {
    return;
  }

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

  currentRole =
    "viewer";

  currentRoom =
    room;

  currentAccessToken =
    accessToken;

  viewerJoinPending =
    false;

  viewerJoinedRoomId =
    null;

  viewerRefreshInProgress =
    false;

  closeViewer();

  huntFullscreen =
    false;

  nativeFullscreenActive =
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
            class="mode-button active"
            type="button">

            WIDE

          </button>

          <button
            id="normalModeButton"
            class="mode-button"
            type="button">

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
            class="hunt-button small-button"
            type="button">

            🔄 ATUALIZAR

          </button>

          <button
            id="fullscreenButton"
            class="hunt-button small-button fullscreen-control-button"
            type="button">

            ⛶ TELA CHEIA

          </button>

          <button
            id="backButton"
            class="hunt-button secondary small-button"
            type="button">

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

        leaveCurrentRoom();

        closeViewer();

        currentScreen =
          "rooms";

        currentRole =
          "viewer";

        currentRoom =
          null;

        currentAccessToken =
          null;

        viewerJoinPending =
          false;

        viewerJoinedRoomId =
          null;

        viewerRefreshInProgress =
          false;

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

  joinCurrentViewerRoom();
}

/* ========================================
   ENTRAR NO VIEWER PELO SOCKET
======================================== */

/*
 * forceJoin = true
 *
 * Quando true, ignoramos o fato de o viewer
 * já estar registrado na sala.
 *
 * Isso é utilizado pelo botão ATUALIZAR
 * para forçar uma nova negociação WebRTC.
 */

function joinCurrentViewerRoom(
  forceJoin = false
) {
  if (
    currentScreen !==
    "viewer"
  ) {
    return;
  }

  if (
    currentRole !==
    "viewer"
  ) {
    return;
  }

  if (
    !currentRoom ||
    !currentAccessToken
  ) {
    return;
  }

  if (
    !socket.connected
  ) {
    viewerJoinPending =
      true;

    viewerJoinedRoomId =
      null;

    console.log(
      "HUNT: aguardando Socket.IO para entrar na sala..."
    );

    updateViewerStatus();

    return;
  }

  /*
   * Se não for uma atualização forçada
   * e o viewer já estiver registrado,
   * não precisamos enviar novamente.
   */

  if (
    !forceJoin &&
    viewerJoinedRoomId ===
      currentRoom.id
  ) {
    console.log(
      "HUNT: viewer já está registrado nesta sala."
    );

    return;
  }

  viewerJoinPending =
    true;

  /*
   * Marca que estamos registrando
   * novamente nesta sala.
   */

  viewerJoinedRoomId =
    null;

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

  viewerJoinedRoomId =
    currentRoom.id;

  viewerJoinPending =
    false;

  console.log(
    forceJoin
      ? "HUNT: viewer forçou nova entrada na sala para resetar a transmissão:"
      : "HUNT: viewer entrou na sala:",
    currentRoom.id
  );

  const status =
    document.getElementById(
      "viewerStatus"
    );

  if (status) {
    status.textContent =
      forceJoin
        ? "● REINICIANDO TRANSMISSÃO..."
        : "● CONECTADO À SALA";
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

  /*
   * Impede vários cliques simultâneos
   * no botão enquanto o reset está ocorrendo.
   */

  if (
    viewerRefreshInProgress
  ) {
    return;
  }

  viewerRefreshInProgress =
    true;

  console.log(
    "HUNT: iniciando RESET manual da transmissão..."
  );

  /*
   * Fecha SOMENTE a conexão WebRTC.
   *
   * Não usamos leaveCurrentRoom().
   *
   * O viewer continua dentro da sala.
   */

  closeViewer();

  /*
   * Limpa o identificador antigo do
   * transmissor.
   */

  broadcasterId =
    null;

  /*
   * Limpa candidatos ICE antigos.
   */

  pendingCandidates =
    [];

  /*
   * MUITO IMPORTANTE:
   *
   * O viewer precisa ser considerado
   * temporariamente não registrado.
   *
   * Caso contrário joinCurrentViewerRoom()
   * retornaria imediatamente sem enviar
   * outro join-room.
   */

  viewerJoinedRoomId =
    null;

  viewerJoinPending =
    false;

  const message =
    document.getElementById(
      "viewerMessage"
    );

  if (message) {
    message.textContent =
      "REINICIANDO TRANSMISSÃO...";

    message.style.display =
      "flex";
  }

  const status =
    document.getElementById(
      "viewerStatus"
    );

  if (status) {
    status.textContent =
      "● REINICIANDO TRANSMISSÃO...";
  }

  /*
   * Se o socket está conectado,
   * fazemos um novo join-room FORÇADO.
   *
   * O servidor vai detectar que existe
   * um broadcaster ativo e enviar:
   *
   * stream-started
   *
   * para este viewer.
   */

  if (
    socket.connected
  ) {

    joinCurrentViewerRoom(
      true
    );

    /*
     * Pequeno intervalo apenas para
     * impedir spam de cliques.
     *
     * Não interfere no WebRTC.
     */

    setTimeout(
      () => {

        viewerRefreshInProgress =
          false;

      },
      1000
    );

  }

  else {

    viewerJoinPending =
      true;

    viewerRefreshInProgress =
      false;

    if (status) {
      status.textContent =
        "● AGUARDANDO CONEXÃO...";
    }

    updateViewerStatus();
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

  if (!status) {
    return;
  }

  if (
    socket.connected
  ) {

    if (
      !peer &&
      currentScreen ===
        "viewer"
    ) {

      if (
        viewerRefreshInProgress
      ) {

        status.textContent =
          "● REINICIANDO TRANSMISSÃO...";

      }

      else {

        status.textContent =
          viewerJoinedRoomId ===
          currentRoom?.id
            ? "● CONECTADO À SALA"
            : "● CONECTANDO À SALA";

      }

    }

  } else {

    status.textContent =
      "● CONECTANDO...";
  }
}

/* ========================================
   SAIR DA SALA ATUAL
======================================== */

function leaveCurrentRoom() {
  if (
    !currentRoom
  ) {
    return;
  }

  if (
    socket.connected
  ) {
    socket.emit(
      "leave-room",
      {
        roomId:
          currentRoom.id
      }
    );

    console.log(
      "HUNT: saindo da sala:",
      currentRoom.id
    );
  }

  viewerJoinedRoomId =
    null;

  viewerJoinPending =
    false;

  viewerRefreshInProgress =
    false;
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
      data?.local
    ) {
      return;
    }

    if (
      currentScreen !==
      "viewer"
    ) {
      return;
    }

    if (
      !data ||
      !data.broadcasterId
    ) {
      return;
    }

    if (
      data.roomId &&
      currentRoom &&
      data.roomId !==
        currentRoom.id
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

    const status =
      document.getElementById(
        "viewerStatus"
      );

    if (status) {
      status.textContent =
        "● CONECTANDO À TRANSMISSÃO";
    }

    /*
     * A nova transmissão chegou.
     *
     * Agora podemos liberar o estado
     * de atualização.
     */

    viewerRefreshInProgress =
      false;

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

  if (
    peer
  ) {
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

  /* ====================================
     TRACK
  ==================================== */

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
        event.streams.length >
          0
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

      viewerRefreshInProgress =
        false;
    };

  /* ====================================
     ICE LOCAL
  ==================================== */

  peer.onicecandidate =
    event => {

      if (
        !event.candidate ||
        !broadcasterId
      ) {
        return;
      }

      if (
        !socket.connected
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

  /* ====================================
     ESTADO CONNECTION
  ==================================== */

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

        viewerRefreshInProgress =
          false;
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

        viewerRefreshInProgress =
          false;

        showViewerMessage(
          "FALHA NA CONEXÃO COM A TRANSMISSÃO"
        );
      }

      if (
        peer.connectionState ===
        "disconnected"
      ) {

        viewerRefreshInProgress =
          false;

        showViewerMessage(
          "TRANSMISSÃO DESCONECTADA"
        );
      }
    };

  /* ====================================
     ICE STATE
  ==================================== */

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
      currentScreen !==
      "viewer"
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

      if (
        !socket.connected
      ) {
        return;
      }

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
      currentScreen !==
      "viewer"
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
      broadcasterId &&
      data.sender !==
        broadcasterId
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

    if (
      currentScreen !==
      "viewer"
    ) {
      return;
    }

    if (
      data?.roomId &&
      currentRoom &&
      data.roomId !==
        currentRoom.id
    ) {
      return;
    }

    closeViewer();

    viewerRefreshInProgress =
      false;

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
      currentScreen !==
      "viewer"
    ) {
      return;
    }

    if (
      data?.roomId &&
      currentRoom &&
      data.roomId !==
        currentRoom.id
    ) {
      return;
    }

    closeViewer();

    currentRoom =
      null;

    currentAccessToken =
      null;

    viewerJoinPending =
      false;

    viewerJoinedRoomId =
      null;

    viewerRefreshInProgress =
      false;

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
   FULLSCREEN
======================================== */

async function toggleHuntFullscreen() {
  if (
    huntFullscreen
  ) {
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

  try {

    if (
      document.fullscreenElement !==
      viewerScreen &&
      typeof viewerScreen.requestFullscreen ===
        "function"
    ) {

      await viewerScreen.requestFullscreen();

      nativeFullscreenActive =
        true;

      console.log(
        "HUNT: Fullscreen API ativada."
      );
    }

  }

  catch (error) {

    nativeFullscreenActive =
      false;

    console.warn(
      "HUNT: Fullscreen API bloqueada ou indisponível. Usando fullscreen visual.",
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
      document.fullscreenElement &&
      typeof document.exitFullscreen ===
        "function"
    ) {

      await document.exitFullscreen();

    }

  }

  catch (error) {

    console.warn(
      "HUNT: erro saindo do Fullscreen API:",
      error
    );

  }

  nativeFullscreenActive =
    false;

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

    if (
      !document.fullscreenElement
    ) {

      nativeFullscreenActive =
        false;

      if (
        huntFullscreen
      ) {

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

        document.body.classList.add(
          "hunt-fullscreen-active"
        );

      }

      else {

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

        document.body.classList.remove(
          "hunt-fullscreen-active"
        );

      }

      updateFullscreenButtons();

      return;
    }

    nativeFullscreenActive =
      true;

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

  if (!container) {
    return;
  }

  container.classList.remove(
    "wide-mode",
    "normal-mode"
  );

  container.classList.add(
    mode === "wide"
      ? "wide-mode"
      : "normal-mode"
  );

  container.dataset.playerMode =
    mode;

  if (wideButton) {

    wideButton.classList.toggle(
      "active",
      mode ===
        "wide"
    );

    wideButton.setAttribute(
      "aria-pressed",
      mode ===
        "wide"
        ? "true"
        : "false"
    );
  }

  if (normalButton) {

    normalButton.classList.toggle(
      "active",
      mode ===
        "normal"
    );

    normalButton.setAttribute(
      "aria-pressed",
      mode ===
        "normal"
        ? "true"
        : "false"
    );
  }

  requestAnimationFrame(
    () => {

      window.dispatchEvent(
        new Event(
          "resize"
        )
      );

    }
  );

  console.log(
    "HUNT: modo do player:",
    mode
  );
}

/* ========================================
   USER JOINED
======================================== */

socket.on(
  "user-joined",
  data => {

    console.log(
      "HUNT: novo espectador entrou:",
      data
    );

    /*
     * O transmissor possui o
     * broadcaster.js separado.
     *
     * Não fazemos nada aqui.
     */
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

      viewerJoinedRoomId =
        null;

      viewerRefreshInProgress =
        false;

      const message =
        document.getElementById(
          "viewerMessage"
        );

      if (message) {

        message.textContent =
          "ACESSO À SALA NEGADO";

        message.style.display =
          "flex";
      }

      const status =
        document.getElementById(
          "viewerStatus"
        );

      if (status) {

        status.textContent =
          "● ACESSO NEGADO";
      }
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

    if (
      currentScreen ===
      "viewer"
    ) {

      if (
        data?.roomId &&
        currentRoom &&
        data.roomId !==
          currentRoom.id
      ) {
        return;
      }

      if (
        data?.broadcasterId
      ) {

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

        const status =
          document.getElementById(
            "viewerStatus"
          );

        if (status) {
          status.textContent =
            "● CONECTANDO À TRANSMISSÃO";
        }

        /*
         * Se recebemos o broadcaster
         * diretamente neste evento, também
         * podemos iniciar o peer.
         */

        if (
          document.getElementById(
            "remoteVideo"
          ) &&
          !peer
        ) {
          createViewerPeer();
        }

      }

      else {

        const status =
          document.getElementById(
            "viewerStatus"
          );

        if (status) {

          status.textContent =
            "● TRANSMISSÃO JÁ ATIVA";
        }
      }
    }
  }
);

/* ========================================
   LIMPEZA AO FECHAR / RECARREGAR
======================================== */

window.addEventListener(
  "beforeunload",
  () => {

    if (
      currentRoom &&
      socket.connected
    ) {

      socket.emit(
        "leave-room",
        {
          roomId:
            currentRoom.id
        }
      );
    }

  }
);

/* ========================================
   INICIALIZAÇÃO
======================================== */

showHome();

console.log(
  "HUNT: aplicação iniciada."
);