// VARIABLE GLOBAL para el vocabulario
let VOCABULARY = [];

// Función para cargar los datos externos
async function loadVocabulary() {
    try {
        const response = await fetch('vocabulario_a1.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Procesar y asignar a la variable global
        VOCABULARY = data.map(v => ({
            raw: v.palabra,
            // Quitamos tildes y mayúsculas para facilitar cruces
            clean: v.palabra.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(),
            hint: v.traduccion_ingles
        })).filter(w => w.clean.length > 1 && w.clean.length <= 8); // Filtrar palabras muy largas
        
        console.log("Vocabulario cargado:", VOCABULARY.length, "palabras");

        // Habilitar botones de inicio ahora que tenemos datos
        document.querySelectorAll('.btn-start').forEach(btn => {
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.disabled = false;
            // Actualizar texto para indicar listo
            const originalText = btn.innerText;
            btn.innerText = originalText.replace('(Cargando...)', '');
        });

    } catch (error) {
        console.error("Error cargando vocabulario:", error);
        alert("Error cargando el archivo 'vocabulario_a1.json'. Asegúrate de que está en la misma carpeta.");
    }
}

// --- 2. GENERADOR DE CRUCIGRAMAS ---
class CrosswordGenerator {
    constructor(rows, cols) {
        this.rows = rows;
        this.cols = cols;
        this.grid = null;
        this.placedWords = [];
    }

    generate() {
        if (VOCABULARY.length === 0) {
            console.error("No hay vocabulario cargado");
            return null;
        }

        // Intentar generar varias veces si falla
        for (let attempt = 0; attempt < 10; attempt++) {
            this.grid = Array(this.rows).fill().map(() => Array(this.cols).fill(null));
            this.placedWords = [];
            
            // 1. Colocar primera palabra (la más larga posible para abrir el tablero)
            const seeds = [...VOCABULARY].sort((a, b) => b.clean.length - a.clean.length).slice(0, 10);
            const seed = seeds[Math.floor(Math.random() * seeds.length)];
            
            // Colocar en el centro aprox
            const startR = Math.floor(this.rows / 2) - Math.floor(seed.clean.length / 2) + 1;
            const startC = Math.floor(this.cols / 2);
            
            if (this.placeWord(seed, startR, startC, 'v')) { // Empezar vertical suele ayudar
                // 2. Intentar colocar más palabras
                this.fillGrid(300); // 300 intentos de colocación
                
                // Validar si el tablero es decente (al menos 4 palabras)
                if (this.placedWords.length >= 4) {
                    // Rellenar pistas (Clue placement logic)
                    this.placeClues();
                    return { grid: this.grid, words: this.placedWords };
                }
            }
        }
        // Fallback (debería ser raro con buen vocabulario)
        return null;
    }

    fillGrid(maxAttempts) {
        for (let i = 0; i < maxAttempts; i++) {
            const wordObj = VOCABULARY[Math.floor(Math.random() * VOCABULARY.length)];
            if (this.placedWords.some(pw => pw.clean === wordObj.clean)) continue;

            // Buscar intersecciones posibles
            const matches = this.findIntersections(wordObj.clean);
            
            for (const match of matches) {
                if (this.placeWord(wordObj, match.r, match.c, match.dir)) break;
            }
        }
    }

    findIntersections(word) {
        const matches = [];
        // Recorrer el tablero buscando letras que coincidan
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] && this.grid[r][c].char) {
                    const char = this.grid[r][c].char;
                    // Buscar este char en la nueva palabra
                    for (let k = 0; k < word.length; k++) {
                        if (word[k] === char) {
                            // Posible intersección
                            // Si la letra en tablero es parte de una vertical, intentamos poner horizontal
                            matches.push({ r: r, c: c - k, dir: 'h' }); 
                            matches.push({ r: r - k, c: c, dir: 'v' });
                        }
                    }
                }
            }
        }
        // Mezclar resultados para aleatoriedad
        return matches.sort(() => Math.random() - 0.5);
    }

    placeWord(wordObj, r, c, dir) {
        const word = wordObj.clean;
        const len = word.length;
        
        // 1. CHEQUEOS DE LÍMITES
        if (r < 0 || c < 0) return false;
        if (dir === 'h' && c + len > this.cols) return false;
        if (dir === 'v' && r + len > this.rows) return false;

        // 2. NECESITAMOS ESPACIO PARA LA PISTA
        // Horizontal necesita celda a la izquierda (c-1)
        // Vertical necesita celda arriba (r-1)
        const clueR = dir === 'v' ? r - 1 : r;
        const clueC = dir === 'h' ? c - 1 : c;
        
        if (clueR < 0 || clueC < 0) return false;
        
        // La celda de pista debe estar vacía o ser ya una pista
        if (this.grid[clueR][clueC] && this.grid[clueR][clueC].type === 'char') return false;

        // 3. CHEQUEO DE COLISIÓN Y VECINDAD
        for (let i = 0; i < len; i++) {
            let curR = dir === 'v' ? r + i : r;
            let curC = dir === 'h' ? c + i : c;
            
            const cell = this.grid[curR][curC];
            
            // Si hay letra, debe coincidir
            if (cell) {
                if (cell.type === 'char' && cell.char !== word[i]) return false;
                if (cell.type === 'clue') return false; // No pisar pistas
            } else {
                // Si está vacía, verificar que no pegue con otras palabras paralelamente
                if (dir === 'h') {
                    if ((curR > 0 && this.grid[curR-1][curC]?.type === 'char' && !this.isCrossing(curR, curC, 'v')) || 
                        (curR < this.rows-1 && this.grid[curR+1][curC]?.type === 'char' && !this.isCrossing(curR, curC, 'v'))) 
                        return false;
                } else {
                    if ((curC > 0 && this.grid[curR][curC-1]?.type === 'char' && !this.isCrossing(curR, curC, 'h')) || 
                        (curC < this.cols-1 && this.grid[curR][curC+1]?.type === 'char' && !this.isCrossing(curR, curC, 'h')))
                        return false;
                }
            }
        }

        // 4. COLOCAR
        // Reservar celda de pista
        if (!this.grid[clueR][clueC]) this.grid[clueR][clueC] = { type: 'clue', hints: {} };
        
        // Escribir letras
        for (let i = 0; i < len; i++) {
            let curR = dir === 'v' ? r + i : r;
            let curC = dir === 'h' ? c + i : c;
            this.grid[curR][curC] = { type: 'char', char: word[i] };
        }

        this.placedWords.push({
            word: word,
            hint: wordObj.hint,
            r: r,
            c: c,
            dir: dir
        });
        return true;
    }

    isCrossing(r, c, checkDir) {
        return this.grid[r][c] && this.grid[r][c].type === 'char';
    }

    placeClues() {
        this.placedWords.forEach(w => {
            const clueR = w.dir === 'v' ? w.r - 1 : w.r;
            const clueC = w.dir === 'h' ? w.c - 1 : w.c;
            
            if (w.dir === 'h') this.grid[clueR][clueC].hints.right = w.hint;
            if (w.dir === 'v') this.grid[clueR][clueC].hints.down = w.hint;
        });
    }
}

// --- 3. JUEGO ---
class Game {
    constructor() {
        this.rows = 10;
        this.cols = 8;
        this.score = { player: 0, ai: 0 };
        this.difficulty = 'easy';
        this.playerRack = [];
        this.isPlayerTurn = true;
        this.selectedTile = null;
        this.generatedData = null; // { grid, words }
        this.currentState = null; // Estado visual (quien puso qué)
        
        this.bindEvents();
        
        // Desactivar botones de inicio hasta que cargue el vocabulario
        this.disableStartButtons();
        
        // Iniciar carga
        loadVocabulary();
    }
    
    disableStartButtons() {
        document.querySelectorAll('.btn-start').forEach(btn => {
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.disabled = true;
            // Guardar texto original si quieres restaurarlo o añadir indicador
            // btn.innerText += " (Cargando...)"; 
        });
    }

    bindEvents() {
        document.getElementById('btn-pass').onclick = () => this.passTurn();
        document.getElementById('btn-shuffle').onclick = () => this.shuffleRack();
        document.querySelectorAll('.btn-start').forEach(btn => {
            btn.onclick = (e) => this.start(e.target.dataset.diff);
        });
    }

    start(diff) {
        if (VOCABULARY.length === 0) return; // Protección extra

        this.difficulty = diff;
        document.getElementById('level-display').innerText = 
            diff === 'easy' ? 'Fácil' : diff === 'medium' ? 'Interm.' : 'Difícil';
        document.getElementById('start-modal').style.display = 'none';
        
        // Mostrar loading
        document.getElementById('loading-msg').classList.remove('hidden');
        
        // Timeout para que la UI respire antes de generar
        setTimeout(() => {
            this.generateNewBoard();
            document.getElementById('loading-msg').classList.add('hidden');
        }, 100);
    }

    generateNewBoard() {
        const gen = new CrosswordGenerator(this.rows, this.cols);
        const data = gen.generate();
        
        if (!data) {
            console.log("Reintentando generación...");
            this.generateNewBoard();
            return;
        }

        this.generatedData = data;
        this.currentState = Array(this.rows).fill().map(() => Array(this.cols).fill(null));
        
        this.renderGrid();
        this.fillPlayerRack();
    }

    renderGrid() {
        const board = document.getElementById('board');
        board.innerHTML = ''; 

        for(let r=0; r<this.rows; r++) {
            for(let c=0; c<this.cols; c++) {
                const cellData = this.generatedData.grid[r][c];
                const div = document.createElement('div');
                div.className = 'cell';
                div.dataset.r = r;
                div.dataset.c = c;

                if (cellData && cellData.type === 'clue') {
                    div.classList.add('clue-cell');
                    let html = '';
                    if (cellData.hints.right) html += `<span class="arrow-right">${cellData.hints.right.substring(0,12)}</span>`;
                    if (cellData.hints.down) html += `<span class="arrow-down">${cellData.hints.down.substring(0,12)}</span>`;
                    div.innerHTML = html;
                } 
                else if (cellData && cellData.type === 'char') {
                    div.classList.add('game-cell');
                    // Eventos click/touch
                    div.onclick = () => this.handleCellClick(r, c);
                    
                    const current = this.currentState[r][c];
                    if (current) {
                        div.textContent = current.char;
                        div.classList.add(current.owner === 'ai' ? 'filled-ai' : 'filled-player');
                    }
                } else {
                    // Vacía
                    div.style.backgroundColor = '#e2e8f0';
                }
                board.appendChild(div);
            }
        }
    }

    renderRack() {
        const rack = document.getElementById('rack');
        rack.innerHTML = '';
        this.playerRack.forEach((char, index) => {
            const tile = document.createElement('div');
            tile.className = `tile ${this.selectedTile === index ? 'selected' : ''}`;
            tile.textContent = char;
            
            tile.onclick = (e) => {
                e.stopPropagation(); 
                if (this.selectedTile === index) {
                    this.selectedTile = null;
                } else {
                    this.selectedTile = index;
                }
                this.renderRack();
            };
            rack.appendChild(tile);
        });
    }

    fillPlayerRack() {
        const neededChars = [];
        for(let r=0; r<this.rows; r++){
            for(let c=0; c<this.cols; c++){
                if (this.generatedData.grid[r][c]?.type === 'char' && !this.currentState[r][c]) {
                    neededChars.push(this.generatedData.grid[r][c].char);
                }
            }
        }

        while(this.playerRack.length < 5 && neededChars.length > 0) {
            if (Math.random() < 0.7) {
                const char = neededChars[Math.floor(Math.random() * neededChars.length)];
                this.playerRack.push(char);
            } else {
                const abc = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
                this.playerRack.push(abc[Math.floor(Math.random() * abc.length)]);
            }
        }
        while(this.playerRack.length < 5) {
             const abc = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
             this.playerRack.push(abc[Math.floor(Math.random() * abc.length)]);
        }
        
        this.renderRack();
    }

    handleCellClick(r, c) {
        if (!this.isPlayerTurn || this.selectedTile === null) return;
        
        const cellData = this.generatedData.grid[r][c];
        if (!cellData || cellData.type !== 'char' || this.currentState[r][c]) return;

        const char = this.playerRack[this.selectedTile];
        const correctChar = cellData.char;

        const cellDiv = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);

        this.playerRack.splice(this.selectedTile, 1);
        this.selectedTile = null;

        if (char === correctChar) {
            // ACIERTO
            this.currentState[r][c] = { char: char, owner: 'player' };
            cellDiv.textContent = char;
            cellDiv.classList.add('filled-player', 'correct-flash');
            this.updateScore('player', 1);
            this.checkWordCompletion(r, c, 'player');
        } else {
            // FALLO
            cellDiv.classList.add('error-shake');
            setTimeout(() => cellDiv.classList.remove('error-shake'), 400);
            this.updateScore('player', -1);
        }

        this.renderRack();
        
        if (this.playerRack.length === 0) this.fillPlayerRack();
    }

    checkWordCompletion(r, c, who) {
        const words = this.generatedData.words.filter(w => {
            if (w.dir === 'h') return w.r === r && c >= w.c && c < w.c + w.word.length;
            if (w.dir === 'v') return w.c === c && r >= w.r && r < w.r + w.word.length;
            return false;
        });

        words.forEach(w => {
            let isComplete = true;
            for(let i=0; i<w.word.length; i++){
                let currR = w.dir==='v' ? w.r+i : w.r;
                let currC = w.dir==='h' ? w.c+i : w.c;
                if (!this.currentState[currR][currC]) isComplete = false;
            }

            if (isComplete) {
                this.updateScore(who, w.word.length); // Bonus
            }
        });
    }

    updateScore(who, points) {
        this.score[who] += points;
        document.getElementById(`score-${who}`).textContent = this.score[who];
    }

    passTurn() {
        if (!this.isPlayerTurn) return;
        this.isPlayerTurn = false;
        document.getElementById('turn-indicator').textContent = "Turno IA...";
        document.getElementById('turn-indicator').className = "px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold mb-1";
        
        setTimeout(() => ai.play(), 1000);
    }
    
    backToPlayer() {
        this.isPlayerTurn = true;
        document.getElementById('turn-indicator').textContent = "Tu Turno";
        document.getElementById('turn-indicator').className = "px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold mb-1";
        this.fillPlayerRack();
    }
    
    shuffleRack() {
        if(!this.isPlayerTurn) return;
        for (let i = this.playerRack.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.playerRack[i], this.playerRack[j]] = [this.playerRack[j], this.playerRack[i]];
        }
        this.renderRack();
    }
}

// --- 4. IA ---
class AI {
    play() {
        const available = [];
        for(let r=0; r<game.rows; r++){
            for(let c=0; c<game.cols; c++){
                if (game.generatedData.grid[r][c]?.type === 'char' && !game.currentState[r][c]) {
                    available.push({r, c, char: game.generatedData.grid[r][c].char});
                }
            }
        }

        if (available.length === 0) {
            alert("¡Fin del juego!");
            return;
        }

        let moves = 1;
        if (game.difficulty === 'medium') moves = Math.random() > 0.4 ? 2 : 1;
        if (game.difficulty === 'hard') moves = Math.floor(Math.random() * 3) + 2;

        this.makeMove(moves, available);
    }

    makeMove(movesLeft, available) {
        if (movesLeft <= 0 || available.length === 0) {
            game.backToPlayer();
            return;
        }

        let choice = null;
        let index = -1;

        if (game.difficulty === 'hard') {
            index = Math.floor(Math.random() * available.length);
        } else {
            index = Math.floor(Math.random() * available.length);
        }

        choice = available[index];
        available.splice(index, 1);

        const {r, c, char} = choice;
        game.currentState[r][c] = { char, owner: 'ai' };
        
        const cellDiv = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
        cellDiv.textContent = char;
        cellDiv.classList.add('filled-ai');
        
        game.updateScore('ai', 1);
        game.checkWordCompletion(r, c, 'ai');

        setTimeout(() => this.makeMove(movesLeft - 1, available), 800);
    }
}

const game = new Game();
const ai = new AI();
