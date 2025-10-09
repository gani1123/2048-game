// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  var gameManager = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
  
  // Create AI player
  var aiPlayer = new AIPlayer(gameManager);

  // Wire up speed controls
  var speedSlider = document.getElementById('ai-speed');
  var speedValue = document.querySelector('.speed-value');

  function normalizeSpeedValue(value, fallback) {
    var parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      return fallback;
    }
    return Math.max(parsed, 0);
  }

  function updateSpeedDisplay(delay) {
    var isInstant = delay <= 0;
    var displayText = isInstant ? 'Instant' : delay + ' ms';
    var ariaText = isInstant ? 'instant speed' : delay + ' milliseconds';
    if (speedSlider) {
      speedSlider.value = String(delay);
      speedSlider.setAttribute('aria-valuenow', String(delay));
      speedSlider.setAttribute('aria-valuetext', ariaText);
    }
    if (speedValue) {
      speedValue.textContent = displayText;
    }
  }

  function applySpeed(delay) {
    aiPlayer.setMoveDelay(delay);
    updateSpeedDisplay(delay);
  }

  if (speedSlider) {
    var initialDelay = normalizeSpeedValue(speedSlider.value, aiPlayer.moveDelay);
    applySpeed(initialDelay);

    speedSlider.addEventListener('input', function (event) {
      var delay = normalizeSpeedValue(event.target.value, aiPlayer.moveDelay);
      applySpeed(delay);
    });
  }
  
  // Wire up autoplay button
  var autoplayButton = document.querySelector('.autoplay-button');
  var autoplayIcon = autoplayButton.querySelector('.autoplay-icon');
  var autoplayText = autoplayButton.querySelector('.autoplay-text');

  function setAutoplayState(isRunning) {
    autoplayButton.classList.toggle('running', isRunning);
    autoplayButton.setAttribute('aria-pressed', String(isRunning));
    autoplayButton.title = isRunning ? 'Pause the AI auto-play' : 'Start the AI auto-play';
    autoplayIcon.textContent = isRunning ? '⏸' : '▶';
    autoplayText.textContent = isRunning ? 'Pause AI' : 'Start AI';
  }

  setAutoplayState(false);

  aiPlayer.setStateListener(function(state) {
    var running = state === 'running';
    setAutoplayState(running);
  });

  autoplayButton.addEventListener('click', function(e) {
    e.preventDefault();
    if (aiPlayer.running) {
      aiPlayer.stop();
    } else {
      aiPlayer.run();
    }
  });
  
  // Also stop AI when new game is started
  var restartButton = document.querySelector('.restart-button');
  var originalRestart = gameManager.restart.bind(gameManager);
  
  gameManager.restart = function() {
    aiPlayer.stop();
    setAutoplayState(false);
    originalRestart();
  };
});
