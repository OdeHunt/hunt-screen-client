import { io } from "socket.io-client";
import { patchUrlMappings } from "@discord/embedded-app-sdk";
import "./style.css";


/*
========================================
CONFIGURAÇÃO
========================================
*/

const SERVER_URL =
  "https://hunt-screen-server.onrender.com";

const ROOM_ID =
  "hunt-screen-main";


const isDiscordActivity =
  window.location.hostname.endsWith(".discordsays.com");


/*
========================================
DISCORD URL MAPPING
========================================
*/

if (isDiscordActivity) {

  patchUrlMappings([
    {
      prefix: "/hunt-socket",
      target: "hunt-screen-server.onrender.com"
    }
  ]);

}


/*
========================================
SOCKET.IO
========================================
*/

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

    reconnectionAttempts: Infinity,

    reconnectionDelay: 1000,

    reconnectionDelayMax: 5000
  }
);


/*
========================================
VARIÁVEIS
========================================
*/

let peer = null;

let broadcasterId = null;

let pendingCandidates = [];

let currentMode = null;


/*
========================================
APP
========================================
*/

const app =
  document.querySelector("#app");


/*
========================================
TELA ÚNICA
========================================
*/

app.innerHTML = `

  <main class="hunt-screen">

    <header class="header">

      <div class="brand">
        HUNT
      </div>

      <div class="brand-subtitle">
        SCREEN
      </div>

    </header>


    <section
      id="mainScreen"
      class="viewer"
    >

      <!--
      ==================================
      CONTEÚDO SERÁ INSERIDO AQUI
      ==================================
      -->

    </section>


    <section class="controls">

      <div
        id="status"
        class="status"
      >
        ESCOLHA UM MODO
      </div>

    </section>

  </main>

`;


/*
========================================
ELEMENTOS
========================================
*/

const mainScreen =
  document.querySelector("#mainScreen");

const status =
  document.querySelector("#status");


/*
========================================
ESTILO DOS BOTÕES
========================================
*/

const buttonStyle = `
  display: block;
  width: min(360px, 90%);
  margin: 14px auto;
  padding: 16px 22px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 17px;
  font-weight: 700;
`;


/*
========================================
RTC CONFIG
========================================
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
========================================
TELA INICIAL
========================================
*/

function showHome() {

  currentMode = null;

  closePeer();

  broadcasterId = null;

  pendingCandidates = [];


  mainScreen.innerHTML = `

    <div class="waiting">

      <div class="live-dot"></div>

      <h1>
        HUNT SCREEN
      </h1>

      <p>
        Escolha como deseja entrar.
      </p>


      <div>

        <button
          id="spectatorButton"
          type="button"
          style="${buttonStyle}"
        >
          👁️ ESPECTADOR
        </button>


        <button
          id="broadcasterButton"
          type="button"
          style="${buttonStyle}"
        >
          📺 TRANSMITIR
        </button>

      </div>

    </div>

  `;


  status.textContent =
    "ESCOLHA UM MODO";


  /*
  ======================================
  BOTÃO ESPECTADOR
  ======================================
  */

  document
    .querySelector("#spectatorButton")
    .addEventListener(
      "click",
      enterSpectator
    );


  /*
  ======================================
  BOTÃO TRANSMITIR
  ======================================
  */

  document
    .querySelector("#broadcasterButton")
    .addEventListener(
      "click",
      openBroadcaster
    );

}


/*
========================================
ABRIR TRANSMISSOR
========================================
*/

function openBroadcaster() {

  console.log(
    "HUNT: abrindo transmissor"
  );


  /*
   * Não usamos iframe.
   *
   * A página inteira passa a ser
   * o broadcaster.
   */

  window.location.href =
    "/broadcaster.html";

}


/*
========================================
ENTRAR COMO ESPECTADOR
========================================
*/

function enterSpectator() {

  currentMode =
    "spectator";


  showSpectatorWaiting();


  /*
   * Se já estiver conectado,
   * entra imediatamente na sala.
   */

  if (
    socket &&
    socket.connected
  ) {

    socket.emit(
      "join-room",
      ROOM_ID
    );

  }

}


/*
========================================
TELA DO ESPECTADOR
========================================
*/

function showSpectatorWaiting(
  message = "NENHUMA TRANSMISSÃO"
) {

  mainScreen.innerHTML = `

    <div
      id="spectatorWaiting"
      class="waiting"
    >

      <div class="live-dot"></div>

      <h1>
        ${message}
      </h1>

      <p>
        Quando alguém iniciar uma transmissão,
        ela aparecerá aqui.
      </p>


      <button
        id="refreshButton"
        type="button"
        style="${buttonStyle}"
      >
        🔄 ATUALIZAR TRANSMISSÃO
      </button>


      <button
        id="homeButton"
        type="button"
        style="${buttonStyle}"
      >
        ← VOLTAR
      </button>

    </div>

  `;


  status.textContent =
    "● PROCURANDO TRANSMISSÃO";


  /*
  ======================================
  ATUALIZAR
  ======================================
  */

  document
    .querySelector("#refreshButton")
    .addEventListener(
      "click",
      refreshStream
    );


  /*
  ======================================
  VOLTAR
  ======================================
  */

  document
    .querySelector("#homeButton")
    .addEventListener(
      "click",
      showHome
    );

}


/*
========================================
ATUALIZAR TRANSMISSÃO
========================================
*/

function refreshStream() {

  console.log(
    "HUNT: atualizando transmissão..."
  );


  closePeer();


  broadcasterId =
    null;


  pendingCandidates =
    [];


  showSpectatorWaiting(
    "PROCURANDO TRANSMISSÃO..."
  );


  if (
    socket &&
    socket.connected
  ) {

    /*
     * Entrar novamente na sala.
     */

    socket.emit(
      "join-room",
      ROOM_ID
    );

  }

}


/*
========================================
FECHAR PEER
========================================
*/

function closePeer() {

  if (peer) {

    try {

      peer.close();

    }
    catch (
      error
    ) {

      console.warn(
        "HUNT: erro fechando PeerConnection:",
        error
      );

    }

    peer =
      null;

  }

}


/*
========================================
MOSTRAR VÍDEO
========================================
*/

function showVideo() {

  mainScreen.innerHTML = `

    <div
      class="waiting"
      style="
        width:100%;
        max-width:1100px;
        margin:auto;
      "
    >

      <h1>
        🔴 AO VIVO
      </h1>


      <video
        id="remoteVideo"
        autoplay
        muted
        playsinline
        controls
        style="
          display:block;
          width:100%;
          max-height:75vh;
          object-fit:contain;
          border-radius:12px;
          background:#000;
        "
      ></video>


      <button
        id="backButton"
        type="button"
        style="${buttonStyle}"
      >
        ← VOLTAR
      </button>

    </div>

  `;


  const remoteVideo =
    document.querySelector(
      "#remoteVideo"
    );


  /*
  ======================================
  VOLTAR
  ======================================
  */

  document
    .querySelector("#backButton")
    .addEventListener(
      "click",
      () => {

        closePeer();

        broadcasterId =
          null;

        pendingCandidates =
          [];

        remoteVideo.srcObject =
          null;

        showHome();

      }
    );


  return remoteVideo;

}


/*
========================================
SOCKET CONNECT
========================================
*/

socket.on(
  "connect",
  () => {

    console.log(
      "HUNT SERVER conectado:",
      socket.id
    );


    status.textContent =
      "● ONLINE";


    /*
     * Se o usuário já está no modo
     * espectador, entrar na sala.
     */

    if (
      currentMode ===
      "spectator"
    ) {

      socket.emit(
        "join-room",
        ROOM_ID
      );

    }

  }
);


/*
========================================
SOCKET ERROR
========================================
*/

socket.on(
  "connect_error",
  (error) => {

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


    if (
      currentMode ===
      "spectator"
    ) {

      status.textContent =
        "● ERRO DE CONEXÃO";

    }

  }
);


/*
========================================
TRANSMISSÃO DISPONÍVEL
========================================
*/

socket.on(
  "stream-started",
  (data) => {

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


    if (
      currentMode ===
      "spectator"
    ) {

      status.textContent =
        "● TRANSMISSÃO DISPONÍVEL";

    }

  }
);


/*
========================================
WEBRTC OFFER
========================================
*/

socket.on(
  "webrtc-offer",
  async (data) => {

    console.log(
      "HUNT: OFFER recebida:",
      data
    );


    if (
      currentMode !==
      "spectator"
    ) {

      return;

    }


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
    ====================================
    FECHAR PEER ANTIGO
    ====================================
    */

    closePeer();


    pendingCandidates =
      [];


    /*
    ====================================
    RTCPeerConnection
    ====================================
    */

    const RTCPeerConnectionClass =
      window.RTCPeerConnection;


    if (
      typeof RTCPeerConnectionClass !==
      "function"
    ) {

      console.error(
        "HUNT: RTCPeerConnection não está disponível neste ambiente."
      );


      status.textContent =
        "● WEBRTC INDISPONÍVEL";


      return;

    }


    /*
    ====================================
    CRIAR PEER
    ====================================
    */

    const currentPeer =
      new RTCPeerConnectionClass(
        rtcConfig
      );


    peer =
      currentPeer;


    /*
    ====================================
    ICE
    ====================================
    */

    currentPeer.onicecandidate =
      (event) => {

        if (
          !event.candidate
        ) {

          return;

        }


        socket.emit(
          "webrtc-ice-candidate",
          {

            target:
              data.sender,

            candidate:
              event.candidate

          }
        );


        console.log(
          "HUNT: ICE enviado"
        );

      };


    /*
    ====================================
    ESTADO DA CONEXÃO
    ====================================
    */

    currentPeer
      .onconnectionstatechange =
      () => {

        console.log(
          "HUNT: estado WebRTC:",
          currentPeer.connectionState
        );


        if (
          currentPeer.connectionState ===
          "connected"
        ) {

          status.textContent =
            "🔴 AO VIVO";

        }


        if (
          currentPeer.connectionState ===
          "failed"
        ) {

          status.textContent =
            "● CONEXÃO PERDIDA";

        }


        if (
          currentPeer.connectionState ===
          "disconnected"
        ) {

          status.textContent =
            "● CONEXÃO INTERROMPIDA";

        }

      };


    /*
    ====================================
    VÍDEO RECEBIDO
    ====================================
    */

    currentPeer.ontrack =
      (event) => {

        console.log(
          "HUNT: VÍDEO RECEBIDO"
        );


        if (
          !event.streams ||
          !event.streams[0]
        ) {

          return;

        }


        const remoteVideo =
          showVideo();


        remoteVideo.srcObject =
          event.streams[0];


        remoteVideo.muted =
          true;


        status.textContent =
          "🔴 AO VIVO";


        /*
        ==================================
        TENTAR REPRODUZIR
        ==================================
        */

        remoteVideo
          .play()
          .then(
            () => {

              console.log(
                "HUNT: vídeo reproduzindo"
              );

            }
          )
          .catch(
            (error) => {

              console.warn(
                "HUNT: autoplay bloqueado:",
                error
              );

            }
          );

      };


    /*
    ====================================
    APLICAR OFFER
    ====================================
    */

    try {

      await currentPeer
        .setRemoteDescription(
          data.offer
        );


      console.log(
        "HUNT: OFFER aplicada"
      );


      /*
      ==================================
      ICE PENDENTE
      ==================================
      */

      for (
        const candidate
        of pendingCandidates
      ) {

        try {

          await currentPeer
            .addIceCandidate(
              candidate
            );

        }
        catch (
          error
        ) {

          console.error(
            "HUNT: erro ICE pendente:",
            error
          );

        }

      }


      pendingCandidates =
        [];


      /*
      ==================================
      CRIAR ANSWER
      ==================================
      */

      const answer =
        await currentPeer
          .createAnswer();


      await currentPeer
        .setLocalDescription(
          answer
        );


      /*
      ==================================
      ENVIAR ANSWER
      ==================================
      */

      socket.emit(
        "webrtc-answer",
        {

          target:
            data.sender,

          answer:
            answer

        }
      );


      console.log(
        "HUNT: ANSWER enviada"
      );

    }
    catch (
      error
    ) {

      console.error(
        "HUNT: erro WebRTC:",
        error
      );


      status.textContent =
        "● ERRO WEBRTC";

    }

  }
);


/*
========================================
ICE RECEBIDO
========================================
*/

socket.on(
  "webrtc-ice-candidate",
  async (data) => {

    console.log(
      "HUNT: ICE recebido"
    );


    if (
      !data ||
      !data.candidate
    ) {

      return;

    }


    /*
     * Se ainda não temos Peer ou
     * não aplicamos a OFFER,
     * guardamos o candidato.
     */

    if (
      !peer ||
      !peer.remoteDescription
    ) {

      pendingCandidates.push(
        data.candidate
      );


      console.log(
        "HUNT: ICE guardado"
      );


      return;

    }


    try {

      await peer
        .addIceCandidate(
          data.candidate
        );


      console.log(
        "HUNT: ICE aplicado"
      );

    }
    catch (
      error
    ) {

      console.error(
        "HUNT: erro ICE:",
        error
      );

    }

  }
);


/*
========================================
TRANSMISSÃO ENCERRADA
========================================
*/

socket.on(
  "stream-stopped",
  () => {

    console.log(
      "HUNT: transmissão encerrada"
    );


    if (
      currentMode !==
      "spectator"
    ) {

      return;

    }


    closePeer();


    broadcasterId =
      null;


    pendingCandidates =
      [];


    showSpectatorWaiting(
      "TRANSMISSÃO ENCERRADA"
    );

  }
);


/*
========================================
RECONEXÃO
========================================
*/

socket.on(
  "reconnect",
  () => {

    console.log(
      "HUNT: Socket reconectado"
    );


    if (
      currentMode ===
      "spectator"
    ) {

      socket.emit(
        "join-room",
        ROOM_ID
      );

    }

  }
);


/*
========================================
INICIALIZAÇÃO
========================================
*/

showHome();


console.log(
  "HUNT: sistema carregado"
);