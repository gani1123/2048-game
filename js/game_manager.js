function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  this.startTiles     = 2;
  this.gameMode       = "event"; // 默认事件模式
  this.events         = [];
  this.eventTriggerProbability = 0.15; // 15%概率触发事件
  this.shield         = 0;
  this.forbiddenDirection = null;
  this.reverseDirection = false;
  this.frozenRow      = null;
  this.frozenCol      = null;

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
    terminated: this.isGameTerminated(),
    shield:     this.shield,
    events:     this.events
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
        // 检查是否为毒方块，毒方块无法合并
        if (tile.value !== "X" && next && next.value !== "X" && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);
          self.grid.removeTile(next);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) self.won = true;
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
      // 游戏结束时记录到排行榜
      this.storageManager.addToLeaderboard(this.score, this.events.length, 0);
    } else {
      // 有15%的概率触发随机事件
      if (this.gameMode !== "normal" && Math.random() < this.eventTriggerProbability) {
        this.triggerRandomEvent();
      }
    }

    this.actuate();
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

      if (tile && tile.value !== "X") {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value !== "X" && other.value === tile.value) {
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

// 触发随机事件
GameManager.prototype.triggerRandomEvent = function() {
  // 根据游戏模式确定正面/负面事件概率
  var positiveProbability = this.gameMode === "doom" ? 0.2 : 0.6;
  
  // 检查是否有护盾
  if (this.shield > 0) {
    this.shield--;
    this.recordEvent("幸运护盾抵消了一次负面事件");
    this.actuate();
    return;
  }
  
  // 随机选择事件类型
  var isPositive = Math.random() < positiveProbability;
  var eventType = isPositive ? this.getRandomPositiveEvent() : this.getRandomNegativeEvent();
  
  // 执行事件
  this.executeEvent(eventType);
};

// 获取随机正面事件
GameManager.prototype.getRandomPositiveEvent = function() {
  var positiveEvents = ["luckyDouble", "refreshReward", "freezeRowCol", "smartMerge", "luckyShield"];
  return positiveEvents[Math.floor(Math.random() * positiveEvents.length)];
};

// 获取随机负面事件
GameManager.prototype.getRandomNegativeEvent = function() {
  var negativeEvents = ["poisonTile", "numberBackward", "randomForbidOperation", "numberChaos", "gravityReverse"];
  return negativeEvents[Math.floor(Math.random() * negativeEvents.length)];
};

// 执行事件
GameManager.prototype.executeEvent = function(eventType) {
  switch(eventType) {
    case "luckyDouble":
      this.luckyDouble();
      break;
    case "refreshReward":
      this.refreshReward();
      break;
    case "freezeRowCol":
      this.freezeRowCol();
      break;
    case "smartMerge":
      this.smartMerge();
      break;
    case "luckyShield":
      this.luckyShield();
      break;
    case "poisonTile":
      this.poisonTile();
      break;
    case "numberBackward":
      this.numberBackward();
      break;
    case "randomForbidOperation":
      this.randomForbidOperation();
      break;
    case "numberChaos":
      this.numberChaos();
      break;
    case "gravityReverse":
      this.gravityReverse();
      break;
  }
};

// 正面事件：幸运倍增
GameManager.prototype.luckyDouble = function() {
  // 随机选择一个方块，数值翻倍
  var tiles = [];
  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      var tile = this.grid.cells[x][y];
      if (tile) tiles.push(tile);
    }
  }
  
  if (tiles.length > 0) {
    var randomTile = tiles[Math.floor(Math.random() * tiles.length)];
    randomTile.value *= 2;
    this.recordEvent("幸运倍增：方块数值翻倍");
  }
};

// 正面事件：刷新奖励
GameManager.prototype.refreshReward = function() {
  // 在空白格随机生成高数值方块
  if (!this.grid.cellsAvailable()) return;
  
  var availableCells = this.grid.availableCells();
  var randomCell = availableCells[Math.floor(Math.random() * availableCells.length)];
  
  // 概率：8（50%）、16（30%）、32（15%）、64（5%）
  var value = Math.random() < 0.5 ? 8 : (Math.random() < 0.6 ? 16 : (Math.random() < 0.75 ? 32 : 64));
  var tile = new Tile(randomCell, value);
  this.grid.insertTile(tile);
  this.recordEvent("刷新奖励：生成了" + value + "方块");
};

// 正面事件：冻结行列
GameManager.prototype.freezeRowCol = function() {
  // 随机冻结一行或一列
  var freezeRow = Math.random() < 0.5;
  if (freezeRow) {
    this.frozenRow = Math.floor(Math.random() * this.size);
    this.recordEvent("冻结行列：冻结了第" + (this.frozenRow + 1) + "行");
  } else {
    this.frozenCol = Math.floor(Math.random() * this.size);
    this.recordEvent("冻结行列：冻结了第" + (this.frozenCol + 1) + "列");
  }
};

// 正面事件：智能合并
GameManager.prototype.smartMerge = function() {
  // 自动将棋盘上两个相同数值最大的方块合并
  var maxValue = 0;
  var maxTiles = [];
  
  // 找出最大数值的方块
  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      var tile = this.grid.cells[x][y];
      if (tile) {
        if (tile.value > maxValue) {
          maxValue = tile.value;
          maxTiles = [tile];
        } else if (tile.value === maxValue) {
          maxTiles.push(tile);
        }
      }
    }
  }
  
  // 尝试合并最大数值的方块
  for (var i = 0; i < maxTiles.length; i++) {
    var tile = maxTiles[i];
    var merged = false;
    
    // 检查四个方向
    for (var direction = 0; direction < 4; direction++) {
      var vector = this.getVector(direction);
      var neighbor = this.grid.cellContent({x: tile.x + vector.x, y: tile.y + vector.y});
      
      if (neighbor && neighbor.value === tile.value) {
        // 合并
        var mergedTile = new Tile({x: tile.x, y: tile.y}, tile.value * 2);
        mergedTile.mergedFrom = [tile, neighbor];
        this.grid.insertTile(mergedTile);
        this.grid.removeTile(tile);
        this.grid.removeTile(neighbor);
        this.score += mergedTile.value;
        this.recordEvent("智能合并：合并了两个" + tile.value + "方块");
        merged = true;
        break;
      }
    }
    
    if (merged) break;
  }
};

// 正面事件：幸运护盾
GameManager.prototype.luckyShield = function() {
  this.shield++;
  this.recordEvent("幸运护盾：获得一次保护机会");
};

// 负面事件：毒方块
GameManager.prototype.poisonTile = function() {
  // 在空白格生成标记为"X"的紫黑色毒方块
  if (!this.grid.cellsAvailable()) return;
  
  var availableCells = this.grid.availableCells();
  var randomCell = availableCells[Math.floor(Math.random() * availableCells.length)];
  var tile = new Tile(randomCell, "X");
  this.grid.insertTile(tile);
  this.recordEvent("毒方块：生成了毒方块");
};

// 负面事件：数字倒退
GameManager.prototype.numberBackward = function() {
  // 随机选择一个方块，数值减半（最小为2）
  var tiles = [];
  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      var tile = this.grid.cells[x][y];
      if (tile && tile.value !== "X" && tile.value > 2) tiles.push(tile);
    }
  }
  
  if (tiles.length > 0) {
    var randomTile = tiles[Math.floor(Math.random() * tiles.length)];
    randomTile.value = Math.max(2, Math.floor(randomTile.value / 2));
    this.recordEvent("数字倒退：方块数值减半");
  }
};

// 负面事件：随机禁操作
GameManager.prototype.randomForbidOperation = function() {
  // 随机禁止一个移动方向，持续1次移动
  this.forbiddenDirection = Math.floor(Math.random() * 4);
  this.recordEvent("随机禁操作：禁止了某个方向的移动");
};

// 负面事件：数字混乱
GameManager.prototype.numberChaos = function() {
  // 随机交换棋盘上两个方块的位置
  var tiles = [];
  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      var tile = this.grid.cells[x][y];
      if (tile && tile.value !== "X") tiles.push(tile);
    }
  }
  
  if (tiles.length >= 2) {
    // 优先选择数值相差较大的方块
    var tile1 = tiles[Math.floor(Math.random() * tiles.length)];
    var tile2 = tiles[Math.floor(Math.random() * tiles.length)];
    
    // 交换位置
    var tempX = tile1.x;
    var tempY = tile1.y;
    tile1.x = tile2.x;
    tile1.y = tile2.y;
    tile2.x = tempX;
    tile2.y = tempY;
    
    // 更新网格
    this.grid.cells[tile1.x][tile1.y] = tile1;
    this.grid.cells[tile2.x][tile2.y] = tile2;
    
    this.recordEvent("数字混乱：交换了两个方块的位置");
  }
};

// 负面事件：重力反转
GameManager.prototype.gravityReverse = function() {
  // 随机改变下一次移动的方向为相反方向
  this.reverseDirection = true;
  this.recordEvent("重力反转：下一次移动方向相反");
};

// 记录事件
GameManager.prototype.recordEvent = function(eventName) {
  this.events.push(eventName);
  // 在界面上显示事件名称
  this.actuator.showEventNotification(eventName);
};

// 清除冻结状态
GameManager.prototype.clearFrozen = function() {
  this.frozenRow = null;
  this.frozenCol = null;
};

// 清除禁止操作
GameManager.prototype.clearForbiddenDirection = function() {
  this.forbiddenDirection = null;
};

// 清除重力反转
GameManager.prototype.clearReverseDirection = function() {
  this.reverseDirection = false;
};
