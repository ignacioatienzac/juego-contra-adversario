// VARIABLE GLOBAL para el vocabulario
let VOCABULARY = [];

// Función para cargar los datos externos
async function loadVocabulary() {
    try {
        const response = await fetch('vocabulario_a1.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        // Procesar y asignar
        VOCABULARY = data.map(v => ({
            raw: v.palabra,
            // Normalizar: mayúsculas y sin tildes para el tablero
            clean: v.palabra.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(),
            hint: v.traduccion_ingles
        })).filter(w => w.clean.length > 1 && w.clean.length <= 8); 
        
        console.log("Vocabulario cargado:", VOCABULARY.length, "palabras");

        // Habilitar botones
        document.querySelectorAll('.btn-start').forEach(btn => {
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.disabled = false;
        });

    } catch (error) {
        console.error("Error cargando vocabulario:", error);
        alert("Error cargando 'vocabulario_a1.json'. Verifica que el archivo existe.");
    }
}

// --- GENERADOR DE ARROWWORDS (DENSIDAD ALTA) ---
class CrosswordGenerator {
    constructor(rows, cols) {
        this.rows = rows;
        this.cols = cols;
        this.grid = null; // Matriz bidimensional
        this.placedWords = [];
    }

    generate() {
        if (VOCABULARY.length === 0) return null;

        // Intentamos varias veces generar un tablero válido
        for (let attempt = 0; attempt < 20; attempt++) {
            // 1. Inicializar Grid Vacío
            this.grid = Array(this.rows).fill().map(() => Array(this.cols).fill(null));
            this.placedWords = [];

            // 2. Marcar Fila 0 y Columna 0 como RESERVADAS (Solo Pistas)
            // No ponemos null, ponemos un marcador especial para saber que es zona de pistas
            for(let r=0; r<this.rows; r++) this.grid[r][0] = { type: 'reserved_clue' };
            for(let c=0; c<this.cols; c++) this.grid[0][c] = { type: 'reserved_clue' };

            // 3. Colocar palabras agresivamente
            this.fillBoardLogic();

            // 4. Validar calidad (mínimo de palabras para que sea jugable)
            if (this.placedWords.length >= 5) {
                this.finalizeBoard(); // Rellenar huecos vacíos
                return { grid: this.grid, words: this.placedWords };
            }
        }
        return null;
    }

    fillBoardLogic() {
        // Ordenamos vocabulario por longitud (largas primero ayuda a estructurar)
        // Pero añadimos algo de aleatoriedad para que no sea siempre igual
        const shuffledVocab = [...VOCABULARY].sort(() => Math.random() - 0.5);
        
        // Intentar colocar cada palabra del vocabulario
        for (const wordObj of shuffledVocab) {
            this.tryPlaceWordEverywhere(wordObj);
        }
    }

    tryPlaceWordEverywhere(wordObj) {
        // Crear lista de todas las posiciones posibles para esta palabra
        const candidates = [];
        const len = wordObj.clean.length;

        // Barrido Horizontal
        // Empezamos en c=1 porque c=0 es reservado. Terminamos ajustado a len.
        for (let r = 1; r < this.rows; r++) {
            for (let c = 1; c <= this.cols - len; c++) {
                if (this.canPlace(wordObj.clean, r, c, 'h')) {
                    candidates.push({r, c, dir: 'h'});
                }
            }
        }

        // Barrido Vertical
        // Empezamos r=1.
        for (let r = 1; r <= this.rows - len; r++) {
            for (let c = 1; c < this.cols; c++) {
                if (this.canPlace(wordObj.clean, r, c, 'v')) {
                    candidates.push({r, c, dir: 'v'});
                }
            }
        }

        if (candidates.length === 0) return;

        // Elegir el "mejor" candidato
        // Prioridad: Cruces con otras palabras > Aleatorio
        // Esto aumenta la densidad
        candidates.sort((a, b) => {
            const intersectionsA = this.countIntersections(wordObj.clean, a.r, a.c, a.dir);
            const intersectionsB = this.countIntersections(wordObj.clean, b.r, b.c, b.dir);
            return intersectionsB - intersectionsA; // Mayor intersección primero
        });

        // Tomar uno de los mejores (top 3 para variedad)
        const best = candidates.slice(0, 3);
        const choice = best[Math.floor(Math.random() * best.length)];

        if (choice) {
            this.placeWord(wordObj, choice.r, choice.c, choice.dir);
        }
    }

    canPlace(word, r, c, dir) {
        // Verificar espacio para la palabra
        for (let i = 0; i < word.length; i++) {
            let cr = dir === 'v' ? r + i : r;
            let cc = dir === 'h' ? c + i : c;

            const cell = this.grid[cr][cc];
            
            // Si la celda está ocupada
            if (cell && cell.type === 'char') {
                if (cell.char !== word[i]) return false; // Choque de letras
            }
            // Si la celda es reservada o pista (no debería pasar por los límites de los bucles, pero por seguridad)
            if (cell && (cell.type === 'reserved_clue' || cell.type === 'clue')) return false;
        }

        // VERIFICACIÓN CRÍTICA: Casilla de Pista
        // La casilla ANTERIOR a la palabra debe estar disponible para ser pista.
        let clueR = dir === 'v' ? r - 1 : r;
        let clueC = dir === 'h' ? c - 1 : c;

        // Si la casilla de pista ya tiene una letra, NO podemos poner la palabra aquí
        if (this.grid[clueR][clueC] && this.grid[clueR][clueC].type === 'char') return false;

        return true;
    }

    countIntersections(word, r, c, dir) {
        let count = 0;
        for (let i = 0; i < word.length; i++) {
            let cr = dir === 'v' ? r + i : r;
            let cc = dir === 'h' ? c + i : c;
            if (this.grid[cr][cc] && this.grid[cr][cc].type === 'char') count++;
        }
        return count;
    }

    placeWord(wordObj, r, c, dir) {
        // 1. Colocar Pista
        let clueR = dir === 'v' ? r - 1 : r;
        let clueC = dir === 'h' ? c - 1 : c;

        if (!this.grid[clueR][clueC] || this.grid[clueR][clueC].type === 'reserved_clue') {
            this.grid[clueR][clueC] = { type: 'clue', hints: {} };
        }
        
        // Asignar texto de pista
        if (dir === 'h') this.grid[clueR][clueC].hints.right = wordObj.hint;
        else this.grid[clueR][clueC].hints.down = wordObj.hint;

        // 2. Colocar Letras
        for (let i = 0; i < wordObj.clean.length; i++) {
            let cr = dir === 'v' ? r + i : r;
            let cc = dir === 'h' ? c + i : c;
            this.grid[cr][cc] = { type: 'char', char: wordObj.clean[i] };
        }

        this.placedWords.push({
            word: wordObj.clean,
            r, c, dir
        });
    }

    finalizeBoard() {
        // REGLA: "No puede haber ninguna casilla sin nada"
        // Recorremos todo el tablero. Lo que sea null o reserved_clue sin pistas,
        // lo convertimos en un bloque decorativo o vacío.
        
        for(let r=0; r<this.rows; r++) {
            for(let c=0; c<this.cols; c++) {
                if (!this.grid[r][c] || this.grid[r][c].type === 'reserved_clue') {
                    // Si está vacío, lo hacemos un bloque de relleno (type: 'block')
                    // Opcionalmente podríamos hacerlo 'clue' sin texto si quisiéramos estética pura
                    this.grid[r][c] = { type: 'block' }; 
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
        this.disableStartButtons();
        loadVocabulary();
    }
    
    disableStartButtons() {
        document.querySelectorAll('.btn-start').forEach(btn => {
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.disabled = true;
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
        if (VOCABULARY.length === 0) return;

        this.difficulty = diff;
        document.getElementById('level-display').innerText = 
            diff === 'easy' ? 'Fácil' : diff === 'medium' ? 'Interm.' : 'Difícil';
        document.getElementById('start-modal').style.display = 'none';
        
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
            console.warn("Generación difícil, reintentando...");
            this.generateNewBoard(); // Recursión simple si falla
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
                    // Estilo para celdas de relleno (Fila 0/Col 0 vacías o huecos internos)
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
        // Recopilar letras que faltan en el tablero
        for(let r=0; r<this.rows; r++){
            for(let c=0; c<this.cols; c++){
                if (this.generatedData.grid[r][c]?.type === 'char' && !this.currentState[r][c]) {
                    neededChars.push(this.generatedData.grid[r][c].char);
                }
            }
        }

        // Llenar mano (Estrategia mixta: útiles + aleatorias)
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

        // Usar ficha
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
        // Buscar palabras que pasan por esta celda en la lista generada
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
        document.getElementById(`score-${who}`).textContent = this.score[who];
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

// --- INTELIGENCIA ARTIFICIAL ---
class AI {
    play() {
        // Encontrar huecos disponibles
        const available = [];
        for(let r=0; r<game.rows; r++){
            for(let c=0; c<game.cols; c++){
                if (game.generatedData.grid[r][c]?.type === 'char' && !game.currentState[r][c]) {
                    available.push({r, c, char: game.generatedData.grid[r][c].char});
                }
            }
        }

        if (available.length === 0) return; // Fin

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

        // Selección de movimiento
        let index = Math.floor(Math.random() * available.length);
        // (Aquí se podría mejorar la lógica Hard para buscar bonus de palabra completa)
        
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
