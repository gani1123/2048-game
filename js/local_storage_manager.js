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
  this.leaderboardKey   = "leaderboard";

  var supported = this.localStorageSupported();
  this.storage = supported ? window.localStorage : window.fakeStorage;
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

// Best score getters/setters
LocalStorageManager.prototype.getBestScore = function () {
  return this.storage.getItem(this.bestScoreKey) || 0;
};

LocalStorageManager.prototype.setBestScore = function (score) {
  this.storage.setItem(this.bestScoreKey, score);
};

// Game state getters/setters and clearing
LocalStorageManager.prototype.getGameState = function () {
  var stateJSON = this.storage.getItem(this.gameStateKey);
  return stateJSON ? JSON.parse(stateJSON) : null;
};

LocalStorageManager.prototype.setGameState = function (gameState) {
  this.storage.setItem(this.gameStateKey, JSON.stringify(gameState));
};

LocalStorageManager.prototype.clearGameState = function () {
  this.storage.removeItem(this.gameStateKey);
};

// 排行榜相关方法
LocalStorageManager.prototype.getLeaderboard = function () {
  var leaderboardJSON = this.storage.getItem(this.leaderboardKey);
  return leaderboardJSON ? JSON.parse(leaderboardJSON) : [];
};

LocalStorageManager.prototype.addToLeaderboard = function (score, eventCount, duration) {
  var leaderboard = this.getLeaderboard();
  var entry = {
    score: score,
    eventCount: eventCount,
    duration: duration,
    timestamp: new Date().toISOString()
  };
  leaderboard.push(entry);
  // 按分数降序排序，保留前10条
  leaderboard.sort(function(a, b) { return b.score - a.score; });
  if (leaderboard.length > 10) leaderboard = leaderboard.slice(0, 10);
  this.storage.setItem(this.leaderboardKey, JSON.stringify(leaderboard));
};
