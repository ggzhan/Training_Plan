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
    private long getPairHash(Player p1, Player p2) {
        // Treat all DUMMY players as the same generic entity for sit-out rotation
        String n1 = p1.getName().startsWith("DUMMY") ? "DUMMY" : p1.getName();
        String n2 = p2.getName().startsWith("DUMMY") ? "DUMMY" : p2.getName();

        int h1 = n1.hashCode();
        int h2 = n2.hashCode();
        // Create an order-independent long hash by bit-packing the sorted hash codes
        return h1 < h2 ? ((long) h1 << 32) | (h2 & 0xFFFFFFFFL) : ((long) h2 << 32) | (h1 & 0xFFFFFFFFL);
    }

    private long getPairHashForPair(PlayerPair pair) {
        return getPairHash(pair.getPlayer1(), pair.getPlayer2());
    }

    private String getPairKey(PlayerPair pair) {
        return String.valueOf(getPairHashForPair(pair));
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
     * Generate pairings for all exercises using Klassierung-optimized round-robin
     * algorithm.
     * Generates all possible rounds, calculates Klassierung differences.
     * Returns a list of valid rounds sorted by score.
     */
    private List<Long> getRoundStructureKey(List<PlayerPair> pairs) {
        return pairs.stream()
                .map(this::getPairHashForPair)
                .sorted()
                .collect(Collectors.toList());
    }

    private List<RoundWithScore> generateRounds(List<Player> players, int requiredUnpairedCount,
            Set<String> usedPairKeys) {
        // Optimization: Convert Set<String> to Set<Long> once
        Set<Long> usedPairHashes = usedPairKeys.stream()
                .map(Long::valueOf)
                .collect(Collectors.toSet());
        if (players.size() < 2) {
            return new ArrayList<>();
        }

        List<RoundWithScore> allPossibleRounds = new ArrayList<>();
        int safetyLimit = 50000;

        if (players.size() <= 12) {
            // DFS for small N to get exact results
            generateAllPairingsRecursive(new ArrayList<>(players), new ArrayList<>(), allPossibleRounds, safetyLimit,
                    usedPairHashes);
        } else {
            // Optimized Randomized approach for large N
            Map<List<Long>, RoundWithScore> uniqueCandidateRounds = new HashMap<>();
            int attempts = 0;
            Player[] poolArray = players.toArray(new Player[0]);

            while (uniqueCandidateRounds.size() < safetyLimit && attempts < safetyLimit * 5) {
                // In-place shuffle
                for (int j = poolArray.length - 1; j > 0; j--) {
                    int index = random.nextInt(j + 1);
                    Player temp = poolArray[index];
                    poolArray[index] = poolArray[j];
                    poolArray[j] = temp;
                }

                List<PlayerPair> pairs = new ArrayList<>();
                boolean hasCollision = false;
                for (int j = 0; j < poolArray.length - 1; j += 2) {
                    Player p1 = poolArray[j];
                    Player p2 = poolArray[j + 1];
                    long pairHash = getPairHash(p1, p2);

                    if (usedPairHashes.contains(pairHash)) {
                        hasCollision = true;
                        break;
                    }
                    pairs.add(new PlayerPair(p1, p2));
                }

                if (!hasCollision) {
                    List<Long> structureKey = getRoundStructureKey(pairs);
                    if (!uniqueCandidateRounds.containsKey(structureKey)) {
                        uniqueCandidateRounds.put(structureKey,
                                new RoundWithScore(pairs, calculateGroupDifference(pairs)));
                    }
                }
                attempts++;
            }
            allPossibleRounds.addAll(uniqueCandidateRounds.values());
        }

        int rawCount = allPossibleRounds.size();

        // Deduplicate rounds based on their structure
        Map<List<Long>, RoundWithScore> deduplicated = new HashMap<>();
        for (RoundWithScore round : allPossibleRounds) {
            deduplicated.put(getRoundStructureKey(round.pairs), round);
        }
        allPossibleRounds = new ArrayList<>(deduplicated.values());
        int deduplicatedCount = allPossibleRounds.size();

        // Filter rounds if requiredUnpairedCount > 0
        if (requiredUnpairedCount > 0) {
            List<RoundWithScore> validRounds = new ArrayList<>();
            for (RoundWithScore round : allPossibleRounds) {
                int realDummyPairs = 0;
                for (PlayerPair pair : round.pairs) {
                    boolean p1Dummy = pair.getPlayer1().getName().startsWith("DUMMY");
                    boolean p2Dummy = pair.getPlayer2().getName().startsWith("DUMMY");
                    if (p1Dummy != p2Dummy) {
                        realDummyPairs++;
                    }
                }

                if (realDummyPairs == requiredUnpairedCount) {
                    validRounds.add(round);
                }
            }

            if (!validRounds.isEmpty()) {
                allPossibleRounds = validRounds;
            } else {
                System.err.println(
                        "Warning: No rounds found with exactly " + requiredUnpairedCount + " unpaired players.");
            }
        }
        int filteredCount = allPossibleRounds.size();
        System.out.println("Round Generation: Raw=" + rawCount + ", Deduplicated=" + deduplicatedCount + ", Filtered="
                + filteredCount);

        // Sort by total difference (ascending = better balance)
        allPossibleRounds.sort(Comparator.comparingInt(r -> r.totalDifference));

        // Group together rounds with same difference and shuffle them to provide
        // variety
        List<RoundWithScore> finalSorted = new ArrayList<>();
        int i = 0;
        while (i < allPossibleRounds.size()) {
            int currentDiff = allPossibleRounds.get(i).totalDifference;
            List<RoundWithScore> sameDiffGroup = new ArrayList<>();
            while (i < allPossibleRounds.size() && allPossibleRounds.get(i).totalDifference == currentDiff) {
                sameDiffGroup.add(allPossibleRounds.get(i));
                i++;
            }
            Collections.shuffle(sameDiffGroup);
            finalSorted.addAll(sameDiffGroup);
        }

        return finalSorted;
    }

    private void generateAllPairingsRecursive(List<Player> remainingPlayers, List<PlayerPair> currentPairs,
            List<RoundWithScore> results, int limit, Set<Long> usedPairHashes) {
        if (results.size() >= limit)
            return;

        if (remainingPlayers.isEmpty()) {
            results.add(new RoundWithScore(new ArrayList<>(currentPairs), calculateGroupDifference(currentPairs)));
            return;
        }

        // Pick the first player and try to pair them with every other player
        Player p1 = remainingPlayers.remove(0);

        for (int i = 0; i < remainingPlayers.size(); i++) {
            Player p2 = remainingPlayers.remove(i);

            // Strict Filter: Skip pairs that have already been used
            if (usedPairHashes.contains(getPairHash(p1, p2))) {
                remainingPlayers.add(i, p2);
                continue;
            }

            currentPairs.add(new PlayerPair(p1, p2));

            generateAllPairingsRecursive(remainingPlayers, currentPairs, results, limit, usedPairHashes);

            // Backtrack
            currentPairs.remove(currentPairs.size() - 1);
            remainingPlayers.add(i, p2);
        }

        // Put p1 back for the caller's recursion
        remainingPlayers.add(0, p1);
    }

    private int calculateGroupDifference(List<PlayerPair> pairs) {
        int totalDiff = 0;
        for (PlayerPair pair : pairs) {
            // Unpaired players (paired with DUMMY) have difference 0 as per request
            if (pair.getPlayer1().getName().startsWith("DUMMY") || pair.getPlayer2().getName().startsWith("DUMMY")) {
                continue;
            }
            totalDiff += Math.abs(pair.getPlayer1().getKlassierung() - pair.getPlayer2().getKlassierung());
        }
        return totalDiff;
    }

    public TrainingSession generatePlan(List<Player> availablePlayers, int numberOfExercises, int unpairedPlayersCount)
            throws Exception {
        // Sort players by Elo (Klassierung) descending
        availablePlayers.sort(Comparator.comparingInt(Player::getKlassierung).reversed());

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
        Map<Exercise, List<PlayerPair>> exercisePairs = new HashMap<>();
        Set<String> usedGlobalPairKeys = new HashSet<>();

        if (validUnpaired > 0) {
            // Add dummy players
            List<Player> allPlayersWithDummy = new ArrayList<>(availablePlayers);
            for (int i = 0; i < validUnpaired; i++) {
                allPlayersWithDummy.add(new Player("DUMMY_" + i, 0));
            }

            for (int i = 0; i < selectedExercises.size(); i++) {
                Exercise exercise = selectedExercises.get(i);

                // Generate a pool of rounds that are STRICTLY unique relative to history
                List<RoundWithScore> allRounds = generateRounds(allPlayersWithDummy, validUnpaired, usedGlobalPairKeys);
                boolean usingStrictPool = !allRounds.isEmpty();

                if (!usingStrictPool) {
                    // Fallback: No strictly unique rounds found in the sample
                    allRounds = generateRounds(allPlayersWithDummy, validUnpaired, Collections.emptySet());
                }

                List<RoundWithScore> availableRounds = new ArrayList<>(allRounds);

                // Strictly Uniqueness-aware selection:
                // Find the first round in the sorted list that has ZERO overlap
                RoundWithScore bestRound = null;
                int actualOverlap = 0;
                for (RoundWithScore round : availableRounds) {
                    boolean hasOverlap = false;
                    for (PlayerPair pair : round.pairs) {
                        if (usedGlobalPairKeys.contains(getPairKey(pair))) {
                            hasOverlap = true;
                            break;
                        }
                    }
                    if (!hasOverlap) {
                        bestRound = round;
                        break;
                    }
                }

                // Fallback: If no round with zero overlap exists, pick the one with minimal
                // overlap
                if (bestRound == null) {
                    int minOverlap = Integer.MAX_VALUE;
                    for (RoundWithScore round : availableRounds) {
                        int overlap = 0;
                        for (PlayerPair pair : round.pairs) {
                            if (usedGlobalPairKeys.contains(getPairKey(pair)))
                                overlap++;
                        }
                        if (overlap < minOverlap) {
                            minOverlap = overlap;
                            bestRound = round;
                        }
                        if (minOverlap == 1)
                            break; // Optimization
                    }
                    actualOverlap = minOverlap;
                    System.out.println("Warning: Could not find unique round for " + exercise.getName()
                            + ". Fallback to overlap: " + actualOverlap);
                } else {
                    System.out.println("Success: Found unique round for " + exercise.getName());
                }

                // Update state
                availableRounds.remove(bestRound);
                for (PlayerPair pair : bestRound.pairs) {
                    usedGlobalPairKeys.add(getPairKey(pair));
                }

                List<PlayerPair> realPairs = new ArrayList<>();
                List<Player> roundUnpaired = new ArrayList<>();

                for (PlayerPair pair : bestRound.pairs) {
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

                exercisePairs.put(exercise, realPairs);
                if (!roundUnpaired.isEmpty()) {
                    unpairedPlayers.put(exercise, roundUnpaired);
                }
            }
        } else {
            // Even number - all players participate in all exercises
            for (int i = 0; i < selectedExercises.size(); i++) {
                Exercise exercise = selectedExercises.get(i);

                // Generate a pool of rounds that are STRICTLY unique relative to history
                List<RoundWithScore> allRounds = generateRounds(availablePlayers, 0, usedGlobalPairKeys);
                boolean usingStrictPool = !allRounds.isEmpty();

                if (!usingStrictPool) {
                    // Fallback
                    allRounds = generateRounds(availablePlayers, 0, Collections.emptySet());
                }

                List<RoundWithScore> availableRounds = new ArrayList<>(allRounds);

                RoundWithScore bestRound = null;
                int actualOverlap = 0;
                for (RoundWithScore round : availableRounds) {
                    boolean hasOverlap = false;
                    for (PlayerPair pair : round.pairs) {
                        if (usedGlobalPairKeys.contains(getPairKey(pair))) {
                            hasOverlap = true;
                            break;
                        }
                    }
                    if (!hasOverlap) {
                        bestRound = round;
                        break;
                    }
                }

                if (bestRound == null) {
                    int minOverlap = Integer.MAX_VALUE;
                    for (RoundWithScore round : availableRounds) {
                        int overlap = 0;
                        for (PlayerPair pair : round.pairs) {
                            if (usedGlobalPairKeys.contains(getPairKey(pair)))
                                overlap++;
                        }
                        if (overlap < minOverlap) {
                            minOverlap = overlap;
                            bestRound = round;
                        }
                    }
                    actualOverlap = minOverlap;
                    System.out.println("Warning: Could not find unique round for " + exercise.getName()
                            + ". Fallback to overlap: " + actualOverlap);
                } else {
                    System.out.println("Success: Found unique round for " + exercise.getName());
                }

                availableRounds.remove(bestRound);
                for (PlayerPair pair : bestRound.pairs) {
                    usedGlobalPairKeys.add(getPairKey(pair));
                }

                exercisePairs.put(exercise, bestRound.pairs);
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
        List<Player> availablePlayers = new ArrayList<>(request.getAvailablePlayers());
        // Sort players by Elo (Klassierung) descending
        availablePlayers.sort(Comparator.comparingInt(Player::getKlassierung).reversed());

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

            List<RoundWithScore> roundsWithDummy = generateRounds(allPlayersWithDummy, validUnpaired, usedPairKeys);

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
            List<RoundWithScore> rounds = generateRounds(availablePlayers, 0, Collections.emptySet());
            for (RoundWithScore round : rounds) {
                List<PlayerPair> pairs = round.pairs;
                int roundScore = 0;
                for (PlayerPair p : pairs) {
                    roundScore += Math.abs(p.getPlayer1().getKlassierung() - p.getPlayer2().getKlassierung());
                }
                allRounds.add(new RoundWithScoreRegen(pairs, roundScore, new ArrayList<>()));
            }
        }

        // Apply hash filtering from the user's latest request
        List<RoundWithScoreRegen> strictlyUniqueRounds = new ArrayList<>();
        for (RoundWithScoreRegen round : allRounds) {
            boolean hasCollision = false;
            for (PlayerPair pair : round.pairs) {
                if (usedPairKeys.contains(getPairKey(pair))) {
                    hasCollision = true;
                    break;
                }
            }
            if (!hasCollision) {
                for (Player u : round.unpairedPlayers) {
                    if (usedPairKeys.contains(getPairKeyFromNames(u.getName(), "GENERIC_DUMMY"))) {
                        hasCollision = true;
                        break;
                    }
                }
            }

            if (!hasCollision) {
                strictlyUniqueRounds.add(round);
            }
        }

        List<RoundWithScoreRegen> validRounds = strictlyUniqueRounds.isEmpty() ? allRounds : strictlyUniqueRounds;

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

            // Uniqueness-aware selection: find the first round with zero overlap
            RoundWithScoreRegen bestRound = null;
            for (RoundWithScoreRegen round : availableRounds) {
                boolean hasOverlap = false;

                // Check pairs
                for (PlayerPair pair : round.pairs) {
                    if (usedPairKeys.contains(getPairKey(pair))) {
                        hasOverlap = true;
                        break;
                    }
                }
                if (hasOverlap)
                    continue;

                // Check unpaired
                for (Player u : round.unpairedPlayers) {
                    if (usedPairKeys.contains(getPairKeyFromNames(u.getName(), "GENERIC_DUMMY"))) {
                        hasOverlap = true;
                        break;
                    }
                }

                if (!hasOverlap) {
                    bestRound = round;
                    break;
                }
            }

            // Fallback: pick the one with minimal overlap
            if (bestRound == null) {
                int minOverlap = Integer.MAX_VALUE;
                for (RoundWithScoreRegen round : availableRounds) {
                    int overlap = 0;
                    for (PlayerPair pair : round.pairs) {
                        if (usedPairKeys.contains(getPairKey(pair)))
                            overlap++;
                    }
                    for (Player u : round.unpairedPlayers) {
                        if (usedPairKeys.contains(getPairKeyFromNames(u.getName(), "GENERIC_DUMMY")))
                            overlap++;
                    }
                    if (overlap < minOverlap) {
                        minOverlap = overlap;
                        bestRound = round;
                    }
                }
            }

            if (bestRound != null) {
                exercisePairs.put(exerciseKey, bestRound.pairs);
                unpairedPlayers.put(exerciseKey, bestRound.unpairedPlayers);

                // Update used pairs
                for (PlayerPair pair : bestRound.pairs) {
                    usedPairKeys.add(getPairKey(pair));
                }
                for (Player u : bestRound.unpairedPlayers) {
                    usedPairKeys.add(getPairKeyFromNames(u.getName(), "GENERIC_DUMMY"));
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
        return String.valueOf(getPairHash(new Player(name1, 0), new Player(name2, 0)));
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
