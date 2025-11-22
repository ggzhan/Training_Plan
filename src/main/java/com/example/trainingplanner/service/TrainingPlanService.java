package com.example.trainingplanner.service;

import com.example.trainingplanner.model.Exercise;
import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.PlayerPair;
import com.example.trainingplanner.model.TrainingSession;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class TrainingPlanService {

    private final CsvService csvService;

    public TrainingPlanService(CsvService csvService) {
        this.csvService = csvService;
    }

    /**
     * Generates random player pairs from the available players.
     * 
     * @param players     List of all available players
     * @param pairsNeeded Number of pairs needed
     * @return List of PlayerPair objects
     */
    private List<PlayerPair> generatePairs(List<Player> players, int pairsNeeded) {
        List<PlayerPair> pairs = new ArrayList<>();

        // Create a shuffled copy to randomize pairing
        List<Player> shuffledPlayers = new ArrayList<>(players);
        Collections.shuffle(shuffledPlayers);

        // Generate pairs from shuffled list
        for (int i = 0; i < pairsNeeded * 2 && i + 1 < shuffledPlayers.size(); i += 2) {
            pairs.add(new PlayerPair(shuffledPlayers.get(i), shuffledPlayers.get(i + 1)));
        }

        return pairs;
    }

    public TrainingSession generatePlan(int totalTimeMinutes, String trainingDate) throws Exception {
        List<Exercise> allExercises = csvService.readExercises();
        List<Player> allPlayers = csvService.readPlayersForDate(trainingDate);

        // Filter exercises suitable for the player count (remove min/max player
        // filtering)
        List<Exercise> suitableExercises = new ArrayList<>(allExercises);

        if (suitableExercises.isEmpty()) {
            throw new RuntimeException("No exercises found.");
        }

        // Shuffle to get random selection
        Collections.shuffle(suitableExercises);

        List<Exercise> selectedExercises = new ArrayList<>();
        int currentDuration = 0;

        for (Exercise exercise : suitableExercises) {
            if (currentDuration + exercise.getDurationMinutes() <= totalTimeMinutes) {
                selectedExercises.add(exercise);
                currentDuration += exercise.getDurationMinutes();
            }
        }

        // Generate pairs for each exercise using ALL available players
        Map<Exercise, List<PlayerPair>> exercisePairs = new HashMap<>();
        int totalPlayers = allPlayers.size();
        int pairsNeeded = totalPlayers / 2; // Pair up all players
        Player unpairedPlayer = null;

        // If odd number of players, one will be left unpaired
        if (totalPlayers % 2 != 0 && totalPlayers > 0) {
            // Shuffle and take the last player as unpaired
            List<Player> shuffledPlayers = new ArrayList<>(allPlayers);
            Collections.shuffle(shuffledPlayers);
            unpairedPlayer = shuffledPlayers.get(shuffledPlayers.size() - 1);

            // Remove unpaired player from the list for pairing
            List<Player> playersForPairing = new ArrayList<>(shuffledPlayers);
            playersForPairing.remove(playersForPairing.size() - 1);

            for (Exercise exercise : selectedExercises) {
                if (playersForPairing.size() >= 2) {
                    List<PlayerPair> pairs = generatePairs(playersForPairing, pairsNeeded);
                    exercisePairs.put(exercise, pairs);
                } else {
                    exercisePairs.put(exercise, new ArrayList<>());
                }
            }
        } else {
            // Even number of players, pair them all
            for (Exercise exercise : selectedExercises) {
                if (totalPlayers >= 2) {
                    List<PlayerPair> pairs = generatePairs(allPlayers, pairsNeeded);
                    exercisePairs.put(exercise, pairs);
                } else {
                    exercisePairs.put(exercise, new ArrayList<>());
                }
            }
        }

        TrainingSession session = new TrainingSession();
        session.setExercises(selectedExercises);
        session.setTotalDuration(currentDuration);
        session.setPlayerCount(totalPlayers);
        session.setNotes("Generated plan with " + selectedExercises.size() + " exercises.");
        session.setExercisePairs(exercisePairs);
        session.setUnpairedPlayer(unpairedPlayer);

        return session;
    }
}
