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

const isDiscordActivity =
  window.location.hostname.endsWith(".discordsays.com");

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
        prefix: "/hunt-socket",
        target: "hunt-screen-server.onrender.com"
      }
    ]);

    console.log(
      "HUNT: URL Mapping configurado"
    );

  } catch (error) {

    console.warn(
      "HUNT: erro no patchUrlMappings:",
      error
    );

  }

}


/* ========================================
   SOCKET.IO
======================================== */

const socket = io(
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
   VARIÁVEIS
======================================== */

let peer = null;

let broadcasterId = null;

let pendingCandidates = [];

let viewerActive = false;


/* ========================================
   ELEMENTO PRINCIPAL
======================================== */

const app =
  document.getElementById("app");


if (!app) {

  console.error(
    "HUNT: #app não encontrado."
  );

}


/* ========================================
   WEBRTC
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
   OBTER RTC
======================================== */

function getNativeRTCPeerConnection() {

  console.log(
    "HUNT: verificando RTCPeerConnection..."
  );


  const RTC =
    window.RTCPeerConnection;


  if (
    typeof RTC !==
    "function"
  ) {

    console.error(
      "HUNT: window.RTCPeerConnection não é uma função:",
      RTC
    );


    return null;

  }


  /*
   * Teste real da API.
   *
   * Isso evita continuar usando
   * uma referência inválida.
   */

  try {

    const testPeer =
      new RTC();


    testPeer.close();


    console.log(
      "HUNT: RTCPeerConnection validado."
    );


    return RTC;

  } catch (error) {

    console.error(
      "HUNT: RTCPeerConnection existe, mas não pôde ser criado:",
      error
    );


    return null;

  }

}


/* ========================================
   TELA INICIAL
======================================== */

function showHome() {

  viewerActive =
    false;


  closeViewer();


  app.innerHTML = `

    <div class="hunt-screen">

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

  } else {

    status.textContent =
      "● CONECTANDO...";

  }

}


/* ========================================
   ABRIR BROADCASTER
======================================== */

function openBroadcaster() {

  console.log(
    "HUNT: abrindo broadcaster..."
  );


  window.location.href =
    "/broadcaster.html";

}


/* ========================================
   TELA DO ESPECTADOR
======================================== */

function startViewer() {

  console.log(
    "HUNT: entrando como espectador..."
  );


  viewerActive =
    true;


  closeViewer();


  app.innerHTML = `

    <div class="hunt-screen">

      <div class="hunt-logo">
        HUNT
      </div>

      <div class="hunt-subtitle">
        SCREEN
      </div>


      <div
        id="viewerContainer"
        class="viewer-container">


        <div
          id="viewerMessage"
          class="viewer-message">

          PROCURANDO TRANSMISSÃO...

        </div>


        <video
          id="remoteVideo"
          autoplay
          playsinline>
        </video>


      </div>


      <div
        class="viewer-controls">


        <button
          id="refreshButton"
          class="hunt-button">

          🔄 ATUALIZAR TRANSMISSÃO

        </button>


        <button
          id="backButton"
          class="hunt-button secondary">

          ← VOLTAR

        </button>


      </div>


      <div
        id="viewerStatus"
        class="hunt-status">

        CONECTANDO...

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


  if (refreshButton) {

    refreshButton.addEventListener(
      "click",
      refreshViewer
    );

  }


  if (backButton) {

    backButton.addEventListener(
      "click",
      () => {

        viewerActive =
          false;

        closeViewer();

        showHome();

      }
    );

  }


  updateViewerStatus();


  if (socket.connected) {

    joinRoom();

  }

}


/* ========================================
   ENTRAR NA SALA
======================================== */

function joinRoom() {

  if (
    !socket ||
    !socket.connected
  ) {

    console.warn(
      "HUNT: Socket ainda não conectado."
    );

    return;

  }


  console.log(
    "HUNT: entrando na sala:",
    ROOM_ID
  );


  socket.emit(
    "join-room",
    ROOM_ID
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

  } else {

    status.textContent =
      "● CONECTANDO...";

  }

}


/* ========================================
   ATUALIZAR TRANSMISSÃO
======================================== */

function refreshViewer() {

  console.log(
    "HUNT: atualizando transmissão..."
  );


  if (!viewerActive) {
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

    joinRoom();

  } else {

    console.warn(
      "HUNT: Socket desconectado."
    );

  }

}


/* ========================================
   FECHAR VIEWER
======================================== */

function closeViewer() {

  console.log(
    "HUNT: fechando Peer..."
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

    } catch (error) {

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

    } catch (error) {

      console.warn(
        "HUNT: erro pausando vídeo:",
        error
      );

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


    if (viewerActive) {

      joinRoom();

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
      "HUNT: erro Socket.IO:",
      error
    );


    console.error(
      "HUNT: detalhes:",
      {
        message:
          error?.message,

        description:
          error?.description,

        context:
          error?.context,

        type:
          error?.type
      }
    );


    updateHomeStatus();

    updateViewerStatus();

  }
);


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
      !viewerActive
    ) {

      console.log(
        "HUNT: transmissão ignorada; não estamos no viewer."
      );

      return;

    }


    if (
      !data ||
      !data.broadcasterId
    ) {

      console.warn(
        "HUNT: broadcasterId ausente."
      );

      return;

    }


    broadcasterId =
      data.broadcasterId;


    console.log(
      "HUNT: broadcaster:",
      broadcasterId
    );


    createViewerPeer();

  }
);


/* ========================================
   CRIAR PEER
======================================== */

function createViewerPeer() {

  console.log(
    "HUNT: criando RTCPeerConnection..."
  );


  if (!viewerActive) {

    console.warn(
      "HUNT: viewer não está ativo."
    );

    return;

  }


  if (peer) {

    try {

      peer.close();

    } catch (error) {

      console.warn(
        "HUNT: erro fechando Peer anterior:",
        error
      );

    }

  }


  peer =
    null;


  pendingCandidates =
    [];


  /*
   * Pegar diretamente a API nativa.
   */

  const RTC =
    getNativeRTCPeerConnection();


  if (!RTC) {

    console.error(
      "HUNT: RTCPeerConnection não disponível."
    );


    showViewerMessage(
      "WEBRTC NÃO ESTÁ DISPONÍVEL NESTE AMBIENTE"
    );


    return;

  }


  try {

    peer =
      new RTC(
        rtcConfig
      );


    console.log(
      "HUNT: Peer criado com sucesso:",
      peer
    );

  } catch (error) {

    console.error(
      "HUNT: erro criando RTCPeerConnection:",
      error
    );


    peer =
      null;


    showViewerMessage(
      "ERRO AO CRIAR CONEXÃO WEBRTC"
    );


    return;

  }


  /* ======================================
     TRACK
  ====================================== */

  peer.ontrack =
    event => {

      console.log(
        "HUNT: VÍDEO RECEBIDO:",
        event
      );


      const video =
        document.getElementById(
          "remoteVideo"
        );


      if (!video) {

        console.warn(
          "HUNT: remoteVideo não encontrado."
        );

        return;

      }


      if (
        event.streams &&
        event.streams.length
      ) {

        video.srcObject =
          event.streams[0];

      } else {

        let stream =
          video.srcObject;


        if (!stream) {

          stream =
            new MediaStream();


          video.srcObject =
            stream;

        }


        stream.addTrack(
          event.track
        );

      }


      video.play()
        .then(
          () => {

            console.log(
              "HUNT: vídeo reproduzindo."
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
        !event.candidate
      ) {

        return;

      }


      if (
        !broadcasterId
      ) {

        console.warn(
          "HUNT: ICE sem broadcasterId."
        );

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


      console.log(
        "HUNT: ICE enviado."
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


      const state =
        peer.connectionState;


      console.log(
        "HUNT: estado WebRTC:",
        state
      );


      const status =
        document.getElementById(
          "viewerStatus"
        );


      if (
        state ===
        "connecting"
      ) {

        if (status) {

          status.textContent =
            "● CONECTANDO À TRANSMISSÃO";

        }

      }


      if (
        state ===
        "connected"
      ) {

        if (status) {

          status.textContent =
            "🔴 TRANSMISSÃO AO VIVO";

        }

      }


      if (
        state ===
        "failed"
      ) {

        showViewerMessage(
          "FALHA NA CONEXÃO COM A TRANSMISSÃO"
        );

      }


      if (
        state ===
        "disconnected"
      ) {

        showViewerMessage(
          "TRANSMISSÃO DESCONECTADA"
        );

      }


      if (
        state ===
        "closed"
      ) {

        console.log(
          "HUNT: Peer fechado."
        );

      }

    };


  /* ======================================
     ICE CONNECTION
  ====================================== */

  peer.oniceconnectionstatechange =
    () => {

      if (!peer) {
        return;
      }


      console.log(
        "HUNT: ICE state:",
        peer.iceConnectionState
      );

    };

}


/* ========================================
   OFFER RECEBIDA
======================================== */

socket.on(
  "webrtc-offer",
  async data => {

    console.log(
      "HUNT: OFFER recebida:",
      data
    );


    if (!viewerActive) {

      console.log(
        "HUNT: OFFER ignorada; não estamos no viewer."
      );

      return;

    }


    if (
      !data ||
      !data.sender ||
      !data.offer
    ) {

      console.warn(
        "HUNT: OFFER inválida."
      );

      return;

    }


    broadcasterId =
      data.sender;


    /*
     * Criar Peer se necessário.
     */

    if (!peer) {

      createViewerPeer();

    }


    if (!peer) {

      console.error(
        "HUNT: não foi possível criar Peer."
      );

      return;

    }


    try {

      /*
       * Aplicar OFFER.
       */

      await peer.setRemoteDescription(
        data.offer
      );


      console.log(
        "HUNT: OFFER aplicada."
      );


      /*
       * Aplicar ICE pendente.
       */

      if (
        pendingCandidates.length
      ) {

        console.log(
          "HUNT: aplicando ICE pendente:",
          pendingCandidates.length
        );


        for (
          const candidate
          of pendingCandidates
        ) {

          try {

            await peer.addIceCandidate(
              candidate
            );

          } catch (error) {

            console.warn(
              "HUNT: erro ICE pendente:",
              error
            );

          }

        }


        pendingCandidates =
          [];

      }


      /*
       * Criar ANSWER.
       */

      const answer =
        await peer.createAnswer();


      await peer.setLocalDescription(
        answer
      );


      /*
       * Enviar ANSWER.
       */

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
        "HUNT: ANSWER enviada."
      );

    } catch (error) {

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

    console.log(
      "HUNT: ICE recebido."
    );


    if (!viewerActive) {

      return;

    }


    if (
      !data ||
      !data.sender ||
      !data.candidate
    ) {

      return;

    }


    /*
     * Se não temos Peer,
     * guardar.
     */

    if (!peer) {

      pendingCandidates.push(
        data.candidate
      );


      console.log(
        "HUNT: ICE guardado; Peer inexistente."
      );


      return;

    }


    /*
     * Se ainda não existe
     * descrição remota,
     * guardar.
     */

    if (
      !peer.remoteDescription
    ) {

      pendingCandidates.push(
        data.candidate
      );


      console.log(
        "HUNT: ICE guardado; aguardando OFFER."
      );


      return;

    }


    try {

      await peer.addIceCandidate(
        data.candidate
      );


      console.log(
        "HUNT: ICE aplicado."
      );

    } catch (error) {

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


    if (!viewerActive) {
      return;
    }


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
  "HUNT: aplicação iniciada."
);