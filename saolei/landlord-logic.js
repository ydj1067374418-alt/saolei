const SUITS = ["S", "H", "C", "D"];
const BASE_RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];

const RANK_VALUE = {
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  2: 15,
  BJ: 16,
  RJ: 17,
};

const SUIT_SYMBOL = {
  S: "♠",
  H: "♥",
  C: "♣",
  D: "♦",
};

const TYPE_LABEL = {
  single: "单张",
  pair: "对子",
  triple: "三张",
  triple_single: "三带一",
  triple_pair: "三带二",
  straight: "顺子",
  pair_straight: "连对",
  airplane: "飞机",
  airplane_single: "飞机带单",
  airplane_pair: "飞机带对",
  four_two_single: "四带二",
  four_two_pair: "四带两对",
  bomb: "炸弹",
  rocket: "王炸",
};

export function buildShuffledDeck() {
  const deck = [];

  for (const rank of BASE_RANKS) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}`);
    }
  }

  deck.push("BJ", "RJ");

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}

export function sortCards(cards, direction = "desc") {
  const list = [...cards];
  const factor = direction === "asc" ? 1 : -1;
  list.sort((left, right) => {
    const rankGap = getCardRankValue(left) - getCardRankValue(right);
    if (rankGap !== 0) {
      return rankGap * factor;
    }
    return getSuitOrder(left) - getSuitOrder(right);
  });
  return list;
}

export function getCardRankValue(card) {
  if (card === "BJ" || card === "RJ") {
    return RANK_VALUE[card];
  }
  return RANK_VALUE[card.slice(0, -1)];
}

export function getCardDisplay(card) {
  if (card === "BJ") {
    return "小王";
  }
  if (card === "RJ") {
    return "大王";
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  return `${SUIT_SYMBOL[suit] || ""}${rank}`;
}

export function evaluateCards(rawCards) {
  const cards = sortCards(rawCards, "asc");
  if (cards.length === 0) {
    return null;
  }

  const rankValues = cards.map(getCardRankValue);
  const counts = countRanks(rankValues);
  const grouped = getGroupedCounts(counts);
  const length = cards.length;

  if (length === 1) {
    return buildCombo("single", length, rankValues[0]);
  }

  if (length === 2) {
    if (rankValues.includes(16) && rankValues.includes(17)) {
      return buildCombo("rocket", length, 17);
    }
    if (grouped[0]?.count === 2) {
      return buildCombo("pair", length, grouped[0].rank);
    }
    return null;
  }

  if (length === 3 && grouped[0]?.count === 3) {
    return buildCombo("triple", length, grouped[0].rank);
  }

  if (length === 4) {
    if (grouped[0]?.count === 4) {
      return buildCombo("bomb", length, grouped[0].rank);
    }
    if (grouped[0]?.count === 3) {
      return buildCombo("triple_single", length, grouped[0].rank);
    }
  }

  if (length === 5) {
    if (grouped[0]?.count === 3 && grouped[1]?.count === 2) {
      return buildCombo("triple_pair", length, grouped[0].rank);
    }
    if (isStraight(rankValues)) {
      return buildCombo("straight", length, rankValues[rankValues.length - 1]);
    }
  }

  if (isStraight(rankValues)) {
    return buildCombo("straight", length, rankValues[rankValues.length - 1]);
  }

  if (isPairStraight(grouped, length)) {
    return buildCombo("pair_straight", length, grouped[grouped.length - 1].rank);
  }

  if (length === 6 && grouped[0]?.count === 4) {
    return buildCombo("four_two_single", length, grouped[0].rank);
  }

  if (length === 8 && grouped[0]?.count === 4 && grouped[1]?.count === 2 && grouped[2]?.count === 2) {
    return buildCombo("four_two_pair", length, grouped[0].rank);
  }

  const pureAirplane = detectAirplane(counts, length, "none");
  if (pureAirplane) {
    return buildCombo("airplane", length, pureAirplane.highest);
  }

  const airplaneSingle = detectAirplane(counts, length, "single");
  if (airplaneSingle) {
    return buildCombo("airplane_single", length, airplaneSingle.highest);
  }

  const airplanePair = detectAirplane(counts, length, "pair");
  if (airplanePair) {
    return buildCombo("airplane_pair", length, airplanePair.highest);
  }

  return null;
}

export function canBeat(lastCombo, nextCombo) {
  if (!nextCombo) {
    return false;
  }

  if (!lastCombo) {
    return true;
  }

  if (nextCombo.type === "rocket") {
    return true;
  }

  if (lastCombo.type === "rocket") {
    return false;
  }

  if (nextCombo.type === "bomb" && lastCombo.type !== "bomb") {
    return true;
  }

  if (nextCombo.type !== lastCombo.type) {
    return false;
  }

  if (nextCombo.length !== lastCombo.length) {
    return false;
  }

  return nextCombo.primaryRank > lastCombo.primaryRank;
}

export function removeCardsFromHand(hand, cardsToRemove) {
  const source = [...hand];
  for (const card of cardsToRemove) {
    const index = source.indexOf(card);
    if (index === -1) {
      return null;
    }
    source.splice(index, 1);
  }
  return sortCards(source);
}

function getSuitOrder(card) {
  if (card === "BJ") {
    return 10;
  }
  if (card === "RJ") {
    return 11;
  }
  return SUITS.indexOf(card.slice(-1));
}

function countRanks(rankValues) {
  const counts = new Map();
  for (const rank of rankValues) {
    counts.set(rank, (counts.get(rank) || 0) + 1);
  }
  return counts;
}

function getGroupedCounts(counts) {
  return [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.rank - right.rank;
    });
}

function buildCombo(type, length, primaryRank) {
  return {
    type,
    length,
    primaryRank,
    label: TYPE_LABEL[type] || type,
  };
}

function isStraight(rankValues) {
  if (rankValues.length < 5) {
    return false;
  }

  for (let index = 0; index < rankValues.length; index += 1) {
    if (rankValues[index] >= 15) {
      return false;
    }
    if (index > 0) {
      if (rankValues[index] === rankValues[index - 1]) {
        return false;
      }
      if (rankValues[index] !== rankValues[index - 1] + 1) {
        return false;
      }
    }
  }

  return true;
}

function isPairStraight(grouped, length) {
  if (length < 6 || length % 2 !== 0) {
    return false;
  }

  if (!grouped.every((item) => item.count === 2 && item.rank < 15)) {
    return false;
  }

  const ordered = [...grouped].sort((left, right) => left.rank - right.rank);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].rank !== ordered[index - 1].rank + 1) {
      return false;
    }
  }

  return true;
}

function detectAirplane(counts, length, wingType) {
  const eligible = [...counts.entries()]
    .filter(([rank, count]) => count >= 3 && rank < 15)
    .map(([rank]) => rank)
    .sort((left, right) => left - right);

  if (eligible.length < 2) {
    return null;
  }

  const segmentLength =
    wingType === "none" ? length / 3 : wingType === "single" ? length / 4 : length / 5;

  if (!Number.isInteger(segmentLength) || segmentLength < 2) {
    return null;
  }

  const segments = getConsecutiveSegments(eligible);
  for (const segment of segments) {
    if (segment.length < segmentLength) {
      continue;
    }

    for (let start = 0; start <= segment.length - segmentLength; start += 1) {
      const tripleRanks = segment.slice(start, start + segmentLength);
      const residue = subtractTripleRanks(counts, tripleRanks);
      if (wingType === "none" && totalResidueCards(residue) === 0) {
        return { highest: tripleRanks[tripleRanks.length - 1] };
      }

      if (wingType === "single" && totalResidueCards(residue) === segmentLength) {
        return { highest: tripleRanks[tripleRanks.length - 1] };
      }

      if (
        wingType === "pair" &&
        totalResidueCards(residue) === segmentLength * 2 &&
        [...residue.values()].every((count) => count === 0 || count === 2)
      ) {
        return { highest: tripleRanks[tripleRanks.length - 1] };
      }
    }
  }

  return null;
}

function getConsecutiveSegments(numbers) {
  const result = [];
  let current = [];

  for (const number of numbers) {
    if (current.length === 0 || number === current[current.length - 1] + 1) {
      current.push(number);
    } else {
      result.push(current);
      current = [number];
    }
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result;
}

function subtractTripleRanks(counts, tripleRanks) {
  const residue = new Map(counts);
  for (const rank of tripleRanks) {
    residue.set(rank, (residue.get(rank) || 0) - 3);
  }
  return residue;
}

function totalResidueCards(residue) {
  let total = 0;
  for (const count of residue.values()) {
    total += Math.max(0, count);
  }
  return total;
}
