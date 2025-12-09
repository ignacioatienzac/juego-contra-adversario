// VARIABLE GLOBAL para el vocabulario
let VOCABULARY = [];

// Función para cargar los datos externos dinámicamente
async function loadVocabulary(filename) {
    try {
        const response = await fetch(filename);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        VOCABULARY = data.map(v => ({
            raw: v.palabra,
            clean: v.palabra.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(),
            hint: v.traduccion_ingles
        })).filter(w => w.clean.length > 1 && w.clean.length <= 10); 
        
        console.log("Vocabulario cargado:", VOCABULARY.length, "palabras");
        return true;

    } catch (error) {
        console.error("Error cargando vocabulario:", error);
        alert(`Error al cargar el archivo '${filename}'. Asegúrate de que existe.`);
        return false;
    }
}

// --- GENERADOR TIPO ARROWWORD (ALTA DENSIDAD) ---
class CrosswordGenerator {
    constructor(rows, cols) {
        this.rows = rows;
        this.cols = cols;
        this.grid = null; 
        this.placedWords = [];
    }

    generate() {
        if (VOCABULARY.length === 0) return null;

        // Intentar varias veces para conseguir un tablero denso
        for (let attempt = 0; attempt < 20; attempt++) {
            this.grid = Array(this.rows).fill().map(() => Array(this.cols).fill(null));
            this.placedWords = [];

            // 1. REGLA ESTRICTA: Fila 0 y Columna 0 SIEMPRE PISTAS
            for(let r=0; r<this.rows; r++) this.grid[r][0] = { type: 'reserved_clue', hints: {} };
            for(let c=0; c<this.cols; c++) this.grid[0][c] = { type: 'reserved_clue', hints: {} };

            // 2. Colocar palabras largas desde los bordes (Estructura principal)
            this.fillHeadersLogic();

            // 3. Rellenar huecos internos (permitiendo pistas internas)
            this.fillInternalGapsLogic();

            // 4. Post-procesado: Convertir huecos vacíos en bloques
            this.finalizeBoard();

            // Calidad: al menos 6 palabras para que valga la pena
            if (this.placedWords.length >= 6) {
                return { grid: this.grid, words: this.placedWords };
            }
        }
        return null;
    }

    fillHeadersLogic() {
        // Intentar llenar columnas verticales desde la fila 0
        let shuffled = [...VOCABULARY].sort(() => Math.random() - 0.5);
        for (let c = 1; c < this.cols; c++) {
            for (const wordObj of shuffled) {
                if (this.canPlace(wordObj.clean, 1, c, 'v')) {
                    this.placeWord(wordObj, 1, c, 'v');
                    break; 
                }
            }
        }

        // Intentar llenar filas horizontales desde la columna 0
        shuffled = [...VOCABULARY].sort(() => Math.random() - 0.5);
        for (let r = 1; r < this.rows; r++) {
            for (const wordObj of shuffled) {
                if (this.canPlace(wordObj.clean, r, 1, 'h')) {
                    this.placeWord(wordObj, r, 1, 'h');
                    break; 
                }
            }
        }
    }

    fillInternalGapsLogic() {
        // Escanear el tablero buscando oportunidades para meter palabras internas
        // Priorizamos palabras cortas para huecos pequeños
        const shortWords = VOCABULARY.filter(w => w.clean.length <= 5).sort(() => Math.random() - 0.5);
        
        // Hacemos varias pasadas
        for(let pass=0; pass<3; pass++) {
            for(let r=1; r<this.rows; r++) {
                for(let c=1; c<this.cols; c++) {
                    // Si la celda está vacía o es un bloque de pista sin usar, intentamos empezar palabra
                    // Nota: para empezar palabra en (r,c), necesitamos que (r, c-1) o (r-1, c) sea convertible a pista
                    
                    for (const wordObj of shortWords) {
                        if (this.canPlace(wordObj.clean, r, c, 'h')) {
                            this.placeWord(wordObj, r, c, 'h');
                            break; 
                        }
                        if (this.canPlace(wordObj.clean, r, c, 'v')) {
                            this.placeWord(wordObj, r, c, 'v');
                            break;
                        }
                    }
                }
            }
        }
    }

    canPlace(word, r, c, dir) {
        // 1. Verificar espacio y cruces de letras
        for (let i = 0; i < word.length; i++) {
            let cr = dir === 'v' ? r + i : r;
            let cc = dir === 'h' ? c + i : c;

            if (cr >= this.rows || cc >= this.cols) return false;

            const cell = this.grid[cr][cc];
            
            // Choque de letra
            if (cell && (cell.type === 'char' && cell.char !== word[i])) return false;
            
            // Choque con celda reservada o pista existente
            // Nota: Una letra no puede caer sobre una pista
            if (cell && (cell.type === 'reserved_clue' || cell.type === 'clue')) return false;
        }

        // 2. Verificar la celda de la PISTA (la anterior)
        let clueR = dir === 'v' ? r - 1 : r;
        let clueC = dir === 'h' ? c - 1 : c;
        
        // Debe estar dentro del tablero
        if (clueR < 0 || clueC < 0) return false;

        const clueCell = this.grid[clueR][clueC];

        // La celda de pista NO puede ser una letra
        if (clueCell && clueCell.type === 'char') return false;
        
        // Si ya es pista, verificar que no tenga ocupada la dirección que necesitamos
        if (clueCell && (clueCell.type === 'clue' || clueCell.type === 'reserved_clue')) {
             if (dir === 'h' && clueCell.hints.right) return false;
             if (dir === 'v' && clueCell.hints.down) return false;
        }

        return true;
    }

    placeWord(wordObj, r, c, dir) {
        let clueR = dir === 'v' ? r - 1 : r;
        let clueC = dir === 'h' ? c - 1 : c;

        // Crear/Actualizar celda de pista
        if (!this.grid[clueR][clueC]) {
            this.grid[clueR][clueC] = { type: 'clue', hints: {} };
        }
        
        // Asignar pista
        if (dir === 'h') this.grid[clueR][clueC].hints.right = wordObj.hint;
        else this.grid[clueR][clueC].hints.down = wordObj.hint;

        // Escribir letras
        for (let i = 0; i < wordObj.clean.length; i++) {
            let cr = dir === 'v' ? r + i : r;
            let cc = dir === 'h' ? c + i : c;
            this.grid[cr][cc] = { type: 'char', char: wordObj.clean[i] };
        }

        this.placedWords.push({ word: wordObj.clean, r, c, dir });
    }

    finalizeBoard() {
        // Convertir cualquier hueco que quede en un bloque visual (casilla de pista vacía)
        for(let r=0; r<this.rows; r++) {
            for(let c=0; c<this.cols; c++) {
                const cell = this.grid[r][c];
                
                // Si es nulo, es un hueco -> bloque
                if (!cell) {
                    this.grid[r][c] = { type: 'block' };
                }
                // Si es una celda reservada o de pista pero sin pistas asignadas -> bloque
                else if ((cell.type === 'reserved_clue' || cell.type === 'clue') && 
                         !cell.hints.right && !cell.hints.down) {
                    this.grid[r][c] = { type: 'block' };
                }
                // Normalizar: si era reserved_clue con pistas, pasarlo a clue normal para renderizado
                else if (cell.type === 'reserved_clue') {
                    cell.type = 'clue';
                }
            }
        }
    }
}

// --- JUEGO (Lógica de Interacción) ---
class Game {
    constructor() {
        this.rows = 10;
        this.cols = 8;
        this.score = { player: 0, ai: 0 };
        this.difficulty = 'easy';
        this.playerRack = [];
        this.isPlayerTurn = true;
        this.selectedTile = null;
        this.generatedData = null;
        this.currentState = null;
        
        this.bindEvents();
    }
    
    bindEvents() {
        document.getElementById('btn-pass').onclick = () => this.passTurn();
        document.getElementById('btn-shuffle').onclick = () => this.shuffleRack();
        
        // Nuevo Botón Resolver
        document.getElementById('btn-solve').onclick = () => {
            if(confirm("¿Seguro que quieres rendirte y ver la solución?")) {
                this.solveGame();
            }
        };
        
        document.querySelectorAll('.btn-level').forEach(btn => {
            btn.onclick = (e) => this.selectLevel(e.currentTarget.dataset.file, e.currentTarget.dataset.label);
        });

        document.querySelectorAll('.btn-start').forEach(btn => {
            btn.onclick = (e) => this.start(e.currentTarget.dataset.diff);
        });

        document.getElementById('btn-back-level').onclick = () => {
            document.getElementById('difficulty-modal').classList.add('hidden');
            document.getElementById('level-modal').classList.remove('hidden');
        };
    }

    async selectLevel(filename, label) {
        const success = await loadVocabulary(filename);
        if (success) {
            document.getElementById('lang-level-display').innerText = label;
            document.getElementById('level-modal').classList.add('hidden');
            document.getElementById('difficulty-modal').classList.remove('hidden');
        }
    }

    start(diff) {
        if (VOCABULARY.length === 0) return;

        this.difficulty = diff;
        document.getElementById('difficulty-display').innerText = 
            diff === 'easy' ? 'Fácil' : diff === 'medium' ? 'Interm.' : 'Difícil';
        
        document.getElementById('difficulty-modal').style.display = 'none'; 
        document.getElementById('loading-msg').classList.remove('hidden');
        
        setTimeout(() => {
            this.generateNewBoard();
            document.getElementById('loading-msg').classList.add('hidden');
        }, 100);
    }

    generateNewBoard() {
        const gen = new CrosswordGenerator(this.rows, this.cols);
        const data = gen.generate();
        
        if (!data) {
            console.warn("Reintentando generación...");
            this.generateNewBoard(); 
            return;
        }

        this.generatedData = data;
        this.currentState = Array(this.rows).fill().map(() => Array(this.cols).fill(null));
        this.score = { player: 0, ai: 0 };
        this.updateScoreUI();
        
        this.renderGrid();
        this.fillPlayerRack();
    }

    // --- NUEVA FUNCIÓN: RESOLVER TABLERO ---
    solveGame() {
        // Rellenar el estado actual con la solución del generador
        for(let r=0; r<this.rows; r++) {
            for(let c=0; c<this.cols; c++) {
                const cellData = this.generatedData.grid[r][c];
                // Si es una casilla de letra
                if (cellData && cellData.type === 'char') {
                    // Si no está ya rellena por la IA o el jugador
                    if (!this.currentState[r][c]) {
                        this.currentState[r][c] = { char: cellData.char, owner: 'player' }; // Asignar al jugador visualmente (azul)
                    }
                }
            }
        }
        this.renderGrid();
        this.isPlayerTurn = false; // Bloquear juego
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

                if (cellData.type === 'clue') {
                    div.classList.add('clue-cell');
                    let html = '';
                    if (cellData.hints?.right) html += `<span class="arrow-right">${cellData.hints.right}</span>`;
                    if (cellData.hints?.down) html += `<span class="arrow-down">${cellData.hints.down}</span>`;
                    div.innerHTML = html;
                } 
                else if (cellData.type === 'char') {
                    div.classList.add('game-cell');
                    div.onclick = () => this.handleCellClick(r, c);
                    
                    const current = this.currentState[r][c];
                    if (current) {
                        div.textContent = current.char;
                        div.classList.add(current.owner === 'ai' ? 'filled-ai' : 'filled-player');
                    }
                } 
                else if (cellData.type === 'block') {
                    div.classList.add('block-cell');
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
                this.selectedTile = (this.selectedTile === index) ? null : index;
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

        if (neededChars.length === 0 && this.playerRack.length === 0) return;

        while(this.playerRack.length < 5) {
            if (neededChars.length > 0 && Math.random() < 0.7) {
                const char = neededChars[Math.floor(Math.random() * neededChars.length)];
                this.playerRack.push(char);
            } else {
                const abc = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
                this.playerRack.push(abc[Math.floor(Math.random() * abc.length)]);
            }
        }
        this.renderRack();
    }

    handleCellClick(r, c) {
        if (!this.isPlayerTurn || this.selectedTile === null) return;
        
        const cellData = this.generatedData.grid[r][c];
        if (cellData.type !== 'char' || this.currentState[r][c]) return;

        const char = this.playerRack[this.selectedTile];
        const correctChar = cellData.char;
        const cellDiv = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);

        this.playerRack.splice(this.selectedTile, 1);
        this.selectedTile = null;

        if (char === correctChar) {
            this.currentState[r][c] = { char: char, owner: 'player' };
            cellDiv.textContent = char;
            cellDiv.classList.add('filled-player', 'correct-flash');
            this.updateScore('player', 1);
            this.checkWordCompletion(r, c, 'player');
        } else {
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
            if (isComplete) this.updateScore(who, w.word.length);
        });
    }

    updateScore(who, points) {
        this.score[who] += points;
        this.updateScoreUI();
    }
    
    updateScoreUI() {
        document.getElementById(`score-player`).textContent = this.score.player;
        document.getElementById(`score-ai`).textContent = this.score.ai;
    }

    passTurn() {
        if (!this.isPlayerTurn) return;
        this.isPlayerTurn = false;
        this.updateTurnIndicator(false);
        setTimeout(() => ai.play(), 1000);
    }
    
    updateTurnIndicator(isPlayer) {
        const el = document.getElementById('turn-indicator');
        if(isPlayer) {
            el.textContent = "Tu Turno";
            el.className = "px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold mb-1";
        } else {
            el.textContent = "Turno IA...";
            el.className = "px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold mb-1";
        }
    }
    
    shuffleRack() {
        if(!this.isPlayerTurn) return;
        this.playerRack.sort(() => Math.random() - 0.5);
        this.renderRack();
    }
}

// --- IA ---
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

        if (available.length === 0) return;

        let moves = 1;
        if (game.difficulty === 'medium') moves = Math.random() > 0.4 ? 2 : 1;
        if (game.difficulty === 'hard') moves = Math.floor(Math.random() * 3) + 2;

        this.makeMove(moves, available);
    }

    makeMove(movesLeft, available) {
        if (movesLeft <= 0 || available.length === 0) {
            game.isPlayerTurn = true;
            game.updateTurnIndicator(true);
            game.fillPlayerRack();
            return;
        }

        let index = Math.floor(Math.random() * available.length);
        const choice = available[index];
        available.splice(index, 1);

        const {r, c, char} = choice;
        game.currentState[r][c] = { char, owner: 'ai' };
        
        const cellDiv = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
        if(cellDiv) {
            cellDiv.textContent = char;
            cellDiv.classList.add('filled-ai');
        }
        
        game.updateScore('ai', 1);
        game.checkWordCompletion(r, c, 'ai');

        setTimeout(() => this.makeMove(movesLeft - 1, available), 800);
    }
}

const game = new Game();
const ai = new AI();
