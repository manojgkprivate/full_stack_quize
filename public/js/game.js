document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-game');
    const gameContent = document.getElementById('game-content');
    const currentScore = document.getElementById('current-score');
    const highScore = document.getElementById('high-score');
    const image1 = document.getElementById('image1');
    const image2 = document.getElementById('image2');
    const userAnswer = document.getElementById('user-answer');
    const submitAnswer = document.getElementById('submit-answer');
    const nextPairButton = document.getElementById('next-pair');
    const resultMessage = document.getElementById('result-message');
    const qNumber = document.getElementById('q-number');
    const qTotal = document.getElementById('q-total');
    
    let score = 0;
    let currentIndex = -1;
    let gameData = [];
    let selectedQuestions = [];
    let currentAnswer = '';
    let totalQuestions = 10;
    let correctCount = 0;
    let startTime = null;
    // true = waiting for the user to check the answer; false = ready to advance
    let awaitingCheck = false;

    // Fetch game data when game starts (now returns questions array)
    async function fetchGameData() {
        try {
            const response = await fetch('/api/game-data');
            const data = await response.json();
            // data.questions => [{ userId, username, questionId, answer }]
            gameData = data.questions || [];
            return gameData.length > 0;
        } catch (err) {
            console.error('Error fetching game data:', err);
            return false;
        }
    }

    // Load images for current user
    async function loadNextQuestion() {
        currentIndex++;
        if (currentIndex >= selectedQuestions.length) {
            // finished all selected questions
            await finishGame();
            return false;
        }

        const item = selectedQuestions[currentIndex];
        image1.src = `/api/questions/${item.userId}/${item.questionId}/1`;
        image2.src = `/api/questions/${item.userId}/${item.questionId}/2`;
        currentAnswer = item.answer || '';
        userAnswer.value = '';
        resultMessage.innerHTML = '';
        userAnswer.disabled = false;
        // show the separate Check button and disable Next until checked
        if (submitAnswer) {
            submitAnswer.textContent = 'Check Answer';
            submitAnswer.classList.remove('hidden');
            submitAnswer.disabled = false;
        }
        nextPairButton.classList.remove('hidden');
        nextPairButton.textContent = 'Next Question';
        nextPairButton.disabled = true;
        awaitingCheck = true;
        // update question counter (1-based)
        if (qNumber) qNumber.textContent = currentIndex + 1;
        return true;
    }

    // Start the game
    async function startGame() {
        const hasData = await fetchGameData();
        if (!hasData) {
            resultMessage.innerHTML = 'No game data available. Please try again later.';
            return;
        }

        // start the timer
        startTime = Date.now();

    // pick up to totalQuestions random questions
    const shuffled = gameData.sort(() => Math.random() - 0.5);
    selectedQuestions = shuffled.slice(0, Math.min(totalQuestions, gameData.length));
    // update total display and reset counter
    if (qTotal) qTotal.textContent = selectedQuestions.length;
    if (qNumber) qNumber.textContent = 0;

    score = 0;
    correctCount = 0;
    currentScore.textContent = score;
    currentIndex = -1;
    startButton.classList.add('hidden');
    gameContent.classList.remove('hidden');
    await loadNextQuestion();
    }

    // Check answer
    function checkAnswer() {
        const raw = userAnswer.value.trim();
        if (!raw) {
            resultMessage.innerHTML = 'Please enter an answer.';
            resultMessage.className = 'result-message';
            return false;
        }

        const answer = raw.toLowerCase();
        const correct = answer === (currentAnswer || '').toLowerCase();

        // Mark that we've checked this question
        awaitingCheck = false;

        if (correct) {
            score += 10;
            correctCount += 1;
            currentScore.textContent = score;
            resultMessage.innerHTML = 'Correct! +10 points';
            resultMessage.className = 'result-message correct';
        } else {
            resultMessage.innerHTML = `Incorrect! Correct answer: ${currentAnswer}`;
            resultMessage.className = 'result-message incorrect';
            userAnswer.disabled = true;
        }

        // disable submit and enable Next so user advances manually
        if (submitAnswer) submitAnswer.disabled = true;
        if (currentIndex + 1 >= selectedQuestions.length) {
            nextPairButton.textContent = 'Finish';
        } else {
            nextPairButton.textContent = 'Next Question';
        }
        nextPairButton.disabled = false;

        return true;
    }

    // End the game
    async function finishGame() {
        // calculate time taken in seconds
        const endTime = Date.now();
        const timeSpentSeconds = Math.floor((endTime - startTime) / 1000);

        gameContent.classList.add('hidden');
        resultMessage.innerHTML = `Game Over! Final Score: ${score}<br>Time: ${Math.floor(timeSpentSeconds/60)}m ${timeSpentSeconds%60}s<br>Correct Answers: ${correctCount}/${selectedQuestions.length}`;
        resultMessage.className = 'result-message';
        startButton.classList.remove('hidden');
        nextPairButton.classList.add('hidden');

        // submit final score to server
        try {
            const resp = await fetch('/api/game/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    score, 
                    correct: correctCount, 
                    total: selectedQuestions.length,
                    timeSpentSeconds: timeSpentSeconds
                })
            });
            const data = await resp.json();
            if (data && data.highScore !== undefined) {
                highScore.textContent = data.highScore;
            }
        } catch (err) {
            console.error('Error submitting score:', err);
        }

        // reset state
        currentIndex = -1;
        selectedQuestions = [];
    }

    // Event Listeners
    startButton.addEventListener('click', startGame);

    // Enter key either checks or advances depending on state
    userAnswer.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (awaitingCheck) {
                checkAnswer();
            } else {
                nextPairButton.click();
            }
        }
    });

    // Wire up explicit Check Answer button
    // If the separate Check button exists, keep it wired but hidden by default
    if (submitAnswer) {
        submitAnswer.addEventListener('click', () => {
            if (awaitingCheck) checkAnswer();
        });
    }

    nextPairButton.addEventListener('click', async () => {
            // If Finish pressed on last question
            if (currentIndex + 1 >= selectedQuestions.length) {
                await finishGame();
                return;
            }

            // advance to next question
            nextPairButton.disabled = true;
            await loadNextQuestion();
    });
});