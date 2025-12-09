window.fakeStorage = {
  _data: {},

  setItem: function (id, val) {
    return this._data[id] = String(val);
  },

  getItem: function (id) {
    return this._data.hasOwnProperty(id) ? this._data[id] : undefined;
  },

  removeItem: function (id) {
    return delete this._data[id];
  },

  clear: function () {
    return this._data = {};
  }
};

function LocalStorageManager() {
  this.bestScoreKey     = "bestScore";
  this.gameStateKey     = "gameState";
  this.gridSizeKey      = "gridSize";

  var supported = this.localStorageSupported();
  this.storage = supported ? window.localStorage : window.fakeStorage;

  this.currentSize = this.getGridSize() || 4;
}

LocalStorageManager.prototype.localStorageSupported = function () {
  var testKey = "test";

  try {
    var storage = window.localStorage;
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
};

// Grid size getters/setters
LocalStorageManager.prototype.getGridSize = function () {
  return parseInt(this.storage.getItem(this.gridSizeKey)) || null;
};

LocalStorageManager.prototype.setGridSize = function (size) {
  this.currentSize = size;
  this.storage.setItem(this.gridSizeKey, size);
};

// Best score getters/setters (per difficulty)
LocalStorageManager.prototype.getBestScore = function () {
  var key = this.bestScoreKey + "-" + this.currentSize;
  return this.storage.getItem(key) || 0;
};

LocalStorageManager.prototype.setBestScore = function (score) {
  var key = this.bestScoreKey + "-" + this.currentSize;
  this.storage.setItem(key, score);
};

// Game state getters/setters and clearing (per difficulty)
LocalStorageManager.prototype.getGameState = function () {
  var key = this.gameStateKey + "-" + this.currentSize;
  var stateJSON = this.storage.getItem(key);
  return stateJSON ? JSON.parse(stateJSON) : null;
};

LocalStorageManager.prototype.setGameState = function (gameState) {
  var key = this.gameStateKey + "-" + this.currentSize;
  this.storage.setItem(key, JSON.stringify(gameState));
};

LocalStorageManager.prototype.clearGameState = function () {
  var key = this.gameStateKey + "-" + this.currentSize;
  this.storage.removeItem(key);
};
