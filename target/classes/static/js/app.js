// ===== UNDO/REDO STATE MANAGEMENT =====
let historyStack = [];
let redoStack = [];

// Capture the current state of all exercises
function captureState() {
    const allExerciseCards = document.querySelectorAll('.exercise-card');
    const state = [];

    allExerciseCards.forEach((card, idx) => {
        const exerciseState = {
            index: idx,
            pairs: [],
            unpairedPlayer: null
        };

        // Get pairs from view mode (the source of truth)
        const pairContainers = card.querySelectorAll('[data-pair-index]');
        pairContainers.forEach(pairContainer => {
            const viewDiv = pairContainer.querySelector('.pair-view');
            if (viewDiv) {
                const playerNames = viewDiv.querySelectorAll('strong');
                if (playerNames.length >= 2) {
                    exerciseState.pairs.push({
                        player1: playerNames[0].textContent.trim(),
                        player2: playerNames[1].textContent.trim()
                    });
                }
            }
        });

        // Get unpaired player from view mode
        const unpairedView = card.querySelector('.unpaired-view span');
        if (unpairedView) {
            exerciseState.unpairedPlayer = unpairedView.textContent.trim();
        }

        state.push(exerciseState);
    });

    return state;
}

// Restore a previous state
// Restore a previous state
function restoreState(state) {
    if (!state) return;

    console.log('🔄 Restoring state:', state);

    const allExerciseCards = document.querySelectorAll('.exercise-card');

    state.forEach((exerciseState, idx) => {
        if (idx >= allExerciseCards.length) return;

        const card = allExerciseCards[idx];
        const pairsContainer = card.querySelector('.row.g-2'); // The container for pairs

        if (!pairsContainer) return;

        // Get a template for the pair card
        // We try to use the first child of the current container
        // If the container is empty (unlikely in this app flow), we might fail to render new pairs
        // But since we start with populated exercises, this should be safe.
        let pairTemplate = pairsContainer.firstElementChild;

        // If current container is empty, try to find a template from another exercise
        if (!pairTemplate) {
            const otherCard = document.querySelector('.exercise-card .row.g-2 > div');
            if (otherCard) pairTemplate = otherCard;
        }

        if (!pairTemplate) {
            console.error('Cannot restore state: No pair template found');
            return;
        }

        // Clear the container to remove all existing pairs (prevents duplicates)
        pairsContainer.innerHTML = '';

        // Rebuild pairs from state
        exerciseState.pairs.forEach((pair, pairIdx) => {
            const newPair = pairTemplate.cloneNode(true);
            newPair.dataset.pairIndex = pairIdx;

            const viewDiv = newPair.querySelector('.pair-view');
            const editDiv = newPair.querySelector('.pair-edit');

            // Update view mode
            if (viewDiv) {
                const playerNames = viewDiv.querySelectorAll('strong');
                if (playerNames.length >= 2) {
                    playerNames[0].textContent = pair.player1;
                    playerNames[1].textContent = pair.player2;
                }
            }

            // Update edit mode selects
            if (editDiv) {
                const player1Select = editDiv.querySelector('.player1-select');
                const player2Select = editDiv.querySelector('.player2-select');

                // We need to ensure the selects have the correct value
                // The options are cloned from the template, so they should be correct
                if (player1Select) {
                    player1Select.value = pair.player1;
                    player1Select.dataset.previousValue = pair.player1;
                }
                if (player2Select) {
                    player2Select.value = pair.player2;
                    player2Select.dataset.previousValue = pair.player2;
                }
            }

            pairsContainer.appendChild(newPair);
        });

        console.log(`  Exercise ${idx + 1}: Restored ${exerciseState.pairs.length} pairs`);

        // Update unpaired player
        if (exerciseState.unpairedPlayer) {
            const unpairedView = card.querySelector('.unpaired-view span');
            const unpairedEdit = card.querySelector('.unpaired-player-select');

            if (unpairedView) {
                unpairedView.textContent = exerciseState.unpairedPlayer;
            }
            if (unpairedEdit) {
                unpairedEdit.value = exerciseState.unpairedPlayer;
                unpairedEdit.dataset.previousValue = exerciseState.unpairedPlayer;
            }
        }
    });

    updateUndoRedoButtons();
}

// Undo the last change
function undo() {
    if (historyStack.length === 0) return;

    // Save current state to redo stack
    const currentState = captureState();
    redoStack.push(currentState);

    // Restore previous state
    const previousState = historyStack.pop();
    restoreState(previousState);

    console.log('Undo performed. History stack size:', historyStack.length);
}

// Redo the last undone change
function redo() {
    if (redoStack.length === 0) return;

    // Save current state to history stack
    const currentState = captureState();
    historyStack.push(currentState);

    // Restore next state
    const nextState = redoStack.pop();
    restoreState(nextState);

    console.log('Redo performed. Redo stack size:', redoStack.length);
}

// Update undo/redo button states
function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn) {
        undoBtn.disabled = historyStack.length === 0;
    }
    if (redoBtn) {
        redoBtn.disabled = redoStack.length === 0;
    }
}

// ===== DATA REFRESH =====
function refreshData() {
    const btn = document.getElementById('refreshBtn');
    btn.disabled = true;
    btn.textContent = '🔄 Refreshing...';

    fetch('/api/refresh', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            console.log('Data refreshed:', data);
            // Reload players for current date
            loadPlayers();
            btn.textContent = '✓ Refreshed!';
            setTimeout(() => {
                btn.textContent = '🔄 Refresh Data';
                btn.disabled = false;
            }, 2000);
        })
        .catch(error => {
            console.error('Error refreshing data:', error);
            btn.textContent = '✗ Error';
            setTimeout(() => {
                btn.textContent = '🔄 Refresh Data';
                btn.disabled = false;
            }, 2000);
        });
}

// ===== PLAYER MANAGEMENT (for index.html) =====
let currentPlayers = [];
let editingPlayerIndex = null;
let playerModal = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Only run on index.html
    if (document.getElementById('planForm')) {
        // Initialize Bootstrap modal
        const modalElement = document.getElementById('playerModal');
        if (modalElement) {
            playerModal = new bootstrap.Modal(modalElement);
        }

        // Load players when date changes
        const dateSelect = document.getElementById('trainingDate');
        if (dateSelect) {
            dateSelect.addEventListener('change', loadPlayers);
            loadPlayers(); // Initial load
        }

        // Add player button
        const addPlayerBtn = document.getElementById('addPlayerBtn');
        if (addPlayerBtn) {
            addPlayerBtn.addEventListener('click', () => {
                openAddPlayerModal();
                playerModal.show();
            });
        }

        // Form submission handler
        const form = document.getElementById('planForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                // Populate hidden input with current players
                document.getElementById('playersJson').value = JSON.stringify(currentPlayers);
            });
        }
    }
});

function loadPlayers() {
    const dateSelect = document.getElementById('trainingDate');
    if (!dateSelect) return;

    const selectedDate = dateSelect.value;

    fetch(`/api/players?date=${encodeURIComponent(selectedDate)}`)
        .then(response => response.json())
        .then(players => {
            currentPlayers = players;
            renderPlayerList();
        })
        .catch(error => console.error('Error loading players:', error));
}

function renderPlayerList() {
    const tbody = document.getElementById('playerListBody');
    const countSpan = document.getElementById('playerCount');

    if (!tbody) return;

    tbody.innerHTML = '';
    countSpan.textContent = currentPlayers.length;

    currentPlayers.forEach((player, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${player.name}</td>
            <td class="text-center"><span class="badge bg-primary">${player.klassierung}</span></td>
            <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-primary me-1" onclick="editPlayer(${index})">
                    <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="deletePlayer(${index})">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function openAddPlayerModal() {
    editingPlayerIndex = null;
    document.getElementById('modalTitle').textContent = 'Add Player';
    document.getElementById('playerName').value = '';
    document.getElementById('playerKlassierung').value = '1';
}

function editPlayer(index) {
    editingPlayerIndex = index;
    const player = currentPlayers[index];

    document.getElementById('modalTitle').textContent = 'Edit Player';
    document.getElementById('playerName').value = player.name;
    document.getElementById('playerKlassierung').value = player.klassierung;

    playerModal.show();
}

function savePlayer() {
    const name = document.getElementById('playerName').value.trim();
    const klassierung = parseInt(document.getElementById('playerKlassierung').value);

    if (!name) {
        alert('Please enter a player name.');
        return;
    }

    if (isNaN(klassierung) || klassierung < 1 || klassierung > 21) {
        alert('Invalid Klassierung. Must be between 1 and 21.');
        return;
    }

    if (editingPlayerIndex !== null) {
        // Edit existing player
        currentPlayers[editingPlayerIndex] = { name, klassierung };
    } else {
        // Add new player
        currentPlayers.push({ name, klassierung });
    }

    renderPlayerList();
    playerModal.hide();
}

function deletePlayer(index) {
    if (confirm(`Delete ${currentPlayers[index].name}?`)) {
        currentPlayers.splice(index, 1);
        renderPlayerList();
    }
}

// ===== EXERCISE PAIRING MANAGEMENT (for plan.html) =====

// Toggle edit mode for an exercise (must be global for onclick to work)
function toggleEditMode(button) {
    const exerciseIndex = button.getAttribute('data-exercise-index');
    const exerciseCard = document.querySelector(`.exercise-card[data-exercise-index="${exerciseIndex}"]`);

    if (!exerciseCard) {
        console.error('Exercise card not found for index:', exerciseIndex);
        return;
    }

    const pairViews = exerciseCard.querySelectorAll('.pair-view');
    const pairEdits = exerciseCard.querySelectorAll('.pair-edit');
    const unpairedView = exerciseCard.querySelector('.unpaired-view');
    const unpairedEdit = exerciseCard.querySelector('.unpaired-edit');

    const isEditing = button.innerHTML.includes('Edit');

    if (!isEditing) {
        // Save mode - capture state before making changes
        const currentState = captureState();
        historyStack.push(currentState);
        redoStack = []; // Clear redo stack on new edit
        console.log('State captured. History stack size:', historyStack.length);

        // Collect changes and update view
        pairEdits.forEach((editDiv, index) => {
            const player1Select = editDiv.querySelector('.player1-select');
            const player2Select = editDiv.querySelector('.player2-select');
            const viewDiv = pairViews[index];

            // Update view with selected values
            const playerNames = viewDiv.querySelectorAll('strong');
            if (playerNames.length >= 2) {
                playerNames[0].textContent = player1Select.value;
                playerNames[1].textContent = player2Select.value;
            }
        });

        // Update unpaired player view if it exists
        if (unpairedView && unpairedEdit) {
            const unpairedSelect = unpairedEdit.querySelector('.unpaired-player-select');
            const unpairedSpan = unpairedView.querySelector('span');
            if (unpairedSelect && unpairedSpan) {
                unpairedSpan.textContent = unpairedSelect.value;
            }
        }

        // Switch back to view mode
        pairViews.forEach(view => view.style.display = 'block');
        pairEdits.forEach(edit => edit.style.display = 'none');
        if (unpairedView && unpairedEdit) {
            unpairedView.style.display = 'block';
            unpairedEdit.style.display = 'none';
        }
        button.innerHTML = '<i class="bi bi-pencil"></i> Edit';

        // Update undo/redo button states
        updateUndoRedoButtons();

        // Hide regenerate button
        const regenerateBtn = exerciseCard.querySelector('.regenerate-btn');
        if (regenerateBtn) {
            regenerateBtn.style.display = 'none';
        }
    } else {
        // Edit mode - show dropdowns
        pairViews.forEach(view => view.style.display = 'none');
        pairEdits.forEach(edit => edit.style.display = 'block');
        if (unpairedView && unpairedEdit) {
            unpairedView.style.display = 'none';
            unpairedEdit.style.display = 'block';
        }
        button.innerHTML = '<i class="bi bi-check-circle"></i> Save';

        // Show regenerate button (unless it's the last exercise)
        const regenerateBtn = exerciseCard.querySelector('.regenerate-btn');
        if (regenerateBtn && regenerateBtn.getAttribute('data-is-last') !== 'true') {
            regenerateBtn.style.display = 'inline-block';
        }

        // Validate and highlight duplicates/unused players
        validatePairings(exerciseCard);

        // Initialize previous value for ALL selects for auto-swap
        const allSelects = exerciseCard.querySelectorAll('.player-select');
        allSelects.forEach(select => {
            if (!select.dataset.previousValue) {
                select.dataset.previousValue = select.value;
            }
        });

        // Check if listeners are already attached to avoid duplicates
        if (exerciseCard.dataset.listenersAttached === 'true') {
            return;
        }

        exerciseCard.dataset.listenersAttached = 'true';

        // Attach a SINGLE delegated listener to the exercise card
        exerciseCard.addEventListener('change', (e) => {
            // Handle all player select changes
            if (e.target.classList.contains('player-select')) {
                const newPlayer = e.target.value;
                const oldPlayer = e.target.dataset.previousValue;

                if (oldPlayer && oldPlayer !== newPlayer) {
                    // Find where the new player is currently selected and swap
                    const otherSelects = Array.from(exerciseCard.querySelectorAll('.player-select')).filter(s => s !== e.target);

                    otherSelects.forEach(select => {
                        if (select.value === newPlayer) {
                            // Swap: put the old player where the new player was
                            select.value = oldPlayer;
                            // CRITICAL: Update the previousValue of the OTHER select too
                            select.dataset.previousValue = oldPlayer;
                        }
                    });
                }

                // Update the previous value for THIS select for next change
                e.target.dataset.previousValue = newPlayer;

                // Run validation after swap
                validatePairings(exerciseCard);
            }
        });

        // Mark as attached
        exerciseCard.dataset.listenersAttached = 'true';
    }
}

// Regenerate remaining exercises after manual edits
function regenerateRemaining(button) {
    const exerciseIndex = parseInt(button.getAttribute('data-exercise-index'));
    const allExerciseCards = document.querySelectorAll('.exercise-card');

    console.log('Regenerating exercises after index:', exerciseIndex);

    // NOTE: We do NOT capture state here because it was already captured
    // when the user clicked Save after editing. Capturing again would
    // push the wrong state to the history stack.

    // Show loading state
    button.disabled = true;
    const originalHTML = button.innerHTML;
    button.innerHTML = '<i class="bi bi-hourglass-split"></i> Regenerating...';

    // Collect current pairings from all exercises
    const currentPairings = {};
    const unpairedPlayers = {};
    const availablePlayers = [];

    allExerciseCards.forEach((card, idx) => {
        const exerciseKey = `Exercise ${idx + 1}`;
        const pairs = [];

        // Get pairs from edit mode (if in edit mode) or view mode
        const pairContainers = card.querySelectorAll('[data-pair-index]');
        pairContainers.forEach(pairContainer => {
            const editDiv = pairContainer.querySelector('.pair-edit');
            const viewDiv = pairContainer.querySelector('.pair-view');

            let player1Name, player2Name;

            if (editDiv && editDiv.style.display !== 'none') {
                // In edit mode - get from selects
                player1Name = editDiv.querySelector('.player1-select').value;
                player2Name = editDiv.querySelector('.player2-select').value;
            } else if (viewDiv) {
                // In view mode - get from text
                const playerNames = viewDiv.querySelectorAll('strong');
                if (playerNames.length >= 2) {
                    player1Name = playerNames[0].textContent.trim();
                    player2Name = playerNames[1].textContent.trim();
                }
            }

            if (player1Name && player2Name) {
                pairs.push({
                    player1Name: player1Name,
                    player2Name: player2Name
                });
            }
        });

        currentPairings[exerciseKey] = pairs;

        // Get unpaired player
        const unpairedView = card.querySelector('.unpaired-view span');
        const unpairedEdit = card.querySelector('.unpaired-player-select');

        if (unpairedEdit && unpairedEdit.parentElement.style.display !== 'none') {
            unpairedPlayers[exerciseKey] = unpairedEdit.value;
        } else if (unpairedView) {
            unpairedPlayers[exerciseKey] = unpairedView.textContent.trim();
        }
    });

    // Get available players from the first exercise's dropdowns
    const firstExercise = allExerciseCards[0];
    const firstSelect = firstExercise.querySelector('.player-select');
    if (firstSelect) {
        const options = firstSelect.querySelectorAll('option');
        const seenPlayers = new Set();

        options.forEach(option => {
            const playerName = option.value.trim();

            // Deduplicate players
            if (playerName && !seenPlayers.has(playerName)) {
                seenPlayers.add(playerName);

                // Parse Klassierung from text: "Name (K)"
                let klassierung = 1;
                const text = option.textContent;
                const match = text.match(/\((\d+)\)$/);
                if (match) {
                    klassierung = parseInt(match[1]);
                }

                availablePlayers.push({
                    name: playerName,
                    klassierung: klassierung
                });
            }
        });

        console.log('Collected available players:', availablePlayers.length);
    }

    // Build request
    const request = {
        exerciseIndex: exerciseIndex,
        currentPairings: currentPairings,
        unpairedPlayers: unpairedPlayers,
        availablePlayers: availablePlayers
    };

    console.log('Regenerate request:', request);

    // Call backend API
    fetch('/api/regenerate-exercises', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
    })
        .then(response => response.json())
        .then(data => {
            // Check for duplicates in response (debug only if needed)
            // Object.keys(data.exercisePairs).forEach(key => {
            //     const pairs = data.exercisePairs[key];
            //     const names = new Set();
            //     pairs.forEach(p => {
            //         if (names.has(p.player1.name)) console.error(`DUPLICATE PLAYER IN RESPONSE (${key}):`, p.player1.name);
            //         names.add(p.player1.name);
            //         if (names.has(p.player2.name)) console.error(`DUPLICATE PLAYER IN RESPONSE (${key}):`, p.player2.name);
            //         names.add(p.player2.name);
            //     });
            // });

            // Construct new state object from response
            const newState = {
                exercises: data.exercises.map(ex => {
                    const pairs = data.exercisePairs[ex.name] || [];
                    const unpaired = data.unpairedPlayers[ex.name];

                    return {
                        name: ex.name,
                        pairs: pairs.map(p => ({
                            player1: p.player1.name,
                            player2: p.player2.name
                        })),
                        unpairedPlayer: unpaired ? unpaired.name : null
                    };
                })
            };

            // Use restoreState to update the DOM and handle history
            // This ensures complete cleanup of old DOM elements (preventing stale duplicates)
            restoreState(newState.exercises);

            // Since this is a new action, clear the redo stack
            redoStack = [];
            updateUndoRedoButtons();

            // Show success message
            console.log('Regeneration complete.');

            // Reset button state after a short delay
            setTimeout(() => {
                button.innerHTML = originalHTML;
                button.disabled = false;
            }, 2000);
        })
        .catch(error => {
            console.error('Error regenerating exercises:', error);
            alert('Regeneration failed: ' + error.message + '. Check console for details.');
            button.innerHTML = '<i class="bi bi-x-circle"></i> Error';
            setTimeout(() => {
                button.innerHTML = originalHTML;
                button.disabled = false;
            }, 2000);
        });
}

// Validate pairings and highlight duplicates and unused players
function validatePairings(exerciseItem) {
    const pairEdits = exerciseItem.querySelectorAll('.pair-edit');
    const allSelects = exerciseItem.querySelectorAll('.player-select');
    const unpairedEdit = exerciseItem.querySelector('.unpaired-edit');

    // Collect all selected players (including unpaired)
    const selectedPlayers = [];
    pairEdits.forEach(editSpan => {
        const player1 = editSpan.querySelector('.player1-select').value;
        const player2 = editSpan.querySelector('.player2-select').value;
        selectedPlayers.push(player1, player2);
    });

    // Add unpaired player to the list if it exists
    let unpairedPlayer = null;
    if (unpairedEdit) {
        const unpairedSelect = unpairedEdit.querySelector('.unpaired-player-select');
        if (unpairedSelect) {
            unpairedPlayer = unpairedSelect.value;
            selectedPlayers.push(unpairedPlayer);
        }
    }

    // Get all available players from the first dropdown
    const allPlayers = [];
    if (allSelects.length > 0) {
        const firstSelect = allSelects[0];
        Array.from(firstSelect.options).forEach(option => {
            if (!allPlayers.includes(option.value)) {
                allPlayers.push(option.value);
            }
        });
    }

    // Find duplicates and unused
    const playerCounts = {};
    selectedPlayers.forEach(player => {
        playerCounts[player] = (playerCounts[player] || 0) + 1;
    });

    const duplicates = Object.keys(playerCounts).filter(p => playerCounts[p] > 1);
    const unused = allPlayers.filter(p => !playerCounts[p]);

    // DEBUG: Show what we found
    if (duplicates.length > 0 || unused.length > 0) {
        console.log('🔍 Validation Results:');
        console.log('  Duplicates (RED):', duplicates);
        console.log('  Unused (YELLOW):', unused);
        console.log('  Player counts:', playerCounts);
    }

    // Show/hide warning messages
    let warningDiv = exerciseItem.querySelector('.validation-warning');
    if (duplicates.length > 0 || unused.length > 0) {
        if (!warningDiv) {
            warningDiv = document.createElement('div');
            warningDiv.className = 'validation-warning';
            const pairsList = exerciseItem.querySelector('.pairs-list');
            pairsList.parentNode.insertBefore(warningDiv, pairsList);
        }

        let warningHTML = '';
        if (duplicates.length > 0) {
            warningHTML += `<div class="warning-duplicate">⚠️ Duplicate: ${duplicates.join(', ')}</div>`;
        }
        if (unused.length > 0) {
            warningHTML += `<div class="warning-unused">⚠️ Unused: ${unused.join(', ')}</div>`;
        }
        warningDiv.innerHTML = warningHTML;
    } else if (warningDiv) {
        warningDiv.remove();
    }

    // Highlight pair containers and selects
    const pairItems = exerciseItem.querySelectorAll('.pair-item');
    pairItems.forEach((pairItem, index) => {
        const editSpan = pairItem.querySelector('.pair-edit');
        if (editSpan) {
            const player1Select = editSpan.querySelector('.player1-select');
            const player2Select = editSpan.querySelector('.player2-select');
            const player1 = player1Select.value;
            const player2 = player2Select.value;

            // Remove all validation classes
            pairItem.classList.remove('has-duplicate', 'has-unused');
            player1Select.classList.remove('duplicate-player', 'unused-player');
            player2Select.classList.remove('duplicate-player', 'unused-player');

            // Highlight dropdown options for duplicates and unused
            [player1Select, player2Select].forEach(select => {
                Array.from(select.options).forEach(option => {
                    option.style.backgroundColor = '';
                    option.style.color = '';
                    option.style.fontWeight = '';

                    if (duplicates.includes(option.value)) {
                        option.style.backgroundColor = '#dc2626';
                        option.style.color = '#ffffff';
                        option.style.fontWeight = 'bold';
                    } else if (unused.includes(option.value)) {
                        option.style.backgroundColor = '#f59e0b';
                        option.style.color = '#ffffff';
                        option.style.fontWeight = 'bold';
                    }
                });
            });

            // Add classes based on validation
            let hasDuplicate = false;
            let hasUnused = false;

            if (duplicates.includes(player1)) {
                player1Select.classList.add('duplicate-player');
                hasDuplicate = true;
                console.log('  ❌ Added duplicate-player class to', player1);
            } else if (unused.includes(player1)) {
                player1Select.classList.add('unused-player');
                hasUnused = true;
                console.log('  ⚠️ Added unused-player class to', player1);
            }

            if (duplicates.includes(player2)) {
                player2Select.classList.add('duplicate-player');
                hasDuplicate = true;
                console.log('  ❌ Added duplicate-player class to', player2);
            } else if (unused.includes(player2)) {
                player2Select.classList.add('unused-player');
                hasUnused = true;
                console.log('  ⚠️ Added unused-player class to', player2);
            }

            if (hasDuplicate) {
                pairItem.classList.add('has-duplicate');
            } else if (hasUnused) {
                pairItem.classList.add('has-unused');
            }
        }
    });

    // Highlight unpaired player dropdown if it's a duplicate
    if (unpairedEdit && unpairedPlayer) {
        const unpairedSelect = unpairedEdit.querySelector('.unpaired-player-select');
        if (unpairedSelect) {
            unpairedSelect.classList.remove('duplicate-player', 'unused-player');

            if (duplicates.includes(unpairedPlayer)) {
                unpairedSelect.classList.add('duplicate-player');
                console.log('  ❌ Added duplicate-player class to unpaired player', unpairedPlayer);
            }

            // Also highlight options in unpaired dropdown
            Array.from(unpairedSelect.options).forEach(option => {
                option.style.backgroundColor = '';
                option.style.color = '';
                option.style.fontWeight = '';

                if (duplicates.includes(option.value)) {
                    option.style.backgroundColor = '#dc2626';
                    option.style.color = '#ffffff';
                    option.style.fontWeight = 'bold';
                } else if (unused.includes(option.value)) {
                    option.style.backgroundColor = '#f59e0b';
                    option.style.color = '#ffffff';
                    option.style.fontWeight = 'bold';
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Add simple animation to cards on load
    const card = document.querySelector('.card');
    if (card) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(() => {
            card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100);
    }

    // Initialize undo/redo button states
    updateUndoRedoButtons();

    // Add keyboard shortcuts for undo/redo
    document.addEventListener('keydown', (e) => {
        // Ctrl+Z or Cmd+Z for undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        // Ctrl+Y or Cmd+Shift+Z for redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
            e.preventDefault();
            redo();
        }
    });
});
