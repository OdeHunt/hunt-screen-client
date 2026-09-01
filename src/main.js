import { io } from "socket.io-client";
import { patchUrlMappings } from "@discord/embedded-app-sdk";
import "./style.css";

/* ========================================
   CONFIGURAÇÃO
======================================== */

const SERVER_URL = "https://hunt-screen-server.onrender.com";
const ROOM_ID = "hunt-screen-main";

const isDiscordActivity =
  window.location.hostname.endsWith(".discordsays.com");


/* ========================================
   DISCORD URL MAPPING
======================================== */

if (isDiscordActivity) {
  patchUrlMappings([
    {
      prefix: "/hunt-socket",
      target: "hunt-screen-server.onrender.com"
    }
  ]);
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
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  }
);


/* ========================================
   VARIÁVEIS WEBRTC
======================================== */

let peer = null;
let broadcasterId = null;
let pendingCandidates = [];


/* ========================================
   ELEMENTOS
======================================== */

const app = document.getElementById("app");

if (!app) {
  console.error("HUNT: elemento #app não encontrado.");
}


/* ========================================
   TELA INICIAL
======================================== */

function showHome() {

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

      <div class="hunt-status" id="homeStatus">
        CONECTANDO...
      </div>

    </div>
  `;


  document
    .getElementById("viewerButton")
    .addEventListener(
      "click",
      startViewer
    );


  document
    .getElementById("broadcastButton")
    .addEventListener(
      "click",
      openBroadcaster
    );


  updateHomeStatus();

}


/* ========================================
   STATUS DA TELA INICIAL
======================================== */

function updateHomeStatus() {

  const status =
    document.getElementById("homeStatus");

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
   ABRIR TRANSMISSOR
======================================== */

function openBroadcaster() {

  console.log(
    "HUNT: abrindo transmissor"
  );


  /*
   * O broadcaster fica na mesma
   * hospedagem do client.
   */

  window.location.href =
    "/broadcaster.html";

}


/* ========================================
   TELA DE ESPECTADOR
======================================== */

function startViewer() {

  console.log(
    "HUNT: entrando como espectador"
  );


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


  document
    .getElementById("refreshButton")
    .addEventListener(
      "click",
      refreshViewer
    );


  document
    .getElementById("backButton")
    .addEventListener(
      "click",
      () => {

        closeViewer();

        showHome();

      }
    );


  updateViewerStatus();


  /*
   * Entrar novamente na sala.
   */

  if (socket.connected) {

    socket.emit(
      "join-room",
      ROOM_ID
    );

  }

}


/* ========================================
   STATUS DO ESPECTADOR
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
    "HUNT: atualizando espectador"
  );


  closeViewer();


  const message =
    document.getElementById(
      "viewerMessage"
    );


  if (message) {

    message.textContent =
      "PROCURANDO TRANSMISSÃO...";

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
    "HUNT: fechando espectador"
  );


  if (peer) {

    try {
      peer.close();
    } catch (error) {
      console.warn(
        "HUNT: erro fechando Peer:",
        error
      );
    }

    peer = null;

  }


  broadcasterId = null;

  pendingCandidates = [];


  const video =
    document.getElementById(
      "remoteVideo"
    );


  if (video) {

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


    /*
     * Se o usuário estiver na tela
     * de espectador, entra na sala.
     */

    if (
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


    console.error(
      "HUNT: detalhes do erro:",
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

      return;

    }


    broadcasterId =
      data.broadcasterId;


    /*
     * Só cria conexão se estivermos
     * realmente na tela de espectador.
     */

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
   CRIAR PEER DO ESPECTADOR
======================================== */

function createViewerPeer() {

  console.log(
    "HUNT: criando PeerConnection"
  );


  /*
   * Fechar conexão anterior.
   */

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


  pendingCandidates = [];


  /*
   * Configuração WebRTC.
   */

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


  /*
   * Criar PeerConnection.
   */

  try {

    peer =
      new RTCPeerConnection(
        rtcConfig
      );

  }

  catch (error) {

    console.error(
      "HUNT: erro criando RTCPeerConnection:",
      error
    );

    showViewerMessage(
      "Seu ambiente não suporta WebRTC."
    );

    return;

  }


  /*
   * VÍDEO RECEBIDO
   */

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
        event.streams[0]
      ) {

        video.srcObject =
          event.streams[0];

      }


      video
        .play()
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


  /*
   * ICE
   */

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


  /*
   * ESTADO DA CONEXÃO
   */

  peer.onconnectionstatechange =
    () => {

      console.log(
        "HUNT: estado WebRTC:",
        peer.connectionState
      );


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
        "failed" ||

        peer.connectionState ===
        "disconnected"
      ) {

        showViewerMessage(
          "A transmissão foi desconectada."
        );

      }

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


    if (
      !data ||
      !data.sender ||
      !data.offer
    ) {

      console.warn(
        "HUNT: OFFER inválida"
      );

      return;

    }


    broadcasterId =
      data.sender;


    /*
     * Se não existir Peer,
     * criar um.
     */

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


      /*
       * Aplicar candidatos que chegaram
       * antes da OFFER.
       */

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
            "HUNT: erro aplicando ICE pendente:",
            error
          );

        }

      }


      pendingCandidates = [];


      /*
       * Criar ANSWER.
       */

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
      "HUNT: ICE recebido"
    );


    if (
      !data ||
      !data.sender ||
      !data.candidate
    ) {

      return;

    }


    /*
     * Se ainda não temos Peer,
     * guardar o ICE.
     */

    if (!peer) {

      pendingCandidates.push(
        data.candidate
      );


      console.log(
        "HUNT: ICE guardado"
      );


      return;

    }


    /*
     * Se ainda não existe descrição
     * remota, guardar também.
     */

    if (
      !peer.remoteDescription
    ) {

      pendingCandidates.push(
        data.candidate
      );


      console.log(
        "HUNT: ICE aguardando OFFER"
      );


      return;

    }


    try {

      await peer.addIceCandidate(
        data.candidate
      );


      console.log(
        "HUNT: ICE aplicado"
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
   MENSAGEM DO VIEWER
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


  /*
   * Esconder a mensagem quando
   * estiver vazia.
   */

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