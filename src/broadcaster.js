import { io } from "socket.io-client";
import { patchUrlMappings } from "@discord/embedded-app-sdk";
import "./broadcaster.css";


/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const SERVER_URL =
  "https://hunt-screen-server.onrender.com";

const ROOM_ID =
  "hunt-screen-main";


/*
 * ID da aplicação Discord.
 *
 * É o ID que aparece no seu domínio:
 *
 * 1542940402733162496.discordsays.com
 */
const DISCORD_CLIENT_ID =
  "1542940402733162496";


/* =========================================================
   DETECTAR DISCORD
========================================================= */

const isDiscordActivity =
  window.location.hostname.endsWith(
    ".discordsays.com"
  );


console.log(
  "HUNT: Discord Activity:",
  isDiscordActivity
);


/* =========================================================
   ELEMENTOS
========================================================= */

const preview =
  document.getElementById("preview");

const emptyPreview =
  document.getElementById("emptyPreview");

const chooseButton =
  document.getElementById("chooseButton");

const startButton =
  document.getElementById("startButton");

const stopButton =
  document.getElementById("stopButton");

const backButton =
  document.getElementById("backButton");

const status =
  document.getElementById("status");

const errorBox =
  document.getElementById("error");

const quality =
  document.getElementById("quality");

const fps =
  document.getElementById("fps");


/* =========================================================
   VARIÁVEIS
========================================================= */

let socket = null;

let screenStream = null;

let transmitting = false;


/*
 * Cada espectador possui
 * seu próprio PeerConnection.
 */
const peers =
  new Map();


/* =========================================================
   WEBRTC
========================================================= */

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


/* =========================================================
   STATUS
========================================================= */

function setStatus(
  message,
  live = false
) {

  status.textContent =
    message;

  status.classList.toggle(
    "live",
    live
  );

}


/* =========================================================
   ERRO
========================================================= */

function showError(
  message
) {

  console.error(
    "HUNT:",
    message
  );

  errorBox.textContent =
    message;

  errorBox.classList.add(
    "visible"
  );

}


function hideError() {

  errorBox.textContent =
    "";

  errorBox.classList.remove(
    "visible"
  );

}


/* =========================================================
   DISCORD URL MAPPING
========================================================= */

/*
 * O Discord bloqueia conexões externas
 * diretamente dentro da Activity.
 *
 * O URL Mapping criado no Developer Portal é:
 *
 * /hunt-socket
 *
 * ->
 *
 * hunt-screen-server.onrender.com
 *
 *
 * O patchUrlMappings modifica WebSocket,
 * fetch e XMLHttpRequest para passar
 * pelo proxy da Activity.
 *
 * Isso precisa acontecer ANTES
 * de inicializar o Socket.IO.
 */

function setupDiscordNetworking() {

  if (!isDiscordActivity) {

    console.log(
      "HUNT: navegador normal."
    );

    return;

  }


  console.log(
    "HUNT: configurando URL Mapping do Discord..."
  );


  try {

    patchUrlMappings([

      {
        prefix:
          "/hunt-socket",

        target:
          "hunt-screen-server.onrender.com"
      }

    ]);


    console.log(
      "HUNT: URL Mapping configurado."
    );

  }

  catch (error) {

    console.error(
      "HUNT: erro no patchUrlMappings:",
      error
    );


    showError(
      "Erro ao configurar a conexão do Discord."
    );

  }

}


/* =========================================================
   SOCKET.IO
========================================================= */

function connectSocket() {

  console.log(
    "HUNT: iniciando Socket.IO..."
  );


  /*
   * Fora do Discord:
   *
   * https://hunt-screen-server.onrender.com
   *
   *
   * Dentro do Discord:
   *
   * https://ID.discordsays.com
   *
   * O patchUrlMappings vai redirecionar
   * /hunt-socket para o Render.
   */

  const socketURL =
    isDiscordActivity
      ? window.location.origin
      : SERVER_URL;


  console.log(
    "HUNT: Socket URL:",
    socketURL
  );


  socket = io(
    socketURL,
    {

      path:
        "/hunt-socket",

      /*
       * O Discord atualmente suporta
       * WebSocket para networking das Activities.
       *
       * Mantemos somente WebSocket para evitar
       * problemas de fallback do Socket.IO.
       */

      transports:
        ["websocket"],

      reconnection:
        true,

      reconnectionAttempts:
        Infinity,

      reconnectionDelay:
        1000,

      reconnectionDelayMax:
        5000

    }
  );


  socket.on(
    "connect",
    () => {

      console.log(
        "HUNT SERVER conectado:",
        socket.id
      );


      setStatus(
        "● ONLINE"
      );


      hideError();


      socket.emit(
        "join-room",
        ROOM_ID
      );


      console.log(
        "HUNT: entrou na sala:",
        ROOM_ID
      );

    }
  );


  socket.on(
    "disconnect",
    reason => {

      console.warn(
        "HUNT: Socket desconectado:",
        reason
      );


      if (!transmitting) {

        setStatus(
          "● DESCONECTADO"
        );

      }

    }
  );


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


      setStatus(
        "● ERRO DE CONEXÃO"
      );


      showError(
        "Não foi possível conectar ao servidor."
      );

    }
  );


  /*
   * O servidor avisa quando um espectador
   * entra na sala.
   */

  socket.on(
    "user-joined",
    async data => {

      console.log(
        "HUNT: novo espectador:",
        data
      );


      if (!transmitting) {

        return;

      }


      if (
        !data ||
        !data.socketId
      ) {

        return;

      }


      await createOffer(
        data.socketId
      );

    }
  );


  /*
   * Resposta do espectador.
   */

  socket.on(
    "webrtc-answer",
    async data => {

      console.log(
        "HUNT: ANSWER recebida:",
        data
      );


      if (
        !data ||
        !data.sender ||
        !data.answer
      ) {

        return;

      }


      const peer =
        peers.get(
          data.sender
        );


      if (!peer) {

        console.warn(
          "HUNT: Peer não encontrado:",
          data.sender
        );

        return;

      }


      try {

        await peer.setRemoteDescription(
          data.answer
        );


        console.log(
          "HUNT: ANSWER aplicada."
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


  /*
   * ICE recebido.
   */

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
        peers.get(
          data.sender
        );


      if (!peer) {

        console.warn(
          "HUNT: Peer não encontrado para ICE:",
          data.sender
        );

        return;

      }


      try {

        await peer.addIceCandidate(
          data.candidate
        );


        console.log(
          "HUNT: ICE aplicado:",
          data.sender
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

}


/* =========================================================
   ESCOLHER TELA
========================================================= */

async function chooseScreen() {

  hideError();


  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getDisplayMedia
  ) {

    showError(
      "Este ambiente não permite captura de tela."
    );

    return;

  }


  try {

    const selectedFPS =
      Number(
        fps.value
      );


    const selectedQuality =
      Number(
        quality.value
      );


    console.log(
      "HUNT: solicitando captura:",
      selectedQuality,
      selectedFPS
    );


    screenStream =
      await navigator.mediaDevices.getDisplayMedia({

        video: {

          width: {

            ideal:
              selectedQuality

          },

          height: {

            ideal:
              Math.round(
                selectedQuality *
                9 /
                16
              )

          },

          frameRate: {

            ideal:
              selectedFPS,

            max:
              selectedFPS

          }

        },

        audio: true

      });


    preview.srcObject =
      screenStream;


    preview.style.display =
      "block";


    emptyPreview.style.display =
      "none";


    chooseButton.classList.add(
      "hidden"
    );


    startButton.classList.remove(
      "hidden"
    );


    stopButton.classList.add(
      "hidden"
    );


    setStatus(
      "● TELA SELECIONADA"
    );


    console.log(
      "HUNT: tela selecionada."
    );


    const videoTrack =
      screenStream.getVideoTracks()[0];


    if (videoTrack) {

      videoTrack.addEventListener(
        "ended",
        () => {

          console.log(
            "HUNT: captura encerrada pelo usuário."
          );


          stopTransmission();

        }
      );

    }

  }

  catch (error) {

    console.error(
      "HUNT: erro ao capturar tela:",
      error
    );


    showError(
      "A captura da tela foi cancelada."
    );

  }

}


/* =========================================================
   COMEÇAR TRANSMISSÃO
========================================================= */

function startTransmission() {

  hideError();


  if (!screenStream) {

    showError(
      "Escolha uma tela primeiro."
    );

    return;

  }


  if (
    !socket ||
    !socket.connected
  ) {

    showError(
      "O servidor ainda não está conectado."
    );

    return;

  }


  if (transmitting) {

    return;

  }


  transmitting =
    true;


  setStatus(
    "🔴 TRANSMITINDO",
    true
  );


  chooseButton.classList.add(
    "hidden"
  );


  startButton.classList.add(
    "hidden"
  );


  stopButton.classList.remove(
    "hidden"
  );


  socket.emit(
    "start-stream",
    {

      roomId:
        ROOM_ID

    }
  );


  console.log(
    "HUNT: transmissão iniciada."
  );

}


/* =========================================================
   CRIAR PEER
========================================================= */

function createPeer(
  viewerId
) {

  console.log(
    "HUNT: criando PeerConnection:",
    viewerId
  );


  /*
   * Usamos explicitamente
   * window.RTCPeerConnection.
   *
   * Isso evita o problema anterior:
   *
   * RTCPeerConnection is not a constructor
   */

  const PeerConnection =
    window.RTCPeerConnection;


  if (
    typeof PeerConnection !==
    "function"
  ) {

    throw new Error(
      "RTCPeerConnection não está disponível neste ambiente."
    );

  }


  const peer =
    new PeerConnection(
      rtcConfig
    );


  /*
   * ADICIONAR A TELA
   */

  if (screenStream) {

    screenStream
      .getTracks()
      .forEach(
        track => {

          peer.addTrack(
            track,
            screenStream
          );

        }
      );

  }


  /*
   * ICE
   */

  peer.onicecandidate =
    event => {

      if (
        !event.candidate
      ) {

        return;

      }


      if (
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
        "HUNT: ICE enviado:",
        viewerId
      );

    };


  /*
   * Estado
   */

  peer.onconnectionstatechange =
    () => {

      console.log(
        "HUNT: estado WebRTC:",
        viewerId,
        peer.connectionState
      );


      if (
        peer.connectionState ===
          "failed" ||

        peer.connectionState ===
          "closed" ||

        peer.connectionState ===
          "disconnected"
      ) {

        peers.delete(
          viewerId
        );

      }

    };


  peers.set(
    viewerId,
    peer
  );


  return peer;

}


/* =========================================================
   CRIAR OFFER
========================================================= */

async function createOffer(
  viewerId
) {

  console.log(
    "HUNT: criando OFFER:",
    viewerId
  );


  try {

    const peer =
      createPeer(
        viewerId
      );


    const offer =
      await peer.createOffer();


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
      "HUNT: OFFER enviada:",
      viewerId
    );

  }

  catch (error) {

    console.error(
      "HUNT: erro criando OFFER:",
      error
    );

  }

}


/* =========================================================
   PARAR TRANSMISSÃO
========================================================= */

function stopTransmission() {

  console.log(
    "HUNT: parando transmissão..."
  );


  transmitting =
    false;


  /*
   * Avisar servidor ANTES
   * de destruir tudo.
   */

  if (
    socket &&
    socket.connected
  ) {

    socket.emit(
      "stop-stream",
      {

        roomId:
          ROOM_ID

      }
    );

  }


  /*
   * Fechar peers.
   */

  for (
    const peer
    of peers.values()
  ) {

    try {

      peer.close();

    }

    catch {

      // ignorar

    }

  }


  peers.clear();


  /*
   * Parar captura.
   */

  if (screenStream) {

    screenStream
      .getTracks()
      .forEach(
        track => {

          try {

            track.stop();

          }

          catch {

            // ignorar

          }

        }
      );

  }


  screenStream =
    null;


  preview.srcObject =
    null;


  preview.style.display =
    "none";


  emptyPreview.style.display =
    "flex";


  chooseButton.classList.remove(
    "hidden"
  );


  startButton.classList.add(
    "hidden"
  );


  stopButton.classList.add(
    "hidden"
  );


  setStatus(
    socket?.connected
      ? "● ONLINE"
      : "● DESCONECTADO"
  );


  console.log(
    "HUNT: transmissão encerrada."
  );

}


/* =========================================================
   VOLTAR
========================================================= */

function goBack() {

  console.log(
    "HUNT: voltando..."
  );


  /*
   * Dentro da Activity, voltar para
   * a página principal do cliente.
   */

  window.location.href =
    "/";

}


/* =========================================================
   BOTÕES
========================================================= */

chooseButton.addEventListener(
  "click",
  chooseScreen
);


startButton.addEventListener(
  "click",
  startTransmission
);


stopButton.addEventListener(
  "click",
  stopTransmission
);


backButton.addEventListener(
  "click",
  goBack
);


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function initialize() {

  console.log(
    "HUNT: broadcaster iniciando..."
  );


  setStatus(
    "CONECTANDO..."
  );


  /*
   * Primeiro configura o proxy
   * do Discord.
   *
   * Depois inicializa Socket.IO.
   */

  setupDiscordNetworking();


  connectSocket();


  console.log(
    "HUNT: broadcaster pronto."
  );

}


/* =========================================================
   INICIAR
========================================================= */

initialize();