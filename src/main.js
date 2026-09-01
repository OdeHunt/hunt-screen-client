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
   VARIÁVEIS WEBRTC
======================================== */

let peer = null;

let broadcasterId = null;

let pendingCandidates = [];


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
   CONFIGURAÇÃO WEBRTC
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
   TELA INICIAL
======================================== */

function showHome() {

  if (!app) {
    return;
  }


  /*
   * Garantir que qualquer Peer anterior
   * seja fechado.
   */

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
        class="hunt-status"
        id="homeStatus">

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
    "HUNT: abrindo broadcaster"
  );


  /*
   * O broadcaster está hospedado
   * junto com o client.
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


  if (!app) {
    return;
  }


  /*
   * Fechar conexão anterior.
   */

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

        closeViewer();

        showHome();

      }
    );

  }


  updateViewerStatus();


  /*
   * Entrar na sala.
   */

  if (socket.connected) {

    socket.emit(
      "join-room",
      ROOM_ID
    );

    console.log(
      "HUNT: viewer entrou na sala"
    );

  } else {

    console.log(
      "HUNT: aguardando Socket.IO..."
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
   ATUALIZAR VIEWER
======================================== */

function refreshViewer() {

  console.log(
    "HUNT: atualizando transmissão"
  );


  /*
   * Fechar Peer atual.
   */

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


    /*
     * Se estiver na tela de espectador,
     * entrar novamente na sala.
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


    /*
     * Só iniciar WebRTC se estiver
     * na tela de espectador.
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
   CRIAR PEER DO VIEWER
======================================== */

function createViewerPeer() {

  console.log(
    "HUNT: criando RTCPeerConnection..."
  );


  /*
   * Fechar Peer anterior.
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


  peer =
    null;


  pendingCandidates =
    [];


  /*
   * IMPORTANTE:
   *
   * Usamos explicitamente
   * window.RTCPeerConnection.
   *
   * O teste dentro do Discord
   * confirmou que isso funciona.
   */

  try {

    if (
      typeof window.RTCPeerConnection !==
      "function"
    ) {

      throw new Error(
        "window.RTCPeerConnection não está disponível."
      );

    }


    peer =
      new window.RTCPeerConnection(
        rtcConfig
      );


    console.log(
      "HUNT: RTCPeerConnection criado:",
      peer
    );

  }

  catch (error) {

    console.error(
      "HUNT: erro criando RTCPeerConnection:",
      error
    );


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

        console.warn(
          "HUNT: vídeo não encontrado"
        );

        return;

      }


      if (
        event.streams &&
        event.streams.length > 0
      ) {

        video.srcObject =
          event.streams[0];

      } else {

        /*
         * Fallback caso o navegador não
         * forneça event.streams.
         */

        if (!video.srcObject) {

          const stream =
            new MediaStream();

          stream.addTrack(
            event.track
          );

          video.srcObject =
            stream;

        }

      }


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
     ICE ENVIADO
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
          "HUNT: ICE sem broadcasterId"
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
        "HUNT: ICE enviado"
      );

    };


  /* ======================================
     ESTADO WEBRTC
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
     ICE CONNECTION STATE
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


    /*
     * A pessoa que enviou a OFFER
     * é o broadcaster.
     */

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
        "HUNT: não foi possível criar Peer"
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
        "HUNT: OFFER aplicada"
      );


      /*
       * Aplicar ICE que chegou
       * antes da OFFER.
       */

      if (
        pendingCandidates.length > 0
      ) {

        console.log(
          "HUNT: aplicando",
          pendingCandidates.length,
          "ICE pendentes"
        );


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


      /*
       * Criar ANSWER.
       */

      const answer =
        await peer.createAnswer();


      await peer.setLocalDescription(
        answer
      );


      /*
       * Enviar ANSWER para broadcaster.
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
     * Se ainda não existe Peer,
     * guardar.
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
     * Se ainda não temos OFFER,
     * guardar.
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