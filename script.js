const GLASS_LIMIT = 5;
const DRINK_REVEAL_COUNT = 2;

const cardTypes = [
  { name: "Poison", kind: "danger", units: 1, image: "assets/poison-vial.png", text: "1 unit. If revealed while drinking, the drinker is eliminated." },
  { name: "Antidote", kind: "safe", units: 1, image: "assets/antidote-bottle.png", text: "1 unit. Safe if revealed while drinking." },
  { name: "Water", kind: "neutral", units: 1, image: "assets/water-goblet.png", text: "1 unit. Harmless if revealed while drinking." },
  { name: "Wine", kind: "neutral", units: 1, image: "assets/wine-glass.png", text: "1 unit. Harmless if revealed while drinking." },
];

const deckRecipe = [
  ["Poison", 8],
  ["Antidote", 12],
  ["Water", 10],
  ["Wine", 10],
];

const glassNames = ["Player 1", "Silent Guest", "Player 2"];
const glassImages = ["assets/wine-glass.png", "assets/water-goblet.png", "assets/wine-glass.png"];

let state;
let forcedPoisonerGlassIndex = null;

const el = {
  turnLabel: document.querySelector("#turnLabel"),
  phaseLabel: document.querySelector("#phaseLabel"),
  roundLabel: document.querySelector("#roundLabel"),
  messageLog: document.querySelector("#messageLog"),
  glasses: document.querySelector("#glasses"),
  hands: [document.querySelector("#playerOneHand"), document.querySelector("#playerTwoHand")],
  panels: [document.querySelector("#playerOnePanel"), document.querySelector("#playerTwoPanel")],
  roles: [document.querySelector("#playerOneRole"), document.querySelector("#playerTwoRole")],
  resultBadges: [document.querySelector("#playerOneResult"), document.querySelector("#playerTwoResult")],
  portraits: [document.querySelector("#playerOnePortrait"), document.querySelector("#playerTwoPortrait")],
  portraitCaptions: [document.querySelector("#playerOneCaption"), document.querySelector("#playerTwoCaption")],
  intel: [document.querySelector("#playerOneIntel"), document.querySelector("#playerTwoIntel")],
  passBtn: document.querySelector("#passBtn"),
  newGameBtn: document.querySelector("#newGameBtn"),
  debugBtn: document.querySelector("#debugBtn"),
  debugPanel: document.querySelector("#debugPanel"),
  debugPoisoner: document.querySelector("#debugPoisoner"),
  debugRoles: document.querySelector("#debugRoles"),
  modeSelect: document.querySelector("#modeSelect"),
  playerTwoType: document.querySelector("#playerTwoType"),
  drinkReveal: document.querySelector("#drinkReveal"),
  revealTitle: document.querySelector("#revealTitle"),
  revealSubtitle: document.querySelector("#revealSubtitle"),
  revealCards: document.querySelector("#revealCards"),
  revealGraphic: document.querySelector("#revealGraphic"),
  revealResult: document.querySelector("#revealResult"),
  revealContinueBtn: document.querySelector("#revealContinueBtn"),
  deathBanner: document.querySelector("#deathBanner"),
  deathBannerKicker: document.querySelector("#deathBannerKicker"),
  deathBannerTitle: document.querySelector("#deathBannerTitle"),
  deathBannerDetail: document.querySelector("#deathBannerDetail"),
  silentGuestRole: document.querySelector("#silentGuestRole"),
};

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createCard(name) {
  const source = cardTypes.find((card) => card.name === name);
  return { ...source, id: crypto.randomUUID() };
}

function createDeck() {
  return shuffle(deckRecipe.flatMap(([name, count]) => Array.from({ length: count }, () => createCard(name))));
}

function drawCard() {
  if (state.deck.length === 0) return null;
  return state.deck.pop();
}

function drawHand() {
  const card = drawCard();
  return card ? [card] : [];
}

function discardDrinkCards(cards) {
  state.discard.push(...cards.map((card) => ({ ...card })));
}

function randomPoisonerGlassIndex() {
  return Math.floor(Math.random() * glassNames.length);
}

function newGame() {
  const poisonerGlassIndex = forcedPoisonerGlassIndex ?? randomPoisonerGlassIndex();
  state = {
    currentPlayer: 0,
    round: 1,
    mode: el.modeSelect.value,
    computerThinking: false,
    gameOver: false,
    deathEvent: false,
    winnerIndex: null,
    winnerRole: null,
    winnerTeam: null,
    resultSummary: null,
    poisonerGlassIndex,
    silentRoleVisible: false,
    debugVisible: false,
    deadGlassIndex: null,
    deadLabel: null,
    gameOverPrompt: false,
    deck: createDeck(),
    discard: [],
    lastReveal: [],
    reveal: null,
    players: [
      { role: poisonerGlassIndex === 0 ? "Poisoner" : "Guest", hand: [], safeTastes: 0, intel: ["No drink evidence yet."], roleVisible: true, eliminated: false },
      { role: poisonerGlassIndex === 2 ? "Poisoner" : "Guest", hand: [], safeTastes: 0, intel: ["No drink evidence yet."], roleVisible: false, eliminated: false },
    ],
    glasses: glassNames.map((name, index) => ({ name, index, stack: [], drinks: 0, knownPoisoned: false, disabled: false })),
    log: "Each player holds one drawn card. Click a destination glass to place it. Drinking reveals 2 random cards at 5 units.",
  };
  state.players[0].hand = drawHand();
  state.players[1].hand = drawHand();
  render();
}

function activePlayer() {
  return state.players[state.currentPlayer];
}

function opponentOf(playerIndex) {
  return playerIndex === 0 ? 1 : 0;
}

function ownerOfGlass(glassIndex) {
  if (glassIndex === 0) return 0;
  if (glassIndex === 2) return 1;
  return null;
}

function roleOfGlass(glassIndex) {
  return state.poisonerGlassIndex === glassIndex ? "Poisoner" : "Guest";
}

function labelForGlass(glassIndex) {
  if (glassIndex === 0) return "Player 1";
  if (glassIndex === 2) return "Player 2";
  return "Silent Guest";
}

function revealAllRoles() {
  state.players.forEach((player) => {
    player.roleVisible = true;
  });
  state.silentRoleVisible = true;
}

function poisonerLabel() {
  return labelForGlass(state.poisonerGlassIndex);
}

function placeSelectedCard(glassIndex) {
  if (state.gameOver || isRevealActive() || activePlayer().hand.length === 0 || isComputerTurn()) return;
  if (state.glasses[glassIndex].disabled) {
    state.log = `${state.glasses[glassIndex].name}'s glass is broken and cannot receive more cards.`;
    render();
    return;
  }
  placeCardForCurrentPlayer(glassIndex);
}

function manualDrink(glassIndex) {
  if (state.gameOver || isRevealActive() || isComputerTurn()) return;
  if (state.glasses[glassIndex].disabled) {
    state.log = `${state.glasses[glassIndex].name}'s glass is broken and out of play.`;
    render();
    return;
  }
  if (state.glasses[glassIndex].stack.length < GLASS_LIMIT) {
    state.log = "That glass does not contain 5 units yet.";
    render();
    return;
  }
  drinkGlass(glassIndex, false);
}

function drinkGlass(glassIndex, automatic) {
  const glass = state.glasses[glassIndex];
  const drinker = ownerOfGlass(glassIndex);
  const revealCount = Math.min(DRINK_REVEAL_COUNT, glass.stack.length);
  const revealed = shuffle(glass.stack).slice(0, revealCount);
  const revealedNames = revealed.map((card) => card.name).join(" and ");
  const poisonRevealed = revealed.some((card) => card.kind === "danger");
  const antidoteRevealed = revealed.some((card) => card.name === "Antidote");
  const poisoned = poisonRevealed && !antidoteRevealed;
  const prefix = automatic ? `${glass.name}'s glass reached 5 units.` : `${glass.name}'s glass was drunk.`;
  glass.drinks += 1;
  state.lastReveal = revealed.map((card) => card.name);

  state.reveal = {
    glassIndex,
    glassName: glass.name,
    drinker,
    revealed,
    revealedNames,
    poisonRevealed,
    antidoteRevealed,
    poisoned,
    prefix,
    returnedCount: glass.stack.length,
    step: 0,
    ready: false,
    started: false,
  };
  state.log = `${prefix} The glass is being drunk...`;
  render();
}

function completeDrinkReveal() {
  if (!state.reveal || !state.reveal.ready) return;
  const reveal = state.reveal;
  const glass = state.glasses[reveal.glassIndex];
  state.reveal = null;

  if (reveal.poisoned) {
    glass.stack = [];
    glass.knownPoisoned = false;
    eliminateDrinker(reveal.drinker, `${reveal.prefix} Drinking revealed ${reveal.revealedNames}. Poison was found.`);
    return;
  }

  discardDrinkCards(glass.stack);
  glass.stack = [];
  glass.knownPoisoned = false;

  if (reveal.drinker !== null) {
    state.players[reveal.drinker].safeTastes += 1;
    state.players[reveal.drinker].intel.unshift(`Safe drink: revealed ${reveal.revealedNames}; ${reveal.returnedCount} cards discarded unseen.`);
  } else {
    state.players.forEach((player) => {
      player.intel.unshift(`Silent Guest safe drink: revealed ${reveal.revealedNames}; the rest discarded unseen.`);
    });
  }

  const safeReason = reveal.poisonRevealed ? "Poison appeared, but Antidote cancelled it" : "No poison appeared";
  state.log = `${reveal.prefix} Drinking revealed ${reveal.revealedNames}. ${safeReason}, so all ${reveal.returnedCount} cards were discarded unseen.`;
  endTurn();
}

function eliminateDrinker(drinker, message) {
  state.deathEvent = true;

  if (drinker === null) {
    state.deadGlassIndex = 1;
    state.deadLabel = "Silent Guest died";
    state.glasses[1].disabled = true;
    if (roleOfGlass(1) === "Poisoner") {
      finishGame(`${message} The Silent Guest was the Poisoner and is destroyed. The game ends.`, "Guest", true);
      return;
    }
    finishGame(`${message} The Silent Guest was a Guest. The Poisoner wins.`, "Poisoner", true);
    return;
  }

  state.players[drinker].eliminated = true;
  state.deadGlassIndex = drinker === 0 ? 0 : 2;
  state.deadLabel = `Player ${drinker + 1} died`;
  const winnerTeam = state.players[drinker].role === "Poisoner" ? "Guest" : "Poisoner";
  finishGame(`${message} Player ${drinker + 1} is eliminated. The game ends.`, winnerTeam, true);
}

function finishGame(message, winner, revealRoles = false) {
  state.gameOver = true;
  state.gameOverPrompt = true;
  const winnerTeam = typeof winner === "string" ? winner : winner === null ? null : state.players[winner].role;
  state.winnerIndex = typeof winner === "number" ? winner : null;
  state.winnerTeam = winnerTeam;
  state.winnerRole = winnerTeam;
  if (revealRoles) {
    revealAllRoles();
  }
  const poisonerText = revealRoles ? ` The Poisoner was ${poisonerLabel()}.` : "";
  state.resultSummary = winnerTeam === null
    ? "No winner"
    : `${winnerTeam} team wins.`;
  state.log = `${state.resultSummary} ${message}${poisonerText}`;
  render();
}

function finishDeckEmpty() {
  if (state.gameOver) return;
  finishGame("The deck has run out and nobody has died. The Guests survive the night.", "Guest", true);
}

function endTurn() {
  if (state.gameOver) return;
  state.computerThinking = false;

  state.currentPlayer = opponentOf(state.currentPlayer);
  if (state.currentPlayer === 0) state.round += 1;
  if (activePlayer().hand.length === 0) {
    const nextCard = drawCard();
    if (!nextCard) {
      finishDeckEmpty();
      return;
    }
    activePlayer().hand.push(nextCard);
  }
  render();
}

function passTurn() {
  if (state.gameOver || isRevealActive() || isComputerTurn()) return;
  state.log = `${glassNames[state.currentPlayer * 2]} passed.`;
  endTurn();
}

function isComputerTurn() {
  return state.mode === "computer" && state.currentPlayer === 1 && !state.gameOver;
}

function isRevealActive() {
  return Boolean(state.reveal);
}

function scheduleComputerTurn() {
  if (isRevealActive() || !isComputerTurn() || state.computerThinking) return;
  state.computerThinking = true;
  state.log = "The computer studies the glasses...";
  window.setTimeout(computerTakeTurn, 650);
}

function computerTakeTurn() {
  if (!isComputerTurn()) return;
  const drinkChoice = chooseComputerDrink();
  if (drinkChoice !== null) {
    state.computerThinking = false;
    drinkGlass(drinkChoice, false);
    return;
  }

  const card = activePlayer().hand[0];
  if (!card) {
    finishDeckEmpty();
    return;
  }
  placeCardForCurrentPlayer(chooseComputerTarget(card), true);
}

function chooseComputerDrink() {
  const ownGlass = state.glasses[2];
  if (ownGlass.stack.length >= GLASS_LIMIT && activePlayer().role === "Guest") return 2;
  const fullGlass = state.glasses.find((glass) => !glass.disabled && glass.stack.length >= GLASS_LIMIT);
  return fullGlass ? fullGlass.index : null;
}

function chooseComputerTarget(card) {
  const playableIndexes = (indexes) => indexes.filter((index) => !state.glasses[index].disabled);
  const leastFull = (indexes) => {
    const choices = playableIndexes(indexes);
    return shuffle(choices.length ? choices : [0, 2]).sort((a, b) => state.glasses[a].stack.length - state.glasses[b].stack.length)[0];
  };

  if (activePlayer().role === "Poisoner") {
    if (card.kind === "danger") return leastFull(Math.random() < 0.65 ? [0] : [1, 0]);
    if (card.kind === "safe") return 2;
    return leastFull([0, 1, 2]);
  }

  if (card.kind === "safe") return 2;
  if (card.kind === "danger") return 0;
  return leastFull([1, 2]);
}

function placeCardForCurrentPlayer(glassIndex, computer = false) {
  const player = activePlayer();
  const cardIndex = 0;
  if (!player.hand[cardIndex]) return;
  if (state.glasses[glassIndex].disabled) {
    state.log = `${state.glasses[glassIndex].name}'s glass is broken and cannot receive more cards.`;
    render();
    return;
  }

  const [card] = player.hand.splice(cardIndex, 1);
  state.glasses[glassIndex].stack.push({ ...card, placedBy: state.currentPlayer, round: state.round });
  if (state.currentPlayer === 0 && card.kind === "danger") {
    state.glasses[glassIndex].knownPoisoned = true;
  }
  const nextCard = drawCard();
  if (nextCard) player.hand.push(nextCard);

  const actor = computer ? "The computer" : glassNames[state.currentPlayer * 2];
  const placedName = state.glasses[glassIndex].name;
  state.log = `${actor} placed a hidden card into ${placedName}'s glass.`;

  if (state.glasses[glassIndex].stack.length >= GLASS_LIMIT) {
    state.computerThinking = false;
    drinkGlass(glassIndex, true);
    return;
  }

  if (!nextCard) {
    finishDeckEmpty();
    return;
  }

  endTurn();
}

function toggleRole(playerIndex) {
  if (playerIndex !== 0 && !state.gameOver) return;
  state.players[playerIndex].roleVisible = !state.players[playerIndex].roleVisible;
  render();
}

function toggleDebug() {
  state.debugVisible = !state.debugVisible;
  render();
}

function forcePoisoner(value) {
  forcedPoisonerGlassIndex = value === "random" ? null : Number(value);
  newGame();
  state.debugVisible = true;
  render();
}

function render() {
  const computerTurn = isComputerTurn();
  el.turnLabel.textContent = state.gameOver ? "Game over" : state.currentPlayer === 1 && state.mode === "computer" ? "Computer" : `Player ${state.currentPlayer + 1}`;
  el.phaseLabel.textContent = isRevealActive()
    ? state.reveal.ready && state.reveal.poisoned
      ? "Fatal drink"
      : "Drink reveal"
    : computerTurn
        ? "Computer thinking"
        : "Place or drink";
  el.roundLabel.textContent = state.round;
  el.messageLog.textContent = state.log;
  el.deathBanner.hidden = !state.deathEvent;
  el.newGameBtn.classList.toggle("urgent", state.gameOver);
  el.passBtn.disabled = state.gameOver || computerTurn || isRevealActive();
  el.modeSelect.disabled = computerTurn || isRevealActive();
  el.playerTwoType.textContent = state.mode === "computer" ? "Computer" : "Player 2";
  el.silentGuestRole.textContent = state.silentRoleVisible ? roleOfGlass(1) : "Role hidden";
  el.silentGuestRole.classList.toggle("revealed", state.silentRoleVisible);
  el.silentGuestRole.classList.toggle("poisoner", state.silentRoleVisible && roleOfGlass(1) === "Poisoner");
  el.debugBtn.textContent = state.debugVisible ? "Hide Debug" : "Show Debug";
  el.debugPanel.hidden = !state.debugVisible;
  const forceLabel = forcedPoisonerGlassIndex === null ? "Random" : `Forced ${labelForGlass(forcedPoisonerGlassIndex)}`;
  el.debugPoisoner.textContent = `Poisoner: ${poisonerLabel()} (${forceLabel})`;
  el.debugRoles.textContent = `Player 1: ${state.players[0].role} | Silent Guest: ${roleOfGlass(1)} | Player 2: ${state.players[1].role}`;

  state.players.forEach((player, index) => {
    el.panels[index].classList.toggle("active", index === state.currentPlayer && !state.gameOver);
    el.panels[index].classList.toggle("eliminated", player.eliminated);
    const playerTeamWon = state.gameOver && state.winnerTeam !== null && player.role === state.winnerTeam;
    el.panels[index].classList.toggle("winner", playerTeamWon);
    el.panels[index].classList.toggle("loser", state.gameOver && state.winnerTeam !== null && !playerTeamWon);
    el.panels[index].classList.toggle("poisoner", player.roleVisible && player.role === "Poisoner");
    el.panels[index].classList.toggle("guest", player.roleVisible && player.role === "Guest");
    el.panels[index].querySelector(".role-portrait").classList.toggle("hidden-role", !player.roleVisible);
    el.roles[index].textContent = player.roleVisible ? player.role : "Hidden";
    el.portraits[index].src = player.role === "Poisoner" ? "assets/role-poisoner-clear.png" : "assets/role-guest-clear.png";
    el.portraits[index].alt = player.roleVisible ? `Player ${index + 1} ${player.role} portrait` : `Player ${index + 1} hidden role portrait`;
    el.portraitCaptions[index].textContent = player.roleVisible ? player.role : "Hidden role";
    const revealButton = el.panels[index].querySelector(".reveal-btn");
    revealButton.hidden = index !== 0 && !state.gameOver;
    revealButton.textContent = player.roleVisible ? "Hide Role" : "Peek Role";
    el.resultBadges[index].hidden = !state.gameOver || state.winnerTeam === null;
    el.resultBadges[index].textContent = playerTeamWon ? "Winner" : "Defeated";
    el.resultBadges[index].classList.toggle("winner", playerTeamWon);
    el.resultBadges[index].classList.toggle("loser", state.gameOver && state.winnerTeam !== null && !playerTeamWon);
    el.hands[index].innerHTML = player.hand.map((card) => cardButton(card, index)).join("");
    el.intel[index].innerHTML = `
      <strong>Safe drinks: ${player.safeTastes}</strong>
      ${player.intel.slice(0, 4).map((item) => `<span>${item}</span>`).join("")}
    `;
  });

  el.glasses.innerHTML = state.glasses.map(glassView).join("");
  renderResultBanner();
  bindDynamicEvents();
  renderDrinkReveal();
  scheduleComputerTurn();
}

function renderResultBanner() {
  if (!state.gameOver || state.winnerTeam === null) {
    el.deathBannerKicker.textContent = "Fatal drink";
    el.deathBannerTitle.textContent = state.deathEvent ? "Roles are revealed" : "";
    el.deathBannerDetail.textContent = "";
    return;
  }

  el.deathBanner.hidden = false;
  el.deathBannerKicker.textContent = "Game over";
  el.deathBannerTitle.textContent = state.winnerTeam === "Guest" ? "Guests win" : "Poisoner wins";
  const silentDeathDetail = state.deadGlassIndex === 1
    ? roleOfGlass(1) === "Poisoner"
      ? "The Silent Guest was the Poisoner."
      : "The Silent Guest was a Guest."
    : "";
  el.deathBannerDetail.textContent = `${silentDeathDetail} Poisoner: ${poisonerLabel()}. Start a new game to play again.`.trim();
}

function renderDrinkReveal() {
  if (!state.reveal) {
    el.drinkReveal.classList.remove("active");
    el.drinkReveal.setAttribute("aria-hidden", "true");
    return;
  }

  const reveal = state.reveal;
  el.drinkReveal.classList.add("active");
  el.drinkReveal.setAttribute("aria-hidden", "false");
  el.revealTitle.textContent = `${reveal.glassName} is drunk`;
  el.revealSubtitle.textContent = "Two random cards are drawn from the glass.";
  el.revealCards.innerHTML = reveal.revealed.map((card, index) => revealCardView(card, index < reveal.step)).join("");
  el.revealGraphic.hidden = !reveal.poisonRevealed;
  if (reveal.poisonRevealed) {
    const fatalGraphic = reveal.ready && reveal.poisoned;
    const image = el.revealGraphic.querySelector("img");
    image.src = fatalGraphic ? "assets/death-reveal.png" : "assets/poisoning-reveal.png";
    image.alt = fatalGraphic ? "An overturned goblet and snuffed candle mark a fatal drink." : "Poison vapor rising from a glass.";
    el.revealGraphic.classList.toggle("fatal", fatalGraphic);
  }

  if (reveal.ready) {
    el.revealResult.textContent = reveal.poisoned
      ? `${reveal.glassName} dies. Press End Game to reveal who won.`
      : reveal.poisonRevealed
        ? "Poison appeared, but the Antidote cancels it. The drinker survives."
        : "No Poison appeared. The drinker survives.";
  } else {
    el.revealResult.textContent = reveal.step === 0 ? "The first card waits facedown..." : "The second card waits facedown...";
  }

  el.revealContinueBtn.disabled = !reveal.ready;
  el.revealContinueBtn.textContent = reveal.ready ? reveal.poisoned ? "End Game" : "Continue" : "Revealing...";
  scheduleRevealSequence();
}

function revealCardView(card, revealed) {
  if (!revealed) {
    return `
      <div class="reveal-card facedown">
        <span class="card-back-mark" aria-hidden="true">III</span>
        <strong>Hidden</strong>
      </div>
    `;
  }

  return `
    <div class="reveal-card ${card.kind} flipped">
      <img src="${card.image}" alt="" aria-hidden="true" />
      <strong>${card.name}</strong>
    </div>
  `;
}

function scheduleRevealSequence() {
  if (!state.reveal || state.reveal.started) return;
  state.reveal.started = true;

  window.setTimeout(() => {
    if (!state.reveal) return;
    state.reveal.step = 1;
    render();
  }, 700);

  window.setTimeout(() => {
    if (!state.reveal) return;
    state.reveal.step = 2;
    render();
  }, 1850);

  window.setTimeout(() => {
    if (!state.reveal) return;
    state.reveal.ready = true;
    render();
  }, 2900);
}

function cardButton(card, ownerIndex) {
  const hiddenFromPlayer = ownerIndex !== 0;
  if (hiddenFromPlayer) {
    const label = state.mode === "computer" ? "Computer's drawn card" : `Player ${ownerIndex + 1}'s drawn card`;
    return `
      <button class="card facedown" type="button" disabled aria-label="${label} is hidden">
        <span class="card-back-mark" aria-hidden="true">III</span>
        <strong>Hidden card</strong>
        <span>Placed secretly when this player acts.</span>
      </button>
    `;
  }

  return `
    <div class="card ${card.kind}" aria-label="Current drawn card: ${card.name}">
      <img class="card-art" src="${card.image}" alt="" aria-hidden="true" />
      <span class="card-mark" aria-hidden="true">${card.kind === "danger" ? "!" : card.kind === "safe" ? "+" : "~"}</span>
      <strong>${card.name}</strong>
      <span>${card.text}</span>
    </div>
  `;
}

function glassView(glass) {
  const totalKnownToTester = glass.stack.length === 0 ? "empty" : `${glass.stack.length}/${GLASS_LIMIT} units`;
  const safety = glass.index === 0 ? state.players[0].safeTastes : glass.index === 2 ? state.players[1].safeTastes : glass.drinks;
  const safetyLabel = glass.index === 1 ? "Drinks" : "Safe drinks";
  const fillPercent = Math.min(86, 12 + glass.stack.length * 16);
  const glassTone = glass.index === 1 ? "silent" : "player";
  const poisonClass = glass.knownPoisoned ? "known-poisoned" : "";
  const poisonMarker = glass.knownPoisoned ? `<span class="poison-marker">Known poison</span>` : "";
  const deadClass = state.deadGlassIndex === glass.index ? "death-site" : "";
  const deathMarker = state.deadGlassIndex === glass.index ? `<span class="death-marker">${state.deadLabel}</span><span class="broken-marker">Broken glass</span>` : "";
  const disabledClass = glass.disabled ? "out-of-play" : "";
  const outOfPlayMarker = glass.disabled ? `<span class="out-of-play-marker">Out of play</span>` : "";
  return `
    <article class="glass ${glassTone} ${poisonClass} ${deadClass} ${disabledClass}" data-glass-target="${glass.index}">
      <div>
        <h3>${glass.name}</h3>
        <div class="glass-stats">
          <span>${totalKnownToTester}</span>
          <span>${safetyLabel}: ${safety}</span>
          ${poisonMarker}
          ${deathMarker}
          ${outOfPlayMarker}
        </div>
      </div>
      <div class="glass-illustration" aria-hidden="true">
        <img class="glass-art" src="${glassImages[glass.index]}" alt="" />
        ${state.deadGlassIndex === glass.index ? `<div class="crack-lines"></div>` : ""}
        <div class="liquid-meter" style="height: ${glass.stack.length ? fillPercent : 8}%"></div>
      </div>
      <div class="glass-stack" aria-label="Hidden cards in ${glass.name}'s glass">
        ${glass.stack.map((card) => `<div class="stack-card hidden">Hidden unit from Player ${card.placedBy + 1}</div>`).join("") || `<div class="stack-card">No cards</div>`}
      </div>
      <div class="glass-actions">
        <button type="button" data-glass="${glass.index}" ${glass.disabled || state.gameOver || isRevealActive() || activePlayer().hand.length === 0 || isComputerTurn() ? "disabled" : ""}>Place Here</button>
        <button class="secondary" type="button" data-drink="${glass.index}" ${glass.disabled || state.gameOver || isRevealActive() || glass.stack.length < GLASS_LIMIT || isComputerTurn() ? "disabled" : ""}>Drink</button>
      </div>
    </article>
  `;
}

function bindDynamicEvents() {
  document.querySelectorAll("[data-glass]").forEach((button) => {
    button.addEventListener("click", () => placeSelectedCard(Number(button.dataset.glass)));
  });
  document.querySelectorAll("[data-glass-target]").forEach((glass) => {
    glass.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      placeSelectedCard(Number(glass.dataset.glassTarget));
    });
  });
  document.querySelectorAll("[data-drink]").forEach((button) => {
    button.addEventListener("click", () => manualDrink(Number(button.dataset.drink)));
  });
}

document.querySelectorAll(".reveal-btn").forEach((button) => {
  button.addEventListener("click", () => toggleRole(Number(button.dataset.player)));
});

document.querySelectorAll("[data-force-poisoner]").forEach((button) => {
  button.addEventListener("click", () => forcePoisoner(button.dataset.forcePoisoner));
});

el.passBtn.addEventListener("click", passTurn);
el.newGameBtn.addEventListener("click", newGame);
el.debugBtn.addEventListener("click", toggleDebug);
el.modeSelect.addEventListener("change", newGame);
el.revealContinueBtn.addEventListener("click", completeDrinkReveal);

newGame();
