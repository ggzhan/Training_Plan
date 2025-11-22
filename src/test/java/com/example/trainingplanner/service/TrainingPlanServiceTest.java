package com.example.trainingplanner.service;

import com.example.trainingplanner.model.Exercise;
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
        // Mock data
        Exercise e1 = createExercise("Warmup", 10, 5, 20, "Warmup");
        Exercise e2 = createExercise("Drill 1", 20, 10, 20, "Drill");
        Exercise e3 = createExercise("Drill 2", 30, 10, 20, "Drill");
        Exercise e4 = createExercise("Scrimmage", 30, 10, 20, "Scrimmage");

        csvServiceStub.setExercises(Arrays.asList(e1, e2, e3, e4));

        // Test
        TrainingSession session = trainingPlanService.generatePlan(60, "22. November");

        // Verify
        assertNotNull(session);
        assertTrue(session.getTotalDuration() <= 60);
        assertFalse(session.getExercises().isEmpty());

        System.out.println("Generated Plan Duration: " + session.getTotalDuration());
        session.getExercises()
                .forEach(e -> System.out.println("- " + e.getName() + " (" + e.getDurationMinutes() + "m)"));
    }

    private Exercise createExercise(String name, int duration, int min, int max, String type) {
        Exercise e = new Exercise();
        e.setName(name);
        e.setDurationMinutes(duration);
        e.setMinPlayers(min);
        e.setMaxPlayers(max);
        e.setType(type);
        return e;
    }

    // Manual Stub
    static class CsvServiceStub extends CsvService {
        private List<Exercise> exercises;

        public void setExercises(List<Exercise> exercises) {
            this.exercises = exercises;
        }

        @Override
        public List<Exercise> readExercises() {
            return exercises;
        }

        @Override
        public void saveExercise(Exercise exercise) {
            // No-op for test
        }

        @Override
        public List<Player> readPlayersForDate(String date) {
            // Return empty list for test
            return new ArrayList<>();
        }
    }
}
