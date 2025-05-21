// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  var gameManager = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);

  // FIXME bind action
  var revertBtn = document.getElementById("revert-btn");
  revertBtn.addEventListener("click", function (event) {
    event.preventDefault();
    if (!gameManager.revert()) {
      alert("No moves to undo!");
    }
  });
});
