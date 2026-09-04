import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { Landlord3DExperience } from "./landlord-3d.js";
import { LandlordHudCanvas } from "./landlord-hud.js";
import {
  buildShuffledDeck,
  canBeat,
  evaluateCards,
  getCardDisplay,
  sortCards,
  removeCardsFromHand,
} from "./landlord-logic.js";

const STORAGE_KEYS = {
  playerId: "saolei-player-id",
  playerName: "saolei-player-name",
  selectedMode: "saolei-selected-mode",
  landlordScore: "saolei-landlord-score",
  landlordSettledRounds: "saolei-landlord-settled-rounds",
};

const ROOM_STATUS_TEXT = {
  waiting: "等待开始",
  active: "进行中",
  won: "扫雷成功",
  lost: "踩到雷了",
};

const PRESETS = {
  beginner: { width: 9, height: 9, mines: 10, label: "初级" },
  intermediate: { width: 16, height: 16, mines: 40, label: "中级" },
  expert: { width: 30, height: 16, mines: 99, label: "高级" },
  custom: { width: 12, height: 12, mines: 20, label: "自定义" },
};

const COLOR_POOL = [
  "#38bdf8",
  "#fb7185",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#f97316",
  "#2dd4bf",
  "#f472b6",
];

const ROOM_LIST_SELECT =
  "id,room_name,host_player_id,host_name,difficulty,width,height,mine_count,status,updated_at,revision,started_at,finished_at,last_action_by";
const LANDLORD_ROOM_LIST_SELECT =
  "id,room_name,host_player_id,host_name,status,phase,revision,turn_player_id,landlord_player_id,round_no,multiplier,last_action_by,updated_at";

const LANDLORD_STATUS_TEXT = {
  waiting: "等待凑齐并准备",
  call: "叫地主中",
  rob: "抢地主中",
  play: "出牌中",
  finished: "本局结算",
};

const USE_CANVAS_LANDLORD_HUD = true;

const LANDLORD_SEAT_SPAWNS = {
  1: { x: 0, y: 0, z: 5.4, yaw: Math.PI, pitch: 0 },
  2: { x: -5.6, y: 0, z: -0.2, yaw: Math.PI / 2, pitch: 0 },
  3: { x: 5.6, y: 0, z: -0.2, yaw: -Math.PI / 2, pitch: 0 },
};

const state = {
  playerId: "",
  playerName: "",
  playerColor: "",
  selectedMode: "",
  landlordScore: 0,
  preset: "beginner",
  actionMode: "reveal",
  roomId: null,
  room: null,
  players: [],
  rooms: [],
  lobbyChannel: null,
  roomChannel: null,
  lobbyTimer: null,
  heartbeatTimer: null,
  cleanupTimer: null,
  isSavingMove: false,
  pendingAction: null,
  landlord: {
    roomId: null,
    room: null,
    players: [],
    rooms: [],
    lobbyChannel: null,
    roomChannel: null,
    lobbyTimer: null,
    heartbeatTimer: null,
    selectedCards: [],
    settledRounds: {},
    sceneExperience: null,
    hudExperience: null,
    poseSyncInFlight: false,
    pendingPose: null,
    lastPoseSignature: "",
    handDrag: {
      active: false,
      startIndex: -1,
      currentIndex: -1,
      cards: [],
    },
  },
};

const refs = {
  currentPlayerName: document.getElementById("currentPlayerName"),
  landlordScoreText: document.getElementById("landlordScoreText"),
  currentModeText: document.getElementById("currentModeText"),
  roomNamePreview: document.getElementById("roomNamePreview"),
  landlordRoomNamePreview: document.getElementById("landlordRoomNamePreview"),
  connectionBadge: document.getElementById("connectionBadge"),
  renameButton: document.getElementById("renameButton"),
  modePanel: document.getElementById("modePanel"),
  chooseMinesweeperButton: document.getElementById("chooseMinesweeperButton"),
  chooseLandlordButton: document.getElementById("chooseLandlordButton"),
  backToModeButton: document.getElementById("backToModeButton"),
  minesweeperView: document.getElementById("minesweeperView"),
  landlordView: document.getElementById("landlordView"),
  widthInput: document.getElementById("widthInput"),
  heightInput: document.getElementById("heightInput"),
  mineInput: document.getElementById("mineInput"),
  widthValue: document.getElementById("widthValue"),
  heightValue: document.getElementById("heightValue"),
  mineValue: document.getElementById("mineValue"),
  boardSummary: document.getElementById("boardSummary"),
  mineSummary: document.getElementById("mineSummary"),
  safeSummary: document.getElementById("safeSummary"),
  createRoomButton: document.getElementById("createRoomButton"),
  refreshRoomsButton: document.getElementById("refreshRoomsButton"),
  roomList: document.getElementById("roomList"),
  activeRoomTitle: document.getElementById("activeRoomTitle"),
  roomStatusText: document.getElementById("roomStatusText"),
  lastActionText: document.getElementById("lastActionText"),
  roomConfigText: document.getElementById("roomConfigText"),
  roomMineText: document.getElementById("roomMineText"),
  boardStatsText: document.getElementById("boardStatsText"),
  boardFlagText: document.getElementById("boardFlagText"),
  playerCountText: document.getElementById("playerCountText"),
  playerList: document.getElementById("playerList"),
  board: document.getElementById("board"),
  resultBanner: document.getElementById("resultBanner"),
  leaveRoomButton: document.getElementById("leaveRoomButton"),
  revealModeButton: document.getElementById("revealModeButton"),
  flagModeButton: document.getElementById("flagModeButton"),
  questionModeButton: document.getElementById("questionModeButton"),
  nameModal: document.getElementById("nameModal"),
  nameInput: document.getElementById("nameInput"),
  saveNameButton: document.getElementById("saveNameButton"),
  roomItemTemplate: document.getElementById("roomItemTemplate"),
  createLandlordRoomButton: document.getElementById("createLandlordRoomButton"),
  refreshLandlordRoomsButton: document.getElementById("refreshLandlordRoomsButton"),
  landlordRoomList: document.getElementById("landlordRoomList"),
  landlordRoomItemTemplate: document.getElementById("landlordRoomItemTemplate"),
  landlordActiveRoomTitle: document.getElementById("landlordActiveRoomTitle"),
  landlordStatusText: document.getElementById("landlordStatusText"),
  landlordLastActionText: document.getElementById("landlordLastActionText"),
  landlordTurnText: document.getElementById("landlordTurnText"),
  landlordMultiplierText: document.getElementById("landlordMultiplierText"),
  landlordBottomText: document.getElementById("landlordBottomText"),
  landlordWinnerText: document.getElementById("landlordWinnerText"),
  landlordSceneCanvas: document.getElementById("landlordSceneCanvas"),
  landlordHudCanvas: document.getElementById("landlordHudCanvas"),
  landlordPlayerCountText: document.getElementById("landlordPlayerCountText"),
  landlordSeatList: document.getElementById("landlordSeatList"),
  landlordReadyButton: document.getElementById("landlordReadyButton"),
  landlordCallButton: document.getElementById("landlordCallButton"),
  landlordPassCallButton: document.getElementById("landlordPassCallButton"),
  landlordRobButton: document.getElementById("landlordRobButton"),
  landlordPassRobButton: document.getElementById("landlordPassRobButton"),
  landlordPlayButton: document.getElementById("landlordPlayButton"),
  landlordPassPlayButton: document.getElementById("landlordPassPlayButton"),
  landlordLastPlayText: document.getElementById("landlordLastPlayText"),
  landlordBottomCards: document.getElementById("landlordBottomCards"),
  landlordHandTitle: document.getElementById("landlordHandTitle"),
  landlordClearSelectionButton: document.getElementById("landlordClearSelectionButton"),
  landlordHand: document.getElementById("landlordHand"),
  landlordResultBanner: document.getElementById("landlordResultBanner"),
  leaveLandlordRoomButton: document.getElementById("leaveLandlordRoomButton"),
  landlordScoreSummary: document.getElementById("landlordScoreSummary"),
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 10 } },
});

boot();

async function boot() {
  bindEvents();
  restoreIdentity();
  restoreSessionMeta();
  renderIdentity();
  syncConfigSummary();
  renderModeState();
  renderLandlordScore();
  renderLandlordRoom();
  setConnectionStatus("已连接到联机服务");

  try {
    await cleanupStalePresence();
    await loadRooms();
    await loadLandlordRooms();
    subscribeLobby();
    subscribeLandlordLobby();
  } catch (error) {
    console.error(error);
    setConnectionStatus("联机服务连接异常");
  }

  state.lobbyTimer = window.setInterval(() => {
    if (state.roomId) {
      return;
    }
    loadRooms().catch(console.error);
  }, 30000);

  state.landlord.lobbyTimer = window.setInterval(() => {
    if (state.landlord.roomId) {
      return;
    }
    loadLandlordRooms().catch(console.error);
  }, 30000);

  state.cleanupTimer = window.setInterval(() => {
    cleanupStalePresence().catch(console.error);
  }, 30000);
}

function bindEvents() {
  refs.renameButton.addEventListener("click", () => {
    refs.nameInput.value = state.playerName;
    openNameModal();
  });
  refs.chooseMinesweeperButton.addEventListener("click", () => switchMode("minesweeper"));
  refs.chooseLandlordButton.addEventListener("click", () => switchMode("landlord"));
  refs.backToModeButton.addEventListener("click", () => switchMode(""));

  refs.saveNameButton.addEventListener("click", handleSaveName);
  refs.nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleSaveName();
    }
  });

  refs.createRoomButton.addEventListener("click", handleCreateRoom);
  refs.refreshRoomsButton.addEventListener("click", () => loadRooms(true));
  refs.leaveRoomButton.addEventListener("click", () => leaveCurrentRoom());
  refs.createLandlordRoomButton.addEventListener("click", handleCreateLandlordRoom);
  refs.refreshLandlordRoomsButton.addEventListener("click", () => loadLandlordRooms(true));
  if (!USE_CANVAS_LANDLORD_HUD) {
    refs.leaveLandlordRoomButton.addEventListener("click", () => leaveLandlordRoom());
    refs.landlordReadyButton.addEventListener("click", handleLandlordReadyToggle);
    refs.landlordCallButton.addEventListener("click", () => handleLandlordBidAction("call"));
    refs.landlordPassCallButton.addEventListener("click", () => handleLandlordBidAction("pass_call"));
    refs.landlordRobButton.addEventListener("click", () => handleLandlordBidAction("rob"));
    refs.landlordPassRobButton.addEventListener("click", () => handleLandlordBidAction("pass_rob"));
    refs.landlordPlayButton.addEventListener("click", handleLandlordPlayCards);
    refs.landlordPassPlayButton.addEventListener("click", handleLandlordPassCards);
    refs.landlordClearSelectionButton.addEventListener("click", () => {
      state.landlord.selectedCards = [];
      renderLandlordHand();
      syncLandlordScene().catch(console.error);
    });
  }

  refs.revealModeButton.addEventListener("click", () => setActionMode("reveal"));
  refs.flagModeButton.addEventListener("click", () => setActionMode("flag"));
  refs.questionModeButton.addEventListener("click", () => setActionMode("question"));

  for (const key of ["width", "height", "mine"]) {
    const input = refs[`${key}Input`];
    input.addEventListener("input", () => {
      if (state.preset !== "custom") {
        state.preset = "custom";
        renderPresetButtons();
      }
      syncConfigSummary();
    });
  }

  document.querySelectorAll(".preset-button").forEach((button) => {
    button.addEventListener("click", () => {
      applyPreset(button.dataset.preset);
    });
  });

  refs.board.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-index]");
    if (!cell) {
      return;
    }
    handleBoardAction(Number(cell.dataset.index), state.actionMode);
  });

  refs.board.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const cell = event.target.closest("[data-index]");
    if (!cell) {
      return;
    }
    handleBoardContextMenu(Number(cell.dataset.index));
  });

  window.addEventListener("beforeunload", () => {
    if (state.roomId) {
      removeSelfFromRoom().catch(() => {});
    }
    if (state.landlord.roomId) {
      removeSelfFromLandlordRoom().catch(() => {});
    }
  });

  if (!USE_CANVAS_LANDLORD_HUD) {
    window.addEventListener("pointerup", () => {
      finishLandlordHandDrag();
    });
  }
}

function restoreIdentity() {
  const playerId = localStorage.getItem(STORAGE_KEYS.playerId) || createId();
  localStorage.setItem(STORAGE_KEYS.playerId, playerId);
  state.playerId = playerId;

  const storedName = localStorage.getItem(STORAGE_KEYS.playerName) || "";
  state.playerName = storedName;
  state.playerColor = pickColor(playerId);

  if (storedName) {
    closeNameModal();
  } else {
    openNameModal();
  }
}

function restoreSessionMeta() {
  state.selectedMode = localStorage.getItem(STORAGE_KEYS.selectedMode) || "";
  state.landlordScore = Number(localStorage.getItem(STORAGE_KEYS.landlordScore) || "0");
  state.landlord.settledRounds = parseSettledRounds(
    localStorage.getItem(STORAGE_KEYS.landlordSettledRounds)
  );
}

function renderIdentity() {
  refs.currentPlayerName.textContent = state.playerName || "未设置";
  refs.roomNamePreview.textContent = state.playerName
    ? `${state.playerName} 的房间`
    : "请先输入昵称";
  refs.landlordRoomNamePreview.textContent = state.playerName
    ? `${state.playerName} 的斗地主房间`
    : "请先输入昵称";
}

function renderModeState() {
  refs.currentModeText.textContent = `当前模式：${
    state.selectedMode === "minesweeper"
      ? "扫雷"
      : state.selectedMode === "landlord"
        ? "斗地主"
        : "未选择"
  }`;
  refs.chooseMinesweeperButton.classList.toggle("active", state.selectedMode === "minesweeper");
  refs.chooseLandlordButton.classList.toggle("active", state.selectedMode === "landlord");
  refs.minesweeperView.classList.toggle("hidden", state.selectedMode !== "minesweeper");
  refs.landlordView.classList.toggle("hidden", state.selectedMode !== "landlord");
  refs.backToModeButton.classList.toggle("hidden", !state.selectedMode);
}

function switchMode(mode) {
  state.selectedMode = mode;
  if (mode) {
    localStorage.setItem(STORAGE_KEYS.selectedMode, mode);
  } else {
    localStorage.removeItem(STORAGE_KEYS.selectedMode);
  }
  renderModeState();
  document.body.classList.toggle(
    "landlord-room-active",
    mode === "landlord" && Boolean(state.landlord.roomId)
  );
}

function renderLandlordScore() {
  refs.landlordScoreText.textContent = `斗地主积分 ${state.landlordScore}`;
  refs.landlordScoreSummary.textContent = String(state.landlordScore);
}

async function syncLocalLandlordScoreSnapshot() {
  if (!state.landlord.roomId || !state.playerId) {
    return;
  }

  const { error } = await supabase
    .from("landlord_players")
    .update({
      total_score_snapshot: state.landlordScore,
      last_seen_at: new Date().toISOString(),
    })
    .eq("room_id", state.landlord.roomId)
    .eq("player_id", state.playerId);

  if (error) {
    throw error;
  }

  state.landlord.players = state.landlord.players.map((player) =>
    player.player_id === state.playerId
      ? { ...player, total_score_snapshot: state.landlordScore }
      : player
  );
}

function parseSettledRounds(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch (error) {
    return {};
  }
}

function openNameModal() {
  refs.nameModal.classList.remove("hidden");
  window.setTimeout(() => refs.nameInput.focus(), 30);
}

function closeNameModal() {
  refs.nameModal.classList.add("hidden");
}

async function handleSaveName() {
  const nextName = sanitizeName(refs.nameInput.value);
  if (!nextName) {
    alert("请输入 1 到 16 个字符的名字。");
    refs.nameInput.focus();
    return;
  }

  const previousName = state.playerName;
  state.playerName = nextName;
  localStorage.setItem(STORAGE_KEYS.playerName, nextName);
  renderIdentity();
  closeNameModal();

  if (state.roomId && previousName !== nextName) {
    await syncPlayerRename(previousName, nextName);
  }

  if (state.landlord.roomId && previousName !== nextName) {
    await syncLandlordPlayerRename(previousName, nextName);
  }
}

async function syncPlayerRename(previousName, nextName) {
  const room = state.room;
  if (!room) {
    return;
  }

  const roomPatch = {
    last_action_by: `${previousName || "玩家"} 改名为 ${nextName}`,
    revision: (room.revision || 1) + 1,
  };

  if (room.host_player_id === state.playerId) {
    roomPatch.host_name = nextName;
    roomPatch.room_name = `${nextName} 的房间`;
  }

  const [playerResult, roomResult] = await Promise.all([
    supabase
      .from("minesweeper_players")
      .update({
        player_name: nextName,
        player_color: state.playerColor,
        last_seen_at: new Date().toISOString(),
      })
      .eq("room_id", room.id)
      .eq("player_id", state.playerId),
    supabase
      .from("minesweeper_rooms")
      .update(roomPatch)
      .eq("id", room.id)
      .eq("revision", room.revision)
      .select("*")
      .maybeSingle(),
  ]);

  if (playerResult.error) {
    throw playerResult.error;
  }

  if (roomResult.error) {
    throw roomResult.error;
  }

  state.players = state.players.map((player) =>
    player.player_id === state.playerId
      ? { ...player, player_name: nextName, player_color: state.playerColor }
      : player
  );

  if (roomResult.data) {
    state.room = roomResult.data;
    upsertLobbyRoom(toLobbyRoom(roomResult.data));
  }

  renderCurrentRoom();
}

async function syncLandlordPlayerRename(previousName, nextName) {
  const room = state.landlord.room;
  if (!room) {
    return;
  }

  const roomPatch = {
    last_action_by: `${previousName || "玩家"} 改名为 ${nextName}`,
    revision: (room.revision || 1) + 1,
  };

  if (room.host_player_id === state.playerId) {
    roomPatch.host_name = nextName;
    roomPatch.room_name = `${nextName} 的斗地主房间`;
  }

  const [playerResult, roomResult] = await Promise.all([
    supabase
      .from("landlord_players")
      .update({
        player_name: nextName,
        player_color: state.playerColor,
        last_seen_at: new Date().toISOString(),
      })
      .eq("room_id", room.id)
      .eq("player_id", state.playerId),
    supabase
      .from("landlord_rooms")
      .update(roomPatch)
      .eq("id", room.id)
      .eq("revision", room.revision)
      .select("*")
      .maybeSingle(),
  ]);

  if (playerResult.error) {
    throw playerResult.error;
  }
  if (roomResult.error) {
    throw roomResult.error;
  }

  state.landlord.players = state.landlord.players.map((player) =>
    player.player_id === state.playerId
      ? { ...player, player_name: nextName, player_color: state.playerColor }
      : player
  );

  if (roomResult.data) {
    state.landlord.room = hydrateLandlordRoom(roomResult.data);
    upsertLandlordLobbyRoom(toLandlordLobbyRoom(roomResult.data, state.landlord.players.length));
  }

  renderLandlordRoom();
}

function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) {
    return;
  }
  state.preset = presetKey;
  refs.widthInput.value = String(preset.width);
  refs.heightInput.value = String(preset.height);
  refs.mineInput.value = String(preset.mines);
  renderPresetButtons();
  syncConfigSummary();
}

function renderPresetButtons() {
  document.querySelectorAll(".preset-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === state.preset);
  });
}

function syncConfigSummary() {
  const width = Number(refs.widthInput.value);
  const height = Number(refs.heightInput.value);
  const maxMine = Math.max(1, width * height - 1);
  refs.mineInput.max = String(maxMine);
  if (Number(refs.mineInput.value) > maxMine) {
    refs.mineInput.value = String(maxMine);
  }

  refs.widthValue.textContent = String(width);
  refs.heightValue.textContent = String(height);
  refs.mineValue.textContent = refs.mineInput.value;
  refs.boardSummary.textContent = `${width} x ${height}`;
  refs.mineSummary.textContent = refs.mineInput.value;
  refs.safeSummary.textContent = String(width * height - Number(refs.mineInput.value));
}

function setActionMode(mode) {
  state.actionMode = mode;
  refs.revealModeButton.classList.toggle("active", mode === "reveal");
  refs.flagModeButton.classList.toggle("active", mode === "flag");
  refs.questionModeButton.classList.toggle("active", mode === "question");
}

async function handleCreateRoom() {
  if (!state.playerName) {
    openNameModal();
    return;
  }

  if (state.roomId) {
    const shouldLeave = window.confirm("你已经在一个房间里了，是否先退出当前房间并创建新房间？");
    if (!shouldLeave) {
      return;
    }
    await leaveCurrentRoom();
  }

  const config = getCurrentConfig();
  if (!config) {
    return;
  }

  refs.createRoomButton.disabled = true;
  refs.createRoomButton.textContent = "正在创建房间...";

  try {
    const board = createBoard(config.width, config.height, config.mines);
    const roomPayload = {
      room_name: `${state.playerName} 的房间`,
      host_player_id: state.playerId,
      host_name: state.playerName,
      difficulty: state.preset,
      width: config.width,
      height: config.height,
      mine_count: config.mines,
      status: "active",
      board_state: board,
      started_at: new Date().toISOString(),
      last_action_by: `${state.playerName} 创建了房间`,
    };

    const { data, error } = await supabase
      .from("minesweeper_rooms")
      .insert(roomPayload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await joinRoom(data.id, data);
  } catch (error) {
    console.error(error);
    alert("创建房间失败，请稍后再试。");
  } finally {
    refs.createRoomButton.disabled = false;
    refs.createRoomButton.textContent = "开始游戏并创建房间";
  }
}

function getCurrentConfig() {
  const width = Number(refs.widthInput.value);
  const height = Number(refs.heightInput.value);
  const mines = Number(refs.mineInput.value);
  const maxMine = width * height - 1;

  if (mines <= 0 || mines >= width * height) {
    alert("地雷数必须大于 0，并且小于总格子数。");
    return null;
  }

  if (mines > maxMine) {
    alert("当前地雷数超过了允许范围。");
    return null;
  }

  return { width, height, mines };
}

async function loadRooms(showToast = false) {
  try {
    const { data: rooms, error } = await supabase
      .from("minesweeper_rooms")
      .select(ROOM_LIST_SELECT)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    const roomIds = rooms.map((room) => room.id);
    let players = [];

    if (roomIds.length > 0) {
      const { data: playerRows, error: playerError } = await supabase
        .from("minesweeper_players")
        .select("*")
        .in("room_id", roomIds);

      if (playerError) {
        throw playerError;
      }

      players = playerRows || [];
    }

    state.rooms = rooms.map((room) => {
      const count = players.filter((player) => player.room_id === room.id).length;
      return { ...room, playerCount: count };
    });

    renderRoomList();
    if (showToast) {
      setConnectionStatus("房间列表已刷新");
    }
  } catch (error) {
    console.error(error);
    setConnectionStatus("房间列表刷新失败");
  }
}

function renderRoomList() {
  refs.roomList.innerHTML = "";

  if (state.rooms.length === 0) {
    refs.roomList.innerHTML = `
      <div class="empty-state">
        当前还没有进行中的房间。<br />
        你可以直接在上面设置难度，然后点击“开始游戏并创建房间”。
      </div>
    `;
    return;
  }

  for (const room of state.rooms) {
    const fragment = refs.roomItemTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".room-item");
    button.dataset.roomId = room.id;
    fragment.querySelector(".room-item-title").textContent = room.room_name;
    fragment.querySelector(".room-item-meta").textContent =
      `${room.width} x ${room.height} · ${room.mine_count} 雷 · ${room.playerCount} 人在线`;
    button.addEventListener("click", () => joinRoom(room.id));
    refs.roomList.appendChild(fragment);
  }
}

async function joinRoom(roomId, roomData = null) {
  if (!state.playerName) {
    openNameModal();
    return;
  }

  if (state.roomId && state.roomId !== roomId) {
    const confirmed = window.confirm("你已经在另一个房间中，是否先退出再加入新的房间？");
    if (!confirmed) {
      return;
    }
    await leaveCurrentRoom();
  }

  try {
    await upsertSelfIntoRoom(roomId);
    state.roomId = roomId;
    subscribeRoom(roomId);
    state.room = roomData ? hydrateRoomSnapshot(roomData) : state.room;
    await refreshCurrentRoom();
    startHeartbeat();
    setConnectionStatus("已加入多人房间");
  } catch (error) {
    console.error(error);
    alert("加入房间失败，房间可能已经结束。");
    await loadRooms();
  }
}

async function upsertSelfIntoRoom(roomId) {
  const { error } = await supabase.from("minesweeper_players").upsert(
    {
      room_id: roomId,
      player_id: state.playerId,
      player_name: state.playerName,
      player_color: state.playerColor,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "room_id,player_id" }
  );

  if (error) {
    throw error;
  }
}

async function refreshCurrentRoom() {
  if (!state.roomId) {
    state.room = null;
    state.players = [];
    renderCurrentRoom();
    return;
  }

  const [{ data: room, error: roomError }, { data: players, error: playerError }] =
    await Promise.all([
      supabase.from("minesweeper_rooms").select("*").eq("id", state.roomId).maybeSingle(),
      supabase
        .from("minesweeper_players")
        .select("*")
        .eq("room_id", state.roomId)
        .order("joined_at", { ascending: true }),
    ]);

  if (roomError) {
    throw roomError;
  }

  if (playerError) {
    throw playerError;
  }

  if (!room) {
    state.roomId = null;
    state.room = null;
    state.players = [];
    stopHeartbeat();
    unsubscribeRoom();
    renderCurrentRoom();
    return;
  }

  state.room = room;
  state.players = players || [];
  upsertLobbyRoom(toLobbyRoom(room, state.players.length));
  renderCurrentRoom();
}

function renderCurrentRoom() {
  const room = state.room;
  if (!room) {
    refs.activeRoomTitle.textContent = "还没有加入房间";
    refs.roomStatusText.textContent = "未开始";
    refs.lastActionText.textContent = "加入房间后会在这里看到最新动作。";
    refs.roomConfigText.textContent = "-";
    refs.roomMineText.textContent = "-";
    refs.boardStatsText.textContent = "已翻开 0 格";
    refs.boardFlagText.textContent = "已插旗 0 / 0";
    refs.playerCountText.textContent = "0 人";
    refs.playerList.innerHTML = '<div class="empty-state">加入房间后，这里会显示所有在线玩家。</div>';
    refs.board.style.gridTemplateColumns = "none";
    refs.board.innerHTML = '<div class="empty-state">右边棋盘区域会在加入房间后显示。</div>';
    refs.resultBanner.className = "result-banner hidden";
    refs.resultBanner.textContent = "";
    return;
  }

  refs.activeRoomTitle.textContent = room.room_name;
  refs.roomStatusText.textContent = ROOM_STATUS_TEXT[room.status] || room.status;
  refs.lastActionText.textContent = room.last_action_by || "暂无操作记录";
  refs.roomConfigText.textContent = `${room.width} x ${room.height} · ${PRESETS[room.difficulty]?.label || "自定义"}`;
  refs.roomMineText.textContent = `总地雷数：${room.mine_count}`;

  const stats = getBoardStats(room.board_state || []);
  refs.boardStatsText.textContent = `已翻开 ${stats.revealedSafe} / ${stats.totalSafe} 格`;
  refs.boardFlagText.textContent = `已插旗 ${stats.flags} / ${room.mine_count}`;
  refs.playerCountText.textContent = `${state.players.length} 人`;
  renderPlayers();
  renderBoard(room);
  renderResultBanner(room);
}

function renderPlayers() {
  if (state.players.length === 0) {
    refs.playerList.innerHTML = '<div class="empty-state">当前还没有其他玩家。</div>';
    return;
  }

  refs.playerList.innerHTML = state.players
    .map((player) => {
      const isSelf = player.player_id === state.playerId;
      const isHost = state.room && state.room.host_player_id === player.player_id;
      return `
        <div class="player-pill">
          <span class="avatar" style="background:${player.player_color}">${getInitial(player.player_name)}</span>
          <div>
            <strong>${escapeHtml(player.player_name)}${isSelf ? "（你）" : ""}</strong>
            <div class="join-text">${isHost ? "房主" : "协作玩家"}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderBoard(room) {
  const board = room.board_state || [];
  const cellSize = getCellSize(room.width, room.height);
  refs.board.style.setProperty("--cell-size", `${cellSize}px`);
  refs.board.style.gridTemplateColumns = `repeat(${room.width}, var(--cell-size))`;

  refs.board.innerHTML = board
    .map((cell, index) => {
      const classes = ["cell"];
      let content = "";
      const isPending = state.pendingAction && state.pendingAction.index === index;

      if (cell.revealed) {
        classes.push("revealed");
        if (cell.mine) {
          classes.push("mine");
          content = "💣";
        } else if (cell.adjacent > 0) {
          classes.push(`cell-number-${cell.adjacent}`);
          content = String(cell.adjacent);
        } else {
          classes.push("zero");
          content = "";
        }
      } else if (cell.flagged) {
        classes.push("flagged");
        content = "🚩";
      } else if (cell.questioned) {
        classes.push("questioned");
        content = "?";
      }

      if (isPending) {
        classes.push("pending");
      }

      return `<button class="${classes.join(" ")}" data-index="${index}" aria-label="cell">${content}</button>`;
    })
    .join("");
}

function renderResultBanner(room) {
  refs.resultBanner.className = "result-banner hidden";
  refs.resultBanner.textContent = "";

  if (room.status === "won") {
    refs.resultBanner.className = "result-banner win";
    refs.resultBanner.textContent = "这局已经扫完了。所有安全格都已经被翻开。";
  } else if (room.status === "lost") {
    refs.resultBanner.className = "result-banner lose";
    refs.resultBanner.textContent = "这局已经结束，有玩家踩到雷了。";
  }
}

function subscribeRoom(roomId) {
  unsubscribeRoom();

  state.roomChannel = supabase
    .channel(`room-${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "minesweeper_rooms",
        filter: `id=eq.${roomId}`,
      },
      async (payload) => {
        if (payload.eventType === "DELETE") {
          removeLobbyRoom(roomId);
          state.roomId = null;
          state.room = null;
          state.players = [];
          stopHeartbeat();
          unsubscribeRoom();
          renderCurrentRoom();
          return;
        }
        if (payload.new) {
          state.room = hydrateRoomSnapshot(payload.new);
          upsertLobbyRoom(toLobbyRoom(payload.new, state.players.length));
          renderCurrentRoom();
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "minesweeper_players",
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        if (payload.eventType === "INSERT") {
          upsertRoomPlayer(payload.new);
          renderCurrentRoom();
          return;
        }

        if (payload.eventType === "DELETE") {
          removeRoomPlayer(payload.old.player_id);
          renderCurrentRoom();
          return;
        }

        if (payload.eventType === "UPDATE") {
          if (isHeartbeatOnlyUpdate(payload.old, payload.new)) {
            return;
          }
          upsertRoomPlayer(payload.new);
          renderCurrentRoom();
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnectionStatus("房间实时同步已连接");
      }
    });
}

function unsubscribeRoom() {
  if (state.roomChannel) {
    supabase.removeChannel(state.roomChannel);
    state.roomChannel = null;
  }
}

function subscribeLobby() {
  if (state.lobbyChannel) {
    return;
  }

  state.lobbyChannel = supabase
    .channel("lobby-sync")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "minesweeper_rooms",
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          removeLobbyRoom(payload.old.id);
          return;
        }

        const room = toLobbyRoom(payload.new);
        if (room.status !== "active") {
          removeLobbyRoom(room.id);
          return;
        }

        upsertLobbyRoom(room);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "minesweeper_players",
      },
      (payload) => {
        if (payload.eventType === "INSERT") {
          adjustLobbyRoomPlayerCount(payload.new.room_id, 1);
          return;
        }

        if (payload.eventType === "DELETE") {
          adjustLobbyRoomPlayerCount(payload.old.room_id, -1);
        }
      }
    )
    .subscribe();
}

function startHeartbeat() {
  stopHeartbeat();
  state.heartbeatTimer = window.setInterval(async () => {
    if (!state.roomId) {
      return;
    }
    await supabase
      .from("minesweeper_players")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("room_id", state.roomId)
      .eq("player_id", state.playerId);
  }, 20000);
}

function stopHeartbeat() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
}

async function leaveCurrentRoom() {
  if (!state.roomId) {
    return;
  }

  try {
    await removeSelfFromRoom();
  } catch (error) {
    console.error(error);
  } finally {
    state.roomId = null;
    state.room = null;
    state.players = [];
    stopHeartbeat();
    unsubscribeRoom();
    renderCurrentRoom();
    setConnectionStatus("已退出房间");
  }
}

async function removeSelfFromRoom() {
  const currentRoomId = state.roomId;
  if (!currentRoomId) {
    return;
  }

  await supabase
    .from("minesweeper_players")
    .delete()
    .eq("room_id", currentRoomId)
    .eq("player_id", state.playerId);

  const { data: remainingPlayers } = await supabase
    .from("minesweeper_players")
    .select("id")
    .eq("room_id", currentRoomId);

  if (!remainingPlayers || remainingPlayers.length === 0) {
    await supabase.from("minesweeper_rooms").delete().eq("id", currentRoomId);
  }
}

async function cleanupStalePresence() {
  const staleBefore = new Date(Date.now() - 90000).toISOString();

  const [
    { error: minesweeperCleanupError },
    { data: landlordRooms, error: landlordRoomsError },
  ] = await Promise.all([
    supabase.from("minesweeper_players").delete().lt("last_seen_at", staleBefore),
    supabase.from("landlord_rooms").select("id,status,phase"),
  ]);

  if (minesweeperCleanupError) {
    throw minesweeperCleanupError;
  }
  if (landlordRoomsError) {
    throw landlordRoomsError;
  }

  const landlordWaitingRoomIds = (landlordRooms || [])
    .filter((room) => room.phase === "waiting")
    .map((room) => room.id);

  if (landlordWaitingRoomIds.length > 0) {
    const { error: landlordCleanupError } = await supabase
      .from("landlord_players")
      .delete()
      .in("room_id", landlordWaitingRoomIds)
      .lt("last_seen_at", staleBefore);

    if (landlordCleanupError) {
      throw landlordCleanupError;
    }
  }

  const [
    { data: minesweeperRooms, error: minesweeperRoomsError },
    { data: minesweeperPlayers, error: minesweeperPlayersError },
    { data: landlordPlayers, error: landlordPlayersError },
  ] = await Promise.all([
    supabase.from("minesweeper_rooms").select("id,status"),
    supabase.from("minesweeper_players").select("room_id"),
    supabase.from("landlord_players").select("room_id,last_seen_at"),
  ]);

  if (minesweeperRoomsError) {
    throw minesweeperRoomsError;
  }
  if (minesweeperPlayersError) {
    throw minesweeperPlayersError;
  }
  if (landlordPlayersError) {
    throw landlordPlayersError;
  }

  const occupiedMinesweeperRoomIds = new Set(
    (minesweeperPlayers || []).map((player) => player.room_id)
  );
  const emptyMinesweeperRoomIds = (minesweeperRooms || [])
    .filter((room) => !occupiedMinesweeperRoomIds.has(room.id))
    .map((room) => room.id);

  if (emptyMinesweeperRoomIds.length > 0) {
    await supabase.from("minesweeper_rooms").delete().in("id", emptyMinesweeperRoomIds);
  }

  const occupiedLandlordRoomIds = new Set(
    (landlordPlayers || [])
      .filter((player) => player.last_seen_at && player.last_seen_at >= staleBefore)
      .map((player) => player.room_id)
  );
  const emptyLandlordRoomIds = (landlordRooms || [])
    .filter((room) => !occupiedLandlordRoomIds.has(room.id))
    .map((room) => room.id);

  if (emptyLandlordRoomIds.length > 0) {
    await supabase.from("landlord_players").delete().in("room_id", emptyLandlordRoomIds);
    await supabase.from("landlord_rooms").delete().in("id", emptyLandlordRoomIds);
  }
}

async function handleCreateLandlordRoom() {
  if (!state.playerName) {
    openNameModal();
    return;
  }

  if (state.landlord.roomId) {
    const shouldLeave = window.confirm("你已经在一个斗地主房间里了，是否先退出当前房间并创建新房间？");
    if (!shouldLeave) {
      return;
    }
    await leaveLandlordRoom();
  }

  refs.createLandlordRoomButton.disabled = true;
  refs.createLandlordRoomButton.textContent = "正在创建房间...";

  try {
    const roomPayload = createInitialLandlordRoomPayload();
    const { data, error } = await supabase
      .from("landlord_rooms")
      .insert(roomPayload)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    await joinLandlordRoom(data.id, data);
  } catch (error) {
    console.error(error);
    alert("创建斗地主房间失败，请稍后再试。");
  } finally {
    refs.createLandlordRoomButton.disabled = false;
    refs.createLandlordRoomButton.textContent = "创建斗地主房间";
  }
}

function createInitialLandlordRoomPayload() {
  return {
    room_name: `${state.playerName} 的斗地主房间`,
    host_player_id: state.playerId,
    host_name: state.playerName,
    status: "waiting",
    phase: "waiting",
    revision: 1,
    round_no: 0,
    multiplier: 1,
    current_call_score: 0,
    call_index: 0,
    play_index: 0,
    pass_streak: 0,
    ready_count: 0,
    current_bidding_player_id: null,
    landlord_player_id: null,
    turn_player_id: null,
    deck_state: [],
    bottom_cards: [],
    last_play_cards: [],
    last_play_combo: null,
    last_play_player_id: null,
    settlement: null,
    last_action_by: `${state.playerName} 创建了斗地主房间`,
  };
}

async function loadLandlordRooms(showToast = false) {
  try {
    const { data: rooms, error } = await supabase
      .from("landlord_rooms")
      .select(LANDLORD_ROOM_LIST_SELECT)
      .neq("status", "closed")
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    const roomIds = (rooms || []).map((room) => room.id);
    let players = [];

    if (roomIds.length > 0) {
      const { data: playerRows, error: playerError } = await supabase
        .from("landlord_players")
        .select("room_id")
        .in("room_id", roomIds);

      if (playerError) {
        throw playerError;
      }

      players = playerRows || [];
    }

    state.landlord.rooms = (rooms || []).map((room) => ({
      ...room,
      playerCount: players.filter((player) => player.room_id === room.id).length,
    }));

    renderLandlordRoomList();
    if (showToast) {
      setConnectionStatus("斗地主房间列表已刷新");
    }
  } catch (error) {
    console.error(error);
    setConnectionStatus("斗地主房间列表刷新失败");
  }
}

function renderLandlordRoomList() {
  refs.landlordRoomList.innerHTML = "";

  if (state.landlord.rooms.length === 0) {
    refs.landlordRoomList.innerHTML = `
      <div class="empty-state">
        当前还没有斗地主房间。<br />
        你可以直接创建一个新房间，等另外两位玩家加入后准备开局。
      </div>
    `;
    return;
  }

  for (const room of state.landlord.rooms) {
    const fragment = refs.landlordRoomItemTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".room-item");
    button.dataset.roomId = room.id;
    fragment.querySelector(".room-item-title").textContent = room.room_name;
    fragment.querySelector(".room-item-meta").textContent =
      `${LANDLORD_STATUS_TEXT[room.phase] || room.phase} · ${room.playerCount}/3 人 · 倍数 ${room.multiplier || 1}`;
    button.addEventListener("click", () => joinLandlordRoom(room.id));
    refs.landlordRoomList.appendChild(fragment);
  }
}

async function joinLandlordRoom(roomId, roomData = null) {
  if (!state.playerName) {
    openNameModal();
    return;
  }

  if (state.landlord.roomId && state.landlord.roomId !== roomId) {
    const confirmed = window.confirm("你已经在另一个斗地主房间里，是否先退出再加入新的房间？");
    if (!confirmed) {
      return;
    }
    await leaveLandlordRoom();
  }

  try {
    const room = roomData ? hydrateLandlordRoom(roomData) : await fetchLandlordRoom(roomId);
    if (!room) {
      throw new Error("room_not_found");
    }

    const currentPlayers = await fetchLandlordPlayers(roomId);
    const reconnectCandidate = findLandlordReconnectCandidate(currentPlayers);
    if (reconnectCandidate && reconnectCandidate.player_id !== state.playerId) {
      state.playerId = reconnectCandidate.player_id;
      localStorage.setItem(STORAGE_KEYS.playerId, state.playerId);
      state.playerColor = reconnectCandidate.player_color || pickColor(state.playerId);
      renderIdentity();
    }

    const exists = currentPlayers.some((player) => player.player_id === state.playerId);
    if (!exists && !reconnectCandidate && currentPlayers.length >= 3) {
      alert("这个斗地主房间已经满了。");
      return;
    }

    await upsertSelfIntoLandlordRoom(roomId, currentPlayers);
    state.landlord.roomId = roomId;
    state.landlord.room = room;
    subscribeLandlordRoom(roomId);
    await refreshLandlordRoom();
    startLandlordHeartbeat();
    switchMode("landlord");
    setConnectionStatus("已加入斗地主房间");
  } catch (error) {
    console.error(error);
    alert("加入斗地主房间失败，房间可能已经关闭。");
    await loadLandlordRooms();
  }
}

async function upsertSelfIntoLandlordRoom(roomId, currentPlayers = []) {
  const existing = findLandlordReconnectCandidate(currentPlayers);
  const seatIndex = existing?.seat_index || getNextAvailableLandlordSeat(currentPlayers);
  const spawn = getLandlordSeatSpawn(seatIndex);
  const { error } = await supabase.from("landlord_players").upsert(
    {
      room_id: roomId,
      player_id: state.playerId,
      player_name: state.playerName,
      player_color: state.playerColor,
      seat_index: seatIndex,
      is_ready: existing?.is_ready ?? false,
      round_score_delta: existing?.round_score_delta ?? 0,
      total_score_snapshot: state.landlordScore,
      hand_cards: existing?.hand_cards ?? [],
      role: existing?.role ?? "farmer",
      pos_x: existing?.pos_x ?? spawn.x,
      pos_y: existing?.pos_y ?? spawn.y,
      pos_z: existing?.pos_z ?? spawn.z,
      yaw: existing?.yaw ?? spawn.yaw,
      pitch: existing?.pitch ?? spawn.pitch,
      is_moving: false,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "room_id,player_id" }
  );

  if (error) {
    throw error;
  }
}

async function fetchLandlordRoom(roomId) {
  const { data, error } = await supabase
    .from("landlord_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? hydrateLandlordRoom(data) : null;
}

async function fetchLandlordPlayers(roomId) {
  const { data, error } = await supabase
    .from("landlord_players")
    .select("*")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

async function refreshLandlordRoom() {
  if (!state.landlord.roomId) {
    state.landlord.room = null;
    state.landlord.players = [];
    renderLandlordRoom();
    return;
  }

  const [room, players] = await Promise.all([
    fetchLandlordRoom(state.landlord.roomId),
    fetchLandlordPlayers(state.landlord.roomId),
  ]);

  if (!room) {
    state.landlord.roomId = null;
    state.landlord.room = null;
    state.landlord.players = [];
    stopLandlordHeartbeat();
    unsubscribeLandlordRoom();
    renderLandlordRoom();
    return;
  }

  state.landlord.room = room;
  state.landlord.players = normalizeLandlordPlayers(players);
  upsertLandlordLobbyRoom(toLandlordLobbyRoom(room, state.landlord.players.length));
  reconcileLandlordSettlement(room);
  renderLandlordRoom();
}

function renderLandlordRoom() {
  const room = state.landlord.room;
  if (!room) {
    document.body.classList.remove("landlord-room-active");
    refs.landlordActiveRoomTitle.textContent = "还没有加入斗地主房间";
    refs.landlordStatusText.textContent = "等待中";
    refs.landlordLastActionText.textContent = "加入房间后，这里会显示最近动作。";
    refs.landlordTurnText.textContent = "-";
    refs.landlordMultiplierText.textContent = "当前倍数：1";
    refs.landlordBottomText.textContent = "底牌未揭晓";
    refs.landlordWinnerText.textContent = "本局结果会在这里显示。";
    refs.landlordPlayerCountText.textContent = "0 / 3";
    refs.landlordSeatList.innerHTML =
      '<div class="empty-state">加入房间后，这里会显示三位玩家的座位和准备状态。</div>';
    refs.landlordLastPlayText.textContent = "还没有人出牌";
    refs.landlordBottomCards.innerHTML = "";
    refs.landlordHandTitle.textContent = "请选择房间并准备";
    refs.landlordHand.innerHTML = '<div class="empty-state">你的手牌会在发牌后显示在这里。</div>';
    refs.landlordResultBanner.className = "result-banner hidden";
    refs.landlordResultBanner.textContent = "";
    if (!USE_CANVAS_LANDLORD_HUD) {
      toggleLandlordActionButtons(null);
    }
    teardownLandlordScene();
    return;
  }

  document.body.classList.add("landlord-room-active");
  refs.landlordActiveRoomTitle.textContent = room.room_name;
  refs.landlordStatusText.textContent = LANDLORD_STATUS_TEXT[room.phase] || room.phase;
  refs.landlordLastActionText.textContent = room.last_action_by || "暂无操作记录";
  refs.landlordTurnText.textContent = getLandlordTurnText(room.turn_player_id);
  refs.landlordMultiplierText.textContent = `当前倍数：${room.multiplier || 1}`;
  refs.landlordBottomText.textContent =
    shouldRevealLandlordBottomCards(room) ? `${(room.bottom_cards || []).length} 张底牌` : "底牌未揭晓";
  refs.landlordWinnerText.textContent = getLandlordWinnerText(room);
  refs.landlordPlayerCountText.textContent = `${state.landlord.players.length} / 3`;
  refs.landlordLastPlayText.textContent = getLandlordLastPlayText(room);
  refs.landlordBottomCards.innerHTML = renderLandlordCardRow(
    shouldRevealLandlordBottomCards(room) ? room.bottom_cards || [] : []
  );
  refs.landlordHandTitle.textContent = getLandlordHandTitle(room);

  if (!USE_CANVAS_LANDLORD_HUD) {
    renderLandlordSeatList();
    renderLandlordHand();
    renderLandlordResultBanner(room);
    toggleLandlordActionButtons(room);
  }
  syncLandlordScene().catch(console.error);
}

async function syncLandlordScene() {
  if (!refs.landlordSceneCanvas || !refs.landlordHudCanvas) {
    return;
  }

  if (!state.landlord.sceneExperience) {
    const experience = new Landlord3DExperience(refs.landlordSceneCanvas, {
      onPoseChange: queueLandlordPoseSync,
    });
    state.landlord.sceneExperience = experience;
    await experience.init();
  }

  if (!state.landlord.hudExperience) {
    const hud = new LandlordHudCanvas(refs.landlordHudCanvas, {
      onLeaveRoom: () => leaveLandlordRoom(),
      onReadyToggle: () => handleLandlordReadyToggle(),
      onBidAction: (action) => handleLandlordBidAction(action),
      onPlay: () => handleLandlordPlayCards(),
      onPass: () => handleLandlordPassCards(),
      onSelectionChange: (cards) => {
        state.landlord.selectedCards = sortCards(cards);
        syncLandlordScene().catch(console.error);
      },
      onViewDragStart: (x, y) => state.landlord.sceneExperience?.startViewDrag(x, y),
      onViewDragMove: (x, y) => state.landlord.sceneExperience?.moveViewDrag(x, y),
      onViewDragEnd: () => state.landlord.sceneExperience?.endViewDrag(),
    });
    state.landlord.hudExperience = hud;
    hud.init();
  }

  state.landlord.sceneExperience.update({
    room: state.landlord.room,
    players: state.landlord.players,
    selfId: state.playerId,
    selectedCards: state.landlord.selectedCards,
  });
  state.landlord.hudExperience.update({
    room: state.landlord.room,
    players: state.landlord.players,
    selfId: state.playerId,
    selectedCards: state.landlord.selectedCards,
  });
}

function teardownLandlordScene() {
  if (state.landlord.sceneExperience) {
    state.landlord.sceneExperience.dispose();
    state.landlord.sceneExperience = null;
  }
  if (state.landlord.hudExperience) {
    state.landlord.hudExperience.dispose();
    state.landlord.hudExperience = null;
  }
  state.landlord.pendingPose = null;
  state.landlord.poseSyncInFlight = false;
  state.landlord.lastPoseSignature = "";
}

function queueLandlordPoseSync(pose) {
  if (!state.landlord.roomId) {
    return;
  }

  const signature = [
    pose.x.toFixed(3),
    pose.y.toFixed(3),
    pose.z.toFixed(3),
    pose.yaw.toFixed(3),
    pose.pitch.toFixed(3),
    pose.isMoving ? "1" : "0",
  ].join("|");

  if (signature === state.landlord.lastPoseSignature) {
    return;
  }

  state.landlord.lastPoseSignature = signature;
  state.landlord.pendingPose = pose;

  const selfIndex = state.landlord.players.findIndex((player) => player.player_id === state.playerId);
  if (selfIndex !== -1) {
    const nextPlayers = [...state.landlord.players];
    nextPlayers[selfIndex] = {
      ...nextPlayers[selfIndex],
      pos_x: pose.x,
      pos_y: pose.y,
      pos_z: pose.z,
      yaw: pose.yaw,
      pitch: pose.pitch,
      is_moving: pose.isMoving,
    };
    state.landlord.players = nextPlayers;
  }

  flushLandlordPoseSync().catch(console.error);
}

async function flushLandlordPoseSync() {
  if (state.landlord.poseSyncInFlight || !state.landlord.pendingPose || !state.landlord.roomId) {
    return;
  }

  state.landlord.poseSyncInFlight = true;
  const pose = state.landlord.pendingPose;
  state.landlord.pendingPose = null;

  try {
    await supabase
      .from("landlord_players")
      .update({
        pos_x: pose.x,
        pos_y: pose.y,
        pos_z: pose.z,
        yaw: pose.yaw,
        pitch: pose.pitch,
        is_moving: pose.isMoving,
        last_seen_at: new Date().toISOString(),
      })
      .eq("room_id", state.landlord.roomId)
      .eq("player_id", state.playerId);
  } finally {
    state.landlord.poseSyncInFlight = false;
    if (state.landlord.pendingPose) {
      flushLandlordPoseSync().catch(console.error);
    }
  }
}

async function handleBoardAction(index, mode) {
  const room = state.room;
  if (!room || room.status !== "active" || state.isSavingMove) {
    return;
  }

  const board = room.board_state || [];
  const cell = board[index];
  if (!cell) {
    return;
  }

  if (cell.revealed || (mode === "reveal" && cell.flagged)) {
    return;
  }

  state.isSavingMove = true;
  state.pendingAction = { index, mode };
  renderBoard(room);
  setConnectionStatus("正在提交操作到云端棋盘...");

  try {
    const { data, error } = await supabase.rpc("apply_minesweeper_action", {
      p_room_id: room.id,
      p_player_id: state.playerId,
      p_player_name: state.playerName,
      p_action_mode: mode,
      p_cell_index: index,
    });

    if (error) {
      throw error;
    }

    if (!data?.room) {
      await refreshCurrentRoom();
      setConnectionStatus("操作已回滚，正在同步最新棋盘");
      return;
    }

    state.room = hydrateRoomSnapshot(data.room);
    upsertLobbyRoom(toLobbyRoom(data.room, state.players.length));
    renderCurrentRoom();
    if (data.applied) {
      setConnectionStatus("操作已同步到云端棋盘");
    } else {
      setConnectionStatus("你的操作已收到，云端棋盘保持最新状态");
    }
  } catch (error) {
    console.error(error);
    setConnectionStatus("云端棋盘同步失败，请稍后重试");
    await refreshCurrentRoom();
  } finally {
    state.pendingAction = null;
    state.isSavingMove = false;
    renderCurrentRoom();
  }
}

function handleBoardContextMenu(index) {
  const room = state.room;
  if (!room || room.status !== "active" || state.isSavingMove) {
    return;
  }

  const board = room.board_state || [];
  const cell = board[index];
  if (!cell || cell.revealed) {
    return;
  }

  if (cell.flagged) {
    handleBoardAction(index, "question");
    return;
  }

  if (cell.questioned) {
    handleBoardAction(index, "question");
    return;
  }

  handleBoardAction(index, "flag");
}

function createBoard(width, height, mineCount) {
  const total = width * height;
  const mineIndexes = new Set();
  while (mineIndexes.size < mineCount) {
    mineIndexes.add(Math.floor(Math.random() * total));
  }

  const board = Array.from({ length: total }, (_, index) => ({
    id: index,
    x: index % width,
    y: Math.floor(index / width),
    mine: mineIndexes.has(index),
    adjacent: 0,
    revealed: false,
    flagged: false,
    questioned: false,
    revealed_by: null,
  }));

  for (let index = 0; index < total; index += 1) {
    if (board[index].mine) {
      continue;
    }
    board[index].adjacent = getNeighborIndexes(index, width, height).filter(
      (neighborIndex) => board[neighborIndex].mine
    ).length;
  }

  return board;
}

function cloneBoard(board) {
  return board.map((cell) => ({ ...cell }));
}

function getNeighborIndexes(index, width, height) {
  const x = index % width;
  const y = Math.floor(index / width);
  const neighbors = [];

  for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      if (deltaX === 0 && deltaY === 0) {
        continue;
      }
      const nextX = x + deltaX;
      const nextY = y + deltaY;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
        continue;
      }
      neighbors.push(nextY * width + nextX);
    }
  }

  return neighbors;
}

function revealSafeArea(board, startIndex, width, height, playerName) {
  const queue = [startIndex];
  const visited = new Set();
  let changed = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const cell = board[current];
    if (!cell || cell.revealed || cell.flagged || cell.mine) {
      continue;
    }

    cell.revealed = true;
    cell.questioned = false;
    cell.revealed_by = playerName;
    changed = true;

    if (cell.adjacent === 0) {
      queue.push(...getNeighborIndexes(current, width, height));
    }
  }

  return changed;
}

function revealAllMines(board) {
  for (const cell of board) {
    if (cell.mine) {
      cell.revealed = true;
    }
  }
}

function isBoardCompleted(board) {
  return board.every((cell) => cell.mine || cell.revealed);
}

function getBoardStats(board) {
  const stats = {
    flags: 0,
    revealedSafe: 0,
    totalSafe: 0,
  };

  for (const cell of board) {
    if (cell.flagged) {
      stats.flags += 1;
    }
    if (!cell.mine) {
      stats.totalSafe += 1;
      if (cell.revealed) {
        stats.revealedSafe += 1;
      }
    }
  }

  return stats;
}

function getCellSize(width, height) {
  const maxSide = Math.max(width, height);
  return Math.max(24, Math.min(42, Math.floor(600 / maxSide)));
}

function sanitizeName(value) {
  return value.trim().slice(0, 16);
}

function getInitial(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pickColor(seed) {
  let total = 0;
  for (const char of seed) {
    total += char.charCodeAt(0);
  }
  return COLOR_POOL[total % COLOR_POOL.length];
}

function setConnectionStatus(text) {
  refs.connectionBadge.textContent = text;
}

function getActionLabel(mode) {
  if (mode === "flag") {
    return "切换了旗子";
  }
  if (mode === "question") {
    return "切换了问号标记";
  }
  return "翻开了格子";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function upsertRoomPlayer(player) {
  const nextPlayer = { ...player };
  const currentIndex = state.players.findIndex((item) => item.player_id === nextPlayer.player_id);
  if (currentIndex === -1) {
    state.players = [...state.players, nextPlayer].sort(sortPlayersByJoinTime);
    return;
  }

  const nextPlayers = [...state.players];
  nextPlayers[currentIndex] = { ...nextPlayers[currentIndex], ...nextPlayer };
  state.players = nextPlayers.sort(sortPlayersByJoinTime);
}

function removeRoomPlayer(playerId) {
  state.players = state.players.filter((player) => player.player_id !== playerId);
}

function isHeartbeatOnlyUpdate(previousPlayer, nextPlayer) {
  return (
    previousPlayer?.player_name === nextPlayer?.player_name &&
    previousPlayer?.player_color === nextPlayer?.player_color &&
    previousPlayer?.joined_at === nextPlayer?.joined_at
  );
}

function sortPlayersByJoinTime(left, right) {
  return new Date(left.joined_at).getTime() - new Date(right.joined_at).getTime();
}

function upsertLobbyRoom(room) {
  if (!room || room.status !== "active") {
    return;
  }

  const currentIndex = state.rooms.findIndex((item) => item.id === room.id);
  if (currentIndex === -1) {
    state.rooms = [room, ...state.rooms].sort(sortRoomsByUpdateTime);
  } else {
    const nextRooms = [...state.rooms];
    nextRooms[currentIndex] = { ...nextRooms[currentIndex], ...room };
    state.rooms = nextRooms.sort(sortRoomsByUpdateTime);
  }

  renderRoomList();
}

function removeLobbyRoom(roomId) {
  const nextRooms = state.rooms.filter((room) => room.id !== roomId);
  if (nextRooms.length === state.rooms.length) {
    return;
  }
  state.rooms = nextRooms;
  renderRoomList();
}

function adjustLobbyRoomPlayerCount(roomId, delta) {
  const currentIndex = state.rooms.findIndex((room) => room.id === roomId);
  if (currentIndex === -1) {
    return;
  }

  const nextRooms = [...state.rooms];
  const currentRoom = nextRooms[currentIndex];
  const nextCount = Math.max(0, (currentRoom.playerCount || 0) + delta);
  nextRooms[currentIndex] = { ...currentRoom, playerCount: nextCount };
  state.rooms = nextRooms.sort(sortRoomsByUpdateTime);
  renderRoomList();
}

function sortRoomsByUpdateTime(left, right) {
  return new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime();
}

function toLobbyRoom(room, playerCount = null) {
  if (!room) {
    return null;
  }

  const existingRoom = state.rooms.find((item) => item.id === room.id);
  return {
    id: room.id,
    room_name: room.room_name,
    host_player_id: room.host_player_id,
    host_name: room.host_name,
    difficulty: room.difficulty,
    width: room.width,
    height: room.height,
    mine_count: room.mine_count,
    status: room.status,
    updated_at: room.updated_at,
    revision: room.revision,
    started_at: room.started_at,
    finished_at: room.finished_at,
    last_action_by: room.last_action_by,
    playerCount: playerCount ?? existingRoom?.playerCount ?? 0,
  };
}

function hydrateRoomSnapshot(room) {
  return {
    ...room,
    board_state: room.board_state || [],
  };
}

function hydrateLandlordRoom(room) {
  return {
    ...room,
    deck_state: room.deck_state || [],
    bottom_cards: room.bottom_cards || [],
    last_play_cards: room.last_play_cards || [],
    last_play_combo: room.last_play_combo || null,
    settlement: room.settlement || null,
  };
}

function normalizeLandlordPlayers(players) {
  return [...(players || [])].sort(sortLandlordPlayers).map((player, index) => ({
    ...player,
    hand_cards: sortCards(player.hand_cards || []),
    seat_index: player.seat_index > 0 ? player.seat_index : index + 1,
    ...getNormalizedLandlordPose(player, player.seat_index > 0 ? player.seat_index : index + 1),
  }));
}

function getNormalizedLandlordPose(player, seatIndex) {
  const fallback = getLandlordSeatSpawn(seatIndex);
  const posX = Number.isFinite(Number(player.pos_x)) ? Number(player.pos_x) : fallback.x;
  const posY = Number.isFinite(Number(player.pos_y)) ? Number(player.pos_y) : fallback.y;
  const posZ = Number.isFinite(Number(player.pos_z)) ? Number(player.pos_z) : fallback.z;
  const yaw = Number.isFinite(Number(player.yaw)) ? Number(player.yaw) : fallback.yaw;
  const pitch = Number.isFinite(Number(player.pitch)) ? Number(player.pitch) : fallback.pitch;
  return {
    pos_x: posX,
    pos_y: posY,
    pos_z: posZ,
    yaw,
    pitch,
    is_moving: Boolean(player.is_moving),
  };
}

function getLandlordSeatSpawn(seatIndex) {
  return LANDLORD_SEAT_SPAWNS[seatIndex] || LANDLORD_SEAT_SPAWNS[1];
}

function getNextAvailableLandlordSeat(players) {
  const used = new Set(players.map((player) => player.seat_index).filter(Boolean));
  for (const seatIndex of [1, 2, 3]) {
    if (!used.has(seatIndex)) {
      return seatIndex;
    }
  }
  return 1;
}

function findLandlordReconnectCandidate(players) {
  return (
    players.find((player) => player.player_id === state.playerId) ||
    players.find((player) => player.player_name === state.playerName) ||
    null
  );
}

function shouldRevealLandlordBottomCards(room) {
  return Boolean(room && ["play", "finished"].includes(room.phase) && room.landlord_player_id);
}

function sortLandlordPlayers(left, right) {
  if ((left.seat_index || 0) > 0 && (right.seat_index || 0) > 0) {
    return left.seat_index - right.seat_index;
  }
  return sortPlayersByJoinTime(left, right);
}

function getLandlordOrderedPlayers(room = state.landlord.room, players = state.landlord.players) {
  return normalizeLandlordPlayers(players).sort(sortLandlordPlayers);
}

function getSelfLandlordPlayer() {
  return state.landlord.players.find((player) => player.player_id === state.playerId) || null;
}

function getNextLandlordPlayer(players, currentPlayerId, skipPlayerIds = []) {
  const currentIndex = players.findIndex((player) => player.player_id === currentPlayerId);
  if (currentIndex === -1 || players.length === 0) {
    return null;
  }

  for (let offset = 1; offset < players.length; offset += 1) {
    const candidate = players[(currentIndex + offset) % players.length];
    if (!skipPlayerIds.includes(candidate.player_id)) {
      return candidate;
    }
  }

  return null;
}

function renderLandlordSeatList() {
  const players = getLandlordOrderedPlayers();
  if (players.length === 0) {
    refs.landlordSeatList.innerHTML =
      '<div class="empty-state">加入房间后，这里会显示三位玩家的座位和准备状态。</div>';
    return;
  }

  refs.landlordSeatList.innerHTML = players
    .map((player) => {
      const isSelf = player.player_id === state.playerId;
      const isLandlord = state.landlord.room?.landlord_player_id === player.player_id;
      const handCount = (player.hand_cards || []).length;
      return `
        <div class="landlord-seat-card">
          <div class="landlord-seat-head">
            <span class="avatar" style="background:${player.player_color}">${getInitial(player.player_name)}</span>
            <div>
              <strong>${escapeHtml(player.player_name)}${isSelf ? "（你）" : ""}</strong>
              <div class="join-text">座位 ${player.seat_index}</div>
            </div>
          </div>
          <div class="landlord-seat-meta">
            <span class="mini-pill ${player.is_ready ? "ready" : ""}">${player.is_ready ? "已准备" : "未准备"}</span>
            <span class="mini-pill ${isLandlord ? "landlord" : ""}">${isLandlord ? "地主" : "农民"}</span>
            <span class="mini-pill">手牌 ${handCount}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderLandlordHand() {
  const selfPlayer = getSelfLandlordPlayer();
  const handCards = selfPlayer?.hand_cards || [];

  if (handCards.length === 0) {
    refs.landlordHand.innerHTML = '<div class="empty-state">发牌后你的手牌会显示在这里。</div>';
    return;
  }

  refs.landlordHand.innerHTML = handCards
    .map((card, index) => {
      const selected = state.landlord.selectedCards.includes(card);
      return `
        <button class="landlord-card ${selected ? "selected" : ""}" data-card="${card}" data-index="${index}">
          ${escapeHtml(getCardDisplay(card))}
        </button>
      `;
    })
    .join("");

  refs.landlordHand.querySelectorAll("[data-card]").forEach((button) => {
    button.addEventListener("pointerdown", () => {
      startLandlordHandDrag(Number(button.dataset.index), handCards);
    });
    button.addEventListener("pointerenter", () => {
      updateLandlordHandDrag(Number(button.dataset.index));
    });
    button.addEventListener("pointerup", () => {
      finishLandlordHandDrag();
    });
  });
}

function startLandlordHandDrag(index, cards) {
  state.landlord.handDrag.active = true;
  state.landlord.handDrag.startIndex = index;
  state.landlord.handDrag.currentIndex = index;
  state.landlord.handDrag.cards = [...cards];
  applyLandlordHandDragSelection();
}

function updateLandlordHandDrag(index) {
  if (!state.landlord.handDrag.active) {
    return;
  }
  state.landlord.handDrag.currentIndex = index;
  applyLandlordHandDragSelection();
}

function finishLandlordHandDrag() {
  if (!state.landlord.handDrag.active) {
    return;
  }
  state.landlord.handDrag.active = false;
  state.landlord.handDrag.startIndex = -1;
  state.landlord.handDrag.currentIndex = -1;
  state.landlord.handDrag.cards = [];
}

function applyLandlordHandDragSelection() {
  const { startIndex, currentIndex, cards } = state.landlord.handDrag;
  if (startIndex < 0 || currentIndex < 0 || cards.length === 0) {
    return;
  }

  const start = Math.min(startIndex, currentIndex);
  const end = Math.max(startIndex, currentIndex);
  state.landlord.selectedCards = sortCards(cards.slice(start, end + 1));
  renderLandlordHand();
  syncLandlordScene().catch(console.error);
}

function toggleLandlordCardSelection(card) {
  const current = new Set(state.landlord.selectedCards);
  if (current.has(card)) {
    current.delete(card);
  } else {
    current.add(card);
  }
  state.landlord.selectedCards = sortCards([...current]);
  renderLandlordHand();
  syncLandlordScene().catch(console.error);
}

function renderLandlordCardRow(cards) {
  if (!cards || cards.length === 0) {
    return '<span class="muted-text">暂无</span>';
  }
  return cards
    .map(
      (card) => `<span class="landlord-card landlord-card-inline">${escapeHtml(getCardDisplay(card))}</span>`
    )
    .join("");
}

function renderLandlordResultBanner(room) {
  refs.landlordResultBanner.className = "result-banner hidden";
  refs.landlordResultBanner.textContent = "";

  if (room.phase !== "finished" || !room.settlement) {
    return;
  }

  const winnerSide = room.settlement.winner_role === "landlord" ? "地主" : "农民";
  refs.landlordResultBanner.className =
    room.settlement.winner_role === "landlord" ? "result-banner lose" : "result-banner win";
  refs.landlordResultBanner.textContent = `${winnerSide}方获胜，本局倍数 ${room.multiplier || 1}。`;
}

function toggleLandlordActionButtons(room) {
  const selfPlayer = getSelfLandlordPlayer();
  const isTurn = room && room.turn_player_id === state.playerId;
  const canPassPlay =
    room &&
    room.phase === "play" &&
    room.turn_player_id === state.playerId &&
    room.last_play_player_id &&
    room.last_play_player_id !== state.playerId;

  refs.landlordReadyButton.classList.toggle(
    "hidden",
    !room || !["waiting", "finished"].includes(room.phase)
  );
  refs.landlordReadyButton.textContent = selfPlayer?.is_ready ? "取消准备" : "准备";

  refs.landlordCallButton.classList.toggle(
    "hidden",
    !room || room.phase !== "call" || room.current_bidding_player_id !== state.playerId
  );
  refs.landlordPassCallButton.classList.toggle(
    "hidden",
    !room || room.phase !== "call" || room.current_bidding_player_id !== state.playerId
  );
  refs.landlordRobButton.classList.toggle(
    "hidden",
    !room || room.phase !== "rob" || room.current_bidding_player_id !== state.playerId
  );
  refs.landlordPassRobButton.classList.toggle(
    "hidden",
    !room || room.phase !== "rob" || room.current_bidding_player_id !== state.playerId
  );
  refs.landlordPlayButton.classList.toggle("hidden", !room || room.phase !== "play" || !isTurn);
  refs.landlordPassPlayButton.classList.toggle("hidden", !canPassPlay);
}

function getLandlordTurnText(playerId) {
  if (!playerId) {
    return "等待系统安排";
  }
  const player = state.landlord.players.find((item) => item.player_id === playerId);
  return player ? `${player.player_name}${playerId === state.playerId ? "（你）" : ""}` : "等待中";
}

function getLandlordWinnerText(room) {
  if (!room?.settlement) {
    return "本局结果会在这里显示。";
  }
  const winnerSide = room.settlement.winner_role === "landlord" ? "地主" : "农民";
  return `${winnerSide}方赢了，等待大家准备下一局。`;
}

function getLandlordLastPlayText(room) {
  if (!room?.last_play_cards?.length) {
    return "还没有人出牌";
  }
  const player = state.landlord.players.find((item) => item.player_id === room.last_play_player_id);
  const cards = room.last_play_cards.map(getCardDisplay).join(" ");
  const comboLabel = room.last_play_combo?.label || "牌型";
  return `${player?.player_name || "玩家"} 打出了 ${comboLabel}：${cards}`;
}

function getLandlordHandTitle(room) {
  const selfPlayer = getSelfLandlordPlayer();
  if (!selfPlayer) {
    return "请选择房间并准备";
  }
  if (room.phase === "waiting") {
    return selfPlayer.is_ready ? "你已准备，等待其他玩家" : "点击准备，等 3 人齐了自动开始";
  }
  if (room.phase === "call") {
    return room.current_bidding_player_id === state.playerId ? "轮到你决定叫不叫地主" : "等待别人叫地主";
  }
  if (room.phase === "rob") {
    return room.current_bidding_player_id === state.playerId ? "轮到你决定抢不抢地主" : "等待别人抢地主";
  }
  if (room.phase === "play") {
    return room.turn_player_id === state.playerId ? "轮到你出牌" : "等待其他玩家出牌";
  }
  return "本局已结算，准备后可以开始下一局";
}

function subscribeLandlordLobby() {
  if (state.landlord.lobbyChannel) {
    return;
  }

  state.landlord.lobbyChannel = supabase
    .channel("landlord-lobby-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "landlord_rooms" },
      (payload) => {
        if (payload.eventType === "DELETE") {
          removeLandlordLobbyRoom(payload.old.id);
          return;
        }
        upsertLandlordLobbyRoom(toLandlordLobbyRoom(payload.new));
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "landlord_players" },
      (payload) => {
        if (payload.eventType === "INSERT") {
          adjustLandlordLobbyRoomPlayerCount(payload.new.room_id, 1);
          return;
        }
        if (payload.eventType === "DELETE") {
          adjustLandlordLobbyRoomPlayerCount(payload.old.room_id, -1);
        }
      }
    )
    .subscribe();
}

function subscribeLandlordRoom(roomId) {
  unsubscribeLandlordRoom();

  state.landlord.roomChannel = supabase
    .channel(`landlord-room-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "landlord_rooms", filter: `id=eq.${roomId}` },
      async (payload) => {
        if (payload.eventType === "DELETE") {
          removeLandlordLobbyRoom(roomId);
          state.landlord.roomId = null;
          state.landlord.room = null;
          state.landlord.players = [];
          stopLandlordHeartbeat();
          unsubscribeLandlordRoom();
          renderLandlordRoom();
          return;
        }
        if (payload.new) {
          state.landlord.room = hydrateLandlordRoom(payload.new);
          upsertLandlordLobbyRoom(
            toLandlordLobbyRoom(payload.new, state.landlord.players.length)
          );
          reconcileLandlordSettlement(state.landlord.room);
          renderLandlordRoom();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "landlord_players", filter: `room_id=eq.${roomId}` },
      async (payload) => {
        if (payload.eventType === "INSERT") {
          upsertLandlordPlayer(payload.new);
        } else if (payload.eventType === "DELETE") {
          removeLandlordPlayer(payload.old.player_id);
        } else if (payload.eventType === "UPDATE") {
          if (!isHeartbeatOnlyUpdate(payload.old, payload.new)) {
            upsertLandlordPlayer(payload.new);
          }
        }

        renderLandlordRoom();
        maybeAutoStartLandlordRound().catch(console.error);
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnectionStatus("斗地主房间实时同步已连接");
      }
    });
}

function unsubscribeLandlordRoom() {
  if (state.landlord.roomChannel) {
    supabase.removeChannel(state.landlord.roomChannel);
    state.landlord.roomChannel = null;
  }
}

function upsertLandlordPlayer(player) {
  const nextPlayer = {
    ...player,
    hand_cards: sortCards(player.hand_cards || []),
  };
  const currentIndex = state.landlord.players.findIndex(
    (item) => item.player_id === nextPlayer.player_id
  );
  if (currentIndex === -1) {
    state.landlord.players = normalizeLandlordPlayers([...state.landlord.players, nextPlayer]);
    return;
  }
  const nextPlayers = [...state.landlord.players];
  nextPlayers[currentIndex] = { ...nextPlayers[currentIndex], ...nextPlayer };
  state.landlord.players = normalizeLandlordPlayers(nextPlayers);
}

function removeLandlordPlayer(playerId) {
  state.landlord.players = normalizeLandlordPlayers(
    state.landlord.players.filter((player) => player.player_id !== playerId)
  );
}

function upsertLandlordLobbyRoom(room) {
  if (!room) {
    return;
  }
  const currentIndex = state.landlord.rooms.findIndex((item) => item.id === room.id);
  if (currentIndex === -1) {
    state.landlord.rooms = [room, ...state.landlord.rooms].sort(sortRoomsByUpdateTime);
  } else {
    const nextRooms = [...state.landlord.rooms];
    nextRooms[currentIndex] = { ...nextRooms[currentIndex], ...room };
    state.landlord.rooms = nextRooms.sort(sortRoomsByUpdateTime);
  }
  renderLandlordRoomList();
}

function removeLandlordLobbyRoom(roomId) {
  const nextRooms = state.landlord.rooms.filter((room) => room.id !== roomId);
  if (nextRooms.length === state.landlord.rooms.length) {
    return;
  }
  state.landlord.rooms = nextRooms;
  renderLandlordRoomList();
}

function adjustLandlordLobbyRoomPlayerCount(roomId, delta) {
  const currentIndex = state.landlord.rooms.findIndex((room) => room.id === roomId);
  if (currentIndex === -1) {
    return;
  }
  const nextRooms = [...state.landlord.rooms];
  const currentRoom = nextRooms[currentIndex];
  nextRooms[currentIndex] = {
    ...currentRoom,
    playerCount: Math.max(0, (currentRoom.playerCount || 0) + delta),
  };
  state.landlord.rooms = nextRooms.sort(sortRoomsByUpdateTime);
  renderLandlordRoomList();
}

function toLandlordLobbyRoom(room, playerCount = null) {
  if (!room) {
    return null;
  }
  const existing = state.landlord.rooms.find((item) => item.id === room.id);
  return {
    id: room.id,
    room_name: room.room_name,
    host_player_id: room.host_player_id,
    host_name: room.host_name,
    status: room.status,
    phase: room.phase,
    revision: room.revision,
    turn_player_id: room.turn_player_id,
    landlord_player_id: room.landlord_player_id,
    round_no: room.round_no,
    multiplier: room.multiplier,
    last_action_by: room.last_action_by,
    updated_at: room.updated_at,
    playerCount: playerCount ?? existing?.playerCount ?? 0,
  };
}

function startLandlordHeartbeat() {
  stopLandlordHeartbeat();
  state.landlord.heartbeatTimer = window.setInterval(async () => {
    if (!state.landlord.roomId) {
      return;
    }
    await supabase
      .from("landlord_players")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("room_id", state.landlord.roomId)
      .eq("player_id", state.playerId);
  }, 20000);
}

function stopLandlordHeartbeat() {
  if (state.landlord.heartbeatTimer) {
    clearInterval(state.landlord.heartbeatTimer);
    state.landlord.heartbeatTimer = null;
  }
}

async function leaveLandlordRoom() {
  if (!state.landlord.roomId) {
    return;
  }

  try {
    await removeSelfFromLandlordRoom();
  } catch (error) {
    console.error(error);
  } finally {
    state.landlord.roomId = null;
    state.landlord.room = null;
    state.landlord.players = [];
    state.landlord.selectedCards = [];
    stopLandlordHeartbeat();
    unsubscribeLandlordRoom();
    renderLandlordRoom();
    setConnectionStatus("已退出斗地主房间");
  }
}

async function removeSelfFromLandlordRoom() {
  const roomId = state.landlord.roomId;
  if (!roomId) {
    return;
  }

  const currentRoom = state.landlord.room;
  if (shouldPreserveLandlordSeat(currentRoom)) {
    await supabase
      .from("landlord_players")
      .update({
        last_seen_at: new Date().toISOString(),
        is_moving: false,
      })
      .eq("room_id", roomId)
      .eq("player_id", state.playerId);

    if (currentRoom) {
      await supabase
        .from("landlord_rooms")
        .update({
          last_action_by: `${state.playerName} 暂时离开了房间，可用同名继续返回`,
          revision: (currentRoom.revision || 1) + 1,
        })
        .eq("id", roomId)
        .eq("revision", currentRoom.revision);
    }
    return;
  }

  await supabase
    .from("landlord_players")
    .delete()
    .eq("room_id", roomId)
    .eq("player_id", state.playerId);

  const remainingPlayers = await fetchLandlordPlayers(roomId);
  if (remainingPlayers.length === 0) {
    await supabase.from("landlord_rooms").delete().eq("id", roomId);
    return;
  }

  if (currentRoom?.host_player_id === state.playerId) {
    const nextHost = normalizeLandlordPlayers(remainingPlayers)[0];
    if (nextHost) {
      await supabase
        .from("landlord_rooms")
        .update({
          host_player_id: nextHost.player_id,
          host_name: nextHost.player_name,
          room_name: `${nextHost.player_name} 的斗地主房间`,
          last_action_by: `${state.playerName} 退出后，房主变更为 ${nextHost.player_name}`,
          revision: (currentRoom.revision || 1) + 1,
        })
        .eq("id", roomId)
        .eq("revision", currentRoom.revision);
    }
  }
}


function shouldPreserveLandlordSeat(room) {
  return Boolean(room && ["call", "rob", "play", "finished"].includes(room.phase));
}

async function handleLandlordReadyToggle() {
  const room = state.landlord.room;
  const selfPlayer = getSelfLandlordPlayer();
  console.log("[landlord] handleLandlordReadyToggle invoked", {
    roomId: room?.id || null,
    phase: room?.phase || null,
    selfPlayerId: selfPlayer?.player_id || null,
    selfReady: selfPlayer?.is_ready ?? null,
  });
  if (!room || !selfPlayer || !["waiting", "finished"].includes(room.phase)) {
    console.warn("[landlord] ready toggle blocked by guard", {
      hasRoom: Boolean(room),
      hasSelfPlayer: Boolean(selfPlayer),
      phase: room?.phase || null,
    });
    return;
  }

  const { error } = await supabase
    .from("landlord_players")
    .update({ is_ready: !selfPlayer.is_ready, last_seen_at: new Date().toISOString() })
    .eq("room_id", room.id)
    .eq("player_id", state.playerId);

  if (error) {
    console.error(error);
    console.error("[landlord] ready toggle update failed", {
      roomId: room.id,
      playerId: state.playerId,
      nextReady: !selfPlayer.is_ready,
    });
    alert("切换准备状态失败。");
    return;
  }

  console.log("[landlord] ready toggle update succeeded", {
    roomId: room.id,
    playerId: state.playerId,
    nextReady: !selfPlayer.is_ready,
  });

  setConnectionStatus(!selfPlayer.is_ready ? "你已准备" : "已取消准备");
  await refreshLandlordRoom();
  await maybeAutoStartLandlordRound();
}

async function maybeAutoStartLandlordRound() {
  const room = state.landlord.room;
  const players = getLandlordOrderedPlayers();
  if (
    !room ||
    room.host_player_id !== state.playerId ||
    room.phase !== "waiting" && room.phase !== "finished" ||
    players.length !== 3 ||
    !players.every((player) => player.is_ready)
  ) {
    return;
  }

  await startLandlordRound(room, players);
}

async function startLandlordRound(room, players) {
  const orderedPlayers = normalizeLandlordPlayers(players).map((player, index) => ({
    ...player,
    seat_index: index + 1,
  }));
  const deck = buildShuffledDeck();
  const bottomCards = sortCards(deck.slice(-3));
  const playerHands = orderedPlayers.map((player, index) => ({
    ...player,
    hand_cards: sortCards(deck.slice(index * 17, index * 17 + 17)),
  }));
  const firstPlayer = playerHands[0];

  const playerUpdates = playerHands.map((player) =>
    supabase
      .from("landlord_players")
      .update({
        seat_index: player.seat_index,
        hand_cards: player.hand_cards,
        role: "farmer",
        is_ready: false,
        round_score_delta: 0,
      })
      .eq("room_id", room.id)
      .eq("player_id", player.player_id)
  );

  await Promise.all(playerUpdates);
  const nextRoom = await updateLandlordRoomWithGuard(room, {
    status: "active",
    phase: "call",
    round_no: (room.round_no || 0) + 1,
    multiplier: 1,
    current_call_score: 0,
    call_index: 0,
    play_index: 0,
    pass_streak: 0,
    ready_count: 0,
    current_bidding_player_id: firstPlayer.player_id,
    turn_player_id: firstPlayer.player_id,
    landlord_player_id: null,
    deck_state: deck,
    bottom_cards: bottomCards,
    last_play_cards: [],
    last_play_combo: null,
    last_play_player_id: null,
    settlement: null,
    bidding_anchor_player_id: null,
    rob_responses_count: 0,
    last_action_by: "三位玩家已准备，开始发牌并进入叫地主阶段",
  });

  if (nextRoom) {
    state.landlord.room = nextRoom;
    state.landlord.players = normalizeLandlordPlayers(playerHands);
    state.landlord.selectedCards = [];
    renderLandlordRoom();
  }
}

async function handleLandlordBidAction(action) {
  const room = state.landlord.room;
  if (!room || !["call", "rob"].includes(room.phase) || room.current_bidding_player_id !== state.playerId) {
    return;
  }

  const players = getLandlordOrderedPlayers();
  const nextPlayer = getNextLandlordPlayer(players, state.playerId);

  if (room.phase === "call") {
    if (action === "call") {
      if (players.length <= 1) {
        return;
      }

      if (!nextPlayer) {
        await finalizeLandlord(room, state.playerId, room.multiplier || 1);
        return;
      }

      const nextRoom = await updateLandlordRoomWithGuard(room, {
        phase: "rob",
        current_bidding_player_id: nextPlayer.player_id,
        turn_player_id: nextPlayer.player_id,
        landlord_player_id: state.playerId,
        bidding_anchor_player_id: state.playerId,
        rob_responses_count: 0,
        last_action_by: `${state.playerName} 叫地主，等待其他玩家抢地主`,
      });

      if (nextRoom) {
        state.landlord.room = nextRoom;
      }
      return;
    }

    if (room.call_index >= players.length - 1) {
      await restartLandlordRound(room, "这一轮没人叫地主，系统重新发牌");
      return;
    }

    const nextRoom = await updateLandlordRoomWithGuard(room, {
      call_index: (room.call_index || 0) + 1,
      current_bidding_player_id: nextPlayer.player_id,
      turn_player_id: nextPlayer.player_id,
      last_action_by: `${state.playerName} 选择不叫，轮到 ${nextPlayer.player_name}`,
    });
    if (nextRoom) {
      state.landlord.room = nextRoom;
    }
    return;
  }

  if (room.phase === "rob") {
    const baseMultiplier = room.multiplier || 1;
    const anchorPlayerId = room.bidding_anchor_player_id;
    const isAnchorFinalTurn =
      room.current_bidding_player_id === anchorPlayerId &&
      (room.rob_responses_count || 0) >= players.length - 1;
    const responses = (room.rob_responses_count || 0) + 1;
    const currentCandidateId = action === "rob" ? state.playerId : room.landlord_player_id;
    const currentCandidatePlayer = players.find((player) => player.player_id === currentCandidateId);
    const nextMultiplier = action === "rob" ? baseMultiplier * 2 : baseMultiplier;

    if (isAnchorFinalTurn) {
      await finalizeLandlord(
        room,
        currentCandidateId,
        nextMultiplier,
        action === "rob"
          ? `${state.playerName} 最后一轮选择抢地主，正式成为地主`
          : `${currentCandidatePlayer?.player_name || "玩家"} 成为地主，开始出牌`
      );
      return;
    }

    if (responses >= players.length - 1) {
      if (!anchorPlayerId || currentCandidateId === anchorPlayerId) {
        await finalizeLandlord(
          room,
          currentCandidateId,
          nextMultiplier,
          action === "rob"
            ? `${state.playerName} 抢地主成功，正式成为地主`
            : `${currentCandidatePlayer?.player_name || "玩家"} 成为地主，开始出牌`
        );
        return;
      }

      const anchorPlayer = players.find((player) => player.player_id === anchorPlayerId);
      const nextRoom = await updateLandlordRoomWithGuard(room, {
        multiplier: nextMultiplier,
        landlord_player_id: currentCandidateId,
        current_bidding_player_id: anchorPlayerId,
        turn_player_id: anchorPlayerId,
        rob_responses_count: responses,
        last_action_by:
          action === "rob"
            ? `${state.playerName} 选择抢地主，轮到 ${anchorPlayer?.player_name || "原叫地主玩家"} 最后决定`
            : `${state.playerName} 选择不抢，轮到 ${anchorPlayer?.player_name || "原叫地主玩家"} 最后决定`,
      });
      if (nextRoom) {
        state.landlord.room = nextRoom;
      }
      return;
    }

    const nextRobber = getNextLandlordPlayer(players, state.playerId, [
      anchorPlayerId,
    ]);

    const nextRoom = await updateLandlordRoomWithGuard(room, {
      multiplier: nextMultiplier,
      landlord_player_id: currentCandidateId,
      current_bidding_player_id: nextRobber?.player_id || anchorPlayerId,
      turn_player_id: nextRobber?.player_id || anchorPlayerId,
      rob_responses_count: responses,
      last_action_by:
        action === "rob"
          ? `${state.playerName} 选择抢地主`
          : `${state.playerName} 选择不抢，等待下一位玩家`,
    });
    if (nextRoom) {
      state.landlord.room = nextRoom;
    }
    return;
  }
}

async function finalizeLandlord(room, landlordPlayerId, multiplier, actionText = "") {
  const players = getLandlordOrderedPlayers();
  const landlordPlayer = players.find((player) => player.player_id === landlordPlayerId);
  if (!landlordPlayer) {
    return;
  }

  const updatedHand = sortCards([...(landlordPlayer.hand_cards || []), ...(room.bottom_cards || [])]);
  await Promise.all([
    ...players.map((player) =>
      supabase
        .from("landlord_players")
        .update({
          role: player.player_id === landlordPlayerId ? "landlord" : "farmer",
          hand_cards: player.player_id === landlordPlayerId ? updatedHand : player.hand_cards,
        })
        .eq("room_id", room.id)
        .eq("player_id", player.player_id)
    ),
  ]);

  const nextRoom = await updateLandlordRoomWithGuard(room, {
    phase: "play",
    turn_player_id: landlordPlayerId,
    current_bidding_player_id: null,
    landlord_player_id: landlordPlayerId,
    multiplier,
    last_action_by: actionText || `${landlordPlayer.player_name} 成为地主，开始出牌`,
  });

  if (nextRoom) {
    state.landlord.room = nextRoom;
    state.landlord.players = state.landlord.players.map((player) =>
      player.player_id === landlordPlayerId
        ? { ...player, role: "landlord", hand_cards: updatedHand }
        : { ...player, role: "farmer" }
    );
    renderLandlordRoom();
  }
}

async function restartLandlordRound(room, actionText) {
  const players = getLandlordOrderedPlayers();
  await Promise.all(
    players.map((player) =>
      supabase
        .from("landlord_players")
        .update({ is_ready: false, role: "farmer", hand_cards: [] })
        .eq("room_id", room.id)
        .eq("player_id", player.player_id)
    )
  );

  const nextRoom = await updateLandlordRoomWithGuard(room, {
    status: "waiting",
    phase: "waiting",
    current_bidding_player_id: null,
    turn_player_id: null,
    landlord_player_id: null,
    multiplier: 1,
    current_call_score: 0,
    call_index: 0,
    play_index: 0,
    pass_streak: 0,
    deck_state: [],
    bottom_cards: [],
    last_play_cards: [],
    last_play_combo: null,
    last_play_player_id: null,
    settlement: null,
    bidding_anchor_player_id: null,
    rob_responses_count: 0,
    last_action_by: actionText,
  });

  if (nextRoom) {
    state.landlord.room = nextRoom;
    state.landlord.players = state.landlord.players.map((player) => ({
      ...player,
      is_ready: false,
      role: "farmer",
      hand_cards: [],
    }));
    renderLandlordRoom();
  }
}

async function handleLandlordPlayCards() {
  const room = state.landlord.room;
  const selfPlayer = getSelfLandlordPlayer();
  if (!room || room.phase !== "play" || room.turn_player_id !== state.playerId || !selfPlayer) {
    return;
  }

  const selectedCards = sortCards(state.landlord.selectedCards);
  if (selectedCards.length === 0) {
    alert("请先选择要出的牌。");
    return;
  }

  const combo = evaluateCards(selectedCards);
  if (!combo) {
    alert("当前选择的牌型不合法。");
    return;
  }

  if (
    room.last_play_combo &&
    room.last_play_player_id !== state.playerId &&
    !canBeat(room.last_play_combo, combo)
  ) {
    alert("你选择的牌压不过上一手。");
    return;
  }

  const nextHand = removeCardsFromHand(selfPlayer.hand_cards || [], selectedCards);
  if (!nextHand) {
    alert("手牌同步有点乱了，请刷新后重试。");
    await refreshLandlordRoom();
    return;
  }

  if (nextHand.length === 0) {
    await supabase
      .from("landlord_players")
      .update({ hand_cards: [] })
      .eq("room_id", room.id)
      .eq("player_id", state.playerId);
    await finishLandlordRound(room, selfPlayer.role || "farmer", {
      cards: selectedCards,
      combo,
      playerId: state.playerId,
      playerName: state.playerName,
    });
    return;
  }

  await supabase
    .from("landlord_players")
    .update({ hand_cards: nextHand })
    .eq("room_id", room.id)
    .eq("player_id", state.playerId);

  const orderedPlayers = getLandlordOrderedPlayers();
  const currentIndex = orderedPlayers.findIndex((player) => player.player_id === state.playerId);
  const nextPlayer = orderedPlayers[(currentIndex + 1) % orderedPlayers.length];

  const nextRoom = await updateLandlordRoomWithGuard(room, {
    turn_player_id: nextPlayer.player_id,
    last_play_cards: selectedCards,
    last_play_combo: combo,
    last_play_player_id: state.playerId,
    pass_streak: 0,
    last_action_by: `${state.playerName} 打出了 ${combo.label}`,
  });

  if (nextRoom) {
    state.landlord.room = nextRoom;
    state.landlord.players = state.landlord.players.map((player) =>
      player.player_id === state.playerId ? { ...player, hand_cards: nextHand } : player
    );
    state.landlord.selectedCards = [];
    renderLandlordRoom();
  }
}

async function handleLandlordPassCards() {
  const room = state.landlord.room;
  if (
    !room ||
    room.phase !== "play" ||
    room.turn_player_id !== state.playerId ||
    !room.last_play_player_id ||
    room.last_play_player_id === state.playerId
  ) {
    return;
  }

  const orderedPlayers = getLandlordOrderedPlayers();
  const currentIndex = orderedPlayers.findIndex((player) => player.player_id === state.playerId);
  const nextPlayer = orderedPlayers[(currentIndex + 1) % orderedPlayers.length];
  const nextPassStreak = (room.pass_streak || 0) + 1;

  if (nextPassStreak >= orderedPlayers.length - 1) {
    const lastPlayer = orderedPlayers.find((player) => player.player_id === room.last_play_player_id);
    const nextRoom = await updateLandlordRoomWithGuard(room, {
      turn_player_id: room.last_play_player_id,
      last_play_cards: [],
      last_play_combo: null,
      last_play_player_id: null,
      pass_streak: 0,
      last_action_by: `${state.playerName} 选择不出，${lastPlayer?.player_name || "上一位玩家"} 重新起手`,
    });
    if (nextRoom) {
      state.landlord.room = nextRoom;
      state.landlord.selectedCards = [];
      renderLandlordRoom();
    }
    return;
  }

  const nextRoom = await updateLandlordRoomWithGuard(room, {
    turn_player_id: nextPlayer.player_id,
    pass_streak: nextPassStreak,
    last_action_by: `${state.playerName} 选择不出`,
  });

  if (nextRoom) {
    state.landlord.room = nextRoom;
    state.landlord.selectedCards = [];
    renderLandlordRoom();
  }
}

async function finishLandlordRound(room, winnerRole, lastPlay = null) {
  const players = getLandlordOrderedPlayers();
  const multiplier = room.multiplier || 1;
  const settlement = {
    round_no: room.round_no,
    winner_role: winnerRole,
    multiplier,
    deltas: {},
  };

  if (winnerRole === "landlord") {
    for (const player of players) {
      settlement.deltas[player.player_id] = player.role === "landlord" ? multiplier * 2 : -multiplier;
    }
  } else {
    for (const player of players) {
      settlement.deltas[player.player_id] = player.role === "landlord" ? -multiplier * 2 : multiplier;
    }
  }

  await Promise.all(
    players.map((player) =>
      supabase
        .from("landlord_players")
        .update({
          round_score_delta: settlement.deltas[player.player_id],
          is_ready: false,
        })
        .eq("room_id", room.id)
        .eq("player_id", player.player_id)
    )
  );

  const actionText =
    winnerRole === "landlord" ? "地主率先出完所有手牌，赢下这一局" : "农民一方率先出完手牌，赢下这一局";
  const nextRoom = await updateLandlordRoomWithGuard(room, {
    status: "finished",
    phase: "finished",
    turn_player_id: null,
    current_bidding_player_id: null,
    settlement,
    last_play_cards: lastPlay?.cards || room.last_play_cards || [],
    last_play_combo: lastPlay?.combo || room.last_play_combo || null,
    last_play_player_id: lastPlay?.playerId || room.last_play_player_id || null,
    last_action_by: actionText,
  });

  if (nextRoom) {
    state.landlord.room = nextRoom;
    if (lastPlay?.playerId) {
      state.landlord.players = state.landlord.players.map((player) =>
        player.player_id === lastPlay.playerId ? { ...player, hand_cards: [] } : player
      );
      state.landlord.selectedCards = [];
    }
    reconcileLandlordSettlement(nextRoom);
    renderLandlordRoom();
  }
}

function reconcileLandlordSettlement(room) {
  const settlement = room?.settlement;
  if (!settlement || !room?.id) {
    return;
  }
  const roundKey = `${room.id}:${settlement.round_no}`;
  if (state.landlord.settledRounds[roundKey]) {
    return;
  }
  const delta = Number(settlement.deltas?.[state.playerId] || 0);
  state.landlordScore += delta;
  state.landlord.settledRounds[roundKey] = true;
  localStorage.setItem(STORAGE_KEYS.landlordScore, String(state.landlordScore));
  localStorage.setItem(
    STORAGE_KEYS.landlordSettledRounds,
    JSON.stringify(state.landlord.settledRounds)
  );
  renderLandlordScore();
  syncLocalLandlordScoreSnapshot().catch(console.error);
}

async function updateLandlordRoomWithGuard(room, patch) {
  const { data, error } = await supabase
    .from("landlord_rooms")
    .update({
      ...patch,
      revision: (room.revision || 1) + 1,
    })
    .eq("id", room.id)
    .eq("revision", room.revision)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    await refreshLandlordRoom();
    return null;
  }

  return hydrateLandlordRoom(data);
}
