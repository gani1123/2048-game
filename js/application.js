// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  startNewGame();
  updateLeaderboard();
});

// Update leaderboard display
function updateLeaderboard() {
    const storageManager = new LocalStorageManager();
    const leaderboard = storageManager.getLeaderboard();
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';
    
    leaderboard.forEach((entry, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="border: 1px solid #d8d4d0; padding: 5px;">${index + 1}</td>
            <td style="border: 1px solid #d8d4d0; padding: 5px;">${entry.score}</td>
            <td style="border: 1px solid #d8d4d0; padding: 5px;">${entry.eventCount}</td>
            <td style="border: 1px solid #d8d4d0; padding: 5px;">${formatTime(entry.gameTime)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Format time from milliseconds to MM:SS
function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function getSelectedGameMode() {
    const selected = document.querySelector('input[name="game-mode"]:checked');
    return selected ? selected.value : 'normal';
  }
  
  let gameManager;
  
  function startNewGame() {
    const mode = getSelectedGameMode();
    gameManager = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager, mode);
    
    // Override game over handler to update leaderboard
    const originalActuate = gameManager.actuate.bind(gameManager);
    gameManager.actuate = function() {
      originalActuate();
      if (gameManager.over) {
        setTimeout(updateLeaderboard, 500);
      }
    };
  }
  
  // Start first game
  startNewGame();
  
  // Restart button should use selected game mode
  document.querySelector('.restart-button').addEventListener('click', function(e) {
    e.stopPropagation();
    startNewGame();
  });
