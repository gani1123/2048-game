// 游戏模式选择逻辑
// 等待DOM加载完成
window.addEventListener('DOMContentLoaded', function() {
  // 获取游戏模式选项
  var modeOptions = document.querySelectorAll('.mode-option');
  var restartButton = document.querySelector('.restart-button');
  var currentMode = 'event'; // 默认事件模式
  
  // 初始化选择状态
  document.querySelector('[data-mode="' + currentMode + '"]').classList.add('selected');
  
  // 为模式选项添加点击事件
  modeOptions.forEach(function(option) {
    option.addEventListener('click', function() {
      // 移除所有选项的选择状态
      modeOptions.forEach(function(opt) {
        opt.classList.remove('selected');
      });
      
      // 添加当前选项的选择状态
      this.classList.add('selected');
      
      // 更新当前模式
      currentMode = this.getAttribute('data-mode');
      
      // 重新开始游戏并应用新模式
      restartGame(currentMode);
    });
  });
  
  // 为重新开始按钮添加事件
  restartButton.addEventListener('click', function() {
    restartGame(currentMode);
  });
  
  function restartGame(mode) {
    // 销毁当前游戏实例
    if (window.gameManager) {
      // 清除事件监听器
      window.gameManager.inputManager.off('move');
      window.gameManager.inputManager.off('restart');
      window.gameManager.inputManager.off('keepPlaying');
    }
    
    // 创建新的游戏实例
    window.gameManager = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
    
    // 设置游戏模式
    window.gameManager.gameMode = mode;
  }
});