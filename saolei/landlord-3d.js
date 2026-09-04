import {
  Color3,
  DynamicTexture,
  Engine,
  FreeCamera,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "https://cdn.jsdelivr.net/npm/@babylonjs/core@7.42.0/+esm";

const ROOM_LIMIT = 8.5;
const HEAD_HEIGHT = 1.7;
const WORLD_CARD_WIDTH = 0.48;
const WORLD_CARD_HEIGHT = 0.72;
const MAX_WORLD_CARDS = 20;

export class Landlord3DExperience {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.options = options;
    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.roomRoot = null;
    this.playerMeshes = new Map();
    this.selfId = "";
    this.roomId = "";
    this.disposed = false;
    this.hasReceivedSelfPose = false;
    this.poseSyncStamp = 0;
    this.tablePlayRoot = null;
    this.tablePlayCards = [];
    this.localPose = {
      x: 0,
      y: 0,
      z: 5.4,
      yaw: Math.PI,
      pitch: 0,
      isMoving: false,
    };
    this.keys = new Set();
    this.pointer = {
      draggingView: false,
      lastX: 0,
      lastY: 0,
    };
    this.latestSnapshot = null;
  }

  async init() {
    this.engine = new Engine(this.canvas, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor.set(0.948, 0.934, 0.914, 1);

    this.camera = new FreeCamera("landlord-camera", new Vector3(0, HEAD_HEIGHT, 5.4), this.scene);
    this.camera.minZ = 0.05;
    this.camera.speed = 0;
    this.camera.inputs.clear();
    this.scene.activeCamera = this.camera;

    const light = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
    light.intensity = 1.04;
    light.groundColor = new Color3(0.64, 0.58, 0.52);

    this.buildRoom();
    this.bindInput();

    this.engine.runRenderLoop(() => {
      if (this.disposed) {
        return;
      }
      this.syncCanvasSize();
      this.step();
      this.scene.render();
    });

    window.addEventListener("resize", this.handleResize);
  }

  buildRoom() {
    this.roomRoot = new TransformNode("room-root", this.scene);

    const floor = MeshBuilder.CreateGround("floor", { width: 20, height: 20 }, this.scene);
    floor.parent = this.roomRoot;
    const floorMaterial = new StandardMaterial("floor-mat", this.scene);
    floorMaterial.diffuseColor = new Color3(0.84, 0.8, 0.75);
    floor.material = floorMaterial;

    const carpet = MeshBuilder.CreateGround("carpet", { width: 7.2, height: 7.2 }, this.scene);
    carpet.parent = this.roomRoot;
    carpet.position.y = 0.01;
    const carpetMaterial = new StandardMaterial("carpet-mat", this.scene);
    carpetMaterial.diffuseColor = new Color3(0.44, 0.56, 0.52);
    carpet.material = carpetMaterial;

    const table = MeshBuilder.CreateCylinder(
      "table",
      { diameter: 4.2, height: 0.3, tessellation: 40 },
      this.scene
    );
    table.position = new Vector3(0, 0.95, 0);
    table.parent = this.roomRoot;
    const tableMaterial = new StandardMaterial("table-mat", this.scene);
    tableMaterial.diffuseColor = new Color3(0.47, 0.62, 0.58);
    table.material = tableMaterial;

    const felt = MeshBuilder.CreateCylinder(
      "table-felt",
      { diameter: 3.72, height: 0.04, tessellation: 40 },
      this.scene
    );
    felt.position = new Vector3(0, 1.12, 0);
    felt.parent = this.roomRoot;
    const feltMaterial = new StandardMaterial("felt-mat", this.scene);
    feltMaterial.diffuseColor = new Color3(0.24, 0.42, 0.39);
    felt.material = feltMaterial;

    const edge = MeshBuilder.CreateTorus("table-edge", { diameter: 4.28, thickness: 0.09 }, this.scene);
    edge.position = new Vector3(0, 1.08, 0);
    edge.rotation.x = Math.PI / 2;
    edge.parent = this.roomRoot;
    const edgeMaterial = new StandardMaterial("table-edge-mat", this.scene);
    edgeMaterial.diffuseColor = new Color3(0.42, 0.54, 0.5);
    edge.material = edgeMaterial;

    this.tablePlayRoot = new TransformNode("table-play-root", this.scene);
    this.tablePlayRoot.parent = this.roomRoot;
    this.tablePlayRoot.position = new Vector3(0, 1.26, 0);

    const seatMarkers = [
      { name: "seat-self", position: new Vector3(0, 0.03, 4.5) },
      { name: "seat-left", position: new Vector3(-4.5, 0.03, 0.2) },
      { name: "seat-right", position: new Vector3(4.5, 0.03, 0.2) },
    ];

    seatMarkers.forEach((seat) => {
      const marker = MeshBuilder.CreateDisc(seat.name, { radius: 1.1, tessellation: 36 }, this.scene);
      marker.parent = this.roomRoot;
      marker.rotation.x = Math.PI / 2;
      marker.position = seat.position;
      const markerMaterial = new StandardMaterial(`${seat.name}-mat`, this.scene);
      markerMaterial.diffuseColor = new Color3(0.9, 0.86, 0.81);
      markerMaterial.alpha = 0.45;
      marker.material = markerMaterial;
    });

    const wallData = [
      { name: "north-wall", width: 20, height: 4.5, position: new Vector3(0, 2.25, -10), rotationY: 0 },
      { name: "south-wall", width: 20, height: 4.5, position: new Vector3(0, 2.25, 10), rotationY: Math.PI },
      { name: "west-wall", width: 20, height: 4.5, position: new Vector3(-10, 2.25, 0), rotationY: Math.PI / 2 },
      { name: "east-wall", width: 20, height: 4.5, position: new Vector3(10, 2.25, 0), rotationY: -Math.PI / 2 },
    ];

    wallData.forEach((item) => {
      const wall = MeshBuilder.CreatePlane(item.name, { width: item.width, height: item.height }, this.scene);
      wall.position = item.position;
      wall.rotation.y = item.rotationY;
      wall.parent = this.roomRoot;
      const wallMaterial = new StandardMaterial(`${item.name}-mat`, this.scene);
      wallMaterial.diffuseColor = new Color3(0.94, 0.9, 0.86);
      wall.material = wallMaterial;
    });
  }

  bindInput() {
    this.handleResize = () => {
      this.engine?.resize();
    };

    this.onKeyDown = (event) => {
      const code = event.code.toLowerCase();
      if (["keyw", "keya", "keys", "keyd"].includes(code)) {
        this.keys.add(code);
      }
    };

    this.onKeyUp = (event) => {
      this.keys.delete(event.code.toLowerCase());
    };

    this.onBlur = () => {
      this.keys.clear();
      this.endViewDrag();
    };

    this.onContextMenu = (event) => {
      event.preventDefault();
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  syncCanvasSize() {
    if (!this.engine || !this.canvas) {
      return;
    }

    const width = Math.round(this.canvas.clientWidth || 0);
    const height = Math.round(this.canvas.clientHeight || 0);
    if (width <= 0 || height <= 0) {
      return;
    }

    if (this.engine.getRenderWidth() !== width || this.engine.getRenderHeight() !== height) {
      this.engine.resize();
    }
  }

  startViewDrag(clientX, clientY) {
    this.pointer.draggingView = true;
    this.pointer.lastX = clientX;
    this.pointer.lastY = clientY;
  }

  moveViewDrag(clientX, clientY) {
    if (!this.pointer.draggingView) {
      return;
    }
    const deltaX = clientX - this.pointer.lastX;
    const deltaY = clientY - this.pointer.lastY;
    this.pointer.lastX = clientX;
    this.pointer.lastY = clientY;

    this.localPose.yaw -= deltaX * 0.004;
    this.localPose.pitch = clamp(this.localPose.pitch - deltaY * 0.003, -1.1, 1.1);
  }

  endViewDrag() {
    this.pointer.draggingView = false;
  }

  update(snapshot) {
    this.latestSnapshot = snapshot;
    const nextRoomId = snapshot.room?.id || "";
    if (this.roomId !== nextRoomId) {
      this.hasReceivedSelfPose = false;
    }
    this.selfId = snapshot.selfId;
    this.roomId = nextRoomId;

    const selfPlayer = snapshot.players.find((player) => player.player_id === snapshot.selfId);
    if (selfPlayer && !this.hasReceivedSelfPose) {
      this.hasReceivedSelfPose = true;
      this.localPose.x = Number(selfPlayer.pos_x ?? 0);
      this.localPose.y = Number(selfPlayer.pos_y ?? 0);
      this.localPose.z = Number(selfPlayer.pos_z ?? 5.4);
      this.localPose.yaw = Number(selfPlayer.yaw ?? Math.PI);
      this.localPose.pitch = Number(selfPlayer.pitch ?? 0);
    }

    this.syncPlayers(snapshot.players);
    this.syncTableCards(snapshot.room);
  }

  syncTableCards(room) {
    this.tablePlayCards.forEach((mesh) => mesh.dispose(false, true));
    this.tablePlayCards = [];

    const cards = room?.last_play_cards || [];
    if (!cards.length || !this.tablePlayRoot) {
      return;
    }

    const totalWidth = Math.max(0, (cards.length - 1) * 0.28);
    cards.forEach((card, index) => {
      const plane = MeshBuilder.CreatePlane(
        `table-play-card-${index}`,
        { width: 0.72, height: 1.04 },
        this.scene
      );
      plane.parent = this.tablePlayRoot;
      plane.rotation.x = Math.PI / 2;
      plane.rotation.z = (index - (cards.length - 1) / 2) * 0.03;
      plane.position = new Vector3(index * 0.28 - totalWidth / 2, index * 0.002, 0);
      const texture = new DynamicTexture(
        `table-play-texture-${index}`,
        { width: 256, height: 384 },
        this.scene,
        true
      );
      drawCardTexture(texture, card, true);
      const material = new StandardMaterial(`table-play-material-${index}`, this.scene);
      material.diffuseTexture = texture;
      material.emissiveColor = new Color3(1, 1, 1);
      material.backFaceCulling = false;
      plane.material = material;
      this.tablePlayCards.push(plane);
    });
  }

  syncPlayers(players) {
    const liveIds = new Set(players.map((player) => player.player_id));

    for (const [playerId, meshGroup] of this.playerMeshes.entries()) {
      if (!liveIds.has(playerId)) {
        meshGroup.root.dispose(false, true);
        this.playerMeshes.delete(playerId);
      }
    }

    players.forEach((player) => {
      let meshGroup = this.playerMeshes.get(player.player_id);
      if (!meshGroup) {
        meshGroup = this.createPlayerMeshes(player);
        this.playerMeshes.set(player.player_id, meshGroup);
      }

      const isSelf = player.player_id === this.selfId;
      meshGroup.root.position = new Vector3(
        Number(player.pos_x ?? 0),
        Number(player.pos_y ?? 0),
        Number(player.pos_z ?? 0)
      );
      meshGroup.root.rotation.y = Number(player.yaw ?? 0);
      meshGroup.body.isVisible = !isSelf;
      meshGroup.head.isVisible = !isSelf;
      meshGroup.labelPlane.isVisible = !isSelf;
      meshGroup.cardRoot.setEnabled(!isSelf);
      this.updateLabel(meshGroup, player);
      this.updatePlayerCards(meshGroup, player, isSelf);
    });
  }

  createPlayerMeshes(player) {
    const root = new TransformNode(`player-${player.player_id}`, this.scene);

    const body = MeshBuilder.CreateCylinder(
      `body-${player.player_id}`,
      { height: 1.3, diameter: 0.56, tessellation: 8 },
      this.scene
    );
    body.parent = root;
    body.position.y = 0.68;
    const bodyMaterial = new StandardMaterial(`body-mat-${player.player_id}`, this.scene);
    bodyMaterial.diffuseColor = colorFromHex(player.player_color || "#8fb6ae");
    body.material = bodyMaterial;

    const head = MeshBuilder.CreateSphere(`head-${player.player_id}`, { diameter: 0.42 }, this.scene);
    head.parent = root;
    head.position.y = 1.55;
    const headMaterial = new StandardMaterial(`head-mat-${player.player_id}`, this.scene);
    headMaterial.diffuseColor = new Color3(0.97, 0.9, 0.82);
    head.material = headMaterial;

    const labelPlane = MeshBuilder.CreatePlane(`label-${player.player_id}`, { width: 1.9, height: 0.52 }, this.scene);
    labelPlane.parent = root;
    labelPlane.position = new Vector3(0, 2.1, 0);
    const labelTexture = new DynamicTexture(
      `label-texture-${player.player_id}`,
      { width: 512, height: 128 },
      this.scene,
      true
    );
    const labelMaterial = new StandardMaterial(`label-mat-${player.player_id}`, this.scene);
    labelMaterial.diffuseTexture = labelTexture;
    labelMaterial.emissiveColor = new Color3(1, 1, 1);
    labelMaterial.backFaceCulling = false;
    labelPlane.material = labelMaterial;

    const cardRoot = new TransformNode(`cards-${player.player_id}`, this.scene);
    cardRoot.parent = root;
    cardRoot.position = new Vector3(0, 1.1, 0.94);

    return {
      root,
      body,
      head,
      labelPlane,
      labelTexture,
      cardRoot,
      cards: [],
    };
  }

  updateLabel(meshGroup, player) {
    const ctx = meshGroup.labelTexture.getContext();
    const width = meshGroup.labelTexture.getSize().width;
    const height = meshGroup.labelTexture.getSize().height;
    const statusText = getPlayerStatusText(player, this.latestSnapshot?.room);
    const scoreText = `积分 ${formatScore(player.total_score_snapshot)}`;
    ctx.clearRect(0, 0, width, height);
    roundRectPath(ctx, 18, 14, width - 36, height - 28, 22);
    ctx.fillStyle = "rgba(255, 250, 247, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(152, 132, 112, 0.22)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#5d5a57";
    ctx.font = "bold 30px Segoe UI";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(player.player_name || "玩家", 48, 54);

    ctx.fillStyle = "#8a7b6f";
    ctx.font = "24px Segoe UI";
    ctx.textAlign = "right";
    ctx.fillText(scoreText, width - 44, 54);

    drawLabelStatusPill(ctx, {
      x: width / 2 - 110,
      y: 72,
      width: 220,
      height: 28,
    }, statusText, getStatusTone(player, this.latestSnapshot?.room));
    meshGroup.labelTexture.update();
    meshGroup.labelPlane.billboardMode = 7;
  }

  updatePlayerCards(meshGroup, player, isSelf) {
    meshGroup.cards.forEach((mesh) => mesh.dispose(false, true));
    meshGroup.cards = [];

    if (isSelf) {
      return;
    }

    const cards = (player.hand_cards || []).slice(0, MAX_WORLD_CARDS);
    const antiPeekEnabled = Boolean(player.anti_peek_enabled);
    if (cards.length === 0) {
      return;
    }

    const totalWidth = Math.max(0, (cards.length - 1) * 0.14);
    cards.forEach((card, index) => {
      const cardNode = new TransformNode(`card-node-${player.player_id}-${index}`, this.scene);
      cardNode.parent = meshGroup.cardRoot;
      cardNode.position = new Vector3(index * 0.14 - totalWidth / 2, 0, 0);
      cardNode.rotation.z = (index - (cards.length - 1) / 2) * 0.03;

      const facePlane = MeshBuilder.CreatePlane(
        `card-face-${player.player_id}-${index}`,
        { width: WORLD_CARD_WIDTH, height: WORLD_CARD_HEIGHT },
        this.scene
      );
      facePlane.parent = cardNode;
      facePlane.position.z = 0.002;

      const faceTexture = new DynamicTexture(
        `card-face-texture-${player.player_id}-${index}`,
        { width: 256, height: 384 },
        this.scene,
        true
      );
      if (antiPeekEnabled) {
        drawCardBackTexture(faceTexture);
      } else {
        drawCardTexture(faceTexture, card, false);
      }
      const faceMaterial = new StandardMaterial(`card-face-mat-${player.player_id}-${index}`, this.scene);
      faceMaterial.diffuseTexture = faceTexture;
      faceMaterial.emissiveColor = new Color3(1, 1, 1);
      faceMaterial.backFaceCulling = true;
      facePlane.material = faceMaterial;

      const backPlane = MeshBuilder.CreatePlane(
        `card-back-${player.player_id}-${index}`,
        { width: WORLD_CARD_WIDTH, height: WORLD_CARD_HEIGHT },
        this.scene
      );
      backPlane.parent = cardNode;
      backPlane.position.z = -0.002;
      backPlane.rotation.y = Math.PI;

      const backTexture = new DynamicTexture(
        `card-back-texture-${player.player_id}-${index}`,
        { width: 256, height: 384 },
        this.scene,
        true
      );
      drawCardBackTexture(backTexture);
      const backMaterial = new StandardMaterial(`card-back-mat-${player.player_id}-${index}`, this.scene);
      backMaterial.diffuseTexture = backTexture;
      backMaterial.emissiveColor = new Color3(1, 1, 1);
      backMaterial.backFaceCulling = true;
      backPlane.material = backMaterial;

      meshGroup.cards.push(cardNode);
    });
  }

  step() {
    const dt = this.engine.getDeltaTime() / 1000;
    const forward = new Vector3(Math.sin(this.localPose.yaw), 0, Math.cos(this.localPose.yaw));
    const right = new Vector3(Math.cos(this.localPose.yaw), 0, -Math.sin(this.localPose.yaw));
    const move = new Vector3(0, 0, 0);

    if (this.keys.has("keyw")) {
      move.addInPlace(forward);
    }
    if (this.keys.has("keys")) {
      move.subtractInPlace(forward);
    }
    if (this.keys.has("keya")) {
      move.subtractInPlace(right);
    }
    if (this.keys.has("keyd")) {
      move.addInPlace(right);
    }

    this.localPose.isMoving = move.lengthSquared() > 0;
    if (this.localPose.isMoving) {
      move.normalize().scaleInPlace(dt * 3.2);
      this.localPose.x = clamp(this.localPose.x + move.x, -ROOM_LIMIT, ROOM_LIMIT);
      this.localPose.z = clamp(this.localPose.z + move.z, -ROOM_LIMIT, ROOM_LIMIT);
    }

    const eye = new Vector3(this.localPose.x, this.localPose.y + HEAD_HEIGHT, this.localPose.z);
    const direction = new Vector3(
      Math.sin(this.localPose.yaw) * Math.cos(this.localPose.pitch),
      Math.sin(this.localPose.pitch),
      Math.cos(this.localPose.yaw) * Math.cos(this.localPose.pitch)
    );
    const target = eye.add(direction);

    this.camera.position.copyFrom(eye);
    this.camera.setTarget(target);

    const selfGroup = this.playerMeshes.get(this.selfId);
    if (selfGroup) {
      selfGroup.root.position = new Vector3(this.localPose.x, this.localPose.y, this.localPose.z);
      selfGroup.root.rotation.y = this.localPose.yaw;
    }

    const now = performance.now();
    if (now - this.poseSyncStamp > 120) {
      this.poseSyncStamp = now;
      this.options.onPoseChange?.({
        x: this.localPose.x,
        y: this.localPose.y,
        z: this.localPose.z,
        yaw: this.localPose.yaw,
        pitch: this.localPose.pitch,
        isMoving: this.localPose.isMoving,
      });
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.scene?.dispose();
    this.engine?.dispose();
  }
}

function drawCardTexture(texture, card, highlighted) {
  const ctx = texture.getContext();
  const width = texture.getSize().width;
  const height = texture.getSize().height;
  ctx.clearRect(0, 0, width, height);

  const { rankText, suitText, centerText, accent, isJoker, banner } = getCardVisual(card);

  roundRectPath(ctx, 10, 10, width - 20, height - 20, 22);
  ctx.fillStyle = highlighted ? "#fffdf8" : "#fffaf7";
  ctx.fill();
  ctx.strokeStyle = highlighted ? "#b78f60" : "#ccb8a5";
  ctx.lineWidth = highlighted ? 8 : 6;
  ctx.stroke();

  if (banner) {
    roundRectPath(ctx, 28, 28, width - 56, 48, 18);
    ctx.fillStyle = banner;
    ctx.fill();
  }

  ctx.fillStyle = accent;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "bold 56px Segoe UI";
  ctx.fillText(rankText, 34, 30);

  ctx.font = "40px Segoe UI Symbol";
  if (suitText) {
    ctx.fillText(suitText, 38, 98);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = isJoker ? "bold 44px Segoe UI" : "86px Segoe UI Symbol";
  ctx.fillText(centerText, width / 2, height / 2 + 24);

  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.font = "bold 40px Segoe UI";
  ctx.fillText(rankText, width - 34, height - 38);
  texture.update();
}

function drawCardBackTexture(texture) {
  const ctx = texture.getContext();
  const width = texture.getSize().width;
  const height = texture.getSize().height;
  ctx.clearRect(0, 0, width, height);

  roundRectPath(ctx, 10, 10, width - 20, height - 20, 22);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#7da9a1");
  gradient.addColorStop(0.5, "#5e8a82");
  gradient.addColorStop(1, "#496c66");
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = "#e9dfd3";
  ctx.lineWidth = 6;
  ctx.stroke();

  roundRectPath(ctx, 28, 28, width - 56, height - 56, 16);
  ctx.strokeStyle = "rgba(250, 243, 237, 0.9)";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "rgba(250, 243, 237, 0.18)";
  ctx.fillRect(-62, -62, 124, 124);
  ctx.restore();

  ctx.fillStyle = "rgba(250, 243, 237, 0.82)";
  ctx.font = "bold 26px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("斗地主", width / 2, height / 2 + 2);
  texture.update();
}

function getPlayerStatusText(player, room) {
  if (!room) {
    return player.is_ready ? "已准备" : "未准备";
  }

  const roleText = room.landlord_player_id === player.player_id ? "地主" : "农民";

  if (room.phase === "dealing") {
    return `发牌中 · ${roleText}`;
  }

  if (room.phase === "waiting" || room.phase === "finished") {
    return `${player.is_ready ? "已准备" : "未准备"} · ${roleText}`;
  }

  if (room.phase === "play" && room.turn_player_id === player.player_id) {
    return `当前出牌 · ${roleText}`;
  }

  if ((room.phase === "call" || room.phase === "rob") && room.current_bidding_player_id === player.player_id) {
    return `当前操作 · ${roleText}`;
  }

  return roleText;
}

function getStatusTone(player, room) {
  if (!room) {
    return player.is_ready ? "ready" : "idle";
  }

  if (room.phase === "play" && room.turn_player_id === player.player_id) {
    return "turn";
  }

  if ((room.phase === "call" || room.phase === "rob") && room.current_bidding_player_id === player.player_id) {
    return "turn";
  }

  if (room.phase === "dealing") {
    return "turn";
  }

  if (room.phase === "waiting" || room.phase === "finished") {
    return player.is_ready ? "ready" : "idle";
  }

  return room.landlord_player_id === player.player_id ? "landlord" : "idle";
}

function drawLabelStatusPill(ctx, rect, text, tone) {
  const palette = {
    ready: {
      fill: "rgba(124, 169, 152, 0.2)",
      text: "#5e8172",
    },
    idle: {
      fill: "rgba(219, 211, 201, 0.72)",
      text: "#85766a",
    },
    turn: {
      fill: "rgba(214, 176, 115, 0.26)",
      text: "#9a7036",
    },
    landlord: {
      fill: "rgba(214, 176, 115, 0.22)",
      text: "#9a7036",
    },
  }[tone] || {
    fill: "rgba(219, 211, 201, 0.72)",
    text: "#85766a",
  };

  roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 999);
  ctx.fillStyle = palette.fill;
  ctx.fill();
  ctx.fillStyle = palette.text;
  ctx.font = "24px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1);
}

function formatScore(value) {
  const numeric = Number(value || 0);
  return numeric > 0 ? `+${numeric}` : String(numeric);
}

function getCardVisual(card) {
  if (card === "BJ") {
    return {
      rankText: "J",
      suitText: "",
      centerText: "小王",
      accent: "#51464c",
      isJoker: true,
      banner: "rgba(235, 206, 212, 0.78)",
    };
  }
  if (card === "RJ") {
    return {
      rankText: "J",
      suitText: "",
      centerText: "大王",
      accent: "#9a485a",
      isJoker: true,
      banner: "rgba(241, 196, 207, 0.88)",
    };
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const suitMap = {
    S: "♠",
    H: "♥",
    C: "♣",
    D: "♦",
  };
  const accent = suit === "H" || suit === "D" ? "#cc5b66" : "#3f4a57";

  return {
    rankText: rank,
    suitText: suitMap[suit] || "",
    centerText: suitMap[suit] || rank,
    accent,
    isJoker: false,
    banner: null,
  };
}

function colorFromHex(hex) {
  const safe = hex.replace("#", "");
  const normalized = safe.length === 3 ? safe.split("").map((char) => char + char).join("") : safe;
  const value = Number.parseInt(normalized, 16);
  return new Color3(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
