function AIPlayer(gameManager) {
  this.gameManager = gameManager;
  this.running = false;
  this.moveDelay = 80;

  this.baseDepth = 4;
  this.maxDepth = 9;
  this.timeLimit = 220; // milliseconds per decision

  this.transposition = Object.create(null);

  // Heuristic weights inspired by top-performing 2048 bots
  this.smoothWeight = 0.1;
  this.monoWeight = 1.0;
  this.emptyWeight = 2.7;
  this.maxWeight = 1.0;
  this.cornerWeight = 1.5;

  this.stateListener = null;
}

// Main method to get the best move with ITERATIVE DEEPENING
AIPlayer.prototype.getBestMove = function() {
  var grid = this.cloneGrid(this.gameManager.grid);
  var startTime = Date.now();
  this.transposition = Object.create(null);

  var bestMove = -1;
  var bestScore = -Infinity;
  var maxDepth = this.chooseDepth(grid);

  for (var depth = 2; depth <= maxDepth; depth++) {
    var result = this.searchMoves(grid, depth, startTime);
    if (result.timedOut) {
      break;
    }

    if (result.move !== -1) {
      bestMove = result.move;
      bestScore = result.score;
    }
  }

  return bestMove;
};

AIPlayer.prototype.searchMoves = function(grid, depth, startTime) {
  var bestMove = -1;
  var bestScore = -Infinity;
  var timedOut = false;

  for (var direction = 0; direction < 4; direction++) {
    var simulation = this.moveGrid(this.cloneGrid(grid), direction);
    if (!simulation.moved) {
      continue;
    }

    var score = this.expectimax(simulation.grid, depth - 1, false, startTime);

    if (Date.now() - startTime > this.timeLimit) {
      timedOut = true;
      break;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = direction;
    }
  }

  return {
    move: bestMove,
    score: bestScore,
    timedOut: timedOut
  };
};

// Count distinct tiles on the board
AIPlayer.prototype.countDistinctTiles = function(grid) {
  var tiles = {};
  
  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      var value = this.getCell(grid, x, y);
      if (value) {
        tiles[value] = true;
      }
    }
  }
  
  return Object.keys(tiles).length;
};

// Generate optimized cache key from grid (faster than string concat)
AIPlayer.prototype.getCacheKey = function(grid, depth) {
  var key = depth + ':';
  var cells = grid.cells;
  
  // Fast array join instead of string concatenation
  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      key += (cells[x][y] || 0) + ',';
    }
  }
  return key;
};

// Enhanced Expectimax with probability tracking and aggressive pruning
AIPlayer.prototype.expectimax = function(grid, depth, isPlayer, startTime) {
  if (depth === 0 || Date.now() - startTime > this.timeLimit) {
    return this.evaluate(grid);
  }

  var key = this.generateKey(grid) + '|' + depth + '|' + (isPlayer ? 'P' : 'C');
  var cached = this.transposition[key];
  if (cached && cached.depth >= depth) {
    return cached.score;
  }

  var result;

  if (isPlayer) {
    var maxScore = -Infinity;
    var movable = false;

    for (var direction = 0; direction < 4; direction++) {
      var simulation = this.moveGrid(this.cloneGrid(grid), direction);
      if (!simulation.moved) {
        continue;
      }

      movable = true;
      var score = this.expectimax(simulation.grid, depth - 1, false, startTime);
      if (score > maxScore) {
        maxScore = score;
      }

      if (Date.now() - startTime > this.timeLimit) {
        break;
      }
    }

    result = movable ? maxScore : this.evaluate(grid);
  } else {
    var cells = this.getAvailableCells(grid);
    if (!cells.length) {
      result = this.evaluate(grid);
    } else {
      var expected = 0;
      var probability = 1 / cells.length;

      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];

        var gridTwo = this.cloneGrid(grid);
        this.setCell(gridTwo, cell.x, cell.y, 2);
        expected += 0.9 * probability * this.expectimax(gridTwo, depth - 1, true, startTime);

        var gridFour = this.cloneGrid(grid);
        this.setCell(gridFour, cell.x, cell.y, 4);
        expected += 0.1 * probability * this.expectimax(gridFour, depth - 1, true, startTime);

        if (Date.now() - startTime > this.timeLimit) {
          break;
        }
      }

      result = expected;
    }
  }

  this.transposition[key] = {
    depth: depth,
    score: result
  };

  return result;
};

AIPlayer.prototype.chooseDepth = function(grid) {
  var empty = this.getAvailableCells(grid).length;
  var maxTile = this.maxTile(grid);

  var depth = this.baseDepth;

  if (empty >= 8) {
    depth += 2;
  } else if (empty <= 4) {
    depth += 3;
  } else {
    depth += 1;
  }

  if (maxTile >= 1024) {
    depth += 1;
  }

  if (maxTile >= 2048) {
    depth += 2;
  }

  return Math.min(depth, this.maxDepth);
};

AIPlayer.prototype.evaluate = function(grid) {
  var smoothness = this.calcSmoothness(grid);
  var monotonicity = this.calcMonotonicity(grid);
  var empty = this.getAvailableCells(grid).length;
  var max = Math.log2(this.maxTile(grid));
  var corner = this.isMaxInCorner(grid) ? 1 : 0;

  return (
    this.smoothWeight * smoothness +
    this.monoWeight * monotonicity +
    this.emptyWeight * Math.log(empty + 1) +
    this.maxWeight * max +
    this.cornerWeight * corner
  );
};

AIPlayer.prototype.calcSmoothness = function(grid) {
  var smoothness = 0;

  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      var value = this.getCell(grid, x, y);
      if (value) {
        var logValue = Math.log2(value);

        if (x < 3) {
          var right = this.getCell(grid, x + 1, y);
          if (right) {
            smoothness -= Math.abs(logValue - Math.log2(right));
          }
        }

        if (y < 3) {
          var down = this.getCell(grid, x, y + 1);
          if (down) {
            smoothness -= Math.abs(logValue - Math.log2(down));
          }
        }
      }
    }
  }

  return smoothness;
};

AIPlayer.prototype.calcMonotonicity = function(grid) {
  var totals = [0, 0, 0, 0];

  for (var x = 0; x < 4; x++) {
    var current = 0;
    var next = 1;

    while (next < 4) {
      while (next < 4 && !this.getCell(grid, x, next)) {
        next++;
      }
      if (next >= 4) break;

      var currentValue = this.getCell(grid, x, current);
      var nextValue = this.getCell(grid, x, next);

      if (currentValue && nextValue) {
        var currentLog = Math.log2(currentValue);
        var nextLog = Math.log2(nextValue);
        if (currentLog > nextLog) {
          totals[0] += nextLog - currentLog;
        } else {
          totals[1] += currentLog - nextLog;
        }
      }

      current = next;
      next++;
    }
  }

  for (var y = 0; y < 4; y++) {
    var currentRow = 0;
    var nextRow = 1;

    while (nextRow < 4) {
      while (nextRow < 4 && !this.getCell(grid, nextRow, y)) {
        nextRow++;
      }
      if (nextRow >= 4) break;

      var currentValueRow = this.getCell(grid, currentRow, y);
      var nextValueRow = this.getCell(grid, nextRow, y);

      if (currentValueRow && nextValueRow) {
        var currentLogRow = Math.log2(currentValueRow);
        var nextLogRow = Math.log2(nextValueRow);
        if (currentLogRow > nextLogRow) {
          totals[2] += nextLogRow - currentLogRow;
        } else {
          totals[3] += currentLogRow - nextLogRow;
        }
      }

      currentRow = nextRow;
      nextRow++;
    }
  }

  return Math.max(totals[0], totals[1]) + Math.max(totals[2], totals[3]);
};

AIPlayer.prototype.isMaxInCorner = function(grid) {
  var max = this.maxTile(grid);
  var corners = [
    this.getCell(grid, 0, 0),
    this.getCell(grid, 0, 3),
    this.getCell(grid, 3, 0),
    this.getCell(grid, 3, 3)
  ];

  for (var i = 0; i < corners.length; i++) {
    if (corners[i] === max) {
      return true;
    }
  }

  return false;
};

AIPlayer.prototype.maxTile = function(grid) {
  var max = 0;
  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      var value = this.getCell(grid, x, y);
      if (value && value > max) {
        max = value;
      }
    }
  }
  return max || 2;
};

// Clone the grid state
AIPlayer.prototype.cloneGrid = function(grid) {
  var newCells = [];

  for (var x = 0; x < 4; x++) {
    newCells[x] = [];
    for (var y = 0; y < 4; y++) {
      var tile = grid.cells[x][y];
      if (!tile) {
        newCells[x][y] = null;
      } else if (typeof tile === 'number') {
        newCells[x][y] = tile;
      } else {
        newCells[x][y] = tile.value;
      }
    }
  }

  return { cells: newCells, size: 4 };
};

// Get cell value (supports grids with Tile objects or raw numbers)
AIPlayer.prototype.getCell = function(grid, x, y) {
  if (x < 0 || x >= 4 || y < 0 || y >= 4) {
    return null;
  }

  var cell = grid.cells[x][y];
  if (!cell) {
    return null;
  }

  return typeof cell === 'number' ? cell : cell.value;
};

// Set cell value
AIPlayer.prototype.setCell = function(grid, x, y, value) {
  if (x >= 0 && x < 4 && y >= 0 && y < 4) {
    grid.cells[x][y] = value;
  }
};

// Get available cells
AIPlayer.prototype.getAvailableCells = function(grid) {
  var cells = [];
  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      if (!grid.cells[x][y]) {
        cells.push({ x: x, y: y });
      }
    }
  }
  return cells;
};

// Simulate a move on a cloned grid
AIPlayer.prototype.moveGrid = function(grid, direction) {
  var vector = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved = false;
  var mergedPositions = {};

  for (var i = 0; i < traversals.x.length; i++) {
    var x = traversals.x[i];
    for (var j = 0; j < traversals.y.length; j++) {
      var y = traversals.y[j];
      var value = this.getCell(grid, x, y);
      if (!value) continue;

      var positions = this.findFarthestPosition(grid, { x: x, y: y }, vector);
      var next = positions.next;
      var nextValue = this.getCell(grid, next.x, next.y);

      if (nextValue && nextValue === value && !mergedPositions[next.x + ',' + next.y]) {
        this.setCell(grid, x, y, null);
        this.setCell(grid, next.x, next.y, value * 2);
        mergedPositions[next.x + ',' + next.y] = true;
        moved = true;
      } else {
        var farthest = positions.farthest;
        if (farthest.x !== x || farthest.y !== y) {
          this.setCell(grid, x, y, null);
          this.setCell(grid, farthest.x, farthest.y, value);
          moved = true;
        }
      }
    }
  }

  return {
    grid: grid,
    moved: moved
  };
};

// Get direction vector
AIPlayer.prototype.getVector = function(direction) {
  return {
    0: { x: 0, y: -1 },
    1: { x: 1, y: 0 },
    2: { x: 0, y: 1 },
    3: { x: -1, y: 0 }
  }[direction];
};

// Build traversals
AIPlayer.prototype.buildTraversals = function(vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < 4; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  if (vector.x === 1) traversals.x.reverse();
  if (vector.y === 1) traversals.y.reverse();

  return traversals;
};

// Find farthest position
AIPlayer.prototype.findFarthestPosition = function(grid, cell, vector) {
  var previous;

  do {
    previous = cell;
    cell = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (
    cell.x >= 0 && cell.x < 4 &&
    cell.y >= 0 && cell.y < 4 &&
    !this.getCell(grid, cell.x, cell.y)
  );

  return {
    farthest: previous,
    next: cell
  };
};

AIPlayer.prototype.generateKey = function(grid) {
  var key = '';
  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      key += (this.getCell(grid, x, y) || 0) + ',';
    }
  }
  return key;
};

AIPlayer.prototype.setStateListener = function(callback) {
  this.stateListener = callback;
};

AIPlayer.prototype.emitStateChange = function(state) {
  if (typeof this.stateListener === 'function') {
    try {
      this.stateListener(state);
    } catch (error) {
      console.error('AI state listener error:', error);
    }
  }
};

AIPlayer.prototype.setMoveDelay = function(delayMs) {
  var minDelay = 0;
  var maxDelay = 2000;
  if (typeof delayMs !== 'number' || isNaN(delayMs)) {
    return;
  }
  this.moveDelay = Math.min(Math.max(delayMs, minDelay), maxDelay);
};

// Start auto-playing
AIPlayer.prototype.run = function() {
  if (this.running) return;
  
  this.running = true;
  this.totalSearchTime = 0;
  this.movesEvaluated = 0;
  this.emitStateChange('running');
  console.log('🚀 AI STARTED - Enhanced 10x version with iterative deepening');
  console.log('Max depth:', this.MAX_DEPTH, 'Min search time:', this.MIN_SEARCH_TIME + 'ms');
  this.makeMove();
};

// Stop auto-playing
AIPlayer.prototype.stop = function() {
  if (!this.running) return;
  this.running = false;
  this.emitStateChange('stopped');
  console.log('🛑 AI STOPPED');
  if (this.totalSearchTime > 0) {
    console.log('Average search time per move:', (this.totalSearchTime / Math.max(1, this.movesEvaluated)).toFixed(2) + 'ms');
  }
};

// Make a single AI move
AIPlayer.prototype.makeMove = function() {
  if (!this.running) return;
  
  // Check if game is over
  if (this.gameManager.isGameTerminated()) {
    this.running = false;
    this.emitStateChange('stopped');
    var maxTile = this.maxValue(this.gameManager.grid);
    console.log('🏁 GAME ENDED!');
    console.log('Final score:', this.gameManager.score);
    console.log('Max tile:', maxTile);
    console.log('Success:', maxTile >= 2048 ? '✅ REACHED 2048!' : '❌ Did not reach 2048');
    return;
  }
  
  // Get best move
  var direction = this.getBestMove();
  
  if (direction === -1) {
    // No valid moves
    this.running = false;
    this.emitStateChange('stopped');
    console.log('❌ No valid moves available');
    return;
  }
  
  // Execute the move
  this.gameManager.move(direction);
  
  // Schedule next move
  var self = this;
  setTimeout(function() {
    self.makeMove();
  }, this.moveDelay);
};
