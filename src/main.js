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
    ]
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
INTERFACE
========================================
*/

document.querySelector("#app").innerHTML = `

  <main class="hunt-screen">

    <header class="header">

      <div class="brand">
        HUNT
      </div>

      <div class="brand-subtitle">
        SCREEN
      </div>

    </header>


    <!-- ================================
         TELA DE ESCOLHA
    ================================= -->

    <section
      id="modeSelector"
      class="viewer"
    >

      <div class="waiting">

        <div class="live-dot"></div>

        <h1>HUNT SCREEN</h1>

        <p>
          Escolha como deseja entrar.
        </p>


        <div class="mode-buttons">

          <button
            id="spectatorButton"
            class="play-button"
            type="button"
          >
            👁 ESPECTADOR
          </button>


          <button
            id="broadcasterButton"
            class="play-button"
            type="button"
          >
            📺 TRANSMITIR
          </button>

        </div>

      </div>

    </section>


    <!-- ================================
         ÁREA DO ESPECTADOR
    ================================= -->

    <section
      id="spectatorArea"
      class="viewer hidden"
    >

      <div
        id="waiting"
        class="waiting"
      >

        <div class="live-dot"></div>

        <h1>
          NENHUMA TRANSMISSÃO
        </h1>

        <p>
          Quando alguém iniciar uma transmissão,
          ela aparecerá aqui.
        </p>


        <button
          id="refreshStreamButton"
          class="play-button"
          type="button"
        >
          🔄 ATUALIZAR TRANSMISSÃO
        </button>


        <button
          id="backButton"
          class="play-button"
          type="button"
        >
          ← VOLTAR
        </button>

      </div>


      <video
        id="remoteVideo"
        autoplay
        muted
        playsinline
        controls
        class="remote-video hidden"
      ></video>


      <button
        id="playButton"
        class="play-button hidden"
        type="button"
      >
        ▶ ASSISTIR TRANSMISSÃO
      </button>


      <button
        id="backFromVideoButton"
        class="play-button hidden"
        type="button"
      >
        ← VOLTAR
      </button>

    </section>


    <!-- ================================
         STATUS
    ================================= -->

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

const modeSelector =
  document.querySelector("#modeSelector");


const spectatorArea =
  document.querySelector("#spectatorArea");


const status =
  document.querySelector("#status");


const waiting =
  document.querySelector("#waiting");


const remoteVideo =
  document.querySelector("#remoteVideo");


const playButton =
  document.querySelector("#playButton");


const spectatorButton =
  document.querySelector("#spectatorButton");


const broadcasterButton =
  document.querySelector("#broadcasterButton");


const refreshStreamButton =
  document.querySelector("#refreshStreamButton");


const backButton =
  document.querySelector("#backButton");


const backFromVideoButton =
  document.querySelector("#backFromVideoButton");


/*
========================================
WEBRTC CONFIG
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

function showModeSelector() {

  currentMode = null;

  modeSelector.classList.remove(
    "hidden"
  );

  spectatorArea.classList.add(
    "hidden"
  );

  remoteVideo.classList.add(
    "hidden"
  );

  playButton.classList.add(
    "hidden"
  );

  backFromVideoButton.classList.add(
    "hidden"
  );

  waiting.classList.remove(
    "hidden"
  );

  status.textContent =
    "ESCOLHA UM MODO";

}


/*
========================================
ENTRAR COMO ESPECTADOR
========================================
*/

function enterSpectatorMode() {

  currentMode =
    "spectator";


  modeSelector.classList.add(
    "hidden"
  );


  spectatorArea.classList.remove(
    "hidden"
  );


  status.textContent =
    "● PROCURANDO TRANSMISSÃO";


  waiting.classList.remove(
    "hidden"
  );


  remoteVideo.classList.add(
    "hidden"
  );


  playButton.classList.add(
    "hidden"
  );


  backFromVideoButton.classList.add(
    "hidden"
  );


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
BOTÃO ESPECTADOR
========================================
*/

spectatorButton.addEventListener(
  "click",
  () => {

    enterSpectatorMode();

  }
);


/*
========================================
BOTÃO TRANSMITIR
========================================
*/

broadcasterButton.addEventListener(
  "click",
  () => {

    console.log(
      "HUNT: entrando no modo transmissor"
    );


    /*
     * O broadcaster já existe
     * separadamente.
     *
     * Aqui simplesmente abrimos
     * a página de transmissão.
     */

    window.location.href =
      "/broadcaster.html";

  }
);


/*
========================================
VOLTAR
========================================
*/

backButton.addEventListener(
  "click",
  () => {

    if (peer) {

      peer.close();

      peer = null;

    }


    pendingCandidates = [];

    broadcasterId = null;

    remoteVideo.srcObject =
      null;


    showModeSelector();

  }
);


backFromVideoButton.addEventListener(
  "click",
  () => {

    if (peer) {

      peer.close();

      peer = null;

    }


    pendingCandidates = [];

    broadcasterId = null;

    remoteVideo.srcObject =
      null;


    showModeSelector();

  }
);


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
     * Se o usuário já escolheu
     * espectador, entra na sala.
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
          error.message,

        description:
          error.description,

        context:
          error.context,

        type:
          error.type
      }
    );


    status.textContent =
      "● ERRO DE CONEXÃO";

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


    status.textContent =
      "● TRANSMISSÃO DISPONÍVEL";


    /*
     * Se estamos no modo espectador,
     * o servidor já avisou que existe
     * transmissão.
     *
     * O broadcaster receberá
     * user-joined e enviará a OFFER.
     */

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
      !data ||
      !data.sender ||
      !data.offer
    ) {

      console.warn(
        "HUNT: OFFER inválida"
      );

      return;

    }


    if (
      currentMode !==
      "spectator"
    ) {

      return;

    }


    /*
     * Fechar conexão anterior.
     */

    if (peer) {

      peer.close();

      peer = null;

    }


    pendingCandidates = [];


    /*
     * Obter RTCPeerConnection
     * diretamente do window.
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
     * Criar conexão.
     */

    const currentPeer =
      new RTCPeerConnectionClass(
        rtcConfig
      );


    peer =
      currentPeer;


    /*
     ======================================
     VÍDEO RECEBIDO
     ======================================
    */

    currentPeer.ontrack =
      (event) => {

        console.log(
          "HUNT: VÍDEO RECEBIDO"
        );


        if (
          event.streams &&
          event.streams[0]
        ) {

          remoteVideo.srcObject =
            event.streams[0];


          waiting.classList.add(
            "hidden"
          );


          remoteVideo.classList.remove(
            "hidden"
          );


          playButton.classList.remove(
            "hidden"
          );


          backFromVideoButton.classList.remove(
            "hidden"
          );


          status.textContent =
            "🔴 AO VIVO";


          remoteVideo.muted =
            true;


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

        }

      };


    /*
     ======================================
     ESTADO WEBRTC
     ======================================
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
     ======================================
     ICE
     ======================================
    */

    currentPeer.onicecandidate =
      (event) => {

        if (
          event.candidate
        ) {

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

        }

      };


    /*
     ======================================
     APLICAR OFFER
     ======================================
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
       * Aplicar ICE que chegou
       * antes da OFFER.
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


      pendingCandidates = [];


      /*
       ====================================
       CRIAR ANSWER
       ====================================
      */

      const answer =
        await currentPeer
          .createAnswer();


      await currentPeer
        .setLocalDescription(
          answer
        );


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
     * Se a OFFER ainda não foi
     * aplicada, guardar o ICE.
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
BOTÃO ASSISTIR
========================================
*/

playButton.addEventListener(
  "click",
  async () => {

    try {

      remoteVideo.muted =
        false;


      await remoteVideo.play();


      playButton.classList.add(
        "hidden"
      );


      status.textContent =
        "🔴 AO VIVO";

    }
    catch (
      error
    ) {

      console.error(
        "HUNT: erro ao reproduzir:",
        error
      );

    }

  }
);


/*
========================================
ATUALIZAR TRANSMISSÃO
========================================
*/

refreshStreamButton.addEventListener(
  "click",
  () => {

    console.log(
      "HUNT: procurando transmissão novamente..."
    );


    /*
     * Fechar WebRTC anterior.
     */

    if (peer) {

      peer.close();

      peer = null;

    }


    /*
     * Limpar dados anteriores.
     */

    pendingCandidates = [];

    broadcasterId = null;


    /*
     * Limpar vídeo.
     */

    remoteVideo.srcObject =
      null;


    remoteVideo.classList.add(
      "hidden"
    );


    playButton.classList.add(
      "hidden"
    );


    backFromVideoButton.classList.add(
      "hidden"
    );


    waiting.classList.remove(
      "hidden"
    );


    status.textContent =
      "● PROCURANDO TRANSMISSÃO";


    /*
     * Pedir novamente ao servidor
     * para entrar na sala.
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


    /*
     * Fechar WebRTC.
     */

    if (peer) {

      peer.close();

      peer = null;

    }


    pendingCandidates = [];

    broadcasterId = null;


    /*
     * Limpar vídeo.
     */

    remoteVideo.srcObject =
      null;


    remoteVideo.classList.add(
      "hidden"
    );


    playButton.classList.add(
      "hidden"
    );


    backFromVideoButton.classList.add(
      "hidden"
    );


    waiting.classList.remove(
      "hidden"
    );


    status.textContent =
      "● TRANSMISSÃO ENCERRADA";

  }
);


/*
========================================
SAÍDA
========================================
*/

window.addEventListener(
  "beforeunload",
  () => {

    if (peer) {

      peer.close();

    }

  }
);


/*
========================================
SISTEMA CARREGADO
========================================
*/

console.log(
  "HUNT: sistema do viewer carregado"
);