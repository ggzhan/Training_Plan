package com.example.trainingplanner.service;

import com.example.trainingplanner.model.Exercise;
import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.PlayerPair;
import com.example.trainingplanner.model.TrainingSession;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class TrainingPlanService {

    private final CsvService csvService;
    private final Random random = new Random();

    public TrainingPlanService(CsvService csvService) {
        this.csvService = csvService;
    }

    /**
     * Generates pairs minimizing strength difference while ensuring variety.
     */
    private String getPairKey(PlayerPair pair) {
        // Create a unique key for the pair (order independent)
        String p1 = pair.getPlayer1().getName();
        String p2 = pair.getPlayer2().getName();
        return p1.compareTo(p2) < 0 ? p1 + "|" + p2 : p2 + "|" + p1;
    }

    /**
     * Helper class to store a round with its pairings and total Klassierung
     * difference.
     */
    private static class RoundWithScore {
        List<PlayerPair> pairs;
        int totalDifference;

        RoundWithScore(List<PlayerPair> pairs, int totalDifference) {
            this.pairs = pairs;
            this.totalDifference = totalDifference;
        }
    }

    /**
     * Generate pairings for all exercises using Klassierung-optimized round-robin
     * algorithm.
     * Generates all possible rounds, calculates Klassierung differences, and
     * selects the best 6.
     */
    private Map<Exercise, List<PlayerPair>> generateRoundRobinPairings(
            List<Exercise> exercises, List<Player> players) {

        Map<Exercise, List<PlayerPair>> result = new HashMap<>();
        int numPlayers = players.size();

        if (numPlayers < 2) {
            return result;
        }

        System.out.println("=== Klassierung-Optimized Round-Robin Pairing ===");
        System.out.println("Exercises: " + exercises.size() + ", Players: " + numPlayers);

        // For round-robin, we need even number of players
        if (numPlayers % 2 != 0) {
            System.err.println("Warning: Round-robin pairing expects an even number of players.");
            return result;
        }

        // Generate ALL possible rounds (N-1 rounds for N players)
        int totalRounds = numPlayers - 1;
        List<RoundWithScore> allRounds = new ArrayList<>();

        // Create a mutable list for rotation, keeping player 0 fixed
        List<Player> rotatingPlayers = new ArrayList<>(players.subList(1, numPlayers));

        for (int round = 0; round < totalRounds; round++) {
            List<PlayerPair> pairs = new ArrayList<>();
            int totalDiff = 0;

            // Player 0 (fixed) pairs with the last player in the rotating list
            Player p1 = players.get(0);
            Player p2 = rotatingPlayers.get(rotatingPlayers.size() - 1);
            pairs.add(new PlayerPair(p1, p2));
            totalDiff += Math.abs(p1.getKlassierung() - p2.getKlassierung());

            // Other players pair up
            for (int i = 0; i < rotatingPlayers.size() / 2; i++) {
                Player player1 = rotatingPlayers.get(i);
                Player player2 = rotatingPlayers.get(rotatingPlayers.size() - 2 - i);
                pairs.add(new PlayerPair(player1, player2));
                totalDiff += Math.abs(player1.getKlassierung() - player2.getKlassierung());
            }

            allRounds.add(new RoundWithScore(pairs, totalDiff));
            System.out.println("Round " + (round + 1) + " - Total Klassierung Diff: " + totalDiff);

            // Rotate players for the next round
            if (rotatingPlayers.size() > 1) {
                Player lastPlayer = rotatingPlayers.remove(rotatingPlayers.size() - 1);
                rotatingPlayers.add(0, lastPlayer);
            }
        }

        // Sort rounds by total difference (ascending = better balance)
        allRounds.sort(Comparator.comparingInt(r -> r.totalDifference));

        // Select the best rounds (up to the number of exercises requested)
        System.out.println("\n=== Selecting Best " + exercises.size() + " Rounds ===");
        for (int i = 0; i < Math.min(exercises.size(), allRounds.size()); i++) {
            Exercise exercise = exercises.get(i);
            RoundWithScore selectedRound = allRounds.get(i);
            result.put(exercise, selectedRound.pairs);
            System.out.println("Exercise " + (i + 1) + " - Diff Sum: " + selectedRound.totalDifference);
        }

        return result;
    }

    public TrainingSession generatePlan(int totalTimeMinutes, String trainingDate, String manualUnpairedPlayerName,
            int numberOfExercises)
            throws Exception {
        // Get players for the specific date
        List<Player> availablePlayers = csvService.readPlayersForDate(trainingDate);

        // Filter out manual unpaired player if specified
        if (manualUnpairedPlayerName != null && !manualUnpairedPlayerName.isEmpty()) {
            availablePlayers = availablePlayers.stream()
                    .filter(p -> !p.getName().equals(manualUnpairedPlayerName))
                    .collect(Collectors.toList());
        }

        // Generate custom number of generic exercises
        List<Exercise> selectedExercises = new ArrayList<>();
        for (int i = 1; i <= numberOfExercises; i++) {
            Exercise exercise = new Exercise();
            exercise.setName("Exercise " + i);
            exercise.setDescription("");
            exercise.setType("Generic");
            exercise.setDurationMinutes(15);
            selectedExercises.add(exercise);
        }

        int currentDuration = selectedExercises.size() * 15;

        TrainingSession session = new TrainingSession();
        session.setTotalDuration(currentDuration);
        session.setExercises(selectedExercises);
        session.setPlayerCount(availablePlayers.size());
        session.setNotes("Generated plan with " + selectedExercises.size() + " exercises.");

        Map<Exercise, Player> unpairedPlayers = new HashMap<>();

        // Generate pairings with unique pairs across all exercises
        Map<Exercise, List<PlayerPair>> exercisePairs;

        if (availablePlayers.size() % 2 != 0) {
            // Odd number of players - rotate who sits out each exercise
            System.out.println("=== Rotating Unpaired Players (Odd Number) ===");

            // First, generate pairings as if we have all players (we'll filter later)
            // We need to add a dummy player to make it even for round-robin
            List<Player> allPlayersWithDummy = new ArrayList<>(availablePlayers);
            Player dummyPlayer = new Player("DUMMY", 0);
            allPlayersWithDummy.add(dummyPlayer);

            // Generate round-robin pairings with the dummy player
            Map<Exercise, List<PlayerPair>> allPairings = generateRoundRobinPairings(selectedExercises,
                    allPlayersWithDummy);

            // Now for each exercise, find which real player is paired with the dummy
            // That player becomes the unpaired player for that exercise
            exercisePairs = new HashMap<>();
            for (Exercise exercise : selectedExercises) {
                List<PlayerPair> pairs = allPairings.get(exercise);
                if (pairs != null) {
                    List<PlayerPair> realPairs = new ArrayList<>();
                    Player unpairedPlayer = null;

                    for (PlayerPair pair : pairs) {
                        if (pair.getPlayer1().getName().equals("DUMMY")) {
                            unpairedPlayer = pair.getPlayer2();
                        } else if (pair.getPlayer2().getName().equals("DUMMY")) {
                            unpairedPlayer = pair.getPlayer1();
                        } else {
                            realPairs.add(pair);
                        }
                    }

                    exercisePairs.put(exercise, realPairs);
                    if (unpairedPlayer != null) {
                        unpairedPlayers.put(exercise, unpairedPlayer);
                        System.out.println("Exercise " + (selectedExercises.indexOf(exercise) + 1) + " - Unpaired: "
                                + unpairedPlayer.getName());
                    }
                }
            }
        } else {
            // Even number - all players participate in all exercises
            exercisePairs = generateRoundRobinPairings(selectedExercises, availablePlayers);
        }

        session.setExercisePairs(exercisePairs);
        session.setUnpairedPlayers(unpairedPlayers);

        return session;
    }
}
