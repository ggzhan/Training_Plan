package com.example.trainingplanner.service;

import com.example.trainingplanner.model.Player;
import com.example.trainingplanner.model.TrainingSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.ArrayList;
import java.util.List;

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
        TrainingSession session = trainingPlanService.generatePlan(players, 6);

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
        TrainingSession session = trainingPlanService.generatePlan(players, 6);

        // Verify
        assertNotNull(session);
        assertTrue(session.getExercises().size() > 0);
        assertEquals(3, session.getPlayerCount());
        assertNotNull(session.getUnpairedPlayers());
        assertEquals(session.getExercises().size(), session.getUnpairedPlayers().size()); // Each exercise should have
                                                                                          // an unpaired player
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
