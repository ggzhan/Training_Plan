package com.example.trainingplanner.service;

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

    public TrainingSession generatePlan(int totalTimeMinutes, String trainingDate, int numberOfExercises)
            throws Exception {
        List<Player> allPlayers = csvService.readPlayersForDate(trainingDate);

        if (numberOfExercises < 1) {
            throw new RuntimeException("Number of exercises must be at least 1.");
        }

        // Generate pairs for each exercise using ALL available players
        // Each exercise will have a different unpaired player (if odd number of
        // players)
        Map<Integer, List<PlayerPair>> exercisePairs = new HashMap<>();
        Map<Integer, Player> unpairedPlayers = new HashMap<>();
        int totalPlayers = allPlayers.size();
        int pairsNeeded = totalPlayers / 2;

        for (int exerciseNumber = 1; exerciseNumber <= numberOfExercises; exerciseNumber++) {
            if (totalPlayers % 2 != 0 && totalPlayers > 0) {
                // Odd number of players - shuffle and select one as unpaired
                List<Player> shuffledPlayers = new ArrayList<>(allPlayers);
                Collections.shuffle(shuffledPlayers);

                // Last player in shuffled list is unpaired for this exercise
                Player unpairedPlayer = shuffledPlayers.get(shuffledPlayers.size() - 1);
                unpairedPlayers.put(exerciseNumber, unpairedPlayer);

                // Remove unpaired player from pairing list
                List<Player> playersForPairing = new ArrayList<>(shuffledPlayers);
                playersForPairing.remove(playersForPairing.size() - 1);

                if (playersForPairing.size() >= 2) {
                    List<PlayerPair> pairs = generatePairs(playersForPairing, pairsNeeded);
                    exercisePairs.put(exerciseNumber, pairs);
                } else {
                    exercisePairs.put(exerciseNumber, new ArrayList<>());
                }
            } else {
                // Even number of players - pair them all
                if (totalPlayers >= 2) {
                    List<PlayerPair> pairs = generatePairs(allPlayers, pairsNeeded);
                    exercisePairs.put(exerciseNumber, pairs);
                } else {
                    exercisePairs.put(exerciseNumber, new ArrayList<>());
                }
            }
        }

        TrainingSession session = new TrainingSession();
        session.setNumberOfExercises(numberOfExercises);
        session.setTotalDuration(totalTimeMinutes);
        session.setPlayerCount(totalPlayers);
        session.setNotes("Generated plan with " + numberOfExercises + " exercises.");
        session.setExercisePairs(exercisePairs);
        session.setUnpairedPlayers(unpairedPlayers);

        return session;
    }
}
