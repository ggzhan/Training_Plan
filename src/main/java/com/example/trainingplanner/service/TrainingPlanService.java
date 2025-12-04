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
    /**
     * Generate pairings for all exercises using Elo-optimized round-robin
     * algorithm.
     * Generates all possible rounds, calculates Elo differences.
     * Returns a list of valid rounds sorted by score.
     */
    private List<RoundWithScore> generateRounds(List<Player> players, int requiredUnpairedCount) {

        int numPlayers = players.size();

        if (numPlayers < 2) {
            return new ArrayList<>();
        }


        // For round-robin, we need even number of players
        if (numPlayers % 2 != 0) {
            System.err.println("Warning: Round-robin pairing expects an even number of players.");
            return new ArrayList<>();
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
            totalDiff += Math.abs(p1.getElo() - p2.getElo());

            // Other players pair up
            for (int i = 0; i < rotatingPlayers.size() / 2; i++) {
                Player player1 = rotatingPlayers.get(i);
                Player player2 = rotatingPlayers.get(rotatingPlayers.size() - 2 - i);
                pairs.add(new PlayerPair(player1, player2));
                totalDiff += Math.abs(player1.getElo() - player2.getElo());
            }

            allRounds.add(new RoundWithScore(pairs, totalDiff));

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

                allRounds = validRounds;
            } else {
                System.err.println(
                        "Warning: No rounds found with exactly " + requiredUnpairedCount + " unpaired players.");
            }
        }

        // Sort rounds by total difference (ascending = better balance)
        allRounds.sort(Comparator.comparingInt(r -> r.totalDifference));

        return allRounds;
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

        Map<Exercise, List<Player>> unpairedPlayers = new HashMap<>();
        Map<Exercise, List<PlayerPair>> exercisePairs;

        if (validUnpaired > 0) {

            // Add dummy players
            List<Player> allPlayersWithDummy = new ArrayList<>(availablePlayers);
            for (int i = 0; i < validUnpaired; i++) {
                allPlayersWithDummy.add(new Player("DUMMY_" + i, 0));
            }

            // Generate round-robin pairings with the dummy players
            List<RoundWithScore> allRounds = generateRounds(allPlayersWithDummy, validUnpaired);

            // Now for each exercise, find which real players are paired with dummies
            exercisePairs = new HashMap<>();

            // Track sit out counts to ensure rotation
            Map<String, Integer> sitOutCounts = new HashMap<>();
            for (Player p : availablePlayers) {
                sitOutCounts.put(p.getName(), 0);
            }

            for (Exercise exercise : selectedExercises) {
                // Select best round minimizing sit-out counts
                RoundWithScore bestRound = null;
                int minSitOutSum = Integer.MAX_VALUE;

                // If we have enough rounds, try to pick one that hasn't been used recently?
                // Or just rely on sitOutCounts.
                // Note: allRounds is sorted by score. We want to pick the best score that also
                // has low sitOutSum.
                // But we also want to rotate.
                // Simple approach: Iterate all rounds, find min sitOutSum. Tie-break with score
                // (which is implicit order).

                for (RoundWithScore round : allRounds) {
                    int currentSitOutSum = 0;
                    for (PlayerPair pair : round.pairs) {
                        boolean p1Dummy = pair.getPlayer1().getName().startsWith("DUMMY");
                        boolean p2Dummy = pair.getPlayer2().getName().startsWith("DUMMY");

                        if (p1Dummy && !p2Dummy) {
                            currentSitOutSum += sitOutCounts.getOrDefault(pair.getPlayer2().getName(), 0);
                        } else if (!p1Dummy && p2Dummy) {
                            currentSitOutSum += sitOutCounts.getOrDefault(pair.getPlayer1().getName(), 0);
                        }
                    }

                    if (currentSitOutSum < minSitOutSum) {
                        minSitOutSum = currentSitOutSum;
                        bestRound = round;
                    }
                }

                if (bestRound == null && !allRounds.isEmpty()) {
                    bestRound = allRounds.get(0); // Fallback
                }

                if (bestRound != null) {
                    List<PlayerPair> pairs = bestRound.pairs;
                    List<PlayerPair> realPairs = new ArrayList<>();
                    List<Player> roundUnpaired = new ArrayList<>();

                    for (PlayerPair pair : pairs) {
                        boolean p1Dummy = pair.getPlayer1().getName().startsWith("DUMMY");
                        boolean p2Dummy = pair.getPlayer2().getName().startsWith("DUMMY");

                        if (p1Dummy && !p2Dummy) {
                            roundUnpaired.add(pair.getPlayer2());
                            sitOutCounts.put(pair.getPlayer2().getName(),
                                    sitOutCounts.getOrDefault(pair.getPlayer2().getName(), 0) + 1);
                        } else if (!p1Dummy && p2Dummy) {
                            roundUnpaired.add(pair.getPlayer1());
                            sitOutCounts.put(pair.getPlayer1().getName(),
                                    sitOutCounts.getOrDefault(pair.getPlayer1().getName(), 0) + 1);
                        } else if (!p1Dummy && !p2Dummy) {
                            realPairs.add(pair);
                        }
                        // Ignore Dummy-Dummy pairs
                    }

                    exercisePairs.put(exercise, realPairs);
                    if (!roundUnpaired.isEmpty()) {
                        unpairedPlayers.put(exercise, roundUnpaired);

                    }
                }
            }
        } else {
            // Even number - all players participate in all exercises
            List<RoundWithScore> allRounds = generateRounds(availablePlayers, 0);
            exercisePairs = new HashMap<>();
            for (int i = 0; i < selectedExercises.size(); i++) {
                Exercise exercise = selectedExercises.get(i);
                int roundIndex = i % allRounds.size();
                exercisePairs.put(exercise, allRounds.get(roundIndex).pairs);
            }
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
                }
            }

            // Treat unpaired players as being paired with "GENERIC_DUMMY"
            // This prevents the same player from being unpaired multiple times
            List<String> unpaired = request.getUnpairedPlayers().get(exerciseKey);
            if (unpaired != null) {
                for (String u : unpaired) {
                    usedPairKeys.add(getPairKeyFromNames(u, "GENERIC_DUMMY"));
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

            List<RoundWithScore> roundsWithDummy = generateRounds(allPlayersWithDummy, validUnpaired);

            for (RoundWithScore round : roundsWithDummy) {
                List<PlayerPair> pairs = round.pairs;
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
                        roundScore += Math.abs(p.getPlayer1().getElo() - p.getPlayer2().getElo());
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
            List<RoundWithScore> rounds = generateRounds(availablePlayers, 0);
            for (RoundWithScore round : rounds) {
                List<PlayerPair> pairs = round.pairs;
                int roundScore = 0;
                for (PlayerPair p : pairs) {
                    roundScore += Math.abs(p.getPlayer1().getElo() - p.getPlayer2().getElo());
                }
                allRounds.add(new RoundWithScoreRegen(pairs, roundScore, new ArrayList<>()));
            }
        }

        // Filter out rounds that contain pairs already used in previous exercises
        List<RoundWithScoreRegen> validRounds = new ArrayList<>();
        for (RoundWithScoreRegen round : allRounds) {
            boolean roundHasUsedPair = false;

            // Check real pairs
            for (PlayerPair pair : round.pairs) {
                String pairKey = getPairKeyFromNames(pair.getPlayer1().getName(), pair.getPlayer2().getName());
                if (usedPairKeys.contains(pairKey)) {
                    roundHasUsedPair = true;
                    break;
                }
            }

            // Check unpaired players (treated as paired with GENERIC_DUMMY)
            if (!roundHasUsedPair) {
                for (Player u : round.unpairedPlayers) {
                    if (usedPairKeys.contains(getPairKeyFromNames(u.getName(), "GENERIC_DUMMY"))) {
                        roundHasUsedPair = true;
                        break;
                    }
                }
            }

            if (!roundHasUsedPair) {
                validRounds.add(round);
            }
        }

        if (validRounds.isEmpty()) {

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
