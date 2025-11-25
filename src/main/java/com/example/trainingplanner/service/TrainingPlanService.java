package com.example.trainingplanner.service;

import com.example.trainingplanner.dto.RegenerateRequest;
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

    public TrainingSession generatePlan(List<Player> availablePlayers, int numberOfExercises)
            throws Exception {
        // Use the provided list of players directly

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
        session.setAvailablePlayers(availablePlayers);

        return session;
    }

    /**
     * Regenerate pairings for exercises after the specified index,
     * preserving manually edited exercises and avoiding duplicate pairs.
     * Returns a DTO with String keys for JSON serialization.
     */
    public com.example.trainingplanner.dto.RegenerateResponse regenerateRemainingExercises(RegenerateRequest request) {
        int editedIndex = request.getExerciseIndex();
        List<Player> availablePlayers = request.getAvailablePlayers();

        System.out.println("\n=== Regenerating Exercises After Index " + editedIndex + " ===");

        // Create exercises list
        int totalExercises = request.getCurrentPairings().size();
        List<Exercise> allExercises = new ArrayList<>();
        for (int i = 0; i < totalExercises; i++) {
            allExercises.add(new Exercise("Exercise " + (i + 1), "", "Generic", 0));
        }

        // Extract already-used pairs from exercises 0 to editedIndex
        Set<String> usedPairKeys = new HashSet<>();
        for (int i = 0; i <= editedIndex; i++) {
            String exerciseKey = "Exercise " + (i + 1);
            List<RegenerateRequest.PairDto> pairs = request.getCurrentPairings().get(exerciseKey);
            if (pairs != null) {
                for (RegenerateRequest.PairDto pairDto : pairs) {
                    String pairKey = getPairKeyFromNames(pairDto.getPlayer1Name(), pairDto.getPlayer2Name());
                    usedPairKeys.add(pairKey);
                    System.out.println("  Used pair: " + pairDto.getPlayer1Name() + " & " + pairDto.getPlayer2Name());
                }
            }
        }

        System.out.println("Total used pairs: " + usedPairKeys.size());

        // Generate all possible rounds
        int numPlayers = availablePlayers.size();
        List<RoundWithScoreRegen> allRounds = new ArrayList<>(); // Changed to RoundWithScoreRegen
        // Map<Exercise, Player> roundUnpairedPlayers = new HashMap<>(); // This map is
        // no longer needed as unpairedPlayer is in RoundWithScoreRegen

        if (numPlayers % 2 != 0) {
            // Odd number of players - use Dummy Player strategy
            List<Player> allPlayersWithDummy = new ArrayList<>(availablePlayers);
            Player dummyPlayer = new Player("DUMMY", 0);
            allPlayersWithDummy.add(dummyPlayer);

            // Generate rounds for N+1 players
            // We need a list of exercises for generateRoundRobinPairings,
            // but here we just need to generate all possible rounds, so we can pass a dummy
            // list.
            List<Exercise> dummyExercises = new ArrayList<>();
            for (int i = 0; i < numPlayers; i++) { // N-1 rounds for N players, so N dummy exercises
                dummyExercises.add(new Exercise("DummyEx" + i, "", "Generic", 0));
            }

            Map<Exercise, List<PlayerPair>> roundsWithDummy = generateRoundRobinPairings(dummyExercises,
                    allPlayersWithDummy);

            // Process each round to find the unpaired player (partner of DUMMY)
            // Since generateRoundRobinPairings returns a Map keyed by Exercise (which is
            // just used as an index/placeholder there),
            // we iterate through the values.
            for (Map.Entry<Exercise, List<PlayerPair>> entry : roundsWithDummy.entrySet()) {
                List<PlayerPair> pairs = entry.getValue();
                List<PlayerPair> realPairs = new ArrayList<>();
                Player unpaired = null;

                for (PlayerPair pair : pairs) {
                    if (pair.getPlayer1().getName().equals("DUMMY")) {
                        unpaired = pair.getPlayer2();
                    } else if (pair.getPlayer2().getName().equals("DUMMY")) {
                        unpaired = pair.getPlayer1();
                    } else {
                        realPairs.add(pair);
                    }
                }

                if (unpaired != null) {
                    // Calculate score for this round (sum of diffs)
                    int roundScore = 0;
                    for (PlayerPair p : realPairs) {
                        roundScore += Math.abs(p.getPlayer1().getKlassierung() - p.getPlayer2().getKlassierung());
                    }
                    allRounds.add(new RoundWithScoreRegen(realPairs, roundScore, unpaired));
                }
            }

        } else {
            // Even number of players - standard round robin
            // We need a list of exercises for generateRoundRobinPairings,
            // but here we just need to generate all possible rounds, so we can pass a dummy
            // list.
            List<Exercise> dummyExercises = new ArrayList<>();
            for (int i = 0; i < numPlayers - 1; i++) { // N-1 rounds for N players
                dummyExercises.add(new Exercise("DummyEx" + i, "", "Generic", 0));
            }
            Map<Exercise, List<PlayerPair>> rounds = generateRoundRobinPairings(dummyExercises, availablePlayers);
            for (List<PlayerPair> pairs : rounds.values()) {
                int roundScore = 0;
                for (PlayerPair p : pairs) {
                    roundScore += Math.abs(p.getPlayer1().getKlassierung() - p.getPlayer2().getKlassierung());
                }
                allRounds.add(new RoundWithScoreRegen(pairs, roundScore, null));
            }
        }

        // Filter out rounds that contain pairs already used in previous exercises
        List<RoundWithScoreRegen> validRounds = new ArrayList<>();
        for (RoundWithScoreRegen round : allRounds) {
            boolean roundHasUsedPair = false;
            for (PlayerPair pair : round.pairs) {
                String pairKey = getPairKeyFromNames(pair.getPlayer1().getName(), pair.getPlayer2().getName());
                if (usedPairKeys.contains(pairKey)) {
                    roundHasUsedPair = true;
                    break;
                }
            }
            if (!roundHasUsedPair) {
                validRounds.add(round);
            } else {
                System.out.println("Round (Diff: " + round.score + ") SKIPPED - contains used pair");
            }
        }

        // If we don't have enough valid rounds, we might need to relax the constraint
        // or reuse rounds.
        // For now, let's just use what we have, and if we run out, we cycle.
        if (validRounds.isEmpty()) {
            System.out.println("WARNING: No valid unique rounds found! Reusing all rounds.");
            validRounds.addAll(allRounds); // If no valid rounds, fall back to all generated rounds (even if they
                                           // contain used pairs)
        }

        // Sort rounds by score (lower is better balance)
        validRounds.sort(Comparator.comparingInt(r -> r.score));

        System.out.println("\nAvailable valid rounds for regeneration: " + validRounds.size());

        // Build the result using String keys
        Map<String, List<PlayerPair>> exercisePairs = new HashMap<>();
        Map<String, Player> unpairedPlayers = new HashMap<>();

        // 1. Keep manually edited exercises (0 to editedIndex)
        for (int i = 0; i <= editedIndex; i++) {
            String exerciseKey = "Exercise " + (i + 1);
            List<RegenerateRequest.PairDto> pairDtos = request.getCurrentPairings().get(exerciseKey);
            if (pairDtos != null) {
                List<PlayerPair> pairs = new ArrayList<>();
                for (RegenerateRequest.PairDto dto : pairDtos) {
                    Player p1 = findPlayerByName(availablePlayers, dto.getPlayer1Name());
                    Player p2 = findPlayerByName(availablePlayers, dto.getPlayer2Name());
                    if (p1 != null && p2 != null) {
                        pairs.add(new PlayerPair(p1, p2));
                    }
                }
                exercisePairs.put(exerciseKey, pairs);
            }

            // Restore unpaired player
            String unpairedName = request.getUnpairedPlayers().get(exerciseKey);
            if (unpairedName != null) {
                Player unpaired = findPlayerByName(availablePlayers, unpairedName);
                if (unpaired != null) {
                    unpairedPlayers.put(exerciseKey, unpaired);
                }
            }
        }

        // 2. Add regenerated exercises
        int roundsNeeded = totalExercises - editedIndex - 1;
        for (int i = 0; i < roundsNeeded; i++) {
            String exerciseKey = "Exercise " + (editedIndex + 2 + i);
            // Use modulo to cycle if we don't have enough unique rounds
            if (!validRounds.isEmpty()) {
                RoundWithScoreRegen round = validRounds.get(i % validRounds.size());
                exercisePairs.put(exerciseKey, round.pairs);
                if (round.unpairedPlayer != null) {
                    unpairedPlayers.put(exerciseKey, round.unpairedPlayer);
                }
            }
        }

        com.example.trainingplanner.dto.RegenerateResponse response = new com.example.trainingplanner.dto.RegenerateResponse();
        List<com.example.trainingplanner.dto.RegenerateResponse.ExerciseDto> exerciseDtos = new ArrayList<>();
        for (com.example.trainingplanner.model.Exercise ex : allExercises) {
            exerciseDtos.add(new com.example.trainingplanner.dto.RegenerateResponse.ExerciseDto(ex.getName()));
        }
        response.setExercises(exerciseDtos);
        response.setExercisePairs(exercisePairs);
        response.setUnpairedPlayers(unpairedPlayers);

        return response;
    }

    private String getPairKeyFromNames(String name1, String name2) {
        return name1.compareTo(name2) < 0 ? name1 + "|" + name2 : name2 + "|" + name1;
    }

    private Player findPlayerByName(List<Player> players, String name) {
        return players.stream()
                .filter(p -> p.getName().equals(name))
                .findFirst()
                .orElse(null);
    }

    // Helper class for regeneration
    private static class RoundWithScoreRegen {
        List<PlayerPair> pairs;
        int score;
        Player unpairedPlayer;

        public RoundWithScoreRegen(List<PlayerPair> pairs, int score, Player unpairedPlayer) {
            this.pairs = pairs;
            this.score = score;
            this.unpairedPlayer = unpairedPlayer;
        }
    }
}
