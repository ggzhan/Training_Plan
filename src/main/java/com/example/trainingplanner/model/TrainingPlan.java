package com.example.trainingplanner.model;

import java.util.ArrayList;
import java.util.List;

public class TrainingPlan {
    private String trainingDate;
    private PlanSettings settings;
    private List<Player> players = new ArrayList<>();
    private List<ExerciseRound> exercises = new ArrayList<>();
    // Rules the generator had to bend, e.g. a kid at a Balleimer twice
    private List<String> warnings = new ArrayList<>();

    public String getTrainingDate() {
        return trainingDate;
    }

    public void setTrainingDate(String trainingDate) {
        this.trainingDate = trainingDate;
    }

    public PlanSettings getSettings() {
        return settings;
    }

    public void setSettings(PlanSettings settings) {
        this.settings = settings;
    }

    public List<Player> getPlayers() {
        return players;
    }

    public void setPlayers(List<Player> players) {
        this.players = players;
    }

    public List<ExerciseRound> getExercises() {
        return exercises;
    }

    public void setExercises(List<ExerciseRound> exercises) {
        this.exercises = exercises;
    }

    public List<String> getWarnings() {
        return warnings;
    }

    public void setWarnings(List<String> warnings) {
        this.warnings = warnings;
    }
}
