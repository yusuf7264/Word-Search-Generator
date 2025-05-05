document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const wordListInput = document.getElementById('wordList');
    const difficultySelector = document.getElementById('difficulty');
    const generateBtn = document.getElementById('generateBtn');
    const resetBtn = document.getElementById('resetBtn');
    const wordGrid = document.getElementById('wordGrid');
    const wordsList = document.getElementById('wordsList');
    const messageElement = document.getElementById('message');
    const timerElement = document.getElementById('timer');
    const howToPlayBtn = document.getElementById('howToPlayBtn');
    const howToPlayModal = document.getElementById('howToPlayModal');

    // How to Play functionality
    howToPlayBtn.addEventListener('click', () => {
        howToPlayModal.style.display = 'flex';
    });

    // Close modal when clicking the close button
    howToPlayModal.querySelector('.close-btn').addEventListener('click', () => {
        howToPlayModal.style.display = 'none';
    });

    // Close modal when clicking outside of it
    howToPlayModal.addEventListener('click', (event) => {
        if (event.target === howToPlayModal) {
            howToPlayModal.style.display = 'none';
        }
    });

    // Show How to Play modal on first visit
    const hasVisitedBefore = localStorage.getItem('wordSearchVisited');
    if (!hasVisitedBefore) {
        // Wait a moment before showing instructions on first visit
        setTimeout(() => {
            howToPlayModal.style.display = 'flex';
            localStorage.setItem('wordSearchVisited', 'true');
        }, 1000);
    }

    // Store word search data
    let wordSearchData = {
        grid: [],
        placedWords: [],
        foundWords: [],
        difficulty: 'medium',
        size: 10,
        directions: [
            [0, 1],   // Right
            [1, 0],   // Down
            [1, 1],   // Diagonal down-right
            [0, -1],  // Left
            [-1, 0],  // Up
            [-1, -1], // Diagonal up-left
            [1, -1],  // Diagonal down-left
            [-1, 1]   // Diagonal up-right
        ]
    };

    // Game metrics
    let gameStats = {
        score: 0,
        streak: 0,
        hintsUsed: 0,
        achievements: [],
        highScores: JSON.parse(localStorage.getItem('wordSearchHighScores') || '[]')
    };

    // Timer variables
    let timerInterval = null;
    let seconds = 0;
    let timerRunning = false;

    // Track selected cells for drawing lines
    let selectedCells = [];
    let currentPath = [];
    let isSelecting = false;

    // Sound effects
    const sounds = {
        wordFound: new Audio('https://www.soundjay.com/buttons/button-09.mp3'),
        gameComplete: new Audio('https://www.soundjay.com/buttons/button-09a.mp3'),
        select: new Audio('https://www.soundjay.com/buttons/button-09b.mp3'),
        hint: new Audio('https://www.soundjay.com/buttons/button-09c.mp3')
    };

    // Create sound fallbacks to avoid errors
    Object.keys(sounds).forEach(key => {
        // Add timeout to avoid hanging if sound files can't load
        const loadTimeout = setTimeout(() => {
            console.log(`Sound ${key} loading timed out, creating dummy`);
            sounds[key] = { play: function() {} };
        }, 3000); // 3 second timeout
        
        sounds[key].volume = 0.5;
        sounds[key].oncanplaythrough = function() {
            clearTimeout(loadTimeout); // Clear timeout if sound loaded successfully
        };
        sounds[key].onerror = function(e) {
            console.log('Sound failed to load, creating dummy', e);
            clearTimeout(loadTimeout); // Clear timeout as error has already occurred
            sounds[key] = { play: function() {} };  // Create dummy play function if sound fails
        };
        
        // Add play wrapper with error handling
        const originalPlay = sounds[key].play;
        sounds[key].play = function() {
            try {
                const playPromise = originalPlay.call(this);
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.log('Sound play failed silently', error);
                    });
                }
            } catch (e) {
                console.log('Sound play error caught', e);
            }
        };
    });

    // Set grid size based on difficulty
    function setGridSizeByDifficulty() {
        const difficulty = difficultySelector.value;
        wordSearchData.difficulty = difficulty;
        
        switch(difficulty) {
            case 'easy':
                wordSearchData.size = 8;
                break;
            case 'medium':
                wordSearchData.size = 10;
                break;
            case 'hard':
                wordSearchData.size = 12;
                break;
            default:
                wordSearchData.size = 10;
        }
    }

    // Event Listeners
    generateBtn.addEventListener('click', generateWordSearch);
    resetBtn.addEventListener('click', resetGame);
    difficultySelector.addEventListener('change', setGridSizeByDifficulty);
    
    // Add global mouse up handler to end selection
    document.addEventListener('mouseup', () => {
        if (isSelecting) {
            endSelection();
        }
    });
    
    // Timer functions
    function startTimer() {
        // Clear any existing timer first
        stopTimer();
        
        timerRunning = true;
        seconds = 0;
        updateTimerDisplay();
        
        timerInterval = setInterval(() => {
            seconds++;
            updateTimerDisplay();
        }, 1000);
    }
    
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        timerRunning = false;
    }
    
    function resetTimer() {
        stopTimer();
        seconds = 0;
        updateTimerDisplay();
    }
    
    function updateTimerDisplay() {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    // Add a hint system
    function showHint() {
        // Only provide hints if timer is running
        if (!timerRunning) return;
        
        // Find an unfound word
        const unfoundWords = wordSearchData.placedWords.filter(word => !word.found);
        if (unfoundWords.length === 0) return;
        
        // Select a random unfound word
        const randomWord = unfoundWords[Math.floor(Math.random() * unfoundWords.length)];
        
        // Highlight the first letter as a hint
        const firstY = randomWord.start.y;
        const firstX = randomWord.start.x;
        
        // Flash the hint a few times
        const cell = document.querySelector(`.grid-cell[data-y="${firstY}"][data-x="${firstX}"]`);
        
        if (cell) {
            sounds.hint.play();
            gameStats.hintsUsed++;
            
            let flashCount = 0;
            const flashInterval = setInterval(() => {
                cell.classList.toggle('hint');
                flashCount++;
                
                if (flashCount >= 6) {  // 3 full flashes (on-off-on-off-on-off)
                    clearInterval(flashInterval);
                    cell.classList.remove('hint');
                }
            }, 300);
        }
    }
    
    // Function to generate the word search
    function generateWordSearch() {
        const rawWords = wordListInput.value.trim();
        
        if (!rawWords) {
            showMessage('Please enter at least one word', 'error');
            return;
        }
        
        // Reset game state
        resetGame();
        
        // Update grid size based on difficulty
        setGridSizeByDifficulty();

        // Parse and prepare words
        let words = rawWords.split(',')
            .map(word => word.trim().toUpperCase())
            .filter(word => word.length > 0)
            .filter(word => /^[A-Z]+$/.test(word))
            .filter(word => word.length <= wordSearchData.size);

        // Remove duplicates
        words = [...new Set(words)];

        if (words.length === 0) {
            showMessage('Please enter valid words (letters only)', 'error');
            return;
        }
        
        // Limit number of words based on difficulty
        const maxWords = {
            'easy': 6,
            'medium': 10,
            'hard': 15
        };
        
        if (words.length > maxWords[wordSearchData.difficulty]) {
            words = words.slice(0, maxWords[wordSearchData.difficulty]);
            showMessage(`Limited to ${maxWords[wordSearchData.difficulty]} words for ${wordSearchData.difficulty} difficulty.`);
        }

        // Sort by word length (longest first)
        words.sort((a, b) => b.length - a.length);

        // Initialize the grid
        initializeGrid(wordSearchData.size);
        
        // Place words in the grid
        const placedWords = placeWords(words);
        wordSearchData.placedWords = placedWords;
        
        if (placedWords.length === 0) {
            showMessage('Could not place any words. Try fewer or shorter words.', 'error');
            return;
        }
        
        // Fill empty cells with random letters
        fillEmptyCells();
        
        // Render the grid and word list
        renderGrid();
        renderWordList();
        
        // Reset game stats
        gameStats.score = 0;
        gameStats.streak = 0;
        gameStats.hintsUsed = 0;
        
        // Reset found words
        wordSearchData.foundWords = [];
        
        // Always start the timer, regardless of difficulty
        startTimer();
        
        // Initialize the game UI
        updateScoreDisplay();
        addHintButton();
        
        // Show difficulty-based instruction
        showMessage(`${wordSearchData.difficulty.charAt(0).toUpperCase() + wordSearchData.difficulty.slice(1)} mode started. Find all ${placedWords.length} words!`, 'info');
    }
    
    // Add score display and hint button
    function addHintButton() {
        // Remove existing UI elements if they exist
        const existingScoreDisplay = document.getElementById('scoreDisplay');
        const existingHintBtn = document.getElementById('hintBtn');
        
        if (existingScoreDisplay) existingScoreDisplay.remove();
        if (existingHintBtn) existingHintBtn.remove();
        
        // Create score display
        const scoreDisplay = document.createElement('div');
        scoreDisplay.id = 'scoreDisplay';
        scoreDisplay.className = 'score-display';
        scoreDisplay.innerHTML = `Score: <span id="scoreValue">0</span>`;
        
        // Create hint button
        const hintBtn = document.createElement('button');
        hintBtn.id = 'hintBtn';
        hintBtn.className = 'btn hint-btn';
        hintBtn.textContent = 'Hint';
        hintBtn.title = 'Get a hint (-10 points)';
        hintBtn.addEventListener('click', () => {
            // Deduct points for using a hint
            updateScore(-10);
            showHint();
        });
        
        // Add elements to game header
        const gameHeader = document.querySelector('.game-header');
        gameHeader.appendChild(scoreDisplay);
        
        // Only show hint button in medium and hard difficulties
        if (wordSearchData.difficulty !== 'easy') {
            gameHeader.appendChild(hintBtn);
        }
    }
    
    // Update score display
    function updateScoreDisplay() {
        const scoreValue = document.getElementById('scoreValue');
        if (scoreValue) {
            scoreValue.textContent = gameStats.score;
        }
    }
    
    // Update the score
    function updateScore(points) {
        gameStats.score += points;
        if (gameStats.score < 0) gameStats.score = 0;
        updateScoreDisplay();
    }
    
    // Reset the game
    function resetGame() {
        // Clear the grid and word list
        wordGrid.innerHTML = '';
        wordsList.innerHTML = '';
        
        // Reset words and selection
        wordSearchData.placedWords = [];
        wordSearchData.foundWords = [];
        selectedCells = [];
        currentPath = [];
        
        // Reset timer
        resetTimer();
        
        // Reset score and streak
        gameStats.score = 0;
        gameStats.streak = 0;
        
        // Clear message
        messageElement.textContent = '';
        messageElement.className = 'message';
    }
    
    // Save high score
    function saveHighScore() {
        // Only save if score > 0
        if (gameStats.score <= 0) return;
        
        const highScore = {
            score: gameStats.score,
            difficulty: wordSearchData.difficulty,
            date: new Date().toISOString(),
            time: timerElement.textContent,
            wordsFound: wordSearchData.foundWords.length
        };
        
        // Add to high scores array
        gameStats.highScores.push(highScore);
        
        // Sort by score (descending)
        gameStats.highScores.sort((a, b) => b.score - a.score);
        
        // Keep only top 10 scores
        if (gameStats.highScores.length > 10) {
            gameStats.highScores = gameStats.highScores.slice(0, 10);
        }
        
        // Save to localStorage
        localStorage.setItem('wordSearchHighScores', JSON.stringify(gameStats.highScores));
    }
    
    // Initialize an empty grid
    function initializeGrid(size) {
        wordSearchData.grid = Array(size).fill().map(() => Array(size).fill(''));
    }
    
    // Place words in the grid
    function placeWords(words) {
        const placedWords = [];
        const size = wordSearchData.size;
        
        // Use more/less directions depending on difficulty
        let directions = wordSearchData.directions;
        if (wordSearchData.difficulty === 'easy') {
            // Easy: only right and down
            directions = [[0, 1], [1, 0]];
        } else if (wordSearchData.difficulty === 'medium') {
            // Medium: no backwards diagonals
            directions = [[0, 1], [1, 0], [1, 1], [0, -1], [-1, 0]];
        }
        // Hard: all directions (default)
        
        for (const word of words) {
            if (word.length > size) continue;
            
            // Try to place the word
            const attempts = wordSearchData.difficulty === 'hard' ? 50 : 100;
            let placed = false;
            
            for (let attempt = 0; attempt < attempts && !placed; attempt++) {
                // Randomly choose direction
                const dirIndex = Math.floor(Math.random() * directions.length);
                const [dy, dx] = directions[dirIndex];
                
                // Randomly reverse word (except on easy)
                const reversed = wordSearchData.difficulty !== 'easy' && Math.random() > 0.5;
                const wordToPlace = reversed ? [...word].reverse().join('') : word;
                
                // Calculate valid starting positions based on direction and word length
                const maxY = dy === 0 ? size - 1 : dy > 0 ? size - wordToPlace.length : size - 1;
                const minY = dy === 0 ? 0 : dy > 0 ? 0 : wordToPlace.length - 1;
                
                const maxX = dx === 0 ? size - 1 : dx > 0 ? size - wordToPlace.length : size - 1;
                const minX = dx === 0 ? 0 : dx > 0 ? 0 : wordToPlace.length - 1;
                
                // Choose random starting position
                const startY = minY + Math.floor(Math.random() * (maxY - minY + 1));
                const startX = minX + Math.floor(Math.random() * (maxX - minX + 1));
                
                // Check if word fits
                if (canPlaceWord(wordToPlace, startY, startX, dy, dx)) {
                    // Place the word
                    placeWord(wordToPlace, startY, startX, dy, dx);
                    placedWords.push({
                        word: word,
                        start: { y: startY, x: startX },
                        end: { y: startY + (wordToPlace.length - 1) * dy, x: startX + (wordToPlace.length - 1) * dx },
                        direction: { dy, dx },
                        found: false
                    });
                    placed = true;
                }
            }
        }
        
        return placedWords;
    }
    
    // Check if a word can be placed at a specific position and direction
    function canPlaceWord(word, startY, startX, dy, dx) {
        const grid = wordSearchData.grid;
        const size = wordSearchData.size;
        
        for (let i = 0; i < word.length; i++) {
            const y = startY + i * dy;
            const x = startX + i * dx;
            
            // Check if position is within grid
            if (y < 0 || y >= size || x < 0 || x >= size) {
                return false;
            }
            
            // Check if cell is empty or has the same letter
            if (grid[y][x] !== '' && grid[y][x] !== word[i]) {
                return false;
            }
        }
        
        return true;
    }
    
    // Place a word at a specific position and direction
    function placeWord(word, startY, startX, dy, dx) {
        const grid = wordSearchData.grid;
        
        for (let i = 0; i < word.length; i++) {
            const y = startY + i * dy;
            const x = startX + i * dx;
            grid[y][x] = word[i];
        }
    }
    
    // Fill empty cells with random letters
    function fillEmptyCells() {
        const grid = wordSearchData.grid;
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        
        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                if (grid[y][x] === '') {
                    grid[y][x] = letters.charAt(Math.floor(Math.random() * letters.length));
                }
            }
        }
    }
    
    // Render the grid to the DOM
    function renderGrid() {
        const grid = wordSearchData.grid;
        const size = wordSearchData.size;
        
        // Clear previous grid
        wordGrid.innerHTML = '';
        
        // Set grid template columns
        wordGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
        
        // Create cells
        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.textContent = grid[y][x];
                cell.dataset.y = y;
                cell.dataset.x = x;
                
                // Add event listeners for drag/selection
                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    startSelection(y, x);
                });
                
                cell.addEventListener('mouseover', () => {
                    if (isSelecting) {
                        continueSelection(y, x);
                    }
                });
                
                // Touch support for mobile
                cell.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    startSelection(y, x);
                });
                
                cell.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    const touch = e.touches[0];
                    const element = document.elementFromPoint(touch.clientX, touch.clientY);
                    
                    if (element && element.classList.contains('grid-cell')) {
                        const cellY = parseInt(element.dataset.y);
                        const cellX = parseInt(element.dataset.x);
                        continueSelection(cellY, cellX);
                    }
                });
                
                wordGrid.appendChild(cell);
            }
        }
        
        // Add event listener to handle selection end when mouse leaves grid
        wordGrid.addEventListener('mouseleave', () => {
            if (isSelecting) {
                endSelection();
            }
        });
    }
    
    // Render the word list to the DOM
    function renderWordList() {
        const placedWords = wordSearchData.placedWords;
        
        // Clear previous list
        wordsList.innerHTML = '';
        
        // Create list items
        placedWords.forEach(wordData => {
            const listItem = document.createElement('li');
            listItem.textContent = wordData.word;
            listItem.dataset.word = wordData.word;
            
            if (wordData.found) {
                listItem.classList.add('found');
            }
            
            wordsList.appendChild(listItem);
        });
    }
    
    // Start word selection
    let lastTouchedCell = null;

    function startSelection(y, x) {
        isSelecting = true;
        selectedCells = [];
        currentPath = [];
        lastTouchedCell = { y, x };
        
        // Play select sound
        sounds.select.play();
        
        addToSelection(y, x);
    }
    
    // Continue word selection
    function continueSelection(y, x) {
        if (!isSelecting) return;
        
        // Check if cell is already in the current path
        const cellIndex = currentPath.findIndex(cell => cell.y === parseInt(y) && cell.x === parseInt(x));
        
        // If cell is in path, remove all cells after it (backtracking)
        if (cellIndex !== -1) {
            currentPath = currentPath.slice(0, cellIndex + 1);
            updateSelectionDisplay();
            return;
        }
        
        // Get the last selected cell
        const lastCell = currentPath[currentPath.length - 1];
        
        // Calculate the direction
        const dy = y - lastCell.y;
        const dx = x - lastCell.x;
        
        // Only allow straight lines
        if ((dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) || 
            (dx === 0 && dy === 0)) {
            return;
        }
        
        // Normalize direction
        const normalizedDy = dy === 0 ? 0 : dy / Math.abs(dy);
        const normalizedDx = dx === 0 ? 0 : dx / Math.abs(dx);
        
        // Check if new direction matches the current path direction
        if (currentPath.length > 1) {
            const prevY = currentPath[currentPath.length - 2].y;
            const prevX = currentPath[currentPath.length - 2].x;
            
            const currentDy = lastCell.y - prevY;
            const currentDx = lastCell.x - prevX;
            
            const currentNormalizedDy = currentDy === 0 ? 0 : currentDy / Math.abs(currentDy);
            const currentNormalizedDx = currentDx === 0 ? 0 : currentDx / Math.abs(currentDx);
            
            // If direction changed, clear the path and start from the first cell
            if (currentNormalizedDy !== normalizedDy || currentNormalizedDx !== normalizedDx) {
                const firstCell = currentPath[0];
                currentPath = [firstCell];
                updateSelectionDisplay();
            }
        }
        
        // Fill in cells between last cell and current cell
        const steps = Math.max(Math.abs(dy), Math.abs(dx));
        
        for (let i = 1; i <= steps; i++) {
            const cellY = lastCell.y + i * normalizedDy;
            const cellX = lastCell.x + i * normalizedDx;
            
            // Add to selection
            addToSelection(cellY, cellX);
        }
    }
    
    // Add cell to the current selection
    function addToSelection(y, x) {
        // Add cell to the path
        currentPath.push({ y: parseInt(y), x: parseInt(x) });
        
        // Find the DOM cell and add selected class
        const cell = document.querySelector(`.grid-cell[data-y="${y}"][data-x="${x}"]`);
        if (cell && !cell.classList.contains('selected')) {
            cell.classList.add('selected');
        }
    }
    
    // Update the display for the current selection
    function updateSelectionDisplay() {
        // Clear all selected cells
        document.querySelectorAll('.grid-cell.selected').forEach(cell => {
            cell.classList.remove('selected');
        });
        
        // Reapply selected class to current path
        currentPath.forEach(({y, x}) => {
            const cell = document.querySelector(`.grid-cell[data-y="${y}"][data-x="${x}"]`);
            if (cell) {
                cell.classList.add('selected');
            }
        });
    }
    
    // End word selection and check if a word was found
    function endSelection() {
        isSelecting = false;
        
        if (currentPath.length < 2) {
            clearSelection();
            return;
        }
        
        // Build the selected word
        const selectedWord = currentPath.map(({y, x}) => wordSearchData.grid[y][x]).join('');
        
        // Check if the word matches any in our list
        let foundWordData = null;
        const reversedWord = [...selectedWord].reverse().join('');
        
        wordSearchData.placedWords.forEach(wordData => {
            if (wordData.found) return;
            
            if (wordData.word === selectedWord || wordData.word === reversedWord) {
                foundWordData = wordData;
                wordData.found = true;
                wordSearchData.foundWords.push(wordData.word);
                
                // Update the word list
                const listItem = document.querySelector(`li[data-word="${wordData.word}"]`);
                if (listItem) {
                    listItem.classList.add('found');
                }
            }
        });
        
        if (foundWordData) {
            // Play sound
            sounds.wordFound.play();
            
            // Calculate points based on word length and difficulty
            let difficultyMultiplier = 1;
            if (wordSearchData.difficulty === 'medium') difficultyMultiplier = 1.5;
            if (wordSearchData.difficulty === 'hard') difficultyMultiplier = 2;
            
            // Points formula: word length * difficulty * (1 + streak bonus)
            const streakBonus = Math.min(gameStats.streak * 0.1, 0.5); // Max 50% bonus for streak
            let points = Math.round(foundWordData.word.length * difficultyMultiplier * (1 + streakBonus));
            
            // Increase streak
            gameStats.streak++;
            
            // Update score and display
            updateScore(points);
            
            // Show streak message if applicable
            if (gameStats.streak > 1) {
                showMessage(`${foundWordData.word} found! +${points} points (${gameStats.streak}× streak!)`, 'success');
            } else {
                showMessage(`${foundWordData.word} found! +${points} points`, 'success');
            }
            
            // Highlight the found word
            currentPath.forEach(({y, x}) => {
                const cell = document.querySelector(`.grid-cell[data-y="${y}"][data-x="${x}"]`);
                if (cell) {
                    cell.classList.remove('selected');
                    cell.classList.add('highlighted');
                }
            });
            
            // Clear selection array but keep the path for the highlighted word
            selectedCells = [];
            
            // Check if all words are found
            checkGameCompletion();
        } else {
            // Streak broken
            gameStats.streak = 0;
            
            // No word found, clear the selection
            clearSelection();
        }
    }
    
    // Clear the current selection
    function clearSelection() {
        document.querySelectorAll('.grid-cell.selected').forEach(cell => {
            cell.classList.remove('selected');
        });
        
        selectedCells = [];
        currentPath = [];
    }
    
    // Check if all words are found (game completed)
    function checkGameCompletion() {
        if (wordSearchData.foundWords.length === wordSearchData.placedWords.length) {
            // Stop timer
            stopTimer();
            
            // Play completion sound
            sounds.gameComplete.play();
            
            // Calculate bonus points for remaining time
            // The faster you complete, the more points
            let timeBonus = 0;
            if (wordSearchData.difficulty !== 'easy') {
                // More bonus for harder difficulties and faster times
                const difficultyFactor = wordSearchData.difficulty === 'hard' ? 3 : 2;
                const baseTime = wordSearchData.placedWords.length * 20; // Expected time based on word count
                const timeRemaining = Math.max(0, baseTime - seconds);
                timeBonus = Math.round(timeRemaining * difficultyFactor);
                
                updateScore(timeBonus);
            }
            
            // Calculate final score with potential penalties for hints
            const hintPenalty = gameStats.hintsUsed * 10;
            const finalScore = gameStats.score;
            
            // Save high score
            saveHighScore();
            
            // Show completion message
            const timeText = timerElement.textContent;
            let message = `Congratulations! You found all ${wordSearchData.placedWords.length} words in ${timeText}!`;
            if (timeBonus > 0) {
                message += ` Time bonus: +${timeBonus} points!`;
            }
            message += ` Final score: ${finalScore}`;
            
            showMessage(message, 'success');
            
            // Show high score button
            showHighScoreButton();
        }
    }
    
    // Show high score button after game completion
    function showHighScoreButton() {
        // Remove existing button if it exists
        const existingBtn = document.getElementById('showHighScoresBtn');
        if (existingBtn) existingBtn.remove();
        
        // Create button
        const highScoreBtn = document.createElement('button');
        highScoreBtn.id = 'showHighScoresBtn';
        highScoreBtn.className = 'btn score-btn';
        highScoreBtn.textContent = 'View High Scores';
        highScoreBtn.addEventListener('click', showHighScores);
        
        // Add to message area
        messageElement.appendChild(document.createElement('br'));
        messageElement.appendChild(highScoreBtn);
    }
    
    // Show high scores modal
    function showHighScores() {
        // Create modal background
        const modalBackground = document.createElement('div');
        modalBackground.className = 'modal-background';
        
        // Create modal container
        const modal = document.createElement('div');
        modal.className = 'modal';
        
        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        
        // Create high scores header
        const header = document.createElement('h2');
        header.textContent = 'High Scores';
        modalContent.appendChild(header);
        
        // Create high scores list
        const scoresList = document.createElement('table');
        scoresList.className = 'high-scores-table';
        
        // Add table header
        const tableHeader = document.createElement('thead');
        tableHeader.innerHTML = `
            <tr>
                <th>Rank</th>
                <th>Score</th>
                <th>Difficulty</th>
                <th>Words</th>
                <th>Time</th>
                <th>Date</th>
            </tr>
        `;
        scoresList.appendChild(tableHeader);
        
        // Add table body
        const tableBody = document.createElement('tbody');
        
        // Add high scores
        if (gameStats.highScores.length > 0) {
            gameStats.highScores.forEach((score, index) => {
                const row = document.createElement('tr');
                
                // Format date
                const scoreDate = new Date(score.date);
                const dateString = `${scoreDate.toLocaleDateString()}`;
                
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${score.score}</td>
                    <td>${score.difficulty}</td>
                    <td>${score.wordsFound}</td>
                    <td>${score.time}</td>
                    <td>${dateString}</td>
                `;
                tableBody.appendChild(row);
            });
        } else {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6">No high scores yet!</td>';
            tableBody.appendChild(row);
        }
        
        scoresList.appendChild(tableBody);
        modalContent.appendChild(scoresList);
        
        // Create close button
        const closeButton = document.createElement('button');
        closeButton.className = 'btn close-btn';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => {
            modalBackground.remove();
        });
        modalContent.appendChild(closeButton);
        
        // Assemble modal
        modal.appendChild(modalContent);
        modalBackground.appendChild(modal);
        document.body.appendChild(modalBackground);
    }
    
    // Show a message
    function showMessage(message, type = '') {
        messageElement.textContent = message;
        messageElement.className = 'message';
        
        if (type) {
            messageElement.classList.add(type);
        }
        
        // Clear non-success messages after some time
        if (type !== 'success') {
            setTimeout(() => {
                // Only clear if it's still the same message
                if (messageElement.textContent === message) {
                    messageElement.textContent = '';
                    messageElement.className = 'message';
                }
            }, 5000);
        }
    }
    
    // Prevent default touch behaviors that might interfere with the game
    document.addEventListener('touchstart', function(e) {
        // Only prevent default if we're touching the word grid
        if (e.target.closest('#wordGrid')) {
            e.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('touchmove', function(e) {
        // Only prevent default if we're touching the word grid
        if (e.target.closest('#wordGrid')) {
            e.preventDefault();
        }
    }, { passive: false });

    // Enhanced touch handling for word selection
    function handleTouchMove(e) {
        if (!isSelecting) return;
        
        e.preventDefault();
        
        const touch = e.touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        
        if (element && element.classList.contains('grid-cell')) {
            const cellY = parseInt(element.dataset.y);
            const cellX = parseInt(element.dataset.x);
            
            // Only process if it's a different cell than the last one
            if (!lastTouchedCell || 
                lastTouchedCell.y !== cellY || 
                lastTouchedCell.x !== cellX) {
                
                lastTouchedCell = { y: cellY, x: cellX };
                continueSelection(cellY, cellX);
            }
        }
    }

    // Add the event listener to the word grid
    wordGrid.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    // Ensure the game works well on orientation change
    window.addEventListener('resize', function() {
        // If we have an active grid, redraw it to fit the new screen size
        if (wordSearchData.grid.length > 0) {
            renderGrid();
            // Re-highlight found words
            wordSearchData.placedWords.forEach(word => {
                if (word.found) {
                    highlightFoundWord(word);
                }
            });
        }
    });

    // Function to highlight a found word on the grid
    function highlightFoundWord(wordData) {
        const { start, direction, word } = wordData;
        
        for (let i = 0; i < word.length; i++) {
            const y = start.y + i * direction.dy;
            const x = start.x + i * direction.dx;
            
            const cell = document.querySelector(`.grid-cell[data-y="${y}"][data-x="${x}"]`);
            if (cell) {
                cell.classList.add('highlighted');
            }
        }
    }

    // Add offline support notice
    function checkOnlineStatus() {
        if (!navigator.onLine) {
            showMessage('You are offline. The game will continue to work, but sound effects may be unavailable.', 'info');
        }
    }
    
    // Check online status at start
    checkOnlineStatus();
    
    // Add listeners for online/offline events
    window.addEventListener('online', () => {
        showMessage('You are back online!', 'success');
    });
    
    window.addEventListener('offline', () => {
        showMessage('You are offline. The game will continue to work, but sound effects may be unavailable.', 'info');
    });

    // Initialize with default words and auto-generate
    wordListInput.value = "APPLE, TIGER, MOUNTAIN, ROBOT, CLOUD, OCEAN, FOREST";
    
    // Load high scores from localStorage
    gameStats.highScores = JSON.parse(localStorage.getItem('wordSearchHighScores') || '[]');
    
    // Auto-generate on page load
    window.setTimeout(() => {
        generateWordSearch();
    }, 500);
});