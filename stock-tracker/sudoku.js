/**
 * Sudoku game logic — generator, solver, validator.
 * Exposed as a global `Sudoku` namespace.
 */
const Sudoku = (function () {

  /* ──────────────── DIFFICULTY SETTINGS ──────────────── */
  const DIFFICULTIES = {
    'super-easy': { label: 'Super Easy', givenRange: [46, 50], scoreRange: [0, 0] },
    'very-easy':  { label: 'Very Easy',  givenRange: [40, 45], scoreRange: [0, 0] },
    'easy':       { label: 'Easy',       givenRange: [35, 39], scoreRange: [0, 1] },
    'medium':     { label: 'Medium',     givenRange: [30, 34], scoreRange: [0, 11] },
    'hard':       { label: 'Hard',       givenRange: [26, 30], scoreRange: [12, 60] },
    'expert':     { label: 'Expert',     givenRange: [25, 29], scoreRange: [30, 250] },
    'extreme':    { label: 'Extreme',    givenRange: [24, 28], scoreRange: [240, Infinity] },
  };


  /* ──────────────── SEEDED PRNG ──────────────── */

  /** Mulberry32 — fast, high-quality 32-bit seeded PRNG. */
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /** Generate a random 32-bit seed. */
  function randomSeed() {
    return (Math.random() * 4294967296) >>> 0;
  }

  /* ──────────────── HELPERS ──────────────── */

  /** Return a shuffled copy of an array (Fisher-Yates). */
  function shuffle(arr, rng) {
    const a = arr.slice();
    const rand = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Create an empty 9×9 board (all zeros). */
  function emptyBoard() {
    return Array.from({ length: 9 }, () => Array(9).fill(0));
  }

  /** Deep-clone a 9×9 board. */
  function cloneBoard(board) {
    return board.map(row => row.slice());
  }

  /* ──────────────── RULE CHECKING ──────────────── */

  /** Check whether placing `num` at (row, col) violates Sudoku rules. */
  function isValid(board, row, col, num) {
    for (let c = 0; c < 9; c++) {
      if (board[row][c] === num) return false;
    }
    for (let r = 0; r < 9; r++) {
      if (board[r][col] === num) return false;
    }
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        if (board[r][c] === num) return false;
      }
    }
    return true;
  }

  /* ──────────────── SOLVER (backtracking) ──────────────── */

  function findEmpty(board) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) return [r, c];
      }
    }
    return null;
  }

  function solveInPlace(board, rng) {
    const empty = findEmpty(board);
    if (!empty) return true;

    const [row, col] = empty;
    const candidates = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);

    for (const num of candidates) {
      if (isValid(board, row, col, num)) {
        board[row][col] = num;
        if (solveInPlace(board, rng)) return true;
        board[row][col] = 0;
      }
    }
    return false;
  }

  function countSolutions(board, limit) {
    const empty = findEmpty(board);
    if (!empty) return 1;

    const [row, col] = empty;
    let count = 0;

    for (let num = 1; num <= 9; num++) {
      if (isValid(board, row, col, num)) {
        board[row][col] = num;
        count += countSolutions(board, limit - count);
        board[row][col] = 0;
        if (count >= limit) return count;
      }
    }
    return count;
  }

  /* ──────────────── GENERATOR ──────────────── */

  function generateCompleteBoard(rng) {
    const board = emptyBoard();

    for (let box = 0; box < 3; box++) {
      const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
      const r0 = box * 3;
      const c0 = box * 3;
      for (let i = 0; i < 9; i++) {
        board[r0 + Math.floor(i / 3)][c0 + (i % 3)] = nums[i];
      }
    }

    solveInPlace(board, rng);
    return board;
  }

  /**
   * Measure the amount of branching needed after repeatedly filling naked
   * singles. A score of zero means the puzzle can be solved without guessing.
   */
  function ratePuzzle(board) {
    const work = cloneBoard(board);
    let score = 0;

    function candidatesAt(row, col) {
      const candidates = [];
      for (let num = 1; num <= 9; num++) {
        if (isValid(work, row, col, num)) candidates.push(num);
      }
      return candidates;
    }

    function search(depth) {
      let best = null;

      // Fill forced cells and then branch on the most constrained cell.
      while (true) {
        best = null;
        let filledSingle = false;
        for (let row = 0; row < 9 && !filledSingle; row++) {
          for (let col = 0; col < 9; col++) {
            if (work[row][col] !== 0) continue;
            const candidates = candidatesAt(row, col);
            if (candidates.length === 0) return false;
            if (candidates.length === 1) {
              work[row][col] = candidates[0];
              filledSingle = true;
              break;
            }
            if (!best || candidates.length < best.candidates.length) {
              best = { row, col, candidates };
            }
          }
        }
        if (!filledSingle) break;
      }

      if (!best) return true;
      const snapshot = cloneBoard(work);
      score += best.candidates.length * (depth + 1);
      for (const num of best.candidates) {
        work[best.row][best.col] = num;
        if (search(depth + 1)) return true;
        for (let row = 0; row < 9; row++) work[row] = snapshot[row].slice();
      }
      return false;
    }

    search(0);
    return score;
  }

  function carvePuzzle(solution, targetGiven, rng) {
    const puzzle = cloneBoard(solution);
    const positions = [];
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) positions.push([row, col]);
    }

    let givenCount = 81;
    for (const [row, col] of shuffle(positions, rng)) {
      if (givenCount <= targetGiven) break;
      const backup = puzzle[row][col];
      puzzle[row][col] = 0;
      if (countSolutions(cloneBoard(puzzle), 2) === 1) {
        givenCount--;
      } else {
        puzzle[row][col] = backup;
      }
    }
    return { puzzle, givenCount, score: ratePuzzle(puzzle) };
  }

  /**
   * Generate a puzzle. If `seed` is provided, generation is deterministic.
   * Returns { puzzle, solution, difficulty, difficultyLabel, givenCount, seed }.
   */
  function generatePuzzle(difficulty, seed) {
    const config = DIFFICULTIES[difficulty] || DIFFICULTIES['medium'];
    const actualSeed = seed != null ? seed : randomSeed();
    const rng = mulberry32(actualSeed);

    const [minGiven, maxGiven] = config.givenRange;
    const [minScore, maxScore] = config.scoreRange;
    let best = null;

    // Try several independently carved boards and keep the one nearest the
    // requested solving-effort band. Seeded generation remains deterministic.
    for (let attempt = 0; attempt < 6; attempt++) {
      const solution = generateCompleteBoard(rng);
      const targetGiven = minGiven + Math.floor(rng() * (maxGiven - minGiven + 1));
      const candidate = carvePuzzle(solution, targetGiven, rng);
      candidate.solution = solution;
      candidate.distance = candidate.score < minScore
        ? minScore - candidate.score
        : candidate.score > maxScore ? candidate.score - maxScore : 0;

      if (!best || candidate.distance < best.distance) best = candidate;
      if (candidate.distance === 0) break;
    }

    return {
      puzzle: best.puzzle,
      solution: best.solution,
      difficulty,
      difficultyLabel: config.label,
      givenCount: best.givenCount,
      difficultyScore: best.score,
      seed: actualSeed,
    };
  }

  /* ──────────────── CHECKER ──────────────── */

  /**
   * Check the user's board by attempting to solve it from the current state.
   * If the solver succeeds, all filled cells are valid.
   * If the solver fails, identifies conflicting cells by testing each
   * user-filled cell individually — removing it and re-running the solver.
   */
  function checkSolution(userBoard, solution) {
    let emptyCount = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (userBoard[r][c] === 0) emptyCount++;
      }
    }

    // ── Primary validation: try to solve the board ──
    const testBoard = cloneBoard(userBoard);
    const solvable = solveInPlace(testBoard);

    if (solvable) {
      // The board is logically consistent — every filled cell is valid
      return {
        errors: [],
        complete: emptyCount === 0,
        correct: emptyCount === 0,
        hasErrors: false,
        emptyCount,
        solvable: true,
      };
    }

    // ── Board is unsolvable — find conflicting cells ──
    // Strategy: for each user-filled cell, temporarily remove it and
    // re-run the solver. If the board becomes solvable, that cell is
    // contributing to the contradiction and is marked as an error.
    const errors = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (userBoard[r][c] === 0) continue;
        // Temporarily clear this cell
        const trial = cloneBoard(userBoard);
        trial[r][c] = 0;
        if (solveInPlace(cloneBoard(trial))) {
          // Board became solvable — this cell's value was wrong
          errors.push({ row: r, col: c });
        }
      }
    }

    // Fallback: if the per-cell approach found nothing (e.g. multiple
    // interacting errors), fall back to comparing against the known solution.
    if (errors.length === 0) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (userBoard[r][c] !== 0 && userBoard[r][c] !== solution[r][c]) {
            errors.push({ row: r, col: c });
          }
        }
      }
    }

    return {
      errors,
      complete: false,
      correct: false,
      hasErrors: errors.length > 0,
      emptyCount,
      solvable: false,
    };
  }

  /* ──────────────── PUBLIC API ──────────────── */
  return {
    DIFFICULTIES,
    generatePuzzle,
    checkSolution,
    isValid,
    solveInPlace,
    cloneBoard,
    emptyBoard,
    mulberry32,
    randomSeed,
  };

})();
