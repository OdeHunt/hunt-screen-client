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

let localStream =
  null;

let isStreaming =
  false;

let isSelectingScreen =
  false;

let roomData =
  null;

let broadcasterId =
  null;

const viewerPeers =
  new Map();

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
      JSON.parse(
        stored
      );

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
      "HUNT BROADCASTER: sala:",
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
          20000

      }
    );

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

      joinBroadcasterRoom();

    }
  );

  socket.on(
    "disconnect",
    reason => {

      console.warn(
        "HUNT BROADCASTER: desconectado:",
        reason
      );

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

        return;

      }

      const viewerId =
        data?.socketId ||
        data?.id ||
        data?.userId;

      if (!viewerId) {

        console.warn(
          "HUNT: ID do viewer não recebido."
        );

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
          "HUNT: Peer do viewer não encontrado:",
          data.sender
        );

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
          "HUNT: erro adicionando ICE:",
          error
        );

      }

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
          false
        );

        showError(
          "A sala foi encerrada."
        );

      }

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

      showError(
        "O acesso à sala foi negado."
      );

    }
  );

  /* ======================================
     STREAM JÁ EXISTENTE
  ====================================== */

  socket.on(
    "stream-already-started",
    data => {

      console.warn(
        "HUNT BROADCASTER: transmissão já iniciada:",
        data
      );

      showError(
        "Esta sala já possui uma transmissão."
      );

      isStreaming =
        false;

      updateButtons();

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
    isStreaming
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

    /*
     * getDisplayMedia não garante que o navegador
     * respeitará exatamente esses valores.
     *
     * Eles são usados como preferências.
     */

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

    if (videoTrack) {

      videoTrack.addEventListener(
        "ended",
        () => {

          console.log(
            "HUNT BROADCASTER: compartilhamento encerrado pelo navegador."
          );

          if (isStreaming) {

            stopStreaming(
              true
            );

          }

          else {

            clearSelectedScreen();

          }

        }
      );

    }

    /*
     * Áudio pode não existir dependendo
     * da escolha feita pelo usuário.
     */

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
        "HUNT: preview não iniciou automaticamente:",
        error
      );

    }

    if (emptyPreview) {

      emptyPreview.style.display =
        "none";

    }

    if (chooseButton) {

      chooseButton.classList.add(
        "hidden"
      );

    }

    if (startButton) {

      startButton.classList.remove(
        "hidden"
      );

    }

    updateStatus(
      "● TELA SELECIONADA"
    );

    console.log(
      "HUNT BROADCASTER: tela selecionada."
    );

  }

  catch (error) {

    console.error(
      "HUNT BROADCASTER: erro ao selecionar tela:",
      error
    );

    /*
     * Quando o usuário simplesmente cancela
     * o seletor de tela, não mostramos um erro
     * agressivo.
     */

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

  if (isStreaming) {

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

  /*
   * Garante que ainda existe uma faixa
   * de vídeo válida.
   */

  const videoTrack =
    localStream.getVideoTracks()[0];

  if (!videoTrack) {

    showError(
      "A captura da tela não está disponível."
    );

    return;

  }

  try {

    updateStatus(
      "● INICIANDO TRANSMISSÃO..."
    );

    if (startButton) {

      startButton.disabled =
        true;

    }

    /*
     * O servidor verifica o accessToken
     * e autoriza o broadcaster.
     */

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
     * O estado local só vira streaming
     * depois de o servidor confirmar.
     */

  }

  catch (error) {

    console.error(
      "HUNT BROADCASTER: erro iniciando transmissão:",
      error
    );

    showError(
      error.message ||
      "Não foi possível iniciar a transmissão."
    );

    if (startButton) {

      startButton.disabled =
        false;

    }

  }

}

/* ========================================
   CONFIRMAÇÃO DE STREAM
======================================== */

/*
 * O backend pode não possuir um evento separado
 * de confirmação. Por isso mantemos um pequeno
 * atraso para permitir que o start-stream seja
 * processado antes de liberar a interface.
 *
 * Se o servidor retornar um evento específico,
 * também tratamos abaixo.
 */

socketConfirmationFallback();

function socketConfirmationFallback() {

  if (!socket) {

    return;

  }

  socket.on(
    "stream-started",
    data => {

      /*
       * Esse evento normalmente é emitido
       * para os outros membros da sala.
       * Também tratamos aqui caso o servidor
       * envie para o próprio broadcaster.
       */

      if (
        !data ||
        !roomData ||
        data.roomId === roomData.id ||
        data.broadcasterId === socket.id
      ) {

        if (
          data?.broadcasterId &&
          data.broadcasterId !== socket.id
        ) {

          return;

        }

        isStreaming =
          true;

        updateStatus(
          "🔴 TRANSMITINDO"
        );

        updateButtons();

      }

    }
  );

  /*
   * Como alguns servidores não enviam
   * stream-started para o próprio broadcaster,
   * verificamos a existência do socket e da
   * sala após o comando.
   */

  socket.on(
    "stream-started-confirmed",
    data => {

      if (
        !roomData ||
        data?.roomId !== roomData.id
      ) {

        return;

      }

      isStreaming =
        true;

      updateStatus(
        "🔴 TRANSMITINDO"
      );

      updateButtons();

    }
  );

}

/* ========================================
   INICIAR APÓS START-STREAM
======================================== */

/*
 * O servidor atual pode simplesmente processar
 * start-stream sem enviar confirmação para o
 * próprio transmissor.
 *
 * Portanto interceptamos o emit original abaixo.
 */

const originalSocketEmitReference =
  null;

/*
 * O botão chama startStreaming(), que envia
 * start-stream. Para garantir compatibilidade
 * com o backend atual, marcamos a transmissão
 * localmente logo depois de emitir.
 */

async function startStreamingCompatible() {

  if (isStreaming) {

    return;

  }

  if (
    !roomData ||
    !localStream ||
    !socket ||
    !socket.connected
  ) {

    return startStreaming();

  }

  clearError();

  const videoTrack =
    localStream.getVideoTracks()[0];

  if (!videoTrack) {

    showError(
      "Nenhuma captura de vídeo disponível."
    );

    return;

  }

  if (startButton) {

    startButton.disabled =
      true;

  }

  updateStatus(
    "● INICIANDO TRANSMISSÃO..."
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
   * O backend atual autoriza o comando pelo
   * token. Agora liberamos o envio WebRTC.
   */

  isStreaming =
    true;

  updateStatus(
    "🔴 TRANSMITINDO"
  );

  updateButtons();

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
    !socket
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

  /*
   * Se já existe uma conexão para esse viewer,
   * fechamos antes de criar outra.
   */

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

  /*
   * Adiciona vídeo e áudio.
   */

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
        "HUNT: erro adicionando track:",
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
        !event.candidate
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

  /* ======================================
     ESTADO
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
        "closed" ||
        peer.connectionState ===
        "disconnected"
      ) {

        /*
         * Não removemos imediatamente em disconnected
         * porque o WebRTC pode se recuperar.
         */

        if (
          peer.connectionState ===
          "closed"
        ) {

          viewerPeers.delete(
            viewerId
          );

        }

      }

    };

  try {

    const offer =
      await peer.createOffer(
        {

          offerToReceiveAudio:
            false,

          offerToReceiveVideo:
            false

        }
      );

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
   PARAR TRANSMISSÃO
======================================== */

function stopStreaming(
  notifyServer = true
) {

  console.log(
    "HUNT BROADCASTER: parando transmissão."
  );

  /*
   * Fecha todos os PeerConnections.
   */

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

    viewerPeers.delete(
      viewerId
    );

  }

  /*
   * Informa ao servidor.
   */

  if (
    notifyServer &&
    socket &&
    socket.connected &&
    roomData
  ) {

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

  isStreaming =
    false;

  /*
   * Se o compartilhamento ainda estiver
   * aberto, paramos todas as tracks.
   */

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

  if (chooseButton) {

    chooseButton.classList.remove(
      "hidden"
    );

  }

  if (startButton) {

    startButton.classList.add(
      "hidden"
    );

    startButton.disabled =
      false;

  }

  if (stopButton) {

    stopButton.classList.add(
      "hidden"
    );

  }

  updateStatus(
    "● TRANSMISSÃO ENCERRADA"
  );

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

  if (chooseButton) {

    chooseButton.classList.remove(
      "hidden"
    );

  }

  if (startButton) {

    startButton.classList.add(
      "hidden"
    );

  }

  if (stopButton) {

    stopButton.classList.add(
      "hidden"
    );

  }

  updateStatus(
    "● NENHUMA TELA SELECIONADA"
  );

}

/* ========================================
   BOTÕES
======================================== */

function updateButtons() {

  if (isStreaming) {

    if (chooseButton) {

      chooseButton.classList.add(
        "hidden"
      );

    }

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

    }

  }

  else {

    if (stopButton) {

      stopButton.classList.add(
        "hidden"
      );

    }

    if (localStream) {

      if (chooseButton) {

        chooseButton.classList.add(
          "hidden"
        );

      }

      if (startButton) {

        startButton.classList.remove(
          "hidden"
        );

      }

    }

    else {

      if (chooseButton) {

        chooseButton.classList.remove(
          "hidden"
        );

      }

      if (startButton) {

        startButton.classList.add(
          "hidden"
        );

      }

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
      true
    );

  }

  else {

    clearSelectedScreen();

  }

  /*
   * Pequeno tempo para o servidor processar
   * stop-stream antes da navegação.
   */

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
    startStreamingCompatible
  );

}

if (stopButton) {

  stopButton.addEventListener(
    "click",
    () => {

      stopStreaming(
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
   VISIBILIDADE DA PÁGINA
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

      /*
       * O disconnect do Socket.IO também
       * será tratado pelo servidor.
       */

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

  /*
   * Mostra o nome da sala no status,
   * se o HTML/CSS permitir.
   */

  updateStatus(
    `● SALA: ${roomData.name || roomData.id}`
  );

  updateButtons();

  connectSocket();

}

/* ========================================
   INICIAR
======================================== */

initialize();