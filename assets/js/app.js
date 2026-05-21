'use strict';

const STORAGE_KEYS = { bestStreak: "romajiBestStreak" };

const GAME_SETTINGS = {
  initialTextSpeedPxPerSecond: 42,
  speedIncreasePerStreak: 10,
  nextLessonDelayMs: 180,
  keyFlashDurationMs: 180,
  maxFrameDeltaSeconds: 0.05,
  goalTriggerTextRatio: 0.5,
  wrongInputVibrationMs: 35,
  missedLessonVibrationMs: 140,
  missedLessonEffectMs: 280
};

const KEY_PLACEHOLDERS = { spacer: "spacer", blank: "blank" };

const KEYBOARD_ROWS = [
  { className: "row-10", keys: ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"] },
  { className: "row-9", keys: [KEY_PLACEHOLDERS.spacer, "a", "s", "d", "f", "g", "h", "j", "k", "l", KEY_PLACEHOLDERS.spacer] },
  { className: "row-7", keys: [KEY_PLACEHOLDERS.blank, "z", "x", "c", "v", "b", "n", "m", KEY_PLACEHOLDERS.spacer] }
];

// 出題単語と、画面に表示する標準ローマ字。
// 標準表示はヘボン式を基本にする。ただし練習アプリの入力ルールとして、末尾の「ん」は nn に正規化する。
const HEPBURN_ROMAJI_LESSONS = [
  ["あさ", "asa"], ["いえ", "ie"], ["うみ", "umi"], ["えき", "eki"], ["おと", "oto"],
  ["あめ", "ame"], ["ゆき", "yuki"], ["かぜ", "kaze"], ["そら", "sora"], ["つき", "tsuki"],
  ["ほし", "hoshi"], ["はな", "hana"], ["ねこ", "neko"], ["いぬ", "inu"], ["とり", "tori"],
  ["さかな", "sakana"], ["むし", "mushi"], ["うし", "ushi"], ["うま", "uma"], ["くま", "kuma"],
  ["さる", "saru"], ["しか", "shika"], ["かめ", "kame"], ["いす", "isu"], ["つくえ", "tsukue"],
  ["ほん", "hon"], ["かみ", "kami"], ["えんぴつ", "enpitsu"], ["ぺん", "pen"], ["かばん", "kaban"],
  ["くつ", "kutsu"], ["かさ", "kasa"], ["まど", "mado"], ["とけい", "tokei"], ["てがみ", "tegami"],
  ["でんわ", "denwa"], ["くるま", "kuruma"], ["でんしゃ", "densha"], ["みせ", "mise"], ["まち", "machi"],
  ["こうえん", "kouen"], ["くうこう", "kuukou"], ["にほん", "nihon"], ["えいご", "eigo"], ["えいが", "eiga"],
  ["おんがく", "ongaku"], ["しゃしん", "shashin"], ["しんぶん", "shinbun"], ["ざっし", "zasshi"], ["きって", "kitte"],
  ["きっぷ", "kippu"], ["がっこう", "gakkou"], ["せんせい", "sensei"], ["かぞく", "kazoku"], ["ともだち", "tomodachi"],
  ["りょこう", "ryokou"], ["ひこうき", "hikouki"], ["びょういん", "byouin"], ["ごはん", "gohan"], ["おちゃ", "ocha"],
  ["みず", "mizu"], ["すし", "sushi"], ["りんご", "ringo"], ["みかん", "mikan"], ["ばなな", "banana"],
  ["いちご", "ichigo"], ["たまご", "tamago"], ["やさい", "yasai"], ["にく", "niku"], ["ぱん", "pan"],
  ["あした", "ashita"], ["きのう", "kinou"], ["きょう", "kyou"], ["あそぶ", "asobu"], ["あるく", "aruku"],
  ["はしる", "hashiru"], ["みる", "miru"], ["きく", "kiku"], ["よむ", "yomu"], ["かく", "kaku"],
  ["のむ", "nomu"], ["ねる", "neru"], ["おきる", "okiru"], ["おはよう", "ohayou"], ["おやすみ", "oyasumi"],
  ["みかん", "mikan"], ["かばん", "kaban"], ["ふとん", "futon"], ["きりん", "kirin"], ["ごはん", "gohan"],
  ["びん", "bin"], ["ぱん", "pan"]
];

const SOUND_PRESETS = {
  correctKey: { notes: [760], durationSeconds: 0.055, volume: 0.045, waveType: "sine" },
  wrongKey: { notes: [150], durationSeconds: 0.09, volume: 0.06, waveType: "sawtooth" },
  missedLesson: {
    notes: [220, 150, 95, 62],
    durationSeconds: 1,
    volume: 0.1,
    waveType: "sawtooth",
    fadeInSeconds: 0.012,
    tailVolume: 0.00001
  },
  lessonComplete: {
    notes: [784, 988, 1175, 1568],
    durationSeconds: 0.34,
    volume: 0.09,
    waveType: "square",
    sparkle: {
      notes: [2093, 2637],
      startDelaySeconds: 0.09,
      firstNoteOffsetSeconds: 0.1,
      secondNoteOffsetSeconds: 0.24,
      fadeInOffsetSeconds: 0.11,
      fadeOutOffsetSeconds: 0.34,
      stopOffsetSeconds: 0.36,
      volume: 0.045,
      waveType: "triangle"
    }
  }
};

const dom = getDomElements();
const lessons = createLessons(HEPBURN_ROMAJI_LESSONS);
let lessonQueue = createShuffledLessonQueue();
const game = createInitialGameState();

function getDomElements() {
  const byId = (id) => document.getElementById(id);
  return {
    app: document.querySelector(".app"),
    status: byId("gameStatus"),
    keyboardWrap: document.querySelector(".keyboard-wrap"),
    keyboard: byId("keyboard"),
    textLane: byId("textLane"),
    movingText: byId("movingText"),
    japanese: byId("japanese"),
    romajiTarget: byId("romajiTarget"),
    scoreMask: byId("scoreMask"),
    streakCount: byId("streakCount"),
    bestCount: byId("bestCount")
  };
}

function announceStatus(message) {
  if (!dom.status) return;
  dom.status.textContent = message;
}

function createLessons(hepburnRomajiLessons) {
  const uniqueLessons = removeDuplicateLessons(hepburnRomajiLessons);
  return uniqueLessons
    .filter(([japanese]) => japanese.length <= 4)
    .map(([japanese, hepburnRomaji]) => {
      const normalizedHepburnRomaji = normalizeLessonRomaji(japanese, hepburnRomaji);
      return {
        japanese,
        displayRomaji: normalizedHepburnRomaji,
        acceptedRomaji: createRomajiVariants(normalizedHepburnRomaji)
      };
    });
}

function removeDuplicateLessons(rawLessons) {
  const seen = new Set();
  return rawLessons.filter(([japanese]) => {
    if (seen.has(japanese)) return false;
    seen.add(japanese);
    return true;
  });
}

function normalizeLessonRomaji(japanese, romaji) {
  if (japanese.endsWith("ん") && romaji.endsWith("n") && !romaji.endsWith("nn")) {
    return `${romaji}n`;
  }
  return romaji;
}

function createInitialGameState() {
  const lessonIndex = drawLessonIndex();
  const firstLesson = lessons[lessonIndex];
  return {
    lessonIndex,
    typedText: "",
    displayedRomaji: firstLesson.displayRomaji,
    streak: 0,
    bestStreak: Number(localStorage.getItem(STORAGE_KEYS.bestStreak) || 0),
    movingTextX: 0,
    textSpeedPxPerSecond: GAME_SETTINGS.initialTextSpeedPxPerSecond,
    isInputLocked: false,
    lastAnimationTime: null,
    animationFrameId: null,
    audioContext: null
  };
}

function createRomajiVariants(hepburnRomaji) {
  const rules = [
    ["shi", ["shi", "si", "ci"]],
    ["chi", ["chi", "ti"]],
    ["tsu", ["tsu", "tu"]],
    ["fu", ["fu", "hu"]],
    ["ji", ["ji", "zi"]],
    ["sha", ["sha", "sya"]],
    ["shu", ["shu", "syu"]],
    ["sho", ["sho", "syo"]],
    ["cha", ["cha", "tya", "cya"]],
    ["chu", ["chu", "tyu", "cyu"]],
    ["cho", ["cho", "tyo", "cyo"]],
    ["ja", ["ja", "zya", "jya"]],
    ["ju", ["ju", "zyu", "jyu"]],
    ["jo", ["jo", "zyo", "jyo"]],
    ["kya", ["kya"]], ["kyu", ["kyu"]], ["kyo", ["kyo"]],
    ["gya", ["gya"]], ["gyu", ["gyu"]], ["gyo", ["gyo"]],
    ["nya", ["nya"]], ["nyu", ["nyu"]], ["nyo", ["nyo"]],
    ["hya", ["hya"]], ["hyu", ["hyu"]], ["hyo", ["hyo"]],
    ["bya", ["bya"]], ["byu", ["byu"]], ["byo", ["byo"]],
    ["pya", ["pya"]], ["pyu", ["pyu"]], ["pyo", ["pyo"]],
    ["mya", ["mya"]], ["myu", ["myu"]], ["myo", ["myo"]],
    ["rya", ["rya"]], ["ryu", ["ryu"]], ["ryo", ["ryo"]],
    ["ka", ["ka", "ca"]], ["ku", ["ku", "cu", "qu"]], ["ko", ["ko", "co"]],
    ["se", ["se", "ce"]]
  ];

  const variants = expandRomajiByRules(hepburnRomaji, rules);
  addSmallTsuVariants(variants);
  return Array.from(variants).sort((a, b) => {
    if (a === hepburnRomaji) return -1;
    if (b === hepburnRomaji) return 1;
    return a.length - b.length || a.localeCompare(b);
  });
}

function expandRomajiByRules(text, rules) {
  const segments = [];
  let index = 0;

  while (index < text.length) {
    const matchedRule = rules.find(([base]) => text.startsWith(base, index));
    if (matchedRule) {
      segments.push(matchedRule[1]);
      index += matchedRule[0].length;
    } else {
      segments.push([text[index]]);
      index += 1;
    }
  }

  return segments.reduce((results, choices) => {
    const nextResults = new Set();
    results.forEach((prefix) => {
      choices.forEach((choice) => {
        nextResults.add(prefix + choice);
      });
    });
    return nextResults;
  }, new Set([""]));
}

function addSmallTsuVariants(variants) {
  const originals = Array.from(variants);
  const consonants = "bcdfghjklmpqrstvwxyz";
  const smallTsuInputs = ["ltu", "xtu", "ltsu", "xtsu"];

  originals.forEach((variant) => {
    for (let index = 0; index < variant.length - 1; index += 1) {
      const char = variant[index];
      if (char !== variant[index + 1] || !consonants.includes(char)) continue;

      smallTsuInputs.forEach((smallTsu) => {
        variants.add(variant.slice(0, index) + smallTsu + variant.slice(index + 1));
      });
    }
  });
}

function getMatchingRomaji(inputText) {
  return lessons[game.lessonIndex].acceptedRomaji.find((romaji) => romaji.startsWith(inputText));
}

function isLessonCompleted() {
  return lessons[game.lessonIndex].acceptedRomaji.includes(game.typedText);
}

function createShuffledLessonQueue() {
  const indexes = Array.from({ length: lessons.length }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [indexes[index], indexes[randomIndex]] = [indexes[randomIndex], indexes[index]];
  }
  return indexes;
}

function drawLessonIndex(previousIndex = -1) {
  if (lessons.length < 2) return 0;
  if (lessonQueue.length === 0) lessonQueue = createShuffledLessonQueue();

  if (lessonQueue[0] === previousIndex && lessonQueue.length > 1) {
    const swapIndex = 1 + Math.floor(Math.random() * (lessonQueue.length - 1));
    [lessonQueue[0], lessonQueue[swapIndex]] = [lessonQueue[swapIndex], lessonQueue[0]];
  }

  return lessonQueue.shift();
}

function escapeHtml(text) {
  const htmlEscapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" };
  return text.replace(/[&<>'"]/g, (char) => htmlEscapes[char]);
}

function buildKeyboard() {
  dom.keyboard.innerHTML = "";
  KEYBOARD_ROWS.forEach(({ className, keys }) => {
    const row = document.createElement("div");
    row.className = `row ${className}`;
    keys.forEach((key) => row.appendChild(createKeyboardCell(key)));
    dom.keyboard.appendChild(row);
  });
}

function createKeyboardCell(key) {
  if (key === KEY_PLACEHOLDERS.spacer) return createSpacerCell();
  if (key === KEY_PLACEHOLDERS.blank) return createBlankCell();
  return createLetterKey(key);
}

function createSpacerCell() {
  const spacer = document.createElement("div");
  spacer.className = "spacer";
  return spacer;
}

function createBlankCell() {
  const blank = document.createElement("div");
  blank.className = "blank-key";
  blank.setAttribute("aria-hidden", "true");
  return blank;
}

function createLetterKey(key) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "key";
  button.dataset.key = key;
  button.textContent = key;
  button.addEventListener("click", () => {
    handleLetterInput(key, button);
  });
  return button;
}

function renderGame() {
  const lesson = lessons[game.lessonIndex];
  dom.japanese.textContent = lesson.japanese;
  dom.romajiTarget.innerHTML = createRomajiProgressHtml(game.displayedRomaji, game.typedText.length);
  dom.streakCount.textContent = game.streak;
  dom.bestCount.textContent = game.bestStreak;
  updateMovingTextPosition();
  updateRotateHintLayout();
}

function createRomajiProgressHtml(romaji, typedLength) {
  const typedPart = romaji.slice(0, typedLength);
  const currentCharacter = romaji.slice(typedLength, typedLength + 1);
  const remainingPart = romaji.slice(typedLength + 1);
  return [
    `<span class="done">${escapeHtml(typedPart)}</span>`,
    `<span class="current">${escapeHtml(currentCharacter)}</span>`,
    `<span class="remaining">${escapeHtml(remainingPart)}</span>`
  ].join("");
}

function handleLetterInput(key, button) {
  void unlockAudio();
  if (game.isInputLocked) return;
  processTypedLetter(key, button);
}

function processTypedLetter(key, button) {
  const nextTypedText = game.typedText + key;
  const matchingRomaji = getMatchingRomaji(nextTypedText);
  if (!matchingRomaji) {
    handleWrongLetter(button);
    return;
  }
  handleCorrectLetter(button, nextTypedText, matchingRomaji);
}

function handleCorrectLetter(button, nextTypedText, matchingRomaji) {
  playSound("correctKey");
  flashKey(button, "active");
  game.typedText = nextTypedText;
  game.displayedRomaji = matchingRomaji;
  if (isLessonCompleted()) {
    completeCurrentLesson();
    return;
  }
  renderGame();
}

function handleWrongLetter(button) {
  playSound("wrongKey");
  flashKey(button, "wrong");
  vibrateOnWrongInput();
  renderGame();
}

function completeCurrentLesson() {
  game.isInputLocked = true;
  game.streak += 1;
  const isNewBest = game.streak > game.bestStreak;
  showScoreEffect(isNewBest);
  saveBestStreakIfNeeded();
  updateTextSpeed();
  playSound("lessonComplete");
  announceStatus(isNewBest ? `正解。新記録です。連続 ${game.streak} 問。` : `正解。連続 ${game.streak} 問。`);
  renderGame();
  setTimeout(startNextLesson, GAME_SETTINGS.nextLessonDelayMs);
}

function showScoreEffect(isNewBest) {
  const targetElement = isNewBest ? dom.bestCount : dom.streakCount;
  const scoreRect = targetElement.getBoundingClientRect();
  const effect = document.createElement("div");
  effect.className = `score-effect ${isNewBest ? "new-best" : "plus-one"}`;
  effect.textContent = isNewBest ? "🏆 Best" : "+1";
  const horizontalOffset = isNewBest ? -28 : 0;
  effect.style.left = `${scoreRect.left + scoreRect.width / 2 + horizontalOffset}px`;
  effect.style.top = `${scoreRect.top - 4}px`;
  document.body.appendChild(effect);
  effect.addEventListener("animationend", () => effect.remove(), { once: true });
}

function saveBestStreakIfNeeded() {
  if (game.streak <= game.bestStreak) return;
  game.bestStreak = game.streak;
  localStorage.setItem(STORAGE_KEYS.bestStreak, String(game.bestStreak));
}

function handleMissedLesson() {
  if (isLessonCompleted() || game.isInputLocked) return;

  game.isInputLocked = true;
  game.streak = 0;
  updateTextSpeed();
  playSound("missedLesson");
  vibrateOnMissedLesson();
  showMissedLessonEffect();
  announceStatus("時間切れ。連続記録をリセットして次のお題に進みます。");
  renderGame();
  setTimeout(startNextLesson, GAME_SETTINGS.missedLessonEffectMs);
}

function showMissedLessonEffect() {
  dom.app.classList.remove("missed");
  void dom.app.offsetWidth;
  dom.app.classList.add("missed");
  setTimeout(() => dom.app.classList.remove("missed"), GAME_SETTINGS.missedLessonEffectMs);
}

function startNextLesson() {
  game.lessonIndex = drawLessonIndex(game.lessonIndex);
  game.typedText = "";
  game.displayedRomaji = lessons[game.lessonIndex].displayRomaji;
  game.isInputLocked = false;
  resetMovingText();
  renderGame();
  announceStatus(`次のお題。${lessons[game.lessonIndex].japanese}。${game.displayedRomaji} を入力してください。`);
}

function updateTextSpeed() {
  game.textSpeedPxPerSecond = GAME_SETTINGS.initialTextSpeedPxPerSecond + game.streak * GAME_SETTINGS.speedIncreasePerStreak;
}

function resetMovingText() {
  game.movingTextX = 0;
  game.lastAnimationTime = null;
  updateMovingTextPosition();
}

function updateMovingTextPosition() {
  dom.movingText.style.transform = `translate(${game.movingTextX}px, -50%)`;
}

function hasMovingTextReachedGoal() {
  const goalLineX = dom.textLane.clientWidth - dom.scoreMask.offsetWidth;
  const movingTextTriggerX = game.movingTextX + dom.movingText.offsetWidth * GAME_SETTINGS.goalTriggerTextRatio;
  return movingTextTriggerX > goalLineX;
}

function startTextAnimation() {
  cancelAnimationFrame(game.animationFrameId);
  const animate = (time) => {
    advanceMovingText(time);
    if (hasMovingTextReachedGoal()) {
      handleMissedLesson();
    } else {
      updateMovingTextPosition();
    }
    game.animationFrameId = requestAnimationFrame(animate);
  };
  game.animationFrameId = requestAnimationFrame(animate);
}

function advanceMovingText(time) {
  if (game.lastAnimationTime === null) game.lastAnimationTime = time;
  const deltaSeconds = Math.min((time - game.lastAnimationTime) / 1000, GAME_SETTINGS.maxFrameDeltaSeconds);
  game.lastAnimationTime = time;
  game.movingTextX += game.textSpeedPxPerSecond * deltaSeconds;
}

function flashKey(button, className) {
  if (!button) return;
  button.classList.add(className);
  setTimeout(() => button.classList.remove(className), GAME_SETTINGS.keyFlashDurationMs);
}

async function unlockAudio() {
  if (!game.audioContext) {
    game.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (game.audioContext.state === "suspended") {
    await game.audioContext.resume();
  }
}

function playSound(soundName) {
  const preset = SOUND_PRESETS[soundName];
  if (!preset || !game.audioContext || game.audioContext.state !== "running") return;
  playToneSequence(preset);
  if (preset.sparkle) playSparkle(preset.sparkle);
}

function playToneSequence(preset) {
  const ctx = game.audioContext;
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const noteDurationSeconds = preset.durationSeconds / preset.notes.length;
  oscillator.type = preset.waveType;
  preset.notes.forEach((note, index) => {
    oscillator.frequency.setValueAtTime(note, now + noteDurationSeconds * index);
  });
  fadeOutGain(gain, now, preset.volume, preset.durationSeconds, preset.fadeInSeconds, preset.tailVolume);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + preset.durationSeconds + 0.01);
}

function playSparkle(preset) {
  const ctx = game.audioContext;
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = preset.waveType;
  oscillator.frequency.setValueAtTime(preset.notes[0], now + preset.firstNoteOffsetSeconds);
  oscillator.frequency.setValueAtTime(preset.notes[1], now + preset.secondNoteOffsetSeconds);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(preset.volume, now + preset.fadeInOffsetSeconds);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.fadeOutOffsetSeconds);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now + preset.startDelaySeconds);
  oscillator.stop(now + preset.stopOffsetSeconds);
}

function fadeOutGain(gain, startTime, peakVolume, durationSeconds, fadeInSeconds = 0.006, tailVolume = 0.0001) {
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakVolume, startTime + fadeInSeconds);
  gain.gain.exponentialRampToValueAtTime(tailVolume, startTime + durationSeconds);
}

function vibrateOnWrongInput() {
  if (navigator.vibrate) navigator.vibrate(GAME_SETTINGS.wrongInputVibrationMs);
}

function vibrateOnMissedLesson() {
  if (navigator.vibrate) navigator.vibrate(GAME_SETTINGS.missedLessonVibrationMs);
}

function handlePhysicalKeyboardInput(event) {
  const key = event.key.toLowerCase();
  if (!/^[a-z\-']$/.test(key)) return;
  const button = document.querySelector(`[data-key="${CSS.escape(key)}"]`);
  handleLetterInput(key, button);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // sw.js がまだ置かれていない環境では何もしない
    });
  });
}

function startGame() {
  buildKeyboard();
  resetMovingText();
  renderGame();
  announceStatus(`お題は ${lessons[game.lessonIndex].japanese}。${lessons[game.lessonIndex].displayRomaji} を入力してください。`);
  startTextAnimation();
  registerServiceWorker();
  document.addEventListener("keydown", handlePhysicalKeyboardInput);
}

startGame();
