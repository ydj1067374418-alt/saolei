// pages/index/index.js
Page({
  data: {
    player: {
      level: 1,
      exp: 0,
      nextExp: 100,
      hp: 150,
      maxHp: 150,
      mp: 50,
      maxMp: 50,
      attack: 22,
      defense: 12,
      hpPercent: 100,
      expPercent: 0
    },
    monster: null,
    tower: {
      floor: 1,
      progress: 0,
      needKills: 3,
      progressPercent: 0,
      isBossFight: false
    },
    equippedSkills: [],      // 当前装备的技能对象数组
    ownedSkills: [],         // 所有已拥有的技能（带equipped标记）
    logs: [],
    autoBattle: false,
    showLogModal: false,
    showSkillModal: false,
    logScrollTop: 99999,
    autoScrollLog: true,     // 是否自动滚动日志
    lastEvent: ''
  },

  timer: null,
  isActing: false,
  skillLibrary: [            // 预设技能库，击败怪物可掉落
    { id: 1, name: '重击', cost: 10, desc: '200%攻击伤害', type: 'damage', value: 2.0 },
    { id: 2, name: '治愈术', cost: 15, desc: '恢复30%生命', type: 'heal', value: 0.3 },
    { id: 3, name: '护盾', cost: 12, desc: '吸收100伤害', type: 'shield', value: 100 },
    { id: 4, name: '狂暴', cost: 20, desc: '攻击+50%持续3回合', type: 'buff', value: 1.5, duration: 3 },
    { id: 5, name: '连击', cost: 18, desc: '150%伤害两次', type: 'multi', value: 1.5, hits: 2 },
    { id: 6, name: '雷击', cost: 14, desc: '130%伤害+麻痹', type: 'damage', value: 1.3 },
    { id: 7, name: '生命绽放', cost: 12, desc: '恢复20%生命+小护盾', type: 'heal', value: 0.2 }
  ],

  onLoad() {
    this.initGame();
  },

  onUnload() {
    this.stopAutoBattle();
  },

  initGame() {
    // 初始拥有技能：重击、治愈术、护盾
    const owned = this.skillLibrary.filter(s => [1,2,3].includes(s.id)).map(s => ({ ...s, equipped: false }));
    // 默认装备前三个
    owned.forEach(s => { if ([1,2,3].includes(s.id)) s.equipped = true; });
    const equipped = owned.filter(s => s.equipped);
    this.setData({
      player: {
        level: 1, exp: 0, nextExp: 100,
        hp: 150, maxHp: 150,
        mp: 50, maxMp: 50,
        attack: 22, defense: 12,
        hpPercent: 100, expPercent: 0
      },
      tower: {
        floor: 1,
        progress: 0,
        needKills: 3,
        progressPercent: 0,
        isBossFight: false
      },
      ownedSkills: owned,
      equippedSkills: equipped,
      logs: [],
      autoBattle: false,
      showLogModal: false,
      showSkillModal: false,
      autoScrollLog: true,
      lastEvent: ''
    });
    this.generateNormalMonster();
    this.addLog('🏰 试炼之塔开启！击败怪物积累进度，挑战Boss升层', 'system');
    this.updatePlayerUI();
    this.updateTowerUI();
  },

  generateNormalMonster() {
    const floor = this.data.tower.floor;
    const playerLevel = this.data.player.level;
    const baseHp = 40 + floor * 8 + playerLevel * 2;
    const baseAttack = 10 + floor * 3 + playerLevel * 1.5;
    const baseDefense = 3 + floor * 1.5;
    const expReward = 20 + floor * 3;
    this.setData({
      monster: {
        name: `楼层守卫 Lv.${floor}`,
        hp: Math.max(30, baseHp),
        maxHp: Math.max(30, baseHp),
        attack: Math.max(6, baseAttack),
        defense: Math.max(1, baseDefense),
        expReward: Math.max(15, expReward),
        hpPercent: 100
      },
      'tower.isBossFight': false
    });
    this.addLog(`🛡️ 普通怪物出现 (层${floor})`, 'system');
  },

  generateBoss() {
    const floor = this.data.tower.floor;
    const playerLevel = this.data.player.level;
    const baseHp = 80 + floor * 15 + playerLevel * 5;
    const baseAttack = 20 + floor * 5 + playerLevel * 2;
    const baseDefense = 8 + floor * 2;
    const expReward = 60 + floor * 8;
    this.setData({
      monster: {
        name: `⭐ 守层巨兽 ⭐ Lv.${floor}`,
        hp: Math.max(80, baseHp),
        maxHp: Math.max(80, baseHp),
        attack: Math.max(12, baseAttack),
        defense: Math.max(4, baseDefense),
        expReward: Math.max(40, expReward),
        hpPercent: 100
      },
      'tower.isBossFight': true
    });
    this.addLog(`👑 Boss出现！击败它可进入第${floor+1}层！`, 'system');
  },

  // 进度根据层数翻倍: needKills = 3 + floor - 1
  updateTowerUI() {
    const need = 3 + this.data.tower.floor - 1;
    const prog = this.data.tower.progress;
    const percent = (prog / need) * 100;
    this.setData({
      'tower.needKills': need,
      'tower.progressPercent': percent
    });
  },

  updatePlayerUI() {
    const p = this.data.player;
    this.setData({
      'player.hpPercent': (p.hp / p.maxHp) * 100,
      'player.expPercent': (p.exp / p.nextExp) * 100
    });
  },

  updateMonsterUI() {
    if (this.data.monster) {
      this.setData({
        'monster.hpPercent': (this.data.monster.hp / this.data.monster.maxHp) * 100
      });
    }
  },

  addLog(text, type = 'combat') {
    const log = { text, type, index: Date.now() };
    const logs = [...this.data.logs, log];
    if (logs.length > 100) logs.shift();
    this.setData({ logs });
    // 如果日志模态框打开且自动滚动，滚动到底部
    if (this.data.showLogModal && this.data.autoScrollLog) {
      this.setData({ logScrollTop: 99999 });
    }
  },

  // 日志滚动控制
  onLogScroll(e) {
    const scrollTop = e.detail.scrollTop;
    const scrollHeight = e.detail.scrollHeight;
    const clientHeight = e.detail.clientHeight;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
    if (isAtBottom && !this.data.autoScrollLog) {
      this.setData({ autoScrollLog: true });
    } else if (!isAtBottom && this.data.autoScrollLog) {
      this.setData({ autoScrollLog: false });
    }
  },

  onLogScrollToUpper() {
    // 不需要处理
  },

  showLogModal() {
    this.setData({ showLogModal: true, autoScrollLog: true, logScrollTop: 99999 });
  },
  hideLogModal() {
    this.setData({ showLogModal: false });
  },
  stopPropagation() {},

  // 普通攻击
  playerAttack() {
    const player = this.data.player;
    const monster = this.data.monster;
    let damage = Math.max(1, player.attack - monster.defense);
    const isCrit = Math.random() < 0.1;
    if (isCrit) {
      damage = Math.floor(damage * 1.8);
      this.addLog(`💥 暴击！造成 ${damage} 伤害！`, 'combat');
    } else {
      this.addLog(`🗡️ 攻击造成 ${damage} 伤害`, 'combat');
    }
    const newHp = Math.max(0, monster.hp - damage);
    this.setData({ 'monster.hp': newHp });
    this.updateMonsterUI();
    return newHp === 0;
  },

  monsterAttack() {
    const player = this.data.player;
    const monster = this.data.monster;
    let damage = Math.max(1, monster.attack - player.defense);
    const isCrit = Math.random() < 0.08;
    if (isCrit) {
      damage = Math.floor(damage * 1.6);
      this.addLog(`💢 怪物暴击！造成 ${damage} 伤害`, 'combat');
    } else {
      this.addLog(`👹 ${monster.name} 攻击造成 ${damage} 伤害`, 'combat');
    }
    const newHp = Math.max(0, player.hp - damage);
    this.setData({ 'player.hp': newHp });
    this.updatePlayerUI();
    return newHp === 0;
  },

  async manualAttack() {
    if (this.isActing || !this.data.monster || this.data.monster.hp <= 0) return;
    this.isActing = true;
    const monsterDied = this.playerAttack();
    if (monsterDied) {
      await this.handleMonsterDeath();
      this.isActing = false;
      return;
    }
    const playerDied = this.monsterAttack();
    if (playerDied) {
      await this.handleDeath();
    }
    this.isActing = false;
  },

  async handleMonsterDeath() {
    const isBoss = this.data.tower.isBossFight;
    const expGain = this.data.monster.expReward;
    this.addLog(`🏆 击败${this.data.monster.name}！获得 ${expGain} 经验`, 'system');
    await this.addExperience(expGain);
    // 技能掉落 (30%概率)
    if (Math.random() < 0.3) {
      this.dropRandomSkill();
    }
    if (isBoss) {
      // Boss战胜利：升层，重置进度，满血满蓝
      const newFloor = this.data.tower.floor + 1;
      this.addLog(`🎉 击败Boss，晋升至第 ${newFloor} 层！ 🎉`, 'system');
      this.setData({
        'tower.floor': newFloor,
        'tower.progress': 0,
        'tower.isBossFight': false,
        'player.hp': this.data.player.maxHp,
        'player.mp': this.data.player.maxMp
      });
      this.updateTowerUI();
      this.updatePlayerUI();
      this.generateNormalMonster();
    } else {
      // 普通怪：增加进度，但不超过需求
      let newProgress = this.data.tower.progress + 1;
      const need = 3 + this.data.tower.floor - 1;
      if (newProgress > need) newProgress = need;
      this.setData({ 'tower.progress': newProgress });
      this.updateTowerUI();
      // 无论进度是否满，都生成新的普通怪（让玩家可以继续打）
      this.generateNormalMonster();
    }
  },

  async addExperience(exp) {
    let remaining = exp;
    let player = { ...this.data.player };
    let levelUp = false;
    while (remaining > 0) {
      const need = player.nextExp - player.exp;
      if (remaining >= need) {
        remaining -= need;
        player.exp = 0;
        player.level++;
        levelUp = true;
        const hpGain = 15 + Math.floor(Math.random() * 10);
        const atkGain = 3 + Math.floor(Math.random() * 5);
        const defGain = 2 + Math.floor(Math.random() * 3);
        player.maxHp += hpGain;
        player.hp = player.maxHp;
        player.attack += atkGain;
        player.defense += defGain;
        player.maxMp += 5;
        player.mp = player.maxMp;
        player.nextExp = Math.floor(100 + player.level * 12);
        this.addLog(`🌟 升级 Lv.${player.level}！生命+${hpGain} 攻击+${atkGain} 防御+${defGain}`, 'system');
      } else {
        player.exp += remaining;
        remaining = 0;
      }
    }
    this.setData({ player });
    this.updatePlayerUI();
    if (levelUp) wx.vibrateShort({ type: 'light' });
  },

  dropRandomSkill() {
    const ownedIds = this.data.ownedSkills.map(s => s.id);
    const available = this.skillLibrary.filter(s => !ownedIds.includes(s.id));
    if (available.length === 0) return;
    const newSkill = { ...available[Math.floor(Math.random() * available.length)], equipped: false };
    const newOwned = [...this.data.ownedSkills, newSkill];
    this.setData({ ownedSkills: newOwned });
    this.addLog(`📖 获得新技能：${newSkill.name}！`, 'event');
  },

  // 技能释放
  castSkill(e) {
    if (this.isActing) return;
    const skill = e.currentTarget.dataset.skill;
    const player = this.data.player;
    if (player.mp < skill.cost) {
      this.addLog(`法力不足，无法释放 ${skill.name}`, 'system');
      return;
    }
    if (!this.data.monster || this.data.monster.hp <= 0) return;
    this.isActing = true;
    this.setData({ 'player.mp': player.mp - skill.cost });
    this.addLog(`✨ 释放技能：${skill.name} ✨`, 'skill');
    // 技能效果
    if (skill.type === 'damage') {
      const damage = Math.floor(this.data.player.attack * skill.value);
      const newHp = Math.max(0, this.data.monster.hp - damage);
      this.setData({ 'monster.hp': newHp });
      this.addLog(`💢 造成 ${damage} 伤害`, 'combat');
      this.updateMonsterUI();
      if (newHp === 0) {
        this.handleMonsterDeath().finally(() => { this.isActing = false; });
        return;
      }
    } else if (skill.type === 'heal') {
      const heal = Math.floor(this.data.player.maxHp * skill.value);
      const newHp = Math.min(this.data.player.maxHp, this.data.player.hp + heal);
      this.setData({ 'player.hp': newHp });
      this.addLog(`💚 恢复 ${heal} 生命`, 'skill');
      this.updatePlayerUI();
    } else if (skill.type === 'shield') {
      this.setData({ 'player.defense': this.data.player.defense + 20 });
      this.addLog(`🛡️ 获得护盾，防御+20（本回合）`, 'skill');
      setTimeout(() => {
        this.setData({ 'player.defense': this.data.player.defense - 20 });
      }, 500);
    } else if (skill.type === 'buff') {
      const oldAttack = this.data.player.attack;
      const newAttack = Math.floor(oldAttack * skill.value);
      this.setData({ 'player.attack': newAttack });
      this.addLog(`⚡ 攻击力提升至 ${newAttack}，持续3回合`, 'skill');
      setTimeout(() => {
        this.setData({ 'player.attack': oldAttack });
        this.addLog(`狂暴效果消失`, 'system');
      }, 3000);
    } else if (skill.type === 'multi') {
      let total = 0;
      for (let i = 0; i < skill.hits; i++) {
        total += Math.floor(this.data.player.attack * skill.value);
      }
      const newHp = Math.max(0, this.data.monster.hp - total);
      this.setData({ 'monster.hp': newHp });
      this.addLog(`💥 连击！共造成 ${total} 伤害`, 'combat');
      this.updateMonsterUI();
      if (newHp === 0) {
        this.handleMonsterDeath().finally(() => { this.isActing = false; });
        return;
      }
    }
    // 怪物反击
    if (this.data.monster && this.data.monster.hp > 0) {
      const playerDied = this.monsterAttack();
      if (playerDied) {
        this.handleDeath().finally(() => { this.isActing = false; });
        return;
      }
    }
    this.isActing = false;
  },

  // 挑战Boss
  startBossFight() {
    if (this.data.tower.isBossFight) {
      this.addLog('已经在Boss战中', 'system');
      return;
    }
    const need = 3 + this.data.tower.floor - 1;
    if (this.data.tower.progress < need) {
      this.addLog(`进度不足，还需击败 ${need - this.data.tower.progress} 只普通怪`, 'system');
      return;
    }
    // 恢复玩家状态（满血满蓝）
    this.setData({
      'player.hp': this.data.player.maxHp,
      'player.mp': this.data.player.maxMp
    });
    this.updatePlayerUI();
    // 生成Boss
    this.generateBoss();
  },

  // 死亡惩罚
  async handleDeath() {
    this.stopAutoBattle();
    const isBossFight = this.data.tower.isBossFight;
    let newLevel = Math.max(1, this.data.player.level - (isBossFight ? 1 : 2));
    let newFloor = this.data.tower.floor;
    let newProgress = 0;
    if (!isBossFight) {
      newFloor = Math.max(1, this.data.tower.floor - 1);
      this.addLog(`💀 在第${this.data.tower.floor}层战死，坠落到第${newFloor}层，进度清零`, 'system');
    } else {
      this.addLog(`💀 Boss战失败，进度清零，重新积累进度`, 'system');
    }
    // 降级降属性
    if (newLevel < this.data.player.level) {
      const levelDrop = this.data.player.level - newLevel;
      const newAttack = Math.max(10, this.data.player.attack - levelDrop * 3);
      const newDefense = Math.max(5, this.data.player.defense - levelDrop * 2);
      const newMaxHp = Math.max(80, this.data.player.maxHp - levelDrop * 15);
      this.setData({
        'player.level': newLevel,
        'player.attack': newAttack,
        'player.defense': newDefense,
        'player.maxHp': newMaxHp,
        'player.hp': newMaxHp,
        'player.exp': 0,
        'player.nextExp': Math.floor(100 + newLevel * 12),
        'tower.floor': newFloor,
        'tower.progress': newProgress,
        'tower.isBossFight': false
      });
      this.updatePlayerUI();
    } else {
      this.setData({
        'tower.progress': newProgress,
        'tower.isBossFight': false
      });
    }
    this.updateTowerUI();
    this.generateNormalMonster();
    this.addLog('你被削弱了，但冒险继续...', 'system');
    if (this.data.autoBattle) this.startAutoBattle();
  },

  // 技能配置弹窗
  openSkillConfig() {
    this.setData({ showSkillModal: true });
  },
  closeSkillModal() {
    this.setData({ showSkillModal: false });
    // 保存装备
    const equipped = this.data.ownedSkills.filter(s => s.equipped);
    if (equipped.length > 4) {
      // 如果超过4个，去掉最后装备的
      equipped.pop();
      this.setData({ ownedSkills: this.data.ownedSkills.map(s => s.equipped ? { ...s, equipped: false } : s) });
      equipped.forEach(s => { const idx = this.data.ownedSkills.findIndex(own => own.id === s.id); if (idx !== -1) this.data.ownedSkills[idx].equipped = true; });
      this.setData({ ownedSkills: [...this.data.ownedSkills] });
    }
    this.setData({ equippedSkills: equipped });
    this.addLog('技能配置已更新', 'system');
  },
  toggleSkillEquip(e) {
    const skill = e.currentTarget.dataset.skill;
    const idx = this.data.ownedSkills.findIndex(s => s.id === skill.id);
    if (idx === -1) return;
    const newOwned = [...this.data.ownedSkills];
    const currentEquippedCount = newOwned.filter(s => s.equipped).length;
    if (!newOwned[idx].equipped && currentEquippedCount >= 4) {
      this.addLog('最多装备4个技能', 'system');
      return;
    }
    newOwned[idx].equipped = !newOwned[idx].equipped;
    this.setData({ ownedSkills: newOwned });
  },

  resetGame() {
    this.stopAutoBattle();
    this.initGame();
    if (this.data.autoBattle) this.startAutoBattle();
  },

  toggleAutoBattle() {
    const newState = !this.data.autoBattle;
    this.setData({ autoBattle: newState });
    if (newState) {
      this.startAutoBattle();
      this.addLog('⚔️ 自动平A开启', 'system');
    } else {
      this.stopAutoBattle();
      this.addLog('⏸️ 自动平A关闭', 'system');
    }
  },

  startAutoBattle() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.data.autoBattle && !this.isActing && this.data.monster && this.data.monster.hp > 0) {
        this.manualAttack();
      }
    }, 1200);
  },

  stopAutoBattle() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
});