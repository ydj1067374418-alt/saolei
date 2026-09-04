import { sortCards } from "./landlord-logic.js";

const BUTTON_WIDTH = 132;
const BUTTON_HEIGHT = 50;
const BUTTON_GAP = 14;
const CARD_WIDTH = 82;
const CARD_HEIGHT = 116;
const CARD_LIFT = 26;
const HEADER_WIDTH = 392;

export class LandlordHudCanvas {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.options = options;
    this.ctx = canvas.getContext("2d");
    this.snapshot = null;
    this.width = 0;
    this.height = 0;
    this.disposed = false;
    this.hitRegions = {
      leave: null,
      actions: [],
      cards: [],
    };
    this.pointer = {
      hover: null,
      viewDragging: false,
      cardDrag: null,
    };
  }

  init() {
    this.onResize = () => {
      this.resize();
      this.render();
    };

    this.onPointerDown = (event) => {
      const point = this.getPoint(event);
      const hit = this.findHit(point.x, point.y);

      if (event.button === 2) {
        if (!hit) {
          this.pointer.viewDragging = true;
          this.options.onViewDragStart?.(event.clientX, event.clientY);
        }
        event.preventDefault();
        return;
      }

      if (event.button !== 0) {
        return;
      }

      if (!hit) {
        return;
      }

      event.preventDefault();

      if (hit.type === "leave") {
        this.options.onLeaveRoom?.();
        return;
      }

      if (hit.type === "action") {
        this.invokeAction(hit.name);
        return;
      }

      if (hit.type === "card") {
        const selected = new Set(this.snapshot?.selectedCards || []);
        this.pointer.cardDrag = {
          anchor: hit.index,
          current: hit.index,
          baseSelection: selected,
          mode: selected.has(hit.card) ? "remove" : "add",
          moved: false,
          cards: [...(this.getSelfPlayer()?.hand_cards || [])],
        };
      }
    };

    this.onPointerMove = (event) => {
      const point = this.getPoint(event);

      if (this.pointer.viewDragging) {
        this.options.onViewDragMove?.(event.clientX, event.clientY);
        this.canvas.style.cursor = "grabbing";
        return;
      }

      if (this.pointer.cardDrag) {
        const hit = this.findHit(point.x, point.y);
        if (hit?.type === "card") {
          if (this.pointer.cardDrag.current !== hit.index) {
            this.pointer.cardDrag.current = hit.index;
            this.pointer.cardDrag.moved = true;
            this.applyDragSelection();
          }
          this.canvas.style.cursor = "pointer";
          return;
        }
      }

      this.pointer.hover = this.findHit(point.x, point.y);
      this.canvas.style.cursor = this.pointer.hover ? "pointer" : "default";
    };

    this.onPointerUp = (event) => {
      if (event.button === 2 && this.pointer.viewDragging) {
        this.pointer.viewDragging = false;
        this.options.onViewDragEnd?.();
        this.canvas.style.cursor = "default";
        return;
      }

      if (event.button !== 0 || !this.pointer.cardDrag) {
        return;
      }

      if (!this.pointer.cardDrag.moved) {
        const card = this.pointer.cardDrag.cards[this.pointer.cardDrag.anchor];
        this.toggleSingleCard(card);
      }

      this.pointer.cardDrag = null;
      this.canvas.style.cursor = "default";
    };

    this.onContextMenu = (event) => {
      event.preventDefault();
    };

    window.addEventListener("resize", this.onResize);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);

    this.resize();
    this.render();
  }

  update(snapshot) {
    this.snapshot = snapshot;
    this.resize();
    this.render();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(this.canvas.clientWidth));
    const height = Math.max(1, Math.round(this.canvas.clientHeight));
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);

    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = width;
    this.height = height;
  }

  render() {
    if (!this.ctx || !this.width || !this.height) {
      return;
    }

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.hitRegions = { leave: null, actions: [], cards: [] };

    if (!this.snapshot?.room) {
      return;
    }

    this.drawHeader();
    this.drawStatusPanel();
    this.drawBottomCards();
    this.drawTableCards();
    this.drawActionButtons();
    this.drawHandCards();
    this.drawResultBanner();
  }

  drawHeader() {
    const room = this.snapshot.room;
    const x = 20;
    const y = 18;
    const width = Math.min(HEADER_WIDTH, this.width - 40);
    const height = 124;

    drawGlassPanel(this.ctx, x, y, width, height, 22);

    this.ctx.fillStyle = "#7e8f86";
    this.ctx.font = "12px Segoe UI";
    this.ctx.fillText("斗地主房间", x + 18, y + 26);

    this.ctx.fillStyle = "#574f49";
    this.ctx.font = "bold 26px Segoe UI";
    this.ctx.fillText(room.room_name || "房间", x + 18, y + 58);

    this.ctx.fillStyle = "#8f8278";
    this.ctx.font = "14px Segoe UI";
    wrapText(
      this.ctx,
      "W/A/S/D 移动，右键在空白区域拖动视角，左键点按钮或拖选你自己的手牌。",
      x + 18,
      y + 84,
      width - 160,
      18
    );

    const leaveRect = { x: x + width - 126, y: y + 18, width: 106, height: 38 };
    drawActionButton(this.ctx, leaveRect, "离开房间", {
      palette: "warning",
      hover: this.pointer.hover?.type === "leave",
    });
    this.hitRegions.leave = leaveRect;
  }

  drawStatusPanel() {
    const room = this.snapshot.room;
    const x = this.width - 300;
    const y = 18;
    const width = 280;
    const height = 164;
    const selfPlayer = this.getSelfPlayer();
    const turnPlayer = this.snapshot.players.find((player) => player.player_id === room.turn_player_id);
    const phaseMap = {
      waiting: "等待凑齐并准备",
      call: "叫地主中",
      rob: "抢地主中",
      play: "出牌中",
      finished: "本局结算",
    };

    drawGlassPanel(this.ctx, x, y, width, height, 22);

    this.ctx.fillStyle = "#7e8f86";
    this.ctx.font = "12px Segoe UI";
    this.ctx.fillText("本局状态", x + 18, y + 26);

    this.ctx.fillStyle = "#574f49";
    this.ctx.font = "bold 20px Segoe UI";
    this.ctx.fillText(phaseMap[room.phase] || room.phase, x + 18, y + 58);

    this.ctx.fillStyle = "#8f8278";
    this.ctx.font = "14px Segoe UI";
    this.ctx.fillText(`人数 ${this.snapshot.players.length}/3`, x + 18, y + 88);
    this.ctx.fillText(`倍数 ${room.multiplier || 1}`, x + 118, y + 88);
    this.ctx.fillText(`轮到 ${turnPlayer ? getPlayerLabel(turnPlayer, this.snapshot.selfId) : "系统"}`, x + 18, y + 114);

    const prompt = buildPrompt(room, selfPlayer, this.snapshot.selfId);
    wrapText(this.ctx, prompt, x + 18, y + 140, width - 36, 18);
  }

  drawSeatPanel() {
    const players = this.snapshot.players || [];
    if (!players.length) {
      return;
    }

    const width = 238;
    const cardHeight = 62;
    const gap = 10;
    const height = 26 + players.length * cardHeight + Math.max(0, players.length - 1) * gap + 18;
    const x = 20;
    const y = Math.min(this.height - 360, 162);

    drawGlassPanel(this.ctx, x, y, width, height, 20);
    this.ctx.fillStyle = "#7e8f86";
    this.ctx.font = "12px Segoe UI";
    this.ctx.fillText("房间玩家", x + 16, y + 24);

    players.forEach((player, index) => {
      const cardY = y + 34 + index * (cardHeight + gap);
      const isSelf = player.player_id === this.snapshot.selfId;
      const isLandlord = this.snapshot.room.landlord_player_id === player.player_id;
      drawPlayerRow(this.ctx, {
        x: x + 12,
        y: cardY,
        width: width - 24,
        height: cardHeight,
      }, {
        name: `${player.player_name}${isSelf ? "（你）" : ""}`,
        ready: player.is_ready,
        cards: (player.hand_cards || []).length,
        seat: player.seat_index,
        landlord: isLandlord,
        color: player.player_color,
      });
    });
  }

  drawTableCards() {
    const room = this.snapshot.room;
    const cards = room.last_play_cards || [];
    const label = getLastPlayText(room, this.snapshot.players);
    const boxWidth = Math.min(this.width * 0.58, 720);
    const boxX = (this.width - boxWidth) / 2;
    const boxY = 164;
    const boxHeight = cards.length ? 176 : 84;

    drawGlassPanel(this.ctx, boxX, boxY, boxWidth, boxHeight, 22, 0.72);
    this.ctx.fillStyle = "#7e8f86";
    this.ctx.font = "12px Segoe UI";
    this.ctx.textAlign = "center";
    this.ctx.fillText("桌面出牌", this.width / 2, boxY + 24);
    this.ctx.fillStyle = "#574f49";
    this.ctx.font = "bold 16px Segoe UI";
    this.ctx.fillText(label, this.width / 2, boxY + 50);

    if (!cards.length) {
      this.ctx.fillStyle = "#8f8278";
      this.ctx.font = "14px Segoe UI";
      this.ctx.fillText("这一手还没有人出牌", this.width / 2, boxY + 74);
      this.ctx.textAlign = "left";
      return;
    }

    const spread = getCardSpread(cards.length, boxWidth - 100, 44);
    const totalWidth = CARD_WIDTH + Math.max(0, cards.length - 1) * spread;
    const startX = this.width / 2 - totalWidth / 2;
    const y = boxY + 68;

    cards.forEach((card, index) => {
      drawCardFace(this.ctx, card, {
        x: startX + index * spread,
        y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        selected: false,
        highlight: true,
      });
    });
    this.ctx.textAlign = "left";
  }

  drawBottomCards() {
    const room = this.snapshot.room;
    const cards = shouldRevealBottomCards(room) ? room.bottom_cards || [] : [];
    if (!cards.length) {
      return;
    }

    const spread = 26;
    const miniWidth = 62;
    const miniHeight = 88;
    const totalWidth = miniWidth + Math.max(0, cards.length - 1) * spread;
    const panelWidth = Math.max(160, totalWidth + 34);
    const panelHeight = miniHeight + 42;
    const x = this.width / 2 - panelWidth / 2;
    const y = 18;

    drawGlassPanel(this.ctx, x, y, panelWidth, panelHeight, 18, 0.78);
    this.ctx.fillStyle = "#7e8f86";
    this.ctx.font = "12px Segoe UI";
    this.ctx.textAlign = "center";
    this.ctx.fillText("底牌", this.width / 2, y + 20);

    const startX = this.width / 2 - totalWidth / 2;
    const cardY = y + 28;

    cards.forEach((card, index) => {
      drawCardFace(this.ctx, card, {
        x: startX + index * spread,
        y: cardY,
        width: miniWidth,
        height: miniHeight,
        selected: false,
        mini: true,
      });
    });
    this.ctx.textAlign = "left";
  }

  drawActionButtons() {
    const buttons = getVisibleButtons(this.snapshot.room, this.getSelfPlayer(), this.snapshot.selfId);
    if (!buttons.length) {
      return;
    }

    const totalWidth = buttons.length * BUTTON_WIDTH + (buttons.length - 1) * BUTTON_GAP;
    const startX = (this.width - totalWidth) / 2;
    const y = this.height - 214;

    buttons.forEach((button, index) => {
      const rect = {
        x: startX + index * (BUTTON_WIDTH + BUTTON_GAP),
        y,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
      };
      drawActionButton(this.ctx, rect, button.label, {
        palette: button.name === "play" ? "primary" : button.name.startsWith("pass") ? "muted" : "gold",
        hover: this.pointer.hover?.type === "action" && this.pointer.hover?.name === button.name,
      });
      this.hitRegions.actions.push({ ...button, rect });
    });

    const selectedCount = (this.snapshot.selectedCards || []).length;
    this.ctx.fillStyle = "#7f7771";
    this.ctx.font = "14px Segoe UI";
    this.ctx.textAlign = "center";
    this.ctx.fillText(`已选择 ${selectedCount} 张`, this.width / 2, y - 14);
    this.ctx.textAlign = "left";
  }

  drawHandCards() {
    const selfPlayer = this.getSelfPlayer();
    const cards = selfPlayer?.hand_cards || [];
    if (!cards.length) {
      return;
    }

    const spread = getCardSpread(cards.length, this.width - 160, 40);
    const totalWidth = CARD_WIDTH + Math.max(0, cards.length - 1) * spread;
    const startX = (this.width - totalWidth) / 2;
    const baseY = this.height - CARD_HEIGHT - 22;
    const selected = new Set(this.snapshot.selectedCards || []);

    drawHandGlow(this.ctx, this.width / 2, this.height - 20, Math.min(this.width * 0.66, 760), 168);

    cards.forEach((card, index) => {
      const isSelected = selected.has(card);
      const rect = {
        x: startX + index * spread,
        y: baseY - (isSelected ? CARD_LIFT : 0),
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      };
      drawCardFace(this.ctx, card, {
        ...rect,
        selected: isSelected,
        hover: this.pointer.hover?.type === "card" && this.pointer.hover?.index === index,
      });
      this.hitRegions.cards.push({ type: "card", card, index, rect });
    });
  }

  drawResultBanner() {
    const room = this.snapshot.room;
    if (room.phase !== "finished" || !room.settlement) {
      return;
    }

    const winnerSide = room.settlement.winner_role === "landlord" ? "地主" : "农民";
    const rect = {
      x: this.width / 2 - 220,
      y: 92,
      width: 440,
      height: 54,
    };
    drawActionButton(this.ctx, rect, `${winnerSide}方获胜，倍数 ${room.multiplier || 1}`, {
      palette: room.settlement.winner_role === "landlord" ? "gold" : "primary",
      hover: false,
      fontSize: 20,
    });
  }

  applyDragSelection() {
    const drag = this.pointer.cardDrag;
    if (!drag) {
      return;
    }

    const start = Math.min(drag.anchor, drag.current);
    const end = Math.max(drag.anchor, drag.current);
    const rangeCards = drag.cards.slice(start, end + 1);
    const next = new Set(drag.baseSelection);

    if (drag.mode === "add") {
      rangeCards.forEach((card) => next.add(card));
    } else {
      rangeCards.forEach((card) => next.delete(card));
    }

    this.options.onSelectionChange?.(sortCards([...next]));
  }

  toggleSingleCard(card) {
    const current = new Set(this.snapshot?.selectedCards || []);
    if (current.has(card)) {
      current.delete(card);
    } else {
      current.add(card);
    }
    this.options.onSelectionChange?.(sortCards([...current]));
  }

  invokeAction(name) {
    const actions = {
      ready: () => this.options.onReadyToggle?.(),
      call: () => this.options.onBidAction?.("call"),
      passCall: () => this.options.onBidAction?.("pass_call"),
      rob: () => this.options.onBidAction?.("rob"),
      passRob: () => this.options.onBidAction?.("pass_rob"),
      play: () => this.options.onPlay?.(),
      pass: () => this.options.onPass?.(),
      clear: () => this.options.onSelectionChange?.([]),
    };
    actions[name]?.();
  }

  getSelfPlayer() {
    return this.snapshot?.players?.find((player) => player.player_id === this.snapshot.selfId) || null;
  }

  findHit(x, y) {
    if (this.hitRegions.leave && pointInRect(x, y, this.hitRegions.leave)) {
      return { type: "leave" };
    }

    for (const action of this.hitRegions.actions) {
      if (pointInRect(x, y, action.rect)) {
        return { type: "action", name: action.name };
      }
    }

    for (let index = this.hitRegions.cards.length - 1; index >= 0; index -= 1) {
      const card = this.hitRegions.cards[index];
      if (pointInRect(x, y, card.rect)) {
        return card;
      }
    }

    return null;
  }

  getPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }
}

function getVisibleButtons(room, selfPlayer, selfId) {
  if (!room || !selfPlayer) {
    return [];
  }

  if (room.phase === "waiting" || room.phase === "finished") {
    return [{ name: "ready", label: selfPlayer.is_ready ? "取消准备" : "准备" }];
  }

  if (room.phase === "call" && room.current_bidding_player_id === selfId) {
    return [
      { name: "call", label: "叫地主" },
      { name: "passCall", label: "不叫" },
    ];
  }

  if (room.phase === "rob" && room.current_bidding_player_id === selfId) {
    return [
      { name: "rob", label: "抢地主" },
      { name: "passRob", label: "不抢" },
    ];
  }

  if (room.phase === "play" && room.turn_player_id === selfId) {
    const buttons = [
      { name: "play", label: "出牌" },
      { name: "clear", label: "清空" },
    ];
    if (room.last_play_player_id && room.last_play_player_id !== selfId) {
      buttons.push({ name: "pass", label: "不出" });
    }
    return buttons;
  }

  return [];
}

function buildPrompt(room, selfPlayer, selfId) {
  if (!room || !selfPlayer) {
    return "请选择房间并准备";
  }
  if (room.phase === "waiting") {
    return selfPlayer.is_ready ? "你已经准备，等 3 个人都准备后自动开局。" : "点击准备，等 3 个人凑齐后自动发牌。";
  }
  if (room.phase === "call") {
    return room.current_bidding_player_id === selfId ? "现在轮到你决定叫不叫地主。" : "正在等别人决定叫不叫地主。";
  }
  if (room.phase === "rob") {
    return room.current_bidding_player_id === selfId ? "现在轮到你决定抢不抢地主。" : "正在等别人抢地主。";
  }
  if (room.phase === "play") {
    return room.turn_player_id === selfId ? "拖动连选手牌后点击“出牌”。" : "等待别人出牌，你可以先移动到桌边观察。";
  }
  return "本局已经结算，点准备就能继续下一局。";
}

function getLastPlayText(room, players) {
  if (!room?.last_play_cards?.length) {
    return "桌面暂时还没有新牌";
  }
  const player = players.find((item) => item.player_id === room.last_play_player_id);
  const combo = room.last_play_combo?.label || "出牌";
  return `${player?.player_name || "玩家"} ${combo}`;
}

function shouldRevealBottomCards(room) {
  return Boolean(room && ["play", "finished"].includes(room.phase) && room.landlord_player_id);
}

function getPlayerLabel(player, selfId) {
  return player.player_id === selfId ? "你" : player.player_name;
}

function getCardSpread(count, availableWidth, maxSpread) {
  if (count <= 1) {
    return maxSpread;
  }
  return Math.min(maxSpread, (availableWidth - CARD_WIDTH) / (count - 1));
}

function drawGlassPanel(ctx, x, y, width, height, radius, alpha = 0.84) {
  ctx.save();
  roundedRect(ctx, x, y, width, height, radius);
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, `rgba(255, 251, 247, ${alpha})`);
  gradient.addColorStop(1, `rgba(246, 238, 231, ${alpha - 0.08})`);
  ctx.fillStyle = gradient;
  ctx.shadowColor = "rgba(68, 54, 43, 0.08)";
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(148, 132, 118, 0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawActionButton(ctx, rect, label, options = {}) {
  const palette = getButtonPalette(options.palette || "gold", options.hover);
  ctx.save();
  roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 18);
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  gradient.addColorStop(0, palette.top);
  gradient.addColorStop(1, palette.bottom);
  ctx.fillStyle = gradient;
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = options.hover ? 16 : 10;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = palette.text;
  ctx.font = `bold ${options.fontSize || 18}px Segoe UI`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1);
  ctx.restore();
}

function drawPlayerRow(ctx, rect, player) {
  ctx.save();
  roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 16);
  ctx.fillStyle = "rgba(255, 248, 243, 0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(152, 132, 112, 0.14)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(rect.x + 22, rect.y + rect.height / 2, 12, 0, Math.PI * 2);
  ctx.fillStyle = player.color || "#8fb6ae";
  ctx.fill();

  ctx.fillStyle = "#fffaf7";
  ctx.font = "bold 12px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((player.name || "?").slice(0, 1), rect.x + 22, rect.y + rect.height / 2 + 1);

  ctx.textAlign = "left";
  ctx.fillStyle = "#574f49";
  ctx.font = "bold 14px Segoe UI";
  ctx.fillText(player.name, rect.x + 42, rect.y + 22);

  ctx.fillStyle = "#8f8278";
  ctx.font = "13px Segoe UI";
  ctx.fillText(`座位 ${player.seat}`, rect.x + 42, rect.y + 42);
  ctx.fillText(`手牌 ${player.cards}`, rect.x + 100, rect.y + 42);

  drawMiniPill(ctx, rect.x + rect.width - 78, rect.y + 10, 64, 18, player.ready ? "已准备" : "未准备", player.ready ? "#6e8d72" : "#93877d");
  if (player.landlord) {
    drawMiniPill(ctx, rect.x + rect.width - 66, rect.y + 34, 52, 18, "地主", "#a97843");
  }

  ctx.restore();
}

function drawMiniPill(ctx, x, y, width, height, label, textColor) {
  roundedRect(ctx, x, y, width, height, 999);
  ctx.fillStyle = "rgba(241, 232, 223, 0.92)";
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.font = "12px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + width / 2, y + height / 2 + 0.5);
}

function drawHandGlow(ctx, centerX, bottomY, width, height) {
  const gradient = ctx.createRadialGradient(centerX, bottomY - 18, 24, centerX, bottomY - 18, width / 2);
  gradient.addColorStop(0, "rgba(255, 248, 241, 0.6)");
  gradient.addColorStop(1, "rgba(255, 248, 241, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(centerX - width / 2, bottomY - height, width, height);
}

function drawCardFace(ctx, card, config) {
  const palette = getCardPalette(card);
  const radius = config.mini ? 10 : 12;
  const width = config.width;
  const height = config.height;

  ctx.save();
  roundedRect(ctx, config.x, config.y, width, height, radius);
  const gradient = ctx.createLinearGradient(config.x, config.y, config.x, config.y + height);
  gradient.addColorStop(0, config.highlight ? "#fffefb" : palette.top);
  gradient.addColorStop(1, palette.bottom);
  ctx.fillStyle = gradient;
  ctx.shadowColor = config.selected ? "rgba(164, 121, 68, 0.36)" : "rgba(76, 56, 42, 0.16)";
  ctx.shadowBlur = config.selected ? 18 : 10;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = config.selected ? "#b98346" : config.hover ? "#9a7c5a" : "rgba(152, 132, 112, 0.2)";
  ctx.lineWidth = config.selected ? 2.2 : 1.2;
  ctx.stroke();

  if (palette.banner) {
    roundedRect(ctx, config.x + 10, config.y + 10, width - 20, config.mini ? 18 : 24, 12);
    ctx.fillStyle = palette.banner;
    ctx.fill();
  }

  const rankSize = config.mini ? 18 : 24;
  const suitSize = config.mini ? 14 : 18;
  const centerSize = palette.isJoker ? (config.mini ? 20 : 24) : config.mini ? 26 : 36;

  ctx.fillStyle = palette.accent;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `bold ${rankSize}px Segoe UI`;
  ctx.fillText(palette.rankText, config.x + 10, config.y + 8);

  if (palette.suitText) {
    ctx.font = `${suitSize}px Segoe UI Symbol`;
    ctx.fillText(palette.suitText, config.x + 10, config.y + 32);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${centerSize}px ${palette.isJoker ? "Segoe UI" : "Segoe UI Symbol"}`;
  ctx.fillText(palette.centerText, config.x + width / 2, config.y + height / 2 + 10);

  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.font = `bold ${config.mini ? 16 : 20}px Segoe UI`;
  ctx.fillText(palette.rankText, config.x + width - 10, config.y + height - 10);
  ctx.restore();
}

function getCardPalette(card) {
  if (card === "BJ") {
    return {
      top: "#fff8fb",
      bottom: "#f5dde2",
      accent: "#4a4046",
      rankText: "J",
      suitText: "",
      centerText: "小王",
      isJoker: true,
      banner: "rgba(233, 202, 210, 0.86)",
    };
  }
  if (card === "RJ") {
    return {
      top: "#fff8fb",
      bottom: "#f3d5dc",
      accent: "#9a4759",
      rankText: "J",
      suitText: "",
      centerText: "大王",
      isJoker: true,
      banner: "rgba(240, 194, 205, 0.92)",
    };
  }

  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  const red = suit === "H" || suit === "D";
  const suitMap = {
    S: "♠",
    H: "♥",
    C: "♣",
    D: "♦",
  };

  return {
    top: "#fffefd",
    bottom: red ? "#fff6f4" : "#fffdfa",
    accent: red ? "#cc5b66" : "#3f4a57",
    rankText: rank,
    suitText: suitMap[suit] || "",
    centerText: suitMap[suit] || rank,
    isJoker: false,
    banner: null,
  };
}

function getButtonPalette(type, hover) {
  const palettes = {
    primary: {
      top: hover ? "#88b8ad" : "#7ba99f",
      bottom: hover ? "#5e8c84" : "#537b74",
      text: "#fffaf7",
      stroke: "rgba(76, 111, 104, 0.72)",
      shadow: "rgba(70, 108, 100, 0.26)",
    },
    warning: {
      top: hover ? "#cfa17d" : "#c18f67",
      bottom: hover ? "#a8744f" : "#986544",
      text: "#fffaf7",
      stroke: "rgba(143, 94, 59, 0.72)",
      shadow: "rgba(120, 80, 46, 0.2)",
    },
    muted: {
      top: hover ? "#d8cfc6" : "#d0c5ba",
      bottom: hover ? "#b9aa9a" : "#ae9f90",
      text: "#564f49",
      stroke: "rgba(135, 118, 103, 0.46)",
      shadow: "rgba(95, 80, 66, 0.14)",
    },
    gold: {
      top: hover ? "#e1bf85" : "#d6b073",
      bottom: hover ? "#bc8d48" : "#ae7c3e",
      text: "#fffaf7",
      stroke: "rgba(146, 103, 42, 0.62)",
      shadow: "rgba(122, 85, 32, 0.18)",
    },
  };

  return palettes[type] || palettes.gold;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = text.split("");
  let line = "";
  let row = 0;

  chars.forEach((char) => {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + row * lineHeight);
      line = char;
      row += 1;
      return;
    }
    line = test;
  });

  if (line) {
    ctx.fillText(line, x, y + row * lineHeight);
  }
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
