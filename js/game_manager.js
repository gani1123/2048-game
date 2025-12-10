function GameManager(size, InputManager, Actuator, StorageManager, gameMode) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;
  this.gameMode       = gameMode || "normal";

  this.startTiles     = 2;
  
  // Event System
  this.eventHistory = [];
  this.luckyShield = false;
  this.frozenLine = null;
  this.blockedDirection = null;
  this.reverseDirection = false;
  this.startTime = Date.now();

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  return this.over || (this.won && !this.keepPlaying);
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reset event state
  this.eventHistory = [];
  this.luckyShield = false;
  this.frozenLine = null;
  this.blockedDirection = null;
  this.reverseDirection = false;
  this.startTime = Date.now();
  
  // Hide any UI elements
  this.actuator.hideFreezeSelector();
  this.actuator.hideFrozenLine();
  this.actuator.hideBlockedDirections();
  this.actuator.hideReverseDirection();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048 && !tile.isPoison && !next.isPoison) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
      // Add to leaderboard
      if (this.gameMode !== "normal") {
        const gameTime = Date.now() - this.startTime;
        this.storageManager.addToLeaderboard(this.score, this.eventHistory.length, gameTime);
      }
    }

    this.actuate();
    
    // Trigger random event
    this.tryTriggerRandomEvent();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};

// Event System Core
GameManager.prototype.tryTriggerRandomEvent = function() {
  if (this.gameMode === "normal" || this.isGameTerminated()) return;
  
  // 15% chance to trigger event
  if (Math.random() < 0.15) {
    this.triggerRandomEvent();
  }
};

GameManager.prototype.triggerRandomEvent = function() {
  const isPositive = this.shouldTriggerPositiveEvent();
  let event = this.selectRandomEvent(isPositive);
  
  // Check for lucky shield
  if (!isPositive && this.luckyShield) {
    this.luckyShield = false;
    this.actuator.showEventMessage("幸运护盾抵消了负面事件！", "positive");
    this.eventHistory.push({ type: "shield_used", name: "幸运护盾生效", isPositive: true });
    return;
  }
  
  this.executeEvent(event);
};

GameManager.prototype.shouldTriggerPositiveEvent = function() {
  const rand = Math.random();
  if (this.gameMode === "event") {
    return rand < 0.6; // 60% positive, 40% negative
  } else if (this.gameMode === "doom") {
    return rand < 0.2; // 20% positive, 80% negative
  }
  return true;
};

GameManager.prototype.selectRandomEvent = function(isPositive) {
  const positiveEvents = [
    { id: "double", name: "幸运倍增", handler: this.eventLuckyDouble.bind(this) },
    { id: "reward", name: "刷新奖励", handler: this.eventRefreshReward.bind(this) },
    { id: "freeze", name: "冻结行列", handler: this.eventFreezeLine.bind(this) },
    { id: "merge", name: "智能合并", handler: this.eventSmartMerge.bind(this) },
    { id: "shield", name: "幸运护盾", handler: this.eventLuckyShield.bind(this) }
  ];
  
  const negativeEvents = [
    { id: "poison", name: "毒方块", handler: this.eventPoisonTile.bind(this) },
    { id: "halve", name: "数字倒退", handler: this.eventNumberHalve.bind(this) },
    { id: "block", name: "随机禁操作", handler: this.eventBlockDirection.bind(this) },
    { id: "swap", name: "数字交换", handler: this.eventNumberSwap.bind(this) },
    { id: "reverse", name: "重力反转", handler: this.eventReverseDirection.bind(this) }
  ];
  
  const events = isPositive ? positiveEvents : negativeEvents;
  return events[Math.floor(Math.random() * events.length)];
};

GameManager.prototype.executeEvent = function(event) {
  this.eventHistory.push({ type: event.id, name: event.name, isPositive: event.handler !== undefined });
  this.actuator.showEventMessage(event.name, event.handler !== undefined ? "positive" : "negative");
  event.handler();
};

// Positive Events
GameManager.prototype.eventLuckyDouble = function() {
  const tiles = [];
  this.grid.eachCell((x, y, tile) => {
    if (tile) tiles.push(tile);
  });
  
  if (tiles.length === 0) return;
  
  const target = tiles[Math.floor(Math.random() * tiles.length)];
  target.value *= 2;
  this.actuator.flashTile(target, "gold");
  this.score += target.value;
  this.actuate();
};

GameManager.prototype.eventRefreshReward = function() {
  if (!this.grid.cellsAvailable()) return;
  
  const rand = Math.random();
  let value;
  if (rand < 0.5) value = 8;
  else if (rand < 0.8) value = 16;
  else if (rand < 0.95) value = 32;
  else value = 64;
  
  const tile = new Tile(this.grid.randomAvailableCell(), value);
  this.grid.insertTile(tile);
  this.actuator.spawnTile(tile);
  this.actuate();
};

GameManager.prototype.eventFreezeLine = function() {
  this.actuator.showFreezeSelector(this.size, (lineType, index) => {
    this.frozenLine = { type: lineType, index: index };
    this.actuator.highlightFrozenLine(lineType, index);
  });
};

GameManager.prototype.eventSmartMerge = function() {
  const tiles = [];
  this.grid.eachCell((x, y, tile) => {
    if (tile) tiles.push(tile);
  });
  
  if (tiles.length < 2) return;
  
  // Find largest matching pair
  tiles.sort((a, b) => b.value - a.value);
  
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (tiles[i].value === tiles[j].value) {
        const tile1 = tiles[i];
        const tile2 = tiles[j];
        
        // Merge them at tile1 position
        const merged = new Tile(tile1, tile1.value * 2);
        merged.mergedFrom = [tile1, tile2];
        
        this.grid.insertTile(merged);
        this.grid.removeTile(tile2);
        
        this.score += merged.value;
        if (merged.value === 2048) this.won = true;
        
        this.actuate();
        return;
      }
    }
  }
};

GameManager.prototype.eventLuckyShield = function() {
  this.luckyShield = true;
  this.actuator.showShield();
};

// Negative Events
GameManager.prototype.eventPoisonTile = function() {
  if (!this.grid.cellsAvailable()) return;
  
  const tile = new Tile(this.grid.randomAvailableCell(), 'X');
  tile.isPoison = true;
  this.grid.insertTile(tile);
  this.actuate();
};

GameManager.prototype.eventNumberHalve = function() {
  const tiles = [];
  this.grid.eachCell((x, y, tile) => {
    if (tile && !tile.isPoison) tiles.push(tile);
  });
  
  if (tiles.length === 0) return;
  
  const target = tiles[Math.floor(Math.random() * tiles.length)];
  target.value = Math.max(2, Math.floor(target.value / 2));
  this.actuator.flashTile(target, "darkred");
  this.actuate();
};

GameManager.prototype.eventBlockDirection = function() {
  this.blockedDirection = Math.floor(Math.random() * 4);
  this.actuator.showBlockedDirection(this.blockedDirection);
  
  // Clear after next move
  const clearBlock = () => {
    this.blockedDirection = null;
    this.actuator.hideBlockedDirections();
    this.inputManager.off("move", clearBlock);
  };
  this.inputManager.on("move", clearBlock);
};

GameManager.prototype.eventNumberSwap = function() {
  const tiles = [];
  this.grid.eachCell((x, y, tile) => {
    if (tile && !tile.isPoison) tiles.push(tile);
  });
  
  if (tiles.length < 2) return;
  
  // Find two most different valued tiles
  let maxDiff = -1;
  let pair = [tiles[0], tiles[1]];
  
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const diff = Math.abs(tiles[i].value - tiles[j].value);
      if (diff > maxDiff) {
        maxDiff = diff;
        pair = [tiles[i], tiles[j]];
      }
    }
  }
  
  // Swap positions
  const pos1 = { x: pair[0].x, y: pair[0].y };
  const pos2 = { x: pair[1].x, y: pair[1].y };
  
  this.grid.cells[pos1.x][pos1.y] = pair[1];
  this.grid.cells[pos2.x][pos2.y] = pair[0];
  
  pair[0].updatePosition(pos2);
  pair[1].updatePosition(pos1);
  
  this.actuator.shakeBoard();
  this.actuate();
};

GameManager.prototype.eventReverseDirection = function() {
  this.reverseDirection = true;
  this.actuator.showReverseDirection();
  
  // Clear after next move
  const clearReverse = () => {
    this.reverseDirection = false;
    this.actuator.hideReverseDirection();
    this.inputManager.off("move", clearReverse);
  };
  this.inputManager.on("move", clearReverse);
};

// Override move to handle event effects
GameManager.prototype._originalMove = GameManager.prototype.move;
GameManager.prototype.move = function(direction) {
  // Handle blocked direction
  if (this.blockedDirection === direction) {
    this.actuator.shakeBoard();
    return;
  }
  
  // Handle reversed direction
  if (this.reverseDirection) {
    direction = [2, 3, 0, 1][direction]; // Reverse direction mapping
  }
  
  // Handle frozen line
  if (this.frozenLine) {
    return this.moveWithFrozenLine(direction);
  }
  
  this._originalMove(direction);
};

GameManager.prototype.moveWithFrozenLine = function(direction) {
  if (this.isGameTerminated()) return;
  
  const vector = this.getVector(direction);
  const traversals = this.buildTraversals(vector);
  let moved = false;
  
  this.prepareTiles();
  
  const self = this;
  traversals.x.forEach(function(x) {
    traversals.y.forEach(function(y) {
      const cell = { x: x, y: y };
      const tile = self.grid.cellContent(cell);
      
      if (tile) {
        // Skip frozen line
        if ((self.frozenLine.type === "row" && y === self.frozenLine.index) ||
            (self.frozenLine.type === "col" && x === self.frozenLine.index)) {
          return;
        }
        
        const positions = self.findFarthestPosition(cell, vector);
        const next = self.grid.cellContent(positions.next);
        
        if (next && next.value === tile.value && !next.mergedFrom && !next.isPoison && !tile.isPoison) {
          const merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];
          
          self.grid.insertTile(merged);
          self.grid.removeTile(tile);
          tile.updatePosition(positions.next);
          
          self.score += merged.value;
          if (merged.value === 2048) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }
        
        if (!self.positionsEqual(cell, tile)) {
          moved = true;
        }
      }
    });
  });
  
  if (moved) {
    // Handle poison tiles pushed to edge
    this.handlePoisonTiles(direction);
    
    this.addRandomTile();
    
    if (!this.movesAvailable()) {
      this.over = true;
    }
    
    this.frozenLine = null;
    this.actuator.hideFrozenLine();
    this.actuate();
    this.tryTriggerRandomEvent();
  }
};

GameManager.prototype.handlePoisonTiles = function(direction) {
  const vector = this.getVector(direction);
  const poisonTiles = [];
  
  this.grid.eachCell((x, y, tile) => {
    if (tile && tile.isPoison) {
      poisonTiles.push(tile);
    }
  });
  
  poisonTiles.forEach(tile => {
    let atEdge = false;
    if (direction === 0 && tile.y === 0) atEdge = true; // Up
    if (direction === 1 && tile.x === this.size - 1) atEdge = true; // Right
    if (direction === 2 && tile.y === this.size - 1) atEdge = true; // Down
    if (direction === 3 && tile.x === 0) atEdge = true; // Left
    
    if (atEdge) {
      this.grid.removeTile(tile);
    }
  });
};
