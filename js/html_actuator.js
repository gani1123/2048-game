function HTMLActuator() {
  this.tileContainer    = document.querySelector(".tile-container");
  this.scoreContainer   = document.querySelector(".score-container");
  this.bestContainer    = document.querySelector(".best-container");
  this.messageContainer = document.querySelector(".game-message");
  this.eventMessageContainer = document.querySelector(".event-message");
  this.freezeSelectorContainer = document.querySelector(".freeze-selector");
  this.directionBlockersContainer = document.querySelector(".direction-blockers");

  this.score = 0;
}

HTMLActuator.prototype.actuate = function (grid, metadata) {
  var self = this;

  window.requestAnimationFrame(function () {
    self.clearContainer(self.tileContainer);

    grid.cells.forEach(function (column) {
      column.forEach(function (cell) {
        if (cell) {
          self.addTile(cell);
        }
      });
    });

    self.updateScore(metadata.score);
    self.updateBestScore(metadata.bestScore);

    if (metadata.terminated) {
      if (metadata.over) {
        self.message(false, metadata.eventHistory, metadata.gameTime); // You lose
      } else if (metadata.won) {
        self.message(true, metadata.eventHistory, metadata.gameTime); // You win!
      }
    }

  });
};

// Continues the game (both restart and keep playing)
HTMLActuator.prototype.continueGame = function () {
  this.clearMessage();
};

HTMLActuator.prototype.clearContainer = function (container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
};

HTMLActuator.prototype.addTile = function (tile) {
  var self = this;

  var wrapper   = document.createElement("div");
  var inner     = document.createElement("div");
  var position  = tile.previousPosition || { x: tile.x, y: tile.y };
  var positionClass = this.positionClass(position);

  // We can't use classlist because it somehow glitches when replacing classes
  var classes = ["tile", tile.isPoison ? "tile-poison" : "tile-" + tile.value, positionClass];

  if (tile.value > 2048 && !tile.isPoison) classes.push("tile-super");

  this.applyClasses(wrapper, classes);

  inner.classList.add("tile-inner");
  inner.textContent = tile.isPoison ? 'X' : tile.value;

  if (tile.previousPosition) {
    // Make sure that the tile gets rendered in the previous position first
    window.requestAnimationFrame(function () {
      classes[2] = self.positionClass({ x: tile.x, y: tile.y });
      self.applyClasses(wrapper, classes); // Update the position
    });
  } else if (tile.mergedFrom) {
    classes.push("tile-merged");
    this.applyClasses(wrapper, classes);

    // Render the tiles that merged
    tile.mergedFrom.forEach(function (merged) {
      self.addTile(merged);
    });
  } else {
    classes.push("tile-new");
    this.applyClasses(wrapper, classes);
  }

  // Add the inner part of the tile to the wrapper
  wrapper.appendChild(inner);

  // Put the tile on the board
  this.tileContainer.appendChild(wrapper);
};

HTMLActuator.prototype.applyClasses = function (element, classes) {
  element.setAttribute("class", classes.join(" "));
};

HTMLActuator.prototype.normalizePosition = function (position) {
  return { x: position.x + 1, y: position.y + 1 };
};

HTMLActuator.prototype.positionClass = function (position) {
  position = this.normalizePosition(position);
  return "tile-position-" + position.x + "-" + position.y;
};

HTMLActuator.prototype.updateScore = function (score) {
  this.clearContainer(this.scoreContainer);

  var difference = score - this.score;
  this.score = score;

  this.scoreContainer.textContent = this.score;

  if (difference > 0) {
    var addition = document.createElement("div");
    addition.classList.add("score-addition");
    addition.textContent = "+" + difference;

    this.scoreContainer.appendChild(addition);
  }
};

HTMLActuator.prototype.updateBestScore = function (bestScore) {
  this.bestContainer.textContent = bestScore;
};

HTMLActuator.prototype.message = function (won, eventHistory, gameTime) {
  var type    = won ? "game-won" : "game-over";
  var message = won ? "You win!" : "Game over!";

  if (eventHistory && eventHistory.length > 0) {
    const positiveEvents = eventHistory.filter(e => e.isPositive).length;
    const negativeEvents = eventHistory.filter(e => !e.isPositive).length;
    const minutes = Math.floor(gameTime / 60000);
    const seconds = Math.floor((gameTime % 60000) / 1000);
    
    message += `<br><br>游戏时长: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    message += `<br>触发事件: ${eventHistory.length}次`;
    message += `<br>正面事件: ${positiveEvents}次 | 负面事件: ${negativeEvents}次`;
    message += `<br><strong>事件记录:</strong><br>${eventHistory.map(e => `• ${e.isPositive ? '+' : '-'} ${e.name}`).join('<br>')}`;
  }

  this.messageContainer.classList.add(type);
  this.messageContainer.getElementsByTagName("p")[0].innerHTML = message;
};

HTMLActuator.prototype.clearMessage = function () {
  // IE only takes one value to remove at a time.
  this.messageContainer.classList.remove("game-won");
  this.messageContainer.classList.remove("game-over");
};

// Event UI Methods
HTMLActuator.prototype.showEventMessage = function(message, type) {
  this.eventMessageContainer.textContent = message;
  this.eventMessageContainer.className = `event-message event-${type}`;
  
  setTimeout(() => {
    this.eventMessageContainer.classList.add("event-hidden");
  }, 3000);
};

HTMLActuator.prototype.flashTile = function(tile, color) {
  const tileElement = this.tileContainer.querySelector(`.tile-position-${tile.x + 1}-${tile.y + 1}`);
  if (tileElement) {
    tileElement.style.animation = `flash-${color} 1s ease`;
    setTimeout(() => {
      tileElement.style.animation = '';
    }, 1000);
  }
};

HTMLActuator.prototype.spawnTile = function(tile) {
  const tileElement = this.tileContainer.querySelector(`.tile-position-${tile.x + 1}-${tile.y + 1}`);
  if (tileElement) {
    tileElement.style.animation = "spawn-glow 1.5s ease";
  }
};

HTMLActuator.prototype.showFreezeSelector = function(size, onSelect) {
  this.clearContainer(this.freezeSelectorContainer);
  this.freezeSelectorContainer.classList.add('show');
  
  const selector = document.createElement('div');
  selector.className = 'freeze-selector-content';
  
  const title = document.createElement('div');
  title.textContent = '选择要冻结的行或列:';
  selector.appendChild(title);
  
  const rows = document.createElement('div');
  rows.className = 'freeze-rows';
  for (let i = 0; i < size; i++) {
    const rowBtn = document.createElement('button');
    rowBtn.textContent = `行 ${i + 1}`;
    rowBtn.onclick = () => {
      this.hideFreezeSelector();
      onSelect('row', i);
    };
    rows.appendChild(rowBtn);
  }
  selector.appendChild(rows);
  
  const cols = document.createElement('div');
  cols.className = 'freeze-cols';
  for (let i = 0; i < size; i++) {
    const colBtn = document.createElement('button');
    colBtn.textContent = `列 ${i + 1}`;
    colBtn.onclick = () => {
      this.hideFreezeSelector();
      onSelect('col', i);
    };
    cols.appendChild(colBtn);
  }
  selector.appendChild(cols);
  
  this.freezeSelectorContainer.appendChild(selector);
};

HTMLActuator.prototype.hideFreezeSelector = function() {
  this.clearContainer(this.freezeSelectorContainer);
  this.freezeSelectorContainer.classList.remove('show');
};

HTMLActuator.prototype.highlightFrozenLine = function(lineType, index) {
  this.hideFrozenLine();
  
  const highlight = document.createElement('div');
  highlight.className = `frozen-highlight frozen-${lineType}-${index + 1}`;
  document.querySelector('.game-container').appendChild(highlight);
};

HTMLActuator.prototype.hideFrozenLine = function() {
  const highlights = document.querySelectorAll('.frozen-highlight');
  highlights.forEach(el => el.remove());
};

HTMLActuator.prototype.showShield = function() {
  const shield = document.createElement('div');
  shield.className = 'lucky-shield';
  document.querySelector('.game-container').appendChild(shield);
  
  setTimeout(() => {
    shield.classList.add('shield-fade');
    setTimeout(() => shield.remove(), 1000);
  }, 3000);
};

HTMLActuator.prototype.showBlockedDirection = function(direction) {
  const blocker = document.createElement('div');
  const dirNames = ['up', 'right', 'down', 'left'];
  blocker.className = `direction-blocker blocker-${dirNames[direction]}`;
  blocker.innerHTML = '✕';
  this.directionBlockersContainer.appendChild(blocker);
};

HTMLActuator.prototype.hideBlockedDirections = function() {
  this.clearContainer(this.directionBlockersContainer);
};

HTMLActuator.prototype.showReverseDirection = function() {
  const reverse = document.createElement('div');
  reverse.className = 'reverse-indicator';
  reverse.innerHTML = '⤴';
  document.querySelector('.game-container').appendChild(reverse);
};

HTMLActuator.prototype.hideReverseDirection = function() {
  const indicators = document.querySelectorAll('.reverse-indicator');
  indicators.forEach(el => el.remove());
};

HTMLActuator.prototype.shakeBoard = function() {
  const container = document.querySelector('.game-container');
  container.style.animation = 'board-shake 0.5s ease';
  setTimeout(() => {
    container.style.animation = '';
  }, 500);
};
