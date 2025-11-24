// ===== PLAYER MANAGEMENT (for index.html) =====
let currentPlayers = [];

// Initialize player management if on index page
if (document.getElementById('trainingDate')) {
    document.addEventListener('DOMContentLoaded', function () {
        const dateSelect = document.getElementById('trainingDate');
        const addPlayerBtn = document.getElementById('addPlayerBtn');
        const planForm = document.getElementById('planForm');

        // Load players when date changes
        dateSelect.addEventListener('change', loadPlayers);

        // Load players on initial page load
        loadPlayers();

        // Add player button
        addPlayerBtn.addEventListener('click', showAddPlayerModal);

        // Form submission - populate hidden field
        planForm.addEventListener('submit', function (e) {
            document.getElementById('playersJson').value = JSON.stringify(currentPlayers);
        });
    });
}

function loadPlayers() {
    const date = document.getElementById('trainingDate').value;
    fetch(`/api/players?date=${encodeURIComponent(date)}`)
        .then(response => response.json())
        .then(players => {
            currentPlayers = players;
            renderPlayerList();
        })
        .catch(error => {
            console.error('Error loading players:', error);
        });
}

function renderPlayerList() {
    const tbody = document.getElementById('playerListBody');
    const playerCount = document.getElementById('playerCount');

    tbody.innerHTML = '';
    playerCount.textContent = currentPlayers.length;

    currentPlayers.forEach((player, index) => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #e5e7eb';
        row.innerHTML = `
            <td style="padding: 0.75rem;">${player.name}</td>
            <td style="padding: 0.75rem; text-align: center;">${player.klassierung}</td>
            <td style="padding: 0.75rem; text-align: right;">
                <button type="button" onclick="editPlayer(${index})" class="btn-secondary" style="padding: 0.25rem 0.75rem; font-size: 0.85rem; margin-right: 0.5rem;">Edit</button>
                <button type="button" onclick="deletePlayer(${index})" class="btn-danger" style="padding: 0.25rem 0.75rem; font-size: 0.85rem; background-color: #dc2626; color: white; border: none; border-radius: 0.375rem; cursor: pointer;">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Modal state
let editingPlayerIndex = null;

function showAddPlayerModal() {
    editingPlayerIndex = null;
    document.getElementById('modalTitle').textContent = 'Add Player';
    document.getElementById('playerName').value = '';
    document.getElementById('playerKlassierung').value = '1';
    document.getElementById('playerModal').style.display = 'flex';
    document.getElementById('playerName').focus();
}

function editPlayer(index) {
    editingPlayerIndex = index;
    const player = currentPlayers[index];
    document.getElementById('modalTitle').textContent = 'Edit Player';
    document.getElementById('playerName').value = player.name;
    document.getElementById('playerKlassierung').value = player.klassierung;
    document.getElementById('playerModal').style.display = 'flex';
    document.getElementById('playerName').focus();
}

function closePlayerModal() {
    document.getElementById('playerModal').style.display = 'none';
    editingPlayerIndex = null;
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
    closePlayerModal();
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
    const exerciseItem = document.querySelector(`.exercise-item[data-exercise-index="${exerciseIndex}"]`);

    if (!exerciseItem) {
        return;
    }

    const pairViews = exerciseItem.querySelectorAll('.pair-view');
    const pairEdits = exerciseItem.querySelectorAll('.pair-edit');
    const unpairedView = exerciseItem.querySelector('.unpaired-view');
    const unpairedEdit = exerciseItem.querySelector('.unpaired-edit');

    const isEditing = button.textContent.includes('Save');

    if (isEditing) {
        // Save mode - collect changes and update view
        pairEdits.forEach((editSpan, index) => {
            const player1Select = editSpan.querySelector('.player1-select');
            const player2Select = editSpan.querySelector('.player2-select');
            const viewSpan = pairViews[index];

            // Update view with selected values
            const playerNames = viewSpan.querySelectorAll('.player-name');
            playerNames[0].textContent = player1Select.value;
            playerNames[1].textContent = player2Select.value;
        });

        // Update unpaired player view if it exists
        if (unpairedView && unpairedEdit) {
            const unpairedSelect = unpairedEdit.querySelector('.unpaired-player-select');
            const unpairedNameSpan = unpairedView.querySelector('.unpaired-player-name');
            if (unpairedSelect && unpairedNameSpan) {
                unpairedNameSpan.textContent = unpairedSelect.value;
            }
        }

        // Switch back to view mode
        pairViews.forEach(view => view.style.display = 'inline');
        pairEdits.forEach(edit => edit.style.display = 'none');
        if (unpairedView && unpairedEdit) {
            unpairedView.style.display = 'block';
            unpairedEdit.style.display = 'none';
        }
        button.textContent = '✏️ Edit';
        button.classList.remove('btn-save');
        button.classList.add('btn-edit');
    } else {
        // Edit mode - show dropdowns
        pairViews.forEach(view => view.style.display = 'none');
        pairEdits.forEach(edit => edit.style.display = 'inline');
        if (unpairedView && unpairedEdit) {
            unpairedView.style.display = 'none';
            unpairedEdit.style.display = 'block';
        }
        button.textContent = '💾 Save';
        button.classList.remove('btn-edit');
        button.classList.add('btn-save');

        // Validate and highlight duplicates/unused players
        validatePairings(exerciseItem);

        // Initialize previous value for ALL selects for auto-swap
        const allSelects = exerciseItem.querySelectorAll('.player-select');
        allSelects.forEach(select => {
            if (!select.dataset.previousValue) {
                select.dataset.previousValue = select.value;
            }
        });

        // Check if listeners are already attached to avoid duplicates
        if (exerciseItem.dataset.listenersAttached === 'true') {
            console.log('Listeners already attached, skipping attachment');
            return;
        }
        console.log('Attaching new event listeners (delegated)');

        // Attach a SINGLE delegated listener to the exercise item
        exerciseItem.addEventListener('change', (e) => {
            // Handle all player select changes
            if (e.target.classList.contains('player-select')) {
                console.log('Delegated change event caught - VERSION 3');

                const newPlayer = e.target.value;
                const oldPlayer = e.target.dataset.previousValue;

                console.log(`Auto-swap triggered: "${oldPlayer}" → "${newPlayer}"`);

                if (oldPlayer) {
                    // Find where the new player is currently selected (in other pairs or unpaired)
                    // and replace them with the old player
                    const otherSelects = Array.from(exerciseItem.querySelectorAll('.player-select')).filter(s => s !== e.target);

                    let swapped = false;
                    otherSelects.forEach(select => {
                        if (select.value === newPlayer) {
                            console.log(`  Found match! Replacing "${newPlayer}" with "${oldPlayer}"`);
                            select.value = oldPlayer;
                            // Also update the previousValue of the OTHER select so it doesn't trigger a swap back if we change it later
                            select.dataset.previousValue = oldPlayer;
                            swapped = true;
                        }
                    });

                    if (!swapped) {
                        console.log('  No match found elsewhere (player might be unused)');
                    }
                } else {
                    console.warn('oldPlayer value is missing, skipping swap');
                }

                // Update the previous value for next change
                e.target.dataset.previousValue = newPlayer;

                // Generic validation (runs for ALL player selects)
                console.log('Running validation');
                validatePairings(exerciseItem);
            }
        });

        // Mark as attached
        exerciseItem.dataset.listenersAttached = 'true';
    }
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
});
