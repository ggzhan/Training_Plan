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
        // Save mode - collect changes and update view
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
    } else {
        // Edit mode - show dropdowns
        pairViews.forEach(view => view.style.display = 'none');
        pairEdits.forEach(edit => edit.style.display = 'block');
        if (unpairedView && unpairedEdit) {
            unpairedView.style.display = 'none';
            unpairedEdit.style.display = 'block';
        }
        button.innerHTML = '<i class="bi bi-check-circle"></i> Save';

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

                if (oldPlayer) {
                    // Find where the new player is currently selected and swap
                    const otherSelects = Array.from(exerciseCard.querySelectorAll('.player-select')).filter(s => s !== e.target);

                    otherSelects.forEach(select => {
                        if (select.value === newPlayer) {
                            select.value = oldPlayer;
                            select.dataset.previousValue = oldPlayer;
                        }
                    });
                }
            }

            // Update the previous value for next change
            e.target.dataset.previousValue = newPlayer;

            // Generic validation (runs for ALL player selects)
            console.log('Running validation');
            validatePairings(exerciseCard);
        });

        // Mark as attached
        exerciseCard.dataset.listenersAttached = 'true';
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
