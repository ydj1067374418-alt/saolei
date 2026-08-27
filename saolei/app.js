import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const STORAGE_KEYS = {
  playerId: "saolei-player-id",
  playerName: "saolei-player-name",
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

const state = {
  playerId: "",
  playerName: "",
  playerColor: "",
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
};

const refs = {
  currentPlayerName: document.getElementById("currentPlayerName"),
  roomNamePreview: document.getElementById("roomNamePreview"),
  connectionBadge: document.getElementById("connectionBadge"),
  renameButton: document.getElementById("renameButton"),
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
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 10 } },
});

boot();

async function boot() {
  bindEvents();
  restoreIdentity();
  renderIdentity();
  syncConfigSummary();
  setConnectionStatus("已连接到联机服务");

  try {
    await cleanupStalePresence();
    await loadRooms();
    subscribeLobby();
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

  state.cleanupTimer = window.setInterval(() => {
    cleanupStalePresence().catch(console.error);
  }, 30000);
}

function bindEvents() {
  refs.renameButton.addEventListener("click", () => {
    refs.nameInput.value = state.playerName;
    openNameModal();
  });

  refs.saveNameButton.addEventListener("click", handleSaveName);
  refs.nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleSaveName();
    }
  });

  refs.createRoomButton.addEventListener("click", handleCreateRoom);
  refs.refreshRoomsButton.addEventListener("click", () => loadRooms(true));
  refs.leaveRoomButton.addEventListener("click", () => leaveCurrentRoom());

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
  });

  window.addEventListener("beforeunload", () => {
    if (state.roomId) {
      removeSelfFromRoom().catch(() => {});
    }
  });
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

function renderIdentity() {
  refs.currentPlayerName.textContent = state.playerName || "未设置";
  refs.roomNamePreview.textContent = state.playerName
    ? `${state.playerName} 的房间`
    : "请先输入昵称";
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

  await supabase.from("minesweeper_players").delete().lt("last_seen_at", staleBefore);

  const [{ data: rooms, error: roomsError }, { data: players, error: playersError }] =
    await Promise.all([
      supabase.from("minesweeper_rooms").select("id,status"),
      supabase.from("minesweeper_players").select("room_id"),
    ]);

  if (roomsError) {
    throw roomsError;
  }
  if (playersError) {
    throw playersError;
  }

  const roomIdsWithPlayers = new Set((players || []).map((player) => player.room_id));
  const emptyRoomIds = (rooms || [])
    .filter((room) => !roomIdsWithPlayers.has(room.id))
    .map((room) => room.id);

  if (emptyRoomIds.length > 0) {
    await supabase.from("minesweeper_rooms").delete().in("id", emptyRoomIds);
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
