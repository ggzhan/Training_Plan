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
                new Player("Player 1"),
                new Player("Player 2"),
                new Player("Player 3"),
                new Player("Player 4"),
                new Player("Player 5"));
        csvServiceStub.setPlayers(players);

        // Test
        TrainingSession session = trainingPlanService.generatePlan(90, "22. November", 3);

        // Verify
        assertNotNull(session);
        assertEquals(90, session.getTotalDuration());
        assertEquals(3, session.getNumberOfExercises());
        assertEquals(5, session.getPlayerCount());
        assertNotNull(session.getExercisePairs());
        assertEquals(3, session.getExercisePairs().size());

        System.out.println("Generated Plan: " + session.getNotes());
        System.out.println("Number of Exercises: " + session.getNumberOfExercises());
        System.out.println("Player Count: " + session.getPlayerCount());
    }

    @Test
    void generatePlan_withOddPlayers_shouldHaveUnpairedPlayers() throws Exception {
        // Mock players (odd number)
        List<Player> players = Arrays.asList(
                new Player("Player 1"),
                new Player("Player 2"),
                new Player("Player 3"));
        csvServiceStub.setPlayers(players);

        // Test
        TrainingSession session = trainingPlanService.generatePlan(60, "22. November", 2);

        // Verify
        assertNotNull(session);
        assertEquals(2, session.getNumberOfExercises());
        assertEquals(3, session.getPlayerCount());
        assertNotNull(session.getUnpairedPlayers());
        assertEquals(2, session.getUnpairedPlayers().size()); // Each exercise should have an unpaired player
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
    }
}
