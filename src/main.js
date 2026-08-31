import { io } from "socket.io-client";
import "./style.css";

const SERVER_URL = "https://hunt-screen-server.onrender.com";
const ROOM_ID = "hunt-screen-main";

const socket = io(SERVER_URL);

let peer = null;
let broadcasterId = null;
let pendingCandidates = [];

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

const status = document.querySelector("#status");
const waiting = document.querySelector("#waiting");
const remoteVideo = document.querySelector("#remoteVideo");
const playButton = document.querySelector("#playButton");

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

socket.on("connect_error", (error) => {

console.error(
"HUNT: erro de conexão:",
error
);

status.textContent =
"● ERRO DE CONEXÃO";

});

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

const currentPeer =
new RTCPeerConnection(
rtcConfig
);

peer = currentPeer;

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


try {


await currentPeer.setRemoteDescription(
  data.offer
);

console.log(
  "HUNT: OFFER aplicada"
);

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

window.addEventListener(
"beforeunload",
() => {


if (peer) {
  peer.close();
}


}
);

console.log(
"HUNT: sistema do viewer carregado"
);
