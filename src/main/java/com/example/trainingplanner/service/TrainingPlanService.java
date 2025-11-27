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
            List<Exercise> exercises, List<Player> players, int requiredUnpairedCount) {

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
            // System.out.println("Round " + (round + 1) + " - Total Klassierung Diff: " +
            // totalDiff);

            // Rotate players for the next round
            if (rotatingPlayers.size() > 1) {
                Player lastPlayer = rotatingPlayers.remove(rotatingPlayers.size() - 1);
                rotatingPlayers.add(0, lastPlayer);
            }
        }

        // Filter rounds if requiredUnpairedCount > 0
        if (requiredUnpairedCount > 0) {
            List<RoundWithScore> validRounds = new ArrayList<>();
            for (RoundWithScore round : allRounds) {
                int realDummyPairs = 0;
                for (PlayerPair pair : round.pairs) {
                    boolean p1Dummy = pair.getPlayer1().getName().startsWith("DUMMY");
                    boolean p2Dummy = pair.getPlayer2().getName().startsWith("DUMMY");
                    if (p1Dummy != p2Dummy) { // XOR: One is dummy, one is real
                        realDummyPairs++;
                    }
                }

                if (realDummyPairs == requiredUnpairedCount) {
                    validRounds.add(round);
                }
            }

            if (!validRounds.isEmpty()) {
                System.out.println("Filtered rounds: " + validRounds.size() + " (from " + allRounds.size() + ")");
                allRounds = validRounds;
            } else {
                System.err.println(
                        "Warning: No rounds found with exactly " + requiredUnpairedCount + " unpaired players.");
            }
        }

        // Sort rounds by total difference (ascending = better balance)
        allRounds.sort(Comparator.comparingInt(r -> r.totalDifference));

        // Select the best rounds (up to the number of exercises requested)
        // If more exercises are requested than unique rounds available, reuse rounds
        System.out.println("\n=== Selecting Best " + exercises.size() + " Rounds ===");
        for (int i = 0; i < exercises.size(); i++) {
            Exercise exercise = exercises.get(i);
            // Cycle through available rounds if we need more exercises than unique rounds
            int roundIndex = i % allRounds.size();
            RoundWithScore selectedRound = allRounds.get(roundIndex);
            result.put(exercise, selectedRound.pairs);
            System.out.println("Exercise " + (i + 1) + " - Diff Sum: " + selectedRound.totalDifference +
                    (i >= allRounds.size() ? " (reused)" : ""));
        }

        return result;
    }

    public TrainingSession generatePlan(List<Player> availablePlayers, int numberOfExercises, int unpairedPlayersCount)
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

        // Adjust unpaired count to ensure remaining players are even
        int validUnpaired = unpairedPlayersCount;
        if ((availablePlayers.size() - validUnpaired) % 2 != 0) {
            validUnpaired++;
            // If we exceeded player count, adjust down
            if (validUnpaired > availablePlayers.size()) {
                validUnpaired -= 2;
            }
        }
        if (validUnpaired < 0)
            validUnpaired = 0;

        System.out.println("Requested unpaired: " + unpairedPlayersCount + ", Valid unpaired: " + validUnpaired);

        Map<Exercise, List<Player>> unpairedPlayers = new HashMap<>();
        Map<Exercise, List<PlayerPair>> exercisePairs;

        if (validUnpaired > 0) {
            System.out.println("=== Rotating Unpaired Players (" + validUnpaired + ") ===");

            // Add dummy players
            List<Player> allPlayersWithDummy = new ArrayList<>(availablePlayers);
            for (int i = 0; i < validUnpaired; i++) {
                allPlayersWithDummy.add(new Player("DUMMY_" + i, 0));
            }

            // Generate round-robin pairings with the dummy players
            Map<Exercise, List<PlayerPair>> allPairings = generateRoundRobinPairings(selectedExercises,
                    allPlayersWithDummy, validUnpaired);

            // Now for each exercise, find which real players are paired with dummies
            exercisePairs = new HashMap<>();
            for (Exercise exercise : selectedExercises) {
                List<PlayerPair> pairs = allPairings.get(exercise);
                if (pairs != null) {
                    List<PlayerPair> realPairs = new ArrayList<>();
                    List<Player> roundUnpaired = new ArrayList<>();

                    for (PlayerPair pair : pairs) {
                        boolean p1Dummy = pair.getPlayer1().getName().startsWith("DUMMY");
                        boolean p2Dummy = pair.getPlayer2().getName().startsWith("DUMMY");

                        if (p1Dummy && !p2Dummy) {
                            roundUnpaired.add(pair.getPlayer2());
                        } else if (!p1Dummy && p2Dummy) {
                            roundUnpaired.add(pair.getPlayer1());
                        } else if (!p1Dummy && !p2Dummy) {
                            realPairs.add(pair);
                        }
                        // Ignore Dummy-Dummy pairs
                    }

                    exercisePairs.put(exercise, realPairs);
                    if (!roundUnpaired.isEmpty()) {
                        unpairedPlayers.put(exercise, roundUnpaired);
                        System.out.println("Exercise " + (selectedExercises.indexOf(exercise) + 1) + " - Unpaired: "
                                + roundUnpaired.stream().map(Player::getName).collect(Collectors.joining(", ")));
                    }
                }
            }
        } else {
            // Even number - all players participate in all exercises
            exercisePairs = generateRoundRobinPairings(selectedExercises, availablePlayers, 0);
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
                    // System.out.println(" Used pair: " + pairDto.getPlayer1Name() + " & " +
                    // pairDto.getPlayer2Name());
                }
            }
        }

        // Determine unpaired count from the first exercise
        int unpairedCount = 0;
        if (request.getUnpairedPlayers() != null && !request.getUnpairedPlayers().isEmpty()) {
            for (List<String> list : request.getUnpairedPlayers().values()) {
                if (list != null) {
                    unpairedCount = list.size();
                    break;
                }
            }
        }

        int validUnpaired = unpairedCount;
        if ((availablePlayers.size() - validUnpaired) % 2 != 0) {
            validUnpaired++;
            if (validUnpaired > availablePlayers.size()) {
                validUnpaired -= 2;
            }
        }
        if (validUnpaired < 0)
            validUnpaired = 0;

        // Generate all possible rounds
        List<RoundWithScoreRegen> allRounds = new ArrayList<>();

        if (validUnpaired > 0) {
            // Odd number of players (or rather, unpaired > 0) - use Dummy Player strategy
            List<Player> allPlayersWithDummy = new ArrayList<>(availablePlayers);
            for (int i = 0; i < validUnpaired; i++) {
                allPlayersWithDummy.add(new Player("DUMMY_" + i, 0));
            }

            List<Exercise> dummyExercises = new ArrayList<>();
            for (int i = 0; i < allPlayersWithDummy.size() - 1; i++) {
                dummyExercises.add(new Exercise("DummyEx" + i, "", "Generic", 0));
            }

            Map<Exercise, List<PlayerPair>> roundsWithDummy = generateRoundRobinPairings(dummyExercises,
                    allPlayersWithDummy, validUnpaired);

            for (List<PlayerPair> pairs : roundsWithDummy.values()) {
                List<PlayerPair> realPairs = new ArrayList<>();
                List<Player> roundUnpaired = new ArrayList<>();

                for (PlayerPair pair : pairs) {
                    boolean p1Dummy = pair.getPlayer1().getName().startsWith("DUMMY");
                    boolean p2Dummy = pair.getPlayer2().getName().startsWith("DUMMY");

                    if (p1Dummy && !p2Dummy) {
                        roundUnpaired.add(pair.getPlayer2());
                    } else if (!p1Dummy && p2Dummy) {
                        roundUnpaired.add(pair.getPlayer1());
                    } else if (!p1Dummy && !p2Dummy) {
                        realPairs.add(pair);
                    }
                }

                if (!roundUnpaired.isEmpty()) {
                    int roundScore = 0;
                    for (PlayerPair p : realPairs) {
                        roundScore += Math.abs(p.getPlayer1().getKlassierung() - p.getPlayer2().getKlassierung());
                    }
                    allRounds.add(new RoundWithScoreRegen(realPairs, roundScore, roundUnpaired));
                }
            }

        } else {
            // Even number of players - standard round robin
            List<Exercise> dummyExercises = new ArrayList<>();
            for (int i = 0; i < availablePlayers.size() - 1; i++) {
                dummyExercises.add(new Exercise("DummyEx" + i, "", "Generic", 0));
            }
            Map<Exercise, List<PlayerPair>> rounds = generateRoundRobinPairings(dummyExercises, availablePlayers, 0);
            for (List<PlayerPair> pairs : rounds.values()) {
                int roundScore = 0;
                for (PlayerPair p : pairs) {
                    roundScore += Math.abs(p.getPlayer1().getKlassierung() - p.getPlayer2().getKlassierung());
                }
                allRounds.add(new RoundWithScoreRegen(pairs, roundScore, new ArrayList<>()));
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
            }
        }

        if (validRounds.isEmpty()) {
            System.out.println("WARNING: No valid unique rounds found! Reusing all rounds.");
            validRounds.addAll(allRounds);
        }

        // Sort rounds by score (lower is better balance)
        validRounds.sort(Comparator.comparingInt(r -> r.score));

        Map<String, List<PlayerPair>> exercisePairs = new HashMap<>();
        Map<String, List<Player>> unpairedPlayers = new HashMap<>();

        // Track sit out counts
        Map<String, Integer> sitOutCounts = new HashMap<>();
        for (Player p : availablePlayers) {
            sitOutCounts.put(p.getName(), 0);
        }

        // 1. Keep manually edited exercises
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
            List<String> unpairedNames = request.getUnpairedPlayers().get(exerciseKey);
            if (unpairedNames != null) {
                List<Player> uList = new ArrayList<>();
                for (String name : unpairedNames) {
                    Player p = findPlayerByName(availablePlayers, name);
                    if (p != null) {
                        uList.add(p);
                        sitOutCounts.put(name, sitOutCounts.getOrDefault(name, 0) + 1);
                    }
                }
                unpairedPlayers.put(exerciseKey, uList);
            }
        }

        // 2. Add regenerated exercises
        int roundsNeeded = totalExercises - editedIndex - 1;
        List<RoundWithScoreRegen> availableRounds = new ArrayList<>(validRounds);

        for (int i = 0; i < roundsNeeded; i++) {
            String exerciseKey = "Exercise " + (editedIndex + 2 + i);

            if (availableRounds.isEmpty()) {
                availableRounds.addAll(validRounds);
            }

            // Find best round: minimize sit out sum, then score
            RoundWithScoreRegen bestRound = null;
            int minSitOutSum = Integer.MAX_VALUE;

            for (RoundWithScoreRegen round : availableRounds) {
                int currentSitOutSum = 0;
                for (Player p : round.unpairedPlayers) {
                    currentSitOutSum += sitOutCounts.getOrDefault(p.getName(), 0);
                }

                if (currentSitOutSum < minSitOutSum) {
                    minSitOutSum = currentSitOutSum;
                    bestRound = round;
                }
            }

            if (bestRound != null) {
                exercisePairs.put(exerciseKey, bestRound.pairs);
                unpairedPlayers.put(exerciseKey, bestRound.unpairedPlayers);

                for (Player p : bestRound.unpairedPlayers) {
                    sitOutCounts.put(p.getName(), sitOutCounts.getOrDefault(p.getName(), 0) + 1);
                }

                availableRounds.remove(bestRound);
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
        List<Player> unpairedPlayers;

        public RoundWithScoreRegen(List<PlayerPair> pairs, int score, List<Player> unpairedPlayers) {
            this.pairs = pairs;
            this.score = score;
            this.unpairedPlayers = unpairedPlayers;
        }
    }
}
