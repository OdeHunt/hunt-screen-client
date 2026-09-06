import{io}from"socket.io-client";
import"./style.css";

const SERVER_URL="https://hunt-screen-server.onrender.com";
const SOCKET_PATH="/hunt-socket";
const isLocalHost=window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1";
const isNormalHuntSite=window.location.hostname==="hunt-screen-client.onrender.com";
const IS_DISCORD_ACTIVITY=!isLocalHost&&!isNormalHuntSite;
const API_BASE=IS_DISCORD_ACTIVITY?"":SERVER_URL;

console.log("HUNT: ambiente:",IS_DISCORD_ACTIVITY?"DISCORD ACTIVITY":"SITE NORMAL");
console.log("HUNT: API:",IS_DISCORD_ACTIVITY?"/api":SERVER_URL);
console.log("HUNT: Socket.IO:",IS_DISCORD_ACTIVITY?"CAMINHO RELATIVO":SERVER_URL);

const socketOptions={
  path:SOCKET_PATH,
  transports:["polling","websocket"],
  reconnection:true,
  reconnectionAttempts:Infinity,
  reconnectionDelay:1000,
  reconnectionDelayMax:5000,
  timeout:20000,
  autoConnect:true
};

const socket=IS_DISCORD_ACTIVITY?io(socketOptions):io(SERVER_URL,socketOptions);

const app=document.getElementById("app");
if(!app)console.error("HUNT: elemento #app não encontrado.");

let currentScreen="home";
let currentRole=null;
let currentRoom=null;
let currentAccessToken=null;
let rooms=[];
let roomsRefreshInterval=null;
let viewerJoinPending=false;
let viewerJoinedRoomId=null;
let viewerRefreshInProgress=false;

let peer=null;
let broadcasterId=null;
let pendingCandidates=[];

const rtcConfig={
  iceServers:[
    {urls:"stun:stun.l.google.com:19302"},
    {urls:"stun:stun1.l.google.com:19302"}
  ]
};

console.log("HUNT: verificando WebRTC...");
console.log("HUNT: RTCPeerConnection:",window.RTCPeerConnection);

let currentPlayerMode="wide";
let huntFullscreen=false;
let nativeFullscreenActive=false;
let fullscreenMouseNearBottom=false;

socket.on("connect",()=>{
  console.log("HUNT SERVER conectado:",socket.id);
  updateGlobalStatus();
  updateRoomStatus();

  if(currentScreen==="viewer"&&currentRoom&&currentAccessToken&&currentRole==="viewer"){
    viewerJoinedRoomId=null;
    viewerJoinPending=true;
    joinCurrentViewerRoom();
  }
});

socket.on("disconnect",reason=>{
  console.warn("HUNT: servidor desconectado:",reason);
  viewerJoinedRoomId=null;
  viewerJoinPending=true;
  updateGlobalStatus();
  updateRoomStatus();

  if(currentScreen==="viewer")updateViewerStatus();
});

socket.on("connect_error",error=>{
  console.error("HUNT: erro de conexão:",error);
  updateGlobalStatus();
  updateRoomStatus();

  if(currentScreen==="viewer")updateViewerStatus();
});

function showHome(){
  leaveCurrentRoom();
  currentScreen="home";
  currentRole=null;
  currentRoom=null;
  currentAccessToken=null;
  viewerJoinPending=false;
  viewerJoinedRoomId=null;
  viewerRefreshInProgress=false;
  stopRoomsRefresh();
  closeViewer();
  huntFullscreen=false;
  nativeFullscreenActive=false;
  fullscreenMouseNearBottom=false;
  document.body.classList.remove("hunt-fullscreen-active");

  app.innerHTML=`
    <div class="hunt-screen home-screen">
      <div class="hunt-logo">HUNT</div>
      <div class="hunt-subtitle">SCREEN</div>
      <div class="hunt-menu">
        <button id="viewerButton" class="hunt-button" type="button">
          👁️ ESPECTADOR
        </button>
        <button id="broadcastButton" class="hunt-button" type="button">
          📺 TRANSMITIR
        </button>
      </div>
      <div id="homeStatus" class="hunt-status">CONECTANDO...</div>
    </div>
  `;

  const viewerButton=document.getElementById("viewerButton");
  const broadcastButton=document.getElementById("broadcastButton");

  if(viewerButton){
    viewerButton.addEventListener("click",()=>openRooms("viewer"));
  }

  if(broadcastButton){
    broadcastButton.addEventListener("click",()=>openRooms("broadcaster"));
  }

  updateGlobalStatus();
}

function updateGlobalStatus(){
  const status=document.getElementById("homeStatus");
  if(!status)return;
  status.textContent=socket.connected?"● SERVIDOR ONLINE":"● CONECTANDO...";
}

async function openRooms(role){
  leaveCurrentRoom();
  closeViewer();

  currentRole=role;
  currentScreen="rooms";
  currentRoom=null;
  currentAccessToken=null;
  viewerJoinPending=false;
  viewerJoinedRoomId=null;
  viewerRefreshInProgress=false;
  huntFullscreen=false;
  nativeFullscreenActive=false;
  fullscreenMouseNearBottom=false;

  document.body.classList.remove("hunt-fullscreen-active");

  renderRoomsScreen();
  await loadRooms();

  if(currentScreen==="rooms")startRoomsRefresh();
}

function renderRoomsScreen(){
  app.innerHTML=`
    <div class="hunt-screen rooms-screen">
      <div class="rooms-header">
        <div class="rooms-title">
          <span class="rooms-title-main">HUNT</span>
          <span class="rooms-title-divider">/</span>
          <span class="rooms-title-sub">SALAS</span>
        </div>

        <button id="roomsBackButton" class="hunt-button secondary small-button" type="button">
          ← VOLTAR
        </button>
      </div>

      <div class="rooms-role">
        ${
          currentRole==="broadcaster"
            ?"📺 ESCOLHA UMA SALA PARA TRANSMITIR"
            :"👁️ ESCOLHA UMA SALA PARA ASSISTIR"
        }
      </div>

      <div id="roomsList" class="rooms-list">
        <div class="rooms-loading">CARREGANDO SALAS...</div>
      </div>

      <button id="createRoomButton" class="create-room-button" type="button" aria-label="Criar sala">
        +
      </button>

      <div id="roomsStatus" class="hunt-status">CONECTANDO...</div>
    </div>
  `;

  const backButton=document.getElementById("roomsBackButton");
  const createButton=document.getElementById("createRoomButton");

  if(backButton)backButton.addEventListener("click",()=>showHome());
  if(createButton)createButton.addEventListener("click",showCreateRoom);

  updateRoomStatus();
}

function updateRoomStatus(){
  const status=document.getElementById("roomsStatus");
  if(!status)return;
  status.textContent=socket.connected?"● SERVIDOR ONLINE":"● CONECTANDO...";
}

async function loadRooms(){
  const list=document.getElementById("roomsList");
  if(!list)return;

  try{
    const response=await fetch(`${API_BASE}/api/rooms`,{
      method:"GET",
      cache:"no-store"
    });

    if(!response.ok)throw new Error(`HTTP ${response.status}`);

    const data=await response.json();

    rooms=Array.isArray(data.rooms)?data.rooms:[];

    renderRoomsList();
  }catch(error){
    console.error("HUNT: erro carregando salas:",error);

    list.innerHTML=`
      <div class="rooms-empty">
        <div class="rooms-empty-title">
          NÃO FOI POSSÍVEL CARREGAR AS SALAS
        </div>

        <button id="retryRoomsButton" class="hunt-button small-button" type="button">
          🔄 TENTAR NOVAMENTE
        </button>
      </div>
    `;

    const retryButton=document.getElementById("retryRoomsButton");
    if(retryButton)retryButton.addEventListener("click",loadRooms);
  }
}

function renderRoomsList(){
  const list=document.getElementById("roomsList");
  if(!list)return;

  if(!rooms.length){
    list.innerHTML=`
      <div class="rooms-empty">
        <div class="rooms-empty-icon">📺</div>

        <div class="rooms-empty-title">
          NENHUMA SALA ATIVA
        </div>

        <div class="rooms-empty-text">
          ${
            currentRole==="broadcaster"
              ?"Clique no + para criar uma sala."
              :"Aguarde alguém criar uma sala."
          }
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML=rooms.map(room=>{
    const live=Boolean(room.live);

    return`
      <button class="room-card" data-room-id="${escapeHtml(room.id)}" type="button">
        <div class="room-card-left">
          <div class="room-card-icon">${live?"🔴":"⚫"}</div>

          <div class="room-card-info">
            <div class="room-card-name">${escapeHtml(room.name)}</div>

            <div class="room-card-meta">
              ${live?"TRANSMISSÃO AO VIVO":"AGUARDANDO TRANSMISSÃO"}
            </div>
          </div>
        </div>

        <div class="room-card-arrow">→</div>
      </button>
    `;
  }).join("");

  const cards=list.querySelectorAll(".room-card");

  cards.forEach(card=>{
    card.addEventListener("click",()=>{
      const roomId=card.dataset.roomId;
      const room=rooms.find(item=>item.id===roomId);
      if(!room)return;
      selectRoom(room);
    });
  });
}

function escapeHtml(value){
  return String(value??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function startRoomsRefresh(){
  stopRoomsRefresh();

  roomsRefreshInterval=setInterval(()=>{
    if(currentScreen==="rooms")loadRooms();
  },5000);
}

function stopRoomsRefresh(){
  if(roomsRefreshInterval){
    clearInterval(roomsRefreshInterval);
    roomsRefreshInterval=null;
  }
}

function showCreateRoom(){
  stopRoomsRefresh();

  app.innerHTML=`
    <div class="hunt-screen create-room-screen">
      <div class="create-room-box">
        <div class="create-room-logo">HUNT</div>

        <div class="create-room-title">
          CRIAR SALA
        </div>

        <div class="create-room-subtitle">
          CRIE UMA SALA PARA SUA TRANSMISSÃO
        </div>

        <label class="room-form-label" for="roomName">
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

        <label class="room-form-label" for="roomPassword">
          SENHA DA SALA
        </label>

        <input
          id="roomPassword"
          class="room-form-input"
          type="password"
          maxlength="100"
          placeholder="Digite uma senha"
          autocomplete="new-password"
        >

        <div class="create-room-actions">
          <button id="cancelCreateRoomButton" class="hunt-button secondary" type="button">
            ← VOLTAR
          </button>

          <button id="confirmCreateRoomButton" class="hunt-button" type="button">
            CRIAR SALA
          </button>
        </div>

        <div id="createRoomStatus" class="hunt-status"></div>
      </div>
    </div>
  `;

  const cancelButton=document.getElementById("cancelCreateRoomButton");
  const confirmButton=document.getElementById("confirmCreateRoomButton");

  if(cancelButton){
    cancelButton.addEventListener("click",()=>{
      openRooms("broadcaster");
    });
  }

  if(confirmButton){
    confirmButton.addEventListener("click",createRoom);
  }
}
async function createRoom(){
  const nameInput=document.getElementById("roomName");
  const passwordInput=document.getElementById("roomPassword");
  const status=document.getElementById("createRoomStatus");
  const button=document.getElementById("confirmCreateRoomButton");

  const name=nameInput?.value.trim()||"";
  const password=passwordInput?.value||"";

  if(!name){
    if(status)status.textContent="DIGITE O NOME DA SALA.";
    return;
  }

  if(!password){
    if(status)status.textContent="DIGITE A SENHA DA SALA.";
    return;
  }

  if(button)button.disabled=true;
  if(status)status.textContent="CRIANDO SALA...";

  try{
    const response=await fetch(`${API_BASE}/api/rooms`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name,password})
    });

    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      throw new Error(data.message||data.error||`HTTP ${response.status}`);
    }

    if(!data.room){
      throw new Error("Servidor não retornou a sala.");
    }

    currentRoom=data.room;
    currentAccessToken=data.accessToken||null;

    sessionStorage.setItem(
      "hunt_broadcaster_room",
      JSON.stringify({
        room:currentRoom,
        accessToken:currentAccessToken
      })
    );

    window.location.href="/broadcaster.html";
  }catch(error){
    console.error("HUNT: erro criando sala:",error);

    if(status){
      status.textContent=
        error.message||"NÃO FOI POSSÍVEL CRIAR A SALA.";
    }

    if(button)button.disabled=false;
  }
}

function selectRoom(room){
  if(!room)return;

  if(currentRole==="broadcaster"){
    startBroadcasterRoom(room);
    return;
  }

  showJoinRoom(room);
}

function startBroadcasterRoom(room){
  currentRoom=room;
  currentAccessToken=null;

  sessionStorage.setItem(
    "hunt_broadcaster_selected_room",
    JSON.stringify(room)
  );

  window.location.href="/broadcaster.html";
}

function showJoinRoom(room){
  stopRoomsRefresh();

  app.innerHTML=`
    <div class="hunt-screen join-room-screen">
      <div class="join-room-box">
        <div class="join-room-logo">HUNT</div>

        <div class="join-room-title">
          ${escapeHtml(room.name)}
        </div>

        <div class="join-room-subtitle">
          ${room.live?"🔴 TRANSMISSÃO AO VIVO":"⚫ AGUARDANDO TRANSMISSÃO"}
        </div>

        <label class="room-form-label" for="joinRoomPassword">
          SENHA DA SALA
        </label>

        <input
          id="joinRoomPassword"
          class="room-form-input"
          type="password"
          maxlength="100"
          placeholder="Digite a senha"
          autocomplete="current-password"
        >

        <div class="join-room-actions">
          <button id="cancelJoinRoomButton" class="hunt-button secondary" type="button">
            ← SALAS
          </button>

          <button id="confirmJoinRoomButton" class="hunt-button" type="button">
            ENTRAR
          </button>
        </div>

        <div id="joinRoomStatus" class="hunt-status"></div>
      </div>
    </div>
  `;

  const cancelButton=document.getElementById("cancelJoinRoomButton");
  const confirmButton=document.getElementById("confirmJoinRoomButton");
  const passwordInput=document.getElementById("joinRoomPassword");

  if(cancelButton){
    cancelButton.addEventListener("click",()=>{
      openRooms("viewer");
    });
  }

  if(confirmButton){
    confirmButton.addEventListener("click",()=>joinRoom(room));
  }

  if(passwordInput){
    passwordInput.addEventListener("keydown",event=>{
      if(event.key==="Enter")joinRoom(room);
    });

    passwordInput.focus();
  }
}

async function joinRoom(room){
  const passwordInput=document.getElementById("joinRoomPassword");
  const status=document.getElementById("joinRoomStatus");
  const button=document.getElementById("confirmJoinRoomButton");

  const password=passwordInput?.value||"";

  if(!password){
    if(status)status.textContent="DIGITE A SENHA DA SALA.";
    return;
  }

  if(button)button.disabled=true;
  if(status)status.textContent="VERIFICANDO ACESSO...";

  try{
    const response=await fetch(
      `${API_BASE}/api/rooms/${encodeURIComponent(room.id)}/join`,
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({password})
      }
    );

    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      throw new Error(
        data.message||
        data.error||
        "SENHA INCORRETA."
      );
    }

    if(!data.accessToken){
      throw new Error("Servidor não retornou um token de acesso.");
    }

    currentRoom=data.room||room;
    currentAccessToken=data.accessToken;
    viewerJoinPending=true;
    viewerJoinedRoomId=null;
    viewerRefreshInProgress=false;

    sessionStorage.setItem(
      "hunt_viewer_room",
      JSON.stringify({
        room:currentRoom,
        accessToken:currentAccessToken
      })
    );

    currentScreen="viewer";
    renderViewerScreen();
  }catch(error){
    console.error("HUNT: erro entrando na sala:",error);

    if(status){
      status.textContent=
        error.message||"NÃO FOI POSSÍVEL ENTRAR NA SALA.";
    }

    if(button)button.disabled=false;
  }
}

/* ========================================
   VIEWER
======================================== */

function renderViewerScreen(){
  currentScreen="viewer";
  fullscreenMouseNearBottom=false;

  app.innerHTML=`
    <div id="viewerScreen" class="hunt-screen viewer-screen">
      <div id="viewerContainer" class="viewer-container wide-mode" data-player-mode="wide">

        <div class="viewer-topbar">
          <div class="viewer-room-name">
            ${escapeHtml(currentRoom?.name||"HUNT SCREEN")}
          </div>

          <button id="backButton" class="hunt-button secondary small-button" type="button">
            ← SALAS
          </button>
        </div>

        <div class="viewer-player-area">
          <video
            id="remoteVideo"
            class="remote-video"
            autoplay
            playsinline
            controls>
          </video>

          <div id="viewerMessage" class="viewer-message">
            CONECTANDO À TRANSMISSÃO...
          </div>

          <button
            id="huntFullscreenButton"
            class="hunt-fullscreen-button"
            type="button"
            aria-label="Entrar em tela cheia">
            ⛶
          </button>

          <button
            id="huntExitFullscreenButton"
            class="hunt-exit-fullscreen-button"
            type="button"
            aria-label="Sair da tela cheia">
            ✕
          </button>
        </div>

        <div class="viewer-controls">
          <button
            id="refreshButton"
            class="viewer-control-button"
            type="button"
            aria-label="Atualizar transmissão">
            🔄
          </button>

          <button
            id="fullscreenButton"
            class="viewer-control-button"
            type="button">
            ⛶ TELA CHEIA
          </button>

          <div class="viewer-mode-controls">
            <button
              id="wideModeButton"
              class="viewer-control-button active"
              type="button"
              aria-pressed="true">
              WIDE
            </button>

            <button
              id="normalModeButton"
              class="viewer-control-button"
              type="button"
              aria-pressed="false">
              NORMAL
            </button>
          </div>
        </div>

        <div
          id="viewerStatus"
          class="hunt-status">
          CONECTANDO...
        </div>
      </div>
    </div>
  `;

  const refreshButton=document.getElementById("refreshButton");
  const backButton=document.getElementById("backButton");
  const wideButton=document.getElementById("wideModeButton");
  const normalButton=document.getElementById("normalModeButton");
  const fullscreenButton=document.getElementById("fullscreenButton");
  const huntFullscreenButton=document.getElementById("huntFullscreenButton");
  const huntExitFullscreenButton=document.getElementById("huntExitFullscreenButton");

  if(refreshButton){
    refreshButton.addEventListener("click",refreshViewer);
  }

  if(backButton){
    backButton.addEventListener("click",async()=>{
      await exitHuntFullscreen();
      leaveCurrentRoom();
      closeViewer();

      currentScreen="rooms";
      currentRole="viewer";
      currentRoom=null;
      currentAccessToken=null;
      viewerJoinPending=false;
      viewerJoinedRoomId=null;
      viewerRefreshInProgress=false;

      openRooms("viewer");
    });
  }

  if(wideButton){
    wideButton.addEventListener("click",()=>{
      setPlayerMode("wide");
    });
  }

  if(normalButton){
    normalButton.addEventListener("click",()=>{
      setPlayerMode("normal");
    });
  }

  if(fullscreenButton){
    fullscreenButton.addEventListener("click",toggleHuntFullscreen);
  }

  if(huntFullscreenButton){
    huntFullscreenButton.addEventListener("click",toggleHuntFullscreen);
  }

  if(huntExitFullscreenButton){
    huntExitFullscreenButton.addEventListener("click",exitHuntFullscreen);
  }

  const video=document.getElementById("remoteVideo");

  if(video){
    video.volume=1;
    video.muted=false;

    video.addEventListener("loadedmetadata",()=>{
      console.log(
        "HUNT: vídeo remoto carregado:",
        video.videoWidth,
        "x",
        video.videoHeight
      );
    });

    video.addEventListener("playing",()=>{
      showViewerMessage("");
      updateViewerStatus();
    });

    video.addEventListener("error",error=>{
      console.error(
        "HUNT: erro no vídeo remoto:",
        error
      );
    });
  }

  fullscreenMouseNearBottom=false;
  setupFullscreenHover();

  setPlayerMode(currentPlayerMode);
  updateFullscreenButtons();
  updateViewerStatus();
  joinCurrentViewerRoom();
}

/* ========================================
   FULLSCREEN HOVER
======================================== */

function setupFullscreenHover(){
  const container=document.getElementById("viewerContainer");
  const enterButton=document.getElementById("huntFullscreenButton");
  const exitButton=document.getElementById("huntExitFullscreenButton");

  if(!container)return;

  const setFloatingVisibility=visible=>{
    fullscreenMouseNearBottom=visible;

    container.classList.toggle(
      "fullscreen-hover-active",
      visible
    );

    if(enterButton){
      enterButton.classList.toggle(
        "fullscreen-hover-visible",
        visible&&!huntFullscreen
      );
    }

    if(exitButton){
      exitButton.classList.toggle(
        "fullscreen-hover-visible",
        visible&&huntFullscreen
      );
    }
  };

  const handleMouseMove=event=>{
    const rect=container.getBoundingClientRect();

    if(
      event.clientX<rect.left||
      event.clientX>rect.right||
      event.clientY<rect.top||
      event.clientY>rect.bottom
    ){
      setFloatingVisibility(false);
      return;
    }

    const x=event.clientX-rect.left;
    const y=event.clientY-rect.top;

    const centerX=rect.width/2;
    const distanceX=Math.abs(x-centerX);

    const nearCenter=
      distanceX<=Math.max(140,rect.width*0.2);

    const nearBottom=
      y>=rect.height-Math.max(110,rect.height*0.18);

    setFloatingVisibility(
      nearCenter&&nearBottom
    );
  };

  container.addEventListener(
    "mousemove",
    handleMouseMove
  );

  container.addEventListener(
    "mouseleave",
    ()=>{
      setFloatingVisibility(false);
    }
  );

  window.addEventListener(
    "resize",
    ()=>{
      setFloatingVisibility(false);
    }
  );
}

function toggleHuntFullscreen(){
  if(huntFullscreen){
    exitHuntFullscreen();
  }else{
    enterHuntFullscreen();
  }
}

async function enterHuntFullscreen(){
  const viewerScreen=document.getElementById("viewerScreen");
  const container=document.getElementById("viewerContainer");

  if(!viewerScreen||!container)return;

  huntFullscreen=true;
  nativeFullscreenActive=false;
  fullscreenMouseNearBottom=false;

  document.body.classList.add("hunt-fullscreen-active");
  viewerScreen.classList.add("hunt-player-fullscreen");
  container.classList.add("hunt-fullscreen-container");
  container.classList.remove("fullscreen-hover-active");

  document.getElementById("huntFullscreenButton")
    ?.classList.remove("fullscreen-hover-visible");

  document.getElementById("huntExitFullscreenButton")
    ?.classList.remove("fullscreen-hover-visible");

  updateFullscreenButtons();

  try{
    if(
      typeof container.requestFullscreen==="function"&&
      !document.fullscreenElement
    ){
      await container.requestFullscreen();
      nativeFullscreenActive=true;
      console.log("HUNT: Fullscreen API ativada.");
    }
  }catch(error){
    nativeFullscreenActive=false;

    console.warn(
      "HUNT: Fullscreen API bloqueada ou indisponível. Usando fullscreen visual.",
      error
    );
  }

  updateFullscreenButtons();
}

async function exitHuntFullscreen(){
  const viewerScreen=document.getElementById("viewerScreen");
  const container=document.getElementById("viewerContainer");

  try{
    if(
      document.fullscreenElement&&
      typeof document.exitFullscreen==="function"
    ){
      await document.exitFullscreen();
    }
  }catch(error){
    console.warn(
      "HUNT: erro saindo do Fullscreen API:",
      error
    );
  }

  nativeFullscreenActive=false;
  huntFullscreen=false;
  fullscreenMouseNearBottom=false;

  document.body.classList.remove("hunt-fullscreen-active");

  if(viewerScreen){
    viewerScreen.classList.remove("hunt-player-fullscreen");
  }

  if(container){
    container.classList.remove(
      "hunt-fullscreen-container",
      "fullscreen-hover-active"
    );
  }

  document.getElementById("huntFullscreenButton")
    ?.classList.remove("fullscreen-hover-visible");

  document.getElementById("huntExitFullscreenButton")
    ?.classList.remove("fullscreen-hover-visible");

  updateFullscreenButtons();
}

document.addEventListener("fullscreenchange",()=>{
  const viewerScreen=document.getElementById("viewerScreen");
  const container=document.getElementById("viewerContainer");

  if(!document.fullscreenElement){
    nativeFullscreenActive=false;

    if(huntFullscreen){
      viewerScreen?.classList.add("hunt-player-fullscreen");
      container?.classList.add("hunt-fullscreen-container");
      document.body.classList.add("hunt-fullscreen-active");
    }else{
      viewerScreen?.classList.remove("hunt-player-fullscreen");
      container?.classList.remove("hunt-fullscreen-container");
      document.body.classList.remove("hunt-fullscreen-active");
    }

    updateFullscreenButtons();
    return;
  }

  nativeFullscreenActive=true;
  huntFullscreen=true;

  document.body.classList.add("hunt-fullscreen-active");
  viewerScreen?.classList.add("hunt-player-fullscreen");
  container?.classList.add("hunt-fullscreen-container");

  updateFullscreenButtons();
});

function updateFullscreenButtons(){
  const fullscreenButton=document.getElementById("fullscreenButton");
  const enterButton=document.getElementById("huntFullscreenButton");
  const exitButton=document.getElementById("huntExitFullscreenButton");

  if(fullscreenButton){
    fullscreenButton.textContent=
      huntFullscreen
        ?"✕ SAIR DA TELA CHEIA"
        :"⛶ TELA CHEIA";
  }

  if(enterButton){
    const showEnter=
      !huntFullscreen&&
      fullscreenMouseNearBottom;

    enterButton.style.display=
      huntFullscreen?"none":"flex";

    enterButton.classList.toggle(
      "fullscreen-hover-visible",
      showEnter
    );
  }

  if(exitButton){
    const showExit=
      huntFullscreen&&
      fullscreenMouseNearBottom;

    exitButton.style.display=
      huntFullscreen?"flex":"none";

    exitButton.classList.toggle(
      "fullscreen-hover-visible",
      showExit
    );
  }
}

document.addEventListener("keydown",async event=>{
  if(event.key==="Escape"&&huntFullscreen){
    await exitHuntFullscreen();
  }
});

function setPlayerMode(mode){
  if(mode!=="wide"&&mode!=="normal"){
    mode="wide";
  }

  currentPlayerMode=mode;

  const container=document.getElementById("viewerContainer");
  const wideButton=document.getElementById("wideModeButton");
  const normalButton=document.getElementById("normalModeButton");

  if(!container)return;

  container.classList.remove(
    "wide-mode",
    "normal-mode"
  );

  container.classList.add(
    mode==="wide"?"wide-mode":"normal-mode"
  );

  container.dataset.playerMode=mode;

  if(wideButton){
    wideButton.classList.toggle(
      "active",
      mode==="wide"
    );

    wideButton.setAttribute(
      "aria-pressed",
      mode==="wide"?"true":"false"
    );
  }

  if(normalButton){
    normalButton.classList.toggle(
      "active",
      mode==="normal"
    );

    normalButton.setAttribute(
      "aria-pressed",
      mode==="normal"?"true":"false"
    );
  }

  requestAnimationFrame(()=>{
    window.dispatchEvent(new Event("resize"));
  });

  console.log("HUNT: modo do player:",mode);
}
socket.on("user-joined",data=>{
  console.log("HUNT: novo espectador entrou:",data);
});

socket.on("room-access-denied",data=>{
  console.warn("HUNT: acesso à sala negado:",data);

  if(currentScreen==="viewer"){
    closeViewer();
    viewerJoinPending=false;
    viewerJoinedRoomId=null;
    viewerRefreshInProgress=false;
    showViewerMessage(
      data?.message||"ACESSO NEGADO À SALA"
    );
  }
});

socket.on("stream-started",data=>{
  console.log("HUNT: transmissão iniciada:",data);

  if(currentScreen!=="viewer")return;

  if(
    data?.roomId&&
    currentRoom&&
    data.roomId!==currentRoom.id
  )return;

  showViewerMessage(
    "TRANSMISSÃO INICIADA..."
  );

  viewerJoinPending=true;
  viewerJoinedRoomId=null;
  joinCurrentViewerRoom();
});

socket.on("stream-stopped",data=>{
  console.log("HUNT: transmissão encerrada:",data);

  if(currentScreen!=="viewer")return;

  if(
    data?.roomId&&
    currentRoom&&
    data.roomId!==currentRoom.id
  )return;

  closeViewer();
  viewerRefreshInProgress=false;

  showViewerMessage(
    "NENHUMA TRANSMISSÃO ATIVA"
  );

  const status=document.getElementById("viewerStatus");

  if(status){
    status.textContent=
      "● TRANSMISSÃO ENCERRADA";
  }
});

socket.on("room-closed",data=>{
  console.log("HUNT: sala fechada:",data);

  if(currentScreen!=="viewer")return;

  if(
    data?.roomId&&
    currentRoom&&
    data.roomId!==currentRoom.id
  )return;

  closeViewer();

  currentRoom=null;
  currentAccessToken=null;
  viewerJoinPending=false;
  viewerJoinedRoomId=null;
  viewerRefreshInProgress=false;

  showViewerMessage(
    "ESTA SALA FOI ENCERRADA"
  );

  const status=document.getElementById("viewerStatus");

  if(status){
    status.textContent="● SALA ENCERRADA";
  }
});

function showViewerMessage(message){
  const element=document.getElementById(
    "viewerMessage"
  );

  if(!element)return;

  element.textContent=message;
  element.style.display=message?"flex":"none";
}

async function refreshViewer(){
  if(currentScreen!=="viewer")return;
  if(viewerRefreshInProgress)return;

  viewerRefreshInProgress=true;

  showViewerMessage(
    "ATUALIZANDO TRANSMISSÃO..."
  );

  closeViewer();

  viewerJoinedRoomId=null;
  viewerJoinPending=true;

  try{
    await joinCurrentViewerRoom();
  }finally{
    viewerRefreshInProgress=false;
  }
}

async function joinCurrentViewerRoom(){
  if(
    currentScreen!=="viewer"||
    !currentRoom||
    !currentAccessToken||
    currentRole!=="viewer"
  ){
    return;
  }

  if(!socket.connected){
    viewerJoinPending=true;
    updateViewerStatus();
    return;
  }

  if(
    viewerJoinedRoomId===currentRoom.id&&
    !viewerJoinPending
  ){
    return;
  }

  viewerJoinPending=false;

  const roomId=currentRoom.id;

  try{
    socket.emit(
      "join-room",
      {
        roomId,
        accessToken:currentAccessToken,
        role:"viewer"
      }
    );

    viewerJoinedRoomId=roomId;

    updateViewerStatus();

    console.log(
      "HUNT: viewer entrou na sala:",
      roomId
    );
  }catch(error){
    console.error(
      "HUNT: erro entrando via socket:",
      error
    );

    viewerJoinPending=true;
    updateViewerStatus();
  }
}

function updateViewerStatus(){
  const status=document.getElementById(
    "viewerStatus"
  );

  if(!status)return;

  if(!socket.connected){
    status.textContent=
      "● CONECTANDO AO SERVIDOR...";
    return;
  }

  if(
    viewerJoinPending||
    !viewerJoinedRoomId
  ){
    status.textContent=
      "● CONECTANDO À SALA...";
    return;
  }

  status.textContent=
    "● CONECTADO À SALA";
}

socket.on("offer",async data=>{
  if(currentScreen!=="viewer")return;

  if(
    data?.roomId&&
    currentRoom&&
    data.roomId!==currentRoom.id
  )return;

  if(!data?.offer)return;

  console.log(
    "HUNT: offer recebida:",
    data
  );

  broadcasterId=
    data.broadcasterId||
    data.socketId||
    broadcasterId;

  closePeerOnly();

  peer=new RTCPeerConnection(
    rtcConfig
  );

  peer.ontrack=event=>{
    const video=document.getElementById(
      "remoteVideo"
    );

    if(!video)return;

    if(event.streams?.[0]){
      video.srcObject=
        event.streams[0];
    }else{
      const stream=
        video.srcObject||
        new MediaStream();

      stream.addTrack(
        event.track
      );

      video.srcObject=stream;
    }

    showViewerMessage("");
    updateViewerStatus();

    video.play().catch(error=>{
      console.warn(
        "HUNT: autoplay bloqueado:",
        error
      );
    });
  };

  peer.onicecandidate=event=>{
    if(!event.candidate)return;

    socket.emit(
      "ice-candidate",
      {
        roomId:currentRoom?.id,
        targetSocketId:broadcasterId,
        candidate:event.candidate
      }
    );
  };

  peer.onconnectionstatechange=()=>{
    console.log(
      "HUNT: estado WebRTC:",
      peer?.connectionState
    );

    if(
      peer&&
      (
        peer.connectionState==="failed"||
        peer.connectionState==="closed"||
        peer.connectionState==="disconnected"
      )
    ){
      viewerJoinedRoomId=null;
      viewerJoinPending=true;
      updateViewerStatus();
    }
  };

  try{
    await peer.setRemoteDescription(
      new RTCSessionDescription(
        data.offer
      )
    );

    const answer=
      await peer.createAnswer();

    await peer.setLocalDescription(
      answer
    );

    socket.emit(
      "answer",
      {
        roomId:currentRoom?.id,
        targetSocketId:broadcasterId,
        answer
      }
    );

    console.log(
      "HUNT: answer enviada."
    );
  }catch(error){
    console.error(
      "HUNT: erro processando offer:",
      error
    );
  }
});

socket.on("ice-candidate",async data=>{
  if(!peer||!data?.candidate)return;

  try{
    if(peer.remoteDescription){
      await peer.addIceCandidate(
        new RTCIceCandidate(
          data.candidate
        )
      );
    }else{
      pendingCandidates.push(
        data.candidate
      );
    }
  }catch(error){
    console.error(
      "HUNT: erro aplicando ICE:",
      error
    );
  }
});

function closePeerOnly(){
  pendingCandidates=[];

  if(peer){
    try{
      peer.ontrack=null;
      peer.onicecandidate=null;
      peer.close();
    }catch(error){
      console.warn(
        "HUNT: erro fechando peer:",
        error
      );
    }
  }

  peer=null;
  broadcasterId=null;
}

function closeViewer(){
  closePeerOnly();

  const video=document.getElementById(
    "remoteVideo"
  );

  if(video){
    try{
      video.pause();
    }catch{}

    video.srcObject=null;
  }
}

function leaveCurrentRoom(){
  if(
    socket.connected&&
    currentRoom
  ){
    try{
      socket.emit(
        "leave-room",
        {
          roomId:currentRoom.id
        }
      );
    }catch(error){
      console.warn(
        "HUNT: erro saindo da sala:",
        error
      );
    }
  }

  viewerJoinedRoomId=null;
  viewerJoinPending=false;
}

document.addEventListener(
  "visibilitychange",
  ()=>{
    if(
      document.visibilityState==="visible"&&
      currentScreen==="viewer"&&
      currentRoom
    ){
      if(
        !socket.connected||
        viewerJoinedRoomId!==currentRoom.id
      ){
        viewerJoinPending=true;
        joinCurrentViewerRoom();
      }
    }
  }
);

window.addEventListener(
  "beforeunload",
  ()=>{
    try{
      leaveCurrentRoom();
    }catch{}
  }
);

showHome();