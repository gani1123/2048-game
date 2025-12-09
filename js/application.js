// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  var storageManager = new LocalStorageManager();
  var size = storageManager.getGridSize() || 4;

  var gameManager = new GameManager(size, KeyboardInputManager, HTMLActuator, LocalStorageManager);

  // Build the initial grid
  gameManager.actuator.buildGrid(size);

  // Update the active button
  updateDifficultyButtons(size);

  // Add event listeners for difficulty buttons
  var difficultyButtons = document.querySelectorAll(".difficulty-button");
  for (var i = 0; i < difficultyButtons.length; i++) {
    difficultyButtons[i].addEventListener("click", function(e) {
      e.preventDefault();
      var newSize = parseInt(this.getAttribute("data-size"));

      if (newSize !== gameManager.size) {
        // Update storage manager
        gameManager.storageManager.setGridSize(newSize);

        // Update game manager size and rebuild
        gameManager.size = newSize;
        gameManager.actuator.buildGrid(newSize);
        gameManager.setup();

        // Update button states
        updateDifficultyButtons(newSize);
      }
    });
  }

  function updateDifficultyButtons(size) {
    var buttons = document.querySelectorAll(".difficulty-button");
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var buttonSize = parseInt(button.getAttribute("data-size"));
      if (buttonSize === size) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    }
  }
});
