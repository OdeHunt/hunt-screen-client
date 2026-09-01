import { io } from "socket.io-client";
import { patchUrlMappings } from "@discord/embedded-app-sdk";
import "./style.css";

const SERVER_URL = "https://hunt-screen-server.onrender.com";
const ROOM_ID = "hunt-screen-main";

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
    transports: ["polling", "websocket"]
  }
);

let peer = null;
let broadcasterId = null;
let pendingCandidates = [];

/*
========================================
INTERFACE
========================================
*/

document.querySelector("#app").innerHTML = `

  <main class="hunt-screen">

    <header class="header">
      <div class="brand">HUNT</div>
      <div class="brand-subtitle">SCREEN</div>
    </header>

    <section class="viewer">

      <div id="waiting" class="waiting">
        <div class="live-dot"></div>

        <h1>NENHUMA TRANSMISSÃO</h1>

        <p>
          Quando alguém iniciar uma transmissão,
          ela aparecerá aqui.
        </p>
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

    </section>

    <section class="controls">

      <div id="status" class="status">
        CONECTANDO...
      </div>

    </section>

  </main>

`;

/*
========================================
ELEMENTOS
========================================
*/

const status = document.querySelector("#status");
const waiting = document.querySelector("#waiting");
const remoteVideo = document.querySelector("#remoteVideo");
const playButton = document.querySelector("#playButton");

/*
========================================
WEBRTC
========================================
*/

const rtcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    }
  ]
};

/*
========================================
SOCKET CONNECT
========================================
*/

socket.on("connect", () => {

  console.log(
    "HUNT SERVER conectado:",
    socket.id
  );

  status.textContent = "● ONLINE";

  socket.emit(
    "join-room",
    ROOM_ID
  );

});

/*
========================================
SOCKET ERROR
========================================
*/

socket.on("connect_error", error => {
  console.error("HUNT: erro de conexão:", error);

  console.error("HUNT: detalhes do erro:", {
    message: error.message,
    description: error.description,
    context: error.context,
    type: error.type
  });
});


  status.textContent =
    "● ERRO DE CONEXÃO";

;

/*
========================================
TRANSMISSÃO INICIADA
========================================
*/

socket.on("stream-started", (data) => {

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

});

/*
========================================
WEBRTC OFFER
========================================
*/

socket.on("webrtc-offer", async (data) => {

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

  if (peer) {

    peer.close();
    peer = null;

  }

  pendingCandidates = [];

  const RTCPeerConnectionClass =
  window.RTCPeerConnection;

if (
  typeof RTCPeerConnectionClass !== "function"
) {
  console.error(
    "HUNT: RTCPeerConnection não está disponível neste ambiente."
  );
  return;
}

const currentPeer =
  new RTCPeerConnectionClass(
    rtcConfig
  );

  peer = currentPeer;

  /*
  ======================================
  VÍDEO RECEBIDO
  ======================================
  */

  currentPeer.ontrack = (event) => {

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

      status.textContent =
        "🔴 AO VIVO";

      remoteVideo.muted = true;

      remoteVideo
        .play()
        .then(() => {

          console.log(
            "HUNT: vídeo reproduzindo"
          );

        })
        .catch((error) => {

          console.warn(
            "HUNT: autoplay bloqueado:",
            error
          );

        });

    }

  };

  /*
  ======================================
  ESTADO WEBRTC
  ======================================
  */

  currentPeer.onconnectionstatechange =
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

    await currentPeer.setRemoteDescription(
      data.offer
    );

    console.log(
      "HUNT: OFFER aplicada"
    );

    /*
    ====================================
    ICE PENDENTE
    ====================================
    */

    for (
      const candidate
      of pendingCandidates
    ) {

      try {

        await currentPeer.addIceCandidate(
          candidate
        );

      }

      catch (error) {

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
      await currentPeer.createAnswer();

    await currentPeer.setLocalDescription(
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

  catch (error) {

    console.error(
      "HUNT: erro WebRTC:",
      error
    );

  }

});

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

      await peer.addIceCandidate(
        data.candidate
      );

      console.log(
        "HUNT: ICE aplicado"
      );

    }

    catch (error) {

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

      remoteVideo.muted = false;

      await remoteVideo.play();

      playButton.classList.add(
        "hidden"
      );

      status.textContent =
        "🔴 AO VIVO";

    }

    catch (error) {

      console.error(
        "HUNT: erro ao reproduzir:",
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

    if (peer) {

      peer.close();
      peer = null;

    }

    pendingCandidates = [];

    remoteVideo.srcObject = null;

    remoteVideo.classList.add(
      "hidden"
    );

    playButton.classList.add(
      "hidden"
    );

    waiting.classList.remove(
      "hidden"
    );

    broadcasterId = null;

    status.textContent =
      "● ONLINE";

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