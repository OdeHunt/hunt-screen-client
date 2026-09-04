import { io } from "socket.io-client";
import "./broadcaster.css";

/* ========================================
   CONFIGURAÇÃO
======================================== */

const SERVER_URL =
  "https://hunt-screen-server.onrender.com";

const SOCKET_PATH =
  "/hunt-socket";


/* ========================================
   ELEMENTOS
======================================== */

const preview =
  document.getElementById("preview");

const emptyPreview =
  document.getElementById("emptyPreview");

const quality =
  document.getElementById("quality");

const fps =
  document.getElementById("fps");

const chooseButton =
  document.getElementById("chooseButton");

const startButton =
  document.getElementById("startButton");

const stopButton =
  document.getElementById("stopButton");

const backButton =
  document.getElementById("backButton");

const statusElement =
  document.getElementById("status");

const errorElement =
  document.getElementById("error");


/* ========================================
   ESTADO
======================================== */

let socket = null;

let localStream = null;

let isStreaming = false;

let isSelectingScreen = false;

let roomData = null;

let broadcasterId = null;

const viewerPeers = new Map();

let startRequestPending = false;


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


/* ========================================
   CARREGAR SALA
======================================== */

function loadRoomData() {

  try {

    const stored =
      sessionStorage.getItem(
        "HUNT_ROOM"
      );

    if (!stored) {

      throw new Error(
        "Nenhuma sala foi selecionada."
      );

    }

    const data =
      JSON.parse(stored);

    if (
      !data ||
      !data.id ||
      !data.accessToken
    ) {

      throw new Error(
        "Os dados da sala estão incompletos."
      );

    }

    roomData =
      data;

    console.log(
      "HUNT BROADCASTER: sala carregada:",
      roomData
    );

    return true;

  }

  catch (error) {

    console.error(
      "HUNT BROADCASTER: erro carregando sala:",
      error
    );

    showError(
      error.message ||
      "Não foi possível carregar a sala."
    );

    updateStatus(
      "NENHUMA SALA SELECIONADA"
    );

    return false;

  }

}


/* ========================================
   SOCKET
======================================== */

function connectSocket() {

  if (socket) {

    try {

      socket.disconnect();

    }

    catch {}

  }


  socket =
    io(
      SERVER_URL,
      {
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
      }
    );


  /* ======================================
     CONECTADO
  ====================================== */

  socket.on(
    "connect",
    () => {

      console.log(
        "HUNT BROADCASTER: conectado:",
        socket.id
      );

      broadcasterId =
        socket.id;

      updateStatus(
        isStreaming
          ? "🔴 TRANSMITINDO"
          : "● CONECTADO"
      );

      clearError();

      joinBroadcasterRoom();

    }
  );


  /* ======================================
     DESCONECTADO
  ====================================== */

  socket.on(
    "disconnect",
    reason => {

      console.warn(
        "HUNT BROADCASTER: desconectado:",
        reason
      );

      /*
       * Se perder a conexão,
       * as conexões WebRTC antigas
       * não são mais confiáveis.
       */

      closeAllViewerPeers();

      if (!isStreaming) {

        updateStatus(
          "● DESCONECTADO"
        );

      }

      else {

        updateStatus(
          "⚠ CONEXÃO PERDIDA"
        );

      }

    }
  );


  /* ======================================
     ERRO DE CONEXÃO
  ====================================== */

  socket.on(
    "connect_error",
    error => {

      console.error(
        "HUNT BROADCASTER: erro Socket.IO:",
        error
      );

      updateStatus(
        "⚠ ERRO DE CONEXÃO"
      );

      showError(
        "Não foi possível conectar ao servidor."
      );

    }
  );


  /* ======================================
     VIEWER ENTROU
  ====================================== */

  socket.on(
    "user-joined",
    data => {

      console.log(
        "HUNT BROADCASTER: usuário entrou:",
        data
      );

      if (
        !isStreaming ||
        !localStream
      ) {

        console.log(
          "HUNT BROADCASTER: viewer entrou antes da transmissão."
        );

        return;

      }

      const viewerId =
        data?.socketId ||
        data?.id ||
        data?.userId;

      if (!viewerId) {

        console.warn(
          "HUNT BROADCASTER: ID do viewer não recebido."
        );

        return;

      }

      if (
        viewerId ===
        socket.id
      ) {

        return;

      }

      createOfferForViewer(
        viewerId
      );

    }
  );


  /* ======================================
     ANSWER
  ====================================== */

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

      console.log(
        "HUNT BROADCASTER: ANSWER recebida:",
        data.sender
      );

      const peer =
        viewerPeers.get(
          data.sender
        );

      if (!peer) {

        console.warn(
          "HUNT BROADCASTER: Peer do viewer não encontrado:",
          data.sender
        );

        return;

      }

      try {

        await peer.setRemoteDescription(
          data.answer
        );

        console.log(
          "HUNT BROADCASTER: ANSWER aplicada:",
          data.sender
        );

      }

      catch (error) {

        console.error(
          "HUNT BROADCASTER: erro aplicando ANSWER:",
          error
        );

      }

    }
  );


  /* ======================================
     ICE CANDIDATE
  ====================================== */

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
        viewerPeers.get(
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

        console.warn(
          "HUNT BROADCASTER: erro adicionando ICE:",
          error
        );

      }

    }
  );


  /* ======================================
     STREAM INICIADA
  ====================================== */

  socket.on(
    "stream-started",
    data => {

      console.log(
        "HUNT BROADCASTER: stream-started recebido:",
        data
      );

      /*
       * IMPORTANTE:
       *
       * O server.js atual envia para o
       * próprio broadcaster:
       *
       * {
       *   broadcasterId: socket.id,
       *   local: true
       * }
       *
       * Ele NÃO envia roomId.
       *
       * Portanto não podemos exigir
       * data.roomId aqui.
       */

      const eventBroadcasterId =
        data?.broadcasterId ||
        null;


      /*
       * Evento vindo do próprio transmissor.
       */

      if (
        data?.local === true ||
        eventBroadcasterId ===
        socket.id
      ) {

        isStreaming =
          true;

        startRequestPending =
          false;

        updateStatus(
          "🔴 TRANSMITINDO"
        );

        updateButtons();

        clearError();

        console.log(
          "HUNT BROADCASTER: transmissão confirmada."
        );

        return;

      }


      /*
       * Se outro transmissor estiver
       * transmitindo, não assumimos
       * controle.
       */

      if (
        eventBroadcasterId &&
        eventBroadcasterId !==
        socket.id
      ) {

        console.log(
          "HUNT BROADCASTER: transmissão existente de outro usuário:",
          eventBroadcasterId
        );

        return;

      }

    }
  );


  /* ======================================
     STREAM RECUSADA
  ====================================== */

  socket.on(
    "stream-already-started",
    data => {

      console.warn(
        "HUNT BROADCASTER: transmissão já existente:",
        data
      );

      isStreaming =
        false;

      startRequestPending =
        false;

      updateButtons();

      updateStatus(
        "● TRANSMISSÃO NÃO INICIADA"
      );

      showError(
        "Esta sala já possui uma transmissão."
      );

    }
  );


  /* ======================================
     ACESSO NEGADO
  ====================================== */

  socket.on(
    "room-access-denied",
    data => {

      console.error(
        "HUNT BROADCASTER: acesso negado:",
        data
      );

      isStreaming =
        false;

      startRequestPending =
        false;

      closeAllViewerPeers();

      updateButtons();

      updateStatus(
        "⚠ ACESSO NEGADO"
      );

      showError(
        "O acesso à sala foi negado."
      );

    }
  );


  /* ======================================
     SALA FECHADA
  ====================================== */

  socket.on(
    "room-closed",
    data => {

      console.log(
        "HUNT BROADCASTER: sala fechada:",
        data
      );

      if (
        roomData &&
        data?.roomId ===
        roomData.id
      ) {

        stopStreaming(
          false,
          false
        );

        showError(
          "A sala foi encerrada."
        );

        updateStatus(
          "● SALA ENCERRADA"
        );

      }

    }
  );


  /* ======================================
     STREAM PAROU
  ====================================== */

  socket.on(
    "stream-stopped",
    data => {

      console.log(
        "HUNT BROADCASTER: stream-stopped:",
        data
      );

      /*
       * O server atual não envia
       * roomId neste evento.
       *
       * Portanto não filtramos pelo
       * roomId aqui.
       */

      if (isStreaming) {

        isStreaming =
          false;

        startRequestPending =
          false;

        closeAllViewerPeers();

        updateButtons();

        updateStatus(
          "● TRANSMISSÃO ENCERRADA"
        );

      }

    }
  );

}


/* ========================================
   ENTRAR COMO BROADCASTER
======================================== */

function joinBroadcasterRoom() {

  if (
    !socket ||
    !socket.connected ||
    !roomData
  ) {

    return;

  }

  console.log(
    "HUNT BROADCASTER: entrando na sala:",
    roomData.id
  );

  socket.emit(
    "join-room",
    {
      roomId:
        roomData.id,

      accessToken:
        roomData.accessToken,

      role:
        "broadcaster"
    }
  );

}


/* ========================================
   ESCOLHER TELA
======================================== */

async function chooseScreen() {

  if (
    isSelectingScreen ||
    isStreaming ||
    startRequestPending
  ) {

    return;

  }

  isSelectingScreen =
    true;

  clearError();

  updateStatus(
    "● SELECIONANDO TELA..."
  );

  try {

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getDisplayMedia
    ) {

      throw new Error(
        "Seu navegador não suporta captura de tela."
      );

    }


    const selectedQuality =
      Number(
        quality?.value ||
        1080
      );

    const selectedFps =
      Number(
        fps?.value ||
        60
      );


    const stream =
      await navigator.mediaDevices.getDisplayMedia(
        {
          video: {
            frameRate: {
              ideal:
                selectedFps,

              max:
                selectedFps
            },

            width: {
              ideal:
                getQualityWidth(
                  selectedQuality
                )
            },

            height: {
              ideal:
                getQualityHeight(
                  selectedQuality
                )
            }
          },

          audio:
            true
        }
      );


    if (!stream) {

      throw new Error(
        "Nenhuma tela foi selecionada."
      );

    }


    localStream =
      stream;


    const videoTrack =
      localStream.getVideoTracks()[0];


    if (!videoTrack) {

      throw new Error(
        "A captura não possui uma faixa de vídeo."
      );

    }


    videoTrack.addEventListener(
      "ended",
      () => {

        console.log(
          "HUNT BROADCASTER: compartilhamento encerrado pelo navegador."
        );

        if (isStreaming) {

          stopStreaming(
            true,
            true
          );

        }

        else {

          clearSelectedScreen();

        }

      }
    );


    preview.srcObject =
      localStream;

    preview.muted =
      true;

    preview.autoplay =
      true;

    preview.playsInline =
      true;


    try {

      await preview.play();

    }

    catch (error) {

      console.warn(
        "HUNT BROADCASTER: preview não iniciou automaticamente:",
        error
      );

    }


    if (emptyPreview) {

      emptyPreview.style.display =
        "none";

    }


    updateStatus(
      "● TELA SELECIONADA"
    );

    updateButtons();

    console.log(
      "HUNT BROADCASTER: tela selecionada."
    );

  }

  catch (error) {

    console.error(
      "HUNT BROADCASTER: erro ao selecionar tela:",
      error
    );

    if (
      error?.name ===
      "NotAllowedError"
    ) {

      updateStatus(
        "● SELEÇÃO CANCELADA"
      );

    }

    else {

      showError(
        error?.message ||
        "Não foi possível selecionar a tela."
      );

      updateStatus(
        "● NENHUMA TELA SELECIONADA"
      );

    }

  }

  finally {

    isSelectingScreen =
      false;

    updateButtons();

  }

}


/* ========================================
   RESOLUÇÃO
======================================== */

function getQualityWidth(
  qualityValue
) {

  switch (
    Number(
      qualityValue
    )
  ) {

    case 360:
      return 640;

    case 480:
      return 854;

    case 720:
      return 1280;

    case 1080:
      return 1920;

    default:
      return 1920;

  }

}


function getQualityHeight(
  qualityValue
) {

  switch (
    Number(
      qualityValue
    )
  ) {

    case 360:
      return 360;

    case 480:
      return 480;

    case 720:
      return 720;

    case 1080:
      return 1080;

    default:
      return 1080;

  }

}


/* ========================================
   COMEÇAR TRANSMISSÃO
======================================== */

async function startStreaming() {

  if (
    isStreaming ||
    startRequestPending
  ) {

    return;

  }


  clearError();


  if (!roomData) {

    showError(
      "Nenhuma sala foi selecionada."
    );

    return;

  }


  if (!localStream) {

    showError(
      "Primeiro escolha uma tela."
    );

    return;

  }


  if (
    !socket ||
    !socket.connected
  ) {

    showError(
      "Aguarde a conexão com o servidor."
    );

    return;

  }


  const videoTrack =
    localStream.getVideoTracks()[0];


  if (!videoTrack) {

    showError(
      "A captura da tela não está disponível."
    );

    return;

  }


  try {

    startRequestPending =
      true;

    updateStatus(
      "● INICIANDO TRANSMISSÃO..."
    );

    updateButtons();


    console.log(
      "HUNT BROADCASTER: enviando start-stream..."
    );


    socket.emit(
      "start-stream",
      {
        roomId:
          roomData.id,

        accessToken:
          roomData.accessToken
      }
    );


    /*
     * NÃO usamos mais timeout
     * artificial de 1,2 segundos.
     *
     * O servidor atual envia:
     *
     * stream-started
     *
     * para o próprio broadcaster.
     *
     * O listener acima recebe o evento
     * e muda isStreaming para true.
     */

  }

  catch (error) {

    console.error(
      "HUNT BROADCASTER: erro iniciando transmissão:",
      error
    );

    startRequestPending =
      false;

    showError(
      error?.message ||
      "Não foi possível iniciar a transmissão."
    );

    updateStatus(
      "● TRANSMISSÃO NÃO INICIADA"
    );

    updateButtons();

  }

}


/* ========================================
   CRIAR OFFER PARA VIEWER
======================================== */

async function createOfferForViewer(
  viewerId
) {

  if (
    !isStreaming ||
    !localStream ||
    !socket ||
    !socket.connected
  ) {

    return;

  }


  if (
    viewerId ===
    socket.id
  ) {

    return;

  }


  console.log(
    "HUNT BROADCASTER: criando Peer para:",
    viewerId
  );


  const oldPeer =
    viewerPeers.get(
      viewerId
    );


  if (oldPeer) {

    try {

      oldPeer.close();

    }

    catch {}

    viewerPeers.delete(
      viewerId
    );

  }


  const peer =
    new RTCPeerConnection(
      rtcConfig
    );


  viewerPeers.set(
    viewerId,
    peer
  );


  /* ======================================
     TRACKS
  ====================================== */

  for (
    const track
    of localStream.getTracks()
  ) {

    try {

      peer.addTrack(
        track,
        localStream
      );

    }

    catch (error) {

      console.error(
        "HUNT BROADCASTER: erro adicionando track:",
        error
      );

    }

  }


  /* ======================================
     ICE
  ====================================== */

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

      console.log(
        "HUNT BROADCASTER: ICE enviada:",
        viewerId
      );

    };


  /* ======================================
     ESTADO DA CONEXÃO
  ====================================== */

  peer.onconnectionstatechange =
    () => {

      console.log(
        "HUNT BROADCASTER:",
        viewerId,
        peer.connectionState
      );


      if (
        peer.connectionState ===
        "failed"
      ) {

        try {

          peer.restartIce();

        }

        catch {}

      }


      if (
        peer.connectionState ===
        "closed"
      ) {

        if (
          viewerPeers.get(
            viewerId
          ) === peer
        ) {

          viewerPeers.delete(
            viewerId
          );

        }

      }


      if (
        peer.connectionState ===
        "disconnected"
      ) {

        setTimeout(
          () => {

            const currentPeer =
              viewerPeers.get(
                viewerId
              );

            if (
              currentPeer === peer &&
              peer.connectionState ===
              "disconnected"
            ) {

              try {

                peer.close();

              }

              catch {}

              viewerPeers.delete(
                viewerId
              );

            }

          },
          10000
        );

      }

    };


  /* ======================================
     NEGOTIAÇÃO
  ====================================== */

  try {

    const offer =
      await peer.createOffer();


    await peer.setLocalDescription(
      offer
    );


    if (
      !socket ||
      !socket.connected
    ) {

      return;

    }


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
      "HUNT BROADCASTER: OFFER enviada para:",
      viewerId
    );

  }

  catch (error) {

    console.error(
      "HUNT BROADCASTER: erro criando OFFER:",
      error
    );


    try {

      peer.close();

    }

    catch {}


    viewerPeers.delete(
      viewerId
    );

  }

}


/* ========================================
   FECHAR PEERS
======================================== */

function closeAllViewerPeers() {

  for (
    const [
      viewerId,
      peer
    ]
    of viewerPeers
  ) {

    try {

      peer.close();

    }

    catch {}

  }

  viewerPeers.clear();

}


/* ========================================
   PARAR TRANSMISSÃO
======================================== */

function stopStreaming(
  notifyServer = true,
  stopCapture = true
) {

  console.log(
    "HUNT BROADCASTER: parando transmissão."
  );


  startRequestPending =
    false;


  closeAllViewerPeers();


  if (
    notifyServer &&
    socket &&
    socket.connected &&
    roomData
  ) {

    try {

      socket.emit(
        "stop-stream",
        {
          roomId:
            roomData.id,

          accessToken:
            roomData.accessToken
        }
      );

    }

    catch (error) {

      console.warn(
        "HUNT BROADCASTER: erro enviando stop-stream:",
        error
      );

    }

  }


  isStreaming =
    false;


  if (
    stopCapture &&
    localStream
  ) {

    for (
      const track
      of localStream.getTracks()
    ) {

      try {

        track.stop();

      }

      catch {}

    }

    localStream =
      null;

  }


  if (
    stopCapture &&
    preview
  ) {

    preview.srcObject =
      null;

  }


  if (
    stopCapture &&
    emptyPreview
  ) {

    emptyPreview.style.display =
      "flex";

  }


  updateButtons();


  if (stopCapture) {

    updateStatus(
      "● TRANSMISSÃO ENCERRADA"
    );

  }

}


/* ========================================
   LIMPAR TELA SELECIONADA
======================================== */

function clearSelectedScreen() {

  if (localStream) {

    for (
      const track
      of localStream.getTracks()
    ) {

      try {

        track.stop();

      }

      catch {}

    }

  }


  localStream =
    null;


  if (preview) {

    preview.srcObject =
      null;

  }


  if (emptyPreview) {

    emptyPreview.style.display =
      "flex";

  }


  startRequestPending =
    false;


  updateStatus(
    "● NENHUMA TELA SELECIONADA"
  );


  updateButtons();

}


/* ========================================
   BOTÕES
======================================== */

function updateButtons() {

  if (!chooseButton) {

    return;

  }


  if (isStreaming) {

    chooseButton.classList.add(
      "hidden"
    );


    if (startButton) {

      startButton.classList.add(
        "hidden"
      );

      startButton.disabled =
        false;

    }


    if (stopButton) {

      stopButton.classList.remove(
        "hidden"
      );

      stopButton.disabled =
        false;

    }

    return;

  }


  if (stopButton) {

    stopButton.classList.add(
      "hidden"
    );

  }


  if (startRequestPending) {

    chooseButton.classList.add(
      "hidden"
    );


    if (startButton) {

      startButton.classList.remove(
        "hidden"
      );

      startButton.disabled =
        true;

    }

    return;

  }


  if (localStream) {

    chooseButton.classList.add(
      "hidden"
    );


    if (startButton) {

      startButton.classList.remove(
        "hidden"
      );

      startButton.disabled =
        false;

    }

  }

  else {

    chooseButton.classList.remove(
      "hidden"
    );


    if (startButton) {

      startButton.classList.add(
        "hidden"
      );

      startButton.disabled =
        false;

    }

  }

}


/* ========================================
   STATUS
======================================== */

function updateStatus(
  message
) {

  if (!statusElement) {

    return;

  }

  statusElement.textContent =
    message;

}


/* ========================================
   ERRO
======================================== */

function showError(
  message
) {

  if (!errorElement) {

    console.error(
      "HUNT:",
      message
    );

    return;

  }

  errorElement.textContent =
    message;

}


function clearError() {

  if (!errorElement) {

    return;

  }

  errorElement.textContent =
    "";

}


/* ========================================
   VOLTAR
======================================== */

async function goBack() {

  if (isStreaming) {

    const confirmed =
      window.confirm(
        "A transmissão está ativa. Deseja realmente sair?"
      );

    if (!confirmed) {

      return;

    }

    stopStreaming(
      true,
      true
    );

  }

  else {

    clearSelectedScreen();

  }


  await wait(
    150
  );


  window.location.href =
    "/";

}


/* ========================================
   WAIT
======================================== */

function wait(
  milliseconds
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );

}


/* ========================================
   EVENTOS DOS BOTÕES
======================================== */

if (chooseButton) {

  chooseButton.addEventListener(
    "click",
    chooseScreen
  );

}


if (startButton) {

  startButton.addEventListener(
    "click",
    startStreaming
  );

}


if (stopButton) {

  stopButton.addEventListener(
    "click",
    () => {

      stopStreaming(
        true,
        true
      );

    }
  );

}


if (backButton) {

  backButton.addEventListener(
    "click",
    goBack
  );

}


/* ========================================
   SELECTS
======================================== */

if (quality) {

  quality.addEventListener(
    "change",
    () => {

      console.log(
        "HUNT: qualidade:",
        quality.value
      );

    }
  );

}


if (fps) {

  fps.addEventListener(
    "change",
    () => {

      console.log(
        "HUNT: FPS:",
        fps.value
      );

    }
  );

}


/* ========================================
   VISIBILIDADE
======================================== */

document.addEventListener(
  "visibilitychange",
  () => {

    if (
      document.visibilityState ===
      "visible"
    ) {

      console.log(
        "HUNT BROADCASTER: página ativa."
      );

    }

  }
);


/* ========================================
   ANTES DE FECHAR
======================================== */

window.addEventListener(
  "beforeunload",
  () => {

    if (
      isStreaming &&
      socket &&
      socket.connected &&
      roomData
    ) {

      try {

        socket.emit(
          "stop-stream",
          {
            roomId:
              roomData.id,

            accessToken:
              roomData.accessToken
          }
        );

      }

      catch {}

    }

  }
);


/* ========================================
   INICIALIZAÇÃO
======================================== */

function initialize() {

  console.log(
    "===================================="
  );

  console.log(
    "HUNT SCREEN • BROADCASTER"
  );

  console.log(
    "Inicializando transmissor..."
  );

  console.log(
    "===================================="
  );


  updateStatus(
    "CARREGANDO SALA..."
  );


  if (!loadRoomData()) {

    if (backButton) {

      backButton.textContent =
        "← VOLTAR";

    }

    return;

  }


  updateStatus(
    `● SALA: ${
      roomData.name ||
      roomData.id
    }`
  );


  updateButtons();

  connectSocket();

}


/* ========================================
   INICIAR
======================================== */

initialize();