const MAX_LENGTH = 30;

const boardEl = document.getElementById("board");
const turnText = document.getElementById("turnText");
const progressEl = document.getElementById("progress");
const analysisEl = document.getElementById("analysisText");
const evalBox = document.getElementById("evalBox");
const evalFill = document.getElementById("evalFill");
const evalText = document.getElementById("evalText");

const modeEl = document.getElementById("mode");
const sideEl = document.getElementById("side");
const difficultyEl = document.getElementById("difficulty");
const highlight5El = document.getElementById("highlight5");
const highlight3El = document.getElementById("highlight3");
const showEvalEl = document.getElementById("showEval");
const showThinkingEl = document.getElementById("showThinking");

const newGameBtn = document.getElementById("newGame");
const oButton = document.getElementById("oButton");
const xButton = document.getElementById("xButton");

const thinkingStatus = document.getElementById("thinkingStatus");
const reasonBox = document.getElementById("reasonBox");
const candidateBox = document.getElementById("candidateBox");

let game = null;
let gameTimer = null;

// ============================================================
// ルール
// ============================================================

function maxNonOverlappingCount(s, pattern) {
    let count = 0;
    let i = 0;

    while (i <= s.length - pattern.length) {
        if (s.substring(i, i + pattern.length) === pattern) {
            count++;
            i += pattern.length;
        } else {
            i++;
        }
    }
    return count;
}

function findBestPattern(s, length) {
    if (!s || s.length < length) {
        return { count: 0, pattern: null, ranges: [] };
    }

    const patterns = new Set();

    for (let i = 0; i <= s.length - length; i++) {
        patterns.add(s.substring(i, i + length));
    }

    let bestCount = 0;
    let bestPattern = null;

    for (const pattern of patterns) {
        const count = maxNonOverlappingCount(s, pattern);

        if (count > bestCount) {
            bestCount = count;
            bestPattern = pattern;
        }
    }

    const ranges = [];

    if (bestPattern !== null) {
        let i = 0;

        while (i <= s.length - length) {
            if (s.substring(i, i + length) === bestPattern) {
                ranges.push({
                    start: i,
                    end: i + length - 1
                });
                i += length;
            } else {
                i++;
            }
        }
    }

    return { count: bestCount, pattern: bestPattern, ranges };
}

function getProgress(s) {
    s = s || "";
    const p5 = findBestPattern(s, 5);
    const p3 = findBestPattern(s, 3);

    return {
        firstCount: p5.count,
        secondCount: p3.count,
        p5,
        p3
    };
}

function winnerFor(s, lastPlayer) {
    const p = getProgress(s);

    const firstWin = p.firstCount >= 2;
    const secondWin = p.secondCount >= 4;

    if (firstWin && secondWin) return lastPlayer;
    if (firstWin) return "first";
    if (secondWin) return "second";

    return null;
}

// ============================================================
// 強調表示
// ============================================================

function getHighlightIndices(s) {
    const h5 = new Set();
    const h3 = new Set();

    const p5 = findBestPattern(s, 5);
    const p3 = findBestPattern(s, 3);

    if (highlight5El.checked) {
        for (const range of p5.ranges) {
            for (let i = range.start; i <= range.end; i++) h5.add(i);
        }
    }

    if (highlight3El.checked) {
        for (const range of p3.ranges) {
            for (let i = range.start; i <= range.end; i++) h3.add(i);
        }
    }

    return { h5, h3 };
}

function render() {
    if (!game) return;

    const s = game.s || "";
    const { h5, h3 } = getHighlightIndices(s);

    boardEl.innerHTML = "";

    for (let i = 0; i < s.length; i++) {
        const cell = document.createElement("span");
        cell.classList.add("cell", s[i]);

        if (h5.has(i)) cell.classList.add("h5");
        if (h3.has(i)) cell.classList.add("h3");
        if (i === game.lastIndex) cell.classList.add("last");

        cell.textContent = s[i];
        boardEl.appendChild(cell);
    }

    const p = getProgress(s);

    progressEl.textContent =
        `先手：長さ5「${p.p5.pattern ?? "—"}」 ${p.firstCount}/2個` +
        `　｜　後手：長さ3「${p.p3.pattern ?? "—"}」 ${p.secondCount}/4個`;

    if (game.over) {
        if (game.winner === null) {
            turnText.textContent = "両者敗北（最大長に到達）";
        } else {
            const name = game.mode === "watch"
                ? (game.winner === "first" ? "先手AI" : "後手AI")
                : (game.winner === game.human ? "あなた" : "AI");
            turnText.textContent = `${name}の勝利！`;
        }
    } else if (game.mode === "watch") {
        turnText.textContent =
            game.turn === "first" ? "先手AIの番" : "後手AIの番";
    } else if (game.turn === game.human) {
        turnText.textContent = "あなたの番：o または x";
    } else {
        turnText.textContent = "AIが考えています…";
    }

    updateEvaluation();
    updateAnalysis();
}

// ============================================================
// AI評価
// ============================================================

function immediateWinningActions(s, player) {
    const result = [];

    for (const action of ["o", "x"]) {
        if (winnerFor(s + action, player) === player) {
            result.push(action);
        }
    }

    return result;
}

function heuristic(s, player) {
    const p = getProgress(s);

    const own = player === "first"
        ? p.firstCount / 2
        : p.secondCount / 4;

    const opponent = player === "first"
        ? p.secondCount / 4
        : p.firstCount / 2;

    let score = 100 * own - 90 * opponent;

    score += 35 * immediateWinningActions(s, player).length;

    const other = player === "first" ? "second" : "first";
    score -= 45 * immediateWinningActions(s, other).length;

    return score;
}

function chooseWeakDetailed(s, player) {
    const wins = immediateWinningActions(s, player);

    if (wins.length && Math.random() < 0.85) {
        return wins[Math.floor(Math.random() * wins.length)];
    }

    return Math.random() < 0.5 ? "o" : "x";
}

function minimax(s, playerToMove, rootPlayer, depth, alpha, beta, lastPlayer, table) {
    const winner = winnerFor(s, lastPlayer);

    if (winner !== null) {
        return winner === rootPlayer ? 100000 + depth : -100000 - depth;
    }

    if (s.length >= MAX_LENGTH) return 0;
    if (depth === 0) return heuristic(s, rootPlayer);

    const key = `${s}|${playerToMove}|${rootPlayer}|${depth}|${lastPlayer}`;

    if (table.has(key)) return table.get(key);

    const nextPlayer = playerToMove === "first" ? "second" : "first";
    const maximizing = playerToMove === rootPlayer;

    let value = maximizing ? -Infinity : Infinity;

    for (const action of ["o", "x"]) {
        const v = minimax(
            s + action,
            nextPlayer,
            rootPlayer,
            depth - 1,
            alpha,
            beta,
            playerToMove,
            table
        );

        if (maximizing) {
            value = Math.max(value, v);
            alpha = Math.max(alpha, value);
        } else {
            value = Math.min(value, v);
            beta = Math.min(beta, value);
        }

        if (beta <= alpha) break;
    }

    table.set(key, value);
    return value;
}

/*
 * 「思考過程」は内部の隠れた推論をそのまま表示するのではなく、
 * AIが実際に比較した候補手と、その評価指標を人間向けに要約して表示する。
 */
function explainAction(s, player, action, score, method) {
    const ns = s + action;
    const win = winnerFor(ns, player);

    if (win === player) {
        return `${action}：この手で勝利条件が成立するため、最優先。`;
    }

    const other = player === "first" ? "second" : "first";
    const opponentWins = immediateWinningActions(ns, other);

    const p = getProgress(ns);

    const ownCount = player === "first" ? p.firstCount : p.secondCount;
    const need = player === "first" ? 2 : 4;

    if (opponentWins.length) {
        return `${action}：自分の進行度は ${ownCount}/${need}。ただし相手に次手の勝機を残すため評価が低下。`;
    }

    return `${action}：勝利条件への進行度 ${ownCount}/${need}、局面評価 ${score.toFixed(1)}。${method}`;
}

function analyzeCandidates(s, player, difficulty) {
    const candidates = [];

    if (difficulty === "weak") {
        for (const action of ["o", "x"]) {
            let score = heuristic(s + action, player);
            if (winnerFor(s + action, player) === player) score = 100000;
            candidates.push({
                action,
                score,
                reason: explainAction(
                    s, player, action, score,
                    "弱AIは勝てる手を優先し、それ以外ではランダム性を残します。"
                )
            });
        }
    } else if (difficulty === "medium") {
        const other = player === "first" ? "second" : "first";

        for (const action of ["o", "x"]) {
            const ns = s + action;
            let score;

            if (winnerFor(ns, player) === player) {
                score = 100000;
            } else {
                score = heuristic(ns, player);
                score -= 150 * immediateWinningActions(ns, other).length;
            }

            candidates.push({
                action,
                score,
                reason: explainAction(
                    s, player, action, score,
                    "中AIは自分の進行度と相手の次手の勝機を比較します。"
                )
            });
        }
    } else {
        const depth = s.length < 10 ? 9 : s.length < 18 ? 8 : 10;
        const table = new Map();

        for (const action of ["o", "x"]) {
            const score = minimax(
                s + action,
                player === "first" ? "second" : "first",
                player,
                depth - 1,
                -Infinity,
                Infinity,
                player,
                table
            );

            candidates.push({
                action,
                score,
                reason: explainAction(
                    s, player, action, score,
                    `強AIは最大${depth - 1}手程度先まで探索して比較します。`
                )
            });
        }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
}

function getAiDecision(s, player, difficulty) {
    const candidates = analyzeCandidates(s, player, difficulty);
    const bestScore = candidates[0].score;

    let best = candidates.filter(c => c.score === bestScore);

    // 弱AIだけは、勝利手以外に意図的なランダム性を持たせる
    if (difficulty === "weak" && Math.random() >= 0.85) {
        const action = Math.random() < 0.5 ? "o" : "x";
        return {
            action,
            candidates,
            reason:
                `今回は弱AIのランダム性が働き、${action}を選択しました。` +
                `強い勝利手がある場合は通常そちらを優先します。`
        };
    }

    const chosen = best[Math.floor(Math.random() * best.length)];

    return {
        action: chosen.action,
        candidates,
        reason: chosen.reason
    };
}

function showThinking(info, player, difficulty) {
    if (!showThinkingEl.checked) {
        thinkingStatus.textContent = "AIの思考情報は非表示です。";
        thinkingStatus.classList.remove("active");
        reasonBox.textContent = "";
        candidateBox.innerHTML = "";
        return;
    }

    thinkingStatus.textContent =
        `${player === "first" ? "先手" : "後手"}AIが ${difficultyLabel(difficulty)} の方式で候補手を比較中…`;
    thinkingStatus.classList.add("active");

    reasonBox.textContent = "候補手を比較しています…";

    candidateBox.innerHTML = info.candidates.map((c, i) => `
        <div class="candidate ${i === 0 ? "best" : ""}">
          <div class="candidate-title">${c.action} ${i === 0 ? "← 最有力" : ""}</div>
          <small>評価値：${Number.isFinite(c.score) ? c.score.toFixed(1) : "—"}</small>
          <small>${escapeHtml(c.reason)}</small>
        </div>
    `).join("");
}

function showDecision(info, player, difficulty) {
    if (!showThinkingEl.checked) return;

    thinkingStatus.textContent =
        `${player === "first" ? "先手" : "後手"}AI：${info.action} を選択`;

    thinkingStatus.classList.remove("active");

    reasonBox.textContent =
        `選択理由：${info.reason}`;

    candidateBox.innerHTML = info.candidates.map((c, i) => `
        <div class="candidate ${c.action === info.action ? "best" : ""}">
          <div class="candidate-title">
            ${c.action} ${c.action === info.action ? "← 選択" : ""}
          </div>
          <small>評価値：${Number.isFinite(c.score) ? c.score.toFixed(1) : "—"}</small>
          <small>${escapeHtml(c.reason)}</small>
        </div>
    `).join("");
}

function difficultyLabel(difficulty) {
    return {
        weak: "弱",
        medium: "中",
        strong: "強"
    }[difficulty] || difficulty;
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// ============================================================
// 有利度
// ============================================================

function evaluatePosition(s, human) {
    if (!s) return 50;

    const ai = human === "first" ? "second" : "first";
    const diff = heuristic(s, human) - heuristic(s, ai);

    const pct = 50 + 45 * Math.tanh(diff / 120);

    return Math.max(0, Math.min(100, pct));
}

function updateEvaluation() {
    if (game.mode === "watch" || !showEvalEl.checked) {
        evalBox.classList.add("hidden");
        return;
    }

    evalBox.classList.remove("hidden");

    const pct = evaluatePosition(game.s, game.human);

    evalFill.style.width = `${pct}%`;
    evalText.textContent = `${pct.toFixed(1)}%`;
}

function updateAnalysis() {
    const p = getProgress(game.s);

    const firstPct = Math.min(100, p.firstCount / 2 * 100);
    const secondPct = Math.min(100, p.secondCount / 4 * 100);

    analysisEl.innerHTML =
        `先手の勝利条件進行度：<b>${firstPct.toFixed(0)}%</b><br>` +
        `後手の勝利条件進行度：<b>${secondPct.toFixed(0)}%</b><br>` +
        `現在の長さ：<b>${game.s.length}</b> / ${MAX_LENGTH}`;
}

// ============================================================
// 人間の手
// ============================================================

function playHuman(action) {
    if (!game || game.over || game.mode !== "human") return;
    if (game.turn !== game.human) return;

    game.s += action;
    game.lastIndex = game.s.length - 1;

    const winner = winnerFor(game.s, game.human);

    if (winner !== null) {
        game.over = true;
        game.winner = winner;
        render();
        return;
    }

    if (game.s.length >= MAX_LENGTH) {
        game.over = true;
        game.winner = null;
        render();
        return;
    }

    game.turn = game.ai;
    render();

    scheduleAiTurn();
}

// ============================================================
// AIの手
// ============================================================

function scheduleAiTurn() {
    clearTimeout(gameTimer);

    gameTimer = setTimeout(aiTurn, 450);
}

function aiTurn() {
    if (!game || game.over) return;

    const player = game.turn;

    if (game.mode === "human" && player !== game.ai) return;

    const info = getAiDecision(
        game.s,
        player,
        difficultyEl.value
    );

    showThinking(info, player, difficultyEl.value);

    // 「思考している」表示を一瞬見せてから着手
    gameTimer = setTimeout(() => {
        if (!game || game.over) return;

        showDecision(info, player, difficultyEl.value);

        game.s += info.action;
        game.lastIndex = game.s.length - 1;

        const winner = winnerFor(game.s, player);

        if (winner !== null) {
            game.over = true;
            game.winner = winner;
            game.turn = null;
            render();
            return;
        }

        if (game.s.length >= MAX_LENGTH) {
            game.over = true;
            game.winner = null;
            game.turn = null;
            render();
            return;
        }

        game.turn =
            player === "first"
                ? "second"
                : "first";

        render();

        if (game.mode === "watch") {
            scheduleAiTurn();
        }
    }, game.mode === "watch" ? 700 : 550);
}

// ============================================================
// 新しいゲーム
// ============================================================

function newGame() {
    clearTimeout(gameTimer);

    const mode = modeEl.value;

    const human = sideEl.value;
    const ai = human === "first" ? "second" : "first";

    game = {
        mode,
        s: "",
        human,
        ai,
        turn: "first",
        lastIndex: -1,
        over: false,
        winner: null
    };

    thinkingStatus.textContent =
        mode === "watch"
            ? "AI同士の対戦を開始します。"
            : "AIはまだ思考していません。";

    thinkingStatus.classList.remove("active");

    reasonBox.textContent =
        mode === "watch"
            ? "各AIが候補手を比較し、選択理由の要約を表示します。"
            : "AIが手を選ぶと、ここに選択理由が表示されます。";

    candidateBox.innerHTML = "";

    // 観戦モードでは「あなたの手番」は不要
    sideEl.disabled = mode === "watch";
    oButton.disabled = mode === "watch";
    xButton.disabled = mode === "watch";

    render();

    if (mode === "watch") {
        scheduleAiTurn();
    } else if (game.turn === game.ai) {
        scheduleAiTurn();
    }
}

// ============================================================
// イベント
// ============================================================

newGameBtn.addEventListener("click", newGame);

oButton.addEventListener("click", () => playHuman("o"));
xButton.addEventListener("click", () => playHuman("x"));

highlight5El.addEventListener("change", render);
highlight3El.addEventListener("change", render);
showEvalEl.addEventListener("change", render);
showThinkingEl.addEventListener("change", render);

modeEl.addEventListener("change", newGame);
sideEl.addEventListener("change", newGame);
difficultyEl.addEventListener("change", newGame);

document.addEventListener("keydown", event => {
    if (event.key.toLowerCase() === "o") playHuman("o");
    if (event.key.toLowerCase() === "x") playHuman("x");
});

newGame();
