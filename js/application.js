// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  var gameManager = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
  
  // 模式选择事件处理
  var modeOptions = document.querySelectorAll('.mode-option');
  var gameContainer = document.querySelector('.game-container');
  
  modeOptions.forEach(function(option) {
    option.addEventListener('click', function() {
      // 移除所有活动状态
      modeOptions.forEach(function(opt) {
        opt.classList.remove('active');
      });
      
      // 设置当前模式为活动状态
      this.classList.add('active');
      
      // 获取选择的模式
      var mode = this.dataset.mode;
      gameManager.gameMode = mode;
      
      // 更新游戏容器的样式
      if (mode === 'double-color') {
        gameContainer.classList.add('double-color-mode');
      } else {
        gameContainer.classList.remove('double-color-mode');
      }
      
      // 重新开始游戏
      gameManager.restart();
    });
  });
});
