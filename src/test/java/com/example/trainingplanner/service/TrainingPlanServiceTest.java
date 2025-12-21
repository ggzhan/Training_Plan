package com.example.trainingplanner.service;

import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.TrainingSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class TrainingPlanServiceTest {

    private CsvServiceStub csvServiceStub;
    private TrainingPlanService trainingPlanService;

    @BeforeEach
    void setUp() {
        csvServiceStub = new CsvServiceStub();
        trainingPlanService = new TrainingPlanService(csvServiceStub);
    }

    @Test
    void generatePlan_shouldCreateValidSession() throws Exception {
        // Mock players
        List<Player> players = Arrays.asList(
                new Player("Player 1", 10),
                new Player("Player 2", 9),
                new Player("Player 3", 8),
                new Player("Player 4", 7),
                new Player("Player 5", 6));
        csvServiceStub.setPlayers(players);

        // Test
        TrainingSession session = trainingPlanService.generatePlan(players, 6, 1);

        // Verify
        assertNotNull(session);
        assertEquals(90, session.getTotalDuration());
        // Number of exercises depends on stubbed exercises (3 * 15 = 45 < 90, so all 3
        // should be selected)
        assertTrue(session.getExercises().size() > 0);
        assertEquals(5, session.getPlayerCount());
        assertNotNull(session.getExercisePairs());
        assertEquals(session.getExercises().size(), session.getExercisePairs().size());

        System.out.println("Generated Plan: " + session.getNotes());
        System.out.println("Number of Exercises: " + session.getExercises().size());
        System.out.println("Player Count: " + session.getPlayerCount());
    }

    @Test
    void generatePlan_withOddPlayers_shouldHaveUnpairedPlayers() throws Exception {
        // Mock players (odd number)
        List<Player> players = Arrays.asList(
                new Player("Player 1", 10),
                new Player("Player 2", 9),
                new Player("Player 3", 8));
        csvServiceStub.setPlayers(players);

        // Test
        TrainingSession session = trainingPlanService.generatePlan(players, 6, 1);

        // Verify
        assertNotNull(session);
        assertTrue(session.getExercises().size() > 0);
        assertEquals(3, session.getPlayerCount());
        assertNotNull(session.getUnpairedPlayers());
        assertEquals(session.getExercises().size(), session.getUnpairedPlayers().size()); // Each exercise should have
                                                                                          // an unpaired player
    }

    @Test
    void generatePlan_withMultipleUnpairedPlayers() throws Exception {
        // Mock players (5 players)
        List<Player> players = Arrays.asList(
                new Player("Player 1", 10),
                new Player("Player 2", 9),
                new Player("Player 3", 8),
                new Player("Player 4", 7),
                new Player("Player 5", 6));
        csvServiceStub.setPlayers(players);

        // Test with 3 unpaired players (so only 1 pair per exercise)
        TrainingSession session = trainingPlanService.generatePlan(players, 6, 3);

        // Verify
        assertNotNull(session);
        assertTrue(session.getExercises().size() > 0);
        assertNotNull(session.getUnpairedPlayers());

        // Check first exercise
        com.example.trainingplanner.model.Exercise firstEx = session.getExercises().get(0);
        List<Player> unpaired = session.getUnpairedPlayers().get(firstEx);
        assertNotNull(unpaired);
        assertEquals(3, unpaired.size());
    }

    @Test
    void regenerateRemainingExercises_shouldRotateUnpairedPlayers() {
        // Setup 5 players
        List<Player> players = Arrays.asList(
                new Player("A", 10), new Player("B", 10),
                new Player("C", 10), new Player("D", 10),
                new Player("E", 10));

        // Create request with Ex 1 having A unpaired
        com.example.trainingplanner.dto.RegenerateRequest request = new com.example.trainingplanner.dto.RegenerateRequest();
        request.setExerciseIndex(0); // Edit after Ex 1
        request.setAvailablePlayers(players);

        Map<String, List<com.example.trainingplanner.dto.RegenerateRequest.PairDto>> currentPairings = new java.util.HashMap<>();
        // Ex 1: A unpaired. Pairs: B-C, D-E
        List<com.example.trainingplanner.dto.RegenerateRequest.PairDto> pairsEx1 = new ArrayList<>();
        pairsEx1.add(new com.example.trainingplanner.dto.RegenerateRequest.PairDto("B", "C"));
        pairsEx1.add(new com.example.trainingplanner.dto.RegenerateRequest.PairDto("D", "E"));
        currentPairings.put("Exercise 1", pairsEx1);

        // Add placeholder for Ex 2 (to be regenerated)
        currentPairings.put("Exercise 2", new ArrayList<>());

        request.setCurrentPairings(currentPairings);

        Map<String, List<String>> unpaired = new java.util.HashMap<>();
        unpaired.put("Exercise 1", java.util.Collections.singletonList("A"));
        request.setUnpairedPlayers(unpaired);

        // Regenerate
        com.example.trainingplanner.dto.RegenerateResponse response = trainingPlanService
                .regenerateRemainingExercises(request);

        // Verify Ex 2 has the NEXT best pairing
        // In this case, since everyone has the same Elo, we expect it to pick the next
        // unique round
        // which, due to our tie-breaking, should result in a different unpaired player.
        List<Player> unpairedEx2 = response.getUnpairedPlayers().get("Exercise 2");
        assertNotNull(unpairedEx2);
        assertEquals(1, unpairedEx2.size());
        assertNotEquals("A", unpairedEx2.get(0).getName());

        System.out.println("Ex 1 Unpaired: A");
        System.out.println("Ex 2 Unpaired: " + unpairedEx2.get(0).getName());
    }

    @Test
    void generatePlan_shouldRotateUnpairedPlayers() throws Exception {
        // Setup 5 players
        List<Player> players = Arrays.asList(
                new Player("A", 10), new Player("B", 10),
                new Player("C", 10), new Player("D", 10),
                new Player("E", 10));
        csvServiceStub.setPlayers(players);

        // Generate plan with 5 exercises (should cover all players unpaired once)
        TrainingSession session = trainingPlanService.generatePlan(players, 5, 1);

        assertNotNull(session);
        assertEquals(5, session.getExercises().size());

        // Collect unpaired players from all exercises
        List<String> unpairedNames = new ArrayList<>();
        for (com.example.trainingplanner.model.Exercise ex : session.getExercises()) {
            List<Player> unpaired = session.getUnpairedPlayers().get(ex);
            assertNotNull(unpaired);
            assertEquals(1, unpaired.size());
            unpairedNames.add(unpaired.get(0).getName());
        }

        // Verify all 5 players are unpaired exactly once
        for (Player p : players) {
            assertTrue(unpairedNames.contains(p.getName()), "Player " + p.getName() + " should be unpaired once");
            assertEquals(1, java.util.Collections.frequency(unpairedNames, p.getName()),
                    "Player " + p.getName() + " should be unpaired exactly once");
        }
    }

    @Test
    void generatePlan_shouldHaveNoDuplicatePairs() throws Exception {
        // Setup 6 players
        List<Player> players = Arrays.asList(
                new Player("A", 10), new Player("B", 10),
                new Player("C", 10), new Player("D", 10),
                new Player("E", 10), new Player("F", 10));
        csvServiceStub.setPlayers(players);

        // Generate plan with 3 exercises (max unique rounds for 6 players is 5 if we
        // want zero overlap?)
        // Total pairs = 6*5/2 = 15. Each exercise has 3 pairs.
        // So we can have up to 5 exercises with zero overlap.
        TrainingSession session = trainingPlanService.generatePlan(players, 4, 0);

        assertNotNull(session);
        assertEquals(4, session.getExercises().size());

        Set<String> usedPairs = new HashSet<>();
        for (com.example.trainingplanner.model.Exercise ex : session.getExercises()) {
            List<com.example.trainingplanner.model.PlayerPair> pairs = session.getExercisePairs().get(ex);
            for (com.example.trainingplanner.model.PlayerPair pair : pairs) {
                String p1 = pair.getPlayer1().getName();
                String p2 = pair.getPlayer2().getName();
                String key = p1.compareTo(p2) < 0 ? p1 + "|" + p2 : p2 + "|" + p1;

                assertFalse(usedPairs.contains(key), "Pair " + key + " is repeated in exercise " + ex.getName());
                usedPairs.add(key);
            }
        }
    }

    @Test
    void regenerateRemainingExercises_shouldRespectUniqueness() {
        List<Player> players = Arrays.asList(
                new Player("A", 10), new Player("B", 10),
                new Player("C", 10), new Player("D", 10));

        // Ex 1: A-B, C-D
        com.example.trainingplanner.dto.RegenerateRequest request = new com.example.trainingplanner.dto.RegenerateRequest();
        request.setExerciseIndex(0);
        request.setAvailablePlayers(players);

        Map<String, List<com.example.trainingplanner.dto.RegenerateRequest.PairDto>> current = new HashMap<>();
        List<com.example.trainingplanner.dto.RegenerateRequest.PairDto> pairsEx1 = new ArrayList<>();
        pairsEx1.add(new com.example.trainingplanner.dto.RegenerateRequest.PairDto("A", "B"));
        pairsEx1.add(new com.example.trainingplanner.dto.RegenerateRequest.PairDto("C", "D"));
        current.put("Exercise 1", pairsEx1);
        current.put("Exercise 2", new ArrayList<>());
        request.setCurrentPairings(current);

        request.setUnpairedPlayers(new HashMap<>());

        com.example.trainingplanner.dto.RegenerateResponse response = trainingPlanService
                .regenerateRemainingExercises(request);

        // Ex 2 pairs should NOT be A-B or C-D
        List<com.example.trainingplanner.model.PlayerPair> pairsEx2 = response.getExercisePairs()
                .get("Exercise 2");
        for (com.example.trainingplanner.model.PlayerPair p : pairsEx2) {
            String p1 = p.getPlayer1().getName();
            String p2 = p.getPlayer2().getName();
            String key = p1.compareTo(p2) < 0 ? p1 + "|" + p2 : p2 + "|" + p1;
            assertNotEquals("A|B", key);
            assertNotEquals("C|D", key);
        }
    }

    // Manual Stub
    static class CsvServiceStub extends CsvService {
        private List<Player> players;

        public void setPlayers(List<Player> players) {
            this.players = players;
        }

        @Override
        public List<Player> readPlayersForDate(String date) {
            return players != null ? players : new ArrayList<>();
        }

        @Override
        public List<com.example.trainingplanner.model.Exercise> readExercises() {
            List<com.example.trainingplanner.model.Exercise> exercises = new ArrayList<>();
            for (int i = 1; i <= 3; i++) {
                com.example.trainingplanner.model.Exercise ex = new com.example.trainingplanner.model.Exercise();
                ex.setName("Exercise " + i);
                ex.setDurationMinutes(15);
                exercises.add(ex);
            }
            return exercises;
        }
    }
}
